import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { findProject } from '../project.ts';
import { ProseError } from '../errors.ts';
import { withDirLock, writeFileAtomic } from '../owner/fsutil.ts';
import { inspectConceptRegistry } from './concepts.ts';
import { contained, digest, readData, readText, relativeReference, safeUrl, serialize, stable } from './files.ts';
import { parseAnnotation, parseProposal, parseSidecar, targetSchema, appearanceSchema, checked } from './schema.ts';
import { projectSource } from './source.ts';
import { candidateFromId, locateCandidates, resolveTarget } from './locate.ts';
import { publishInspection } from './export.ts';
import type { Annotation, AnnotationAppearance, Candidate, Decision, Destination, Inspection, InspectedAnnotation, MutationOptions, Proposal, Sidecar, SourceProfile, TargetSelector } from './types.ts';
export type { Inspection, Proposal, Decision } from './types.ts';

interface Loaded extends Omit<Inspection,'annotations'> { root: string }
function load(file: string): Loaded {
  const path = resolve(file); const text = readText(path); const sidecar = parseSidecar(readData(path));
  const root = resolve(dirname(path),sidecar.root ?? '.');
  const source = contained(root,sidecar.document.source);
  const projection = projectSource(readText(source),{profile:sidecar.document.profile,documentId:sidecar.document.id,sourceDocument:sidecar.document.sourceDocument,contentRoot:sidecar.document.contentRoot});
  const conceptInfo = sidecar.concepts ? inspectConceptRegistry(contained(root,sidecar.concepts)) : null;
  const ids = sidecar.annotations.map(a=>a.id), targets = sidecar.targets.map(t=>t.id), uids = sidecar.annotations.map(a=>a.uid);
  const problems = [...(conceptInfo?.problems ?? [])];
  if (new Set(ids).size !== ids.length || new Set(uids).size !== uids.length) problems.push('Duplicate annotation identity');
  if (new Set(targets).size !== targets.length) problems.push('Duplicate named target identity');
  if(new Set(sidecar.history.map(e=>e.id)).size!==sidecar.history.length)problems.push('Duplicate feedback event identity');
  return {file:path,revision:digest(text),sidecar,root,projection,concepts:conceptInfo?.registry ?? null,problems};
}
const usable = (resolution: ReturnType<typeof resolveTarget>): boolean => !!resolution.range && ['exact','relocated','source-changed'].includes(resolution.status);
function contextFor(loaded: Loaded, range?: {start:number;end:number}): unknown {
  if (!range) return null;
  const blocks = loaded.projection.blocks, hit = blocks.flatMap((b,i)=> b.end > range.start && b.start < range.end ? [i] : []);
  if (!hit.length) return null;
  return blocks.slice(Math.max(0,hit[0]-1),Math.min(blocks.length,hit.at(-1)!+2)).map(b=>({id:loaded.projection.profile==='structured'?b.id:undefined,text:b.text,headingPath:b.headingPath,level:b.level,listDepth:b.listDepth,listType:b.listType,listStart:b.listStart,listItem:b.listItem}));
}
function destinationFor(loaded: Loaded, destination: Destination): { loaded?: Loaded; range?: {start:number;end:number}; targetId?: string; dependency: unknown; problems: string[] } {
  if ('url' in destination) return {dependency:destination,problems:safeUrl(destination.url)?[]:['External destination must be an HTTP(S) URL']};
  try {
    const self = [loaded.sidecar.document.id,loaded.sidecar.document.handle].includes(destination.document);
    const ref = Object.hasOwn(loaded.sidecar.references ?? {},destination.document) ? loaded.sidecar.references![destination.document] : null;
    if (!self && !ref) return {dependency:destination,problems:[`Unknown document ${destination.document}`]};
    const targetDoc = self ? loaded : load(contained(loaded.root,ref!));
    let selector: TargetSelector | undefined;
    if (destination.target) selector = targetDoc.sidecar.targets.find(t=>t.id===destination.target)?.target;
    else if (destination.fragment) selector = {fragment:destination.fragment};
    else return {loaded:targetDoc,dependency:{document:targetDoc.sidecar.document.id},problems:[]};
    if (!selector) return {dependency:destination,problems:[`Unknown passage ${destination.target}`]};
    const resolution = resolveTarget(targetDoc.projection,selector);
    if (!usable(resolution)) return {dependency:destination,problems:[`Unresolved destination ${destination.target ?? destination.fragment}: ${resolution.status}`]};
    const range = resolution.range!;
    return {loaded:targetDoc,range,targetId:destination.target ?? destination.fragment,dependency:{document:targetDoc.sidecar.document.id,target:destination.target ?? destination.fragment,profile:targetDoc.projection.profile,adapter:targetDoc.projection.adapter,projectionVersion:targetDoc.projection.projectionVersion,selector:{block:selector.block,blocks:selector.blocks,fragment:selector.fragment},quote:Array.from(targetDoc.projection.text).slice(range.start,range.end).join(''),context:contextFor(targetDoc,range)},problems:[]};
  } catch(e) { return {dependency:destination,problems:[`Destination unavailable: ${(e as Error).message}`]}; }
}
function inspectRecord(loaded: Loaded, annotation: Annotation): InspectedAnnotation {
  const resolution = resolveTarget(loaded.projection,annotation.target); const problems: string[] = [];
  const concept = annotation.concept ? loaded.concepts?.concepts.find(c=>c.id===annotation.concept) : undefined;
  if (['vocabulary','concept'].includes(annotation.kind) && !annotation.concept) problems.push('A concept reference is required');
  if (annotation.concept && !concept) problems.push(`Unknown concept ${annotation.concept}`);
  if(concept?.retired)problems.push(`Concept ${concept.id} is retired${concept.replacement?`; replacement: ${concept.replacement}`:''}`);
  if(annotation.kind==='vocabulary'&&!annotation.lists?.length)problems.push('A vocabulary annotation requires at least one named list');
  if (['definition','explanation'].includes(annotation.kind) && !annotation.body) problems.push('An explanatory body is required');
  if (annotation.kind === 'link' && !annotation.destination) problems.push('A destination is required');
  if (annotation.kind !== 'link' && annotation.destination) problems.push('Only link annotations carry destinations');
  for (const list of annotation.lists ?? []) if (!loaded.concepts || !Object.hasOwn(loaded.concepts.lists,list) || !loaded.concepts.lists[list].includes(annotation.concept ?? '')) problems.push(`Concept is not a member of ${list}`);
  const destination = annotation.destination ? destinationFor(loaded,annotation.destination) : null;
  problems.push(...(destination?.problems ?? []));
  const {review: _review,target: _target,...payload} = annotation;
  const snapshot={profile:{profile:loaded.projection.profile,projectionVersion:loaded.projection.projectionVersion,adapter:loaded.projection.adapter,language:loaded.projection.language,direction:loaded.projection.direction},payload,selector:{fragment:annotation.target.fragment,block:annotation.target.block,blocks:annotation.target.blocks},quote:resolution.range?Array.from(loaded.projection.text).slice(resolution.range.start,resolution.range.end).join(''):null,context:contextFor(loaded,resolution.range),concept:concept?{uid:concept.uid,label:concept.label,definition:concept.definition,aliases:concept.aliases??[],retired:concept.retired??false,replacement:concept.replacement,sources:concept.sources,definitionSource:concept.definitionSource,cedRef:concept.cedRef}:null,destination:destination?.dependency};
  const dependency = digest(snapshot);
  const changes=annotation.review.snapshot?Object.keys(snapshot).filter(key=>digest(annotation.review.snapshot![key])!==digest(snapshot[key as keyof typeof snapshot])):annotation.review.dependency&&annotation.review.dependency!==dependency?['reviewed-dependencies']:[];
  const state = annotation.review.state === 'accepted' && (annotation.review.dependency !== dependency || !usable(resolution) || problems.length || loaded.problems.length) ? 'stale' : annotation.review.state;
  return {...annotation,resolution,state,dependency,snapshot,changes,problems};
}
export function inspectAnnotationFile(file: string): Inspection {
  const loaded = load(file); const {root:_root,...inspection} = loaded;
  const annotations=loaded.sidecar.annotations.map(a=>inspectRecord(loaded,a));
  const revision=digest({sidecar:loaded.revision,source:loaded.projection.sourceDigest,concepts:loaded.concepts,dependencies:annotations.map(a=>({id:a.id,dependency:a.dependency,resolution:a.resolution}))});
  return {...inspection,revision,annotations};
}
export function createAnnotationFile(source: string, out?: string, options: {profile?:SourceProfile;sourceDocument?:string;contentRoot?:string;root?:string;concepts?:string} = {}): Inspection {
  const sourcePath = resolve(source); const output = resolve(out ?? sourcePath.slice(0,sourcePath.length-extname(sourcePath).length)+'.annotations.yaml');
  if (existsSync(output)) throw new ProseError('E_CONFLICT','Annotation sidecar already exists');
  const root = resolve(options.root ?? findProject(dirname(output)) ?? dirname(output));
  const profile = options.profile ?? (/\.html?$/i.test(sourcePath)?'html':/\.json$/i.test(sourcePath)?'structured':'markdown');
  const document = {id:`urn:uuid:${randomUUID()}`,handle:options.sourceDocument ?? basename(sourcePath,extname(sourcePath)),source:relativeReference(root,sourcePath),profile,...(options.sourceDocument?{sourceDocument:options.sourceDocument}:{}),...(options.contentRoot?{contentRoot:options.contentRoot}:{})};
  projectSource(readText(sourcePath),{profile,documentId:document.id,sourceDocument:options.sourceDocument,contentRoot:options.contentRoot});
  const conceptPath = options.concepts ? resolve(root,options.concepts) : existsSync(resolve(root,'concepts.yaml')) ? resolve(root,'concepts.yaml') : null;
  if (conceptPath) { const info=inspectConceptRegistry(conceptPath); if(info.problems.length) throw new ProseError('E_SCHEMA','Concept registry has unresolved references',{details:{problems:info.problems}}); }
  const sidecar: Sidecar = {schema:'prose/annotations@1',document,root:relative(dirname(output),root).replaceAll('\\','/')||'.',...(conceptPath?{concepts:relativeReference(root,conceptPath)}:{}),annotations:[],targets:[],references:{},history:[]};
  mkdirSync(dirname(output),{recursive:true}); writeFileSync(output,serialize(output,sidecar),{flag:'wx'}); return inspectAnnotationFile(output);
}
export function findCandidates(file: string, query: {quote?:string;concept?:string;list?:string}): {revision:string;candidates:Candidate[]} {
  const inspection = inspectAnnotationFile(file); const quotes = new Set<string>();
  if (query.quote) quotes.add(query.quote);
  if (query.concept || query.list) {
    const ids = query.concept ? [query.concept] : inspection.concepts && Object.hasOwn(inspection.concepts.lists,query.list!) ? inspection.concepts.lists[query.list!] : [];
    if (!ids.length) throw new ProseError('E_NOT_FOUND','No concepts found for the requested concept/list');
    for (const id of ids) {
      const concept = inspection.concepts?.concepts.find(c=>c.id===id); if (!concept) throw new ProseError('E_NOT_FOUND',`Unknown concept ${id}`);
      quotes.add(concept.label); for(const alias of concept.aliases ?? []) quotes.add(alias);
    }
  }
  if (!quotes.size) throw new ProseError('E_USAGE','Supply a quote, concept or vocabulary list');
  const unique = new Map<string,Candidate>(), text = Array.from(inspection.projection.text);
  for (const quote of quotes) {
    const variants = new Set([quote]);
    if(query.concept || query.list) {
      const pattern = new RegExp(quote.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');
      for(const match of inspection.projection.text.matchAll(pattern)) {
        const before=inspection.projection.text.slice(0,match.index).at(-1)??'',after=inspection.projection.text.slice(match.index+match[0].length)[0]??'';
        if(!/[\p{L}\p{N}_]/u.test(before)&&!/[\p{L}\p{N}_]/u.test(after))variants.add(match[0]);
      }
    }
    for(const variant of variants)for(const candidate of locateCandidates(inspection.projection,{quote:variant})){
      const before=text[candidate.start-1]??'',after=text[candidate.end]??'';
      if((query.concept||query.list)&&(/[\p{L}\p{N}_]/u.test(before)||/[\p{L}\p{N}_]/u.test(after)))continue;
      unique.set(candidate.id,candidate);
    }
  }
  return {revision:inspection.revision,candidates:[...unique.values()].sort((a,b)=>a.start-b.start || b.end-a.end)};
}
function targetFor(candidate: Candidate, projection: Inspection['projection']): TargetSelector {
  const ids=projection.blocks.filter(b=>b.start<candidate.end&&b.end>candidate.start).map(b=>b.id);
  return {quote:candidate.quote,prefix:candidate.prefix,suffix:candidate.suffix,...(projection.profile==='structured'?(ids.length===1?{block:ids[0]}:{blocks:ids}):{}),start:candidate.start,end:candidate.end,binding:{sourceDigest:candidate.sourceDigest,projectionDigest:candidate.projectionDigest}};
}
function mutation(file: string, request: unknown, options: MutationOptions, apply: (sidecar: Sidecar, current: Inspection, beforeRevision: string, eventId: string, requestDigest: string)=>void): Inspection {
  const path = resolve(file); const requestDigest = digest(request); const eventId = options.eventId ?? randomUUID();
  return withDirLock(dirname(path),{noun:'annotations',id:basename(path),project:dirname(path)},()=>{
    const current = inspectAnnotationFile(path); const previous = current.sidecar.history.find(e=>e.id===eventId);
    if (previous) { if(previous.request!==requestDigest) throw new ProseError('E_CONFLICT','Event ID was already used for a different mutation'); return current; }
    if (options.expectedRevision !== undefined && options.expectedRevision !== current.revision) throw new ProseError('E_CONFLICT','Annotation file changed; reload and reconcile edits',{details:{expected:options.expectedRevision,current:current.revision}});
    const beforeRevision = current.revision; const sidecar = structuredClone(current.sidecar);
    apply(sidecar,current,beforeRevision,eventId,requestDigest);
    parseSidecar(sidecar); writeFileAtomic(path,serialize(path,sidecar)); return inspectAnnotationFile(path);
  });
}
export function proposeAnnotations(file: string, proposals: Proposal[], options: MutationOptions = {}): Inspection {
  if (!Array.isArray(proposals) || !proposals.length) throw new ProseError('E_SCHEMA','Supply a nonempty proposal array');
  const validated = proposals.map(parseProposal);
  return mutation(file,{action:'propose',proposals:validated},options,(sidecar,current,beforeRevision,eventId,requestDigest)=>{
    const names = new Set(sidecar.annotations.map(a=>a.id));
    for (const [index,proposal] of validated.entries()) {
      const {candidate,...payload} = proposal; const id = proposal.id ?? `a-${randomUUID()}`;
      if(names.has(id)) throw new ProseError('E_CONFLICT',`Annotation ${id} already exists`); names.add(id);
      const target = candidate ? targetFor(candidateFromId(current.projection,candidate),current.projection) : proposal.target!;
      const annotation = parseAnnotation({...payload,id,uid:`urn:uuid:${randomUUID()}`,target,review:{state:'draft'},origin:proposal.origin ?? {type:'supplied'}});
      sidecar.annotations.push(annotation);
    }
    sidecar.history.push({id:eventId,at:new Date().toISOString(),annotation:validated.length===1?sidecar.annotations.at(-1)!.id:'*',annotationIds:sidecar.annotations.slice(-validated.length).map(a=>a.id),action:'propose',beforeRevision,request:requestDigest});
  });
}
/** Presentation changes are journaled and revision-checked, but do not change content approval. */
export function setAnnotationAppearance(file:string, value:AnnotationAppearance, options:MutationOptions={}):Inspection {
  const appearance=checked<AnnotationAppearance>(appearanceSchema,value,'annotation appearance');
  return mutation(file,{action:'appearance',appearance},options,(sidecar,current,beforeRevision,id,requestDigest)=>{
    for(const member of Object.keys(appearance.concepts??{}))if(!current.concepts?.concepts.some(c=>c.id===member))throw new ProseError('E_SCHEMA','Unknown concept color member');
    for(const member of Object.keys(appearance.annotations??{}))if(!sidecar.annotations.some(a=>a.id===member))throw new ProseError('E_SCHEMA','Unknown annotation color member');
    sidecar.appearance=appearance;
    sidecar.history.push({id,at:new Date().toISOString(),annotation:'*',action:'appearance',beforeRevision,request:requestDigest});
  });
}
export function decideAnnotation(file: string, decision: Decision): Inspection {
  const {expectedRevision,eventId,...request} = decision;
  if (!['accept','reject','defer','edit','retarget','undo'].includes(decision.action)) throw new ProseError('E_SCHEMA','Unknown review action');
  if(decision.body!==undefined&&decision.action!=='edit')throw new ProseError('E_SCHEMA','Save body edits separately before another decision');
  if((decision.target!==undefined||decision.candidate!==undefined)&&decision.action!=='retarget')throw new ProseError('E_SCHEMA','Target changes require retarget');
  if(decision.target&&decision.candidate)throw new ProseError('E_SCHEMA','Supply one target or candidate');
  return mutation(file,request,{expectedRevision,eventId},(sidecar,current,beforeRevision,id,requestDigest)=>{
    const index = sidecar.annotations.findIndex(a=>a.id===decision.id); if(index<0) throw new ProseError('E_NOT_FOUND',`Unknown annotation ${decision.id}`);
    const before = structuredClone(sidecar.annotations[index]); const annotation = sidecar.annotations[index];
    let undoOf: string|undefined;
    if (decision.action==='accept') {
      const checked = current.annotations[index]; if(!usable(checked.resolution) || checked.problems.length || current.problems.length) throw new ProseError('E_SCHEMA','Resolve annotation targets and references before acceptance',{details:{problems:[...checked.problems,...current.problems],resolution:checked.resolution.status}});
      const range = checked.resolution.range!;
      annotation.target = {...annotation.target,quote:Array.from(current.projection.text).slice(range.start,range.end).join(''),start:range.start,end:range.end,binding:{sourceDigest:current.projection.sourceDigest,projectionDigest:current.projection.digest}};
      annotation.review = {state:'accepted',dependency:checked.dependency,snapshot:checked.snapshot};
    } else if(decision.action==='reject' || decision.action==='defer') annotation.review={state:decision.action==='reject'?'rejected':'deferred'};
    else if(decision.action==='edit') {
      if(typeof decision.body!=='string' || !decision.body.trim()) throw new ProseError('E_SCHEMA','An edit requires a nonempty body'); annotation.body=decision.body; annotation.review={state:'draft'};
    } else if(decision.action==='retarget') {
      if(!decision.target && !decision.candidate) throw new ProseError('E_SCHEMA','Retargeting requires a candidate or selector');
      annotation.target=decision.candidate?targetFor(candidateFromId(current.projection,decision.candidate),current.projection):checked<TargetSelector>(targetSchema,decision.target,'target'); annotation.review={state:'draft'};
    } else {
      const undone=new Set(sidecar.history.flatMap(e=>e.undoOf?[e.undoOf]:[]));
      const event = [...sidecar.history].reverse().find(e=>e.annotation===annotation.id && e.before && e.action!=='undo' && !undone.has(e.id));
      if(!event?.before) throw new ProseError('E_CONFLICT','No previous annotation decision to undo');
      if(event.after&&event.after!==digest(annotation))throw new ProseError('E_CONFLICT','Annotation changed outside the last decision; reconcile before undo');
      sidecar.annotations[index]=structuredClone(event.before);
      undoOf=event.id;
    }
    sidecar.history.push({id,at:new Date().toISOString(),annotation:decision.id,action:decision.action,...(decision.reason?{reason:decision.reason}:{}),...(undoOf?{undoOf}:{}),before,after:digest(sidecar.annotations[index]),beforeRevision,request:requestDigest});
  });
}
export function revalidateAnnotations(file: string, options: MutationOptions = {}): Inspection {
  return mutation(file,{action:'revalidate'},options,(sidecar,current,beforeRevision,id,request)=>{
    for(const [index,annotation] of current.annotations.entries()) if(annotation.state==='accepted' && usable(annotation.resolution)) {
      const range=annotation.resolution.range!; sidecar.annotations[index].target={...annotation.target,start:range.start,end:range.end,binding:{sourceDigest:current.projection.sourceDigest,projectionDigest:current.projection.digest}};
    }
    sidecar.history.push({id,at:new Date().toISOString(),annotation:'*',action:'revalidate',beforeRevision,request});
  });
}
export function compileAnnotations(file: string): ReturnType<typeof publishInspection> {
  return publishInspection(inspectAnnotationFile(file),{load:inspectAnnotationFile,destination:(inspection,destination)=>destinationFor(load(inspection.file),destination)});
}
