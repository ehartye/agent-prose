// The taste model as the reading server uses it: loaded off the request path, cached, and turned into a pair chooser for `nextPair`.
// Everything here is async fs (no sync reads of the verdict logs or variant files, no child process, no lock): a request awaits
// `chooser`, which returns at once when nothing has changed. Any failure logs ONE line through `warn` (a fixed message: no token,
// no path, no draft text) and the caller falls back to the old pairing rule.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from '../document.ts';
import { featureVector, toScaledArray } from '../owner/features.ts';
import { globalTasteDir, projectTasteDir } from '../owner/paths.ts';
import { textHash } from '../owner/prediction.ts';
import type { PromptSet } from '../owner/sets.ts';
import { loadTasteAsync, resolveVoiceAsync, type Taste } from '../taste/load.ts';
import { nextDuel } from '../taste/select.ts';
import type { PairChooser } from './session.ts';

/** A candidate of the shortlist: where its text lives and the hash that text must still have. */
export interface DuelCandidateSource { index: number; file: string; form: string; hash: string | undefined }

const MAX_VECTORS = 500;
/** How long a failed lookup (a vector read, a voice with none found) is remembered. */
const RETRY_MS = 30_000;

/** The most recent rows of each log the server fits (the CLI fits every row). */
export const SERVER_MAX_ROWS = 3000;

/** Size and mtime of a file, or `-` for both when it does not exist. */
async function statParts(path: string): Promise<{ size: string; mtime: string }> {
  try { const s = await stat(path); return { size: String(s.size), mtime: String(s.mtimeMs) }; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { size: '-', mtime: '-' }; throw e; }
}

export class TasteDuels {
  /** How many models were fitted and how many candidate vectors computed; for tests (a poll that finds nothing changed adds none). */
  readonly loads = { models: 0, vectors: 0, bytes: 0 };
  /** One model per (project, voice), valid while the project log's and the global log's `size:mtime` are unchanged. A failed load is remembered for the same key, so it is reported once. */
  private models = new Map<string, { size: string; mtime: string; taste: Promise<Taste | null> }>();
  /** A candidate's scaled style vector by form and the sha256 of its text (the features depend on the form). A failed read is kept for 30 seconds only. */
  private vectors = new Map<string, { made: Promise<number[] | null>; retryAt?: number }>();
  /** A set's single voice by project and set. A found voice stays; a lookup that found none (or failed) is repeated after 30 seconds. */
  private voices = new Map<string, { voice: Promise<string | null>; retryAt?: number }>();

  private warn: () => void;
  constructor(warn: () => void) { this.warn = warn; }

  private model(project: string, voice: string | null): Promise<Taste | null> {
    const slot = `${project}\0${voice ?? ''}`;
    return (async () => {
      let size: string, mtime: string;
      try {
        const [p, g] = await Promise.all([statParts(join(projectTasteDir(project), 'verdicts.jsonl')), statParts(join(globalTasteDir(), 'verdicts.jsonl'))]);
        size = `${p.size}|${g.size}`; mtime = `${p.mtime}|${g.mtime}`;
      } catch { size = mtime = 'unreadable'; }
      const hit = this.models.get(slot);
      // The logs only grow, so an unchanged size means no new row: a touch that moves the mtime alone does not refit.
      if (hit && hit.size === size) { hit.mtime = mtime; return hit.taste; }
      this.loads.models++;
      // One fit at a time per slot: a change that lands while one is running waits for it instead of stacking fits.
      const prior = hit?.taste.catch(() => null) ?? Promise.resolve(null);
      const taste = prior.then(() => loadTasteAsync({ project, voice, maxRows: SERVER_MAX_ROWS })).then(t => { this.loads.bytes = t.bytesRead ?? 0; return t; }).catch(() => { this.warn(); return null; });
      this.models.set(slot, { size, mtime, taste });
      return taste;
    })();
  }

  /** The single voice of the set's base draft, resolved with async fs. A found voice is kept; none found (or a failed read) is looked up again after 30 seconds. */
  voice(project: string, set: PromptSet): Promise<string | null> {
    const key = `${project}|${set.id}`;
    const hit = this.voices.get(key);
    if (hit && (hit.retryAt === undefined || Date.now() < hit.retryAt)) return hit.voice;
    const entry: { voice: Promise<string | null>; retryAt?: number } = { voice: resolveVoiceAsync(project, set) };
    void entry.voice.then(v => { if (v === null) entry.retryAt = Date.now() + RETRY_MS; });
    this.voices.set(key, entry);
    if (this.voices.size > MAX_VECTORS) this.voices.delete(this.voices.keys().next().value as string);
    return entry.voice;
  }

  private vector(c: DuelCandidateSource): Promise<number[] | null> {
    if (!c.hash) return Promise.resolve(null);
    const key = `${c.form}|${c.hash}`;
    const hit = this.vectors.get(key);
    if (hit && (hit.retryAt === undefined || Date.now() < hit.retryAt)) return hit.made;
    const entry: { made: Promise<number[] | null>; retryAt?: number } = { made: Promise.resolve(null) };
    entry.made = (async () => {
      try {
        const text = (await readFile(c.file, 'utf8')).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
        if (textHash(text) !== c.hash) { this.vectors.delete(key); return null; } // the file changed since it was frozen: not this text
        this.loads.vectors++;
        return toScaledArray(featureVector(parseDocument(c.file, text, { form: c.form })));
      } catch { this.warn(); entry.retryAt = Date.now() + RETRY_MS; return null; }
    })();
    this.vectors.set(key, entry);
    if (this.vectors.size > MAX_VECTORS) this.vectors.delete(this.vectors.keys().next().value as string);
    return entry.made;
  }

  /** The chooser for these shortlisted candidates, or null when the model is unusable or a vector is missing (the old rule then runs). Never rejects. */
  async chooser(project: string, set: PromptSet | null, candidates: DuelCandidateSource[]): Promise<PairChooser | null> {
    try {
      const voice = set ? await this.voice(project, set) : null;
      const [taste, vectors] = await Promise.all([this.model(project, voice), Promise.all(candidates.map(c => this.vector(c)))]);
      if (!taste?.model.usable || vectors.some(v => v === null)) return null;
      const x = new Map(candidates.map((c, i) => [c.index, vectors[i]!]));
      return (shortlist, asked) => {
        if (shortlist.some(i => !x.has(i))) return null;
        return nextDuel(shortlist.map(index => ({ index, x: x.get(index)! })), taste.model, asked);
      };
    } catch { this.warn(); return null; }
  }
}
