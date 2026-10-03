import type { Doc } from '../ir.ts';

/**
 * Verse lines from a parsed draft. Each source line is a verse line and each blank-line-separated paragraph is a
 * stanza. The Markdown parser keeps a paragraph's source lines joined by '\n' (one block line per source line), so the
 * block's `line` plus the offset is the source line; no parser change is needed. Headings label the stanzas after them.
 *
 * Known parser limit: a verse line that starts like Markdown (`- `, `1. `, `> `) becomes a list item, step or quote.
 * Those are reported in `markup` and their text is still kept as a line, so the measurement is not silently short.
 */
export interface VerseLine { text: string; line: number }
export interface Stanza { section: string | null; lines: VerseLine[] }
/** A verse line the parser swallowed into another block kind (list-item, step, quote). */
export interface VerseMarkup { line: number; kind: string }

const SWALLOWERS = new Set(['list-item', 'step', 'quote']);

/** A line that is only a bracketed label, optionally followed by a colon: `[Verse 1]`, `[Chorus]:`. Captures the label. */
const LABEL_LINE = /^\[([^\]\n]+)\]:?$/;
/** Words that name a song section; the text inside brackets must start with one to count as a label on its own paragraph. */
const SECTION_WORDS = 'verse|chorus|pre[- ]?chorus|post[- ]?chorus|bridge|intro|outro|refrain|hook|interlude|solo|instrumental|tag|coda';
const SECTION_LABEL = new RegExp(`^(?:${SECTION_WORDS})(?:\\s*\\d+[a-z]?|\\s+[a-z])?(?:\\s*[(\\[][^)\\]]*[)\\]])?(?:\\s*:.*)?$`, 'i');

/**
 * True when the text inside brackets reads as a song section label (Verse 1, Chorus, Pre-Chorus, Bridge B, Chorus (x2),
 * Verse 1: Name). A bracketed stage note such as [Applause] or a placeholder such as [colour] is not one.
 */
export const looksLikeSectionLabel = (content: string): boolean => SECTION_LABEL.test(content.trim());

/** The label of a line that is only a bracketed label, else null. */
const labelOf = (line: string): string | null => LABEL_LINE.exec(line.trim())?.[1]!.trim() ?? null;

export function extractVerse(doc: Doc): { stanzas: Stanza[]; markup: VerseMarkup[] } {
  const stanzas: Stanza[] = [];
  const markup: VerseMarkup[] = [];
  let section: string | null = null;
  for (const block of doc.blocks) {
    if (block.kind === 'heading') {
      section = block.text.trim();
    } else if (block.kind === 'note' && block.meta?.onscreen) {
      // A paragraph that is only `[Verse 1]` (the parser makes it an on-screen note). Stage notes like [Applause] stay notes.
      if (looksLikeSectionLabel(block.text)) section = block.text.trim();
    } else if (block.kind === 'paragraph') {
      // A bracketed label line opens a new stanza under that section, at the start of the paragraph or in the middle of it.
      let lines: VerseLine[] = [];
      const close = () => { if (lines.length) stanzas.push({ section, lines }); lines = []; };
      block.text.split('\n').forEach((raw, i) => {
        const label = labelOf(raw);
        if (label !== null) { close(); section = label; return; }
        lines.push({ text: raw.trimEnd(), line: block.line + i });
      });
      close();
    } else if (SWALLOWERS.has(block.kind)) {
      markup.push({ line: block.line, kind: block.kind });
      stanzas.push({ section, lines: [{ text: block.text, line: block.line }] });
    }
    // other notes and everything else are not verse
  }
  return { stanzas, markup };
}

/** Lowercase, punctuation stripped, whitespace collapsed: the key for comparing repeated lines. */
export const normalise = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
