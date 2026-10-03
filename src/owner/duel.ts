/**
 * Head-to-head duels from the reading page: `prose set duel`. A duel is a judgement between two variants, appended to
 * the taste logs as ONE verdict row. It never ships a set: no predictions ledger row, no reveal.json, no set.json
 * `picked` (only recordPick does that), so a set can be dueled many times before it is picked.
 *
 * Row shapes (all weight 1, `shown` = [a, b], n = 2; a head-to-head is the unit weight, see pickWeight):
 *   duel     decisive: winner is the chosen variant, loser the other.
 *   tie      symmetric: winner = a, loser = b in shown order; the order carries no preference.
 *   bothBad  symmetric: winner = a, loser = b in shown order; says nothing about a versus b.
 * M3c decides how to read tie and bothBad (a tie contributes nothing to a Bradley-Terry fit; both-bad says nothing
 * about a versus b), which is why they are kept as their own kinds rather than folded into duels.
 *
 * Within one set the feature vectors `x` are relative to the SET: centred on the set's shown variants (the sealed
 * prediction's frozen list, or the check's keep list), exactly as recordPick centres them, not on the two dueled variants.
 *
 * Across two sets (a refine round: the pinned champion of an earlier set against a variant of a later one) no set holds
 * both, so each side is checked against ITS OWN set (frozen shown list and hashes, or the check's keep list), its raw
 * style features come from its own text with the shared FEATURE_SET_ID, and the pair is centred on the two sides
 * together. For a two-item duel only the difference of the two vectors carries information, so that centring loses
 * nothing. The row is recorded in the CHALLENGER's set (the one the call names; it must hold one of the sides) and
 * the other side carries its own `set` and `setUid`. Both sets are locked, in set-id order (see withSetLocks).
 *
 * An eventId names one judgement: a retry with the same eventId is skipped, a new one is a new judgement.
 */
