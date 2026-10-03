import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ProseError } from '../errors.ts';
import { checkSet } from './check.ts';
import { withSetLock, writeFileAtomic, type LockContext, type LockOptions } from './fsutil.ts';
import { setDir } from './paths.ts';
import { readSet, variantPath, type PromptSet } from './sets.ts';

export const PredictionSchema = z.strictObject({
  schema: z.literal('prose/prediction@1'),
  set: z.string(),
  pick: z.number().int().min(1),
  shortlist: z.array(z.number().int().min(1)),
  why: z.string().min(1),
  at: z.string(),
  /** The variants the owner will be shown (the kept indexes at predict time). */
  shown: z.array(z.number().int().min(1)),
  /** Variant index -> SHA-256 of that variant's text at predict time (BOM removed, line endings made LF). */
  hashes: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
  /** SHA-256 over the fields above, so an edit after the owner's pick is detectable. */
  seal: z.string().regex(/^[0-9a-f]{64}$/),
});
export type Prediction = z.infer<typeof PredictionSchema>;

type Sealed = Pick<Prediction, 'set' | 'pick' | 'shortlist' | 'why' | 'at' | 'shown' | 'hashes'>;
const sealOf = (p: Sealed) =>
  createHash('sha256').update(JSON.stringify({ set: p.set, pick: p.pick, shortlist: p.shortlist, why: p.why, at: p.at, shown: p.shown, hashes: p.hashes })).digest('hex');

export const sealValid = (p: Prediction) => p.seal === sealOf(p);
const file = (project: string, id: string) => join(setDir(project, id), 'prediction.json');

/** SHA-256 of a variant's text with a UTF-8 BOM removed and CRLF/CR line endings made LF, so an editor that only
 * changes line endings does not count as an edit. */
export const variantHash = (project: string, set: PromptSet, index: number): string => {
  const v = set.variants.find(x => x.index === index);
  if (!v) throw new ProseError('E_USAGE', `Set ${set.id} has no variant ${index}`);
  const text = readFileSync(variantPath(project, set, v), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return createHash('sha256').update(text, 'utf8').digest('hex');
};

export interface PredictionInput { pick: number; shortlist: number[]; why: string; now?: Date; lock?: LockOptions }

export function writePrediction(project: string, set: PromptSet, input: PredictionInput): Prediction {
  return withSetLock(project, set.id, ctx => writePredictionLocked(project, readSet(project, set.id), input, ctx), input.lock);
}

function writePredictionLocked(project: string, set: PromptSet, input: PredictionInput, ctx: LockContext): Prediction {
  if (!input.why.trim()) throw new ProseError('E_USAGE', 'Say why: --why "..."', { hint: 'The reason is what lets the guess be checked against the owner\'s pick' });
  if (set.picked !== undefined) throw new ProseError('E_CONFLICT', `Set ${set.id} was already picked; predictions come first`, { hint: 'Start a new set with prose set new' });
  if (existsSync(file(project, set.id))) {
    throw new ProseError('E_CONFLICT', `Set ${set.id} already has a sealed prediction`, { hint: `Run prose set pick ${set.id} --pick <n>` });
  }
  const known = new Set(set.variants.map(v => v.index));
  const unknown = [input.pick, ...input.shortlist].find(i => !known.has(i));
  if (unknown !== undefined) throw new ProseError('E_USAGE', `Set ${set.id} has no variant ${unknown}`, { hint: `Variants: ${[...known].join(', ')}` });
  ctx.heartbeat();
  const check = checkSet(project, set);
  if (!check.ok) throw new ProseError('E_USAGE', `Set ${set.id} has fewer than two surviving variants, so there is nothing to predict`, { hint: check.next });
  const outside = [input.pick, ...input.shortlist].find(i => !check.keep.includes(i));
  if (outside !== undefined) {
    throw new ProseError('E_USAGE', `Variant ${outside} was rejected by the set check, so the owner will not see it`, { hint: `Kept variants: ${check.keep.join(', ')}` });
  }
  const base: Sealed = {
    set: set.id, pick: input.pick,
    shortlist: [...new Set(input.shortlist)].filter(i => i !== input.pick).sort((a, b) => a - b),
    why: input.why.trim(), at: (input.now ?? new Date()).toISOString(),
    shown: [...check.keep],
    hashes: Object.fromEntries(check.keep.map(i => [String(i), variantHash(project, set, i)])),
  };
  const prediction = PredictionSchema.parse({ schema: 'prose/prediction@1', ...base, seal: sealOf(base) });
  ctx.heartbeat();
  writeFileAtomic(file(project, set.id), JSON.stringify(prediction, null, 2) + '\n');
  return prediction;
}

/** The sealed prediction, or null. Pass `set` to also check that the picks and shown list belong to it. */
export function readPrediction(project: string, id: string, set?: PromptSet): Prediction | null {
  const f = file(project, id);
  if (!existsSync(f)) return null;
  const hint = 'Restore the file or delete it and predict again';
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(f, 'utf8')); }
  catch (e) { throw new ProseError('E_SCHEMA', `${f} is not valid JSON: ${(e as Error).message}`, { hint }); }
  const parsed = PredictionSchema.safeParse(raw);
  if (!parsed.success) throw new ProseError('E_SCHEMA', `${f}: ${parsed.error.issues[0].message}`, { hint });
  if (set) {
    const known = new Set(set.variants.map(v => v.index));
    const bad = [parsed.data.pick, ...parsed.data.shortlist, ...parsed.data.shown].find(i => !known.has(i));
    if (bad !== undefined) throw new ProseError('E_SCHEMA', `${f}: variant ${bad} is not in set ${set.id}`, { hint });
  }
  return parsed.data;
}
