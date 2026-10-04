// The side-by-side compare view's data: the base text's units against each variant's, aligned into rows, with a word diff
// inside every changed cell. Pure (no I/O, no clock): the server calls it, the page only renders the result.
//
// Rows are the base text's units in order. For each variant independently: trim the common prefix and suffix (exact match
// of speaker plus whitespace-collapsed text), align the middle by a longest common subsequence over the same keys (bounded
// to 400 by 400, above that the middle is one gap), then pair what is left inside each gap by position (equal counts) or by
// similarity() (a small order-keeping dynamic programme, bounded to 20 by 20). A unit left unpaired is "added" (a variant
// line with no base line) or "removed" (a base line the variant lacks). Added units go into insertion rows after the base
// row they follow, so a variant that adds or drops lines shows extra or gapped rows instead of shifting every later row.
import { similarity } from '../owner/similarity.ts';
import type { Format } from '../kinds.ts';
import { blockUnits, speakerPrefix } from './units.ts';

export type Op = ['=' | '+' | '-', string];
/** `unit` is the index in that variant's units (a note's target). `speaker` is read from the block, never parsed from the text. */
export interface Cell { unit: number; speaker?: string; text: string; ops?: Op[]; struck?: true }
/**
 * One row of the grid. `cells` is keyed by variant key and carries only the variants that differ from the base on this
 * row: a missing key means "the same as `cur`", `null` means the variant has no line here, a cell without `ops` is plain text
 * (an added line, or a struck one). A row with no `cells` is `same` for every variant.
 */
export interface Row { base: number | null; cur: Cell | null; cells?: Record<string, Cell | null>; same?: true }
export interface Compare { hasCurrent: boolean; rows: Row[] }
export interface UnitCell { speaker?: string; text: string }
export interface VariantInput { key: string; cells: UnitCell[]; struck?: number[] }

/** Past these the compare view is not offered and the page falls back to the card stack. */
export const MAX_COMPARE_UNITS = 1500;
export const MAX_COMPARE_ROWS = 600;
const LCS_MAX = 400;
const GAP_MAX = 20;
const TOKENS_MAX = 120;
const PAIR_ABOVE = 0.2;

/** The units of a text with who speaks each (the speaker comes from the parsed block, so an action line that starts `Name:` is not a speaker). */
export function unitCells(text: string, format: Format, form?: string): UnitCell[] {
  const out: UnitCell[] = [];
  for (const { block, units } of blockUnits(text, format, form).entries) {
    const prefix = speakerPrefix(block);
    for (const { unit } of units) {
      if (prefix && unit.startsWith(prefix)) out.push({ speaker: prefix.slice(0, -2), text: unit.slice(prefix.length) });
      else out.push({ text: unit });
    }
  }
  return out;
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();
const keyOf = (c: UnitCell): string => `${c.speaker ?? ''}\u0000${collapse(c.text)}`;

// ---- the word diff ----

const tokens = (s: string): string[] => s.trim().split(/\s+/).filter(Boolean);

/**
 * Word-level ops from `a` (the base) to `b` (a variant): `=` words in both (spelled as `b` has them), `-` words only in `a`,
 * `+` words only in `b`. Tokens are whitespace-separated and compared exactly (case and punctuation count). Every op but the
 * last ends with a space, so runs set side by side read as words. At most 120 tokens a side; beyond that the cell is one cut
 * run plus one new run.
 */
export function wordDiff(a: string, b: string): Op[] {
  const ta = tokens(a), tb = tokens(b);
  const out: Op[] = [];
  const push = (kind: Op[0], word: string) => {
    const last = out.at(-1);
    if (last && last[0] === kind) last[1] += ` ${word}`; else out.push([kind, word]);
  };
  if (ta.length > TOKENS_MAX || tb.length > TOKENS_MAX) {
    if (ta.length) out.push(['-', ta.join(' ')]);
    if (tb.length) out.push(['+', tb.join(' ')]);
  } else {
    const n = ta.length, m = tb.length;
    const L: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ta[i] === tb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && ta[i] === tb[j]) { push('=', tb[j]); i++; j++; }
      else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) push('-', ta[i++]);
      else push('+', tb[j++]);
    }
  }
  return out.map(([k, t], idx): Op => [k, idx < out.length - 1 ? `${t} ` : t]);
}

// ---- alignment ----

/** One step of an alignment, in order: a base unit paired with a variant unit, a base unit alone (removed), or a variant unit alone (added). */
export interface Step { b?: number; v?: number }

/** Index pairs of a longest common subsequence of two key lists, in order; ties prefer the earliest base unit. */
function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length, m = b.length;
  const L: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: Array<[number, number]> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/** Pair the base units b0..b1 with the variant units v0..v1 (a gap between two anchors), appending steps in order. */
