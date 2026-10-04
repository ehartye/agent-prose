import { describe, expect, it } from 'vitest';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { sessionDir } from '../src/owner/paths.ts';
import {
  appendEvent, checkTransition, CLIENT_EVENTS, EventSchema, foldSession, nextPair, openSession, readEvents,
  readEventsDetailed, readReveal, readSession, writeReveal, type Session, type StoredEvent,
} from '../src/reading/session.ts';
import { tmpProject, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
useTempHome();

const HASH = 'a'.repeat(64);
const cand = (index: number, round = 0) => ({ index, name: `v${index}`, direction: index === 1 ? 'punchier' : null, round, ...(round > 0 ? { hash: 'a'.repeat(64) } : {}) });
const baseSession = (): Session => ({
  schema: 'prose/session@1', id: 'read-1', setId: 'set-1', project: '/p', form: 'speech-small', register: null, prompt: 'p',
  createdAt: '2026-10-03T00:00:00.000Z', shown: [1, 2, 3], hashes: { 1: HASH, 2: HASH, 3: HASH }, target: { minutes: 3 }, wpm: 150,
  candidates: [cand(1), cand(2), cand(3)],
});
let seq = 0;
const ev = (e: Record<string, unknown>): StoredEvent => ({ ...e, at: '2026-10-03T00:00:00.000Z', seq: ++seq }) as StoredEvent;
const lineup = (kept: number[], duds: number[] = []) => ev({ type: 'lineup', kept, duds, order: [1, 2, 3] });
const duel = (a: number, b: number, outcome: string) => ev({ type: 'duel', a, b, outcome, position: 'ab', eventId: `e${++seq}` });
const refine = (champion: number) => ev({ type: 'refine', champion, directions: [], like: null });
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };
const fold = (...events: StoredEvent[]) => foldSession(baseSession(), events);

