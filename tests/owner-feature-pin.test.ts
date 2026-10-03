import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { FEATURES, featureVector, type FeatureVector } from '../src/owner/features.ts';
import { BASE, tmp, useTmp } from './owner-helpers.ts';

useTmp();

/**
 * These literals pin the feature measurement. If this test fails because you changed measurement (a lexicon, a regex,
 * a scale), bump FEATURE_SET_ID in src/owner/features.ts and update the literals below: old verdict rows then no
 * longer match the new feature set.
 */
const FOUNTAIN = `Title: Pin
Form: tv-drama

INT. HOSPITAL CORRIDOR - NIGHT

Fluorescent lights hum. MAYA (30s) pushes a cart past an empty desk.

MAYA
(under her breath)
Nobody told me the quiet would be the hard part. Why would you ask? You can't stop now! Maybe the decision was made by the administration, perhaps.
`;
const DIALOG = `form: quest-dialog
start: gate
nodes:
  - id: gate
    speaker: GUARD
    text: Halt. State your business at the gate, traveller, before the bell rings twice and the captain wakes.
    choices:
      - text: I'm here to trade.
        to: gate
`;

const load = (name: string, text: string) => {
  const f = join(tmp(), name);
  writeFileSync(f, text);
  return loadDocument(f);
};
const rounded = (v: FeatureVector) => Object.fromEntries(FEATURES.map(f => [f, Math.round(v[f] * 1000) / 1000]));

describe('feature vector pin', () => {
  it('speech paragraph', () => { expect(rounded(featureVector(load('s.md', BASE)))).toEqual({ length: 5.392, sentence: 3.807, rhythm: 0.325, wordLen: 3.905, variety: 5.092, contractions: 0, hedges: 0, passive: 0, exclaim: 0, question: 0, secondPerson: 0, nominal: 0 }); });
  it('Fountain scene', () => { expect(rounded(featureVector(load('s.fountain', FOUNTAIN)))).toEqual({ length: 5.285, sentence: 2.7, rhythm: 0.442, wordLen: 4.333, variety: 5.444, contractions: 7.194, hedges: 7.194, passive: 0.091, exclaim: 0.091, question: 0.091, secondPerson: 14.388, nominal: 1.439 }); });
  it('dialog YAML', () => { expect(rounded(featureVector(load('d.dialog.yaml', DIALOG)))).toEqual({ length: 4.392, sentence: 2.807, rhythm: 0.926, wordLen: 4.476, variety: 4.146, contractions: 8.264, hedges: 0, passive: 0, exclaim: 0, question: 0, secondPerson: 8.264, nominal: 0 }); });
});
