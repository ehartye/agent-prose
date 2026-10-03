import type { Doc } from '../ir.ts';
import { getForm } from '../forms.ts';

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
/** A lyric line that is a performance note, not a lyric: `(hum softly)`, `Folk, about 90 bpm, 4/4`. */
export interface Direction { line: number; text: string }

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

/**
 * Lyric forms only: a plain (or bold, the parser strips the markers) line that is only a section label, once a trailing
 * colon is removed: `Verse 1`, `Chorus (x2)`, `Pre-Chorus:`, or one capital letter A-D for AABA drafts (`A`, `B (bridge)`).
 */
const PLAIN_LABEL = /^(?:verse|chorus|pre-?chorus|bridge|intro|outro|refrain|hook|interlude|solo|instrumental|tag|coda|break)(?:\s*\d+|\s+[a-z])?(?:\s*[(\[].*[)\]])?$/i;
const LETTER_LABEL = /^[A-D](?:\s*[(\[].*[)\]])?$/;
/**
 * Lyric forms only: a line that is clearly metadata, not a sung line. A direction is one of
 *  - a line that is ONE parenthesised phrase with no inner parentheses: `(hum softly)`, not `(Ooh) take me home (ooh)`;
 *  - a line of up to 12 words that gives a tempo with a number: `Folk, about 90 bpm, 4/4`;
 *  - a line of up to 6 words in which a time signature with a real denominator (2, 4, 8 or 16) stands on its own, at the
 *    start or end of the line or between commas, or follows "time signature" or "meter": `Waltz time, 3/4`, `6/8, slow`.
 * `I love you 24/7`, `Half of me is 1/2 yours` and `Oh we were dancing in 3/4 time tonight` are sung and stay lyrics.
 * Every skipped line is reported by the verse.format.direction rule, because this is a convention, not a fact.
 */
const PAREN_LINE = /^\([^()]*\)$/;
const BPM_LINE = /\b\d{2,3}\s*bpm\b/i;
const TIME_SIGNATURE = /(?:^|[,;(]|\b(?:time signature|signature|meter|metre)\s*:?)\s*\d{1,2}\/(?:2|4|8|16)\s*(?:$|[,;)])/i;
const MAX_BPM_WORDS = 12;
const MAX_SIGNATURE_WORDS = 6;

/** The label of a plain section-label line (lyric forms), else null. */
function plainLabelOf(line: string): string | null {
  const t = line.trim().replace(/:$/, '').trim();
  return PLAIN_LABEL.test(t) || LETTER_LABEL.test(t) ? t : null;
}

const isDirection = (line: string): boolean => {
  const t = line.trim();
  const words = t.split(/\s+/).length;
  return PAREN_LINE.test(t) || (words <= MAX_BPM_WORDS && BPM_LINE.test(t)) || (words <= MAX_SIGNATURE_WORDS && TIME_SIGNATURE.test(t));
};

/** The label of a line that is only a bracketed label, else null. */
const labelOf = (line: string): string | null => LABEL_LINE.exec(line.trim())?.[1]!.trim() ?? null;

/** What one source line of a verse draft is: a section label, a direction (lyric forms only), or a verse line. */
export type LineKind = { kind: 'label'; label: string } | { kind: 'direction' } | { kind: 'lyric' };

/** The one place a line is classified, so the measurement and the reading page agree. `lyric` turns on plain labels and directions. */
export function classifyLine(raw: string, lyric: boolean): LineKind {
  const label = labelOf(raw);
  if (label !== null) return { kind: 'label', label };
  if (lyric) {
    const plain = plainLabelOf(raw);
    if (plain !== null) return { kind: 'label', label: plain };
    if (isDirection(raw)) return { kind: 'direction' };
  }
  return { kind: 'lyric' };
}

export function extractVerse(doc: Doc): { stanzas: Stanza[]; markup: VerseMarkup[]; directions: Direction[] } {
  const stanzas: Stanza[] = [];
  const markup: VerseMarkup[] = [];
  const directions: Direction[] = [];
  const lyric = getForm(doc.form).verse?.kind === 'lyric';
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
        const kind = classifyLine(raw, lyric);
        if (kind.kind === 'label') { close(); section = kind.label; return; }
        if (kind.kind === 'direction') { directions.push({ line: block.line + i, text: raw.trim() }); return; }
        lines.push({ text: raw.trimEnd(), line: block.line + i });
      });
      close();
    } else if (SWALLOWERS.has(block.kind)) {
      markup.push({ line: block.line, kind: block.kind });
      stanzas.push({ section, lines: [{ text: block.text, line: block.line }] });
    }
    // other notes and everything else are not verse
  }
  return { stanzas, markup, directions };
}

/** Lowercase, punctuation stripped, whitespace collapsed: the key for comparing repeated lines. */
export const normalise = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
