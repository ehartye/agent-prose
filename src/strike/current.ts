// The strikes that hold for a draft as it is on disk now: read only, never locked, never written. Shared by `set new`
// (which keeps struck lines out of a rewrite) and by the reading server (which shows them and previews their removal).
import { strikeDir } from '../owner/paths.ts';
import type { Format } from '../kinds.ts';
import { strikeLines, type StrikeLine } from './lines.ts';
import { foldStrikes, readStrikeLog, strikeKey, type PendingStrike, type StrikeFold } from './store.ts';

export interface CurrentStrikes {
  fold: StrikeFold;
  /** Pending strikes made against this very draft (not stale), with the line each names now (null if no line has that ref). */
  live: Array<PendingStrike & { line: StrikeLine | null }>;
}

/** The fold of a draft's log against its hash, and the strikes still valid for it. `source` is project-relative. */
export function currentStrikes(project: string, source: string, text: string, hash: string | null, format: Format, form: string | undefined): CurrentStrikes {
  const { events } = readStrikeLog(strikeDir(project, strikeKey(source)));
  const fold = foldStrikes(events, hash);
  const live = fold.pending.filter(p => !p.stale);
  if (live.length === 0) return { fold, live: [] };
  const lines = strikeLines(text, format, form);
  return { fold, live: live.map(p => ({ ...p, line: lines.find(l => l.ref === p.ref) ?? null })) };
}
