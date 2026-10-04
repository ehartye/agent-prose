import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Human-text rates measured by `scripts/audit-measure.mjs --write-rates`: aggregates only (no text, no ids). The
 * audit reads them to say how common each family is in human writing, and to set the triplet-density threshold.
 */
export const RATES_PATH = join(import.meta.dirname, '..', '..', 'craft', 'audit-rates.json');

const Share = z.strictObject({
  count: z.number().int().min(0),
  n: z.number().int().min(0),
  rate: z.number().min(0).max(1),
  ci: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
});
const Side = z.strictObject({
  families: z.record(z.string(), Share),
  /** 95th percentile of `tripletListsPer1000` among texts of at least 100 words. */
  tripletP95: z.number().min(1).max(100),
  medians: z.strictObject({
    emDashesPer1000: z.number().nullable(),
    sentenceLengthVariation: z.number().nullable(),
    tripletListsPer1000: z.number().nullable(),
    isAreShare: z.number().nullable(),
  }),
});
const Dataset = z.strictObject({ label: z.string().min(1), n: z.number().int().min(0), human: Side, model: Side });
const RatesFile = z.strictObject({
  schema: z.literal('prose/audit-rates@1'),
  generated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  datasets: z.record(z.string(), Dataset),
});

export type Rates = z.infer<typeof RatesFile>;
export type RatesSide = z.infer<typeof Side>;

/** Validate parsed JSON; throws on a malformed file. */
export const parseRates = (raw: unknown): Rates => RatesFile.parse(raw);

let cached: Rates | undefined | null = null;

/**
 * The rates file, or undefined when it is missing or unreadable: the audit never fails for lack of it. The default
 * path is read once per process; an explicit path is always read fresh.
 */
export function loadRates(path?: string): Rates | undefined {
  if (path === undefined && cached !== null) return cached;
  let out: Rates | undefined;
  try { out = parseRates(JSON.parse(readFileSync(path ?? RATES_PATH, 'utf8'))); } catch { out = undefined; }
  if (path === undefined) cached = out;
  return out;
}
