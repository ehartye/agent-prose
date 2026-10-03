import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { FEATURES, SCALES, centered, distance, featureVector, toScaledArray } from '../src/owner/features.ts';
import { tmp, useTmp } from './owner-helpers.ts';

useTmp();
const doc = (body: string) => {
  const f = join(tmp(), 'd.md');
  writeFileSync(f, `---\nform: speech-small\n---\n\n${body}\n`);
  return loadDocument(f);
};

describe('featureVector', () => {
  const v = featureVector(doc("You can't stop now! Why would you? We keep going."));

  it('describes length, rhythm and word shape', () => {
    expect(v.length).toBeCloseTo(Math.log2(10), 5);
    expect(v.sentence).toBeCloseTo(Math.log2(3.33), 2);
    expect(v.wordLen).toBeCloseTo(3.7, 5);
    expect(v.variety).toBeCloseTo(9 / Math.sqrt(10), 5);
  });

  it('measures voice: contractions, you, exclamations, questions', () => {
    expect(v.contractions).toBeCloseTo(1000 / 110, 5);
    expect(v.secondPerson).toBeCloseTo(2000 / 110, 5);
    expect(v.exclaim).toBeCloseTo(1 / 8, 5);
    expect(v.question).toBeCloseTo(1 / 8, 5);
  });

  it('barely moves rates on short text: one contraction in 40 words, one "!" on a one-line joke', () => {
    const para = 'We built the bridge in the rain, in the dark, and in the long months when nobody believed us. It took four years, two floods, and more coffee than the town had ever seen. Today it carries a thousand people a day.';
    const a = featureVector(doc(para));
    const b = featureVector(doc(para.replace('nobody believed', "nobody could've believed")));
    expect(Math.abs(b.contractions - a.contractions) / SCALES.contractions).toBeLessThan(1);
    const joke = 'I told my doctor I broke my arm in two places, and he told me to stop going to those places.';
    const j = featureVector(doc(joke));
    const k = featureVector(doc(joke.replace(/\.$/, '!')));
    expect(Math.abs(k.exclaim - j.exclaim) / SCALES.exclaim).toBeLessThan(1.5);
  });

  it('is all zeros for a draft with no prose', () => {
    const z = featureVector(doc(''));
    for (const f of FEATURES) expect(z[f]).toBe(0);
  });
});

describe('scaling', () => {
  it('has a positive scale for every feature', () => {
    for (const f of FEATURES) expect(SCALES[f]).toBeGreaterThan(0);
  });
  it('centres a pool so each dimension sums to zero', () => {
    const xs = centered([featureVector(doc('One two three.')), featureVector(doc('Four five six seven eight nine.')), featureVector(doc('Ten.'))]);
    for (let i = 0; i < FEATURES.length; i++) expect(xs.reduce((a, x) => a + x[i], 0)).toBeCloseTo(0, 9);
  });
  it('measures distance in scale units, symmetrically', () => {
    const a = featureVector(doc('Short one.'));
    const b = featureVector(doc("We didn't think you would come, but you did, and that's lovely."));
    expect(distance(a, b)).toBeGreaterThan(0);
    expect(distance(a, b)).toBeCloseTo(distance(b, a), 9);
    expect(distance(a, a)).toBe(0);
    expect(toScaledArray(a)).toHaveLength(FEATURES.length);
  });
});