import { join } from 'node:path';
import { loadDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import { checkSet } from './check.ts';
import { FEATURE_SET_ID, centered, featureVector } from './features.ts';
import { withSetLocks, type LockContext, type LockOptions } from './fsutil.ts';
import { globalTasteDir, projectTasteDir } from './paths.ts';
import { docsContext, predictionProblem, shownContext } from './pick.ts';
import { readPrediction } from './prediction.ts';
import { readSet, variantPath, type PromptSet } from './sets.ts';
import { VERDICT_SCHEMA, appendVerdictsOnce, type Verdict } from './verdicts.ts';

export const DUEL_OUTCOMES = ['a', 'b', 'tie', 'bothBad'] as const;
export type DuelOutcome = typeof DUEL_OUTCOMES[number];

/** One side of a duel: a variant of the call's set (a bare number), or `{ set, index }` of another set (set defaults to the call's). */
export type DuelSide = number | { set?: string; index: number };

export interface DuelInput {
  a: DuelSide; b: DuelSide; outcome: DuelOutcome; eventId: string;
  /** Which side of the page `a` was on. Presentation only: it is not stored (the verdict schema has no field for it). */
  position?: 'ab' | 'ba';
}
export type DuelOptions = { now?: Date; lock?: LockOptions };
export interface DuelResult { appended: number; skipped: number }

/** The verdict kind a duel outcome is logged as. */
export const duelKind = (outcome: DuelOutcome): 'duel' | 'tie' | 'bothBad' => (outcome === 'a' || outcome === 'b' ? 'duel' : outcome);

interface Side { set: string; index: number }
const sideOf = (s: DuelSide, setId: string): Side => (typeof s === 'number' ? { set: setId, index: s } : { set: s.set ?? setId, index: s.index });

/** Records one duel in set `setId` (the challenger's set). Every set is re-read under its lock, so ids only identify them. */
export function recordDuel(project: string, setId: string, input: DuelInput, opts: DuelOptions = {}): DuelResult {
  const a = sideOf(input.a, setId);
  const b = sideOf(input.b, setId);
  if (a.set !== setId && b.set !== setId) throw new ProseError('E_USAGE', `A duel recorded in set ${setId} needs one of its variants`, { hint: `The sides are in sets ${a.set} and ${b.set}` });
  return withSetLocks(project, [a.set, b.set], ctx => recordDuelLocked(project, setId, a, b, input, opts, ctx), opts.lock);
}

/** Checks that `indexes` were among the variants shown in `set` (frozen prediction, else the check's keep list); returns that list. */
function shownIn(project: string, set: PromptSet, indexes: number[], cross: boolean, ctx: LockContext): number[] {
  const where = cross ? `Set ${set.id}: ` : '';
  const known = new Set(set.variants.map(v => v.index));
  const unknown = indexes.find(i => !known.has(i));
  if (unknown !== undefined) throw new ProseError('E_USAGE', `Set ${set.id} has no variant ${unknown}`, { hint: `Variants: ${[...known].join(', ')}` });
  const prediction = readPrediction(project, set.id, set);
  if (prediction) {
    const broken = predictionProblem(project, set, prediction);
    if (broken) throw new ProseError('E_CONFLICT', `${where}${broken.message}`, { hint: 'Restore the file; a duel is only recorded against the variants as sealed' });
    const outside = indexes.find(i => !prediction.shown.includes(i));
    if (outside !== undefined) throw new ProseError('E_USAGE', `${where}Variant ${outside} was not among the variants the owner was shown`, { hint: `Kept variants: ${prediction.shown.join(', ')}` });
    return prediction.shown; // exactly what the owner was shown, frozen at predict time
  }
  ctx.heartbeat();
  const check = checkSet(project, set);
  if (!check.ok) throw new ProseError('E_USAGE', `Set ${set.id} has fewer than two surviving variants, so there is nothing to choose between`, { hint: check.next });
  const outside = indexes.find(i => !check.keep.includes(i));
  if (outside !== undefined) {
    throw new ProseError('E_USAGE', `${where}Variant ${outside} was rejected by the set check, so the owner should not have seen it`, { hint: `Kept variants: ${check.keep.join(', ')}` });
  }
  return check.keep;
}

function recordDuelLocked(project: string, setId: string, sa: Side, sb: Side, input: DuelInput, opts: DuelOptions, ctx: LockContext): DuelResult {
  const { outcome, eventId } = input;
  if (sa.set === sb.set && sa.index === sb.index) throw new ProseError('E_USAGE', 'A duel needs two different variants', { hint: `Got ${sa.index} twice` });
  if (!DUEL_OUTCOMES.includes(outcome)) throw new ProseError('E_USAGE', `Unknown outcome "${outcome}"`, { hint: `Outcomes: ${DUEL_OUTCOMES.join(', ')}` });
  const cross = sa.set !== sb.set;
  const set = readSet(project, setId);
  const other = cross ? readSet(project, sa.set === setId ? sb.set : sa.set) : set;
  for (const s of cross ? [set, other] : [set]) {
    if (s.picked !== undefined) throw new ProseError('E_CONFLICT', `Set ${s.id} was already picked (variant ${s.picked})`, { hint: 'Start a new set with prose set new' });
  }
  const setFor = (id: string) => (id === setId ? set : other);

  let xOf: (s: Side) => number[];
  let voices: string[];
  let register: string | null;
  if (!cross) {
    const shown = shownIn(project, set, [sa.index, sb.index], false, ctx);
    const c = shownContext(project, set, shown); // vectors relative to the set's shown variants
    xOf = s => c.side(s.index).x; voices = c.voices; register = c.register;
  } else {
    for (const s of [sa, sb]) shownIn(project, setFor(s.set), [s.index], true, ctx);
    const docs = [sa, sb].map(s => { const v = setFor(s.set); return loadDocument(variantPath(project, v, v.variants.find(x => x.index === s.index)!), { form: v.form }); });
    const xs = centered(docs.map(featureVector)); // centred on the pair: only the difference matters in a two-item duel
    xOf = s => (s === sa ? xs[0] : xs[1]);
    ({ voices, register } = docsContext(project, docs));
  }
  const side = (s: Side) => {
    const base = { index: s.index, x: xOf(s) };
    return s.set === setId ? base : { ...base, set: s.set, setUid: setFor(s.set).uid };
  };
  const [win, lose] = outcome === 'b' ? [sb, sa] : [sa, sb];
  const row: Verdict = {
    schema: VERDICT_SCHEMA, at: (opts.now ?? new Date()).toISOString(), project, set: set.id, setUid: set.uid,
    kind: duelKind(outcome), eventId, form: set.form, register, voices,
    winner: side(win), loser: side(lose), weight: 1, tags: [], features: FEATURE_SET_ID, shown: [sa.index, sb.index], n: 2,
  };
  ctx.heartbeat();
  const inProject = appendVerdictsOnce(join(projectTasteDir(project), 'verdicts.jsonl'), [row])[0];
  ctx.heartbeat();
  const inGlobal = appendVerdictsOnce(join(globalTasteDir(), 'verdicts.jsonl'), [row])[0];
  const appended = inProject || inGlobal ? 1 : 0;
  return { appended, skipped: 1 - appended };
}
