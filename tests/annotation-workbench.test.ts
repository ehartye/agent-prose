import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { request } from 'node:http';
import { chromium } from 'playwright';
import { annotationWorkbenchPage, annotationWorkbenchScript } from '../src/annotation/workbench-page.ts';
import { startAnnotationPreview, getAnnotationPreviewStatus, getAnnotationFeedback, closeAnnotationPreview, openAnnotationPreview } from '../src/annotation/workbench.ts';
import { createAnnotationFile, findCandidates, proposeAnnotations, inspectAnnotationFile, compileAnnotations } from '../src/annotation/store.ts';
import { tmp, useTmp, useTempHome } from './owner-helpers.ts';

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
  it('provides accessible source, queue and detail panes with all review actions and local assets', () => {
    const page = annotationWorkbenchPage();
    expect(page).toContain('aria-label="Annotation queue"');
    expect(page).toContain('aria-label="Source reading pane"');
    expect(page).toContain('aria-label="Annotation details"');
    expect(page).toContain('script src="/workbench.js"');
    expect(page).not.toMatch(/https?:\/\//);
    for (const action of ['accept', 'reject', 'defer', 'edit', 'retarget', 'undo']) expect(page).toContain(`data-action="${action}"`);
    expect(annotationWorkbenchScript()).not.toContain('eval(');
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
      expect(await page.getByRole('button', { name: 'Discard text edits', exact: true }).count()).toBe(1);
      await page.getByRole('textbox', { name: 'Annotation text' }).fill('Discard this local edit.');
      await page.getByRole('button', { name: 'Discard text edits', exact: true }).click();
      expect(await page.getByRole('textbox', { name: 'Annotation text' }).inputValue()).toBe('Particles spread through random motion.');
      await page.getByRole('textbox', { name: 'Annotation text' }).fill('A local draft survives conflict.');
      await page.getByRole('button', { name: 'Accept', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Save your text before accepting' }).waitFor();
      expect(inspectAnnotationFile(s.file).annotations[0].state).toBe('draft');
      const external = findCandidates(s.file, { quote: 'particles' });
      proposeAnnotations(s.file, [{ id: 'particles', kind: 'highlight', candidate: external.candidates[0].id }], { expectedRevision: external.revision });
      await page.getByRole('button', { name: 'Save text' }).click();
      await page.getByRole('status').filter({ hasText: 'Your text is preserved' }).waitFor();
      expect(await page.getByRole('textbox', { name: 'Annotation text' }).inputValue()).toBe('A local draft survives conflict.');
      await page.getByRole('button', { name: 'Reload source', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Your unsaved text is preserved' }).waitFor();
      expect(await page.getByRole('textbox', { name: 'Annotation text' }).inputValue()).toBe('A local draft survives conflict.');
      await page.getByRole('textbox', { name: 'Annotation text' }).fill('<img src=x onerror="window.bad=true">');
      await page.getByRole('button', { name: 'Save text' }).click();
      await page.getByRole('button', { name: 'Accept', exact: true }).click();
      await page.locator('#state-label').filter({ hasText: /^accepted$/ }).waitFor();
      expect(await page.evaluate(() => (globalThis as unknown as { bad?: boolean }).bad)).toBeUndefined();
      await page.getByRole('button', { name: 'Publication', exact: true }).click();
      await page.frameLocator('#publication').getByRole('note').waitFor();
      expect(await page.locator('#publication').getAttribute('sandbox')).toBe('');
      expect(await page.locator('#publication').getAttribute('srcdoc')).toBe(compileAnnotations(s.file).html);
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
      await page.getByRole('button', { name: /shared-diffusion.*vocabulary/i }).click();
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
      await page.getByRole('status').filter({ hasText: 'changed elsewhere' }).waitFor();
      const changed = inspectAnnotationFile(s.file);
      expect(changed.annotations[0].state).toBe('stale');
      expect(changed.sidecar.history).toHaveLength(approved.sidecar.history.length);
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
