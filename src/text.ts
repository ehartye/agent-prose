import { ProseError } from './errors.ts';

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
// Case-sensitive on purpose: capitalized titles and lowercase Latin forms only, so a sentence-final "no." still splits.
const ABBREV = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Inc|Ltd|No|MR|MRS|MS|DR|PROF|SR|JR|ST)\.|\b(?:vs|etc|e\.g|i\.e|et al|cf|Figs?|Eqs?|approx|ca)\./g;
const BOUNDARY = /(?<=[.!?…]["'”’)\]]*)\s+(?=["'“‘(\[]?[\p{Lu}\p{N}])/u;
// Silent endings: -es (not after l, s, x, z, ch, sh), -ed (not after t or d), consonant + e. '#' marks a diaeresis vowel.
const SILENT_ENDING = /(?:(?<=[^laeiouy#])(?<![sxz]|[cs]h)es|(?<![td])ed|[^laeiouy#]e)$/;

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const per1000 = (count: number, total: number) => (total ? round2((count * 1000) / total) : 0);

export function words(text: string): string[] {
  return text.match(WORD) ?? [];
}

/** Sentence split on . ! ? … followed by whitespace and a capital or digit; common abbreviations are protected. */
export function sentences(text: string): string[] {
  const guarded = text.replace(ABBREV, m => m.replaceAll('.', '\u0000'));
  return guarded.split(BOUNDARY)
    .map(s => s.replaceAll('\u0000', '.').trim())
    .filter(s => words(s).length > 0);
}

/** The `[start, end)` character range of each sentence, split as `sentences` splits (abbreviations protected); used where the sentence's place in the text matters. */
export function sentenceRanges(text: string): Array<[number, number]> {
  // the guard swaps one character for one, so offsets in `guarded` are offsets in `text`
  const guarded = text.replace(ABBREV, m => m.replaceAll('.', '\u0000'));
  const ranges: Array<[number, number]> = [];
  let start = 0;
  for (const m of guarded.matchAll(new RegExp(BOUNDARY.source, 'gu'))) {
    ranges.push([start, m.index]);
    start = m.index + m[0].length;
  }
  ranges.push([start, text.length]);
  return ranges.filter(([a, b]) => words(text.slice(a, b)).length > 0);
}

/** Heuristic English syllable count (vowel groups after trimming silent endings). */
export function syllables(word: string): number {
  if (/^\d+$/.test(word)) return 1;
  const nfd = word.normalize('NFD').toLowerCase();
  const soundedFinalE = /e\u0301$/.test(nfd.replace(/[^\p{L}\p{M}]/gu, '')); // café: an accented final e is spoken
  const w = nfd
    .replace(/([aeiouy])\u0308/g, '#$1') // naïve: a diaeresis vowel starts a new vowel group
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z#]/g, '');
  const letters = w.replaceAll('#', '');
  if (!letters) return 0;
  if (letters.length <= 3) return 1;
  const trimmed = soundedFinalE ? w : w.replace(SILENT_ENDING, '').replace(/^y/, '');
  return Math.max(1, trimmed.match(/[aeiouy]{1,2}/g)?.length ?? 1);
}

/** Lines needed to word-wrap `text` at `width` characters; overlong words break across lines. */
export function wrapCount(text: string, width: number): number {
  if (!(width >= 1)) throw new ProseError('E_USAGE', 'wrap width must be at least 1');
  let lines = 0;
  let col = 0;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (col === 0) { lines++; col = w.length; }
    else if (col + 1 + w.length <= width) col += 1 + w.length;
    else { lines++; col = w.length; }
    while (col > width) { lines++; col -= width; }
  }
  return lines;
}

/**
 * Strip Markdown/Fountain inline markup: images, links, code, bold, italic, underline. Underscores inside words are kept.
 * Link text may hold one level of nested brackets. Link text and emphasis may wrap a line (non-greedy) but never cross a blank line or another opening of the same
 * markup, and span at most 2,000 characters, so unclosed markup costs linear, not quadratic, time.
 */
export function plain(text: string): string {
  return text
    .replace(/!\[((?:(?!\n[ \t]*\n)(?:[^\][]|\[[^\][]*\])){0,2000})\]\([^)]*\)/g, '$1')
    .replace(/\[((?:(?!\n[ \t]*\n)(?:[^\][]|\[[^\][]*\])){1,2000})\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*((?:(?!\n[ \t]*\n|\*\*)[\s\S]){1,2000}?)\*\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}_])__((?:(?!\n[ \t]*\n|__)[\s\S]){1,2000}?)__(?![\p{L}\p{N}_])/gu, '$1')
    .replace(/\*(?!\s)((?:(?!\n[ \t]*\n)[^*]){1,2000}?)(?<!\s)\*/g, '$1')
    // an underscore inside the span is kept only within a word (snake_case)
    .replace(/(?<![\p{L}\p{N}_])_((?:(?!\n[ \t]*\n)(?:[^_]|(?<=[\p{L}\p{N}])_(?=[\p{L}\p{N}]))){1,2000}?)_(?![\p{L}\p{N}_])/gu, '$1')
    .trim();
}

/**
 * A speaker cue without its trailing extensions: "GRIMBLE (O.S.) (CONT'D)" is GRIMBLE with extension O.S.
 * Every trailing (EXT) is stripped; the first one that is not CONT'D is kept as the extension.
 */
export function splitSpeaker(cue: string): { name: string; extension?: string } {
  let name = cue.trim();
  const exts: string[] = [];
  for (let m = name.match(/\s*\(([^)]*)\)\s*$/); m; m = name.match(/\s*\(([^)]*)\)\s*$/)) {
    exts.unshift(m[1].trim());
    name = name.slice(0, m.index).trim();
  }
  const extension = exts.find(e => !/^CONT(?:['’]D|INUED)$/i.test(e));
  return { name, ...(extension ? { extension } : {}) };
}

/**
 * The text an artifact check reads for a Markdown block: inline code removed (a literal {{name}} in code is not a leaked
 * template) and the destinations of inline links appended (a tracking parameter in a link target is still a leak). Null
 * when the block has neither code nor links, so its plain text is enough.
 */
export function artifactView(raw: string): string | null {
  if (!raw.includes('`') && !raw.includes('](')) return null;
  const noCode = raw.replace(/`[^`]*`/g, ' ');
  const targets = [...noCode.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]*)[^)]*\)/g)].map(m => m[1]).filter(Boolean);
  return [plain(noCode), ...targets].join(' ');
}
