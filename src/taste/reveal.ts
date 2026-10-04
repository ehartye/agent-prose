// The sealed model prediction's file shape, its seal, and how it is read and scored at pick time. The writer is in prediction.ts.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { setDir } from '../owner/paths.ts';
import type { LedgerModel } from '../owner/verdicts.ts';

export const MODEL_PREDICTION_SCHEMA = 'prose/model-prediction@1';
export const MODEL_SEAL_SCHEMA = 'prose/model-seal@1';

const Hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const Index = z.number().int().min(1);

export const ModelPredictionSchema = z.strictObject({
  schema: z.literal(MODEL_PREDICTION_SCHEMA),
  set: z.string(),
  at: z.string(),
  features: z.literal('v1'),
  /** Every shown variant, best first: utility and its uncertainty. Empty when the model abstained. */
  ranking: z.array(z.strictObject({ index: Index, u: z.number(), sigma: z.number() })),
  pick: Index.nullable(),
  /** The top three of the ranking (the pick included), or empty when the model abstained. */
  shortlist: z.array(Index),
  layers: z.array(z.strictObject({ name: z.enum(['global', 'project', 'voice']), pairs: z.number().int().min(0) })),
  weights: z.array(z.number()),
  /** Null when the model predicted; otherwise why it did not (never a path). */
  abstained: z.string().nullable(),
  /** The agent prediction's frozen shown list and variant hashes, so the two predictions are about the same text. */
  shown: z.array(Index),
  hashes: z.record(z.string(), Hex64),
  seal: Hex64,
});
export type ModelPrediction = z.infer<typeof ModelPredictionSchema>;
export type ModelPredictionBody = Omit<ModelPrediction, 'seal'>;

export const modelSealOf = (p: ModelPredictionBody): string =>
  createHash('sha256').update(JSON.stringify({
    schema: p.schema, set: p.set, at: p.at, features: p.features, ranking: p.ranking, pick: p.pick, shortlist: p.shortlist,
    layers: p.layers, weights: p.weights, abstained: p.abstained, shown: p.shown, hashes: p.hashes,
  })).digest('hex');

export const modelFile = (project: string, id: string) => join(setDir(project, id), 'model-prediction.json');
/** Written beside the model prediction at predict time: lets a later missing or replaced file be told from a set predicted before models existed. */
export const modelSealFile = (project: string, id: string) => join(setDir(project, id), 'model-prediction.seal.json');

const SealMarker = z.strictObject({ schema: z.literal(MODEL_SEAL_SCHEMA), seal: Hex64, abstained: z.boolean() });
export type SealMarker = z.infer<typeof SealMarker>;

function readJson(file: string): unknown | undefined {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; }
}

export type ModelVoid = 'edited' | 'variant-changed' | 'missing';
export type ModelScore = LedgerModel;

/**
 * The model's side of a reveal, scored against the owner's `picked`, or null when there is nothing to record (a set predicted by a runtime
 * without models: no model file and no seal marker). When the model file parses its own `abstained` field is authoritative and a marker that
 * disagrees (the flag or the seal) voids it as edited; the marker alone decides only when the file is missing. `agent` is the agent prediction's frozen shown list and hashes; `forced` is the reason
 * the agent's own prediction was voided, which voids the model's too (unless it had abstained). Never throws.
 */
export function modelReveal(project: string, id: string, agent: { shown: number[]; hashes: Record<string, string> }, picked: number, forced?: ModelVoid): ModelScore | null {
  const file = modelFile(project, id);
  const markerRaw = readJson(modelSealFile(project, id));
  const marker = markerRaw === undefined ? null : SealMarker.safeParse(markerRaw).data ?? null;
  const present = existsSync(file);
  if (!present && !marker) return null;
  const parsed = present ? ModelPredictionSchema.safeParse(readJson(file)) : null;
  const mp = parsed?.success ? parsed.data : null;

  // No file: only the marker speaks. It was written at predict time, so a predicted marker over a missing file is a miss and an abstained one is not.
  if (!present) {
    if (marker!.abstained) return { pick: null, shortlist: [], hit: false, shortlistHit: false, abstained: true, sealValid: false };
    return { pick: null, shortlist: [], hit: false, shortlistHit: false, abstained: false, sealValid: false, voided: forced ?? 'missing' };
  }
  // A file that does not parse, or is not a model prediction at all, is an edit whatever the marker says: a marker must not turn it into an abstention.
  if (!mp) return { pick: null, shortlist: [], hit: false, shortlistHit: false, abstained: false, sealValid: false, voided: forced ?? 'edited' };

  // The file's own `abstained` field is authoritative. A marker that disagrees (the abstained flag or the seal) means one of the two was edited.
  const { seal, ...body } = mp;
  const frozen = JSON.stringify([agent.shown, Object.entries(agent.hashes).sort()]);
  const mine = JSON.stringify([mp.shown, Object.entries(mp.hashes).sort()]);
  const markerAgrees = !marker || (marker.seal === seal && marker.abstained === (mp.abstained !== null));
  const valid = seal === modelSealOf(body) && markerAgrees && frozen === mine;
  // An abstention is not a miss. With a marker it is one when file and marker agree; without one only when the seal holds.
  if (mp.abstained !== null && (marker ? markerAgrees : valid)) return { pick: null, shortlist: [], hit: false, shortlistHit: false, abstained: true, sealValid: valid };
  const reason: ModelVoid | null = forced ?? (valid ? null : 'edited');
  const pick = valid ? mp.pick : null;
  const shortlist = valid ? mp.shortlist : [];
  if (reason) return { pick, shortlist, hit: false, shortlistHit: false, abstained: false, sealValid: valid, voided: reason };
  return { pick, shortlist, hit: pick === picked, shortlistHit: pick === picked || shortlist.includes(picked), abstained: false, sealValid: true };
}

/** The model's side of a reveal when the owner sent the set back instead of picking: what it guessed, never scored (there is no pick to be right or wrong about). */
export interface ModelUnscored { pick: number | null; shortlist: number[]; abstained: boolean; sealValid: boolean; voided?: ModelVoid; unscored: true }

/**
 * `modelReveal` for a set sent back. The guess is read and validated exactly as at a pick (an edited or missing file still shows as such), but
 * no hit or miss is derived: the result carries `unscored: true` and no `hit` fields, and it is never written to the predictions ledger.
 */
export function modelRevealUnscored(project: string, id: string, agent: { shown: number[]; hashes: Record<string, string> }, forced?: ModelVoid): ModelUnscored | null {
  const scored = modelReveal(project, id, agent, -1, forced);
  if (!scored) return null;
  return { pick: scored.pick, shortlist: scored.shortlist, abstained: scored.abstained, sealValid: scored.sealValid, ...(scored.voided ? { voided: scored.voided } : {}), unscored: true };
}
