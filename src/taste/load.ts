// Loads the verdict logs and fits the layered taste model for one project (and optionally one voice).
import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadDocument, parseDocument } from '../document.ts';
import { globalTasteDir, projectKey, projectTasteDir } from '../owner/paths.ts';
import { voiceIds, voiceIdsIn } from '../owner/pick.ts';
import { basePath, type PromptSet } from '../owner/sets.ts';
import { parseVerdicts, readVerdicts, type ReadOpts, type VerdictLog } from '../owner/verdicts.ts';
import { fitLayered, type Model } from './model.ts';
import { loadVoicesAsync } from '../voice.ts';
import type { TasteCounts } from './summary.ts';

export interface Taste {
  model: Model; layers: Model['layers']; counts: TasteCounts;
  /** Bytes read from the logs (async path only): with `maxRows`, at most 4 MB per log. */
  bytesRead?: number;
}

const summarizeLog = (log: VerdictLog) => ({ rows: log.rows.filter(r => r.features === 'v1'), skipped: log.skippedFeatures ?? 0, malformed: log.malformed, unknownVersion: log.unknownVersion });
type Log = ReturnType<typeof summarizeLog>;
const EMPTY: Log = { rows: [], skipped: 0, malformed: 0, unknownVersion: 0 };

function readLog(path: string, opts: ReadOpts = {}): Log {
  try { return summarizeLog(readVerdicts(path, { countOtherFeatures: true, ...opts })); }
  catch { return { ...EMPTY, malformed: 1 }; } // an unreadable log is one reported problem, not a crash
}

/** The two logs' paths for a project (or the global one alone). */
const logPaths = (project: string | null) => ({ mine: project ? join(projectTasteDir(project), 'verdicts.jsonl') : null, all: join(globalTasteDir(), 'verdicts.jsonl') });

function assemble(project: string | null, voice: string | null | undefined, mine: Log, all: Log): Taste {
  const key = project ? projectKey(project) : null;
  const globalRows = key ? all.rows.filter(r => projectKey(r.project) !== key) : all.rows;
  const voiceRows = voice ? mine.rows.filter(r => r.voices.includes(voice)) : [];
  const model = fitLayered({ globalRows, projectRows: mine.rows, voiceRows });
  return {
    model, layers: model.layers,
    counts: {
      skippedVersion: mine.skipped + all.skipped, malformed: mine.malformed + all.malformed, unknownVersion: mine.unknownVersion + all.unknownVersion,
      rows: mine.rows.length + all.rows.length,
    },
  };
}

/**
 * The model for `project` (and `voice`): every project's rows but this one's for global, this project's for the project layer, and its rows naming the voice for the voice layer.
 * With `project: null` only the global layer is fitted, from every project's rows.
 */
export function loadTaste({ project, voice }: { project: string | null; voice?: string | null }): Taste {
  const paths = logPaths(project);
  // Every pick is appended to both logs: the project log is counted once, and the global log only for rows that are not this project's.
  const collectBad = new Set<string>();
  const mine = paths.mine ? readLog(paths.mine, { collectBad }) : EMPTY;
  return assemble(project, voice, mine, readLog(paths.all, project ? { excludeProject: projectKey(project), mirroredBad: collectBad } : {}));
}

/** The most of a log's end the server path reads: a 150 MB log is never read whole. */
export const TAIL_BYTES = 4 * 1024 * 1024;

/** The last `maxBytes` of a file as text, without a leading partial line. A missing file is empty text; any other failure rejects. */
async function readTail(path: string, maxBytes: number): Promise<{ text: string; bytes: number }> {
  let fh;
  try { fh = await open(path, 'r'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { text: '', bytes: 0 }; throw e; }
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw Object.assign(new Error('not a regular file'), { code: 'EISDIR' }); // a directory reads as empty on some platforms
    const { size } = st;
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    let got = 0;
    while (got < buf.length) {
      const { bytesRead } = await fh.read(buf, got, buf.length - got, start + got);
      if (!bytesRead) break;
      got += bytesRead;
    }
    let text = buf.subarray(0, got).toString('utf8');
    if (start > 0) { const nl = text.indexOf('\n'); text = nl < 0 ? '' : text.slice(nl + 1); } // the first line is cut mid-way
    return { text, bytes: got };
  } finally { await fh.close(); }
}

/** A missing log is empty; any other read failure rejects (the caller decides what a model it could not load means). */
async function readText(path: string, maxRows: number | undefined): Promise<{ text: string; bytes: number }> {
  if (maxRows === undefined) {
    try { const text = await readFile(path, 'utf8'); return { text, bytes: Buffer.byteLength(text) }; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { text: '', bytes: 0 }; throw e; }
  }
  const { text, bytes } = await readTail(path, TAIL_BYTES);
  const lines = text.split('\n').filter(l => l.trim());
  return { text: lines.slice(-maxRows).join('\n'), bytes };
}

/**
 * `loadTaste` for a server: the logs are read with async fs, so the event loop is free while they load. With `maxRows` only the tail of each log
 * is read (the last 4 MB, a leading partial line dropped) and only its last `maxRows` lines are parsed and fitted, so the work no longer grows with the log;
 * the CLI passes none and fits everything. A log that cannot be read rejects.
 */
export async function loadTasteAsync({ project, voice, maxRows }: { project: string | null; voice?: string | null; maxRows?: number }): Promise<Taste> {
  const paths = logPaths(project);
  const [a, b] = await Promise.all([paths.mine ? readText(paths.mine, maxRows) : { text: '', bytes: 0 }, readText(paths.all, maxRows)]);
  const collectBad = new Set<string>();
  const mine = paths.mine ? summarizeLog(parseVerdicts(a.text, { countOtherFeatures: true, collectBad })) : EMPTY;
  const all = summarizeLog(parseVerdicts(b.text, { countOtherFeatures: true, ...(project ? { excludeProject: projectKey(project), mirroredBad: collectBad } : {}) }));
  return { ...assemble(project, voice, mine, all), bytesRead: a.bytes + b.bytes };
}

const single = (ids: string[]): string | null => (ids.length === 1 ? ids[0] : null);

/** The single voice (a bible id) of a set's base draft, or null when it has none or several (or cannot be read). */
export function resolveVoice(project: string, set: PromptSet): string | null {
  try { return single(voiceIds(project, [loadDocument(basePath(project, set), { form: set.form })])); }
  catch { return null; }
}

/** `resolveVoice` with async fs, for the reading server's request path. Same rule (one voice, else null); never rejects. */
export async function resolveVoiceAsync(project: string, set: PromptSet): Promise<string | null> {
  try {
    const path = basePath(project, set);
    const [bibles, text] = await Promise.all([loadVoicesAsync(project), readFile(path, 'utf8')]);
    return single(voiceIdsIn(bibles, [parseDocument(path, text, { form: set.form })]));
  } catch { return null; }
}
