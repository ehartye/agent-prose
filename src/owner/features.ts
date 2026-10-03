import type { Doc } from '../ir.ts';
import { PROSE_KINDS } from '../kinds.ts';
import { measureStyle } from '../measure/style.ts';
import { sentences, words } from '../text.ts';

/**
 * FEATURE_ORDER (exported as FEATURES): the twelve feature names, in the order of every stored vector `x`:
 * length, sentence, rhythm, wordLen, variety, contractions, hedges, passive, exclaim, question, secondPerson, nominal.
 * Changing the order or the measurement means bumping FEATURE_SET_ID. tests/owner-feature-pin.test.ts pins the values.
 *
 * Twelve style features. Raw values are in natural units; SCALES convert movement into comparable "scale units"
 * (about one perceptible change). The scales are this plugin's choice, not a source's.
 */
/** Names the feature definitions and scales; bump it when either changes, so old verdicts are not mixed with new ones. */
export const FEATURE_SET_ID = 'v1';

export const FEATURES = ['length', 'sentence', 'rhythm', 'wordLen', 'variety', 'contractions', 'hedges', 'passive', 'exclaim', 'question', 'secondPerson', 'nominal'] as const;
export const FEATURE_ORDER = FEATURES;
export type Feature = typeof FEATURES[number];
export type FeatureVector = Record<Feature, number>;

export const SCALES: FeatureVector = {
  length: 0.5,        // log2 words: 0.5 is a 41% change
  sentence: 0.4,      // log2 mean sentence length
  rhythm: 0.15,       // sentence-length variation (sd / mean)
  wordLen: 0.3,       // mean characters per word
  variety: 1.5,       // types per sqrt(tokens)
  contractions: 10,   // per 1,000 words
  hedges: 5,          // per 1,000 words
  passive: 0.15,      // smoothed share of sentences
  exclaim: 0.15,      // smoothed share of sentences
  question: 0.15,     // smoothed share of sentences
  secondPerson: 10,   // you/your per 1,000 words
  nominal: 1.5,       // nominalizations per 100 words
};

/** Pseudo-counts: a rate is count / (n + prior), so a short draft's rate is pulled toward zero. */
export const PRIOR_WORDS = 100;
export const PRIOR_SENTENCES = 5;

const SECOND = new Set(['you', 'your', 'yours', 'yourself', 'yourselves', "you're", "you've", "you'll", "you'd"]);
const ENDS_EXCLAIM = /!["'”’)\]]*$/;
const ENDS_QUESTION = /\?["'”’)\]]*$/;

export function featureVector(doc: Doc): FeatureVector {
  const prose = doc.blocks.filter(b => PROSE_KINDS.has(b.kind));
  const style = measureStyle(prose);
  const tokens = prose.flatMap(b => words(b.text)).map(w => w.toLowerCase().replaceAll('’', "'"));
  const sents = prose.flatMap(b => sentences(b.text));
  const n = tokens.length;
  const S = sents.length;
  const share = (re: RegExp) => (S ? sents.filter(s => re.test(s)).length / (S + PRIOR_SENTENCES) : 0);
  const perK = (count: number) => (n ? (count * 1000) / (n + PRIOR_WORDS) : 0);
  const mean = style.sentenceLength.mean;
  return {
    length: Math.log2(Math.max(n, 1)),
    sentence: Math.log2(Math.max(mean, 1)),
    rhythm: mean > 0 ? style.sentenceLength.sd / mean : 0,
    wordLen: n ? tokens.reduce((a, t) => a + t.length, 0) / n : 0,
    variety: n ? new Set(tokens).size / Math.sqrt(n) : 0,
    contractions: perK(style.contractions.count),
    hedges: perK(style.hedges.count),
    passive: S ? style.passive.count / (S + PRIOR_SENTENCES) : 0,
    exclaim: share(ENDS_EXCLAIM),
    question: share(ENDS_QUESTION),
    secondPerson: perK(tokens.filter(t => SECOND.has(t)).length),
    nominal: n ? (style.nominalizations.count * 100) / (n + PRIOR_WORDS) : 0,
  };
}

export const toScaledArray = (v: FeatureVector): number[] => FEATURES.map(f => v[f] / SCALES[f]);

/** Scaled vectors with the pool mean removed. They are centred per shown set, so they are relative to the other candidates, not absolute. */
export function centered(vs: FeatureVector[]): number[][] {
  const xs = vs.map(toScaledArray);
  const mean = FEATURES.map((_, i) => xs.reduce((a, x) => a + x[i], 0) / (xs.length || 1));
  return xs.map(x => x.map((c, i) => c - mean[i]));
}

/** Euclidean distance in scale units. */
export function distance(a: FeatureVector, b: FeatureVector): number {
  return Math.sqrt(FEATURES.reduce((s, f) => s + ((a[f] - b[f]) / SCALES[f]) ** 2, 0));
}
