import { ProseError } from '../errors.ts';
import { distance, SCALES, type Feature, type FeatureVector } from './features.ts';

/**
 * Direction → signed weights on style features. These are PROXIES: they check that a rewrite moved in measured
 * style (shorter sentences, more contractions...), never that it is funnier, warmer or better.
 * `drier` measures exclamations and questions only; `weirder` measures changed style character (distance from the
 * base ignoring length), not strangeness.
 */
export const DIRECTIONS: Record<string, Partial<Record<Feature, number>>> = {
  punchier: { sentence: -1, hedges: -0.5, passive: -0.5 },
  shorter: { length: -1 },
  longer: { length: 1 },
  warmer: { contractions: 1, secondPerson: 0.5, wordLen: -0.3 },
  drier: { exclaim: -1, question: -0.3 },
  'more-formal': { contractions: -1, nominal: 0.5, secondPerson: -0.3 },
  'less-formal': { contractions: 1, nominal: -0.5, secondPerson: 0.3 },
  plainer: { wordLen: -1, nominal: -1, passive: -0.5 },
  livelier: { rhythm: 1, exclaim: 0.5, question: 0.5 },
};

/** A variant "moved" when its score is at least this many scale units (this plugin's choice). */
export const MOVE_MIN = 0.1;
/** Distance-scored directions need a bigger move, since distance is never negative and picks up noise. */
export const WEIRD_MIN = 1.0;

/** Directions scored by distance from the base (ignoring the `exclude`d features) instead of by feature weights. */
export const NOVELTY: Record<string, { exclude: Feature[]; min: number }> = {
  weirder: { exclude: ['length', 'sentence'], min: WEIRD_MIN },
};

export const KNOWN_DIRECTIONS: string[] = [...Object.keys(DIRECTIONS), ...Object.keys(NOVELTY)].sort();

/** The score a direction needs to count as moved. */
export const moveMin = (direction: string): number => NOVELTY[direction]?.min ?? MOVE_MIN;

export function assertDirections(list: string[]): string[] {
  for (const d of list) {
    if (!KNOWN_DIRECTIONS.includes(d)) throw new ProseError('E_USAGE', `Unknown direction "${d}"`, { hint: `Known directions: ${KNOWN_DIRECTIONS.join(', ')}` });
  }
  return list;
}

/** Signed movement of `child` from `base` along `direction`, in scale units. */
export function directionScore(base: FeatureVector, child: FeatureVector, direction: string): number {
  const novelty = NOVELTY[direction];
  if (novelty) {
    const keep = (v: FeatureVector) => ({ ...v, ...Object.fromEntries(novelty.exclude.map(f => [f, 0])) }) as FeatureVector;
    return distance(keep(base), keep(child));
  }
  const weights = DIRECTIONS[direction];
  if (!weights) throw new ProseError('E_USAGE', `Unknown direction "${direction}"`);
  return (Object.entries(weights) as Array<[Feature, number]>).reduce((s, [f, w]) => s + (w * (child[f] - base[f])) / SCALES[f], 0);
}
