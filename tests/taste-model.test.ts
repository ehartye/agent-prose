import { describe, expect, it } from 'vitest';
import { FEATURES } from '../src/owner/features.ts';
import type { Verdict } from '../src/owner/verdicts.ts';
import { DIM, PROJECT_LAYER_MIN, VOICE_LAYER_MIN, buildPairs, fitBT, fitLayered, pWin, rank, standardErrors, utility } from '../src/taste/model.ts';

/** Small seeded generator (mulberry32): the tests are deterministic. */
function rng(seed: number) {
  let a = seed >>> 0;
  const uniform = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
  return { uniform, vec: () => Array.from({ length: DIM }, gauss) };
}

const unit = (i: number, v = 1) => Array.from({ length: DIM }, (_, k) => (k === i ? v : 0));
const idx = (name: typeof FEATURES[number]) => FEATURES.indexOf(name);

function row(kind: Verdict['kind'], a: number[], b: number[], extra: Partial<Verdict> = {}): Verdict {
  return {
    schema: 'prose/verdict@2', features: 'v1', at: '2026-01-01T00:00:00.000Z', project: '/p', set: 's', setUid: 'uid-12345678', kind, form: 'speech-small',
    register: null, voices: [], winner: { index: 1, x: a }, loser: { index: 2, x: b }, weight: 1, tags: [], shown: [1, 2], n: 2, ...extra,
  };
}
const duel = (a: number[], b: number[], extra: Partial<Verdict> = {}) => row('duel', a, b, extra);

/** A hidden-preference owner: noisy logistic choices on the weights `truth`. */
function owner(seed: number, truth: number[]) {
  const r = rng(seed);
  return {
    duels(n: number, extra: Partial<Verdict> = {}): Verdict[] {
      return Array.from({ length: n }, () => {
        const a = r.vec(), b = r.vec();
        const z = truth.reduce((s, w, i) => s + w * (a[i] - b[i]), 0);
        const aWins = r.uniform() < 1 / (1 + Math.exp(-z));
        return aWins ? duel(a, b, extra) : duel(b, a, extra);
      });
    },
  };
}

const TRUTH = [0, -1.2, 0, 0, 0, 0.9, 0, 0, 0, 0, 0.6, 0]; // shorter sentences, more contractions, more "you"

