// The strike record: one append-only event log per draft, and the pure fold that says what is pending, stale or applied.
//
// Files, under `<project>/.agent-prose/strikes/<key>/` (one directory per draft, so lock contention is one draft wide):
//   draft.json    { schema: 'prose/strike-draft@1', source, createdAt }   written once, atomically
//   events.jsonl  the log: strike, clear, apply, undo rows, each with schema, at and seq
//   .lock/        the directory lock (noun 'strikes')
// Milestone 3 writes `strike` and `clear` rows. `apply` and `undo` rows are defined and folded here so milestone 4 adds
// writers, not formats; nothing in milestone 3 emits them. Like the session log, a torn or unknown line is skipped and
// counted, never thrown. The log holds struck text: new projects gitignore the folder.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { ProseError } from '../errors.ts';
import { withDirLock, writeFileAtomic, type LockContext, type LockOptions } from '../owner/fsutil.ts';
import { EVENT_ID_RE, ID_RE, strikeDir, strikesDir } from '../owner/paths.ts';
import { PROJECT_DIR } from '../project.ts';
import { MAX_STRUCK_TEXT } from './lines.ts';

export const STRIKE_REASONS = ['wrong-direction', 'faulty-premise', 'not-worth-rewrite'] as const;
export type StrikeReason = (typeof STRIKE_REASONS)[number];
export const MAX_NOTE = 500;
/** Pending strikes one draft can hold. */
export const MAX_PENDING = 200;
export const EVENT_SCHEMA = 'prose/strike-event@1';
export const DRAFT_SCHEMA = 'prose/strike-draft@1';
const DRAFT_EXT = /\.(?:fountain|md|markdown|dialog\.ya?ml|ya?ml)$/i;

const HASH = z.string().regex(/^[0-9a-f]{64}$/);
const REF = z.string().regex(/^\d+(-\d+)?$/);
/** Free text for a note: line endings folded, trimmed, bounded; control characters other than tab and newline are refused. */
export const NoteText = z.string()
  .transform(s => s.replace(/\r\n?/g, '\n').trim())
  .pipe(z.string().min(1).max(MAX_NOTE).refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s), 'no control characters'));

const Base = { schema: z.literal(EVENT_SCHEMA), at: z.string(), seq: z.number().int().min(1) };
const EventId = z.string().regex(EVENT_ID_RE).optional();
const Removed = z.strictObject({
  start: z.number().int().min(1), end: z.number().int().min(1), raw: z.string(),
  kind: z.enum(['unit', 'cue', 'blank', 'key']), strike: z.string().regex(/^s\d+$/).optional(),
});

export const StrikeRow = z.strictObject({
  ...Base, type: z.literal('strike'),
  id: z.string().regex(/^s\d+$/), ref: REF, start: z.number().int().min(1), end: z.number().int().min(1),
  text: z.string().min(1).max(MAX_STRUCK_TEXT), speaker: z.string().min(1).optional(),
  reason: z.enum(STRIKE_REASONS), note: NoteText.optional(), draftHash: HASH, eventId: EventId,
});
export const ClearRow = z.strictObject({ ...Base, type: z.literal('clear'), strike: z.string().regex(/^s\d+$/), eventId: EventId });
export const ApplyRow = z.strictObject({
  ...Base, type: z.literal('apply'),
  id: z.string().regex(/^a\d+$/), strikes: z.array(z.string().regex(/^s\d+$/)).min(1), before: HASH, after: HASH,
  removed: z.array(Removed), digest: HASH, eventId: EventId,
});
export const UndoRow = z.strictObject({ ...Base, type: z.literal('undo'), apply: z.string().regex(/^a\d+$/), before: HASH, after: HASH, eventId: EventId });
export const StrikeEventSchema = z.discriminatedUnion('type', [StrikeRow, ClearRow, ApplyRow, UndoRow]);
export type StrikeEvent = z.infer<typeof StrikeEventSchema>;
export type StrikeRowT = z.infer<typeof StrikeRow>;
export type ApplyRowT = z.infer<typeof ApplyRow>;

/** A row as a caller builds it: the store adds schema, at and seq. */
export type NewEvent = { [K in StrikeEvent['type']]: Omit<Extract<StrikeEvent, { type: K }>, 'schema' | 'at' | 'seq'> }[StrikeEvent['type']];

// ---- the fold ----

