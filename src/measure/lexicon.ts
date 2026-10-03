import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Block } from '../ir.ts';

const Entry = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  pattern: z.string().min(1),
  tier: z.enum(['artifact', 'vocabulary', 'structure', 'hedge', 'filler', 'promotional']),
  eras: z.array(z.string()).optional(),
});
const LexiconFile = z.strictObject({
  schema: z.literal('prose/lexicon@1'),
  id: z.string(),
  sources: z.array(z.string()).min(1),
  note: z.string().optional(),
  /** When the list was last reviewed for dated entries (YYYY-MM-DD); a lexicon of era-tagged words should carry one. */
  reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  entries: z.array(Entry).min(1),
});

export type LexiconEntry = z.infer<typeof Entry>;
export interface Lexicon { id: string; sources: string[]; reviewed?: string; entries: Array<LexiconEntry & { re: RegExp }> }
export interface LexiconHit {
  id: string; tier: LexiconEntry['tier']; eras?: string[]; count: number; lines: number[];
  /** Up to three distinct matched strings, as written, in order of appearance. */
  examples: string[];
}

const DIR = join(import.meta.dirname, '..', '..', 'craft', 'lexicon');

export function loadLexicon(id: string): Lexicon {
  const file = LexiconFile.parse(JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8')));
  return { id: file.id, sources: file.sources, ...(file.reviewed ? { reviewed: file.reviewed } : {}), entries: file.entries.map(e => ({ ...e, re: new RegExp(e.pattern, 'giu') })) };
}

export const AI_TELLS = loadLexicon('ai-tells');
export const HEDGES = loadLexicon('hedges');
export const FILLER = loadLexicon('filler');
export const ALL_LEXICONS: Lexicon[] = [AI_TELLS, HEDGES, FILLER];

const MAX_EXAMPLES = 3;

/** Every entry with at least one match: total count, the distinct lines it appears on, and example matches, in order. */
export function matchLexicon(lexicon: Lexicon, blocks: Block[]): LexiconHit[] {
  const hits: LexiconHit[] = [];
  // Hard-wrapped prose: a phrase broken across lines still matches, and its example reads on one line.
  const flat = blocks.map(b => ({ line: b.line, text: b.text.replace(/\s*\n\s*/g, ' ') }));
  for (const entry of lexicon.entries) {
    let count = 0;
    const lines: number[] = [];
    const examples: string[] = [];
    for (const b of flat) {
      const found = b.text.match(entry.re) ?? [];
      if (!found.length) continue;
      count += found.length;
      if (!lines.includes(b.line)) lines.push(b.line);
      for (const f of found) if (examples.length < MAX_EXAMPLES && !examples.includes(f.trim())) examples.push(f.trim());
    }
    if (count) hits.push({ id: entry.id, tier: entry.tier, ...(entry.eras ? { eras: entry.eras } : {}), count, lines, examples });
  }
  return hits;
}
