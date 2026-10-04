// The removal a set of strikes would make, simulated and verified, never applied here. Pure: text in, lines out.
//
// The one invariant (spec principle 4): after removing the lines, the re-parsed draft must hold exactly the old units minus
// the struck ones, in order, text equal. Anything else (a Markdown paragraph that swallowed a fence, a YAML scalar that is
// really a block scalar, a cue left behind) is refused with the reason and nothing is ever written. Milestone 4's apply
// builds on `planRemoval`; milestone 3 uses it to decide what is strikable and to answer the preview.
import { createHash } from 'node:crypto';
import { ProseError } from '../errors.ts';
import type { Format } from '../kinds.ts';
import { layoutOf } from '../reading/units.ts';
import { type StrikeLine } from './lines.ts';
import { normalizeDraft } from './spans.ts';

/** `unit` the struck lines themselves; `cue` the speaker cue left with nothing under it; `blank` one blank line, so separation stays single; `key` a dialog list's key (`choices:`) left with no entries. */
export type RemovedKind = 'unit' | 'cue' | 'blank' | 'key';

export interface Removed {
  start: number;
  end: number;
  /** The raw removed lines with their own line endings (and a BOM, if line 1 is removed), so a restore is byte-exact. */
  raw: string;
  kind: RemovedKind;
  strike?: string;
}

export interface Target { line: StrikeLine; strike?: string }

const blank = (l: string | undefined): boolean => l === undefined || l.trim() === '';

/** The raw lines of the text with their line endings kept (CRLF, CR or LF), numbered like the normalised text. */
export const rawLines = (text: string): string[] => text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];

type Chosen = Map<number, { kind: RemovedKind; strike?: string }>;

/** Which source lines (1-based) the targets take, and why. */
function chosenLines(text: string, targets: Target[]): Chosen {
  const nl = normalizeDraft(text).split('\n');
  const total = nl.at(-1) === '' ? nl.length - 1 : nl.length;
  const out: Chosen = new Map();
  for (const t of targets) for (let n = t.line.removal[0]; n <= t.line.removal[1]; n++) out.set(n, { kind: 'unit', ...(t.strike ? { strike: t.strike } : {}) });
  const taken = (n: number) => out.has(n);
  // A speech with nothing left under its cue loses the cue.
  for (const t of targets) {
    if (!t.line.speech) continue;
    let cue = t.line.start;
    while (cue > 1 && !blank(nl[cue - 2])) cue--;
    if (cue === t.line.start) continue;
    let last = t.line.end;
    while (last < total && !blank(nl[last])) last++;
    let left = false;
    for (let n = cue + 1; n <= last; n++) if (!taken(n) && !blank(nl[n - 1])) left = true;
    if (!left && !taken(cue)) out.set(cue, { kind: 'cue', ...(t.strike ? { strike: t.strike } : {}) });
  }
  // A list left with no entries loses its key.
  const bySeq = new Map<string, Target[]>();
  for (const t of targets) if (t.line.seq) bySeq.set(t.line.seq.id, [...(bySeq.get(t.line.seq.id) ?? []), t]);
  for (const ts of bySeq.values()) {
    const seq = ts[0].line.seq!;
    if (ts.length >= seq.count && seq.keyLine !== null && !taken(seq.keyLine)) out.set(seq.keyLine, { kind: 'key', ...(ts[0].strike ? { strike: ts[0].strike } : {}) });
  }
  // Single-blank hygiene: a removed run between two blank lines takes one of them.
  const nums = [...out.keys()].sort((a, b) => a - b);
  for (let i = 0; i < nums.length;) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    const a = nums[i], b = nums[j];
    const before = a === 1 || blank(nl[a - 2]);
    if (before && b < total && blank(nl[b]) && !taken(b + 1)) out.set(b + 1, { kind: 'blank' });
    else if (before && b >= total && a > 1 && !taken(a - 1)) out.set(a - 1, { kind: 'blank' });
    i = j + 1;
  }
  return out;
}

/** The removed lines as rows: consecutive lines of one kind and strike are one row. */
function rowsOf(text: string, chosen: Chosen): Removed[] {
  const raw = rawLines(text);
  const rows: Removed[] = [];
  for (const n of [...chosen.keys()].sort((a, b) => a - b)) {
    const c = chosen.get(n)!;
    const last = rows.at(-1);
    if (last && last.end === n - 1 && last.kind === c.kind && last.strike === c.strike) { last.end = n; last.raw += raw[n - 1] ?? ''; }
    else rows.push({ start: n, end: n, raw: raw[n - 1] ?? '', kind: c.kind, ...(c.strike ? { strike: c.strike } : {}) });
  }
  return rows;
}

/** The text without the rows' lines; every other line keeps its own ending and a BOM stays where it was. */
export function withoutRows(text: string, rows: Removed[]): string {
  const gone = new Set<number>();
  for (const r of rows) for (let n = r.start; n <= r.end; n++) gone.add(n);
  return rawLines(text).filter((_, k) => !gone.has(k + 1)).join('');
}

/**
 * The inverse of `withoutRows`: put each row's raw lines back at the line number it came from (numbers are pre-removal, so
 * rows go in ascending order and every other line keeps its place). Refuses rows that are out of order, overlap, or whose
 * raw text is not the number of lines they claim, so a damaged log row restores nothing.
 */
