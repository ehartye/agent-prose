import type { Block } from '../ir.ts';
import { per1000, round1, round2, sentences, syllables, words } from '../text.ts';
import { HEDGES, matchLexicon } from './lexicon.ts';

const IRREGULAR = ['awoken', 'been', 'born', 'beaten', 'become', 'begun', 'bent', 'bitten', 'blown', 'broken', 'brought', 'built', 'bought',
  'caught', 'chosen', 'come', 'cut', 'dealt', 'done', 'drawn', 'driven', 'drunk', 'eaten', 'fallen', 'felt', 'fought', 'found', 'flown',
  'forgotten', 'forgiven', 'frozen', 'gotten', 'given', 'gone', 'grown', 'hung', 'heard', 'hidden', 'hit', 'held', 'hurt', 'kept', 'known',
  'laid', 'led', 'left', 'lent', 'lost', 'made', 'meant', 'met', 'paid', 'put', 'read', 'ridden', 'rung', 'risen', 'run', 'said', 'seen',
  'sold', 'sent', 'set', 'shaken', 'shot', 'shown', 'shut', 'sung', 'sunk', 'slept', 'spoken', 'spent', 'spun', 'stood', 'stolen', 'stuck',
  'struck', 'sworn', 'swept', 'taken', 'taught', 'torn', 'told', 'thought', 'thrown', 'understood', 'woken', 'worn', 'won', 'written'];
/** A form of "to be", an optional -ly adverb, then a past participle (regular -ed or irregular). */
const PASSIVE = new RegExp(`\\b(?:am|is|are|was|were|be|been|being)\\s+(?:\\w+ly\\s+)?(?:\\w{2,}ed|${IRREGULAR.join('|')})\\b`, 'i');
const NOMINAL = /^\p{L}{3,}(?:tion|sion|ment|ness|ity|ance|ence)$/iu;
const NOMINAL_STOP = new Set(['moment', 'comment', 'element', 'segment', 'cement', 'pigment', 'garment', 'ornament', 'sentence', 'science', 'silence', 'distance', 'balance', 'business',
  'question', 'community', 'apartment', 'department', 'difference', 'experience', 'conference', 'audience']);
const CONTRACTION = /\b\p{L}+['’](?:t|re|ve|ll|m|d)\b|\b(?:it|that|there|here|what|who|he|she|let|where|how)['’]s\b/giu;
/** A leading opening quote or bracket may precede the opener. */
const THERE_IS = /^["'\u201C\u2018(\[]?(?:there|here)\s+(?:is|are|was|were)\b/i;
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is', 'are', 'was', 'were', 'it', 'that', 'this', 'i', 'you', 'we', 'he', 'she', 'they', 'be', 'as', 'by', 'from']);

export interface Echo { phrase: string; count: number; lines: number[] }
export interface StyleStats {
  words: number;
  sentences: number;
  sentenceLength: { mean: number; sd: number; max: number };
  longest: { line: number; words: number } | null;
  passive: { count: number; rate: number };
  nominalizations: { count: number; per100: number };
  hedges: { count: number; per1000: number };
  contractions: { count: number; per1000: number };
  thereIs: { count: number; lines: number[] };
  echo: Echo[];
  readingGrade: number | null;
}

const isNominalization = (w: string) => w.length >= 7 && NOMINAL.test(w) && !NOMINAL_STOP.has(w.toLowerCase());

/** 3-word phrases (not all stopwords) that occur at least twice, within blocks. Top 20 by count. */
export function echoes(blocks: Block[]): Echo[] {
  const seen = new Map<string, number[]>();
  for (const b of blocks) {
    const w = words(b.text).map(x => x.toLowerCase());
    for (let k = 0; k + 3 <= w.length; k++) {
      const gram = w.slice(k, k + 3);
      if (gram.every(x => STOP.has(x))) continue;
      const key = gram.join(' ');
      const lines = seen.get(key) ?? [];
      lines.push(b.line);
      seen.set(key, lines);
    }
  }
  return [...seen]
    .filter(([, lines]) => lines.length >= 2)
    .map(([phrase, lines]) => ({ phrase, count: lines.length, lines: [...new Set(lines)] }))
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase))
    .slice(0, 20);
}

export function measureStyle(blocks: Block[]): StyleStats {
  const sents = blocks.flatMap(b => sentences(b.text).map(text => ({ text, line: b.line, n: words(text).length })));
  const allWords = blocks.flatMap(b => words(b.text));
  const W = allWords.length;
  const S = sents.length;
  const lengths = sents.map(s => s.n);
  const mean = S ? lengths.reduce((a, n) => a + n, 0) / S : 0;
  const sd = S ? Math.sqrt(lengths.reduce((a, n) => a + (n - mean) ** 2, 0) / S) : 0;
  let longest: { line: number; words: number } | null = null;
  for (const s of sents) if (!longest || s.n > longest.words) longest = { line: s.line, words: s.n };
  const passive = sents.filter(s => PASSIVE.test(s.text)).length;
  const nominal = allWords.filter(isNominalization).length;
  const hedges = matchLexicon(HEDGES, blocks).reduce((n, h) => n + h.count, 0);
  const contractions = blocks.reduce((n, b) => n + (b.text.match(CONTRACTION)?.length ?? 0), 0);
  const thereIs = sents.filter(s => THERE_IS.test(s.text)).map(s => s.line);
  const syl = allWords.reduce((n, w) => n + syllables(w), 0);
  return {
    words: W,
    sentences: S,
    sentenceLength: { mean: round2(mean), sd: round2(sd), max: lengths.reduce((a, n) => Math.max(a, n), 0) },
    longest,
    passive: { count: passive, rate: S ? round2(passive / S) : 0 },
    nominalizations: { count: nominal, per100: W ? round2((nominal * 100) / W) : 0 },
    hedges: { count: hedges, per1000: per1000(hedges, W) },
    contractions: { count: contractions, per1000: per1000(contractions, W) },
    thereIs: { count: thereIs.length, lines: [...new Set(thereIs)] },
    echo: echoes(blocks),
    readingGrade: W >= 30 && S ? round1(0.39 * (W / S) + 11.8 * (syl / W) - 15.59) : null,
  };
}
