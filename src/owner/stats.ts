import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globalTasteDir, projectKey } from './paths.ts';

export interface PredictionStats {
  sessions: number;
  agent: { predicted: number; hits: number; shortlistHits: number; voided: number; rate: number | null };
  recent: { window: number; agentRate: number | null };
}

const rate = (hits: number, n: number) => (n ? Math.round((hits / n) * 1000) / 1000 : null);

/** How often the agent's sealed pick matched the owner's, across all projects or one. A voided row (a discarded prediction) counts as a miss. */
export function predictionStats(opts: { project?: string; window?: number }): PredictionStats {
  const window = opts.window ?? 10;
  const file = join(globalTasteDir(), 'predictions.jsonl');
  const rows: Array<{ project: string; agent: { hit: boolean; shortlistHit: boolean; sealValid?: boolean; voided?: string } }> = [];
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r?.agent && (!opts.project || (typeof r.project === 'string' && projectKey(r.project) === projectKey(opts.project)))) rows.push(r);
      } catch { /* skip a torn line */ }
    }
  }
  const hits = rows.filter(r => r.agent.hit).length;
  const recent = rows.slice(-window);
  return {
    sessions: rows.length,
    agent: { predicted: rows.length, hits, shortlistHits: rows.filter(r => r.agent.shortlistHit).length, voided: rows.filter(r => r.agent.voided).length, rate: rate(hits, rows.length) },
    recent: { window, agentRate: rate(recent.filter(r => r.agent.hit).length, recent.length) },
  };
}
