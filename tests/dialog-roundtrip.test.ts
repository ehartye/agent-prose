import { readFileSync, writeFileSync, readdirSync, symlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { describe,expect,it } from 'vitest';
import { importDialog, readManifest, hash } from '../src/dialog/import.ts';
import { applyDialog, candidateText, reviewDialog, undoDialog, recoverDialog } from '../src/dialog/apply.ts';
import { parseDialog } from '../src/parse/dialog.ts';
import { checkSet } from '../src/owner/check.ts';
import { recordPick } from '../src/owner/pick.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { variantPath, writeSet, type PromptSet } from '../src/owner/sets.ts';
import { reportRepetition } from '../src/dialog/repetition.ts';
import { recordNone } from '../src/owner/none.ts';
import { readSet } from '../src/owner/sets.ts';
import { run } from './helpers.ts';
import { tmpProject,useTmp,useTempHome } from './owner-helpers.ts';

useTmp();useTempHome();
const SOURCE=`\uFEFF// source bytes stay intact\r\nexport const LINE_MAX=150;\r\nexport const BRIDGE_DIALOG={cap:{scene:[{id:'cap.1',speaker:'cap',tier:'story',text:'Ready.',variants:[{id:'cap.1#core',when:{flag:'core'},text:'Core ready.'}]}],topics:[{id:'cap.topic',tier:'info',label:'Status',text:'Ready.',once:true,effects:[{flag:'seen',value:true}]}]}};\r\n`;
function imported(source=SOURCE){const t=tmpProject();const file=t.write('source.mjs',source);const draft=join(t.project,'review.dialog.yaml'),manifest=join(t.project,'source.json');importDialog(file,{out:draft,manifest});return {...t,file,draft,manifest};}
function rewrite(project:string,set:PromptSet,index:number,text:string){const path=variantPath(project,set,set.variants[index-1]);const g=parseDialog(readFileSync(path,'utf8')).graph;const {nodeLines:_,nodeLineByIndex:__,barkLines:___,...data}=g;data.nodes.find(n=>n.id===set.sourceRef!.slotId)!.text=text;writeFileSync(path,stringify(data,{lineWidth:0}));}
function picked(t:ReturnType<typeof imported>,slot='cap.1:text',prediction=true){const set=reviewDialog(t.project,t.draft,t.manifest,slot,{count:2});rewrite(t.project,set,1,'Stand by for launch.');rewrite(t.project,set,2,'We need a wrench.');if(prediction&&!checkSet(t.project,set).ok)throw new Error(JSON.stringify(checkSet(t.project,set).rejected));if(prediction)writePrediction(t.project,set,{pick:1,shortlist:[],why:'The recorded test choice'});recordPick(t.project,set,1,{noPredict:!prediction});return set;}
describe('guarded dialogue source round trips',()=>{
 it('keeps source bindings through CLI send-back redo and champion refinement',async()=>{
   const t=imported(),first=reviewDialog(t.project,t.draft,t.manifest,'cap.1:text',{count:2});rewrite(t.project,first,1,'Stand by for launch.');rewrite(t.project,first,2,'We need a wrench.');recordNone(t.project,first.id,{reasons:['wrong-direction']});
   const made=await run('set','new','--redo',first.id,'--dir',t.project,'--count','2');const redo=readSet(t.project,made.set);expect(redo.sourceRef).toEqual(first.sourceRef);expect((await run('set','show',redo.id,'--dir',t.project)).sourceRef).toEqual(first.sourceRef);
   rewrite(t.project,redo,1,'The watch is steady.');rewrite(t.project,redo,2,'Bring the spare parts.');writePrediction(t.project,redo,{pick:1,shortlist:[],why:'Fixture choice'});recordPick(t.project,redo,1,{});
   const champion=variantPath(t.project,redo,redo.variants[0]);const refinedMade=await run('set','new',champion,'--brief-from',redo.id,'--count','2');const refined=readSet(t.project,refinedMade.set);expect(refined.sourceRef).toEqual(first.sourceRef);rewrite(t.project,refined,1,'Launch when the crew is ready.');rewrite(t.project,refined,2,'The toolbox is beside the door.');writePrediction(t.project,refined,{pick:1,shortlist:[],why:'Refined fixture choice'});recordPick(t.project,refined,1,{});
   const plan=applyDialog(t.project,t.manifest,[refined.id]);expect(plan.changes[0]).toMatchObject({old:'Ready.',text:'Launch when the crew is ready.'});const applied=applyDialog(t.project,t.manifest,[refined.id],plan.digest);expect(readFileSync(t.file,'utf8')).toContain("text:'Launch when the crew is ready.'");undoDialog(t.project,'id' in applied?applied.id:'');expect(readFileSync(t.file,'utf8')).toBe(SOURCE);
 });
 it('extracts, reviews, seals, records a pick, dry-runs, applies and restores exact bytes',()=>{
   const t=imported(),set=picked(t);const plan=applyDialog(t.project,t.manifest,[set.id]);expect(plan.dryRun).toBe(true);expect(readFileSync(t.file,'utf8')).toBe(SOURCE);
   const result=applyDialog(t.project,t.manifest,[set.id],plan.digest);expect(result).toMatchObject({dryRun:false,state:'complete'});expect(readFileSync(t.file,'utf8')).toBe(SOURCE.replace("text:'Ready.'","text:'Stand by for launch.'"));
   undoDialog(t.project,'id' in result?result.id:'');expect(readFileSync(t.file,'utf8')).toBe(SOURCE);
 });
 it('seals the source reference and refuses structural candidates, stale source, variant edits and wrong confirmation',()=>{
   const t=imported(),set=picked(t);const plan=applyDialog(t.project,t.manifest,[set.id]);expect(()=>applyDialog(t.project,t.manifest,[set.id],'0'.repeat(64))).toThrow(/digest/);
   rewrite(t.project,set,1,'Edited after the pick.');expect(()=>applyDialog(t.project,t.manifest,[set.id])).toThrow(/variant changed/i);
   const t2=imported(),s2=picked(t2);writeFileSync(t2.file,SOURCE+'// editor\n');expect(()=>applyDialog(t2.project,t2.manifest,[s2.id])).toThrow(/Source hash/);
   const t3=imported(),s3=reviewDialog(t3.project,t3.draft,t3.manifest,'cap.1:text',{count:2});const base=readFileSync(t3.draft,'utf8');expect(()=>candidateText(base,base.replace('speaker: cap','speaker: overseer'),'cap.1:text')).toThrow(/protected/);
   rewrite(t3.project,s3,1,'Stand by for launch.');rewrite(t3.project,s3,2,'We need a wrench.');writePrediction(t3.project,s3,{pick:1,shortlist:[],why:'test'});s3.sourceRef!.slotId='cap.topic:text';writeSet(t3.project,s3);expect(()=>recordPick(t3.project,s3,1,{})).toThrow(/source reference/);
 });
 it('supports explicitly unpredicted recorded choices, rejects lengths and refuses changed-output undo',()=>{
   const t=imported(),set=picked(t,'cap.1:text',false);const plan=applyDialog(t.project,t.manifest,[set.id]);const result=applyDialog(t.project,t.manifest,[set.id],plan.digest);writeFileSync(t.file,readFileSync(t.file,'utf8')+'// edit\n');expect(()=>undoDialog(t.project,'id' in result?result.id:'')).toThrow(/Changed output/);
   const t2=imported(),s2=reviewDialog(t2.project,t2.draft,t2.manifest,'cap.1:text',{count:2});rewrite(t2.project,s2,1,'x'.repeat(151));rewrite(t2.project,s2,2,'We need a wrench.');expect(()=>writePrediction(t2.project,s2,{pick:1,shortlist:[],why:'oversize'})).toThrow();
 });
 it('keeps replies and conditioned variants as exact source slots with distinct limits',()=>{
   const t=tmpProject();const source=t.write('contract.json',JSON.stringify({version:1,speakers:[{id:'cap',headline:'CAP',arrival:'Watch ready.',fallback:{story:'Wait.',quest:'Wait.',info:'Wait.'},topics:[{id:'cap.topic',tier:'story',quest:'c2.*',once:true,label:'Ask',beats:[{id:'cap.beat',speaker:'cap',text:'Hello.',variants:[{id:'cap.beat#core',when:{flag:'motion.cruising'},text:'Cruising.'}],replies:[{id:'warm',tone:'warm',label:'Thank you',beats:[{speaker:'overseer',text:'Thanks.'}]}]}]}]}]}));const manifest=join(t.project,'manifest.json');importDialog(source,{out:join(t.project,'draft.dialog.yaml'),manifest});const m=readManifest(manifest);
   expect(m.slots.find(s=>s.id==='cap:arrival')).toMatchObject({original:'Watch ready.',limit:160,kind:'bubble',speaker:'cap'});
   expect(m.slots.filter(s=>s.id==='cap:headline'||s.id.startsWith('cap:fallback.')||s.id==='cap.topic:label').every(s=>s.speaker==='cap')).toBe(true);
   expect(m.slots.find(s=>s.id==='cap.beat:text')).toMatchObject({limit:160,context:{once:true,tier:'story'}});expect(m.slots.find(s=>s.id.endsWith('/warm:label'))).toMatchObject({kind:'reply-label',limit:22,context:{tone:'warm'}});expect(m.slots.find(s=>s.id==='cap.beat#core:text')?.context).toMatchObject({when:{flag:'motion.cruising'}});
 });
 it('refuses out-of-root and symlink source paths',()=>{
   const alias=imported();const aliased=readManifest(alias.manifest);aliased.files.push({...aliased.files[0],file:'./source.mjs'});writeFileSync(alias.manifest,JSON.stringify(aliased));expect(()=>readManifest(alias.manifest)).toThrow(/Duplicate/);
   const t=imported();const m=readManifest(t.manifest);m.files[0].file='../outside.mjs';writeFileSync(t.manifest,JSON.stringify(m));expect(()=>readManifest(t.manifest)).toThrow(/root/);
   const t2=imported();const link=join(t2.project,'alias');try{symlinkSync(t2.project,link,'junction');}catch(e){if((e as NodeJS.ErrnoException).code==='EPERM')return;throw e;}expect(()=>importDialog(join(link,'source.mjs'),{root:t2.project,out:join(t2.project,'x.dialog.yaml'),manifest:join(t2.project,'x.json')})).toThrow(/symlink/);
 });
 it('recovers a journal after a write interrupted before completion',()=>{
   for(const mode of ['complete','restore'] as const){const t=imported(),set=picked(t),plan=applyDialog(t.project,t.manifest,[set.id]);expect(()=>applyDialog(t.project,t.manifest,[set.id],plan.digest,{afterWrite(){throw new Error('simulated crash');}})).toThrow('simulated crash');const id=readdirSync(join(t.project,'.agent-prose','dialog-applies')).find(f=>f.endsWith('.json'))!.slice(0,-5);expect(()=>applyDialog(t.project,t.manifest,[set.id])).toThrow(/recovery/);expect(recoverDialog(t.project,id,mode).state).toBe(mode==='complete'?'complete':'restored');expect(readFileSync(t.file,'utf8')).toBe(mode==='complete'?SOURCE.replace("text:'Ready.'","text:'Stand by for launch.'"):SOURCE);}
 });
 it('imports copies of actual bridge and ambient sources and round trips without changing unrelated bytes',()=>{
   for(const [name,slot] of [['bridge-dialog','cap.scene.1:text'],['ambient-lines','cap-airlocks:text']]){const original=readFileSync(fileURLToPath(new URL(`./fixtures/dialog-source/${name}.mjs.txt`,import.meta.url)),'utf8');const t=imported(original);const s=picked(t,slot);const old=readManifest(t.manifest).slots.find(x=>x.id===slot)!.original;const plan=applyDialog(t.project,t.manifest,[s.id]);const result=applyDialog(t.project,t.manifest,[s.id],plan.digest);const now=readFileSync(t.file,'utf8');expect(now).toBe(original.replace(old,'Stand by for launch.'));undoDialog(t.project,'id' in result?result.id:'');expect(readFileSync(t.file,'utf8')).toBe(original);}
 });
 it('recovers a partial multi-file apply and never reports an edited second file as success',()=>{
   const t=imported();const second=t.write('other.mjs',SOURCE.replaceAll('cap.','pip.').replaceAll("speaker:'cap'","speaker:'pip'"));const secondDraft=join(t.project,'other.dialog.yaml'),secondManifest=join(t.project,'other.json');importDialog(second,{out:secondDraft,manifest:secondManifest});const m=readManifest(t.manifest),m2=readManifest(secondManifest);m.files.push(...m2.files);m.slots.push(...m2.slots);const g=parseDialog(readFileSync(t.draft,'utf8')).graph,g2=parseDialog(readFileSync(secondDraft,'utf8')).graph;const draft=stringify({form:'quest-dialog',entries:[...g.entries!,...g2.entries!],nodes:[...g.nodes,...g2.nodes]},{lineWidth:0});writeFileSync(t.draft,draft);m.draftHash=hash(draft);writeFileSync(t.manifest,JSON.stringify(m));const a=picked(t),b=picked(t,'pip.1:text'),ids=[a.id,b.id],plan=applyDialog(t.project,t.manifest,ids);
   expect(()=>applyDialog(t.project,t.manifest,ids,plan.digest,{afterWrite(_path,index){if(index===0)throw new Error('partial crash');}})).toThrow('partial crash');expect(readFileSync(t.file,'utf8')).not.toBe(SOURCE);const beforeSecond=readFileSync(second,'utf8');expect(beforeSecond).toContain("text:'Ready.'");const id=readdirSync(join(t.project,'.agent-prose','dialog-applies')).find(f=>f.endsWith('.json'))!.slice(0,-5);
   writeFileSync(second,beforeSecond+'// editor\n');expect(()=>recoverDialog(t.project,id,'complete')).toThrow(/Changed output/);expect(readFileSync(second,'utf8')).toContain('// editor');writeFileSync(second,beforeSecond);recoverDialog(t.project,id,'complete');expect(readFileSync(second,'utf8')).toContain("text:'Stand by for launch.'");undoDialog(t.project,id);expect(readFileSync(t.file,'utf8')).toBe(SOURCE);expect(readFileSync(second,'utf8')).toBe(beforeSecond);
 });
 it('validates whole-topic reply counts and source-configured path budgets before any write',()=>{
   const reply=(id:string)=>({id,tone:id,label:id,beats:[{speaker:'overseer',text:'Reply.'}]});
   for(const [limits,replies,expected]of [[{LINE_MAX:160},[reply('dry'),reply('warm')],/offers 4 replies/],[{LINE_MAX:160,TOPIC_MAX_BEATS:8,TOPIC_MAX_CHARS:20,REPLY_MAX:4},[reply('dry'),reply('warm')],/path budget/]] as const){const source=`export const LIMITS=${JSON.stringify(limits)}; export const DIALOG=${JSON.stringify({speakers:[{id:'cap',topics:[{id:'cap.topic',tier:'info',label:'Status',beats:[{id:'cap.1',speaker:'cap',text:'Ready.',replies},{id:'cap.2',speaker:'cap',text:'Ready.',replies}]}]}]})};`;const t=imported(source),s=picked(t);expect(readManifest(t.manifest).slots.find(x=>x.id==='cap.1:text')?.limit).toBe(160);expect(()=>applyDialog(t.project,t.manifest,[s.id])).toThrow(expected);expect(readFileSync(t.file,'utf8')).toBe(source);}
 });
 it('serializes concurrent applies across canonical root spellings',()=>{
   const t=imported(),s=picked(t),plan=applyDialog(t.project,t.manifest,[s.id]);let conflicts=0;const result=applyDialog(t.project,t.manifest,[s.id],plan.digest,{afterWrite(){expect(()=>applyDialog(t.project,t.manifest,[s.id],undefined,{lock:{timeoutMs:1,pollMs:1}})).toThrow(/another command/);conflicts++;}});expect(conflicts).toBe(1);undoDialog(t.project,'id' in result?result.id:'');
 });
 it('reports cross-file repetitions with identities and owner catchphrase thresholds',()=>{
   const t=imported();mkdirSync(join(t.project,'.agent-prose','voices'),{recursive:true});writeFileSync(join(t.project,'.agent-prose','voices','cap.yaml'),stringify({schema:'prose/voice@1',id:'cap',name:'CAP',speakers:['cap'],description:'Protective',negative:['Never cruel'],catchphrases:['Ready'],catchphraseMaxPer1000:10}));const report=reportRepetition(t.project,[t.manifest,t.draft]);expect(report.duplicates.find(d=>d.text==='Ready.')?.locations.length).toBe(4);expect(report.catchphrases[0]).toMatchObject({ownerThreshold:10,aboveOwnerThreshold:true});
 });
});
