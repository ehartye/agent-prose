import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { ReadingServer } from '../src/reading/server.ts';
import { snapshotOriginal } from '../src/owner/original.ts';
import { createSet, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { appendEvent } from '../src/reading/session.ts';
import { textHash } from '../src/owner/prediction.ts';
import { PUNCHY, SHORT, WARM, useTempHome, useTmp } from './owner-helpers.ts';
import { startServer, http, projectRows, seed, type Seed } from './reading-helpers.ts';
import { run } from './helpers.ts';

useTmp();
useTempHome();
const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });

/** The seeded set gets an `original` for the draft's line 5 (the seed draft is SHORT: header on lines 1-3, one paragraph on 5). */
function withOriginal(s: Seed, lines = '5') {
  const text = readFileSync(join(s.project, 't.md'), 'utf8');
  writeSet(s.project, { ...readSet(s.project, 'demo'), original: snapshotOriginal('t.md', text, 'markdown', 'speech-small', lines) });
}
const payload = async (s: Seed) => (await http((await startServer(servers, { projects: [s.project] })).info, '/api/session/read-1')).body;

function toRefine(s: Seed) {
  appendEvent(s.project, 'read-1', { type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3] });
  [[1, 2, 'b'], [2, 3, 'a'], [1, 3, 'a']].forEach(([a, b, outcome], k) => appendEvent(s.project, 'read-1', { type: 'duel', a: a as number, b: b as number, outcome: outcome as 'a' | 'b', position: 'ab', eventId: `d${k}` }));
  appendEvent(s.project, 'read-1', { type: 'refine', champion: 2, directions: [], like: null });
}
function addRound(s: Seed) {
  const next = createSet(s.project, join(s.project, 't.md'), { id: 'next', count: 3 });
  [SHORT.replace('We built', 'We forged'), WARM.replace('you know', 'friends'), PUNCHY.replace('Nobody', 'No one')]
    .forEach((text, k) => writeFileSync(variantPath(s.project, next, next.variants[k]), text));
  const candidates = next.variants.map(v => ({ index: v.index + 3, variant: v.index, name: `n${v.index}`, direction: v.direction, round: 1, hash: textHash(readFileSync(variantPath(s.project, next, v), 'utf8')) }));
  appendEvent(s.project, 'read-1', { type: 'round', n: 1, setId: 'next', candidates });
}

describe('the existing line in the session payload', () => {
  it('is null for a set without an original, so an old session reads as before', async () => {
    const s = seed();
    expect((await payload(s)).session.original).toBeNull();
  });

  it('carries the snapshot with its lines and stale: false', async () => {
    const s = seed();
    withOriginal(s);
    const o = (await payload(s)).session.original;
    expect(o.source).toBe('t.md');
    expect(o.stale).toBe(false);
    expect(o.lines).toHaveLength(1);
    expect(o.lines[0]).toMatchObject({ ref: '5', speaker: null, text: expect.stringContaining('We built the bridge in the rain') });
  });

  it('says stale once the draft changes and fresh again when it is put back, on the next poll', async () => {
    const s = seed();
    withOriginal(s);
    const { info } = await startServer(servers, { projects: [s.project] });
    const read = async () => (await http(info, '/api/session/read-1')).body.session.original.stale;
    expect(await read()).toBe(false);
    const draft = join(s.project, 't.md');
    const before = readFileSync(draft, 'utf8');
    writeFileSync(draft, before + '\nAn added paragraph.\n');
    expect(await read()).toBe(true);
    writeFileSync(draft, before);
    expect(await read()).toBe(false);
  });

  it('a deleted draft is stale, not an error, and the snapshot still shows', async () => {
    const s = seed();
    withOriginal(s);
    rmSync(join(s.project, 't.md'));
    const r = await http((await startServer(servers, { projects: [s.project] })).info, '/api/session/read-1');
    expect(r.status).toBe(200);
    expect(r.body.session.original).toMatchObject({ stale: true, lines: [{ ref: '5' }] });
  });

  it('is never a candidate: the candidates, the order and the pair are what they were', async () => {
    const s = seed();
    const plain = await payload(s);
    withOriginal(s);
    const withIt = await payload(s);
    expect(withIt.candidates.map((c: { index: number }) => c.index)).toEqual(plain.candidates.map((c: { index: number }) => c.index));
    expect(withIt.order.slice().sort()).toEqual([1, 2, 3]);
    expect(withIt.candidates).toHaveLength(3);
  });

  it('a round made from a champion file has no original, and the page still gets the round-0 snapshot', async () => {
    const s = seed();
    withOriginal(s);
    toRefine(s);
    addRound(s);
    expect(readSet(s.project, 'next').original).toBeUndefined();
    const p = await payload(s);
    expect(p.state.round).toBe(1);
    expect(p.session.original.lines[0].ref).toBe('5');
  });

  it('a poll that finds nothing changed adds no draft read', async () => {
    const s = seed();
    withOriginal(s);
    const { server, info } = await startServer(servers, { projects: [s.project] });
    await http(info, '/api/session/read-1');
    const reads = server.reads.drafts;
    expect(reads).toBe(1);
    await http(info, '/api/session/read-1');
    await http(info, '/api/session/read-1');
    expect(server.reads.drafts).toBe(reads);
  });

  it('adds no verdict rows: viewing a revision records nothing', async () => {
    const s = seed();
    withOriginal(s);
    await payload(s);
    expect(projectRows(s.project)).toEqual([]);
  });
});

