import { appendFileSync, closeSync, mkdirSync, openSync, readSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { dirname } from 'node:path';
import { z } from 'zod';
import { projectKey } from './paths.ts';

/**
 * One side of a judgement. `set` and `setUid` are present ONLY when the side comes from a different set than the row's
 * own `set` (a refine round's pinned champion dueled against a variant of a later set); a same-set side is unchanged.
 */
const Side = z.strictObject({
  index: z.number().int().min(1), x: z.array(z.number()),
  set: z.string().optional(), setUid: z.string().min(8).optional(),
});

export const VERDICT_SCHEMA = 'prose/verdict@2';

/** One owner judgement. `x` is the variant's scaled style vector, centred on its set, frozen at judging time. */
export const VerdictSchema = z.strictObject({
  schema: z.literal(VERDICT_SCHEMA),
  /** Which feature definitions `x` was computed with (FEATURE_SET_ID). */
  features: z.literal('v1'),
  at: z.string(),
  project: z.string(),
  set: z.string(),
  /** The set's random uid: a set id can be reused after deletion, the uid cannot. */
  setUid: z.string().min(8),
  /**
   * pick: an unexplained choice among several (one row per loser). duel: a decisive head-to-head from the reading page.
   * tie and bothBad are symmetric (winner/loser are just the shown order a, b); see src/owner/duel.ts.
   */
  kind: z.enum(['pick', 'duel', 'tie', 'bothBad']),
  /** Identifies one duel judgement, so a retry is skipped and a repeat is not. Absent on picks and on rows written by 0.2.0. */
  eventId: z.string().min(1).max(100).optional(),
  form: z.string(),
  register: z.string().nullable(),
  voices: z.array(z.string()),
  winner: Side,
  loser: Side,
  /** An unexplained pick among several is weaker evidence than a head-to-head duel (weight 1). */
  weight: z.number().positive(),
  tags: z.array(z.string()),
  /** The variants the owner was shown, and how many (>= 2): the context of the choice. */
  shown: z.array(z.number().int().min(1)),
  n: z.number().int().min(2),
});
export type Verdict = z.infer<typeof VerdictSchema>;

/** What makes two verdict rows the same judgement (a retry after a crash). */
type KeySide = { index: number; set?: string; setUid?: string };
export const verdictKey = (r: { project: string; set: string; setUid: string; winner: KeySide; loser: KeySide; kind?: string; eventId?: string }) => {
  const key: unknown[] = [projectKey(r.project), r.set, r.setUid, r.winner.index, r.loser.index, r.kind ?? 'pick', r.eventId ?? null];
  // A cross-set row also names where each side lives, so two different cross-set pairs never collide. A same-set row adds nothing: its key is what it always was.
  if (r.winner.set !== undefined || r.loser.set !== undefined) {
    key.push([r.winner, r.loser].map(s => [s.set ?? r.set, s.setUid ?? r.setUid, s.index]));
  }
  return JSON.stringify(key);
};
const ledgerKey = (r: { project: string; set: string; setUid: string }) => JSON.stringify([projectKey(r.project), r.set, r.setUid]);

/** Call `fn` with each line of a file and its 1-based number, reading in chunks (no whole-file string). */
export function forEachLine(path: string, fn: (line: string, n: number) => void): void {
  let fd: number;
  try { fd = openSync(path, 'r'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
  try {
    const buf = Buffer.alloc(1 << 16);
    const decoder = new StringDecoder('utf8');
    let rest = '';
    let n = 0;
    for (let got; (got = readSync(fd, buf, 0, buf.length, null)) > 0;) {
      const parts = (rest + decoder.write(buf.subarray(0, got))).split('\n');
      rest = parts.pop()!;
      for (const line of parts) fn(line, ++n);
    }
    rest += decoder.end();
    if (rest) fn(rest, ++n);
  } finally { closeSync(fd); }
}

/**
 * The keys already in a log for one set. Lines are filtered on the set id as text before JSON.parse, so a pick costs
 * one pass over the log however long it is. (Rows are written by appendJsonlRows, which has no spaces in `"set":"<id>"`.)
 */
function keysFor(path: string, set: string, key: (r: any) => string): Set<string> {
  const needle = `"set":${JSON.stringify(set)}`;
  const keys = new Set<string>();
  forEachLine(path, line => {
    if (!line.includes(needle)) return;
    try { keys.add(key(JSON.parse(line))); } catch { /* torn or not row-shaped */ }
  });
  return keys;
}

/**
 * Append the rows the log does not already hold (same project key, set, set uid, winner, loser, kind and event id: a retry
 * after a crash), in one write. Returns, per row, whether it was appended.
 */
export function appendVerdictsOnce(path: string, rows: Verdict[]): boolean[] {
  if (!rows.length) return [];
  const have = keysFor(path, rows[0].set, verdictKey);
  const fresh = rows.map(r => { const k = verdictKey(r); if (have.has(k)) return false; have.add(k); return true; });
  appendJsonlRows(path, rows.filter((_, i) => fresh[i]));
  return fresh;
}

export interface LedgerRow { project: string; set: string; setUid: string; [k: string]: unknown }

/** Append a ledger row unless the ledger already has one for the same project key, set and set uid. */
export function appendLedgerOnce(path: string, row: LedgerRow): boolean {
  if (keysFor(path, row.set, ledgerKey).has(ledgerKey(row))) return false;
  appendJsonlRows(path, [row]);
  return true;
}

/** Append rows as JSON lines with a single write. */
export function appendJsonlRows(path: string, rows: unknown[]): void {
  if (!rows.length) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, rows.map(r => JSON.stringify(r) + '\n').join(''));
}

export interface VerdictLog {
  rows: Verdict[];
  /** Rows of another `prose/verdict@` version: kept out of `rows`, not an error. */
  unknownVersion: number;
  /** Lines that are not a valid current verdict. */
  malformed: number;
  /** 1-based line numbers of the first 20 malformed lines. */
  malformedLines: number[];
}

const MAX_LINES_LISTED = 20;

/** Current-version rows, with counts of rows of other versions and of malformed lines. */
export function readVerdicts(path: string): VerdictLog {
  const log: VerdictLog = { rows: [], unknownVersion: 0, malformed: 0, malformedLines: [] };
  const bad = (n: number) => { log.malformed++; if (log.malformedLines.length < MAX_LINES_LISTED) log.malformedLines.push(n); };
  forEachLine(path, (line, n) => {
    if (!line.trim()) return;
    let raw: unknown;
    try { raw = JSON.parse(line); } catch { bad(n); return; }
    const schema = (raw as { schema?: unknown } | null)?.schema;
    if (typeof schema === 'string' && schema.startsWith('prose/verdict@') && schema !== VERDICT_SCHEMA) { log.unknownVersion++; return; }
    const parsed = VerdictSchema.safeParse(raw);
    if (parsed.success) log.rows.push(parsed.data); else bad(n);
  });
  return log;
}

/** Counts for `prose taste stats`. */
export const verdictCounts = (path: string) => {
  const { rows, unknownVersion, malformed } = readVerdicts(path);
  return { rows: rows.length, unknownVersion, malformed };
};
