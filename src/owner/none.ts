// "None of these": the owner rejected every variant of a set and said why. This is an outcome of the set, not a judgement
// between variants. It appends one `prose/verdict-none@1` row (project log and per-user log, never a pick or a duel), reveals
// the sealed prediction unscored, and closes the set (`sentBack` on set.json, written last, so a retry after a crash is safe).
import { join } from 'node:path';
import { ProseError } from '../errors.ts';
import { modelRevealUnscored, type ModelUnscored } from '../taste/reveal.ts';
import { checkSet } from './check.ts';
import { newFeedback, type Feedback, type FeedbackInput } from './feedback.ts';
import { withSetLock, writeFileAtomic, type LockContext, type LockOptions } from './fsutil.ts';
import { globalTasteDir, projectTasteDir, setDir } from './paths.ts';
import { predictionProblem, shownContext } from './pick.ts';
import { readPrediction, sealValid, type Prediction } from './prediction.ts';
import { readSet, writeSet, type PromptSet } from './sets.ts';
import { NONE_VERDICT_SCHEMA, appendNoneOnce, type NoneVerdict } from './verdicts.ts';

/** The reveal of a sent-back set: the agent's sealed guess shown but not scored (there was no pick to compare), and the model's likewise. */
export interface NoneReveal {
  agent: { pick: number; shortlist: number[]; why: string; sealValid: boolean; unscored: true } | null;
  model?: ModelUnscored;
  /** Why there is no agent guess to show. */
  note?: string;
}

export interface NoneResult {
  set: string; outcome: 'none';
  closest: number | null; reasons: string[]; note?: string; shown: number[];
  /** Whether the verdict log rows were newly written (false: a retry after an interrupted send-back). */
  appended: boolean;
  reveal: NoneReveal;
  next: string;
}

export type NoneOptions = { now?: Date; lock?: LockOptions };

/** Records "none of these". The set is re-read under its lock, so `id` only identifies it. */
export function recordNone(project: string, id: string, input: FeedbackInput, opts: NoneOptions = {}): NoneResult {
  // Validated before the lock and before anything is read: a bad request never costs a lock.
  const feedback = newFeedback(input);
  return withSetLock(project, id, ctx => recordNoneLocked(project, readSet(project, id), feedback, opts, ctx), opts.lock);
}

const revealOf = (prediction: Prediction | null, model: ModelUnscored | null, note?: string): NoneReveal => ({
  agent: prediction ? { pick: prediction.pick, shortlist: prediction.shortlist, why: prediction.why, sealValid: sealValid(prediction), unscored: true } : null,
  ...(model ? { model } : {}),
  ...(note ? { note } : {}),
});

function recordNoneLocked(project: string, set: PromptSet, feedback: Feedback, opts: NoneOptions, ctx: LockContext): NoneResult {
  const now = opts.now ?? new Date();
  if (set.picked !== undefined) throw new ProseError('E_CONFLICT', `Set ${set.id} was already picked (variant ${set.picked}), so it cannot be sent back`, { hint: 'Make a new set with prose set new' });
  if (set.sentBack !== undefined) throw new ProseError('E_CONFLICT', `Set ${set.id} was already sent back`, { hint: `Make a new set with prose set new --redo ${set.id}` });

  // What the owner was shown: the sealed prediction's frozen list, else what the set check keeps. A tampered seal proves nothing, so it is ignored.
  let prediction = readPrediction(project, set.id, set);
  let tampered = false;
  if (prediction && predictionProblem(project, set, prediction)) { tampered = true; prediction = null; }
  ctx.heartbeat();
  const shown = prediction ? prediction.shown : checkSet(project, set).keep;
  if (feedback.closest !== null && !shown.includes(feedback.closest)) {
    throw new ProseError('E_USAGE', `Variant ${feedback.closest} was not among the variants the owner was shown`, { hint: shown.length ? `Shown: ${shown.join(', ')}` : 'Omit --closest' });
  }

  let register: string | null = null;
  let voices: string[] = [];
  try { ({ register, voices } = shownContext(project, set, shown)); } catch { /* the outcome stands without them */ }
  const row: NoneVerdict = {
    schema: NONE_VERDICT_SCHEMA, kind: 'none', at: now.toISOString(), project, set: set.id, setUid: set.uid, form: set.form, register, voices,
    closest: feedback.closest, reasons: feedback.reasons, ...(feedback.note !== undefined ? { note: feedback.note } : {}), shown,
  };
  // Order for crash safety: the log rows (deduplicated), then the reveal, and set.json (the "closed" marker) last, so a retry finishes the job.
  ctx.heartbeat();
  const inProject = appendNoneOnce(join(projectTasteDir(project), 'verdicts.jsonl'), row);
  ctx.heartbeat();
  const inGlobal = appendNoneOnce(join(globalTasteDir(), 'verdicts.jsonl'), row);

  const reveal = revealOf(
    prediction, prediction ? modelRevealUnscored(project, set.id, prediction) : null,
    prediction ? undefined : tampered ? 'The sealed prediction for this set was edited after sealing, so nothing is revealed' : 'No prediction was sealed for this set, so there is nothing to reveal',
  );
  ctx.heartbeat();
  writeFileAtomic(join(setDir(project, set.id), 'reveal.json'), JSON.stringify({ schema: 'prose/reveal@1', outcome: 'none', picked: null, at: now.toISOString(), ...reveal }, null, 2) + '\n');
  ctx.heartbeat();
  writeSet(project, { ...set, sentBack: { ...feedback, at: now.toISOString(), shown } });
  return {
    set: set.id, outcome: 'none', closest: feedback.closest, reasons: feedback.reasons, ...(feedback.note !== undefined ? { note: feedback.note } : {}), shown,
    appended: inProject || inGlobal, reveal,
    next: `The set is closed. Read the feedback, say what you will change, and make a new set: prose set new --redo ${set.id}`,
  };
}
