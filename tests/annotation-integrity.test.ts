import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse, stringify } from 'yaml';
import { createAnnotationFile, inspectAnnotationFile, proposeAnnotations, findCandidates, decideAnnotation, compileAnnotations } from '../src/annotation/store.ts';
import { planAnnotationRuns } from '../src/annotation/render.ts';
const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function setup(text='Beta beside Alpha.\n'){
 const dir=mkdtempSync(join(tmpdir(),'prose-integrity-'));dirs.push(dir);
 const source=join(dir,'lesson.md'),file=join(dir,'lesson.annotations.yaml'),concepts=join(dir,'concepts.yaml');
 writeFileSync(source,text);
 writeFileSync(concepts,stringify({schema:'prose/concepts@1',project:'sample-course',concepts:[{id:'alpha',label:'Alpha',definition:'First.'},{id:'beta',label:'Beta',definition:'Second.'}],lists:{core:['alpha','beta']}}));
 createAnnotationFile(source,file,{concepts});return{dir,source,file,concepts};
}
function acceptAll(file:string){let current=inspectAnnotationFile(file);for(const a of current.annotations)current=decideAnnotation(file,{id:a.id,action:'accept',expectedRevision:current.revision});return current;}
it('retains list order independently of occurrence order and stales exported aliases/retirement',()=>{
 const {file,concepts}=setup();proposeAnnotations(file,[{id:'b',kind:'vocabulary',target:{quote:'Beta'},concept:'beta',lists:['core']},{id:'a',kind:'vocabulary',target:{quote:'Alpha'},concept:'alpha',lists:['core']}]);acceptAll(file);
 const bundle=compileAnnotations(file).bundle;const names=Object.values(bundle.lists)[0].map(id=>bundle.concepts.find(c=>c.id===id)!.label);expect(names).toEqual(['Alpha','Beta']);
 const registry=parse(readFileSync(concepts,'utf8'));registry.concepts[0].aliases=['First concept'];writeFileSync(concepts,stringify(registry));
 expect(inspectAnnotationFile(file).annotations.find(a=>a.id==='a')!.changes).toContain('concept');
 expect(inspectAnnotationFile(file).annotations.find(a=>a.id==='a')!.state).toBe('stale');
 registry.concepts[0].retired=true;registry.concepts[0].replacement='beta';writeFileSync(concepts,stringify(registry));
 const current=inspectAnnotationFile(file);expect(()=>decideAnnotation(file,{id:'a',action:'accept',expectedRevision:current.revision})).toThrow();
});
it('undo traverses prior decisions and batch event IDs cannot collide',()=>{
 const {file}=setup();let current=proposeAnnotations(file,[{id:'one',kind:'explanation',target:{quote:'Beta'},body:'First.'}],{eventId:'event:1'});
 current=decideAnnotation(file,{id:'one',action:'accept',expectedRevision:current.revision});
 current=decideAnnotation(file,{id:'one',action:'edit',body:'Second.',expectedRevision:current.revision});
 current=decideAnnotation(file,{id:'one',action:'undo',expectedRevision:current.revision});expect(current.annotations[0].body).toBe('First.');expect(current.annotations[0].state).toBe('accepted');
 current=decideAnnotation(file,{id:'one',action:'undo',expectedRevision:current.revision});expect(current.annotations[0].body).toBe('First.');expect(current.annotations[0].state).toBe('draft');
 current=proposeAnnotations(file,[{id:'two',kind:'highlight',target:{quote:'Beta'}},{id:'three',kind:'highlight',target:{quote:'Alpha'}}],{eventId:'event',expectedRevision:current.revision});
 const ids=current.sidecar.history.map(e=>e.id);expect(new Set(ids).size).toBe(ids.length);
});
it('preserves contiguous multi-block structured targets and explicit identity sequence',()=>{
 const {dir}=setup();const source=join(dir,'structured.json'),file=join(dir,'structured.annotations.yaml');
 writeFileSync(source,JSON.stringify({schema:'prose/structured-source@1',adapter:{id:'course-content',version:'1'},documents:[{id:'reading',language:'ar',dir:'rtl',blocks:[{id:'p-one',kind:'paragraph',runs:[{text:'First'}]},{id:'p-two',kind:'paragraph',runs:[{text:'Second'}]}]}]}));
 createAnnotationFile(source,file,{profile:'structured'});const candidates=findCandidates(file,{quote:'First\nSecond'});expect(candidates.candidates).toHaveLength(1);
 proposeAnnotations(file,[{id:'passage',kind:'highlight',candidate:candidates.candidates[0].id}]);acceptAll(file);
 const published=compileAnnotations(file);expect(published.bundle.annotations[0].target.quote).toBe('First\nSecond');expect(published.bundle.documents[0].language).toBe('ar');expect(published.html).toContain('dir="rtl"');
 expect(inspectAnnotationFile(file).sidecar.annotations[0].target.blocks).toEqual(['p-one','p-two']);
});
it('keeps private publication metadata out while reporting unsupported original destinations',()=>{
 const {file,concepts}=setup('[Beta](/private/notes.html) beside Alpha.\n');
 const registry=parse(readFileSync(concepts,'utf8'));registry.concepts[1].definitionSource='C:/private/evidence.md';registry.concepts[1].cedRef='/private/staging/reference';writeFileSync(concepts,stringify(registry));
 proposeAnnotations(file,[{id:'b',kind:'vocabulary',target:{quote:'Beta'},concept:'beta',lists:['core'],origin:{type:'assistant',agent:'C:/private/model.json'}}]);acceptAll(file);
 const publication=compileAnnotations(file),json=JSON.stringify(publication.bundle);expect(json).not.toContain('private/');expect(publication.report.warnings.length).toBeGreaterThan(0);
 expect(()=>planAnnotationRuns({...publication.bundle,schema:'unsupported' as 'prose/annotation-bundle@1'},publication.bundle.documents[0].id)).toThrow();
});
it('uses word boundaries for concept discovery while literal quotes remain literal',()=>{
 const {file,source}=setup('Alpha appears beside Alphabet.\n');
 expect(findCandidates(file,{concept:'alpha'}).candidates.map(c=>c.quote)).toEqual(['Alpha']);
 expect(findCandidates(file,{quote:'Alpha'}).candidates).toHaveLength(2);
 expect(readFileSync(source,'utf8')).toBe('Alpha appears beside Alphabet.\n');
});
it('scopes HTML documents through persisted roots and reloads accepted link snapshots without YAML aliases',()=>{
 const {dir}=setup();const source=join(dir,'reading.html'),file=join(dir,'reading.annotations.yaml');
 writeFileSync(source,'<nav>Ignore navigation</nav><main id="reading"><p id="p">Read this explanation.</p></main>');createAnnotationFile(source,file,{profile:'html',contentRoot:'#reading'});
 expect(inspectAnnotationFile(file).projection.text).toBe('Read this explanation.');
 proposeAnnotations(file,[{id:'link',kind:'link',target:{quote:'explanation'},destination:{url:'https://example.org/evidence'}}]);acceptAll(file);
 expect(inspectAnnotationFile(file).annotations[0].state).toBe('accepted');expect(readFileSync(file,'utf8')).not.toMatch(/&a\d|\*a\d/);
 expect(()=>proposeAnnotations(file,[{kind:'link',target:{quote:'Read'},destination:{document:'reading',target:'p',fragment:'p'}}])).toThrow();
});
it('blocks private structured identity declarations and keeps authoring exclusion reasons out of public reports',()=>{
 const {dir}=setup();const source=join(dir,'structured.json'),file=join(dir,'structured.annotations.yaml');
 const snapshot={schema:'prose/structured-source@1',adapter:{id:'C:/private/extractor',version:'1'},documents:[{id:'reading',blocks:[{id:'intro',kind:'paragraph',runs:[{text:'A paragraph.'}]},{id:'omitted',kind:'excluded',reason:'Internal extraction from C:/private/staging/project.json'}]}]};
 writeFileSync(source,JSON.stringify(snapshot));createAnnotationFile(source,file,{profile:'structured'});expect(()=>compileAnnotations(file)).toThrow();
 snapshot.adapter.id='sample-content';writeFileSync(source,JSON.stringify(snapshot));const publication=compileAnnotations(file);
 expect(JSON.stringify(publication.webAnnotation)).not.toContain('private/');expect(publication.report.warnings).toContain('Source regions were excluded; inspect the private authoring diagnostics for details');
});
it('preserves ordered starts and nested list semantics in the native bundle and HTML',()=>{
 const {file}=setup('5. Fifth step\n   - A nested note\n6. Sixth step\n');
 const result=compileAnnotations(file);expect(result.html).toContain('<ol start="5">');expect(result.html).toContain('<ul>');expect(result.html).toContain('<li');
 const blocks=result.bundle.documents[0].blocks;expect(blocks[0].listType).toBe('ordered');expect(blocks[0].listStart).toBe(5);expect(blocks[1].listDepth).toBe(2);
});
it('keeps multiple paragraphs and nested continuations inside their owning list item',()=>{
 const {file,source}=setup('1. First paragraph.\n\n   Second paragraph.\n\n2. Next item.');
 const result=compileAnnotations(file);expect(result.html.match(/<li>/g)).toHaveLength(2);
 expect(result.html).toMatch(/First paragraph\.[\s\S]*Second paragraph\.[\s\S]*<\/li>[\s\S]*<li>/);
 expect(result.bundle.documents[0].blocks[0].listItem).toBe(result.bundle.documents[0].blocks[1].listItem);
 writeFileSync(source,'<ol><li><p>First</p><ul><li>Nested</li></ul><p>Continuation</p></li><li>Next</li></ol>');
 const sidecar=parse(readFileSync(file,'utf8'));sidecar.document.profile='html';writeFileSync(file,stringify(sidecar));
 const html=compileAnnotations(file).html;expect(html.match(/<li>/g)).toHaveLength(3);
 expect(html).toMatch(/<\/ul>[\s\S]*Continuation[\s\S]*<\/li>[\s\S]*<li>/);
});
