import { afterEach, describe, expect, it } from 'vitest';
import { linkSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadingServer } from '../src/reading/server.ts';
import { tmpProject, useTmp, useTempHome } from './owner-helpers.ts';
import { assessmentCommand, assessmentInput } from './assessment-fixture.ts';
useTmp(); useTempHome();
const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });
async function create(input = assessmentInput()) {
  const p = tmpProject(), file = p.write('assessment-input.json', JSON.stringify(input));
  const source = p.write('source.txt', input.passages[0].text), bytes = readFileSync(source);
  const state = await assessmentCommand(['create', file, '--dir', p.project]);
  return { ...p, file, source, bytes, state };
}
describe('batch passage assessments', () => {
  it('creates and rereads ten independent reports without changing supplied files', async () => {
    await expect(create()).resolves.toMatchObject({ state: { counts: { passages: 10, assessed: 9 } } });
    const s = await create();
    expect(await assessmentCommand(['show', s.state.id, '--dir', s.project])).toEqual(s.state);
    expect(s.state.passages[0].report.criteria).toHaveLength(6);
    expect(s.state.passages[9].report).toBeNull();
    expect(s.state.passages[0].sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(s.source)).toEqual(s.bytes);
    expect(JSON.parse(readFileSync(s.file, 'utf8'))).toEqual(assessmentInput());
  });
  it('rejects a quotation from another passage and duplicate passage identities', async () => {
    const input = assessmentInput(); input.passages[0].report!.criteria[0].evidence = ['An invented quotation.'];
    await expect(create(input)).rejects.toMatchObject({ code: 'E_SCHEMA' });
    const duplicate = assessmentInput(); duplicate.passages[1].id = duplicate.passages[0].id;
    await expect(create(duplicate)).rejects.toMatchObject({ code: 'E_SCHEMA' });
  });
  it('refuses an incomplete rubric and proposed edits with invented before-text', async () => {
    const input = assessmentInput(); input.passages[0].report!.criteria.pop();
    await expect(create(input)).rejects.toMatchObject({ code: 'E_SCHEMA' });
    const edit = assessmentInput(); edit.passages[0].report!.proposals[0].before = 'Not in the source.';
    await expect(create(edit)).rejects.toMatchObject({ code: 'E_SCHEMA' });
  });
  it('detects modified snapshot text and hardlink aliases of stored batches', async () => {
    const s = await create(), file = join(s.project, '.agent-prose', 'assessments', s.state.id + '.json');
    const stored = JSON.parse(readFileSync(file, 'utf8')); stored.passages[0].text += '\nChanged text.';
    writeFileSync(file, JSON.stringify(stored));
    await expect(assessmentCommand(['show', s.state.id, '--dir', s.project])).rejects.toMatchObject({ code: 'E_SCHEMA' });
    const other = await create(), original = join(other.project, '.agent-prose', 'assessments', other.state.id + '.json');
    linkSync(original, join(other.project, 'alias.json'));
    await expect(assessmentCommand(['show', other.state.id, '--dir', other.project])).rejects.toMatchObject({ code: 'E_USAGE' });
  });
  it('refuses symbolic state directories and traversal ids', async () => {
    const s = await create(), p = tmpProject();
    symlinkSync(join(s.project, '.agent-prose', 'assessments'), join(p.project, '.agent-prose', 'assessments'), 'junction');
    const file = p.write('input.json', JSON.stringify(assessmentInput()));
    await expect(assessmentCommand(['create', file, '--dir', p.project])).rejects.toMatchObject({ code: 'E_USAGE' });
    await expect(assessmentCommand(['show', '../source', '--dir', s.project])).rejects.toMatchObject({ code: 'E_USAGE' });
  });
  it('serves the batch only through authenticated read-only routes in the shared shell', async () => {
    const s = await create(), server = new ReadingServer({ host: '127.0.0.1', port: 0, persist: false, projects: [s.project] });
    const info = await server.listen(); servers.push(server); const base = `http://127.0.0.1:${info.port}`;
    const path = `/api/assessment/${s.state.id}`;
    expect((await fetch(base + path)).status).toBe(401);
    expect(await (await fetch(base + path, { headers: { 'x-prose-token': info.token } })).json()).toEqual(s.state);
    expect((await fetch(base + path, { method: 'POST', headers: { 'x-prose-token': info.token } })).status).toBe(405);
    expect(await (await fetch(base + '/a/' + s.state.id)).text()).toContain('data-review-mode="assessment"');
    expect((await fetch(base + '/assessments.js')).status).toBe(200);
  });
});