describe('foldSession', () => {
  it('starts in the lineup stage', () => {
    const s = fold();
    expect(s.stage).toBe('lineup');
    expect(s.lineup).toEqual([1, 2, 3]);
    expect(s.champion).toBeNull();
  });

  it('moves to duel with the kept variants as shortlist', () => {
    const s = fold(lineup([1, 3], [2]));
    expect(s).toMatchObject({ stage: 'duel', kept: [1, 3], duds: [2], shortlist: [1, 3], champion: 1 });
  });

  it('keeps every variant not marked dud when none are marked kept', () => {
    expect(fold(lineup([], [2])).shortlist).toEqual([1, 3]);
  });

  it('goes straight to refine when only one variant is kept', () => {
    expect(fold(lineup([2], [1, 3]))).toMatchObject({ stage: 'refine', champion: 2 });
  });

  it('scores duels, with ties scoring nothing and bothBad scoring both down', () => {
    let s = fold(lineup([1, 2, 3]), duel(1, 2, 'tie'));
    expect(s).toMatchObject({ stage: 'duel', champion: 1 });
    s = fold(lineup([1, 2, 3]), duel(1, 2, 'bothBad'), duel(1, 3, 'a'));
    expect(s.champion).toBe(1); // 1: -1 +1 = 0, 3: -1, 2: -1
    s = fold(lineup([1, 2, 3]), duel(1, 2, 'b'), duel(1, 3, 'bothBad'));
    expect(s.champion).toBe(2); // 2: +1, 1: -2, 3: -1
    expect(s.duels).toHaveLength(2);
  });

  it('breaks score ties by shortlist order', () => {
    expect(fold(lineup([3, 1, 2]), duel(3, 1, 'tie')).champion).toBe(3);
  });

  it('moves to refine when every pair has been asked, and picks the champion by score', () => {
    const s = fold(lineup([1, 2, 3]), duel(1, 2, 'b'), duel(2, 3, 'a'), duel(1, 3, 'b'));
    expect(s).toMatchObject({ stage: 'refine', champion: 2 });
  });

  it('waits after a refine and starts a pinned lineup on a round (there is no failure event: nothing emitted one)', () => {
    const toRefine = [lineup([1, 2]), duel(1, 2, 'b')];
    let s = fold(...toRefine, ev({ type: 'refine', champion: 2, directions: ['warmer'], like: 1 }));
    expect(s).toMatchObject({ stage: 'waiting', pendingRefine: { champion: 2, directions: ['warmer'], like: 1 } });
    expect(s).not.toHaveProperty('lastError');
    expect(EventSchema.safeParse({ type: 'refineFailed', message: 'no' }).success).toBe(false);
    s = fold(...toRefine, refine(2), ev({ type: 'round', n: 1, setId: 'set-2', candidates: [cand(4, 1), cand(5, 1)] }));
    expect(s).toMatchObject({ stage: 'lineup', round: 1, lineup: [2, 4, 5], kept: [], shortlist: [], duels: [], champion: 2 });
    expect(s.candidates.map(c => c.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('pins the champion into the shortlist after round 0', () => {
    const s = fold(lineup([1, 2]), duel(1, 2, 'b'), refine(2),
      ev({ type: 'round', n: 1, setId: 'set-2', candidates: [cand(4, 1), cand(5, 1)] }),
      lineup([5], [4]));
    expect(s).toMatchObject({ stage: 'duel', shortlist: [2, 5], champion: 2 });
  });

  it('ends at ship and ignores later events', () => {
    const s = fold(lineup([1, 2]), ev({ type: 'ship', champion: 1 }), duel(1, 2, 'b'), ev({ type: 'abandon' }));
    expect(s).toMatchObject({ stage: 'shipped', shipped: 1, champion: 1 });
    expect(s.duels).toEqual([]);
  });

  it('ends at abandon and ignores later events', () => {
    const s = fold(ev({ type: 'abandon' }), lineup([1]), ev({ type: 'ship', champion: 1 }));
    expect(s).toMatchObject({ stage: 'abandoned', shipped: null });
  });

  it('records notes and peeks without changing the stage', () => {
    for (const events of [[], [lineup([1, 2])], [lineup([1])]]) {
      const before = fold(...events);
      const after = fold(...events, ev({ type: 'note', index: 2, unit: 1, text: 'cut' }), ev({ type: 'peek', index: 1 }), ev({ type: 'play', index: 3, mode: 'speech' }));
      expect(after.stage).toBe(before.stage);
      expect(after.notes).toEqual([{ index: 2, unit: 1, text: 'cut', round: 0 }]);
      expect(after.peeked).toEqual([1]);
      expect(after.events).toBe(events.length + 3);
    }
  });
});

describe('checkTransition', () => {
  const accept = (events: StoredEvent[], e: Record<string, unknown>) => checkTransition(fold(...events), EventSchema.parse(e));
  const play = { type: 'play', index: 1, mode: 'speech' };

  it('requires the lineup before a duel, and a duel only between shortlist members', () => {
    const d = { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab', eventId: 'x' };
    expect(code(() => accept([], d))).toBe('E_CONFLICT');
    const l = [lineup([1, 2], [3])];
    expect(accept(l, d)).toMatchObject({ type: 'duel' });
    expect(code(() => accept(l, { ...d, b: 3 }))).toBe('E_CONFLICT');
    expect(code(() => accept(l, { ...d, b: 9 }))).toBe('E_SCHEMA');
    expect(code(() => accept(l, { ...d, b: 1 }))).toBe('E_CONFLICT');
  });

  it('refuses a pair that was already asked, in either order', () => {
    const l = [lineup([1, 2, 3]), duel(1, 2, 'a')];
    expect(code(() => accept(l, { type: 'duel', a: 2, b: 1, outcome: 'b', position: 'ba', eventId: 'y' }))).toBe('E_CONFLICT');
    expect(code(() => accept(l, { type: 'duel', a: 1, b: 3, outcome: 'b', position: 'ba', eventId: 'y' }))).toBe('none');
  });

  it('accepts a lineup only in the lineup stage', () => {
    expect(accept([], { type: 'lineup', kept: [1], duds: [], order: [1, 2, 3] })).toMatchObject({ type: 'lineup' });
    expect(code(() => accept([lineup([1, 2])], { type: 'lineup', kept: [1], duds: [], order: [] }))).toBe('E_CONFLICT');
  });

  it('normalises lineup marks: outside indexes dropped, duplicates removed, order completed', () => {
    const e = accept([], { type: 'lineup', kept: [2, 2, 9, 1], duds: [3, 3, 7], order: [3, 3, 1, 8] });
    expect(e).toMatchObject({ kept: [2, 1], duds: [3], order: [3, 1, 2] });
  });

  it('refuses marking one variant both kept and dud, and a round 0 lineup that keeps nothing', () => {
    expect(code(() => accept([], { type: 'lineup', kept: [1], duds: [1], order: [] }))).toBe('E_CONFLICT');
    expect(code(() => accept([], { type: 'lineup', kept: [], duds: [1, 2, 3], order: [] }))).toBe('E_CONFLICT');
  });

  it('accepts refine only from the refine stage, with the champion or a shortlist member', () => {
    const r = { type: 'refine', champion: 1, directions: ['warmer'], like: null };
    expect(code(() => accept([], r))).toBe('E_CONFLICT');
    expect(code(() => accept([lineup([1, 2])], r))).toBe('E_CONFLICT');
    expect(code(() => accept([lineup([1])], r))).toBe('none');
    expect(code(() => accept([lineup([1])], { ...r, champion: 3 }))).toBe('E_CONFLICT');
  });

  it('accepts ship only from duel or refine, with a champion that exists', () => {
    const s = { type: 'ship', champion: 1 };
    expect(code(() => accept([], s))).toBe('E_CONFLICT');
    expect(code(() => accept([lineup([1, 2])], s))).toBe('none');
    expect(code(() => accept([lineup([1, 2])], { type: 'ship', champion: 3 }))).toBe('E_CONFLICT');
    expect(code(() => accept([lineup([1]), refine(1)], s))).toBe('E_CONFLICT');
  });

  it('accepts round only while waiting', () => {
    const waiting = [lineup([1]), refine(1)];
    const round = { type: 'round', n: 1, setId: 'set-2', candidates: [cand(4, 1)] };
    expect(code(() => accept(waiting, round))).toBe('none');
    expect(code(() => accept(waiting, { ...round, n: 2 }))).toBe('E_CONFLICT');
    expect(code(() => accept(waiting, { ...round, candidates: [cand(3, 1)] }))).toBe('E_CONFLICT');
    expect(code(() => accept([lineup([1])], round))).toBe('E_CONFLICT');
  });

  it('accepts play, note, peek and abandon in every open stage, and nothing after ship or abandon', () => {
    const note = { type: 'note', index: 1, unit: 0, text: 'hi' };
    const peek = { type: 'peek', index: 1 };
    for (const events of [[], [lineup([1, 2])], [lineup([1])], [lineup([1]), refine(1)]]) {
      for (const e of [play, note, peek, { type: 'abandon' }]) expect(code(() => accept(events, e))).toBe('none');
    }
    for (const done of [[ev({ type: 'ship', champion: 1 })], [lineup([1, 2]), ev({ type: 'ship', champion: 1 })], [ev({ type: 'abandon' })]]) {
      for (const e of [play, note, peek, { type: 'abandon' }, { type: 'lineup', kept: [1], duds: [], order: [] }, { type: 'ship', champion: 1 }]) {
        expect(code(() => accept(done, e))).toBe('E_CONFLICT');
      }
    }
  });

  it('rejects an unknown candidate in a play, note or peek', () => {
    expect(code(() => accept([], { type: 'play', index: 9, mode: 'speech' }))).toBe('E_SCHEMA');
    expect(code(() => accept([], { type: 'note', index: 9, unit: 0, text: 'x' }))).toBe('E_SCHEMA');
    expect(code(() => accept([], { type: 'peek', index: 9 }))).toBe('E_SCHEMA');
  });

  it('carries a hint on conflicts', () => {
    try { accept([], { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab', eventId: 'x' }); expect.unreachable(); }
    catch (e) { expect((e as ProseError).hint).toBeTruthy(); }
  });
});

describe('EventSchema', () => {
  it('limits note text, directions and outcomes, and knows the client events', () => {
    expect(EventSchema.safeParse({ type: 'note', index: 1, unit: 0, text: 'x'.repeat(501) }).success).toBe(false);
    expect(EventSchema.safeParse({ type: 'note', index: 1, unit: 0, text: 'x'.repeat(500) }).success).toBe(true);
    const r = (directions: string[]) => EventSchema.safeParse({ type: 'refine', champion: 1, directions, like: null }).success;
    expect(r(['warmer', 'drier', 'plainer', 'shorter'])).toBe(true);
    expect(r(['warmer', 'drier', 'plainer', 'shorter', 'longer'])).toBe(false);
    expect(r(['louder'])).toBe(false);
    expect(EventSchema.safeParse({ type: 'duel', a: 1, b: 2, outcome: 'c', position: 'ab', eventId: 'x' }).success).toBe(false);
    expect([...CLIENT_EVENTS].sort()).toEqual(['abandon', 'duel', 'lineup', 'none', 'note', 'peek', 'play', 'refine', 'ship']);
  });
});

describe('nextPair', () => {
  it('is deterministic and never repeats a pair, then returns null', () => {
    const events: StoredEvent[] = [lineup([1, 2, 3])];
    const asked: string[] = [];
    for (;;) {
      const s = fold(...events);
      expect(nextPair(s)).toEqual(nextPair(fold(...events)));
      const p = nextPair(s);
      if (!p) break;
      const key = [...p].sort().join('-');
      expect(asked).not.toContain(key);
      asked.push(key);
      events.push(duel(p[0], p[1], 'a'));
    }
    expect(asked.sort()).toEqual(['1-2', '1-3', '2-3']);
    expect(nextPair(fold(...events))).toBeNull();
  });

  it('prefers the least-compared members, and is null outside the duel stage', () => {
    expect(nextPair(fold())).toBeNull();
    expect(nextPair(fold(lineup([1])))).toBeNull();
    expect(nextPair(fold(lineup([1, 2, 3])))).toEqual([1, 2]);
    // 1 and 2 have been compared once each, 3 not at all: the next pair involves 3 and the earlier-listed member
    expect(nextPair(fold(lineup([1, 2, 3]), duel(1, 2, 'a')))).toEqual([1, 3]);
  });
});

describe('session files', () => {
  const input = () => {
    const { candidates, shown, hashes, form, register, prompt, setId, target, wpm } = baseSession();
    return { candidates, shown, hashes, form, register, prompt, setId, target, wpm };
  };

  it('opens a session under .agent-prose/sessions/<id>, readable back', () => {
    const { project } = tmpProject();
    const s = openSession(project, { ...input(), id: 'read-1' });
    expect(s).toMatchObject({ schema: 'prose/session@1', id: 'read-1', project });
    expect(existsSync(join(sessionDir(project, 'read-1'), 'session.json'))).toBe(true);
    expect(readSession(project, 'read-1')).toEqual(s);
    expect(readEvents(project, 'read-1')).toEqual([]);
    expect(code(() => openSession(project, { ...input(), id: 'read-1' }))).toBe('E_CONFLICT');
    expect(openSession(project, input()).id).toMatch(/^session-\d{8}-\d{4}-[0-9a-f]{4}$/);
  });

  it('validates ids and reports a missing session', () => {
    const { project } = tmpProject();
    for (const bad of ['../x', 'A', 'a/b', '', 'con', '-x']) {
      expect(code(() => readSession(project, bad))).toBe('E_USAGE');
      expect(code(() => appendEvent(project, bad, { type: 'abandon' }))).toBe('E_USAGE');
    }
    expect(code(() => readSession(project, 'nope'))).toBe('E_NOT_FOUND');
    expect(code(() => appendEvent(project, 'nope', { type: 'abandon' }))).toBe('E_NOT_FOUND');
    expect(code(() => openSession(project, { ...input(), id: 'Bad Id' }))).toBe('E_USAGE');
  });

  it('appends one stamped line per event, folding the log to check each transition', () => {
    const { project } = tmpProject();
    openSession(project, { ...input(), id: 'read-1' });
    const a = appendEvent(project, 'read-1', { type: 'lineup', kept: [1, 2], duds: [3], order: [2, 1, 3] });
    expect(a).toMatchObject({ type: 'lineup', seq: 1, kept: [1, 2] });
    expect(Date.parse(a.at)).not.toBeNaN();
    expect(code(() => appendEvent(project, 'read-1', { type: 'lineup', kept: [1], duds: [], order: [] }))).toBe('E_CONFLICT');
    expect(code(() => appendEvent(project, 'read-1', { type: 'bogus' }))).toBe('E_SCHEMA');
    const b = appendEvent(project, 'read-1', { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab', eventId: 'e1' });
    expect(b.seq).toBe(2);
    const file = join(sessionDir(project, 'read-1'), 'events.jsonl');
    expect(readFileSync(file, 'utf8').trimEnd().split('\n')).toHaveLength(2);
    expect(readEvents(project, 'read-1')).toEqual([a, b]);
    appendEvent(project, 'read-1', { type: 'ship', champion: 1 });
    expect(code(() => appendEvent(project, 'read-1', { type: 'play', index: 1, mode: 'x' }))).toBe('E_CONFLICT');
    expect(readEvents(project, 'read-1')).toHaveLength(3);
  });

  it('tolerates garbage lines, skips them and counts them', () => {
    const { project } = tmpProject();
    openSession(project, { ...input(), id: 'read-1' });
    appendEvent(project, 'read-1', { type: 'play', index: 1, mode: 'x' });
    const file = join(sessionDir(project, 'read-1'), 'events.jsonl');
    appendFileSync(file, [
      'not json', '{"type":"play"}', '{"type":"abandon","at":"x"}', '[1]', '',
      '{"type":"play","index":2,"mode":"x","at":"2026-10-03T00:00:00.000Z","seq":9}', '{"type":"pl',
    ].join('\n'));
    const r = readEventsDetailed(project, 'read-1');
    expect(r.events.map(e => e.seq)).toEqual([1, 9]);
    expect(r.skipped).toBe(5);
    expect(readEvents(project, 'read-1')).toEqual(r.events);
    // a torn last line does not corrupt the next append, and seq continues after the highest seen
    const next = appendEvent(project, 'read-1', { type: 'play', index: 3, mode: 'x' });
    expect(next.seq).toBe(10);
    expect(readEventsDetailed(project, 'read-1').events.at(-1)).toEqual(next);
  });

  it('writes and reads reveal.json atomically', () => {
    const { project } = tmpProject();
    openSession(project, { ...input(), id: 'read-1' });
    expect(readReveal(project, 'read-1')).toBeNull();
    writeReveal(project, 'read-1', { champion: 2, matched: true });
    expect(readReveal(project, 'read-1')).toEqual({ champion: 2, matched: true });
  });

  it('never loses or duplicates an event across two concurrent processes', async () => {
    const { project } = tmpProject();
    openSession(project, { ...input(), id: 'read-1' });
    const N = 15;
    const helper = join(import.meta.dirname, 'session-appender.mjs');
    const runOne = (index: number) => new Promise<number>(resolve => {
      const p = spawn(process.execPath, [helper, project, 'read-1', String(N), String(index)], { stdio: 'pipe', env: process.env });
      let err = '';
      p.stderr.on('data', d => { err += d; });
      p.on('close', c => { if (c) console.error(err); resolve(c ?? 1); });
    });
    expect(await Promise.all([runOne(1), runOne(2)])).toEqual([0, 0]);
    const r = readEventsDetailed(project, 'read-1');
    expect(r.skipped).toBe(0);
    expect(r.events).toHaveLength(2 * N);
    expect(r.events.map(e => e.seq)).toEqual(Array.from({ length: 2 * N }, (_, k) => k + 1));
    expect(r.events.filter(e => e.type === 'play' && e.index === 1)).toHaveLength(N);
    expect(r.events.filter(e => e.type === 'play' && e.index === 2)).toHaveLength(N);
  }, 60_000);
});
