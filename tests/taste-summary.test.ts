import { describe, expect, it } from 'vitest';
import { FEATURES } from '../src/owner/features.ts';
import type { Model } from '../src/taste/model.ts';
import { summarize } from '../src/taste/summary.ts';

const DIM = FEATURES.length;
const counts = { skippedVersion: 0, malformed: 0, unknownVersion: 0, rows: 40 };

/** A model with the given weights and standard errors per feature (a diagonal covariance). */
function model(w: Partial<Record<typeof FEATURES[number], number>>, se: Partial<Record<typeof FEATURES[number], number>> = {}, over: Partial<Model> = {}): Model {
  const ws = FEATURES.map(f => w[f] ?? 0);
  const cov = FEATURES.map((f, i) => Array.from({ length: DIM }, (_, j) => (i === j ? (se[f] ?? 1) ** 2 : 0)));
  return { w: ws, cov, n: 40, layers: [{ name: 'global', pairs: 40 }], usable: true, ...over };
}

describe('summarize', () => {
  it('uses the right word for each sign of each feature', () => {
    const pos = summarize(model(Object.fromEntries(FEATURES.map(f => [f, 1])), Object.fromEntries(FEATURES.map(f => [f, 0.1]))), counts);
    const neg = summarize(model(Object.fromEntries(FEATURES.map(f => [f, -1])), Object.fromEntries(FEATURES.map(f => [f, 0.1]))), counts);
    const words = (s: typeof pos) => Object.fromEntries(s.preferences.map(p => [p.feature, p.words]));
    expect(words(pos)).toEqual({
      length: 'longer', sentence: 'longer sentences', rhythm: 'more varied sentence rhythm', wordLen: 'longer words', variety: 'richer vocabulary',
      contractions: 'more contractions', hedges: 'more hedging', passive: 'more passive voice', exclaim: 'more exclamations', question: 'more questions',
      secondPerson: 'more direct address ("you")', nominal: 'more noun-heavy phrasing',
    });
    expect(words(neg)).toEqual({
      length: 'shorter', sentence: 'shorter sentences', rhythm: 'more even rhythm', wordLen: 'shorter words', variety: 'more repetition',
      contractions: 'fewer contractions', hedges: 'less hedging', passive: 'less passive voice', exclaim: 'fewer exclamations', question: 'fewer questions',
      secondPerson: 'less direct address', nominal: 'plainer verbs',
    });
  });

  it('classifies confidence at |w|/se above 2 (strong), above 1 (weak), else unknown, and orders by it', () => {
    const s = summarize(model(
      { sentence: -1, contractions: 0.5, hedges: 0.3, passive: 2, exclaim: 0.1 },
      { sentence: 0.4, contractions: 0.3, hedges: 0.3, passive: 1, exclaim: 1 },
    ), counts);
    const by = Object.fromEntries(s.preferences.map(p => [p.feature, p]));
    expect(by.sentence.confidence).toBe('strong');   // z 2.5
    expect(by.contractions.confidence).toBe('weak'); // z 1.67
    expect(by.hedges.confidence).toBe('unknown');    // z exactly 1 is not above 1
    expect(by.passive.confidence).toBe('weak');      // z exactly 2 is not above 2
    expect(s.preferences.map(p => p.confidence)).toEqual([...s.preferences.map(p => p.confidence)].sort((a, b) => ['strong', 'weak', 'unknown'].indexOf(a) - ['strong', 'weak', 'unknown'].indexOf(b)));
    expect(s.preferences[0].feature).toBe('sentence');
    expect(s.preferences).toHaveLength(DIM);
  });

  it('breaks ties inside a confidence level by |w|/se, largest first', () => {
    const s = summarize(model({ length: -3, wordLen: 5 }, { length: 1, wordLen: 1 }), counts);
    expect(s.preferences.slice(0, 2).map(p => p.feature)).toEqual(['wordLen', 'length']);
  });

  it('writes the profile as markdown with layers, pair counts and the not-rules sentence', () => {
    const s = summarize(model({ sentence: -1.5, contractions: 1 }, { sentence: 0.3, contractions: 0.3 }, {
      layers: [{ name: 'global', pairs: 120 }, { name: 'project', pairs: 30 }, { name: 'voice', pairs: 16 }], n: 16,
    }), counts);
    expect(s.enough).toBe(true);
    expect(s.markdown).toContain('shorter sentences');
    expect(s.markdown).toContain('more contractions');
    expect(s.markdown).toMatch(/global[^\n]*120/);
    expect(s.markdown).toMatch(/project[^\n]*30/);
    expect(s.markdown).toMatch(/voice[^\n]*16/);
    expect(s.markdown).toMatch(/tendencies in the owner's choices/);
    expect(s.markdown).toMatch(/not rules/);
    expect(s.markdown).toMatch(/nothing about quality/);
    expect(s.markdown).not.toMatch(/NaN|undefined/);
  });

  it('says plainly when there is not enough data (unusable model)', () => {
    const s = summarize(model({}, {}, { usable: false, n: 0, layers: [{ name: 'global', pairs: 0 }] }), { ...counts, rows: 0 });
    expect(s.enough).toBe(false);
    expect(s.markdown).toMatch(/not enough judgements yet/i);
    expect(s.markdown).not.toMatch(/Prefers/);
    expect(s.preferences.every(p => p.confidence === 'unknown')).toBe(true);
  });

  it('says it is not enough when the model is usable but nothing rises above unknown', () => {
    const s = summarize(model({ sentence: 0.1 }, { sentence: 1 }), counts);
    expect(s.enough).toBe(false);
    expect(s.markdown).toMatch(/not enough judgements yet/i);
    expect(s.markdown).toMatch(/tendencies/); // the caveat is always present
  });

  it('reports skipped and malformed rows when there are any', () => {
    const s = summarize(model({ sentence: -1 }, { sentence: 0.2 }), { skippedVersion: 3, malformed: 2, unknownVersion: 1, rows: 40 });
    expect(s.markdown).toMatch(/3[^\n]*another feature version/i);
    expect(s.markdown).toMatch(/2[^\n]*unreadable/i);
    expect(s.markdown).toMatch(/1[^\n]*newer/i);
  });

  it('rounds weights and survives a degenerate covariance without NaN', () => {
    const m = model({ sentence: -1.23456 }, { sentence: 0.1234 });
    m.cov[3][3] = 0; m.cov[4][4] = -1;
    const s = summarize(m, counts);
    expect(s.preferences.find(p => p.feature === 'sentence')).toMatchObject({ weight: -1.235, se: 0.123 });
    expect(JSON.stringify(s)).not.toMatch(/NaN|null/);
  });
});
