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

describe('suggestion dispositions', () => {
  const decide = (s: any, state: any, status: string, note?: string, passage = 'p1', suggestion = state.passages[0].report.proposals[0].id ?? 'a'.repeat(64)) => assessmentCommand([
    'disposition', state.id, passage, suggestion, status, '--revision', state.revision ?? '0'.repeat(64), '--dir', s.project,
    ...(note === undefined ? [] : ['--note', note]),
  ]);
  it('saves decisions and notes independently of source/report snapshots, and supports reset', async () => {
    const s = await create(), file = join(s.project, '.agent-prose', 'assessments', s.state.id + '.json'), snapshot = readFileSync(file);
    expect(s.state.passages[0].report.proposals[0].id).toMatch(/^[a-f0-9]{64}$/);
    expect(s.state.reviewCounts).toMatchObject({ total: 9, pending: 9, accepted: 0, rejected: 0, deferred: 0 });
    const accepted = await decide(s, s.state, 'accepted', 'Preserve the qualification.');
    expect(accepted.passages[0].report.proposals[0].decision).toMatchObject({ status: 'accepted', note: 'Preserve the qualification.' });
    expect(accepted.reviewCounts).toMatchObject({ accepted: 1, pending: 8 });
    expect(await assessmentCommand(['show', s.state.id, '--dir', s.project])).toEqual(accepted);
    const rejected = await decide(s, accepted, 'rejected');
    expect(rejected.passages[0].report.proposals[0].decision.note).toBe('Preserve the qualification.');
    const pending = await decide(s, rejected, 'pending', '');
    expect(pending.passages[0].report.proposals[0].decision).toMatchObject({ status: 'pending', note: '' });
    expect(pending.reviewCounts).toMatchObject({ pending: 9, rejected: 0 });
    expect(readFileSync(file)).toEqual(snapshot); expect(readFileSync(s.source)).toEqual(s.bytes);
  });
  it('refuses a proposal from another passage, an unknown proposal and invalid decisions/notes', async () => {
    const s = await create();
    await expect(decide(s, s.state, 'accepted', undefined, 'p2')).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
    await expect(decide(s, s.state, 'accepted', undefined, 'p1', 'a'.repeat(64))).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
    await expect(decide(s, s.state, 'applied')).rejects.toMatchObject({ code: 'E_SCHEMA' });
    await expect(decide(s, s.state, 'accepted', 'x'.repeat(4001))).rejects.toMatchObject({ code: 'E_SCHEMA' });
  });
  it('serializes concurrent decisions and refuses a stale caller instead of losing a decision', async () => {
    const s = await create();
    const results = await Promise.allSettled([decide(s, s.state, 'accepted'), decide(s, s.state, 'rejected')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    const error = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(error.reason).toMatchObject({ code: 'E_CONFLICT' });
    const latest = await assessmentCommand(['show', s.state.id, '--dir', s.project]);
    expect(latest.reviewCounts.pending).toBe(8);
    await expect(decide(s, s.state, 'deferred')).rejects.toMatchObject({ code: 'E_CONFLICT' });
  });
  it('binds decisions to the complete snapshot and refuses hardlink review aliases', async () => {
    const s = await create(); await decide(s, s.state, 'accepted');
    const file = join(s.project, '.agent-prose', 'assessments', s.state.id + '.json');
    const raw = JSON.parse(readFileSync(file, 'utf8')); raw.passages[0].report.summary += ' Changed judgment.';
    writeFileSync(file, JSON.stringify(raw));
    await expect(assessmentCommand(['show', s.state.id, '--dir', s.project])).rejects.toMatchObject({ code: 'E_CONFLICT' });
    const other = await create(); await decide(other, other.state, 'deferred');
    linkSync(join(other.project, '.agent-prose', 'assessments', other.state.id + '.review.json'), join(other.project, 'review-alias.json'));
    await expect(assessmentCommand(['show', other.state.id, '--dir', other.project])).rejects.toMatchObject({ code: 'E_USAGE' });
  });
  it('uses authenticated revision-checked POST transport with the existing origin guard', async () => {
    const s = await create(), server = new ReadingServer({ host: '127.0.0.1', port: 0, persist: false, projects: [s.project] });
    const info = await server.listen(); servers.push(server); const base = `http://127.0.0.1:${info.port}`;
    const path = base + `/api/assessment/${s.state.id}/disposition`;
    const body = { passage: 'p1', suggestion: s.state.passages[0].report.proposals[0].id, status: 'accepted', note: 'Use this.', expectedRevision: s.state.revision };
    const post = (headers = {}) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    expect((await post()).status).toBe(401);
    expect((await post({ 'x-prose-token': info.token, Origin: 'https://elsewhere.example' })).status).toBe(403);
    const saved = await post({ 'x-prose-token': info.token }); expect(saved.status).toBe(200);
    expect((await saved.json() as any).reviewCounts.accepted).toBe(1);
    expect((await post({ 'x-prose-token': info.token })).status).toBe(409);
  });
  it('refuses a present but empty review file instead of showing all suggestions as unreviewed', async () => {
    const s = await create(); await decide(s, s.state, 'accepted');
    writeFileSync(join(s.project, '.agent-prose', 'assessments', s.state.id + '.review.json'), '');
    await expect(assessmentCommand(['show', s.state.id, '--dir', s.project])).rejects.toMatchObject({ code: 'E_SCHEMA' });
  });
});
