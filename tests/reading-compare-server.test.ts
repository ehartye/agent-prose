import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadingServer, SERVER_API } from '../src/reading/server.ts';
import { snapshotOriginal } from '../src/owner/original.ts';
import { textHash, writePrediction } from '../src/owner/prediction.ts';
import { basePath, createSet, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { appendEvent, openSession } from '../src/reading/session.ts';
import { PUNCHY, SHORT, WARM, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';
import { startServer, http, seed, variantFile } from './reading-helpers.ts';

useTmp();
useTempHome();
const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });
const get = async (s: { project: string }, id = 'read-1') => (await http((await startServer(servers, { projects: [s.project] })).info, `/api/session/${id}`)).body;

const header = '---\nform: speech-small\n---\n\n';
const sentence = (i: number, tag = '') => `Sentence ${i} ${tag}talks about the harbour and number ${i} of the long list.`;
/** A project whose draft has `lines` sentences (one per paragraph) and whose `count` variants each rewrite different ones. */
function seedMany(count: number, lines: number, over: { original?: string } = {}) {
  const p = tmpProject();
  const body = (tag: string, change: (i: number) => boolean) => header + Array.from({ length: lines }, (_, i) => (change(i) ? sentence(i, tag) : sentence(i))).join('\n\n') + '\n';
  const draft = p.write('many.md', body('', () => false));
  const set = createSet(p.project, draft, { id: 'many', count });
  set.variants.forEach((v, k) => writeFileSync(variantPath(p.project, set, v), body(`v${k + 1} `, i => i % count === k)));
  if (over.original) writeSet(p.project, { ...readSet(p.project, 'many'), original: snapshotOriginal('many.md', readFileSync(draft, 'utf8'), 'markdown', 'speech-small', over.original) });
  const prediction = writePrediction(p.project, readSet(p.project, 'many'), { pick: 1, shortlist: [2], why: 'x' });
  openSession(p.project, {
    id: 'read-1', setId: 'many', form: 'speech-small', register: null, prompt: '', shown: prediction.shown, hashes: prediction.hashes, target: null, wpm: null,
    candidates: set.variants.map(v => ({ index: v.index, name: `v${v.index}`, direction: v.direction, round: 0 })),
  });
  return { ...p, set };
}
const variantKeys = (compare: any) => [...new Set(compare.rows.flatMap((r: any) => Object.keys(r.cells ?? {})))].sort();