describe('fitBT', () => {
  it('recovers known weights from seeded synthetic duels', () => {
    const m = fitBT(owner(1, TRUTH).duels(800));
    // Tolerance 0.3 per weight: with 800 logistic pairs on unit-variance features the standard error is about 0.1, so 0.3 is about three standard errors (the seeded run's largest error is 0.17), and the L2 prior (lambda 1) shrinks by at most ~0.05 here.
    m.w.forEach((w, i) => expect(Math.abs(w - TRUTH[i]), `weight ${FEATURES[i]}`).toBeLessThan(0.3));
    for (const i of [idx('sentence'), idx('contractions'), idx('secondPerson')]) expect(Math.sign(m.w[i])).toBe(Math.sign(TRUTH[i]));
    expect(m.n).toBe(800);
  });

  it('is the neutral prior with no data, with a wide covariance', () => {
    const m = fitBT([]);
    expect(m.w).toEqual(new Array(DIM).fill(0));
    expect(m.n).toBe(0);
    expect(standardErrors(m).every(s => s >= 0.9)).toBe(true);
    expect(utility(m, unit(0)).u).toBe(0);
  });

  it('ignores ties, whatever their number', () => {
    const rows = owner(2, TRUTH).duels(60);
    const r = rng(9);
    const ties = Array.from({ length: 50 }, () => row('tie', r.vec(), r.vec()));
    expect(fitBT([...rows, ...ties]).w).toEqual(fitBT(rows).w);
    expect(buildPairs(ties)).toEqual([]);
  });

  it('builds pairs as the spec table says', () => {
    const a = unit(0, 2), b = unit(1, 3);
    expect(buildPairs([row('pick', a, b, { weight: 0.5, n: 3 })])).toEqual([{ d: a.map((v, i) => v - b[i]), w: 0.5 }]);
    expect(buildPairs([duel(a, b)])).toEqual([{ d: a.map((v, i) => v - b[i]), w: 1 }]);
    // bothBad: each shown variant loses to the zero vector, half a judgement each
    const bad = buildPairs([row('bothBad', a, b)]);
    expect(bad).toHaveLength(2);
    expect(bad.map(p => p.w)).toEqual([0.5, 0.5]);
    expect(bad[0].d).toEqual(a.map(v => 0 - v));
    expect(bad[1].d).toEqual(b.map(v => 0 - v));
  });

  it('reads bothBad as "both lose to the centre": the shared direction is disliked', () => {
    // Both rejected variants are long; the zero vector (the owner's centre) beats them, so length gets a negative weight.
    const long = unit(idx('length'), 1);
    const m = fitBT(Array.from({ length: 12 }, () => row('bothBad', long, unit(idx('length'), 2))));
    expect(m.w[idx('length')]).toBeLessThan(-0.5);
    expect(m.w.every(Number.isFinite)).toBe(true);
  });

  it('weighs a pick loser by the weight in the row', () => {
    const heavy = fitBT([row('pick', unit(0), unit(1), { weight: 1 })]);
    const light = fitBT([row('pick', unit(0), unit(1), { weight: 0.25 })]);
    expect(Math.abs(heavy.w[0])).toBeGreaterThan(Math.abs(light.w[0]));
  });

  it('gives no NaN on degenerate input', () => {
    const same = new Array(DIM).fill(1);
    const m = fitBT(Array.from({ length: 30 }, () => duel(same, same)));
    expect(m.w.every(Number.isFinite)).toBe(true);
    expect(m.cov.flat().every(Number.isFinite)).toBe(true);
    const nan = fitBT([duel(unit(0, NaN), unit(1)), duel(unit(0, Infinity), unit(1))]);
    expect(nan.w.every(Number.isFinite)).toBe(true);
    expect(nan.cov.flat().every(Number.isFinite)).toBe(true);
    expect(nan.n).toBe(0);
    // perfectly separable data (an owner who always picks the same side) stays finite thanks to the prior
    const sep = fitBT(Array.from({ length: 40 }, () => duel(unit(0, 1), unit(0, -1))));
    expect(sep.w.every(Number.isFinite)).toBe(true);
  });

  it('predicts held-out duels and ranks by utility with an uncertainty', () => {
    const m = fitBT(owner(3, TRUTH).duels(300));
    const short = unit(idx('sentence'), -1), long = unit(idx('sentence'), 1);
    expect(pWin(m, short, long)).toBeGreaterThan(0.8);
    const ranked = rank(m, [{ index: 1, x: long }, { index: 2, x: short }, { index: 3, x: unit(idx('hedges'), 0) }]);
    expect(ranked.map(r => r.index)).toEqual([2, 3, 1]);
    expect(ranked.every(r => r.sigma >= 0 && Number.isFinite(r.u))).toBe(true);
  });
});

