import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { stripTypeScriptTypes } from 'node:module';
import { createAnnotationFile, proposeAnnotations, inspectAnnotationFile, decideAnnotation, compileAnnotations } from '../src/annotation/store.ts';
import { renderPublication } from '../src/annotation/render.ts';
const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
it('runs the native JSON planner in an independent browser consumer with no Node or framework runtime',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'prose-consumer-'));dirs.push(dir);
 const source=join(dir,'course.json'),file=join(dir,'reading.annotations.yaml');
 const snapshot={schema:'prose/structured-source@1',adapter:{id:'course-content',version:'1',inlineDialect:'runs'},documents:[{id:'reading',language:'en-US',blocks:[{id:'full',kind:'paragraph',runs:[{text:'Particles move ',marks:['strong']},{text:'randomly.'}]},{id:'short',kind:'paragraph',runs:[{text:'Particles keep moving.'}]}]}]};
 const original=JSON.stringify(snapshot);writeFileSync(source,original);createAnnotationFile(source,file,{profile:'structured'});
 proposeAnnotations(file,[{id:'full-note',kind:'explanation',target:{quote:'move randomly.'},body:'A full-view explanation.'},{id:'short-note',kind:'definition',target:{quote:'keep moving'},body:'A short-view explanation.'}]);
 let current=inspectAnnotationFile(file);for(const a of current.annotations)current=decideAnnotation(file,{id:a.id,action:'accept',expectedRevision:current.revision});
 const compiled=compileAnnotations(file);
 const script=stripTypeScriptTypes(readFileSync(join(import.meta.dirname,'../src/annotation/render.ts'),'utf8'),{mode:'strip'});
 const url='data:text/javascript;base64,'+Buffer.from(script).toString('base64');
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.addScriptTag({type:'module',content:`import * as sdk from ${JSON.stringify(url)}; globalThis.annotationSDK=sdk;`});
  const result=await page.evaluate(({bundle})=>{
   const sdk=(globalThis as unknown as {annotationSDK:typeof import('../src/annotation/render.ts')}).annotationSDK;
   const reading=sdk.planAnnotationRuns(bundle,bundle.documents[0].id);
   const assessment=sdk.planAnnotationRuns(bundle,bundle.documents[0].id,{context:'assessment'});
   return {readingIds:reading.flatMap((b:{runs:Array<{annotations:Array<{handle:string}>}>})=>b.runs.flatMap(r=>r.annotations.map(a=>a.handle))),assessmentCount:assessment.flatMap((b:{runs:Array<{annotations:unknown[]}>})=>b.runs.flatMap(r=>r.annotations)).length,html:sdk.renderPublication(bundle)};
  },{bundle:compiled.bundle});
  expect(new Set(result.readingIds)).toEqual(new Set(['full-note','short-note']));expect(result.assessmentCount).toBe(0);
  await page.setContent(result.html);expect((await page.locator('.base-text strong').allTextContents()).join('')).toBe('Particles move ');
  expect(await page.locator('[data-prose-block="short"] .base-text').textContent()).toBe('Particles keep moving.');
  expect(renderPublication(compiled.bundle,{context:'assessment'})).not.toContain('A full-view explanation.');
  expect(readFileSync(source,'utf8')).toBe(original);
 }finally{await browser.close();}
},30000);
