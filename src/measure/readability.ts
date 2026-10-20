import type { Block, Doc } from '../ir.ts';
import { getForm } from '../forms.ts';
import { PROSE_KINDS } from '../kinds.ts';
import { readReader, type Reader } from '../reader.ts';
import { round1, sentences, syllables, words } from '../text.ts';

export interface ReadabilityReport {
  reader: Reader;
  method: 'flesch-kincaid-grade';
  methodVersion: '1';
  inputPolicy: 'markdown-paragraphs-v1';
  language: string;
  syllableMethod: 'english-spelling-heuristic-v1';
  status: 'estimated' | 'insufficient-sample' | 'unsupported-language' | 'unsupported-genre';
  estimate: number | null;
  counts: { words: number; sentences: number; paragraphs: number };
  /** Source block starts, as supplied by the Markdown parser. */
  lines: number[];
  exclusions: string[];
  limitations: string[];
  target: NonNullable<Reader['readingLevel']> | null;
  comparison: 'below' | 'within' | 'above' | 'not-requested' | 'unavailable';
  essentialTerms: Array<{ term: string; present: boolean; lines: number[] }>;
}

const EXCLUDED_SECTIONS = new Set(['references', 'bibliography', 'works cited', 'answer key', 'instructor notes']);
const EXCLUSIONS = [
  'Only Markdown paragraph blocks are scored; heading, list-item, step, quote and note blocks are excluded.',
  'References, Bibliography, Works cited, Answer key and Instructor notes sections are excluded until a heading at the same or a higher level.',
];
const LIMITATIONS = [
  'The estimate does not establish comprehension or audience suitability.',
  'At least 100 words and 5 sentence units are required; this sample floor is a maintainer convention, not a validated cutoff.',
  'Code fences and tables are omitted by the Markdown parser; discarded text, images and unseen material are not assessed, and no whole-document coverage percentage is implied.',
  'Inline code and mathematical content retained in paragraph text can distort the English spelling heuristic; symbol-heavy passages need qualitative review.',
  'This formula does not measure mathematics, table accessibility, listening difficulty or decodability.',
  'Source lines identify block starts in the parser view; continuation lines may be flattened.',
  'Essential-term presence does not establish a definition, correct usage or retained meaning; inflection and renaming need review.',
];

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Keep headings and prose outside excluded sections; a nested heading cannot end its excluded ancestor. */
function learnerBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let excludedLevel: number | null = null;
  for (const block of blocks) {
    if (block.kind === 'heading') {
      const level = Number(block.meta?.level ?? 1);
      if (excludedLevel !== null && level <= excludedLevel) excludedLevel = null;
      // The legacy parser retains optional ATX closing hashes; ignore them only for this reading-view lookup.
      const sectionName = normalize(block.text.replace(/[ \t]+#+[ \t]*$/, ''));
      if (EXCLUDED_SECTIONS.has(sectionName) && excludedLevel === null) excludedLevel = level;
    }
    if (excludedLevel === null && (block.kind === 'heading' || PROSE_KINDS.has(block.kind))) out.push(block);
  }
  return out;
}

function essentialTerms(terms: string[], blocks: Block[]): ReadabilityReport['essentialTerms'] {
  const text = blocks.map(block => ({ text: normalize(block.text), line: block.line }));
  return terms.map(term => {
    // Unicode letters, numbers, marks and connector punctuation keep a phrase from matching inside a word.
    // Hyphens and spelling stay literal; there is no stemming or synonym expansion.
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}\\p{Pc}])${escapeRe(normalize(term))}(?![\\p{L}\\p{N}\\p{M}\\p{Pc}])`, 'u');
    const lines = [...new Set(text.filter(block => pattern.test(block.text)).map(block => block.line))];
    return { term, present: lines.length > 0, lines };
  });
}

/** An opt-in paragraph diagnostic. Its named versions bind the current text-helper and input-policy behavior. */
export function measureReadability(doc: Doc): ReadabilityReport | null {
  const reader = readReader(doc.meta);
  if (!reader) return null;
  const blocks = doc.format === 'markdown' ? learnerBlocks(doc.blocks) : [];
  const paragraphs = blocks.filter(block => block.kind === 'paragraph');
  const tokens = paragraphs.flatMap(block => words(block.text));
  const W = tokens.length;
  const S = paragraphs.reduce((total, block) => total + sentences(block.text).length, 0);
  const status: ReadabilityReport['status'] = !/^en(?:-|$)/i.test(reader.language) ? 'unsupported-language'
    : doc.format !== 'markdown' || getForm(doc.form).verse ? 'unsupported-genre'
    : W < 100 || S < 5 ? 'insufficient-sample' : 'estimated';
  const syllableCount = status === 'estimated' ? tokens.reduce((total, word) => total + syllables(word), 0) : 0;
  // The FK coefficients over a common denominator avoid turning an exact grade endpoint into 8.000000000000002.
  // This is the same unrounded formula: 0.39 * W/S + 11.8 * syllables/W - 15.59.
  const raw = status === 'estimated' ? (39 * W * W + 1180 * syllableCount * S - 1559 * W * S) / (100 * W * S) : null;
  const target = reader.readingLevel ?? null;
  const comparison: ReadabilityReport['comparison'] = raw === null ? 'unavailable' : !target ? 'not-requested'
    : raw < target.range[0] ? 'below' : raw > target.range[1] ? 'above' : 'within';
  return {
    reader, method: 'flesch-kincaid-grade', methodVersion: '1', inputPolicy: 'markdown-paragraphs-v1',
    language: reader.language, syllableMethod: 'english-spelling-heuristic-v1', status,
    estimate: raw === null ? null : round1(raw), counts: { words: W, sentences: S, paragraphs: paragraphs.length },
    lines: [...new Set(paragraphs.map(block => block.line))], exclusions: [...EXCLUSIONS], limitations: [...LIMITATIONS],
    target, comparison, essentialTerms: essentialTerms(reader.essentialTerms ?? [], blocks),
  };
}