describe('fitLayered', () => {
  const GLOBAL = TRUTH;
  const OPPOSITE = TRUTH.map(w => -w);

  it('is unusable with no pairs and neutral', () => {
    const m = fitLayered({ globalRows: [], projectRows: [] });
    expect(m.usable).toBe(false);
    expect(m.n).toBe(0);
    expect(m.layers).toEqual([{ name: 'global', pairs: 0 }]);
    expect(m.w).toEqual(new Array(DIM).fill(0));
  });

  it('is unusable when only ties were logged', () => {
    const r = rng(4);
    const ties = Array.from({ length: 40 }, () => row('tie', r.vec(), r.vec()));
    const m = fitLayered({ globalRows: ties, projectRows: ties });
    expect(m.usable).toBe(false);
    expect(m.layers.map(l => l.name)).toEqual(['global']);
  });

  it('is usable from global data alone', () => {
    const m = fitLayered({ globalRows: owner(5, GLOBAL).duels(100), projectRows: [] });
    expect(m.usable).toBe(true);
    expect(m.layers).toEqual([{ name: 'global', pairs: 100 }]);
  });

  it('engages the project layer at exactly 15 pairs and not at 14', () => {
    expect(PROJECT_LAYER_MIN).toBe(15);
    const globalRows = owner(6, GLOBAL).duels(100);
    const at = (n: number) => fitLayered({ globalRows, projectRows: owner(7, OPPOSITE).duels(n) });
    expect(at(14).layers.map(l => l.name)).toEqual(['global']);
    expect(at(15).layers).toEqual([{ name: 'global', pairs: 100 }, { name: 'project', pairs: 15 }]);
    expect(at(14).w).toEqual(fitLayered({ globalRows, projectRows: [] }).w);
  });

  it('counts both bothBad halves as pairs toward the threshold', () => {
    const r = rng(8);
    const rows = Array.from({ length: 8 }, () => row('bothBad', r.vec(), r.vec())); // 16 pairs
    expect(fitLayered({ globalRows: [], projectRows: rows }).layers.map(l => l.name)).toEqual(['global', 'project']);
  });

  it('shrinks a small project fit toward the global weights', () => {
    const globalRows = owner(10, GLOBAL).duels(400);
    const projectRows = owner(11, OPPOSITE).duels(20);
    const g = fitBT(globalRows);
    const projectOnly = fitBT(projectRows, { lambda: 1 });
    const layered = fitLayered({ globalRows, projectRows });
    const k = idx('sentence'); // largest-magnitude weight, truth -1.2 globally, +1.2 in the project
    expect(layered.w[k]).toBeGreaterThan(g.w[k]);          // moved toward the project...
    expect(layered.w[k]).toBeLessThan(projectOnly.w[k]);   // ...but stays between the two
    expect(layered.w[k]).toBeLessThan(0.4);                // and the global direction still dominates with only 20 pairs
    const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
    expect(dist(layered.w, g.w)).toBeLessThan(dist(projectOnly.w, g.w));
  });

  it('follows the project once it has plenty of data', () => {
    const layered = fitLayered({ globalRows: owner(12, GLOBAL).duels(200), projectRows: owner(13, OPPOSITE).duels(500) });
    expect(layered.w[idx('sentence')]).toBeGreaterThan(0.6);
    expect(layered.layers.at(-1)).toEqual({ name: 'project', pairs: 500 });
  });

  it('engages the voice layer at exactly 15 pairs and not at 14, shrinking toward the project layer', () => {
    expect(VOICE_LAYER_MIN).toBe(15);
    const globalRows = owner(14, GLOBAL).duels(100);
    const projectRows = owner(15, GLOBAL).duels(100);
    const at = (n: number) => fitLayered({ globalRows, projectRows, voiceRows: owner(16, OPPOSITE).duels(n) });
    expect(at(14).layers.map(l => l.name)).toEqual(['global', 'project']);
    expect(at(15).layers).toEqual([{ name: 'global', pairs: 100 }, { name: 'project', pairs: 100 }, { name: 'voice', pairs: 15 }]);
    const project = fitLayered({ globalRows, projectRows });
    const voiceOnly = fitBT(owner(16, OPPOSITE).duels(15), { lambda: 1 });
    const k = idx('sentence');
    expect(at(15).w[k]).toBeGreaterThan(project.w[k]);
    expect(at(15).w[k]).toBeLessThan(voiceOnly.w[k]);
  });

  it('skips the voice layer when the project layer did not engage', () => {
    const m = fitLayered({ globalRows: [], projectRows: owner(17, GLOBAL).duels(10), voiceRows: owner(18, GLOBAL).duels(20) });
    expect(m.layers.map(l => l.name)).toEqual(['global']);
  });

  it('reports usable when only the project has data', () => {
    const m = fitLayered({ globalRows: [], projectRows: owner(19, GLOBAL).duels(30) });
    expect(m.usable).toBe(true);
    expect(m.layers.map(l => l.name)).toEqual(['global', 'project']);
  });

  it('never returns NaN for identical vectors in every layer', () => {
    const same = new Array(DIM).fill(2);
    const rows = Array.from({ length: 30 }, () => duel(same, same));
    const m = fitLayered({ globalRows: rows, projectRows: rows, voiceRows: rows });
    expect(m.w.every(Number.isFinite)).toBe(true);
    expect(m.cov.flat().every(Number.isFinite)).toBe(true);
    expect(m.usable).toBe(false);
  });

  it('fits 2,000 rows quickly', () => {
    const rows = owner(20, TRUTH).duels(2000);
    const t0 = performance.now();
    const m = fitLayered({ globalRows: rows, projectRows: rows.slice(0, 500) });
    const ms = performance.now() - t0;
    // Measured about 16 ms for the two layers on this machine (Node 24); the 1 s bound is loose so a slow CI runner does not flake.
    expect(ms).toBeLessThan(1000);
    expect(m.usable).toBe(true);
  });
});
