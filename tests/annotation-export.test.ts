import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { createAnnotationFile, inspectAnnotationFile, findCandidates, proposeAnnotations, decideAnnotation, compileAnnotations } from '../src/annotation/store.ts';
import { planAnnotationRuns, renderPublication } from '../src/annotation/render.ts';
const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
it('composes overlapping annotations with emphasis and an existing link, and supports an uncued context',()=>{
 const dir=mkdtempSync(join(tmpdir(),'prose-publication-'));dirs.push(dir);
 const source=join(dir,'lesson.md'), file=join(dir,'lesson.annotations.yaml');
 writeFileSync(source,'# Motion\n\n**Particles move** through [a membrane](https://example.org/source).\n');createAnnotationFile(source,file);
 let current=proposeAnnotations(file,[{id:'h',kind:'highlight',target:{quote:'Particles move through a membrane'}},{id:'d',kind:'definition',target:{quote:'move through'},body:'A concise explanation.'}]);
 for(const annotation of current.annotations){current=decideAnnotation(file,{id:annotation.id,action:'accept',expectedRevision:current.revision});}
 const {bundle,html,webAnnotation}=compileAnnotations(file); const planned=planAnnotationRuns(bundle,bundle.documents[0].id);
 expect(planned.flatMap(b=>b.runs.map(r=>r.text)).join('\n').replaceAll('\n','')).toBe('MotionParticles move through a membrane.');
 expect(html).toContain('https://example.org/source');expect(html).toContain('<strong>');expect(html).toContain('<mark');
 expect(html).not.toMatch(/<a[^>]*>[^<]*<a/);expect(html).toContain('A concise explanation.');
 expect(renderPublication(bundle,{context:'assessment'})).not.toContain('A concise explanation.');
 expect(JSON.stringify(webAnnotation)).toContain('TextQuoteSelector');
});
it('publishes marker-free internal destinations with stable generated anchors and rejects broken destinations',()=>{
 const dir=mkdtempSync(join(tmpdir(),'prose-destinations-'));dirs.push(dir);
 const source=join(dir,'lesson.md'),file=join(dir,'lesson.annotations.yaml');writeFileSync(source,'Read the explanation.\n\nParticles move randomly.\n');createAnnotationFile(source,file);
 const sidecar=parse(readFileSync(file,'utf8'));sidecar.targets=[{id:'random-motion',target:{quote:'Particles move randomly.'}}];writeFileSync(file,stringify(sidecar));
 let current=proposeAnnotations(file,[{id:'l',kind:'link',target:{quote:'explanation'},destination:{document:sidecar.document.handle,target:'random-motion'}}]);
 current=decideAnnotation(file,{id:'l',action:'accept',expectedRevision:current.revision});
 const compiled=compileAnnotations(file);expect(compiled.html).toContain('passage-');
 const anchor=Object.values(compiled.bundle.documents[0].targets)[0].id;expect(compiled.html).toContain(`id="passage-${anchor}"`);
 const changed=parse(readFileSync(file,'utf8'));changed.targets=[];writeFileSync(file,stringify(changed));
 expect(inspectAnnotationFile(file).annotations[0].state).toBe('stale');expect(()=>compileAnnotations(file)).toThrow();
});
it('round-trips named targets that coincide with JavaScript prototype keys',()=>{
 const dir=mkdtempSync(join(tmpdir(),'prose-target-keys-'));dirs.push(dir);
 const source=join(dir,'lesson.md'),file=join(dir,'lesson.annotations.yaml');writeFileSync(source,'Alpha and Beta.');createAnnotationFile(source,file);
 const sidecar=parse(readFileSync(file,'utf8'));sidecar.targets=[{id:'__proto__',target:{quote:'Beta'}}];writeFileSync(file,stringify(sidecar));
 let current=proposeAnnotations(file,[{id:'link',kind:'link',target:{quote:'Alpha'},destination:{document:sidecar.document.handle,target:'__proto__'}}]);
 current=decideAnnotation(file,{id:'link',action:'accept',expectedRevision:current.revision});
 const result=compileAnnotations(file),bundle=JSON.parse(JSON.stringify(result.bundle));
 expect(Object.keys(bundle.documents[0].targets)).toEqual(['__proto__']);
 const target=bundle.documents[0].targets.__proto__;expect(renderPublication(bundle)).toContain(`id="passage-${target.id}"`);
 expect(result.html).toContain(`href="#passage-${target.id}"`);
});
