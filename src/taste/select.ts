// Active duel selection: ask the pair the model is least sure of. Informative comparisons beat a fixed schedule.
// score = (1 - |2p - 1|) * (1 + sigma): p is the model's chance that the first beats the second (0.5 is a coin flip), sigma the
// uncertainty of the utility difference. Pure and deterministic; ports agent-beeps' nextDuel, with a null result when done.
import { pWin, utility, type Fit } from './model.ts';

export interface DuelCandidate { index: number; x: number[] }
export interface AskedPair { a: number; b: number }

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** The pair [i, j] (lower candidate index first) to ask next, or null when every pair has been asked or fewer than two candidates remain. Ties go to the lowest index pair. */
export function nextDuel(candidates: DuelCandidate[], model: Fit, asked: AskedPair[]): [number, number] | null {
  const done = new Set(asked.map(q => key(q.a, q.b)));
  const sorted = [...candidates].sort((p, q) => p.index - q.index);
  let best: [number, number] | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const [a, b] = [sorted[i], sorted[j]];
      if (a.index === b.index || done.has(key(a.index, b.index))) continue;
      const p = pWin(model, a.x, b.x);
      const sigma = utility(model, a.x.map((v, k) => v - (b.x[k] ?? 0))).sigma;
      const score = (1 - Math.abs(2 * p - 1)) * (1 + sigma);
      if (score > bestScore) { bestScore = score; best = [a.index, b.index]; }
    }
  }
  return best;
}
