import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { request } from 'node:http';
import { chromium } from 'playwright';
import { parse, stringify } from 'yaml';
import { reviewPage } from '../src/reading/assets.ts';
import { startAnnotationPreview, getAnnotationPreviewStatus, getAnnotationFeedback, closeAnnotationPreview, openAnnotationPreview } from '../src/annotation/workbench.ts';
import { createAnnotationFile, findCandidates, proposeAnnotations, inspectAnnotationFile, compileAnnotations, decideAnnotation } from '../src/annotation/store.ts';
import { tmp, useTmp, useTempHome } from './owner-helpers.ts';
import { ReadingServer } from '../src/reading/server.ts';
import { seedBatch, makeQueue } from './reading-batch-helpers.ts';

useTmp();
useTempHome();
const servers: Array<{ close(): Promise<void> }> = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });

async function seed(options: { concepts?: boolean } = {}) {
  const dir = tmp('prose-annotation-workbench-');
  const source = join(dir, 'lesson.md');
  const file = join(dir, 'lesson.annotations.yaml');
  writeFileSync(source, '# Transport\n\n**Diffusion** moves particles. Diffusion can be observed.\n\nA second paragraph preserves context.\n');
  const concepts = options.concepts ? join(dir, 'concepts.json') : undefined;
  if (concepts) writeFileSync(concepts, JSON.stringify({ schema: 'prose/concepts@1', project: 'sample-science', concepts: [{ id: 'diffusion', label: 'Diffusion', definition: 'Net spreading through random particle motion.' }], lists: { core: ['diffusion'] } }));
  createAnnotationFile(source, file, concepts ? { concepts } : {});
  const located = findCandidates(file, { quote: 'Diffusion' });
  proposeAnnotations(file, [{ id: 'diffusion', kind: 'definition', candidate: located.candidates[0].id, body: 'Particles spread through random motion.', ...(concepts ? { concept: 'diffusion' } : {}) }], { expectedRevision: located.revision });
  const server = await startAnnotationPreview(file, { port: 0 });
  servers.push(server);
  return { dir, source, file, concepts, server, base: server.localUrl.split('/?')[0] };
}

