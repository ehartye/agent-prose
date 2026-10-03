import { describe, expect, it } from 'vitest';
import { DIM, type Model } from '../src/taste/model.ts';
import { nextDuel } from '../src/taste/select.ts';
import { foldSession, nextPair, type Session, type StoredEvent } from '../src/reading/session.ts';

const unit = (i: number, v: number) => Array.from({ length: DIM }, (_, k) => (k === i ? v : 0));
const identity = (s: number) => Array.from({ length: DIM }, (_, i) => Array.from({ length: DIM }, (_, j) => (i === j ? s : 0)));
/** A hand-built model that cares about feature 0 only: w0 = 2, a small isotropic covariance. */
const model: Model = { w: unit(0, 2), cov: identity(0.1), n: 40, layers: [{ name: 'global', pairs: 40 }], usable: true };

// 1 and 2 are far apart on the preferred feature (the model is near-certain which wins), 2 and 3 are nearly tied.
const cands = [{ index: 1, x: unit(0, 0) }, { index: 2, x: unit(0, 3) }, { index: 3, x: unit(0, 3.05) }];

describe('nextDuel', () => {
  it('asks the uncertain pair, not the near-certain ones', () => {
    expect(nextDuel(cands, model, [])).toEqual([2, 3]);
  });

  it('is deterministic', () => {
    expect(nextDuel(cands, model, [])).toEqual(nextDuel([...cands], model, []));
  });

  it('skips a pair already asked, in either order', () => {
    const a = nextDuel(cands, model, [{ a: 2, b: 3 }]);
    expect(a).not.toEqual([2, 3]);
    expect(nextDuel(cands, model, [{ a: 3, b: 2 }])).toEqual(a);
  });

  it('returns the pair in canonical order, lower index first, whatever the candidate order', () => {
    expect(nextDuel([cands[2], cands[1], cands[0]], model, [])).toEqual([2, 3]);
  });

  it('breaks exact ties by the lowest index pair', () => {
    const same = [1, 2, 3].map(index => ({ index, x: unit(0, 1) }));
    expect(nextDuel(same, model, [])).toEqual([1, 2]);
  });

  it('returns null when every pair has been asked, or with fewer than two candidates', () => {
    expect(nextDuel(cands, model, [{ a: 1, b: 2 }, { a: 3, b: 1 }, { a: 2, b: 3 }])).toBeNull();
    expect(nextDuel([cands[0]], model, [])).toBeNull();
    expect(nextDuel([], model, [])).toBeNull();
  });

  it('prefers a more uncertain pair when the models agree on p (sigma term)', () => {
    const wide: Model = { ...model, cov: identity(0.1).map((r, i) => r.map((v, j) => (i === 5 && j === 5 ? 4 : v))) };
    // both pairs are exact coin flips on feature 0; only the second differs on the poorly known feature 5
    const c = [{ index: 1, x: unit(0, 0) }, { index: 2, x: unit(0, 0) }, { index: 3, x: unit(5, 1) }];
    expect(nextDuel(c, wide, [{ a: 1, b: 2 }])).toEqual([1, 3]);
  });
});

const HASH = 'a'.repeat(64);
const session = (): Session => ({
  schema: 'prose/session@1', id: 'read-1', setId: 's', project: '/p', form: 'speech-small', register: null, prompt: 'p',
  createdAt: '2026-10-03T00:00:00.000Z', shown: [1, 2, 3], hashes: { 1: HASH, 2: HASH, 3: HASH }, target: null, wpm: null,
  candidates: [1, 2, 3].map(index => ({ index, name: `v${index}`, direction: null, round: 0 })),
});
let seq = 0;
const ev = (e: Record<string, unknown>): StoredEvent => ({ ...e, at: '2026-10-03T00:00:00.000Z', seq: ++seq }) as StoredEvent;
const lineup = () => ev({ type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3] });
const duel = (a: number, b: number) => ev({ type: 'duel', a, b, outcome: 'a', position: 'ab', eventId: `e${++seq}` });
const fold = (...events: StoredEvent[]) => foldSession(session(), events);

describe('nextPair with a chooser', () => {
  const s = () => fold(lineup());
  it('runs the existing rule with no chooser', () => {
    expect(nextPair(s())).toEqual([1, 2]);
  });
  it('uses the chooser\'s pair, handing it the shortlist and the asked pairs', () => {
    let seen: unknown;
    const state = fold(lineup(), duel(1, 2));
    expect(nextPair(state, (shortlist, asked) => { seen = { shortlist, asked }; return [2, 3]; })).toEqual([2, 3]);
    expect(seen).toEqual({ shortlist: [1, 2, 3], asked: [{ a: 1, b: 2 }] });
  });
  it('falls back to the existing rule when the chooser returns null', () => {
    expect(nextPair(s(), () => null)).toEqual([1, 2]);
  });
  it('falls back when the chooser throws', () => {
    expect(nextPair(s(), () => { throw new Error('boom'); })).toEqual([1, 2]);
  });
  it('falls back when the chooser names a pair that is not on the shortlist', () => {
    const state = fold(ev({ type: 'lineup', kept: [1, 2], duds: [3], order: [1, 2, 3] }));
    expect(nextPair(state, () => [1, 3])).toEqual([1, 2]);
    expect(nextPair(state, () => [1, 1])).toEqual([1, 2]);
  });
  it('falls back when the chooser names a pair already asked, in either order', () => {
    const state = fold(lineup(), duel(1, 2));
    expect(nextPair(state, () => [2, 1])).toEqual([1, 3]);
    expect(nextPair(state, () => [1, 2])).toEqual([1, 3]);
  });
  it('is null outside the duel stage whatever the chooser says', () => {
    expect(nextPair(fold(), () => [1, 2])).toBeNull();
  });
});
