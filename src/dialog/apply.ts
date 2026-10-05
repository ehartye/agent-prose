import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { ProseError } from '../errors.ts';
import { loadDocument } from '../document.ts';
import { parseDialog } from '../parse/dialog.ts';
import { createSet, basePath, readSet, variantPath, type PromptSet } from '../owner/sets.ts';
import { readPrediction, sealValid, variantHash } from '../owner/prediction.ts';
import { withDirLock, withSetLocks, writeFileAtomic, type LockOptions } from '../owner/fsutil.ts';
import { projectTasteDir } from '../owner/paths.ts';
import { loadVoices, voiceFor } from '../voice.ts';
import { snapshotOf } from '../owner/character.ts';
import { extractSlots, hash, readManifest, safeSource, type Manifest } from './import.ts';
import { patchSource, readSource, type DataPath } from './source.ts';

/** Returns only the designated text; every other parsed graph field must remain identical. */
export function candidateText(base:string,candidate:string,slotId:string,allowUnchanged=false):string {
  const a=parseDialog(base).graph,b=parseDialog(candidate).graph;
  const matches=b.nodes.filter(n=>n.id===slotId),originals=a.nodes.filter(n=>n.id===slotId);
  if(matches.length!==1||originals.length!==1)throw new ProseError('E_CONFLICT','Missing or duplicate reviewed slot');
  const strip=(g:typeof a)=>({...g,nodeLines:undefined,nodeLineByIndex:undefined,barkLines:undefined,nodes:g.nodes.map(n=>n.id===slotId?{...n,text:'<reviewed>'}:n)});
  if(JSON.stringify(strip(a))!==JSON.stringify(strip(b)))throw new ProseError('E_CONFLICT','Candidate changed protected dialogue structure or another slot');
  const result=matches[0].text;if(!allowUnchanged&&result===originals[0].text)throw new ProseError('E_CONFLICT','Candidate did not change the reviewed text');return result;
}
export function reviewDialog(project:string,draft:string,manifestPath:string,slotId:string,opts:{count?:number;directions?:string[]}={}) {
  const manifest=readManifest(manifestPath);const slot=manifest.slots.find(s=>s.id===slotId);
  if(!slot)throw new ProseError('E_NOT_FOUND',`No dialogue slot ${slotId}`);
  if(resolve(draft)!==manifest.draft||hash(readFileSync(draft))!==manifest.draftHash)throw new ProseError('E_CONFLICT','Imported draft changed; re-import the source');
  for(const f of manifest.files)if(hash(readFileSync(safeSource(manifest.root,f.file)))!==f.hash)throw new ProseError('E_CONFLICT','Dialogue source changed; re-import it');
  const doc=loadDocument(draft);const block=doc.blocks.find(b=>b.meta?.node===slotId);
  if(!block)throw new ProseError('E_SCHEMA','Imported draft has no matching slot');
  const voice=voiceFor(loadVoices(project),slot.speaker);
  return createSet(project,draft,{...opts,lines:String(block.line),sourceRef:{schema:'prose/dialog-source@1',manifest:resolve(manifestPath),manifestHash:hash(readFileSync(manifestPath)),slotId,slotHash:hash(JSON.stringify(slot))},brief:{context:`${slot.speaker}; ${slot.kind}; ${slot.limit} character limit. ${JSON.stringify(slot.context)}`.slice(0,400),...(voice?{character:snapshotOf(voice),characterRef:voice.id}:{})}});
}
interface Change {set:string;slot:string;file:string;path:DataPath;old:string;text:string;variantHash:string}
interface FilePlan {file:string;before:string;after:string;beforeHash:string;afterHash:string}
export interface DialogPlan {schema:'prose/dialog-plan@1';manifest:string;manifestHash:string;root:string;changes:Change[];files:FilePlan[];validation:{ok:true;slots:number;topicBudgets:true;scope:string};digest:string}
function contractBudgets(data:unknown):void {
  const configured=(data as {LIMITS?:Record<string,unknown>})?.LIMITS??{};
  const setting=(key:string,fallback:number):number=>{const value=configured[key]??fallback;if(typeof value!=='number'||!Number.isInteger(value)||value<1)throw new ProseError('E_SCHEMA',`Invalid source contract limit ${key}`);return value;};
  const maxBeats=setting('TOPIC_MAX_BEATS',8),maxChars=setting('TOPIC_MAX_CHARS',800),maxReplies=setting('REPLY_MAX',3);
  const visit=(x:any):void=>{
    if(!x||typeof x!=='object')return;
    if(Array.isArray(x)){for(const n of x)visit(n);return;}
    if(Array.isArray(x.beats)){
      let beats=0,chars=0,replies=0;
      const length=(b:any):number=>Math.max(typeof b.text==='string'?b.text.length:0,...(b.variants??[]).map((v:any)=>typeof v.text==='string'?v.text.length:0));
      for(const b of x.beats){beats++;chars+=length(b);replies+=(b.replies??[]).length;const branches=(b.replies??[]).map((r:any)=>({beats:r.beats?.length??0,chars:(r.beats??[]).reduce((n:number,v:any)=>n+length(v),0)}));beats+=Math.max(0,...branches.map((r:any)=>r.beats));chars+=Math.max(0,...branches.map((r:any)=>r.chars));}
      if(replies>maxReplies)throw new ProseError('E_SCHEMA',`Topic offers ${replies} replies; its source contract permits ${maxReplies}`);
      if(beats>maxBeats||chars>maxChars)throw new ProseError('E_SCHEMA',`Topic path budget exceeded (${beats} beats, ${chars} characters; limits ${maxBeats}/${maxChars})`);
    }
    for(const v of Object.values(x))visit(v);
  };visit(data);
}
function recorded(project:string,set:PromptSet):boolean {
  try{return readFileSync(join(projectTasteDir(project),'verdicts.jsonl'),'utf8').split('\n').some(s=>{try{const r=JSON.parse(s);return r.kind==='pick'&&r.set===set.id&&r.setUid===set.uid&&r.winner?.index===set.picked;}catch{return false;}});}catch{return false;}
}
export function planDialog(project:string,manifestPath:string,ids:string[]):DialogPlan {
  if(!ids.length||new Set(ids).size!==ids.length)throw new ProseError('E_USAGE','Name distinct picked sets');
  const manifest=readManifest(manifestPath),manifestHash=hash(readFileSync(manifestPath));const changes:Change[]=[];const seen=new Set<string>();
  for(const id of [...ids].sort()){
    const set=readSet(project,id),ref=set.sourceRef,slot=manifest.slots.find(s=>s.id===ref?.slotId);
    if(!ref||!slot||ref.manifest!==resolve(manifestPath)||ref.manifestHash!==manifestHash||ref.slotHash!==hash(JSON.stringify(slot)))throw new ProseError('E_CONFLICT',`Set ${id} does not match this sealed manifest/slot`);
    if(seen.has(slot.id))throw new ProseError('E_CONFLICT','Two picked sets target the same slot');seen.add(slot.id);
    if(set.picked===undefined||!set.pickedHash||!recorded(project,set))throw new ProseError('E_CONFLICT',`Set ${id} has no recorded source pick`);
    const current=variantHash(project,set,set.picked);if(current!==set.pickedHash)throw new ProseError('E_CONFLICT','Picked variant changed');
    const pred=readPrediction(project,id,set);if(pred&&(!sealValid(pred)||JSON.stringify(pred.sourceRef)!==JSON.stringify(ref)||pred.hashes[String(set.picked)]!==current))throw new ProseError('E_CONFLICT','Picked prediction or source reference changed');
    const base=readFileSync(basePath(project,set),'utf8');
    const imported=readFileSync(manifest.draft,'utf8');if(hash(imported)!==manifest.draftHash)throw new ProseError('E_CONFLICT','Original imported draft changed');
    if(hash(base)!==manifest.draftHash)candidateText(imported,base,slot.id,true);
    const text=candidateText(base,readFileSync(variantPath(project,set,set.variants.find(v=>v.index===set.picked)!),'utf8'),slot.id);
    if(text.length>slot.limit)throw new ProseError('E_SCHEMA',`Slot ${slot.id} exceeds its ${slot.limit} character limit`);
    if(/[\r\n\t<>]/.test(text)||text!==text.trim()||/^[“"]/.test(text)&&/[”"]$/.test(text))throw new ProseError('E_SCHEMA',`Slot ${slot.id} requires plain, unquoted single-line text`);
    if((slot.locator.path[0]==='BRIDGE_DIALOG'||slot.locator.path[0]==='POOLS'||slot.locator.path[0]==='EXCHANGES')&&/[^\x20-\x7e]/.test(text))throw new ProseError('E_SCHEMA',`Slot ${slot.id} uses an ASCII game font`);
    changes.push({set:id,slot:slot.id,file:slot.file,path:slot.locator.path,old:slot.original,text,variantHash:current});
  }
  const files:FilePlan[]=[];
  for(const f of manifest.files){
    const file=safeSource(manifest.root,f.file),bytes=readFileSync(file),before=bytes.toString('utf8');if(!Buffer.from(before,'utf8').equals(bytes)||hash(bytes)!==f.hash)throw new ProseError('E_CONFLICT','Source hash changed or source is not UTF-8');
    const source=readSource(f.file,before),actual=extractSlots(source,f.file);
    for(const slot of manifest.slots.filter(s=>s.file===f.file)){const now=actual.find(s=>s.id===slot.id);if(!now||JSON.stringify(now)!==JSON.stringify(slot))throw new ProseError('E_CONFLICT','Source identity, context or locator changed');}
    const edits=changes.filter(c=>c.file===f.file);if(!edits.length)continue;
    const after=patchSource(source,edits);contractBudgets(readSource(f.file,after).data);
    files.push({file:f.file,before,after,beforeHash:hash(before),afterHash:hash(after)});
  }
  const plan={schema:'prose/dialog-plan@1' as const,manifest:resolve(manifestPath),manifestHash,root:manifest.root,changes,files,validation:{ok:true as const,slots:changes.length,topicBudgets:true as const,scope:'Source identity, protected payload, recorded pick, text limits, plain text and whole-topic path budgets. Gameplay semantics remain the game validator authority.'}};
  return {...plan,digest:hash(JSON.stringify(plan))};
}
const FileSchema=z.strictObject({file:z.string(),before:z.string(),after:z.string(),beforeHash:z.string().regex(/^[0-9a-f]{64}$/),afterHash:z.string().regex(/^[0-9a-f]{64}$/)});
const JournalSchema=z.strictObject({schema:z.literal('prose/dialog-apply@1'),id:z.string().regex(/^dialog-[0-9a-f-]+$/),root:z.string(),at:z.string(),state:z.enum(['pending','complete','undo-pending','undone','restored']),digest:z.string().regex(/^[0-9a-f]{64}$/),files:z.array(FileSchema).min(1)});
type Journal=z.infer<typeof JournalSchema>;
const journalDir=(project:string)=>join(project,'.agent-prose','dialog-applies');
const journalPath=(project:string,id:string)=>{if(!/^dialog-[0-9a-f-]+$/.test(id))throw new ProseError('E_USAGE','Invalid dialog apply id');return join(journalDir(project),id+'.json');};
function readJournal(project:string,id:string):Journal {const result=JournalSchema.safeParse(JSON.parse(readFileSync(journalPath(project,id),'utf8')));if(!result.success)throw new ProseError('E_SCHEMA','Invalid dialogue journal');const j=result.data;if(j.id!==id||new Set(j.files.map(f=>f.file)).size!==j.files.length)throw new ProseError('E_SCHEMA','Invalid journal identities');for(const f of j.files){safeSource(j.root,f.file);if(hash(f.before)!==f.beforeHash||hash(f.after)!==f.afterHash)throw new ProseError('E_SCHEMA','Invalid journal snapshots');}return j;}
const save=(project:string,j:Journal)=>writeFileAtomic(journalPath(project,j.id),JSON.stringify(j,null,2)+'\n');
const canonicalRoot=(root:string):string=>{const real=realpathSync(root);return process.platform==='win32'?real.toLowerCase():real;};
function withSourceLock<T>(root:string,fn:()=>T,lock?:LockOptions):T {const key=canonicalRoot(root);const dir=join(tmpdir(),'agent-prose-dialog-locks',hash(key));mkdirSync(dir,{recursive:true});return withDirLock(dir,{noun:'dialogue source',id:hash(key).slice(0,12),project:root},fn,lock);}
export interface ApplyOptions {afterWrite?:(file:string,index:number)=>void;rename?:(from:string,to:string)=>void;lock?:LockOptions}
function writeJournalFiles(project:string,j:Journal,restore:boolean,opts:ApplyOptions={}):void {
  const sources=j.files.map(f=>({f,path:safeSource(j.root,f.file)}));
  for(const {f,path} of sources){const now=hash(readFileSync(path));if(now!==f.beforeHash&&now!==f.afterHash)throw new ProseError('E_CONFLICT','Changed output prevents dialogue recovery/undo');}
  const stage=join(journalDir(project),j.id);mkdirSync(stage,{recursive:true});
  for(const {f} of sources)writeFileSync(join(stage,hash(f.file)),restore?f.before:f.after);
  for(const [{f,path},i]of sources.map((s,i)=>[s,i] as const)){
    const expected=restore?f.beforeHash:f.afterHash;
    if(hash(readFileSync(path))!==expected){const now=hash(readFileSync(path));if(now!==f.beforeHash&&now!==f.afterHash)throw new ProseError('E_CONFLICT','Source changed during apply');writeFileAtomic(path,readFileSync(join(stage,hash(f.file)),'utf8'),{rename:opts.rename});opts.afterWrite?.(path,i);}
    if(hash(readFileSync(path))!==expected)throw new ProseError('E_CONFLICT','Dialogue write did not match prepared file');
  }
  j.state=restore?(j.state==='undo-pending'?'undone':'restored'):'complete';save(project,j);
  for(const {f}of sources)try{unlinkSync(join(stage,hash(f.file)));}catch{/* recovery artifacts can be removed later */}
}
function pending(project:string,root:string):string[] {const dir=journalDir(project);if(!existsSync(dir))return [];return readdirSync(dir).filter(f=>/^dialog-[0-9a-f-]+\.json$/.test(f)).map(f=>f.slice(0,-5)).filter(id=>{const j=readJournal(project,id);return canonicalRoot(j.root)===canonicalRoot(root)&&(j.state==='pending'||j.state==='undo-pending');});}
export function applyDialog(project:string,manifestPath:string,ids:string[],confirm?:string,opts:ApplyOptions={}) {
  const manifest=readManifest(manifestPath);
  return withSourceLock(manifest.root,()=>withSetLocks(project,ids,()=>{
    const interrupted=pending(project,manifest.root);if(interrupted.length)throw new ProseError('E_CONFLICT','An interrupted dialogue apply needs recovery',{details:{ids:interrupted},hint:`prose dialog recover --id ${interrupted[0]} --mode complete`});
    const plan=planDialog(project,manifestPath,ids);if(confirm===undefined)return {...plan,dryRun:true};if(confirm!==plan.digest)throw new ProseError('E_CONFLICT','Confirmation digest does not match current preflight');
    const id='dialog-'+randomUUID();mkdirSync(journalDir(project),{recursive:true});const j:Journal={schema:'prose/dialog-apply@1',id,root:plan.root,at:new Date().toISOString(),state:'pending',digest:plan.digest,files:plan.files};save(project,j);writeJournalFiles(project,j,false,opts);
    return {...plan,dryRun:false,id,state:j.state};
  }),opts.lock);
}
export function recoverDialog(project:string,id:string,mode:'complete'|'restore',opts:ApplyOptions={}) {
  const initial=readJournal(project,id);return withSourceLock(initial.root,()=>{const j=readJournal(project,id);if(j.state!=='pending'&&j.state!=='undo-pending')return {id,state:j.state};writeJournalFiles(project,j,mode==='restore'||j.state==='undo-pending',opts);return {id,state:j.state};});
}
export function undoDialog(project:string,id:string,opts:ApplyOptions={}) {
  const initial=readJournal(project,id);return withSourceLock(initial.root,()=>{const j=readJournal(project,id);if(j.state==='undone')return {id,state:j.state};if(j.state!=='complete')throw new ProseError('E_CONFLICT','Recover the interrupted apply before undo');for(const f of j.files)if(hash(readFileSync(safeSource(j.root,f.file)))!==f.afterHash)throw new ProseError('E_CONFLICT','Changed output prevents undo');j.state='undo-pending';save(project,j);writeJournalFiles(project,j,true,opts);return {id,state:j.state};});
}