async function api(s: Awaited<ReturnType<typeof seed>>, path: string, body?: unknown, over: Record<string, string> = {}) {
  return fetch(s.base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-prose-token': s.server.token, ...(body === undefined ? {} : { 'content-type': 'application/json', origin: s.base }), ...over }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe('annotation workbench', () => {
  it('keeps publication note and destination links inside the sandbox after appearance changes', async () => {
    const s=await seed();
    const paragraphs=Array.from({length:40},(_,i)=>`Observation ${i+1} records particle motion.\n`).join('\n');
    writeFileSync(s.source,readFileSync(s.source,'utf8')+'\n'+paragraphs+'\nThe destination passage describes an observation.\n\n'+paragraphs);
    const sidecar=parse(readFileSync(s.file,'utf8'));
    sidecar.targets=[{id:'observation',target:{quote:'The destination passage describes an observation.'}}];
    writeFileSync(s.file,stringify(sidecar));
    let inspection=proposeAnnotations(s.file,[{id:'reference',kind:'link',target:{quote:'Diffusion can be observed.'},body:'Read the observation.',destination:{document:sidecar.document.handle,target:'observation'}}]);
    for(const annotation of inspection.annotations)inspection=decideAnnotation(s.file,{id:annotation.id,action:'accept',expectedRevision:inspection.revision});
    const compiled=compileAnnotations(s.file),source=readFileSync(s.source,'utf8'),annotations=readFileSync(s.file,'utf8');
    const noteId='note-'+compiled.bundle.annotations.find(a=>a.handle==='reference')!.id;
    const destinationId='passage-'+compiled.bundle.documents[0].targets.observation.id;
    const browser=await chromium.launch({headless:true});
    try {
      const page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(5000);
      await page.goto(s.server.localUrl);await page.getByRole('button',{name:'Publication',exact:true}).click();
      const preview=page.frameLocator('#publication');
      const frameURL=()=>page.frames().find(frame=>frame!==page.mainFrame())?.url();
      const targetIsInView=async(id:string)=>preview.locator(`[id="${id}"]`).evaluate(el=>{const rect=el.getBoundingClientRect();return rect.top>=0&&rect.top<el.ownerDocument.defaultView!.innerHeight;});
      for(const theme of ['light','dark']) {
        await page.getByRole('button',{name:'Review settings',exact:true}).click();
        await page.getByRole('combobox',{name:'Appearance',exact:true}).selectOption(theme);
        await page.keyboard.press('Escape');
        await expect.poll(()=>preview.locator('html').getAttribute('data-theme')).toBe(theme);
        await preview.getByRole('link',{name:'link: Diffusion can be observed.',exact:true}).click();
        await expect.poll(frameURL).toBe('about:srcdoc#'+noteId);
        expect(await targetIsInView(noteId)).toBe(true);
        await preview.getByRole('link',{name:'Open reference',exact:true}).click();
        await expect.poll(frameURL).toBe('about:srcdoc#'+destinationId);
        expect(await targetIsInView(destinationId)).toBe(true);
        expect(page.url()).toBe(s.server.localUrl);
        expect(await page.locator('#publication').getAttribute('sandbox')).toBe('');
      }
      expect(compiled.html).toContain(`href="#${noteId}"`);
      expect(compiled.html).toContain(`href="#${destinationId}"`);
      expect(compiled.html).not.toContain('href="about:srcdoc#');
      expect(compileAnnotations(s.file).html).toBe(compiled.html);
      expect(readFileSync(s.source,'utf8')).toBe(source);
      expect(readFileSync(s.file,'utf8')).toBe(annotations);
    }finally{await browser.close();}
  },30_000);
  it('takes a phone reader straight to the selected editor and back to the source', async () => {
    const s=await seed({concepts:true}),browser=await chromium.launch({headless:true});
    try {
      const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(5000);
      await page.goto(s.server.localUrl);await page.locator('#queue .qitem').first().click();
      const accept=await page.getByRole('button',{name:'Accept',exact:true}).boundingBox();
      expect(accept!.y).toBeGreaterThan(0);expect(accept!.y+accept!.height).toBeLessThan(844);
      await page.getByRole('textbox',{name:'Annotation text',exact:true}).fill('An unsaved phone edit.');
      const save=await page.getByRole('button',{name:'Save text',exact:true}).boundingBox();
      expect(save!.y+save!.height).toBeLessThan(844);
      await page.locator('#queue .qitem').first().click();
      expect(await page.getByRole('textbox',{name:'Annotation text',exact:true}).inputValue()).toBe('An unsaved phone edit.');
      await page.getByRole('button',{name:'Discard text edits',exact:true}).click();
      await page.getByRole('link',{name:'Back to source text',exact:true}).click();
      expect(await page.getByRole('region',{name:'Source reading pane',exact:true}).evaluate(el=>el===el.ownerDocument.activeElement)).toBe(true);
      await page.getByRole('link',{name:'Review annotation',exact:true}).click();
      expect(await page.getByRole('complementary',{name:'Annotation details',exact:true}).evaluate(el=>el===el.ownerDocument.activeElement)).toBe(true);
    }finally{await browser.close();}
  },30_000);
  it('keeps the passage and review actions in reach while secondary tools open on demand', async () => {
    const s=await seed({concepts:true});const browser=await chromium.launch({headless:true});
    try {
      const page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(5000);
      await page.goto(s.server.localUrl);await page.getByRole('button',{name:'Accept',exact:true}).waitFor();
      expect(await page.locator('#queue .who').first().textContent()).toBe('Diffusion');
      expect(await page.locator('#source').evaluate(el=>el.ownerDocument.defaultView!.getComputedStyle(el).fontFamily)).toContain('Atkinson');
      const accept=await page.getByRole('button',{name:'Accept',exact:true}).boundingBox();
      expect(accept!.y).toBeGreaterThan(0);expect(accept!.y+accept!.height).toBeLessThan(850);
      expect(await page.getByRole('textbox',{name:'Find exact passage',exact:true}).isVisible()).toBe(false);
      await page.getByText('Change location',{exact:true}).click();
      expect(await page.getByRole('textbox',{name:'Find exact passage',exact:true}).isVisible()).toBe(true);
      await page.getByText('Surrounding text',{exact:true}).click();
      expect(await page.locator('#context').isVisible()).toBe(true);
      await page.getByRole('textbox',{name:'Annotation text',exact:true}).fill('An unsaved explanation.');
      await page.locator('#queue .qitem[aria-current="true"]').click();
      expect(await page.getByRole('textbox',{name:'Annotation text',exact:true}).inputValue()).toBe('An unsaved explanation.');
      const save=await page.getByRole('button',{name:'Save text',exact:true}).boundingBox();
      expect(save!.y+save!.height).toBeLessThan(850);
      await page.getByRole('button',{name:'Accept',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'Save your text before accepting'}).waitFor();
      expect(inspectAnnotationFile(s.file).annotations[0].state).toBe('draft');
    }finally{await browser.close();}
  },30_000);
  it('edits publishable category and concept colors and previews all three highlight modes', async () => {
    const s=await seed({concepts:true});const original=readFileSync(s.source,'utf8');
    const browser=await chromium.launch({headless:true});
    try {
      const page=await browser.newPage({viewport:{width:1440,height:850}});page.setDefaultTimeout(5000);
      await page.goto(s.server.localUrl);await page.getByRole('button',{name:'Accept',exact:true}).waitFor();
      await page.getByRole('button',{name:'Review settings',exact:true}).click();
      await page.getByRole('combobox',{name:'Highlighting',exact:true}).selectOption('category');
      await expect.poll(()=>inspectAnnotationFile(s.file).sidecar.appearance?.mode).toBe('category');
      await page.getByRole('combobox',{name:'Category',exact:true}).selectOption('definition');
      await page.getByRole('combobox',{name:'Category color',exact:true}).selectOption('orange');
      await expect.poll(()=>inspectAnnotationFile(s.file).sidecar.appearance?.categories?.definition).toBe('orange');
      await page.keyboard.press('Escape');
      await expect.poll(()=>page.locator('.passage-mark').first().getAttribute('data-prose-color')).toBe('orange');
      await page.locator('#member-appearance > summary').click();
      await page.getByRole('combobox',{name:/^Concept color:/}).selectOption('blue');
      await expect.poll(()=>inspectAnnotationFile(s.file).sidecar.appearance?.concepts?.diffusion).toBe('blue');
      expect(await page.locator('.passage-mark').first().getAttribute('data-prose-color')).toBe('orange');
      await page.getByRole('button',{name:'Review settings',exact:true}).click();
      await page.getByRole('combobox',{name:'Highlighting',exact:true}).selectOption('member');
      await expect.poll(()=>page.locator('.passage-mark').first().getAttribute('data-prose-color')).toBe('blue');
      await page.getByRole('combobox',{name:'Highlighting',exact:true}).selectOption('hybrid');
      await expect.poll(()=>inspectAnnotationFile(s.file).sidecar.appearance?.mode).toBe('hybrid');
      await page.keyboard.press('Escape');
      await page.getByRole('combobox',{name:/^Concept color:/}).selectOption('');
      await expect.poll(()=>page.locator('.passage-mark').first().getAttribute('data-prose-color')).toBe('orange');
      await page.getByRole('button',{name:'Accept',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'Decision saved'}).waitFor();
      expect(compileAnnotations(s.file).html).toContain('data-prose-color="orange"');
      await page.reload();
      await page.getByRole('button',{name:'Review settings',exact:true}).click();
      expect(await page.getByRole('combobox',{name:'Highlighting',exact:true}).inputValue()).toBe('hybrid');
      expect(readFileSync(s.source,'utf8')).toBe(original);
    }finally{await browser.close();}
  },30_000);
  it('scrolls the three annotation columns independently on a desktop', async () => {
    const s = await seed();
    writeFileSync(s.source,readFileSync(s.source,'utf8')+'\n'+Array.from({length:70},(_,i)=>`Paragraph ${i+1} explains how particles move through a system.\n`).join('\n'));
    const found=findCandidates(s.file,{quote:'Diffusion'});
    proposeAnnotations(s.file,Array.from({length:40},(_,i)=>({id:'note-'+i,kind:'explanation' as const,candidate:found.candidates[0].id,body:'Additional explanation.'})),{expectedRevision:found.revision});
    const browser=await chromium.launch({headless:true});
    try {
      const page=await browser.newPage({viewport:{width:1440,height:850}});page.setDefaultTimeout(5000);
      await page.goto(s.server.localUrl);await page.getByRole('button',{name:'Accept',exact:true}).waitFor();
      await page.getByText('Sources and origin',{exact:true}).click();
      await page.getByText('Technical details',{exact:true}).click();
      const columns=[page.getByRole('navigation',{name:'Annotation queue',exact:true}),page.getByRole('region',{name:'Source reading pane',exact:true}),page.getByRole('region',{name:'Annotation editor',exact:true})];
      const positions=()=>Promise.all(columns.map(c=>c.evaluate(el=>el.scrollTop)));
      for(let i=0;i<columns.length;i++){
        const before=await positions();
        await columns[i].hover();await page.mouse.wheel(0,600);
        await expect.poll(async()=> (await positions())[i]).toBeGreaterThan(before[i]);
        const after=await positions();
        for(let j=0;j<columns.length;j++)if(j!==i)expect(after[j]).toBe(before[j]);
        expect(await page.evaluate(()=> (globalThis as unknown as {scrollY:number}).scrollY)).toBe(0);
      }
      await page.setViewportSize({width:390,height:844});
      expect(await page.evaluate(()=>{const w=globalThis as unknown as {document:{documentElement:{scrollWidth:number}};innerWidth:number};return w.document.documentElement.scrollWidth<=w.innerWidth;})).toBe(true);
    }finally{await browser.close();}
  },30_000);
  it('shares persistent appearance settings across review pages and follows the system by default', async () => {
    const s = await seed();
    const reading = new ReadingServer({host:'127.0.0.1',port:0,persist:false,token:'a'.repeat(32)});
    const info = await reading.listen(); servers.push(reading);
    const original = `http://127.0.0.1:${info.port}`;
    const browser = await chromium.launch({headless:true});
    try {
      let context = await browser.newContext({colorScheme:'dark'});
      let page = await context.newPage(); page.setDefaultTimeout(5000);
      const paper = () => page.locator('body').evaluate(el=>el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor);
      const settings = () => page.getByRole('button',{name:'Review settings',exact:true});
      const appearance = () => page.getByRole('combobox',{name:'Appearance',exact:true});
      await page.goto(s.server.localUrl);
      expect(await paper()).toBe('rgb(18, 22, 27)');
      await settings().click();
      expect(await appearance().inputValue()).toBe('system');
      await appearance().selectOption('light');
      expect(await paper()).toBe('rgb(237, 239, 234)');
      expect(await page.locator('html').evaluate(el=>el.ownerDocument.defaultView!.getComputedStyle(el).colorScheme)).toBe('light');
      if(process.env.PROSE_UI_PROOF)await page.screenshot({path:join(process.env.PROSE_UI_PROOF,'review-settings-light.png'),fullPage:true});
      await page.keyboard.press('Escape');
      expect(await settings().evaluate(el=>el===el.ownerDocument.activeElement)).toBe(true);
      await page.reload();
      expect(await paper()).toBe('rgb(237, 239, 234)');
      await page.getByRole('button',{name:'Publication',exact:true}).click();
      const previewPaper=()=>page.frameLocator('#publication').locator('body').evaluate(el=>el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor);
      await expect.poll(previewPaper).toBe('rgb(250, 251, 248)');
      await settings().click();await appearance().selectOption('dark');
      await expect.poll(previewPaper).toBe('rgb(26, 32, 39)');
      await appearance().selectOption('light');await page.keyboard.press('Escape');
      await page.goto(original);
      await settings().click();
      expect(await appearance().inputValue()).toBe('light');
      expect(await paper()).toBe('rgb(237, 239, 234)');
      const saved = await context.storageState();
      expect(saved.cookies.find(c=>c.name==='prose-review-theme')?.expires).toBeGreaterThan(Date.now()/1000);
      await context.close();
      context = await browser.newContext({colorScheme:'dark',storageState:saved});
      page = await context.newPage(); page.setDefaultTimeout(5000);
      await page.goto(s.server.localUrl);
      expect(await paper()).toBe('rgb(237, 239, 234)');
      await settings().click();
      await appearance().selectOption('system');
      expect(await paper()).toBe('rgb(18, 22, 27)');
      await page.emulateMedia({colorScheme:'light'});
      expect(await paper()).toBe('rgb(237, 239, 234)');
      await appearance().selectOption('dark');
      expect(await paper()).toBe('rgb(18, 22, 27)');
      expect(await page.locator('html').evaluate(el=>el.ownerDocument.defaultView!.getComputedStyle(el).colorScheme)).toBe('dark');
      await appearance().selectOption('system');
      expect((await context.cookies()).find(c=>c.name==='prose-review-theme')).toBeUndefined();
      await page.reload();
      expect(await paper()).toBe('rgb(237, 239, 234)');
    } finally { await browser.close(); }
  },60_000);
  it('uses the original review shell, assets, fonts and controls in both review modes', async () => {
    const s = await seed();
    const batch=seedBatch(2), queue=makeQueue(batch);
    const reading = new ReadingServer({host:'127.0.0.1',port:0,persist:false,token:'a'.repeat(32),projects:[batch.project]});
    const info = await reading.listen(); servers.push(reading);
    const original = `http://127.0.0.1:${info.port}`;
    for(const asset of ['/style.css','/review.js','/app.js','/annotations.js','/fonts/atkinson-400.ttf','/fonts/courier-prime-400.ttf']){
      const [a,b]=await Promise.all([fetch(original+asset),fetch(s.base+asset)]);
      expect(a.status,asset).toBe(200);expect(b.status,asset).toBe(200);
      expect(Buffer.from(await b.arrayBuffer()),asset).toEqual(Buffer.from(await a.arrayBuffer()));
    }
    const browser = await chromium.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1280,height:850}});
      page.setDefaultTimeout(5000);
      await page.goto(original); await page.locator('#title').filter({hasText:'Reading'}).waitFor();
      const originalStyle=await page.locator('body').evaluate(el=>({font:el.ownerDocument.defaultView!.getComputedStyle(el).fontFamily,paper:el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor}));
      await page.goto(`${original}/q/${queue.id}?t=${'a'.repeat(32)}`);
      await page.locator('#rail .qitem').nth(1).waitFor();
      await page.locator('#rail .qitem').nth(1).click();
      await page.locator('#rail .qitem[data-key="rail-2"][aria-current="true"]').waitFor();
      await page.getByRole('button',{name:'Review settings',exact:true}).click();
      await page.getByRole('button',{name:'Done',exact:true}).focus();
      await page.keyboard.press('a');
      // A shortcut write is asynchronous; allow its response/render to settle before checking absence.
      await page.waitForTimeout(250);
      expect(await page.locator('#rail .qitem[aria-current="true"]').textContent()).not.toContain('Picked A');
      expect(await page.getByRole('dialog',{name:'Review settings',exact:true}).isVisible()).toBe(true);
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:/^Keep draft/}).first().click();
      await page.getByRole('button',{name:/^Kept draft/}).first().waitFor();
      await page.goto(`${original}/s/${queue.items[0].sessionId}?t=${'a'.repeat(32)}`);
      await page.getByRole('button',{name:/^Keep draft/}).first().waitFor();
      await page.getByRole('button',{name:/^Keep draft/}).first().click();
      await page.getByRole('button',{name:/^Kept draft/}).first().waitFor();
      if(process.env.PROSE_UI_PROOF)await page.screenshot({path:join(process.env.PROSE_UI_PROOF,'original-review.png'),fullPage:true});
      await page.goto(s.server.localUrl);await page.getByRole('button',{name:'Accept',exact:true}).waitFor();
      expect(await page.locator('body').evaluate(el=>({font:el.ownerDocument.defaultView!.getComputedStyle(el).fontFamily,paper:el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor}))).toEqual(originalStyle);
      expect(originalStyle.font).toContain('Atkinson');
      expect(await page.locator('#desk.batch #rail .qitem').count()).toBe(1);
      expect(await page.getByRole('button',{name:'Accept',exact:true}).evaluate(el=>el.ownerDocument.defaultView!.getComputedStyle(el).minHeight)).toBe('44px');
      if(process.env.PROSE_UI_PROOF)await page.screenshot({path:join(process.env.PROSE_UI_PROOF,'annotation-review.png'),fullPage:true});
      await page.emulateMedia({colorScheme:'dark'});
      expect(await page.locator('body').evaluate(el=>el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor)).toBe('rgb(18, 22, 27)');
      if(process.env.PROSE_UI_PROOF)await page.screenshot({path:join(process.env.PROSE_UI_PROOF,'annotation-dark.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});
      expect(await page.evaluate(()=>{const v=globalThis as unknown as {document:{documentElement:{scrollWidth:number}};innerWidth:number};return v.document.documentElement.scrollWidth<=v.innerWidth;})).toBe(true);
      expect(await page.locator('#rail').isVisible()).toBe(true);
      if(process.env.PROSE_UI_PROOF)await page.screenshot({path:join(process.env.PROSE_UI_PROOF,'annotation-mobile.png'),fullPage:true});
    }finally{await browser.close();}
  },60_000);
  it('provides accessible source, queue and detail panes with all review actions and local assets', () => {
    const page = reviewPage('annotations');
    const controller = readFileSync(join(import.meta.dirname,'..','runtime','reading','annotations.js'),'utf8');
    expect(page).toContain('data-review-mode="annotations"');
    expect(page).toContain('script src="/review.js"');
    expect(page).toContain('script src="/app.js"');
    for(const name of ['Annotation queue','Source reading pane','Annotation details'])expect(controller).toContain(name);
    expect(controller).not.toContain('eval(');
  });

  it('keeps inspection private, refuses cross-origin saves and preserves sidecar authority on reload', async () => {
    const s = await seed();
    expect((await fetch(s.base + '/api/state')).status).toBe(401);
    expect((await api(s, '/api/state', undefined, { 'x-prose-token': 'é'.repeat(64) })).status).toBe(401);
    const stateResponse = await api(s, '/api/state');
    const state = await stateResponse.json() as any;
    expect(state.inspection.annotations).toHaveLength(1);
    expect(stateResponse.headers.get('referrer-policy')).toBe('no-referrer');
    const decision = { id: 'diffusion', action: 'reject', eventId: 'review-1', expectedRevision: state.inspection.revision };
    const denied = await api(s, '/api/decision', decision, { origin: 'https://other.example' });
    expect(denied.status).toBe(403);
    expect(inspectAnnotationFile(s.file).annotations[0].state).toBe('draft');
    expect((await api(s, '/api/decision', decision)).status).toBe(200);
    expect(inspectAnnotationFile(s.file).annotations[0].state).toBe('rejected');
    expect((await api(s, '/api/decision', decision)).status).toBe(200);
    const feedback = await getAnnotationFeedback(s.server.session, 0);
    expect(feedback.events.filter((event: { id: string }) => event.id === 'review-1')).toHaveLength(1);
    expect((await (await api(s, '/api/state')).json() as any).inspection.annotations[0].state).toBe('rejected');
  });

  it('returns a visible revision conflict instead of overwriting a concurrent sidecar edit', async () => {
    const s = await seed();
    const state = await (await api(s, '/api/state')).json() as any;
    const external = findCandidates(s.file, { quote: 'particles' });
    proposeAnnotations(s.file, [{ id: 'particles', kind: 'highlight', candidate: external.candidates[0].id }], { expectedRevision: external.revision });
    const response = await api(s, '/api/decision', { id: 'diffusion', action: 'edit', body: 'My unsaved edit.', eventId: 'edit-1', expectedRevision: state.inspection.revision });
    expect(response.status).toBe(409);
    expect((await response.json() as any).error.code).toBe('E_CONFLICT');
    expect(inspectAnnotationFile(s.file).annotations.find(a => a.id === 'diffusion')?.body).toBe('Particles spread through random motion.');
  });

  it('rejects rebinding hosts, missing mutation origins and oversized or non-JSON changes', async () => {
    const s = await seed();
    const status = await new Promise<number>((done, fail) => {
      const req = request(s.base + '/api/state', { headers: { host: 'attacker.example', 'x-prose-token': s.server.token } }, response => { response.resume(); done(response.statusCode!); });
      req.once('error', fail); req.end();
    });
    expect(status).toBe(421);
    const missingOrigin = await fetch(s.base + '/api/decision', { method: 'POST', headers: { 'x-prose-token': s.server.token, 'content-type': 'application/json' }, body: '{}' });
    expect(missingOrigin.status).toBe(403);
    const wrongType = await api(s, '/api/decision', {}, { 'content-type': 'text/plain' });
    expect(wrongType.status).toBe(400);
    const huge = await api(s, '/api/decision', { body: 'x'.repeat(256 * 1024) });
    expect(huge.status).toBe(400);
    expect(inspectAnnotationFile(s.file).annotations[0].state).toBe('draft');
  });

  it('keeps unresolved entries visible and separates editing, retargeting and approval', async () => {
    const s = await seed();
    proposeAnnotations(s.file, [{ id: 'missing', kind: 'explanation', target: { quote: 'absent passage' }, body: 'An unresolved explanation.' }]);
    let state = await (await api(s, '/api/state')).json() as any;
    expect(state.inspection.annotations.find((a: any) => a.id === 'missing').resolution.status).toBe('missing');
    const locations = await (await api(s, '/api/locate', { quote: 'Diffusion' })).json() as any;
    expect(locations.candidates).toHaveLength(2);
    const retargeted = await api(s, '/api/decision', { id: 'missing', action: 'retarget', candidate: locations.candidates[1].id, eventId: 'retarget-1', expectedRevision: locations.revision });
    expect(retargeted.status).toBe(200);
    state = await retargeted.json() as any;
    expect(state.inspection.annotations.find((a: any) => a.id === 'missing').state).toBe('draft');
    const accepted = await api(s, '/api/decision', { id: 'missing', action: 'accept', eventId: 'accept-1', expectedRevision: state.inspection.revision });
    expect(accepted.status).toBe(200);
    state = await accepted.json() as any;
    const undone = await api(s, '/api/decision', { id: 'missing', action: 'undo', eventId: 'undo-1', expectedRevision: state.inspection.revision });
    expect(undone.status).toBe(200);
    expect(inspectAnnotationFile(s.file).annotations.find(a => a.id === 'missing')?.state).toBe('draft');
  });

  it('reads feedback from the canonical journal and closes through its authenticated lifecycle', async () => {
    const s = await seed();
    const before = await getAnnotationPreviewStatus(s.server.session);
    expect(before.running).toBe(true);
    const state = await (await api(s, '/api/state')).json() as any;
    await api(s, '/api/decision', { id: 'diffusion', action: 'defer', eventId: 'later-1', expectedRevision: state.inspection.revision });
    const feedback = await getAnnotationFeedback(s.server.session, before.cursor);
    expect(feedback.events.at(-1)?.action).toBe('defer');
    expect(feedback.cursor).toBeGreaterThan(before.cursor);
    const closed = await closeAnnotationPreview(s.server.session);
    expect(closed.state).toBe('closed');
    expect(closed.running).toBe(false);
    expect((await getAnnotationFeedback(s.server.session, feedback.cursor)).events).toEqual([]);
    expect(readFileSync(s.file, 'utf8')).toContain('deferred');
  });

  it('starts a detached preview that survives the opening call and can be stopped', async () => {
    const s = await seed();
    await s.server.close();
    const opened = await openAnnotationPreview(s.file, { port: 0, local: true });
    try {
      expect(opened.pid).not.toBe(process.pid);
      expect((await getAnnotationPreviewStatus(opened.session)).running).toBe(true);
    } finally {
      expect((await closeAnnotationPreview(opened.session)).state).toBe('closed');
    }
  });

  it('supports keyboard review, publication parity, conflict recovery, reload and mobile without executing source', async () => {
    expect(existsSync(chromium.executablePath()), 'Managed Chromium is required for the workbench browser contract').toBe(true);
    const s = await seed();
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1240, height: 820 } });
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(s.server.localUrl);
      await page.getByRole('button', { name: /diffusion.*definition/i }).click();
      expect(await page.locator('#document-title').textContent()).toBe('lesson');
      await page.getByRole('textbox', { name: 'Annotation text' }).fill('Discard this local edit.');
      await page.getByRole('button', { name: 'Discard text edits', exact: true }).click();
      expect(await page.getByRole('textbox', { name: 'Annotation text' }).inputValue()).toBe('Particles spread through random motion.');
      await page.getByRole('textbox', { name: 'Annotation text' }).fill('A local draft survives conflict.');
      await page.getByRole('button', { name: 'Accept', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Save your text before accepting' }).waitFor();
      expect(inspectAnnotationFile(s.file).annotations[0].state).toBe('draft');
      const external = findCandidates(s.file, { quote: 'particles' });
      proposeAnnotations(s.file, [{ id: 'particles', kind: 'highlight', candidate: external.candidates[0].id }], { expectedRevision: external.revision });
      await page.getByRole('button', { name: 'Save text' }).click();
      await page.getByRole('alert').filter({ hasText: 'Your text is preserved' }).waitFor();
      expect(await page.getByRole('textbox', { name: 'Annotation text' }).inputValue()).toBe('A local draft survives conflict.');
      await page.getByRole('button', { name: 'Review settings', exact: true }).click();
      await page.getByRole('button', { name: 'Reload source', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Your unsaved text is preserved' }).waitFor();
      expect(await page.getByRole('textbox', { name: 'Annotation text' }).inputValue()).toBe('A local draft survives conflict.');
      await page.getByRole('textbox', { name: 'Annotation text' }).fill('<img src=x onerror="window.bad=true">');
      await page.getByRole('button', { name: 'Save text' }).click();
      await page.getByRole('button', { name: 'Accept', exact: true }).click();
      await page.locator('#state-label').filter({ hasText: /^accepted$/ }).waitFor();
      expect(await page.evaluate(() => (globalThis as unknown as { bad?: boolean }).bad)).toBeUndefined();
      await page.getByRole('button', { name: 'Publication', exact: true }).click();
      await page.frameLocator('#publication').getByRole('note').waitFor();
      expect(await page.locator('#publication').getAttribute('sandbox')).toBe('');
      expect(await page.locator('#publication').getAttribute('srcdoc')).toBe(compileAnnotations(s.file).html.replaceAll('href="#','href="about:srcdoc#'));
      expect(await page.frameLocator('#publication').locator('img').count()).toBe(0);
      await page.reload();
      await page.getByRole('button', { name: /diffusion.*definition/i }).click();
      expect(await page.getByRole('textbox', { name: 'Annotation text' }).inputValue()).toContain('<img');
      await page.getByRole('button', { name: 'Reject', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.locator('#state-label').filter({ hasText: /^rejected$/ }).waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => {
        const view = globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number };
        return view.document.documentElement.scrollWidth <= view.innerWidth;
      })).toBe(true);
      expect(errors).toEqual([]);
    } finally { await browser.close(); }
  }, 60_000);

  it('shows previously reviewed definitions and context, and conflicts before approving unseen source changes', async () => {
    const s = await seed({ concepts: true });
    const located = findCandidates(s.file, { quote: 'Diffusion' });
    proposeAnnotations(s.file, [{ id: 'shared-diffusion', kind: 'vocabulary', candidate: located.candidates[0].id, concept: 'diffusion' }], { expectedRevision: located.revision });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(s.server.localUrl);
      await page.getByRole('button', { name: /diffusion.*vocabulary/i }).click();
      await page.getByText('Add annotation text',{exact:true}).click();
      expect(await page.getByRole('textbox', { name: 'Annotation text' }).inputValue()).toBe('');
      await page.getByRole('button', { name: /diffusion.*definition/i }).click();
      await page.getByRole('button', { name: 'Accept', exact: true }).click();
      await page.locator('#state-label').filter({ hasText: /^accepted$/ }).waitFor();
      const approved = inspectAnnotationFile(s.file);
      const registry = JSON.parse(readFileSync(s.concepts!, 'utf8'));
      registry.concepts[0].definition = 'A revised shared definition.';
      writeFileSync(s.concepts!, JSON.stringify(registry));
      writeFileSync(s.source, readFileSync(s.source, 'utf8').replace('A second paragraph preserves context.', 'A revised second paragraph changes the context.'));
      await page.getByRole('button', { name: 'Accept', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'changed elsewhere' }).waitFor();
      const changed = inspectAnnotationFile(s.file);
      expect(changed.annotations[0].state).toBe('stale');
      expect(changed.sidecar.history).toHaveLength(approved.sidecar.history.length);
      await page.getByRole('button', { name: 'Review settings', exact: true }).click();
      await page.getByRole('button', { name: 'Reload source', exact: true }).click();
      await page.locator('#state-label').filter({ hasText: /^stale$/ }).waitFor();
      expect(await page.getByRole('region', { name: 'Changes since review' }).count()).toBe(1);
      expect(await page.locator('#change-list').textContent()).toContain('definition or concept changed');
      expect(await page.locator('#change-list').textContent()).toContain('reviewed context changed');
      expect(await page.locator('#reviewed-concept-definition').textContent()).toBe('Net spreading through random particle motion.');
      expect(await page.locator('#current-concept-definition').textContent()).toBe('A revised shared definition.');
      await page.getByText('Previously approved source and passage', { exact: true }).click();
      expect(await page.locator('#reviewed-quote').textContent()).toBe('Diffusion');
      expect(await page.locator('#reviewed-context').textContent()).toContain('A second paragraph preserves context.');
      expect(await page.locator('#context').textContent()).toContain('A revised second paragraph changes the context.');
      await page.getByRole('button', { name: 'Accept', exact: true }).click();
      await page.locator('#state-label').filter({ hasText: /^accepted$/ }).waitFor();
      expect(inspectAnnotationFile(s.file).annotations[0].review.snapshot?.concept).toMatchObject({ definition: 'A revised shared definition.' });
    } finally { await browser.close(); }
  }, 60_000);
});
