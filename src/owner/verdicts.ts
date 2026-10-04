import { appendFileSync, closeSync, mkdirSync, openSync, readSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { dirname } from 'node:path';
import { z } from 'zod';
import { FEATURE_SET_ID } from './features.ts';
import { projectKey } from './paths.ts';
import { FeedbackSchema } from './feedback.ts';

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

/**
 * "None of these": the owner rejected every variant of a set and said why. It is an outcome of a set, NOT a verdict about a
 * pair: it carries no style vectors, no winner and no loser, so it is never a pick, a duel or taste data. It lives in the
 * same log files under its own schema id, and `readVerdicts` returns it in `none`, never in `rows` (the taste model, the
 * duel counts and the stats only ever read `rows`). A runtime that predates it counts the line as malformed.
 */
export const NONE_VERDICT_SCHEMA = 'prose/verdict-none@1';
export const NoneVerdictSchema = FeedbackSchema.extend({
  schema: z.literal(NONE_VERDICT_SCHEMA),
  kind: z.literal('none'),
  at: z.string(),
  project: z.string(),
  set: z.string(),
  setUid: z.string().min(8),
  form: z.string(),
  register: z.string().nullable(),
  voices: z.array(z.string()),
  /** The variants the owner was shown. */
  shown: z.array(z.number().int().min(1)),
});
export type NoneVerdict = z.infer<typeof NoneVerdictSchema>;
const noneKey = (r: { project: string; set: string; setUid: string; closest: number | null; reasons: string[]; note?: string }) =>
  JSON.stringify([projectKey(r.project), r.set, r.setUid, 'none', r.closest, r.reasons, r.note ?? null]);

/** Append a none row unless the log already holds the same outcome for the same set (a retry after a crash). */
export function appendNoneOnce(path: string, row: NoneVerdict): boolean {
  if (keysFor(path, row.set, noneKey).has(noneKey(row))) return false;
  appendJsonlRows(path, [row]);
  return true;
}

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

/**
 * The model's side of a predictions-ledger row (`prose/ledger@1`), optional: rows written before the taste model have none and still read.
 * `abstained` rows are not scored; `voided` is set when a model that predicted left no trustworthy file (a miss).
 */
export const LedgerModelSchema = z.strictObject({
  pick: z.number().int().min(1).nullable(),
  shortlist: z.array(z.number().int().min(1)),
  hit: z.boolean(),
  shortlistHit: z.boolean(),
  abstained: z.boolean(),
  sealValid: z.boolean(),
  voided: z.enum(['edited', 'variant-changed', 'missing']).optional(),
});
export type LedgerModel = z.infer<typeof LedgerModelSchema>;

export interface LedgerRow { project: string; set: string; setUid: string; model?: LedgerModel; [k: string]: unknown }

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
  /** "None of these" outcomes (see NONE_VERDICT_SCHEMA): never part of `rows`, so never counted as a pick, a duel or taste data. */
  none: NoneVerdict[];
  /** Rows of another `prose/verdict@` version: kept out of `rows`, not an error. */
  unknownVersion: number;
  /** Only with `countOtherFeatures`: rows of this schema version whose only fault is a `features` id other than the current one, counted instead of malformed. */
  skippedFeatures?: number;
  /** Lines that are not a valid current verdict. */
  malformed: number;
  /** 1-based line numbers of the first 20 malformed lines. */
  malformedLines: number[];
}

const MAX_LINES_LISTED = 20;

export interface ReadOpts {
  countOtherFeatures?: boolean;
  /** A project key: lines that name this project are not read at all (the global log mirrors every project's picks, so the current project is read from its own log). */
  excludeProject?: string;
  /** Lines that are not JSON name no project, so a mirrored copy is recognised by its text: malformed lines in this set (collected from the project log) are not counted again. */
  mirroredBad?: ReadonlySet<string>;
  /** Receives the text of each malformed line that is not JSON (capped), for `mirroredBad`. */
  collectBad?: Set<string>;
}
const MAX_BAD_TEXTS = 1000;

function newLog(opts: ReadOpts): VerdictLog {
  return { rows: [], none: [], unknownVersion: 0, ...(opts.countOtherFeatures ? { skippedFeatures: 0 } : {}), malformed: 0, malformedLines: [] };
}

function foldLine(log: VerdictLog, line: string, n: number, opts: ReadOpts): void {
  const bad = () => { log.malformed++; if (log.malformedLines.length < MAX_LINES_LISTED) log.malformedLines.push(n); };
  if (!line.trim()) return;
  let raw: unknown;
  try { raw = JSON.parse(line); }
  catch {
    if (opts.mirroredBad?.has(line)) return;
    if (opts.collectBad && opts.collectBad.size < MAX_BAD_TEXTS) opts.collectBad.add(line);
    bad(); return;
  }
  const named = (raw as { project?: unknown } | null)?.project;
  if (opts.excludeProject !== undefined && typeof named === 'string' && projectKey(named) === opts.excludeProject) return;
  const schema = (raw as { schema?: unknown } | null)?.schema;
  if (typeof schema === 'string' && schema.startsWith('prose/verdict-none@')) {
    if (schema !== NONE_VERDICT_SCHEMA) { log.unknownVersion++; return; }
    const none = NoneVerdictSchema.safeParse(raw);
    if (none.success) log.none.push(none.data); else bad();
    return;
  }
  if (typeof schema === 'string' && schema.startsWith('prose/verdict@') && schema !== VERDICT_SCHEMA) { log.unknownVersion++; return; }
  const other = (raw as { features?: unknown } | null)?.features;
  if (opts.countOtherFeatures && typeof other === 'string' && other !== FEATURE_SET_ID && VerdictSchema.safeParse({ ...(raw as object), features: FEATURE_SET_ID }).success) { log.skippedFeatures = (log.skippedFeatures ?? 0) + 1; return; }
  const parsed = VerdictSchema.safeParse(raw);
  if (parsed.success) log.rows.push(parsed.data); else bad();
}

/** Current-version rows, with counts of rows of other versions and of malformed lines. */
export function readVerdicts(path: string, opts: ReadOpts = {}): VerdictLog {
  const log = newLog(opts);
  forEachLine(path, (line, n) => foldLine(log, line, n, opts));
  return log;
}

/** `readVerdicts` over a log's text already read (for a server, which reads the file with async fs). */
export function parseVerdicts(text: string, opts: ReadOpts = {}): VerdictLog {
  const log = newLog(opts);
  text.split('\n').forEach((line, i) => foldLine(log, line, i + 1, opts));
  return log;
}

/** Counts for `prose taste stats`. */
export const verdictCounts = (path: string) => {
  const { rows, unknownVersion, malformed } = readVerdicts(path);
  return { rows: rows.length, unknownVersion, malformed };
};
