import { afterEach, describe, expect, it } from 'vitest';
import { linkSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createComparison, readComparison, editComparison, chooseComparison, type ComparisonState } from '../src/comparison.ts';
import { ReadingServer } from '../src/reading/server.ts';
import { buildProgram } from '../src/cli.ts';
import { tmpProject, useTempHome, useTmp } from './owner-helpers.ts';

useTmp(); useTempHome();
const TOKEN = 'comparison-token';
const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });
const header = '---\nreader:\n  language: en-US\n  schoolGrade: 9\n  readingLevel: { scale: us-grade, range: [7, 8] }\n---\n';
function seed() {
  const p = tmpProject(); p.write('source.md', '# Source\n\nThe original source.\n');
  p.write('adaptation.md', header + '\n# Adaptation\n\nA clear explanation.\n');
  p.write('other.md', '# Another\n\nAnother explanation.\n');
  return { ...p, state: createComparison(p.project, 'source.md', ['adaptation.md']) };
}
describe('project-local reading comparisons', () => {
  it('keeps requested reader level separate from unavailable diagnostic and exposes relative paths and parsed prose', () => {
    const s = seed();
    expect(s.state.source).toMatchObject({ id: 'source', path: 'source.md', reader: null, readability: null });
    expect(s.state.variants[0]).toMatchObject({ id: '1', path: 'adaptation.md', label: 'Grades 7–8', reader: { schoolGrade: 9 }, readability: { status: 'insufficient-sample', estimate: null } });
    expect(s.state.variants[0].body).toBe('\n# Adaptation\n\nA clear explanation.\n');
    expect(s.state.variants[0].blocks).toContainEqual(expect.objectContaining({ kind: 'heading', text: 'Adaptation' }));
    expect(s.state).toMatchObject({ sourceChanged: false, choice: null, choiceCurrent: false });
  });
  it('accepts one to three supplied variants and rejects excess, aliases and traversal', () => {
    const s = seed();
    expect(() => createComparison(s.project, 'source.md', [])).toThrow(/one to three/i);
    expect(() => createComparison(s.project, 'source.md', ['adaptation.md', 'other.md', 'adaptation.md', 'other.md'])).toThrow(/one to three/i);
    for (const variants of [['source.md'], ['adaptation.md', 'adaptation.md'], ['../outside.md']]) {
      expect(() => createComparison(s.project, 'source.md', variants)).toThrow();
    }
    linkSync(join(s.project, 'source.md'), join(s.project, 'alias.md'));
    expect(() => createComparison(s.project, 'source.md', ['alias.md'])).toThrow(/distinct/i);
  });
  it('refuses symlinked content and state directories', () => {
    const s = seed(); s.write('real/linked.md', 'A linked explanation.');
    symlinkSync(join(s.project, 'real'), join(s.project, 'linked'), 'junction');
    expect(() => createComparison(s.project, 'source.md', ['linked/linked.md'])).toThrow(/symbolic/i);
    const other = tmpProject(); symlinkSync(join(s.project, '.agent-prose', 'comparisons'), join(other.project, '.agent-prose', 'comparisons'), 'junction');
    other.write('source.md', 'Source'); other.write('a.md', 'Adaptation');
    expect(() => createComparison(other.project, 'source.md', ['a.md'])).toThrow(/symbolic/i);
  });
  it('preserves exact source, frontmatter, BOM and CRLF while editing only a body', async () => {
    const s = seed(); const raw = '\uFEFF' + header.replaceAll('\n', '\r\n') + '\r\nOld body.\r\n';
    writeFileSync(join(s.project, 'adaptation.md'), raw);
    const state = readComparison(s.project, s.state.id); const source = readFileSync(join(s.project, 'source.md'));
    const saved = await editComparison(s.project, state.id, '1', '\nNew body.\n', state.revision);
    expect(readFileSync(join(s.project, 'adaptation.md'), 'utf8')).toBe('\uFEFF' + header.replaceAll('\n', '\r\n') + '\r\nNew body.\r\n');
    expect(readFileSync(join(s.project, 'source.md'))).toEqual(source);
    expect(saved.variants[0].body).toBe('\r\nNew body.\r\n');
    expect(saved.revision).not.toBe(state.revision);
  });
  it('checks every dependency and manifest choice with one compound revision', async () => {
    const s = seed(); const two = createComparison(s.project, 'source.md', ['adaptation.md', 'other.md']);
    writeFileSync(join(s.project, 'other.md'), 'Changed elsewhere.');
    await expect(editComparison(s.project, two.id, '1', 'Do not save.', two.revision)).rejects.toMatchObject({ code: 'E_CONFLICT' });
    const fresh = readComparison(s.project, s.state.id);
    const chosen = await chooseComparison(s.project, fresh.id, '1', fresh.revision);
    await expect(editComparison(s.project, fresh.id, '1', 'Do not save.', fresh.revision)).rejects.toMatchObject({ code: 'E_CONFLICT' });
    expect(chosen.choiceCurrent).toBe(true);
  });
  it('serializes simultaneous revisions so one mutation wins', async () => {
    const s = seed();
    const results = await Promise.allSettled([editComparison(s.project, s.state.id, '1', 'First body.', s.state.revision), editComparison(s.project, s.state.id, '1', 'Second body.', s.state.revision)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  });
  it('keeps a changed choice visible as outdated and blocks writes against a changed source', async () => {
    const s = seed(); const picked = await chooseComparison(s.project, s.state.id, '1', s.state.revision);
    const edited = await editComparison(s.project, picked.id, '1', 'A revised explanation.', picked.revision);
    expect(edited.choice).toEqual(picked.choice); expect(edited.choiceCurrent).toBe(false);
    writeFileSync(join(s.project, 'source.md'), 'The source changed.');
    const changed = readComparison(s.project, picked.id); expect(changed.sourceChanged).toBe(true);
    await expect(chooseComparison(s.project, picked.id, '1', changed.revision)).rejects.toMatchObject({ code: 'E_CONFLICT' });
    await expect(editComparison(s.project, picked.id, '1', 'Do not save.', changed.revision)).rejects.toMatchObject({ code: 'E_CONFLICT' });
  });
  it('cannot inject frontmatter through an editor for a document without metadata', async () => {
    const s = seed(); const state = createComparison(s.project, 'source.md', ['other.md']);
    await expect(editComparison(s.project, state.id, '1', '---\nreader: broken\n---\nBody', state.revision)).rejects.toMatchObject({ code: 'E_SCHEMA' });
    expect(readFileSync(join(s.project, 'other.md'), 'utf8')).toBe('# Another\n\nAnother explanation.\n');
  });
  it('bounds direct edits as well as HTTP payloads', async () => {
    const s = seed();
    await expect(editComparison(s.project, s.state.id, '1', 'é'.repeat(524289), s.state.revision)).rejects.toMatchObject({ code: 'E_USAGE' });
    expect(readComparison(s.project, s.state.id).revision).toBe(s.state.revision);
  });
  it('rejects malformed manifest ids and tampered outside paths', () => {
    const s = seed(); expect(() => readComparison(s.project, '../project')).toThrow();
    const path = join(s.project, '.agent-prose', 'comparisons', s.state.id + '.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8')); manifest.source = '../outside.md'; writeFileSync(path, JSON.stringify(manifest));
    expect(() => readComparison(s.project, s.state.id)).toThrow();
  });
});

describe('comparison transport', () => {
  it('serves shared mode and authenticated relative state; edit and choose return fresh revisions', async () => {
    const s = seed(); const server = new ReadingServer({ host: '127.0.0.1', port: 0, token: TOKEN, persist: false, projects: [s.project] }); servers.push(server);
    const info = await server.listen(); const base = `http://127.0.0.1:${info.port}`; const path = `/api/comparison/${s.state.id}`;
    expect((await fetch(base + path)).status).toBe(401);
    const page = await fetch(base + `/c/${s.state.id}`); expect(page.status).toBe(200); expect(await page.text()).toContain('data-review-mode="comparison"');
    expect((await fetch(base + '/comparisons.js')).status).toBe(200);
    const initial = await (await fetch(base + path, { headers: { 'x-prose-token': TOKEN } })).json() as ComparisonState;
    expect(initial).toEqual(s.state); expect(JSON.stringify(initial)).not.toContain(s.project);
    const post = (route: string, body: object, origin?: string) => fetch(base + path + route, { method: 'POST', headers: { 'x-prose-token': TOKEN, 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
    expect((await post('/choose', { variant: '1', expectedRevision: initial.revision }, 'https://elsewhere.example')).status).toBe(403);
    const saved = await (await post('/edit', { variant: '1', body: 'Edited over HTTP.', expectedRevision: initial.revision })).json() as ComparisonState;
    expect(saved.variants[0].body).toBe('Edited over HTTP.');
    expect((await post('/choose', { variant: '1', expectedRevision: initial.revision })).status).toBe(409);
    const chosen = await (await post('/choose', { variant: '1', expectedRevision: saved.revision })).json() as ComparisonState;
    expect(chosen.choiceCurrent).toBe(true); expect(chosen.choice?.variant).toBe('1');
    expect((await post('/choose', { variant: 'source', expectedRevision: chosen.revision })).status).toBe(400);
  });
  it('registers supplied-file create, show, edit and choose CLI commands', async () => {
    const s = seed(); const output: any[] = []; const command = () => buildProgram({ emit: v => output.push(v) });
    await command().parseAsync(['node', 'prose', 'compare', 'create', 'source.md', 'other.md', '--dir', s.project, '--title', 'Lesson comparison']);
    const created = output.pop(); expect(created.title).toBe('Lesson comparison');
    await command().parseAsync(['node', 'prose', 'compare', 'show', created.id, '--dir', s.project]); expect(output.pop()).toEqual(created);
    const text = s.write('new-body.txt', 'Saved through the CLI.');
    await command().parseAsync(['node', 'prose', 'compare', 'edit', created.id, '1', '--text-file', text, '--revision', created.revision, '--dir', s.project]);
    const edited = output.pop(); expect(edited.variants[0].body).toBe('Saved through the CLI.');
    await command().parseAsync(['node', 'prose', 'compare', 'choose', created.id, '1', '--revision', edited.revision, '--dir', s.project]); expect(output.pop().choiceCurrent).toBe(true);
  });
});
