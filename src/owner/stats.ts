import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globalTasteDir, projectKey } from './paths.ts';
import { LedgerModelSchema, readVerdicts, type LedgerModel } from './verdicts.ts';

export interface PredictionStats {
  sessions: number;
  /** `shortlistHits` is counted over `shortlistEligible` sets only: those where more than three variants were shown (with three or fewer, a three-wide shortlist covers everything). */
  agent: { predicted: number; hits: number; shortlistHits: number; shortlistEligible: number; voided: number; rate: number | null };
  recent: { window: number; agentRate: number | null };
  /** The taste model's sealed guesses. Rows without model data (written before the model existed, or by a set predicted without one) are not counted. */
  model: { predicted: number; abstained: number; hits: number; shortlistHits: number; shortlistEligible: number; voided: number; rate: number | null; recent: { window: number; rate: number | null } };
  /** Over sessions where both predicted (the model did not abstain): who hit the owner's pick. The comparison uses the pick only, never the shortlist. */
  comparison: { both: number; modelBetter: number; same: number; agentBetter: number };
}

const rate = (hits: number, n: number) => (n ? Math.round((hits / n) * 1000) / 1000 : null);

/**
 * Duel verdicts in one log, by outcome. Only a pick is a prediction test (the predictions ledger is written by recordPick alone),
 * so the hit rate below never sees these.
 */
export const duelCounts = (path: string) => {
  const { rows } = readVerdicts(path);
  return { decisive: rows.filter(r => r.kind === 'duel').length, ties: rows.filter(r => r.kind === 'tie').length, bothBad: rows.filter(r => r.kind === 'bothBad').length };
};

/** How often the agent's sealed pick matched the owner's, across all projects or one. A voided row (a discarded prediction) counts as a miss. */
export function predictionStats(opts: { project?: string; window?: number }): PredictionStats {
  const window = opts.window ?? 10;
  const file = join(globalTasteDir(), 'predictions.jsonl');
  type Row = { project: string; shownCount?: number; agent: { hit: boolean; shortlistHit: boolean; sealValid?: boolean; voided?: string }; model?: LedgerModel };
  const rows: Row[] = [];
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r?.agent && (!opts.project || (typeof r.project === 'string' && projectKey(r.project) === projectKey(opts.project)))) rows.push({ ...r, shownCount: typeof r.shownCount === 'number' ? r.shownCount : undefined, model: LedgerModelSchema.safeParse(r.model).data });
      } catch { /* skip a torn line */ }
    }
  }
  const hits = rows.filter(r => r.agent.hit).length;
  const recent = rows.slice(-window);
  const withModel = rows.filter((r): r is Row & { model: LedgerModel } => !!r.model);
  const predicted = withModel.filter(r => !r.model.abstained);
  const recentModel = predicted.slice(-window);
  const score = (x: { hit: boolean }) => (x.hit ? 1 : 0);
  // A shortlist hit means something only when more than three variants were shown; rows without a shown count (older ledgers) are not eligible.
  const eligible = (r: Row) => typeof r.shownCount === 'number' && r.shownCount > 3;
  const agentEligible = rows.filter(eligible);
  const modelEligible = predicted.filter(eligible);
  const modelHits = predicted.filter(r => r.model.hit).length;
  return {
    sessions: rows.length,
    agent: { predicted: rows.length, hits, shortlistHits: agentEligible.filter(r => r.agent.shortlistHit).length, shortlistEligible: agentEligible.length, voided: rows.filter(r => r.agent.voided).length, rate: rate(hits, rows.length) },
    recent: { window, agentRate: rate(recent.filter(r => r.agent.hit).length, recent.length) },
    model: {
      predicted: predicted.length, abstained: withModel.length - predicted.length, hits: modelHits, shortlistHits: modelEligible.filter(r => r.model.shortlistHit).length, shortlistEligible: modelEligible.length,
      voided: predicted.filter(r => r.model.voided).length, rate: rate(modelHits, predicted.length),
      recent: { window, rate: rate(recentModel.filter(r => r.model.hit).length, recentModel.length) },
    },
    comparison: {
      both: predicted.length,
      modelBetter: predicted.filter(r => score(r.model) > score(r.agent)).length,
      same: predicted.filter(r => score(r.model) === score(r.agent)).length,
      agentBetter: predicted.filter(r => score(r.model) < score(r.agent)).length,
    },
  };
}