export interface PendingStrike {
  id: string; ref: string; start: number; end: number; text: string; speaker?: string;
  reason: StrikeReason; note?: string; draftHash: string; at: string;
  /** Made against another draft than the one on disk now: it can only be cleared. */
  stale: boolean;
}
export interface AppliedStrikes {
  id: string; strikes: PendingStrike[]; before: string; after: string; removed: ApplyRowT['removed']; digest: string; at: string; undone: boolean;
}
export interface StrikeFold {
  /** Pending strikes in the order they were made. */
  pending: PendingStrike[];
  /** Every apply, oldest first, with whether a later undo reversed it. */
  applied: AppliedStrikes[];
  /** The log's rows, in order. */
  history: StrikeEvent[];
  /** What the fold could not honour (a clear of a strike that is not pending, an undo of an apply that is not there). */
  problems: string[];
  /** Number the next strike takes (`s<n>`): never reuses an id, applied or cleared. */
  nextStrike: number;
  nextApply: number;
}

const numOf = (id: string): number => Number(id.slice(1));

/**
 * The state of a draft's strikes from its log, and which pending strikes are stale against `currentHash`. Pure.
 * strike adds to pending; clear removes a pending strike; apply moves its strikes into `applied`; undo marks that apply
 * undone and returns its strikes to pending (the restored draft has the hash they were made against).
 */
export function foldStrikes(events: StrikeEvent[], currentHash: string | null): StrikeFold {
  const made = new Map<string, Omit<PendingStrike, 'stale'>>();
  const pending = new Set<string>();
  const applied: AppliedStrikes[] = [];
  const problems: string[] = [];
  let nextStrike = 1;
  let nextApply = 1;
  for (const e of events) {
    if (e.type === 'strike') {
      if (made.has(e.id)) { problems.push(`${e.id} appears twice; the second is ignored`); continue; }
      const { schema: _s, seq: _q, type: _t, eventId: _e, ...rest } = e;
      made.set(e.id, rest);
      pending.add(e.id);
      nextStrike = Math.max(nextStrike, numOf(e.id) + 1);
    } else if (e.type === 'clear') {
      if (pending.delete(e.strike)) continue;
      problems.push(`clear of ${e.strike}, which is not pending`);
    } else if (e.type === 'apply') {
      nextApply = Math.max(nextApply, numOf(e.id) + 1);
      const strikes: PendingStrike[] = [];
      for (const id of e.strikes) {
        const s = made.get(id);
        if (s && pending.delete(id)) strikes.push({ ...s, stale: false });
        else problems.push(`${e.id} names ${id}, which is not pending`);
      }
      applied.push({ id: e.id, strikes, before: e.before, after: e.after, removed: e.removed, digest: e.digest, at: e.at, undone: false });
    } else {
      const a = applied.find(x => x.id === e.apply);
      if (!a || a.undone) { problems.push(`undo of ${e.apply}, which is not an applied removal`); continue; }
      a.undone = true;
      for (const s of a.strikes) pending.add(s.id);
    }
  }
  const order = [...pending].sort((a, b) => numOf(a) - numOf(b));
  return {
    pending: order.map(id => ({ ...made.get(id)!, stale: made.get(id)!.draftHash !== currentHash })),
    applied, history: events, problems, nextStrike, nextApply,
  };
}

/** The latest apply that is not undone, while the draft is still exactly as it left it: the one an undo may reverse. */
export function undoableApply(fold: StrikeFold, currentHash: string | null): AppliedStrikes | null {
  const last = [...fold.applied].reverse().find(a => !a.undone) ?? null;
  return last && last.after === currentHash ? last : null;
}

// ---- reading and appending ----

/** The stored rows in file order. A line that is not valid JSON, not a known row, or lacks `at` and `seq` is skipped and counted. */
export function parseStrikeLog(text: string): { events: StrikeEvent[]; skipped: number } {
  const events: StrikeEvent[] = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = StrikeEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) events.push(parsed.data); else skipped++;
    } catch { skipped++; }
  }
  return { events, skipped };
}

const readText = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '');

/** The log of a strike directory (empty when there is none yet). Not locked: a reader may see a torn last line, which is skipped. */
export function readStrikeLog(dir: string): { events: StrikeEvent[]; skipped: number } {
  return parseStrikeLog(readText(join(dir, 'events.jsonl')));
}

// ---- the draft and its key ----

const lowerOnWindows = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p);

/** `<slug of the file name, at most 40 chars>-<first 8 hex of sha256 of the project-relative path>`: always a valid id. */
export function strikeKey(source: string): string {
  const slug = basename(source).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '') || 'draft';
  const digest = createHash('sha256').update(lowerOnWindows(source)).digest('hex').slice(0, 8);
  return `${slug}-${digest}`;
}

export interface DraftRef {
  /** Absolute path of the draft file. */
  file: string;
  /** Project-relative, forward slashes. */
  source: string;
  key: string;
}

/**
 * The draft a strike names, checked: a file inside the project, not a symlink (apply renames over it), not inside
 * `.agent-prose/`, and a format prose reads. Anything else is E_USAGE (or E_NOT_FOUND for a file that is not there).
 */
