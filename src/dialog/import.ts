import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { stringify } from 'yaml';
import { z } from 'zod';
import { ProseError } from '../errors.ts';
import { readSource, valueAt, type DataPath, type Source } from './source.ts';

export const hash = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Path = z.array(z.union([z.string().min(1).refine(k=>!['__proto__','constructor','prototype'].includes(k)),z.number().int().nonnegative()])).min(1);
export const SlotSchema = z.strictObject({
  id:z.string().min(1), identity:z.enum(['authored','snapshot-derived']), file:z.string().min(1),
  locator:z.strictObject({type:z.enum(['structural','literal']),path:Path,start:z.number().int().nonnegative(),end:z.number().int().positive()}),
  original:z.string(), sourceHash:Hash, contextHash:Hash, context:z.record(z.string(),z.unknown()),
  speaker:z.string().min(1), kind:z.enum(['bubble','label','reply-label','headline']), group:z.string().optional(), limit:z.number().int().positive(),
});
export const ManifestSchema=z.strictObject({schema:z.literal('prose/dialog-manifest@1'),root:z.string().refine(isAbsolute),draft:z.string().refine(isAbsolute),draftHash:Hash,files:z.array(z.strictObject({file:z.string().min(1),hash:Hash,snapshot:z.string()})).min(1),slots:z.array(SlotSchema).min(1)});
export type Slot=z.infer<typeof SlotSchema>;
export type Manifest=z.infer<typeof ManifestSchema>;
export function safeSource(root:string,file:string):string {
  const path=resolve(root,file); const rel=relative(root,path);
  if(isAbsolute(file)||!rel||rel.startsWith('..')||isAbsolute(rel)) throw new ProseError('E_SCHEMA','Dialogue source path must remain inside its root');
  let part=root; if(lstatSync(root).isSymbolicLink()) throw new ProseError('E_SCHEMA','Dialogue source root cannot be a symlink');
  for(const k of rel.split(sep)) {part=resolve(part,k);if(lstatSync(part).isSymbolicLink()) throw new ProseError('E_SCHEMA','Dialogue source symlinks are unsupported');}
  const real=relative(realpathSync(root),realpathSync(path)); if(real.startsWith('..')||isAbsolute(real)) throw new ProseError('E_SCHEMA','Dialogue source escaped root'); return path;
}
export function readManifest(path:string):Manifest {
  let raw:unknown;try{raw=JSON.parse(readFileSync(path,'utf8'));}catch(e){throw new ProseError('E_SCHEMA',`Cannot read dialogue manifest: ${(e as Error).message}`);}
  const result=ManifestSchema.safeParse(raw);if(!result.success) throw new ProseError('E_SCHEMA',`Invalid dialogue manifest: ${result.error.issues[0].message}`);
  const m=result.data; const ids=new Set<string>();const files=new Set<string>();const physicalFiles=new Set<string>();const paths=new Set<string>();
  for(const f of m.files){const real=realpathSync(safeSource(m.root,f.file));const canonical=process.platform==='win32'?real.toLowerCase():real;if(files.has(f.file)||physicalFiles.has(canonical)||hash(f.snapshot)!==f.hash)throw new ProseError('E_SCHEMA','Duplicate or invalid source snapshot');files.add(f.file);physicalFiles.add(canonical);}
  for(const s of m.slots){const key=s.file+JSON.stringify(s.locator.path);if(ids.has(s.id)||paths.has(key)||!files.has(s.file)||hash(JSON.stringify(s.context))!==s.contextHash)throw new ProseError('E_SCHEMA','Duplicate identity or invalid slot context');ids.add(s.id);paths.add(key);}
  return m;
}
const object=(x:unknown):Record<string,any>|undefined=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,any>:undefined;
export function extractSlots(source:Source,file:string):Slot[] {
  if(source.unsupported.length)throw new ProseError('E_SCHEMA','Unsupported dynamic dialogue expressions',{details:{unsupported:source.unsupported}});
  const data=object(source.data)??{};const limits=object(data.LIMITS)??{};
  const lineMax=Number(data.AMBIENT_LINE_MAX??data.LINE_MAX??limits.LINE_MAX??(data.BRIDGE_DIALOG?150:160));
  const sourceHash=hash(source.text);const out:Slot[]=[];const used=new Set<string>();
  for(const leaf of source.leaves){
    const path=leaf.path;const key=String(path.at(-1));
    if(!['text','label','headline','arrival','story','quest','info','staffed'].includes(key))continue;
    if(['story','quest','info'].includes(key)&&!path.includes('fallback'))continue;
    if(key==='staffed'&&!path.includes('STATUS_LINES'))continue;
    const parent=object(valueAt(source.data,path.slice(0,-1)))??{};
    let speaker=typeof parent.speaker==='string'?parent.speaker:undefined;let group:string|undefined;
    let owner:{id:string;depth:number}|undefined;const lineage:string[]=[];
    const inherited:Record<string,unknown>={};
    for(let n=0;n<path.length;n++){
      const p=object(n?valueAt(source.data,path.slice(0,n)):source.data);if(!p)continue;
      if(path[n-2]==='speakers'&&typeof path[n-1]==='number'&&typeof p.id==='string')speaker=p.id;
      if(typeof p.speaker==='string')speaker=p.speaker;
      if(typeof p.id==='string'){
        if(!/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*(#[a-z0-9-]+)?$/.test(p.id))throw new ProseError('E_SCHEMA',`Malformed authored dialogue id ${p.id}`);
        owner={id:p.id,depth:n};lineage.push(p.id);if(!path.slice(n).includes('variants'))group=p.id;
      }
      for(const k of ['when','tier','quest','once','effects','tone','tags','mood','places','stages','near','voice'])if(Object.hasOwn(p,k))inherited[k]=p[k];
    }
    if(path[0]==='BRIDGE_DIALOG'||path[0]==='POOLS')speaker??=String(path[1]);
    if(path[0]==='EXCHANGES')speaker??=typeof parent.speaker==='string'?parent.speaker:'unknown';
    const suffix=owner?path.slice(owner.depth).join('.'):path.join('.');
    const id=owner?`${path.includes('replies')?lineage.join('/'):owner.id}:${suffix}`:`snapshot:${path.join('.')}`;
    if(used.has(id))throw new ProseError('E_SCHEMA',`Duplicate dialogue identity ${id}`);used.add(id);
    const kind=key==='headline'?'headline':key==='label'?(path.includes('replies')?'reply-label':'label'):'bubble';
    const limit=kind==='headline'?Number(limits.HEADLINE_MAX??24):kind==='reply-label'?Number(limits.REPLY_LABEL_MAX??22):kind==='label'?Number(data.LABEL_MAX??limits.LABEL_MAX??30):lineMax;
    const context={...inherited,...Object.fromEntries(Object.entries(parent).filter(([k])=>k!==key))};
    out.push({id,identity:owner&&!path.slice(owner.depth).some(k=>typeof k==='number')?'authored':'snapshot-derived',file,locator:{type:/\.(?:m?js|cjs)$/i.test(file)?'literal':'structural',path,start:leaf.start,end:leaf.end},original:leaf.value,sourceHash,contextHash:hash(JSON.stringify(context)),context,speaker:speaker??'unknown',kind,...(group?{group}:{}),limit});
  }
  if(!out.length)throw new ProseError('E_SCHEMA','No supported dialogue text slots found');return out;
}
export function importDialog(sourceFile:string,opts:{root?:string;out:string;manifest:string}) {
  const declaredRoot=resolve(opts.root??dirname(resolve(sourceFile)));const file=relative(declaredRoot,resolve(sourceFile)).split(sep).join('/');safeSource(declaredRoot,file);const root=realpathSync(declaredRoot);
  const out=resolve(opts.out),manifest=resolve(opts.manifest);
  if(new Set([out,manifest,resolve(sourceFile)].map(p=>process.platform==='win32'?p.toLowerCase():p)).size!==3||existsSync(out)||existsSync(manifest))throw new ProseError('E_CONFLICT','Import output exists or aliases another artifact');
  const text=readFileSync(sourceFile,'utf8');const parsed=readSource(file,text);const slots=extractSlots(parsed,file);
  const draft=stringify({form:'quest-dialog',entries:slots.map(s=>s.id),nodes:slots.map(s=>({id:s.id,speaker:s.speaker,text:s.original,end:true,limit:s.limit,sourceKind:s.kind}))},{lineWidth:0});
  const m=ManifestSchema.parse({schema:'prose/dialog-manifest@1',root,draft:out,draftHash:hash(draft),files:[{file,hash:hash(text),snapshot:text}],slots});
  const created:string[]=[];
  try{for(const [path,content]of [[out,draft],[manifest,JSON.stringify(m,null,2)+'\n']]){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,content,{flag:'wx'});created.push(path);}}catch(e){for(const path of created)unlinkSync(path);throw e;}
  return {draft:out,manifest,slots:slots.length,unsupported:[],sourceHash:hash(text)};
}