describe('reading wait hands the agent the original', () => {
  it('a refine request carries the original with stale, null when the set had none', async () => {
    const s = seed();
    withOriginal(s);
    toRefine(s);
    const out = await run('reading', 'wait', '--id', 'read-1', '--dir', s.project, '--timeout', '5');
    expect(out.event).toBe('refine');
    expect(out.original).toEqual({ source: 't.md', lines: [expect.objectContaining({ ref: '5', speaker: null })], stale: false });
    const plain = seed({ id: 'read-1' });
    toRefine(plain);
    expect((await run('reading', 'wait', '--id', 'read-1', '--dir', plain.project, '--timeout', '5')).original).toBeNull();
  });
});

// app.js exposes its pure helpers only when window.__READING_TEST__ is set.
const js = readFileSync(join(import.meta.dirname, '..', 'runtime', 'reading', 'app.js'), 'utf8');
const css = readFileSync(join(import.meta.dirname, '..', 'runtime', 'reading', 'style.css'), 'utf8');
const window: Record<string, any> = { __READING_TEST__: true };
runInNewContext(js, { window, URLSearchParams, Date, Math, console });
const r = window.__reading;
const original = (over: object = {}) => ({ source: 't.md', stale: false, lines: [{ ref: '15', speaker: 'GUARD', text: "Market's that way." }], ...over });

describe('the current line block on the page', () => {
  it('shows each line with its speaker prefix as units do', () => {
    expect(r.originalParts(original()).rows).toEqual(["GUARD: Market's that way."]);
    expect(r.originalParts(original({ lines: [{ ref: '1', speaker: null, text: 'Plain.' }, { ref: '3-4', speaker: 'MAYA', text: 'Two.' }] })).rows).toEqual(['Plain.', 'MAYA: Two.']);
  });

  it('says the draft has changed only when it is stale', () => {
    expect(r.originalParts(original()).note).toBeNull();
    expect(r.originalParts(original({ stale: true })).note).toBe('The draft has changed since this set was made');
  });

  it('shows nothing when there is no original or no lines', () => {
    expect(r.originalParts(null)).toBeNull();
    expect(r.originalParts(undefined)).toBeNull();
    expect(r.originalParts(original({ lines: [] }))).toBeNull();
  });

  it('re-renders when the original appears, changes or goes stale, and the old signature is unchanged without one', () => {
    const p = (o: object | null) => ({ state: { stage: 'lineup', round: 0, events: 3 }, session: { brief: null, original: o } });
    expect(r.signature(p(null))).toBe('lineup|0|3|');
    expect(r.signature({ state: { stage: 'lineup', round: 0, events: 3 }, session: { brief: null } })).toBe('lineup|0|3|');
    expect(r.signature(p(original()))).not.toBe(r.signature(p(null)));
    expect(r.signature(p(original()))).not.toBe(r.signature(p(original({ stale: true }))));
    expect(r.signature(p(original()))).not.toBe(r.signature(p(original({ lines: [{ ref: '15', speaker: 'GUARD', text: 'Changed.' }] }))));
    expect(r.signature(p(original()))).toBe(r.signature(p(original())));
  });

  it('is an open details block, built from text nodes and class names only, with no handlers on the lines', () => {
    expect(js).toContain("'The current line'");
    expect(js).toContain("h('details', { class: 'original', open: ui.originalOpen }");
    const body = js.slice(js.indexOf('function originalBlock')).split(/\n {2}function /)[0];
    expect(body).not.toMatch(/on:|addEventListener\('click'|innerHTML/);
    expect(css).toMatch(/\.original \{/);
    expect(css).toMatch(/\.original \.original-note \{/);
  });

  it('is shown above the variants on every screen: lineup, duel and refine', () => {
    for (const screen of ['lineupScreen', 'duelScreen', 'refineScreen']) {
      const body = js.slice(js.indexOf(`function ${screen}`)).split(/\n {2}function /)[0];
      expect(body, screen).toContain('originalBlock()');
    }
  });

  it('sits before the cards, not between them (duel: above the grid)', () => {
    const duel = js.slice(js.indexOf('function duelScreen')).split(/\n {2}function /)[0];
    expect(duel.indexOf('originalBlock()')).toBeLessThan(duel.indexOf("'duel-grid'"));
    const lineupBody = js.slice(js.indexOf('function lineupScreen')).split(/\n {2}function /)[0];
    expect(lineupBody.indexOf('originalBlock()')).toBeLessThan(lineupBody.indexOf('cards,'));
  });
});