function alignGap(base: UnitCell[], variant: UnitCell[], b0: number, b1: number, v0: number, v1: number, out: Step[]): void {
  const n = b1 - b0, m = v1 - v0;
  const byPosition = () => {
    const k = Math.min(n, m);
    for (let i = 0; i < k; i++) out.push({ b: b0 + i, v: v0 + i });
    for (let i = k; i < n; i++) out.push({ b: b0 + i });
    for (let j = k; j < m; j++) out.push({ v: v0 + j });
  };
  if (n === 0 || m === 0 || n === m || n > GAP_MAX || m > GAP_MAX) return byPosition();
  const sim = (i: number, j: number) => similarity(base[b0 + i].text, variant[v0 + j].text);
  // S[i][j]: the best total similarity pairing the first i base units with the first j variant units, order kept, pairs above 0.2 only.
  const S: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = sim(i - 1, j - 1);
      S[i][j] = Math.max(S[i - 1][j], S[i][j - 1], s > PAIR_ABOVE ? S[i - 1][j - 1] + s : 0);
    }
  }
  const rev: Step[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const s = sim(i - 1, j - 1);
      if (s > PAIR_ABOVE && Math.abs(S[i][j] - (S[i - 1][j - 1] + s)) < 1e-9) { rev.push({ b: b0 + i - 1, v: v0 + j - 1 }); i--; j--; continue; }
    }
    if (i > 0 && (j === 0 || S[i][j] === S[i - 1][j])) { rev.push({ b: b0 + i - 1 }); i--; } else { rev.push({ v: v0 + j - 1 }); j--; }
  }
  // Between two pairs, list what was removed before what was added, so the result does not depend on how ties fell.
  const ordered = rev.reverse();
  let k = 0;
  while (k < ordered.length) {
    if (ordered[k].b !== undefined && ordered[k].v !== undefined) { out.push(ordered[k++]); continue; }
    const run: Step[] = [];
    while (k < ordered.length && (ordered[k].b === undefined || ordered[k].v === undefined)) run.push(ordered[k++]);
    out.push(...run.filter(s => s.b !== undefined), ...run.filter(s => s.v !== undefined));
  }
}

/** The alignment of one variant against the base, as ordered steps that use every base unit and every variant unit exactly once. */
export function alignUnits(base: UnitCell[], variant: UnitCell[]): Step[] {
  const bk = base.map(keyOf), vk = variant.map(keyOf);
  const nb = bk.length, nv = vk.length;
  const steps: Step[] = [];
  let p = 0;
  while (p < nb && p < nv && bk[p] === vk[p]) p++;
  let s = 0;
  while (s < nb - p && s < nv - p && bk[nb - 1 - s] === vk[nv - 1 - s]) s++;
  for (let i = 0; i < p; i++) steps.push({ b: i, v: i });
  const mb = bk.slice(p, nb - s), mv = vk.slice(p, nv - s);
  const anchors = mb.length > 0 && mv.length > 0 && mb.length <= LCS_MAX && mv.length <= LCS_MAX ? lcsPairs(mb, mv) : [];
  let bi = p, vi = p;
  for (const [ab, av] of anchors) {
    alignGap(base, variant, bi, p + ab, vi, p + av, steps);
    steps.push({ b: p + ab, v: p + av });
    bi = p + ab + 1; vi = p + av + 1;
  }
  alignGap(base, variant, bi, nb - s, vi, nv - s, steps);
  for (let i = 0; i < s; i++) steps.push({ b: nb - s + i, v: nv - s + i });
  return steps;
}

// ---- the grid ----

/**
 * The rows of the compare grid: one per base unit, with insertion rows for lines a variant adds. Null when there is nothing to
 * compare, a text is over 1,500 units, or the grid would pass 600 rows (the page then shows the card stack).
 */
export function buildCompare(base: UnitCell[], variants: VariantInput[], hasCurrent: boolean, baseStruck: number[] = []): Compare | null {
  if (variants.length === 0 || base.length > MAX_COMPARE_UNITS || variants.some(v => v.cells.length > MAX_COMPARE_UNITS)) return null;
  const baseStrikes = new Set(baseStruck);
  const per = variants.map(v => {
    const matched = new Map<number, number>();          // base unit -> variant unit
    const removed = new Set<number>();
    const added = new Map<number, number[]>();          // slot (the base row it follows; -1 before the first) -> variant units
    let slot = -1;
    for (const st of alignUnits(base, v.cells)) {
      if (st.b !== undefined) slot = st.b;
      if (st.b !== undefined && st.v !== undefined) matched.set(st.b, st.v);
      else if (st.b !== undefined) removed.add(st.b);
      else { const list = added.get(slot) ?? []; list.push(st.v!); added.set(slot, list); }
    }
    return { v, matched, removed, added, struck: new Set(v.struck ?? []) };
  });
  const cell = (v: VariantInput, struck: Set<number>, unit: number, ops?: Op[]): Cell => {
    const c = v.cells[unit];
    return { unit, ...(c.speaker ? { speaker: c.speaker } : {}), text: c.text, ...(ops ? { ops } : {}), ...(struck.has(unit) ? { struck: true as const } : {}) };
  };
  const rows: Row[] = [];
  const insertions = (slot: number) => {
    const count = Math.max(0, ...per.map(p => p.added.get(slot)?.length ?? 0));
    for (let j = 0; j < count; j++) {
      const cells: Record<string, Cell | null> = {};
      for (const p of per) { const u = p.added.get(slot)?.[j]; cells[p.v.key] = u === undefined ? null : cell(p.v, p.struck, u); }
      rows.push({ base: null, cur: null, cells });
    }
  };
  insertions(-1);
  base.forEach((b, i) => {
    const cur: Cell = { unit: i, ...(b.speaker ? { speaker: b.speaker } : {}), text: b.text, ...(baseStrikes.has(i) ? { struck: true as const } : {}) };
    const cells: Record<string, Cell | null> = {};
    for (const p of per) {
      const u = p.matched.get(i);
      if (u === undefined) cells[p.v.key] = null;
      else if (keyOf(p.v.cells[u]) !== keyOf(b)) cells[p.v.key] = cell(p.v, p.struck, u, wordDiff(b.text, p.v.cells[u].text));
      else if (p.struck.has(u)) cells[p.v.key] = cell(p.v, p.struck, u);
    }
    if (Object.keys(cells).length === 0 && !baseStrikes.has(i)) rows.push({ base: i, cur, same: true });
    else rows.push({ base: i, cur, cells });
    insertions(i);
  });
  return rows.length > MAX_COMPARE_ROWS ? null : { hasCurrent, rows };
}