export function restoreRows(text: string, rows: Removed[]): string | null {
  const sorted = [...rows].sort((a, b) => a.start - b.start);
  const parts = new Map<number, string>();
  let prev = 0;
  for (const r of sorted) {
    const lines = rawLines(r.raw);
    if (r.start <= prev || r.end < r.start || lines.length !== r.end - r.start + 1) return null;
    lines.forEach((l, k) => parts.set(r.start + k, l));
    prev = r.end;
  }
  const current = rawLines(text);
  const total = current.length + parts.size;
  const out: string[] = [];
  let at = 0;
  for (let n = 1; n <= total; n++) {
    const back = parts.get(n);
    if (back !== undefined) out.push(back);
    else if (at < current.length) out.push(current[at++]);
    else return null;
  }
  return at === current.length ? out.join('') : null;
}

export type Simulation = { ok: true; removed: Removed[]; after: string } | { ok: false; why: string };

const WHY_CHANGED = 'removing it would change other lines of the draft';

/**
 * Remove the targets' lines in a copy and check the invariant. `before` (the draft's units) may be passed when many
 * simulations share one draft. A draft that no longer parses after the removal is refused with the parser's own words.
 */
export function simulateRemoval(text: string, format: Format, form: string | undefined, targets: Target[], before?: string[]): Simulation {
  if (targets.length === 0) return { ok: false, why: 'nothing to remove' };
  for (const t of targets) if (!t.line.strikable) return { ok: false, why: t.line.why ?? 'it cannot be struck' };
  const perPool = new Map<string, number>();
  for (const t of targets) if (t.line.seq?.id.startsWith('b')) perPool.set(t.line.seq.id, (perPool.get(t.line.seq.id) ?? 0) + 1);
  for (const t of targets) if (t.line.seq?.id.startsWith('b') && (perPool.get(t.line.seq.id) ?? 0) >= t.line.seq.count) return { ok: false, why: 'a bark pool needs at least one line; rewrite it instead' };
  const rows = rowsOf(text, chosenLines(text, targets));
  const after = withoutRows(text, rows);
  const old = before ?? layoutOf(normalizeDraft(text), format, form).units;
  const struck = new Set(targets.flatMap(t => t.line.units));
  const expected = old.filter((_, i) => !struck.has(i));
  let now: string[];
  try { now = layoutOf(normalizeDraft(after), format, form).units; }
  catch (e) {
    return { ok: false, why: `the draft would no longer parse (${e instanceof ProseError ? e.message.split('\n')[0].slice(0, 120) : 'parse error'}); rewrite it instead` };
  }
  if (now.length !== expected.length || now.some((u, i) => u !== expected[i])) return { ok: false, why: WHY_CHANGED };
  return { ok: true, removed: rows, after };
}

/** How many lines `verifiedLines` simulates one by one; past it the rule-based answer stands and the strike itself is verified. */
export const VERIFY_BUDGET = 150;

/**
 * The strike lines with `strikable` settled by simulation: a line the static rules allow but whose removal would break the
 * invariant is marked not strikable with the reason. Drafts with more than VERIFY_BUDGET strikable lines keep the static
 * answer for the lines past the budget (the CLI verifies the line it is asked to strike either way).
 */
export function verifiedLines(text: string, format: Format, form: string | undefined, lines: StrikeLine[]): StrikeLine[] {
  const before = layoutOf(normalizeDraft(text), format, form).units;
  let budget = VERIFY_BUDGET;
  return lines.map(l => {
    if (!l.strikable || budget-- <= 0) return l;
    const sim = simulateRemoval(text, format, form, [{ line: l }], before);
    return sim.ok ? l : { ...l, strikable: false, why: sim.why };
  });
}

/** What one apply would do: every row, in draft order, and the digest that names exactly this plan. */
export interface RemovalPlan {
  digest: string;
  removed: Removed[];
  /** Struck lines (not cues, keys or blanks). */
  count: number;
  /** Bytes of the removed text. */
  bytes: number;
  after: string;
}

/**
 * The plan for removing the struck lines of `strikes` (each with the `line` it names now), and its digest: the draft hash,
 * the rows (lines, kinds, strikes) and the strikes' ids, refs and reasons. Anything that changes the draft or the strikes
 * changes the digest. A removal that breaks the invariant is E_CONFLICT.
 */
export function planRemoval(text: string, format: Format, form: string | undefined, hash: string, strikes: Array<{ id: string; ref: string; reason: string; line: StrikeLine }>): RemovalPlan {
  const sim = simulateRemoval(text, format, form, strikes.map(s => ({ line: s.line, strike: s.id })));
  if (!sim.ok) throw new ProseError('E_CONFLICT', `The struck lines cannot be removed: ${sim.why}`, { hint: 'Clear the strike that causes it (prose strike list shows them)' });
  const digest = createHash('sha256').update(JSON.stringify({
    hash, rows: sim.removed.map(r => [r.start, r.end, r.kind, r.strike ?? null]), strikes: strikes.map(s => [s.id, s.ref, s.reason]),
  })).digest('hex');
  return { digest, removed: sim.removed, count: strikes.length, bytes: Buffer.byteLength(sim.removed.map(r => r.raw).join('')), after: sim.after };
}
