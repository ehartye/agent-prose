import { pronounce, type Pronunciation } from './pronounce.ts';

/**
 * Per-line prosody: syllables, stress string, end word and ending class, built from word pronunciations.
 *
 * Lines are tokenised here, not with `words()`, which splits "mother-in-law" at the hyphens: a token is a word of
 * letters and numbers (with inner apostrophes) joined to others by a single ASCII hyphen, so pronounce() sees the
 * whole hyphenated word and can use a dictionary entry for it ("mother-in-law" scans 1002, not "mother" "in" "law").
 * An em or en dash is punctuation, not a hyphen, and splits words. A trailing in' (dancin') is kept for pronounce().
 * Stress: a monosyllable is '?' (flexible, because function words bend to the meter); polysyllables keep the
 * dictionary's '1' '2' '0'; guessed words are '?' per syllable.
 *
 * Ending is a punctuation proxy for enjambment, not a syntactic judgement: after removing closing quotes and
 * brackets, `. ! ? ; : …` is 'stop', `, – — -` is 'weak', anything else is 'run-on' (the sentence runs into the next line).
 */
export interface LineAnalysis {
  text: string;
  /** Sum of word syllables. */
  syllables: number;
  /** Sum using each word's alternative count where it has one; absent when no word has variants that disagree. */
  syllablesAlt?: number;
  stress: string;
  words: Pronunciation[];
  endWord: Pronunciation | null;
  ending: 'stop' | 'weak' | 'run-on';
  /** Words with source 'guessed'. */
  guessed: string[];
  /**
   * Words whose variants differ in syllable count (any word), plus the end word when its variants rhyme differently
   * ("wind"). Rhyme-key disagreement elsewhere ("the", "to", "a") does not change anything the engine reports.
   */
  ambiguous: string[];
}

/** Word, then more words joined by single hyphens, then an optional trailing apostrophe after -in (dancin'). */
export const TOKEN = /[\p{L}\p{N}]+(?:['’]\p{L}+)*(?:-[\p{L}\p{N}]+(?:['’]\p{L}+)*)*(?:(?<=\p{L}in)['’](?!\p{L}))?/giu;

const CLOSERS = /["'”’)\]\s]+$/;

function endingOf(text: string): LineAnalysis['ending'] {
  const last = text.replace(CLOSERS, '').at(-1);
  if (last && '.!?;:…'.includes(last)) return 'stop';
  if (last && ',–—-'.includes(last)) return 'weak';
  return 'run-on';
}

export function analyseLine(text: string): LineAnalysis {
  const prons = (text.match(TOKEN) ?? []).map(pronounce);
  const syllables = prons.reduce((n, p) => n + p.syllables, 0);
  const alt = prons.some(p => p.syllablesAlt !== undefined);
  const syllablesAlt = prons.reduce((n, p) => n + (p.syllablesAlt ?? p.syllables), 0);
  return {
    text,
    syllables,
    ...(alt ? { syllablesAlt } : {}),
    stress: prons.map(p => (p.syllables === 1 ? '?' : p.stress)).join(''),
    words: prons,
    endWord: prons.at(-1) ?? null,
    ending: prons.length ? endingOf(text) : 'run-on',
    guessed: prons.filter(p => p.source === 'guessed').map(p => p.word),
    ambiguous: prons
      .filter((p, i) => p.syllablesAlt !== undefined || (i === prons.length - 1 && new Set(p.variantKeys).size > 1))
      .map(p => p.word),
  };
}
