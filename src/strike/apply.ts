// Apply and undo: the only code that rewrites a draft. Everything here is built to refuse rather than guess.
//
// The protocol (spec 3.4a), under the draft's strike lock:
//   1. Recover. An `apply.pending.json` left by a crash is settled first: the draft equals its `after` (the write landed:
//      the missing log row is appended), equals its `before` (nothing landed: the file is dropped), or neither (the draft
//      changed during the interrupted write: E_CONFLICT, nothing is touched).
//   2. Read the draft's raw bytes, plan the removal, verify that the re-parsed result is exactly the old units minus the
//      struck ones (plan.ts), compute the digest and compare it with `--confirm`.
//   3. Write the intent file, then (the bytes still being the ones we planned from) rename the new text over the draft,
//      read it back, append the log row, delete the intent file. Crash order is the one `set pick` uses: intent first,
//      mutation, log last.
// Undo is the same protocol with the inverse plan, and refuses unless the draft is exactly as the apply left it.
import { existsSync, lstatSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { parseDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import type { Format } from '../kinds.ts';
import { lint } from '../lint/lint.ts';
import { draftHash } from '../owner/original.ts';
import { writeFileAtomic, type LockOptions } from '../owner/fsutil.ts';
import { strikeLines, type StrikeLine } from './lines.ts';
import { planRemoval, restoreRows, type RemovalPlan, type Removed } from './plan.ts';
import { refOf } from './spans.ts';
import {
  EVENT_SCHEMA, StrikeEventSchema, foldStrikes, storedByEventId, withStrikes,
  type DraftRef, type NewEvent, type PendingStrike, type StrikeFold, type StrikeWriter,
} from './store.ts';

export const PENDING_SCHEMA = 'prose/strike-pending@1';
export const PENDING_FILE = 'apply.pending.json';

/**
 * The intent file. Beyond the spec's `{ kind, id, before, after, at }` it carries `row`: the log row the write will
 * produce, so a crash between the rename and the log append can be finished without recomputing anything.
 */
const PendingSchema = z.strictObject({
  schema: z.literal(PENDING_SCHEMA), kind: z.enum(['apply', 'undo']), id: z.string().regex(/^a\d+$/),
  before: z.string().regex(/^[0-9a-f]{64}$/), after: z.string().regex(/^[0-9a-f]{64}$/), at: z.string(), row: z.record(z.string(), z.unknown()),
});

export interface WriteOptions {
  /** The form to read the draft as (the session's set form); default: what the draft declares. */
  form?: string;
  /** Test hook: the rename of the atomic write (a crash is a rename that throws). */
  rename?: (from: string, to: string) => void;
  /** Test hook: runs after the intent file is written and before the draft is looked at again (an editor saving at that instant). */
  beforeWrite?: () => void;
  lock?: LockOptions;
  eventId?: string;
}

export interface Recovered { kind: 'apply' | 'undo'; id: string; outcome: 'completed' | 'abandoned' }

/** One removed row as an owner reads it: the lines, the exact text (line endings folded to LF), and the strike behind it. */
export interface RemovedView { ref: string; start: number; end: number; kind: Removed['kind']; text: string; strike?: string; strikeRef?: string; reason?: string; note?: string }

export function removedView(removed: Removed[], strikes: Array<{ id: string; ref: string; reason: string; note?: string }>): RemovedView[] {
  const by = new Map(strikes.map(s => [s.id, s]));
  return removed.map(r => {
    const s = r.strike ? by.get(r.strike) : undefined;
    return {
      ref: refOf(r.start, r.end), start: r.start, end: r.end, kind: r.kind,
      text: r.raw.replace(/\r\n?/g, '\n').replace(/\n$/, ''),
      ...(r.strike ? { strike: r.strike } : {}), ...(s ? { strikeRef: s.ref, reason: s.reason, ...(s.note ? { note: s.note } : {}) } : {}),
    };
  });
}

/** The draft's raw text, refusing a file that is not valid UTF-8 (writing it back would change bytes we cannot read). */
function readRaw(file: string): { text: string; bytes: Buffer } {
  let bytes: Buffer;
  try { bytes = readFileSync(file); } catch { throw new ProseError('E_NOT_FOUND', 'The draft cannot be read', { hint: 'It may have moved or been deleted' }); }
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new ProseError('E_USAGE', 'The draft is not valid UTF-8, so lines cannot be removed safely', { hint: 'Save it as UTF-8 first' });
  return { text, bytes };
}

function parsed(draft: DraftRef, text: string, form: string | undefined): { format: Format; form: string } {
  const doc = parseDocument(draft.file, text, form ? { form } : {});
  return { format: doc.format, form: doc.form };
}

/** The lint of a draft before and after: report only. Never throws (a draft that cannot be linted reports null). */
export interface LintReport { ok: boolean; errors: number; warnings: number; newRules: string[] }
function lintReport(draft: DraftRef, before: string, after: string, form: string | undefined): LintReport | null {
  try {
    const was = lint(parseDocument(draft.file, before, form ? { form } : {}));
    const now = lint(parseDocument(draft.file, after, form ? { form } : {}));
    const had = new Set([...was.errors, ...was.warnings].map(f => f.rule));
    return { ok: now.ok, errors: now.errors.length, warnings: now.warnings.length, newRules: [...new Set([...now.errors, ...now.warnings].map(f => f.rule))].filter(r => !had.has(r)) };
  } catch { return null; }
}

const pendingPath = (w: StrikeWriter) => join(w.dir, PENDING_FILE);
const dropPending = (w: StrikeWriter) => { try { rmSync(pendingPath(w), { force: true, maxRetries: 10, retryDelay: 10 }); } catch { /* a leftover is settled by the next recovery */ } };

/** The draft's hash now, or null when it cannot be read. */
const hashNow = (file: string): string | null => { try { return draftHash(readFileSync(file, 'utf8')); } catch { return null; } };

/**
 * Settle an interrupted write (step 1). Null when there is none. `completed`: the draft had changed and the log row is
 * there now. `abandoned`: the write never landed and the intent file is gone. Anything else is E_CONFLICT, nothing touched.
 */
export function recoverPending(w: StrikeWriter, draft: DraftRef): Recovered | null {
  const file = pendingPath(w);
  if (!existsSync(file)) return null;
  const bad = (why: string) => new ProseError('E_SCHEMA', `${file} is not a usable intent file (${why})`, { hint: 'If no apply or undo was interrupted, check the draft and delete the file' });
  let p: z.infer<typeof PendingSchema>;
  try { p = PendingSchema.parse(JSON.parse(readFileSync(file, 'utf8'))); }
  catch { throw bad('unreadable'); }
  const now = hashNow(draft.file);
  if (now !== null && now === p.after && p.after !== p.before) {
    const have = w.events.some(e => (p.kind === 'apply' ? e.type === 'apply' && e.id === p.id : e.type === 'undo' && e.apply === p.id && e.after === p.after));
    if (!have) {
      const checked = StrikeEventSchema.safeParse({ ...p.row, schema: EVENT_SCHEMA, at: p.at, seq: 1 });
      if (!checked.success || checked.data.type !== p.kind) throw bad('its log row is damaged');
      w.append(p.row as NewEvent);
    }
    dropPending(w);
    return { kind: p.kind, id: p.id, outcome: 'completed' };
  }
  if (now !== null && now === p.before) { dropPending(w); return { kind: p.kind, id: p.id, outcome: 'abandoned' }; }
  throw new ProseError('E_CONFLICT', `The draft changed during an interrupted ${p.kind}, so nothing was touched`, {
    hint: `Check ${draft.source} (and prose strike list ${draft.source} --state all), then delete ${file} to continue`,
  });
}

const recoveredNext = (r: Recovered): string => (r.outcome === 'completed'
  ? `An earlier ${r.kind} (${r.id}) had written the draft but not the log; the log is complete now. Check the result with prose strike list, and repeat the command if you still need it`
  : `An earlier ${r.kind} (${r.id}) never reached the draft; its intent file is gone`);

/** Everything a write step needs from the world, read once. */
interface Snapshot { text: string; bytes: Buffer; hash: string; format: Format; form: string }
function snapshot(draft: DraftRef, form: string | undefined): Snapshot {
  const { text, bytes } = readRaw(draft.file);
  return { text, bytes, hash: draftHash(text), ...parsed(draft, text, form) };
}

/**
 * Steps 3 to 5: intent file, the last look at the bytes, the atomic write, a read-back, the log row, cleanup. `row` is the
 * log row; `kind` and `id` name the intent. Any failure leaves the intent file in place for recovery to judge.
 */
function commit(w: StrikeWriter, draft: DraftRef, snap: Snapshot, kind: 'apply' | 'undo', id: string, newText: string, row: NewEvent, opts: WriteOptions): void {
  const after = draftHash(newText);
  if (after === snap.hash) throw new ProseError('E_CONFLICT', `The ${kind} would not change the draft, so nothing was written`);
  writeFileAtomic(pendingPath(w), JSON.stringify({ schema: PENDING_SCHEMA, kind, id, before: snap.hash, after, at: new Date().toISOString(), row }) + '\n');
  w.ctx.heartbeat();
  opts.beforeWrite?.();
  // The window against an editor saving at this instant is narrowed here, not closed (the draft is under no lock an editor honours).
  let now: Buffer;
  try {
    if (lstatSync(draft.file).isSymbolicLink()) throw new Error('link');
    now = readFileSync(draft.file);
  } catch { dropPending(w); throw new ProseError('E_CONFLICT', 'The draft changed while the strikes were being applied, so nothing was written', { hint: 'Run the command again' }); }
  if (!now.equals(snap.bytes)) {
    dropPending(w);
    throw new ProseError('E_CONFLICT', 'The draft changed while the strikes were being applied, so nothing was written', { hint: 'Run the command again' });
  }
  const mode = statSync(draft.file).mode & 0o777;
  writeFileAtomic(draft.file, newText, { ...(opts.rename ? { rename: opts.rename } : {}), mode });
  let back: string;
  try { back = readFileSync(draft.file, 'utf8'); } catch { back = ''; }
  if (back !== newText) throw new ProseError('E_INTERNAL', `${draft.source} does not hold what was written; the intent file was kept`, { hint: 'Check the draft by hand, then delete the intent file in its strike folder' });
  w.ctx.heartbeat();
  w.append(row);
  dropPending(w);
}

export interface ApplyOutput { [k: string]: unknown }

/** Pending strikes against this very draft, each with the line it names now; anything that does not line up exactly is E_CONFLICT. */
function strikesOf(fold: StrikeFold, lines: StrikeLine[]): Array<PendingStrike & { line: StrikeLine }> {
  if (fold.pending.length === 0) throw new ProseError('E_CONFLICT', 'Nothing is struck, so there is nothing to apply', { hint: 'Strike a line first: prose strike <draft> --line <ref> --reason <tag>' });
  const stale = fold.pending.filter(p => p.stale);
  if (stale.length) {
    throw new ProseError('E_CONFLICT', `${stale.length} struck line${stale.length === 1 ? ' was' : 's were'} struck against an older draft (${stale.map(s => s.id).join(', ')}), so none can be applied`, {
      hint: 'The draft changed since they were struck. Clear them and strike again: prose strike clear <draft> --all',
    });
  }
  return fold.pending.map(p => {
    const line = lines.find(l => l.ref === p.ref);
    if (!line || line.text !== p.text || line.start !== p.start || line.end !== p.end) {
      throw new ProseError('E_CONFLICT', `${p.id} no longer names the line it was struck on, so nothing was applied`, { hint: `Clear it and strike again: prose strike clear <draft> ${p.id}` });
    }
    return { ...p, line };
  });
}

/**
 * Dry run (no `confirm`): the plan, exactly what would go, and a digest. With `confirm` equal to that digest: the write.
 * A digest that no longer matches (the draft or the strikes changed) is E_CONFLICT carrying the new plan.
 */
export function applyStrikes(project: string, draft: DraftRef, opts: WriteOptions & { confirm?: string } = {}): ApplyOutput {
  if (opts.confirm !== undefined && !/^[0-9a-f]{64}$/.test(opts.confirm)) throw new ProseError('E_USAGE', '--confirm must be the 64-character digest of a dry run', { hint: 'Run prose strike apply <draft> without --confirm to get it' });
  if (!existsSync(join(project, '.agent-prose', 'strikes'))) throw new ProseError('E_CONFLICT', 'Nothing is struck, so there is nothing to apply', { hint: 'Strike a line first' });
  return withStrikes(project, draft, w => {
    const recovered = recoverPending(w, draft);
    if (recovered?.outcome === 'completed') return { applied: false, recovered, next: recoveredNext(recovered) };
    const again = storedByEventId(w.events, 'apply', opts.eventId);
    if (again?.type === 'apply') return { applied: true, duplicate: true, apply: again.id, count: again.strikes.length };
    const snap = snapshot(draft, opts.form);
    const fold = foldStrikes(w.events, snap.hash);
    const strikes = strikesOf(fold, strikeLines(snap.text, snap.format, snap.form));
    const plan: RemovalPlan = planRemoval(snap.text, snap.format, snap.form, snap.hash, strikes.map(s => ({ id: s.id, ref: s.ref, reason: s.reason, line: s.line })));
    const removed = removedView(plan.removed, strikes);
    const after = { hash: draftHash(plan.after), lint: lintReport(draft, snap.text, plan.after, opts.form) };
    const view = { digest: plan.digest, removed, count: plan.count, bytes: plan.bytes };
    if (opts.confirm === undefined) {
      return {
        applied: false, draft: draft.source, ...view, after,
        ...(recovered ? { recovered } : {}),
        next: `Show the owner exactly this text. Only if they agree to remove it, run: prose strike apply ${draft.source} --confirm ${plan.digest}`,
      };
    }
    if (opts.confirm !== plan.digest) {
      throw new ProseError('E_CONFLICT', 'The draft or the strikes changed since that plan was made, so nothing was removed', {
        hint: 'Review the new plan (details.removed), then confirm its digest', details: { plan: view },
      });
    }
    const id = `a${fold.nextApply}`;
    const row: NewEvent = {
      type: 'apply', id, strikes: strikes.map(s => s.id), before: snap.hash, after: after.hash, removed: plan.removed, digest: plan.digest, ...(opts.eventId ? { eventId: opts.eventId } : {}),
    };
    commit(w, draft, snap, 'apply', id, plan.after, row, opts);
    return {
      applied: true, apply: id, draft: draft.source, ...view, before: snap.hash, after,
      ...(recovered ? { recovered } : {}),
      next: `Removed ${plan.count} line${plan.count === 1 ? '' : 's'}. prose strike undo ${draft.source} puts them back while the draft is as this left it${after.lint && after.lint.newRules.length ? `; lint now reports new findings (${after.lint.newRules.join(', ')}), for the owner to judge` : ''}`,
    };
  }, opts.lock);
}

/** Restore the latest un-undone apply: refused unless the draft is exactly as that apply left it, and verified by hash before and after. */
export function undoStrikes(project: string, draft: DraftRef, opts: WriteOptions & { apply?: string } = {}): ApplyOutput {
  if (!existsSync(join(project, '.agent-prose', 'strikes'))) throw new ProseError('E_CONFLICT', 'Nothing was applied, so there is nothing to undo');
  return withStrikes(project, draft, w => {
    const recovered = recoverPending(w, draft);
    if (recovered?.outcome === 'completed') return { undone: null, recovered, next: recoveredNext(recovered) };
    const again = storedByEventId(w.events, 'undo', opts.eventId);
    if (again?.type === 'undo') return { undone: again.apply, duplicate: true };
    const snap = snapshot(draft, opts.form);
    const fold = foldStrikes(w.events, snap.hash);
    const last = [...fold.applied].reverse().find(a => !a.undone);
    if (!last) throw new ProseError('E_CONFLICT', 'There is no applied removal to undo', { hint: 'Nothing was removed, or every removal was already undone' });
    if (opts.apply !== undefined && opts.apply !== last.id) throw new ProseError('E_CONFLICT', `${opts.apply} is not the latest removal (${last.id}), so it was not undone`, { hint: 'Only the latest removal can be undone' });
    if (last.after !== snap.hash) {
      throw new ProseError('E_CONFLICT', `The draft changed since ${last.id} removed lines from it, so putting them back would overwrite those changes`, {
        hint: `Nothing was written. The removed text is in the log: prose strike list ${draft.source} --state applied (re-add it by hand if it is still wanted)`,
      });
    }
    const restored = restoreRows(snap.text, last.removed);
    if (restored === null || draftHash(restored) !== last.before) {
      throw new ProseError('E_CONFLICT', `${last.id} cannot be restored exactly, so nothing was written`, { hint: `Its removed text is in the log: prose strike list ${draft.source} --state applied` });
    }
    const row: NewEvent = { type: 'undo', apply: last.id, before: snap.hash, after: last.before, ...(opts.eventId ? { eventId: opts.eventId } : {}) };
    commit(w, draft, snap, 'undo', last.id, restored, row, opts);
    const lines = last.removed.reduce((n, r) => n + (r.end - r.start + 1), 0);
    return {
      undone: last.id, draft: draft.source, restored: lines, strikes: last.strikes.map(s => s.id), before: snap.hash, after: last.before,
      ...(recovered ? { recovered } : {}),
      next: `The ${last.strikes.length} strike${last.strikes.length === 1 ? ' is' : 's are'} pending again (the draft is as they were made against). Clear them or apply them again`,
    };
  }, opts.lock);
}
