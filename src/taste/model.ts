// Bradley-Terry over style-feature differences: P(a beats b) = sigmoid(w . (x_a - x_b)), no intercept.
// Fit by Newton's method with backtracking and an L2 prior (neutral at zero until data arrives); the inverse Hessian at the
// optimum is the Laplace covariance, so every utility carries an uncertainty. Semantics ported from agent-beeps' taste model.
import { FEATURES } from '../owner/features.ts';
import type { Verdict } from '../owner/verdicts.ts';

export type { Verdict } from '../owner/verdicts.ts';

export const DIM = FEATURES.length;
/** Pairs a layer needs before it is fitted. Conventions inherited from agent-beeps, not measured on prose. */
export const PROJECT_LAYER_MIN = 15;
export const VOICE_LAYER_MIN = 15;
export const GLOBAL_LAMBDA = 1;
export const LAYER_LAMBDA = 3;

export type LayerName = 'global' | 'project' | 'voice';
export interface Fit { w: number[]; cov: number[][]; n: number }
export interface Model extends Fit { layers: Array<{ name: LayerName; pairs: number }>; usable: boolean }
export interface Pair { d: number[]; w: number }

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
const identity = (scale: number) => Array.from({ length: DIM }, (_, i) => Array.from({ length: DIM }, (_, j) => (i === j ? scale : 0)));

/** A pair is informative when its difference is finite and not zero, and its weight is a positive number. */
const informative = (p: Pair) => Number.isFinite(p.w) && p.w > 0 && p.d.length === DIM && p.d.every(Number.isFinite) && p.d.some(v => v !== 0);

/**
 * (difference, weight) pairs where the first side won. pick and duel: winner over loser, weight as written. tie: none.
 * bothBad: each shown variant loses to the zero vector (the centre of what the owner was shown), half a judgement each.
 */
export function buildPairs(rows: Verdict[]): Pair[] {
  const out: Pair[] = [];
  for (const r of rows) {
    if (r.kind === 'tie') continue;
    if (r.kind === 'bothBad') {
      for (const side of [r.winner, r.loser]) out.push({ d: side.x.map(v => 0 - v), w: 0.5 });
      continue;
    }
    out.push({ d: r.winner.x.map((v, i) => v - (r.loser.x[i] ?? 0)), w: r.weight });
  }
  return out.filter(informative);
}

/** Solve A x = b by Gaussian elimination with partial pivoting (A is small and symmetric positive definite). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

function invert(A: number[][]): number[][] {
  const cols = Array.from({ length: A.length }, (_, j) => solve(A, Array.from({ length: A.length }, (_, i) => (i === j ? 1 : 0))));
  return Array.from({ length: A.length }, (_, i) => cols.map(col => col[i]));
}

/** Penalised negative log-likelihood. */
function objective(w: number[], data: Pair[], lambda: number, p0: number[]): number {
  let f = 0;
  for (const { d, w: wt } of data) {
    const z = dot(w, d);
    f += wt * (z > 0 ? Math.log1p(Math.exp(-z)) : -z + Math.log1p(Math.exp(z)));
  }
  return f + (lambda / 2) * w.reduce((s, v, i) => s + (v - p0[i]) ** 2, 0);
}

function hessian(w: number[], data: Pair[], lambda: number): number[][] {
  const H = identity(lambda);
  for (const { d, w: wt } of data) {
    const s = sigmoid(dot(w, d));
    for (let i = 0; i < DIM; i++) for (let j = 0; j < DIM; j++) H[i][j] += wt * s * (1 - s) * d[i] * d[j];
  }
  return H;
}

/** Fit one layer. The prior (default zero) is where the weights sit with no data, and lambda is how firmly they are held there. */
export function fitBT(rows: Verdict[], { lambda = GLOBAL_LAMBDA, prior }: { lambda?: number; prior?: number[] } = {}): Fit {
  const p0 = prior && prior.length === DIM && prior.every(Number.isFinite) ? prior : new Array(DIM).fill(0);
  const data = buildPairs(rows);
  const neutral = (): Fit => ({ w: [...p0], cov: identity(1 / lambda), n: 0 });
  if (!data.length) return neutral();
  let w = [...p0];
  for (let iter = 0; iter < 50; iter++) {
    const g = w.map((v, i) => lambda * (v - p0[i]));
    for (const { d, w: wt } of data) {
      const s = sigmoid(dot(w, d));
      for (let i = 0; i < DIM; i++) g[i] -= wt * d[i] * (1 - s);
    }
    const step = solve(hessian(w, data, lambda), g);
    if (!step.every(Number.isFinite)) break;
    // Backtracking: undamped Newton overshoots on logistic loss when it starts far away (a project that disagrees with the
    // global prior), so only accept steps that lower the objective.
    const before = objective(w, data, lambda, p0);
    let t = 1;
    let next = w.map((v, i) => v - step[i]);
    while (objective(next, data, lambda, p0) > before && t > 1e-6) {
      t /= 2;
      next = w.map((v, i) => v - t * step[i]);
    }
    if (objective(next, data, lambda, p0) > before) break; // no descent direction left: keep the current point
    w = next;
    if (Math.max(...step.map(Math.abs)) * t < 1e-8) break;
  }
  const cov = invert(hessian(w, data, lambda));
  if (!w.every(Number.isFinite) || !cov.flat().every(Number.isFinite)) return neutral();
  return { w, cov, n: data.length };
}

/**
 * Global taste, then a project layer (prior = global weights) once the project has enough fitted pairs, then a voice layer
 * (prior = the project layer) once the rows naming the voice have enough. `usable` is false when no layer fitted any pair.
 */
export function fitLayered({ globalRows, projectRows, voiceRows = [] }: { globalRows: Verdict[]; projectRows: Verdict[]; voiceRows?: Verdict[] }): Model {
  let cur = fitBT(globalRows);
  const layers: Model['layers'] = [{ name: 'global', pairs: cur.n }];
  const nProject = buildPairs(projectRows).length;
  if (nProject >= PROJECT_LAYER_MIN) {
    cur = fitBT(projectRows, { lambda: LAYER_LAMBDA, prior: cur.w });
    layers.push({ name: 'project', pairs: cur.n });
    if (buildPairs(voiceRows).length >= VOICE_LAYER_MIN) {
      cur = fitBT(voiceRows, { lambda: LAYER_LAMBDA, prior: cur.w });
      layers.push({ name: 'voice', pairs: cur.n });
    }
  }
  return { ...cur, layers, usable: layers.some(l => l.pairs > 0) };
}

export function utility(m: Fit, x: number[]): { u: number; sigma: number } {
  const u = dot(m.w, x);
  const cx = m.cov.map(row => dot(row, x));
  return { u, sigma: Math.sqrt(Math.max(0, dot(x, cx))) };
}

export const pWin = (m: Fit, a: number[], b: number[]) => sigmoid(dot(m.w, a.map((v, i) => v - (b[i] ?? 0))));

/** Standard error of each weight. */
export const standardErrors = (m: Fit) => m.cov.map((row, i) => Math.sqrt(Math.max(0, row[i])));

/** Candidates by utility, best first (equal utilities keep the lower index first). */
export function rank<T extends { index: number; x: number[] }>(m: Fit, candidates: T[]): Array<{ index: number; u: number; sigma: number }> {
  return candidates.map(c => ({ index: c.index, ...utility(m, c.x) })).sort((a, b) => b.u - a.u || a.index - b.index);
}
