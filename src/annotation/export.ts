import { ProseError } from '../errors.ts';
import { identity, portableSources, privateReference, safeUrl, stable } from './files.ts';
import { renderPublication } from './render.ts';
import type { Concept, Destination, Inspection, PublicationBundle, PublishedAnnotation, PublishedDocument } from './types.ts';

interface PublicationHelpers {
  load(file: string): Inspection;
  destination(inspection: Inspection, destination: Destination): {loaded?:{file:string;sidecar:Inspection['sidecar']};range?:{start:number;end:number};targetId?:string;problems:string[]};
}
export function publishInspection(initial: Inspection, helpers: PublicationHelpers): {bundle:PublicationBundle;html:string;webAnnotation:unknown;report:{warnings:string[];excluded:string[]}} {
  const bundle:PublicationBundle={schema:'prose/annotation-bundle@1',projection:'prose/annotation-text@1',documents:[],annotations:[],concepts:[],lists:{}};
  const warnings=new Set<string>(),excluded=new Set<string>(),visited=new Map<string,string>();
  const lists=new Map<string,{label:string;members:string[]}>();
  const add=(inspection:Inspection):void=>{
    const doc=inspection.sidecar.document;
    if(visited.has(doc.id)){if(visited.get(doc.id)!==inspection.file)throw new ProseError('E_SCHEMA','Two authoring files claim the same document identity');return;}visited.set(doc.id,inspection.file);
    if(inspection.problems.length)throw new ProseError('E_SCHEMA','Cannot publish an invalid annotation document',{details:{problems:inspection.problems}});
    const stale=inspection.annotations.filter(a=>a.state==='stale');if(stale.length)throw new ProseError('E_CONFLICT','Accepted annotations changed and require review',{details:{annotations:stale.map(a=>a.id)}});
    const p=inspection.projection;
    const identifiers=[doc.handle,...p.blocks.flatMap(b=>[b.id,...(b.listItem?[b.listItem]:[])]),...Object.keys(p.fragments),...Object.keys(inspection.concepts?.lists??{}),...Object.values(p.adapter??{})];
    if(identifiers.some(value=>typeof value==='string'&&!safeUrl(value)&&privateReference(value)))throw new ProseError('E_SCHEMA','Use portable source identifiers and adapter declarations before publishing');
    if(p.diagnostics.length)warnings.add('Source regions were excluded; inspect the private authoring diagnostics for details');
    const published:PublishedDocument={id:doc.id,handle:doc.handle,resource:`document-${identity(doc.id,'resource').slice(9)}.html`,profile:p.profile,sourceDigest:p.sourceDigest,projectionDigest:p.digest,projectionVersion:p.projectionVersion,language:p.language,...(p.direction?{direction:p.direction}:{}),...(p.adapter?{adapter:p.adapter}:{}),text:p.text,blocks:p.blocks.map(b=>({id:b.id,kind:b.kind,start:b.start,end:b.end,text:b.text,headingPath:b.headingPath,...(b.level?{level:b.level}:{}),...(b.listDepth?{listDepth:b.listDepth}:{}),...(b.listType?{listType:b.listType}:{}),...(b.listStart!==undefined?{listStart:b.listStart}:{}),...(b.listItem?{listItem:b.listItem}:{}),runs:b.runs.map(r=>{
      let href=r.href;
      if(href&&!safeUrl(href)&&!(href.startsWith('#')&&Object.hasOwn(p.fragments,href.slice(1)))){warnings.add('An original link without a public or included fragment destination was omitted');href=undefined;}
      return {text:r.text,start:r.start,end:r.end,...(r.marks?{marks:r.marks}:{}),...(href?{href}:{})};
    })})),fragments:p.fragments,targets:Object.create(null) as PublishedDocument['targets']};
    bundle.documents.push(published);
    for(const annotation of inspection.annotations){
      if(annotation.state!=='accepted'){excluded.add(`${doc.handle}/${annotation.id}: ${annotation.state}`);continue;}
      if(!annotation.resolution.range||annotation.problems.length)throw new ProseError('E_SCHEMA','Cannot publish an unresolved annotation',{details:{annotation:annotation.id,problems:annotation.problems}});
      const range=annotation.resolution.range;
      if(bundle.annotations.some(a=>a.id===annotation.uid))throw new ProseError('E_SCHEMA','Conflicting annotation identities in publication closure');
      const record:PublishedAnnotation={id:annotation.uid,handle:annotation.id,document:doc.id,kind:annotation.kind,target:{...range,quote:Array.from(p.text).slice(range.start,range.end).join(''),...(annotation.target.block?{block:annotation.target.block}:{})},...(annotation.body?{body:annotation.body}:{}),...(annotation.lists?{lists:annotation.lists}:{}),...(annotation.sources?{sources:portableSources(annotation.sources)}:{}),...(annotation.origin?{origin:{...annotation.origin,...(annotation.origin.sources?{sources:portableSources(annotation.origin.sources)}:{})}}:{})};
      if(annotation.sources?.length!==record.sources?.length)warnings.add('Private or non-URL evidence references were omitted from reader delivery');
      if(record.origin){for(const key of ['agent','model'] as const)if(record.origin[key]&&privateReference(record.origin[key]!)){delete record.origin[key];warnings.add('Private provenance identifiers were omitted');}}
      if(annotation.concept){
        const concept=inspection.concepts?.concepts.find(c=>c.id===annotation.concept);if(!concept?.uid)throw new ProseError('E_SCHEMA','Missing concept identity');
        record.concept=concept.uid;
        const definitionSource=concept.definitionSource&&!privateReference(concept.definitionSource)&&/^[\w .-]{1,100}$/.test(concept.definitionSource)?concept.definitionSource:undefined;
        const cedRef=concept.cedRef&&!privateReference(concept.cedRef)?concept.cedRef:undefined;
        if(concept.definitionSource&&!definitionSource||concept.cedRef&&!cedRef)warnings.add('Private concept reference metadata was omitted');
        const snapshot:Concept={id:concept.uid,label:concept.label,definition:concept.definition,aliases:concept.aliases??[],sources:portableSources(concept.sources),...(definitionSource?{definitionSource}:{}),...(cedRef?{cedRef}:{})};
        const existing=bundle.concepts.find(c=>c.id===concept.uid);
        if(existing&&stable(existing)!==stable(snapshot))throw new ProseError('E_SCHEMA','Conflicting shared concept identities in publication closure');
        if(!existing){
          bundle.concepts.push(snapshot);
          if((concept.sources??[]).length!==(snapshot.sources??[]).length)warnings.add('Private or non-URL concept evidence references were omitted from reader delivery');
        }
        record.lists=(annotation.lists??[]).map(label=>{
          const registry=inspection.concepts!,listId=identity(registry.uid!,`list:${label}`);
          const members=registry.lists[label].map(id=>registry.concepts.find(c=>c.id===id)!.uid!);
          const old=lists.get(listId);if(old&&stable(old.members)!==stable(members))throw new ProseError('E_SCHEMA','Conflicting vocabulary list identity');
          lists.set(listId,{label,members});return listId;
        });
      }
      if(annotation.destination){
        if('url' in annotation.destination)record.destination=annotation.destination;
        else {
          const destination=helpers.destination(inspection,annotation.destination);
          if(destination.problems.length||!destination.loaded)throw new ProseError('E_SCHEMA','Unresolved publication destination',{details:{problems:destination.problems}});
          const targetDoc=destination.loaded.sidecar.document;
          add(helpers.load(destination.loaded.file));
          const output=bundle.documents.find(d=>d.id===targetDoc.id)!;
          if(annotation.destination.target&&destination.range){
            const handle=annotation.destination.target;
            output.targets[handle]={id:identity(targetDoc.id,handle),...destination.range,quote:Array.from(output.text).slice(destination.range.start,destination.range.end).join('')};
          }
          record.destination={document:targetDoc.id,...(annotation.destination.target?{target:annotation.destination.target}:{}),...(annotation.destination.fragment?{fragment:annotation.destination.fragment}:{})};
        }
      }
      bundle.annotations.push(record);
    }
  };
  add(initial);
  if(new Set(bundle.annotations.map(a=>a.id)).size!==bundle.annotations.length)throw new ProseError('E_SCHEMA','Conflicting annotation identities in publication closure');
  bundle.listLabels={};for(const [id,list] of lists){bundle.lists[id]=list.members.filter(member=>bundle.concepts.some(c=>c.id===member));bundle.listLabels[id]=list.label;}
  const representations=bundle.documents.map(d=>({id:identity(d.id,`text:${d.projectionDigest}`),type:'Text',format:'text/plain',value:d.text}));
  const webAnnotation={
    '@context':'http://www.w3.org/ns/anno.jsonld',id:identity(initial.sidecar.document.id,'annotation-page'),type:'AnnotationPage',
    items:bundle.annotations.map(a=>{
      const document=bundle.documents.find(d=>d.id===a.document)!;const representation=representations[bundle.documents.indexOf(document)];
      const concept=bundle.concepts.find(c=>c.id===a.concept);const body=a.body??concept?.definition;
      const mapped=a.kind==='highlight'?'highlighting':a.kind==='link'?'linking':'commenting';
      const linkedBody=a.destination&&'url' in a.destination?{id:a.destination.url}:undefined;
      return {id:a.id,type:'Annotation',motivation:mapped,...(body?{body:{type:'TextualBody',value:body,format:'text/plain'}}:linkedBody?{body:linkedBody}:{}),target:{type:'SpecificResource',source:representation.id,selector:[{type:'TextQuoteSelector',exact:a.target.quote,prefix:Array.from(document.text).slice(Math.max(0,a.target.start-32),a.target.start).join(''),suffix:Array.from(document.text).slice(a.target.end,a.target.end+32).join('')},{type:'TextPositionSelector',start:a.target.start,end:a.target.end}]}};
    }),
  };
  if(bundle.annotations.some(a=>a.concept||a.lists?.length||a.destination))warnings.add('Web Annotation export does not preserve project lists, concept identity or application navigation; use the native bundle for complete semantics');
  warnings.add('Representation UUID URNs identify included text snapshots; they are not fetchable URLs');
  const report={warnings:[...warnings],excluded:[...excluded]};
  return {bundle,html:renderPublication(bundle),webAnnotation:{page:webAnnotation,representations,report},report};
}
