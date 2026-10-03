import { ProseError } from './errors.ts';

export interface Target { minutes?: number; words?: number; pages?: number }

const UNIT: Record<string, keyof Target | 'seconds'> = {
  s: 'seconds', sec: 'seconds', secs: 'seconds', second: 'seconds', seconds: 'seconds',
  min: 'minutes', mins: 'minutes', minute: 'minutes', minutes: 'minutes',
  word: 'words', words: 'words', page: 'pages', pages: 'pages',
};
const bad = () => new ProseError('E_SCHEMA', 'target must look like "5 minutes", "90 seconds", "200 words", "4 pages" or {minutes: 5}', { pointer: '/target' });

function put(out: Target, unit: keyof Target | 'seconds', n: number): void {
  if (!(n > 0)) throw bad();
  if (unit === 'seconds') out.minutes = Math.round((n / 60) * 100) / 100;
  else out[unit] = n;
}

/** Parse a declared length target; null when absent. */
export function readTarget(raw: unknown): Target | null {
  if (raw == null) return null;
  const out: Target = {};
  if (typeof raw === 'string') {
    const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/i);
    const unit = m && UNIT[m[2].toLowerCase()];
    if (!m || !unit) throw bad();
    put(out, unit, Number(m[1]));
    return out;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const unit = UNIT[k.toLowerCase()];
      if (!unit || typeof v !== 'number') throw bad();
      put(out, unit, v);
    }
    if (!Object.keys(out).length) throw bad();
    return out;
  }
  throw bad();
}
