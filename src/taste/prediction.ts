// The sealed model prediction: written by `prose predict` beside the agent's own, revealed and scored at `prose set pick` (reveal.ts).
// The model's guess is never printed before the owner's pick is recorded, and there is no command that ranks a set.
import { ProseError } from '../errors.ts';
import { withSetLock, writeFileAtomic, type LockContext } from '../owner/fsutil.ts';
import { existsSync } from 'node:fs';
import { shownContext } from '../owner/pick.ts';
import { readPrediction, writePrediction, type Prediction, type PredictionInput } from '../owner/prediction.ts';
import { readSet, type PromptSet } from '../owner/sets.ts';
import { loadTaste, resolveVoice } from './load.ts';
import { rank } from './model.ts';
import { MODEL_PREDICTION_SCHEMA, MODEL_SEAL_SCHEMA, ModelPredictionSchema, modelFile, modelSealFile, modelSealOf, type ModelPrediction, type ModelPredictionBody } from './reveal.ts';

export const NO_DATA = 'no data yet';
const SHORTLIST = 3;
const round = (v: number) => Math.round(v * 1e6) / 1e6;

export interface ModelPredictionOptions {
  ctx?: LockContext;
  /** Replaces `loadTaste` (tests inject a failure here). */
  load?: typeof loadTaste;
}

/** What went wrong, named by class only: a message or stack could carry a path. */
const failureClass = (e: unknown): string => {
  const code = (e as { code?: unknown } | null)?.code;
  const name = typeof code === 'string' ? code : e instanceof Error ? e.constructor.name : 'Error';
  return `model failed (${name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) || 'Error'})`;
};

function build(project: string, set: PromptSet, agent: Prediction, load: typeof loadTaste): ModelPredictionBody {
  const body = (extra: Partial<ModelPredictionBody>): ModelPredictionBody => ({
    schema: MODEL_PREDICTION_SCHEMA, set: set.id, at: agent.at, features: 'v1', ranking: [], pick: null, shortlist: [], layers: [], weights: [], abstained: NO_DATA,
    shown: agent.shown, hashes: agent.hashes, ...extra,
  });
  const taste = load({ project, voice: resolveVoice(project, set) });
  const { model } = taste;
  const layers = taste.layers.map(l => ({ name: l.name, pairs: l.pairs }));
  if (!model.usable) return body({ layers });
  const { side } = shownContext(project, set, agent.shown);
  const ranking = rank(model, agent.shown.map(side)).map(r => ({ index: r.index, u: round(r.u), sigma: round(r.sigma) }));
  const weights = model.w.map(round);
  if (!ranking.length || ![...ranking.flatMap(r => [r.u, r.sigma]), ...weights].every(Number.isFinite)) return body({ layers, abstained: 'degenerate fit' });
  return body({ ranking, pick: ranking[0].index, shortlist: ranking.slice(0, SHORTLIST).map(r => r.index), layers, weights, abstained: null });
}

/**
 * Seals the model's guess for the shown variants of `set` next to the agent's prediction. Never throws: any failure while building it becomes
 * an abstention naming the failure class, so `prose predict` always succeeds. Returns what was written (or would have been, if the write failed).
 */
export function writeModelPrediction(project: string, set: PromptSet, agent: Prediction, opts: ModelPredictionOptions = {}): ModelPrediction {
  let body: ModelPredictionBody;
  try { body = build(project, set, agent, opts.load ?? loadTaste); }
  catch (e) {
    body = { schema: MODEL_PREDICTION_SCHEMA, set: set.id, at: agent.at, features: 'v1', ranking: [], pick: null, shortlist: [], layers: [], weights: [], abstained: failureClass(e), shown: agent.shown, hashes: agent.hashes };
  }
  const prediction = ModelPredictionSchema.parse({ ...body, seal: modelSealOf(body) });
  try {
    opts.ctx?.heartbeat();
    // The marker goes first: a later missing model file is then a miss (or an abstention) rather than "predicted before models existed".
    writeFileAtomic(modelSealFile(project, set.id), JSON.stringify({ schema: MODEL_SEAL_SCHEMA, seal: prediction.seal, abstained: prediction.abstained !== null }) + '\n');
    writeFileAtomic(modelFile(project, set.id), JSON.stringify(prediction, null, 2) + '\n');
  } catch { /* the owner's loop never fails on the model: a missing file is scored from the marker at pick time */ }
  return prediction;
}

/** `prose predict`: the agent's prediction, then the model's, under one set lock. */
export function predictWithModel(project: string, set: PromptSet, input: PredictionInput, opts: { load?: typeof loadTaste } = {}): { prediction: Prediction; model: ModelPrediction } {
  let model: ModelPrediction | undefined;
  const prediction = writePrediction(project, set, { ...input, after: (p, s, ctx) => { model = writeModelPrediction(project, s, p, { ctx, ...opts }); } });
  return { prediction, model: model! };
}

/**
 * Repair for a crash between the agent's prediction and the model's: seals the model's guess for an already-sealed agent prediction, computed
 * now, still before the pick. Refuses unless the agent's prediction exists, the set is not picked, and neither the model file nor its marker exists.
 */
export function repairModelPrediction(project: string, id: string, opts: { load?: typeof loadTaste } = {}): ModelPrediction {
  return withSetLock(project, id, ctx => {
    const set = readSet(project, id);
    if (set.picked !== undefined) throw new ProseError('E_CONFLICT', `Set ${id} was already picked; a model prediction can no longer be sealed`, { hint: 'The model has no result for this set' });
    const agent = readPrediction(project, id, set);
    if (!agent) throw new ProseError('E_USAGE', `Set ${id} has no sealed prediction to repair the model's guess for`, { hint: `prose predict --set ${id} --pick <n> --why "..."` });
    if (existsSync(modelFile(project, id)) || existsSync(modelSealFile(project, id))) {
      throw new ProseError('E_CONFLICT', `Set ${id} already has a model prediction`, { hint: 'Nothing to repair' });
    }
    return writeModelPrediction(project, set, agent, { ctx, ...opts });
  });
}