export function resolveDraft(project: string, draft: string): DraftRef {
  const file = resolve(draft);
  const usage = (message: string, hint: string) => new ProseError('E_USAGE', message, { hint });
  let st;
  try { st = lstatSync(file); } catch { throw new ProseError('E_NOT_FOUND', `No such file: ${draft.slice(0, 200)}`); }
  if (st.isSymbolicLink()) throw usage('The draft is a symbolic link', 'Strike the real file: a removal rewrites the file in place, and a link is not followed');
  if (!st.isFile()) throw new ProseError('E_NOT_FOUND', `Not a file: ${draft.slice(0, 200)}`);
  const rel = relative(project, file);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw usage('The draft is not inside the project', `Pass a draft under ${project}`);
  const real = relative(realpathSync(project), realpathSync(file));
  if (real.startsWith('..') || isAbsolute(real)) throw usage('The draft is not inside the project', 'A folder in its path leads outside the project');
  const source = rel.split(sep).join('/');
  if (source.split('/')[0] === PROJECT_DIR) throw usage(`A file inside ${PROJECT_DIR}/ cannot be struck`, 'Strike a draft of the project, not prose\'s own files');
  if (!DRAFT_EXT.test(source)) throw usage('Cannot tell the format of the draft', 'Use .fountain, .md or .dialog.yaml');
  return { file, source, key: strikeKey(source) };
}

/** The draft a strike directory belongs to (from its draft.json), or null when it is missing or not ours. */
export function draftOf(dir: string): string | null {
  try {
    const raw = JSON.parse(readFileSync(join(dir, 'draft.json'), 'utf8')) as { schema?: unknown; source?: unknown };
    return raw.schema === DRAFT_SCHEMA && typeof raw.source === 'string' ? raw.source : null;
  } catch { return null; }
}

/** Every strike directory of the project: its key, the draft it belongs to, and the directory. Not locked. */
export function listStrikeDirs(project: string): Array<{ key: string; source: string; dir: string }> {
  const root = strikesDir(project);
  if (!existsSync(root)) return [];
  const out: Array<{ key: string; source: string; dir: string }> = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || !ID_RE.test(e.name)) continue;
    const dir = join(root, e.name);
    const source = draftOf(dir);
    if (source) out.push({ key: e.name, source, dir });
  }
  return out;
}

/** What a writer holds while it has the lock: the log as read, and `append` for the next row. */
export interface StrikeWriter {
  dir: string;
  events: StrikeEvent[];
  ctx: LockContext;
  /** Append one row (schema, at and seq added); returns what was stored. */
  append(row: NewEvent): StrikeEvent;
}

/**
 * Run `fn` holding the draft's strike lock. The directory and draft.json are made first (so the lock has somewhere to
 * live), the log is read under the lock, and `append` numbers and writes one row at a time (a torn last line is
 * terminated first, so it stays one skipped line). Synchronous: for the command line.
 */
export function withStrikes<T>(project: string, draft: DraftRef, fn: (w: StrikeWriter) => T, opts: LockOptions = {}): T {
  const dir = strikeDir(project, draft.key);
  mkdirSync(dir, { recursive: true });
  const have = draftOf(dir);
  if (have === null) writeFileAtomic(join(dir, 'draft.json'), JSON.stringify({ schema: DRAFT_SCHEMA, source: draft.source, createdAt: new Date().toISOString() }, null, 2) + '\n');
  else if (lowerOnWindows(have) !== lowerOnWindows(draft.source)) throw new ProseError('E_CONFLICT', `${draft.key} already belongs to another draft (${have})`, { hint: 'Rename the draft; two paths made the same strike folder' });
  return withDirLock(dir, { noun: 'strikes', id: draft.key, project }, ctx => {
    const file = join(dir, 'events.jsonl');
    const text = readText(file);
    const { events } = parseStrikeLog(text);
    let torn = text !== '' && !text.endsWith('\n');
    let seq = events.reduce((m, e) => Math.max(m, e.seq), 0);
    const writer: StrikeWriter = {
      dir, events, ctx,
      append(row) {
        const stored = StrikeEventSchema.parse({ ...row, schema: EVENT_SCHEMA, at: new Date().toISOString(), seq: ++seq });
        appendFileSync(file, (torn ? '\n' : '') + JSON.stringify(stored) + '\n');
        torn = false;
        events.push(stored);
        return stored;
      },
    };
    return fn(writer);
  }, opts);
}

/** The stored row of this type and event id, when a retry already wrote it. */
export const storedByEventId = (events: StrikeEvent[], type: StrikeEvent['type'], eventId: string | undefined): StrikeEvent | undefined =>
  eventId === undefined ? undefined : events.find(e => e.type === type && e.eventId === eventId);
