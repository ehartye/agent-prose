import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import { loadVoices, voiceFor } from '../voice.ts';
import { checkSet } from './check.ts';
import { FEATURE_SET_ID, centered, featureVector } from './features.ts';
import { withSetLock, writeFileAtomic, type LockContext, type LockOptions } from './fsutil.ts';
import { globalTasteDir, projectTasteDir, setDir } from './paths.ts';
import { readPrediction, sealValid, variantHash, type Prediction } from './prediction.ts';
import { readSet, variantPath, writeSet, type PromptSet } from './sets.ts';
import { VERDICT_SCHEMA, appendLedgerOnce, appendVerdictsOnce, type Verdict } from './verdicts.ts';

/** Weight of one loser in an unexplained pick: one choice always totals about one duel (two shown = a duel, weight 1). */
export const pickWeight = (shownCount: number): number => 1 / (shownCount - 1);

export const LEDGER_SCHEMA = 'prose/ledger@1';
export const PENDING_SCHEMA = 'prose/pick-pending@1';

export type VoidReason = 'edited' | 'variant-changed';

export interface Reveal {
  agent: { pick: number; shortlist: number[]; why: string; hit: boolean; shortlistHit: boolean; sealValid: boolean; voided?: VoidReason };
}

export interface PickResult {
  set: string; picked: number; file: string;
  /** The verdict rows this pick consists of (one per other variant shown). */
  verdicts: number;
  /** Of those, how many were newly written (to the project log, the per-user log, or both)... */
  appended: number;
  /** ...and how many both logs already held (a retry after an interrupted pick). */
  skipped: number;
  /** Present when every row was already logged. */
  note?: string;
  reveal: Reveal | null;
  /** Set when a sealed prediction was discarded at pick time: it is recorded as a missed prediction, not dropped. */
  voided?: VoidReason;
  next: string;
}

export type PickOptions = { tags?: string[]; noPredict?: boolean; now?: Date; lock?: LockOptions };

/** Records the owner's pick. The set is re-read under its lock, so `set` only identifies it. */
export function recordPick(project: string, set: PromptSet, pick: number, opts: PickOptions): PickResult {
  return withSetLock(project, set.id, ctx => recordPickLocked(project, readSet(project, set.id), pick, opts, ctx), opts.lock);
}

/** Why a sealed prediction can no longer be trusted (edited after sealing, or a shown variant changed), or null. */
function predictionProblem(project: string, set: PromptSet, p: Prediction): { reason: VoidReason; message: string } | null {
  if (!sealValid(p)) return { reason: 'edited', message: `The sealed prediction for ${set.id} was edited after sealing` };
  for (const i of p.shown) {
    let now: string | null = null;
    try { now = variantHash(project, set, i); } catch { now = null; }
    if (now !== p.hashes[String(i)]) return { reason: 'variant-changed', message: `variant ${i} changed after the prediction was sealed` };
  }
  return null;
}

const pendingFile = (project: string, id: string) => join(setDir(project, id), 'pick.pending.json');

/** The pick an interrupted earlier attempt was recording, if any: a retry must finish that pick, not another. */
function pendingPick(project: string, id: string): number | null {
  const f = pendingFile(project, id);
  if (!existsSync(f)) return null;
  let pick: unknown;
  try { pick = JSON.parse(readFileSync(f, 'utf8'))?.pick; } catch { pick = undefined; }
  if (!Number.isInteger(pick)) throw new ProseError('E_SCHEMA', `${f} is not a valid pending pick`, { hint: 'If no pick was interrupted, delete the file' });
  return pick as number;
}

