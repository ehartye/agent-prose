// The existing line: what a revision set was asked to improve, snapshotted when the set was made (see the line review
// spec). It is context for the owner, never a contestant: no candidate index, no verdict, no taste signal.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { FORMS } from '../forms.ts';
import type { Format } from '../kinds.ts';
import { normalizeDraft, parseRefs, selectSpans, unitSpans } from '../strike/spans.ts';
import { ProseError } from '../errors.ts';

/** The draft a set was made from: a project-relative path (folders allowed), but never absolute, never with `..`, never a NUL. */
export const SourcePath = z.string().min(1).refine(
  v => !v.includes('\u0000') && !isAbsolute(v) && !/^[A-Za-z]:/.test(v) && !v.split(/[\\/]/).includes('..'),
  'must be a relative path inside the project',
);

export const MAX_ORIGINAL_LINES = 20;
export const MAX_ORIGINAL_TEXT = 2000;

export const OriginalLineSchema = z.strictObject({
  ref: z.string().regex(/^\d+(-\d+)?$/),
  speaker: z.string().min(1).optional(),
  /** The unit text as the page shows it, without its `Speaker: ` prefix (the speaker is its own field). */
  text: z.string().min(1).max(MAX_ORIGINAL_TEXT),
});

export const OriginalSchema = z.strictObject({
  /** Same value as the set's `source`. */
  source: SourcePath,
  /** textHash of the draft when the set was made; compared with the draft now to say `stale`. */
  draftHash: z.string().regex(/^[0-9a-f]{64}$/),
  lines: z.array(OriginalLineSchema).min(1).max(MAX_ORIGINAL_LINES),
});
export type Original = z.infer<typeof OriginalSchema>;

/** SHA-256 of the draft with BOM and CRLF normalised (the same hash as `textHash`, so an editor that only changes line endings is not an edit). */
export const draftHash = (text: string): string => createHash('sha256').update(normalizeDraft(text), 'utf8').digest('hex');

/** The set's snapshot as `set show` and the page print it: speakers null when absent, plus `stale` once known. */
export const originalLines = (o: Original) => o.lines.map(l => ({ ref: l.ref, speaker: l.speaker ?? null, text: l.text }));

/** The refs the snapshot covers, for the check that other lines stayed put. */
export const originalRefs = (o: Original): Set<string> => new Set(o.lines.map(l => l.ref));

/**
 * Resolve `--lines` against the draft and record what it says now. A ref names the lines of the draft as the owner's editor
 * numbers them; every unit overlapping it is selected, and units that share a ref (the sentences of one Markdown block) become
 * one entry whose text joins them. Text past the cap is cut with an ellipsis: this is context, not data.
 */
export function snapshotOriginal(source: string, draft: string, format: Format, form: string, refList: string): Original {
  const spans = unitSpans(draft, format, form);
  const picked = selectSpans(spans, parseRefs(refList));
  const verse = format === 'markdown' && FORMS.find(f => f.id === form)?.verse !== undefined;
  const joiner = format === 'markdown' && !verse ? ' ' : '\n';
  const byRef = new Map<string, { speaker?: string; parts: string[] }>();
  for (const s of picked) {
    const entry = byRef.get(s.ref) ?? { ...(s.speaker ? { speaker: s.speaker } : {}), parts: [] };
    entry.parts.push(s.text);
    byRef.set(s.ref, entry);
  }
  if (byRef.size > MAX_ORIGINAL_LINES) {
    throw new ProseError('E_USAGE', `--lines selects ${byRef.size} lines; at most ${MAX_ORIGINAL_LINES} can be shown as the current line`, { hint: 'Select fewer lines, or make a second set for the rest' });
  }
  const cut = (t: string) => (t.length > MAX_ORIGINAL_TEXT ? `${t.slice(0, MAX_ORIGINAL_TEXT - 1)}…` : t);
  return OriginalSchema.parse({
    source, draftHash: draftHash(draft),
    lines: [...byRef].map(([ref, e]) => ({ ref, ...(e.speaker ? { speaker: e.speaker } : {}), text: cut(e.parts.join(joiner)) })),
  });
}

/** The draft's hash now, or null when the file is gone, unreadable or not a file. */
export function currentDraftHash(project: string, source: string): string | null {
  try {
    const file = join(project, source);
    if (!existsSync(file) || !statSync(file).isFile()) return null;
    return draftHash(readFileSync(file, 'utf8'));
  } catch { return null; }
}

/** True when the draft is not what it was when the set was made (an unreadable draft counts as changed). */
export const isStale = (project: string, o: Original): boolean => currentDraftHash(project, o.source) !== o.draftHash;
