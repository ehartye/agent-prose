import { round2, words } from '../text.ts';

/** At or above this, a variant adds nothing over an earlier one (this plugin's choice). */
export const DUPLICATE_AT = 0.85;
/** At or above this, two variants are close enough to warn about. */
export const SIMILAR_AT = 0.6;
/** At or above this, a variant is barely a rewrite of the base. */
export const BARELY_CHANGED_AT = 0.95;
/** Words in the shorter text at which phrases get full weight; below it, word overlap counts for more. */
const PHRASE_FULL_AT = 40;

const jaccard = (A: Set<string>, B: Set<string>): number => {
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
};
const grams = (w: string[], n: number) => {
  const s = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(' '));
  return s;
};

/** Blend of word-set and three-word-phrase Jaccard overlap, phrases weighted up as the texts get longer; 0..1. */
export function similarity(a: string, b: string): number {
  const wa = words(a).map(w => w.toLowerCase());
  const wb = words(b).map(w => w.toLowerCase());
  const shorter = Math.min(wa.length, wb.length);
  const j1 = jaccard(grams(wa, 1), grams(wb, 1));
  const j3 = shorter < 3 ? j1 : jaccard(grams(wa, 3), grams(wb, 3));
  const w = Math.min(1, shorter / PHRASE_FULL_AT);
  return round2((1 - w) * j1 + w * j3);
}