describe('compare in the session payload', () => {
  it('the queue routes took the API level to 5 (the compare payload alone did not change it)', () => { expect(SERVER_API).toBe(5); });

  it('has rows keyed by candidate index in the lineup, without a Current column when the set has no original', async () => {
    const s = seed();
    const c = (await get(s)).compare;
    expect(c.hasCurrent).toBe(false);
    expect(variantKeys(c)).toEqual(['1', '2', '3']);
    expect(c.rows.find((r: any) => r.base === 0).cur).toMatchObject({ unit: 0 });
  });

  it('has a Current column when the set has an original, and Current holds the base text', async () => {
    const s = seedMany(3, 8, { original: '5' });
    const c = (await get(s)).compare;
    expect(c.hasCurrent).toBe(true);
    expect(c.rows).toHaveLength(8);
    expect(c.rows.map((r: any) => r.cur.text)).toEqual(Array.from({ length: 8 }, (_, i) => sentence(i)));
  });

  it('keeps unchanged rows as one `same` cell and gives changed rows ops only for the variants that changed', async () => {
    const s = seedMany(3, 9);
    const c = (await get(s)).compare;
    const same = c.rows.filter((r: any) => r.same);
    expect(same).toHaveLength(0); // every row is rewritten by one variant or another
    const row = c.rows.find((r: any) => r.base === 1);
    expect(Object.keys(row.cells)).toEqual(['2']);
    expect(row.cells['2'].ops.some(([k]: [string]) => k === '+')).toBe(true);
  });

  it('marks rows no variant touched as same, with no per-variant cells', async () => {
    const s = seedMany(3, 9);
    const base = readFileSync(basePath(s.project, s.set), 'utf8');
    // a fresh session over variants that change only the first sentence
    const set = createSet(s.project, join(s.project, 'many.md'), { id: 'few', count: 3 });
    set.variants.forEach((v, k) => writeFileSync(variantPath(s.project, set, v), base.replace('Sentence 0 ', `Sentence 0 changed${k} `)));
    const hashes = Object.fromEntries(set.variants.map(v => [String(v.index), textHash(readFileSync(variantPath(s.project, set, v), 'utf8'))]));
    openSession(s.project, { id: 'read-2', setId: 'few', form: 'speech-small', register: null, prompt: '', shown: [1, 2, 3], hashes, target: null, wpm: null, predicted: false,
      candidates: set.variants.map(v => ({ index: v.index, name: `v${v.index}`, direction: v.direction, round: 0 })) });
    const c = (await get(s, 'read-2')).compare;
    expect(c.rows.filter((r: any) => r.same)).toHaveLength(8);
    expect(c.rows.filter((r: any) => r.same).every((r: any) => r.cells === undefined && r.cur.text.length > 0)).toBe(true);
    expect(c.rows[0].same).toBeUndefined();
  });

  it('only exists in the lineup stage', async () => {
    const s = seed();
    appendEvent(s.project, 'read-1', { type: 'lineup', kept: [1, 2], duds: [3], order: [1, 2, 3] });
    expect((await get(s)).compare).toBeNull();
  });

  it('is null when a shown variant changed after it was sealed, so the page shows cards with the existing words', async () => {
    const s = seed();
    writeFileSync(variantFile(s, 2), `${WARM} Edited after sealing.`);
    const p = await get(s);
    expect(p.compare).toBeNull();
    expect(p.candidates.find((c: any) => c.index === 2).changed).toBe(true);
  });

  it('is null when the base text is gone, and the rest of the payload still loads', async () => {
    const s = seed();
    rmSync(basePath(s.project, s.set));
    const p = await get(s);
    expect(p.compare).toBeNull();
    expect(p.candidates).toHaveLength(3);
  });

  it('in a later round holds the pinned champion beside the new drafts', async () => {
    const s = seed();
    appendEvent(s.project, 'read-1', { type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3] });
    [[1, 2, 'b'], [2, 3, 'a'], [1, 3, 'a']].forEach(([a, b, outcome], k) => appendEvent(s.project, 'read-1', { type: 'duel', a: a as number, b: b as number, outcome: outcome as 'a' | 'b', position: 'ab', eventId: `d${k}` }));
    appendEvent(s.project, 'read-1', { type: 'refine', champion: 2, directions: [], like: null });
    const next = createSet(s.project, join(s.project, 't.md'), { id: 'next', count: 3 });
    [SHORT.replace('We built', 'We forged'), WARM.replace('you know', 'friends'), PUNCHY.replace('Nobody', 'No one')].forEach((text, k) => writeFileSync(variantPath(s.project, next, next.variants[k]), text));
    const candidates = next.variants.map(v => ({ index: v.index + 3, variant: v.index, name: `n${v.index}`, direction: v.direction, round: 1, hash: textHash(readFileSync(variantPath(s.project, next, v), 'utf8')) }));
    appendEvent(s.project, 'read-1', { type: 'round', n: 1, setId: 'next', candidates });
    const p = await get(s);
    expect(p.state.stage).toBe('lineup');
    expect(variantKeys(p.compare)).toEqual(['2', '4', '5', '6']);
  });

  it('is remembered: a second poll reads no variant file again and answers the same', async () => {
    const s = seed();
    const { server, info } = await startServer(servers, { projects: [s.project] });
    const a = (await http(info, '/api/session/read-1')).body.compare;
    const reads = server.reads.variants;
    const b = (await http(info, '/api/session/read-1')).body.compare;
    expect(server.reads.variants).toBe(reads);
    expect(b).toEqual(a);
  });

  it('answers again when a variant file is edited back to what was sealed, and is null while it differs', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    const original = readFileSync(variantFile(s, 3), 'utf8');
    writeFileSync(variantFile(s, 3), `${original} Extra.`);
    expect((await http(info, '/api/session/read-1')).body.compare).toBeNull();
    writeFileSync(variantFile(s, 3), original);
    expect((await http(info, '/api/session/read-1')).body.compare).not.toBeNull();
  });

  it('six variants of a 200-sentence draft: a small payload', async () => {
    const s = seedMany(6, 200);
    const r = await http((await startServer(servers, { projects: [s.project] })).info, '/api/session/read-1');
    expect(r.body.compare.rows).toHaveLength(200);
    expect(JSON.stringify(r.body.compare).length).toBeLessThan(150_000);
    expect(r.text.length).toBeLessThan(600_000);
  });

  it('leaves draft text as text: a tag in a variant comes back as typed', async () => {
    const p = tmpProject();
    const draft = p.write('d.md', `${header}One line here. Another line here.\n`);
    const set = createSet(p.project, draft, { id: 'tags', count: 3 });
    const texts = [`${header}One line here. <img src=x onerror=alert(1)> Another line here.\n`, `${header}One line here. Another line.\n`, `${header}Zero. Another line here.\n`];
    set.variants.forEach((v, k) => writeFileSync(variantPath(p.project, set, v), texts[k]));
    const hashes = Object.fromEntries(set.variants.map(v => [String(v.index), textHash(readFileSync(variantPath(p.project, set, v), 'utf8'))]));
    openSession(p.project, { id: 'read-1', setId: 'tags', form: 'speech-small', register: null, prompt: '', shown: [1, 2, 3], hashes, target: null, wpm: null, predicted: false,
      candidates: set.variants.map(v => ({ index: v.index, name: `v${v.index}`, direction: v.direction, round: 0 })) });
    const c = (await get(p)).compare;
    expect(JSON.stringify(c)).toContain('<img src=x onerror=alert(1)>');
    expect(c.rows.flatMap((r: any) => Object.values(r.cells ?? {})).filter(Boolean).every((cell: any) => typeof cell.text === 'string')).toBe(true);
  });
});
