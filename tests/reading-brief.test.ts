import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { ReadingServer } from '../src/reading/server.ts';
import { createSet, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { appendEvent } from '../src/reading/session.ts';
import { textHash } from '../src/owner/prediction.ts';
import { PUNCHY, SHORT, WARM, useTempHome, useTmp } from './owner-helpers.ts';
import { startServer, http, seed, type Seed } from './reading-helpers.ts';

useTmp();
useTempHome();
const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });
const payload = async (s: Seed) => (await http((await startServer(servers, { projects: [s.project] })).info, '/api/session/read-1')).body;

/** A second set whose three variants become round 1 of the seeded session; `brief` is that set's brief, if any. */
/** Round 0 played through to the refine stage, where the agent may append a round. */
function toRefine(s: Seed) {
  appendEvent(s.project, 'read-1', { type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3] });
  [[1, 2, 'b'], [2, 3, 'a'], [1, 3, 'a']].forEach(([a, b, outcome], k) => appendEvent(s.project, 'read-1', { type: 'duel', a: a as number, b: b as number, outcome: outcome as 'a' | 'b', position: 'ab', eventId: `d${k}` }));
  appendEvent(s.project, 'read-1', { type: 'refine', champion: 2, directions: [], like: null });
}

function addRound(s: Seed, brief?: { character?: string; context?: string; confirmed?: boolean }) {
  const next = createSet(s.project, join(s.project, 't.md'), { id: 'next', count: 3, ...(brief ? { brief } : {}) });
  [SHORT.replace('We built', 'We forged'), WARM.replace('you know', 'friends'), PUNCHY.replace('Nobody', 'No one')]
    .forEach((text, k) => writeFileSync(variantPath(s.project, next, next.variants[k]), text));
  const candidates = next.variants.map(v => ({ index: v.index + 3, variant: v.index, name: `n${v.index}`, direction: v.direction, round: 1, hash: textHash(readFileSync(variantPath(s.project, next, v), 'utf8')) }));
  appendEvent(s.project, 'read-1', { type: 'round', n: 1, setId: 'next', candidates });
}

describe('the brief in the session payload', () => {
  it('is null for a set without a brief, so an old session reads as before', async () => {
    const s = seed();
    expect((await payload(s)).session.brief).toBeNull();
  });

  it('carries the round-0 set brief, confirmed or not', async () => {
    const s = seed();
    writeSet(s.project, { ...readSet(s.project, 'demo'), brief: { character: 'Dry, tired', context: 'Heard at the gate' } });
    expect((await payload(s)).session.brief).toEqual({ character: 'Dry, tired', characterRef: null, context: 'Heard at the gate', confirmed: false });
    writeSet(s.project, { ...readSet(s.project, 'demo'), brief: { character: 'Dry, tired', confirmedAt: '2026-10-04T08:00:00.000Z' } });
    expect((await payload(s)).session.brief).toMatchObject({ character: 'Dry, tired', context: null, confirmed: true });
  });

  it('takes the latest round that has a brief, and falls back to an earlier one', async () => {
    const s = seed();
    writeSet(s.project, { ...readSet(s.project, 'demo'), brief: { character: 'Round zero' } });
    toRefine(s);
    addRound(s);
    expect((await payload(s)).session.brief.character).toBe('Round zero');
    writeSet(s.project, { ...readSet(s.project, 'next'), brief: { character: 'Round one' } });
    expect((await payload(s)).session.brief.character).toBe('Round one');
  });

  it('shows an edit on the next poll without a restart', async () => {
    const s = seed();
    writeSet(s.project, { ...readSet(s.project, 'demo'), brief: { character: 'Before' } });
    const { info } = await startServer(servers, { projects: [s.project] });
    expect((await http(info, '/api/session/read-1')).body.session.brief.character).toBe('Before');
    writeSet(s.project, { ...readSet(s.project, 'demo'), brief: { character: 'After the edit' } });
    expect((await http(info, '/api/session/read-1')).body.session.brief.character).toBe('After the edit');
  });

  it('is null, not an error, when the set cannot be read', async () => {
    const s = seed();
    writeFileSync(join(s.project, '.agent-prose', 'sets', 'demo', 'set.json'), '{ not json');
    const r = await http((await startServer(servers, { projects: [s.project] })).info, '/api/session/read-1');
    expect(r.status).toBe(200);
    expect(r.body.session.brief).toBeNull();
  });
});

// app.js exposes its pure helpers only when window.__READING_TEST__ is set.
const js = readFileSync(join(import.meta.dirname, '..', 'runtime', 'reading', 'app.js'), 'utf8');
const css = readFileSync(join(import.meta.dirname, '..', 'runtime', 'reading', 'style.css'), 'utf8');
const window: Record<string, any> = { __READING_TEST__: true };
runInNewContext(js, { window, URLSearchParams, Date, Math, console });
const r = window.__reading;
const brief = (over: object = {}) => ({ character: 'Dry, tired', characterRef: null, context: 'Heard at the gate', confirmed: true, ...over });

describe('the brief block on the page', () => {
  it('lists a Character and a Context paragraph, leaving out what is missing', () => {
    expect(r.briefParts(brief()).rows).toEqual([{ label: 'Character', text: 'Dry, tired' }, { label: 'Context', text: 'Heard at the gate' }]);
    expect(r.briefParts(brief({ context: null })).rows).toEqual([{ label: 'Character', text: 'Dry, tired' }]);
    expect(r.briefParts(brief({ character: null })).rows).toEqual([{ label: 'Context', text: 'Heard at the gate' }]);
  });

  it('says "Not confirmed with you yet" only for an unconfirmed brief', () => {
    expect(r.briefParts(brief({ confirmed: false })).note).toBe('Not confirmed with you yet');
    expect(r.briefParts(brief()).note).toBeNull();
  });

  it('shows nothing when there is no brief, or one with no text (a reserved characterRef alone)', () => {
    expect(r.briefParts(null)).toBeNull();
    expect(r.briefParts(undefined)).toBeNull();
    expect(r.briefParts(brief({ character: null, context: null, characterRef: 'jane' }))).toBeNull();
  });

  it('re-renders when the brief changes: the render signature includes it', () => {
    const p = (b: object | null) => ({ state: { stage: 'lineup', round: 0, events: 3 }, session: { brief: b } });
    expect(r.signature(p(null))).toBe('lineup|0|3|');
    expect(r.signature(p(brief()))).not.toBe(r.signature(p(null)));
    expect(r.signature(p(brief()))).not.toBe(r.signature(p(brief({ character: 'Warm' }))));
    expect(r.signature(p(brief()))).not.toBe(r.signature(p(brief({ confirmed: false }))));
    expect(r.signature(p(brief()))).toBe(r.signature(p(brief())));
  });

  it('is an open details block with a summary, built from text nodes and class names only', () => {
    expect(js).toContain("'The brief'");
    expect(js).toContain("h('details', { class: 'brief', open: ui.briefOpen }");
    expect(css).toMatch(/\.brief \{/);
    expect(css).toMatch(/\.brief \.brief-note \{/);
  });

  it('is shown on every screen that has variants: lineup, duel and refine', () => {
    for (const screen of ['lineupScreen', 'duelScreen', 'refineScreen']) {
      const body = js.slice(js.indexOf(`function ${screen}`)).split(/\n {2}function /)[0];
      expect(body, screen).toContain('briefBlock()');
    }
  });
});