function recordPickLocked(project: string, set: PromptSet, pick: number, opts: PickOptions, ctx: LockContext): PickResult {
  const now = opts.now ?? new Date();
  if (set.picked !== undefined) throw new ProseError('E_CONFLICT', `Set ${set.id} was already picked (variant ${set.picked})`, { hint: 'Start a new set with prose set new' });
  const pending = pendingPick(project, set.id);
  if (pending !== null && pending !== pick) {
    throw new ProseError('E_CONFLICT', `An earlier pick of variant ${pending} for set ${set.id} was interrupted after its verdicts were logged`, {
      hint: `Finish it first: prose set pick ${set.id} --pick ${pending}`,
    });
  }
  if (!set.variants.some(v => v.index === pick)) throw new ProseError('E_USAGE', `Set ${set.id} has no variant ${pick}`, { hint: `Variants: ${set.variants.map(v => v.index).join(', ')}` });
  let prediction = readPrediction(project, set.id, set);
  let discarded: { prediction: Prediction; reason: VoidReason } | null = null;
  if (prediction) {
    const broken = predictionProblem(project, set, prediction);
    if (broken) {
      if (!opts.noPredict) throw new ProseError('E_CONFLICT', broken.message, { hint: `Restore the file, or record the pick without a guess: prose set pick ${set.id} --pick ${pick} --no-predict` });
      // a tampered prediction proves nothing, so there is no reveal; but it is recorded as a voided miss below, so tampering cannot hide a miss
      discarded = { prediction, reason: broken.reason };
      prediction = null;
    }
  }
  if (!prediction && !opts.noPredict) {
    throw new ProseError('E_PREDICTION_REQUIRED', `Seal a prediction before recording the pick for ${set.id}`, {
      hint: `prose predict --set ${set.id} --pick <n> --why "..." (or --no-predict to record the pick without a guess)`,
    });
  }
  let shown: number[];
  if (prediction) {
    shown = prediction.shown; // exactly what the owner was shown, frozen at predict time
    if (!shown.includes(pick)) throw new ProseError('E_USAGE', `Variant ${pick} was not among the variants the owner was shown`, { hint: `Shown: ${shown.join(', ')}` });
  } else {
    ctx.heartbeat();
    const check = checkSet(project, set);
    if (!check.ok) throw new ProseError('E_USAGE', `Set ${set.id} has fewer than two surviving variants, so there is nothing to choose between`, { hint: check.next });
    if (!check.keep.includes(pick)) {
      throw new ProseError('E_USAGE', `Variant ${pick} was rejected by the set check, so the owner should not have seen it`, { hint: check.rejected.map(r => `#${r.index}: ${r.reasons.join('; ')}`).join(' | ') });
    }
    shown = check.keep;
  }
  const docs = shown.map(i => loadDocument(variantPath(project, set, set.variants.find(v => v.index === i)!), { form: set.form }));
  const xs = centered(docs.map(featureVector));
  const side = (i: number) => ({ index: i, x: xs[shown.indexOf(i)] });
  let voices: string[] = [];
  try {
    const bibles = loadVoices(project);
    voices = [...new Set(docs.flatMap(d => d.blocks.map(b => b.speaker).filter((s): s is string => !!s)).map(s => voiceFor(bibles, s)?.id).filter((v): v is string => !!v))];
  } catch { voices = []; }
  const register = docs[0].register ?? null;

  const rows: Verdict[] = shown.filter(i => i !== pick).map(loser => ({
    schema: VERDICT_SCHEMA, at: now.toISOString(), project, set: set.id, setUid: set.uid, kind: 'pick' as const, form: set.form, register, voices,
    winner: side(pick), loser: side(loser), weight: pickWeight(shown.length), tags: opts.tags ?? [], features: FEATURE_SET_ID, shown, n: shown.length,
  }));
  // Order matters for crash safety: pick.pending.json is written FIRST (a retry must repeat this pick, so the logs
  // never hold two contradictory picks), the appends are deduplicated, and set.json (the "picked" marker) is
  // written LAST, so a retry after a crash is safe.
  ctx.heartbeat();
  writeFileAtomic(pendingFile(project, set.id), JSON.stringify({ schema: PENDING_SCHEMA, pick, at: now.toISOString() }) + '\n');
  ctx.heartbeat();
  const inProject = appendVerdictsOnce(join(projectTasteDir(project), 'verdicts.jsonl'), rows);
  ctx.heartbeat();
  const inGlobal = appendVerdictsOnce(join(globalTasteDir(), 'verdicts.jsonl'), rows);
  const appended = rows.filter((_, i) => inProject[i] || inGlobal[i]).length;

  let reveal: Reveal | null = null;
  if (prediction) {
    reveal = {
      agent: {
        pick: prediction.pick, shortlist: prediction.shortlist, why: prediction.why,
        hit: prediction.pick === pick, shortlistHit: prediction.pick === pick || prediction.shortlist.includes(pick),
        sealValid: sealValid(prediction),
      },
    };
    ctx.heartbeat();
    appendLedgerOnce(join(globalTasteDir(), 'predictions.jsonl'), { schema: LEDGER_SCHEMA, at: now.toISOString(), project, set: set.id, setUid: set.uid, form: set.form, picked: pick, ...reveal });
    writeFileAtomic(join(setDir(project, set.id), 'reveal.json'), JSON.stringify({ schema: 'prose/reveal@1', picked: pick, at: now.toISOString(), ...reveal }, null, 2) + '\n');
  }
  if (discarded) {
    const d = discarded.prediction;
    ctx.heartbeat();
    appendLedgerOnce(join(globalTasteDir(), 'predictions.jsonl'), {
      schema: LEDGER_SCHEMA, at: now.toISOString(), project, set: set.id, setUid: set.uid, form: set.form, picked: pick,
      agent: { pick: d.pick, shortlist: d.shortlist, why: d.why, hit: false, shortlistHit: false, sealValid: false, voided: discarded.reason },
    });
  }

  ctx.heartbeat();
  writeSet(project, { ...set, picked: pick, pickedAt: now.toISOString() });
  try { rmSync(pendingFile(project, set.id), { force: true, maxRetries: 10, retryDelay: 10 }); } catch { /* the pick is recorded; a leftover is ignored once set.json says picked */ }
  const file = set.variants.find(v => v.index === pick)!.file;
  return {
    set: set.id, picked: pick, file, verdicts: rows.length, appended, skipped: rows.length - appended,
    ...(rows.length && !appended ? { note: 'Every verdict for this pick was already logged (a retry after an interrupted pick); nothing was appended' } : {}),
    reveal,
    ...(discarded ? { voided: discarded.reason } : {}),
    next: `Apply the choice if the owner wants it: copy ${join(setDir(project, set.id), file)} over ${resolve(project, set.source)}` +
      (discarded ? `. The sealed prediction was discarded (${discarded.reason}) and is recorded as a voided miss` : ''),
  };
}
