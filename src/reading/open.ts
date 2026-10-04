// Opening sets for the reading page: what a session freezes from a set (shared by `reading open --set` and a batch), and
// the two ways a batch names its sets (`--sets a,b,c` and `--pending`).
import { readdirSync, existsSync } from 'node:fs';

import { loadDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import { resolveSettings } from '../settings.ts';
import { checkSet } from '../owner/check.ts';
import { sessionsDir } from '../owner/paths.ts';
import { predictionProblem } from '../owner/pick.ts';
import { readPrediction, variantHash, type Prediction } from '../owner/prediction.ts';
import { basePath, listSetsDetailed, readSet, type PromptSet } from '../owner/sets.ts';
import { MAX_QUEUE_ITEMS, type QueueItem } from './queue.ts';
import { foldSession, readEvents, readSession, type Session } from './session.ts';
import { roundMaps } from './server.ts';

/** What a session freezes from a set: the shown variants and their hashes, the draft's register, words per minute and target. */
export interface OpenPlan {
  set: PromptSet;
  prediction: Prediction | null;
  shown: number[];
  hashes: Record<string, string>;
  register: string | null;
  wpm: number | null;
  target: Session['target'];
}

/**
 * Check a set the way `reading open --set` always has, and read what the session will freeze. `predict` is false for
 * --no-predict. Throws: fewer than two surviving variants (E_USAGE), a tampered seal with predict (E_CONFLICT), no seal with
 * predict (E_PREDICTION_REQUIRED). A tampered seal with --no-predict is ignored, as `set pick` ignores it.
 */
export function planOpen(project: string, set: PromptSet, predict: boolean): OpenPlan {
  if (set.sentBack !== undefined) throw new ProseError('E_CONFLICT', `Set ${set.id} was sent back (none of its variants was wanted), so it is closed`, { hint: `Make a new set: prose set new --redo ${set.id}` });
  const check = checkSet(project, set);
  if (!check.ok) throw new ProseError('E_USAGE', `Set ${set.id} has fewer than two surviving variants, so there is nothing to put on the page`, { hint: check.next });
  let prediction = readPrediction(project, set.id, set);
  if (prediction) {
    const broken = predictionProblem(project, set, prediction);
    if (broken) {
      if (predict) throw new ProseError('E_CONFLICT', broken.message, { hint: `Restore the file, or open without a guess: prose reading open --set ${set.id} --no-predict` });
      prediction = null; // a tampered prediction proves nothing: ignored, as set pick ignores it
    }
  }
  if (!prediction && predict) {
    throw new ProseError('E_PREDICTION_REQUIRED', `Seal a prediction before opening ${set.id} for the owner`, {
      hint: `prose predict --set ${set.id} --pick <n> --shortlist <n,n> --why "..." (or open with --no-predict to skip the guess)`,
    });
  }
  const shown = prediction ? prediction.shown : check.keep;
  const hashes = prediction ? prediction.hashes : Object.fromEntries(shown.map(i => [String(i), variantHash(project, set, i)]));
  // The draft the set was made from sets the register, the words per minute and any declared length (as measure reads them).
  const doc = loadDocument(basePath(project, set), { form: set.form });
  const settings = resolveSettings(doc, project);
  const t = settings.target;
  const target = t && (t.minutes !== undefined || t.words !== undefined) ? { ...(t.minutes !== undefined ? { minutes: t.minutes } : {}), ...(t.words !== undefined ? { words: t.words } : {}) } : null;
  return { set, prediction, shown, hashes, register: doc.register ?? null, wpm: settings.wpm, target };
}

/** The rail's two labels for a set: who speaks (the first line the set revises, else the set id) and where it is (draft file and line, else the form). */
export function railLabels(set: PromptSet): Pick<QueueItem, 'who' | 'where'> {
  const first = set.original?.lines[0];
  if (!first) return { who: set.id.slice(0, 200), where: set.form.slice(0, 300) };
  return { who: (first.speaker ?? set.id).slice(0, 200), where: `${set.original!.source.split(/[\\/]/).pop()}, line ${first.ref}`.slice(0, 300) };
}

/** `--sets a,b,c` as a list: order kept, blanks ignored, duplicates and more than 50 refused. */
export function parseSetList(text: string): string[] {
  const ids = text.split(',').map(x => x.trim()).filter(Boolean);
  if (ids.length === 0) throw new ProseError('E_USAGE', '--sets needs a comma-separated list of set ids', { hint: 'prose reading open --sets a,b,c' });
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new ProseError('E_USAGE', `Set ${dup} is named twice in --sets`, { hint: 'Name each set once' });
  if (ids.length > MAX_QUEUE_ITEMS) throw new ProseError('E_USAGE', `--sets names ${ids.length} sets; a batch holds at most ${MAX_QUEUE_ITEMS}`, { hint: `Split it into batches of ${MAX_QUEUE_ITEMS}` });
  return ids;
}

/** Why one set in a batch cannot be opened. */
export interface Failure { set: string; code: string; reason: string }

/** Read and check every named set; nothing is created. Every failure is collected, none stops the others. */
export function planBatch(project: string, ids: string[], predict: boolean): { plans: OpenPlan[]; failures: Failure[] } {
  const plans: OpenPlan[] = [];
  const failures: Failure[] = [];
  for (const id of ids) {
    try { plans.push(planOpen(project, readSet(project, id), predict)); }
    catch (e) { failures.push({ set: id, code: e instanceof ProseError ? e.code : 'E_INTERNAL', reason: e instanceof ProseError ? e.message : String((e as Error)?.message ?? e) }); }
  }
  return { plans, failures };
}

/** The all-or-nothing error: every failing set with its reason; E_PREDICTION_REQUIRED when a missing seal is the only problem. */
export function batchError(failures: Failure[], total: number): ProseError {
  const onlySeals = failures.every(f => f.code === 'E_PREDICTION_REQUIRED');
  const list = failures.map(f => `${f.set}: ${f.reason}`).join('; ');
  return new ProseError(onlySeals ? 'E_PREDICTION_REQUIRED' : 'E_USAGE', `${failures.length} of ${total} sets cannot be opened, so nothing was opened: ${list}`, {
    hint: onlySeals
      ? `Seal each: prose predict --set <id> --pick <n> --shortlist <n,n> --why "..." (or open with --no-predict to skip the guesses)`
      : 'Fix or leave out the sets listed, then open the batch again',
    details: { failures },
  });
}

/** Set ids with a session that is still open (not shipped, not abandoned), counting every round's set, with the session that holds each. */
export function setsInOpenSessions(project: string): Map<string, string> {
  const held = new Map<string, string>();
  const dir = sessionsDir(project);
  if (!existsSync(dir)) return held;
  for (const id of readdirSync(dir)) {
    try {
      const session = readSession(project, id);
      const events = readEvents(project, id);
      const stage = foldSession(session, events).stage;
      if (stage === 'shipped' || stage === 'abandoned') continue;
      for (const setId of roundMaps(session, events).roundSet.values()) if (!held.has(setId)) held.set(setId, id);
    } catch { /* an unreadable session holds nothing */ }
  }
  return held;
}

/**
 * Every set with a sealed, intact prediction, no pick, two or more surviving variants and no open session, oldest first. A set with
 * no prediction or already picked is simply not pending; a set that is otherwise not ready is listed in `skipped` with the reason.
 */
export function pendingSets(project: string, limit: number): { plans: OpenPlan[]; skipped: Array<{ set: string; reason: string }>; remaining: number } {
  const { sets, problems } = listSetsDetailed(project);
  const held = setsInOpenSessions(project);
  const skipped: Array<{ set: string; reason: string }> = problems.map(p => ({ set: p.id, reason: p.error }));
  const plans: OpenPlan[] = [];
  for (const set of [...sets].reverse()) {
    if (set.picked !== undefined || set.sentBack !== undefined) continue;
    try {
      const prediction = readPrediction(project, set.id, set);
      if (!prediction) continue;
      const broken = predictionProblem(project, set, prediction);
      if (broken) { skipped.push({ set: set.id, reason: broken.message }); continue; }
      const open = held.get(set.id);
      if (open) { skipped.push({ set: set.id, reason: `already open in session ${open}` }); continue; }
      plans.push(planOpen(project, set, true));
    } catch (e) { skipped.push({ set: set.id, reason: e instanceof ProseError ? e.message : String((e as Error)?.message ?? e) }); }
  }
  return { plans: plans.slice(0, limit), skipped, remaining: Math.max(0, plans.length - limit) };
}
