import type { Doc } from '../ir.ts';
import type { Form } from '../forms.ts';
import { readDeclared, type Declared } from '../declared.ts';
import { round2 } from '../text.ts';
import { extractVerse, normalise, type Direction, type VerseMarkup } from '../verse/lines.ts';
import { checkMeter, type MeterLine } from '../verse/meter.ts';
import { analyseLine, type LineAnalysis } from '../verse/prosody.ts';
import { scheme, type RhymePair } from '../verse/rhyme.ts';

export interface LineStat {
  /** Source line number. */
  line: number;
  /** Stanza index. */
  stanza: number;
  section: string | null;
  text: string;
  /** First pronunciation's count; `syllablesAlt` is set when the words' variants give another. */
  syllables: number;
  syllablesAlt?: number;
  /** Per syllable: 1 stressed, 0 unstressed, 2 secondary, ? flexible (monosyllables, guessed words). */
  stress: string;
  endWord: string | null;
  /** Punctuation proxy for enjambment: stop, weak or run-on. */
  ending: 'stop' | 'weak' | 'run-on';
  /** Rhyme-scheme letter, '-' for a line without an end word. */
  rhyme: string;
  guessed: string[];
  ambiguous: string[];
}

export interface LyricSection {
  label: string;
  /** Lowercased label without a trailing number or letter and without punctuation ("Verse 1" is "verse"). */
  base: string;
  /** 1-based count of sections with this base, in order. */
  occurrence: number;
  /** Indexes into `lines`. */
  lines: number[];
  syllables: number[];
}

export interface LyricStats {
  sections: LyricSection[];
  /** Refrain sections (chorus, refrain, hook, outro, tag) that occur more than once; `differs` lines index into `lines`. */
  refrains: Array<{ base: string; consistent: boolean; differs: Array<{ occurrence: number; line: number }> }>;
  /** Other repeated bases, compared by syllables only: b minus a per line, over the lines both have. */
  likeSections: Array<{ base: string; a: number; b: number; diffs: number[]; max: number }>;
  syllablesPerBeat: { tempo: number; beatsPerLine: number; perLine: number[]; mean: number } | null;
}

export interface VerseStats {
  kind: 'poem' | 'lyric';
  lines: LineStat[];
  /** `start` indexes into `lines`. */
  stanzas: Array<{ section: string | null; start: number; count: number }>;
  count: { lines: number; stanzas: number };
  syllables: { mean: number; sd: number; min: number; max: number };
  /** End-rhyme letters over all lines (identity and perfect), and also counting assonance and consonance. */
  scheme: string;
  nearScheme: string;
  /** Rhymed pairs of lines, as indexes into `lines`. */
  pairs: RhymePair[];
  /** Exact repeated lines (lowercase, punctuation stripped) with their source line numbers. */
  repeats: Array<{ text: string; lines: number[] }>;
  /** Present only when the form declares meter; `line` indexes into `lines`. */
  meter: MeterLine[] | null;
  /** Word counts by pronunciation source across the whole text. */
  trust: { dict: number; affix: number; guessed: number; words: number };
  markup: VerseMarkup[];
  /** Lyrics only: performance notes ((hum softly), "Folk, about 90 bpm, 4/4") kept out of the lines; always empty for a poem. */
  directions: Direction[];
  /** Author-declared syllable pattern and rhyme scheme from the frontmatter, as normalised; null when neither is declared. */
  declared: Declared | null;
  lyric: LyricStats | null;
  dialect: 'US English';
}

const REFRAIN_BASES = new Set(['chorus', 'refrain', 'hook', 'outro', 'tag']);

/** "Verse 1" is "verse", "Chorus (x2)" is "chorus", "Bridge B:" is "bridge". */
export function baseLabel(label: string): string {
  return label.toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .trim()
    .replace(/\s+(?:\d+[a-z]?|[a-z])$/, '')
    .replace(/\s+/g, ' ');
}

/** What a declared pattern asks of one stanza: syllable counts per line and a scheme, each null when none covers it. */
export interface StanzaPattern { syllables: number[] | null; scheme: string | null }

function pick<T>(declared: T | Record<string, T> | null, section: string | null): T | null {
  if (declared === null) return null;
  if (typeof declared !== 'object' || Array.isArray(declared)) return declared as T;
  if (section === null) return null;
  const base = baseLabel(section);
  const hit = Object.entries(declared as Record<string, T>).find(([key]) => baseLabel(key) === base);
  return hit ? hit[1] : null;
}

/** The declared pattern for each stanza: one pattern for all stanzas, or by the stanza's section base label. */
export function stanzaPatterns(v: Pick<VerseStats, 'stanzas' | 'declared'>): StanzaPattern[] {
  const d = v.declared;
  return v.stanzas.map(st => ({ syllables: pick(d?.syllables ?? null, st.section), scheme: pick(d?.scheme ?? null, st.section) }));
}

/** The lowest and highest syllable count a line can be read as (a word such as "every" counts two or three). */
export const syllableRange = (l: Pick<LineStat, 'syllables' | 'syllablesAlt'>): [number, number] =>
  [Math.min(l.syllables, l.syllablesAlt ?? l.syllables), Math.max(l.syllables, l.syllablesAlt ?? l.syllables)];

/**
 * A line against a syllable target, in ONE place for scan and lint: ok when the target is inside the line's range,
 * `over` when even the lowest reading has more syllables (diff is positive), `under` when even the highest has fewer
 * (diff is negative).
 */
export function syllableFit(l: Pick<LineStat, 'syllables' | 'syllablesAlt'>, want: number): { fit: 'ok' | 'over' | 'under'; diff?: number } {
  const [lo, hi] = syllableRange(l);
  if (want < lo) return { fit: 'over', diff: lo - want };
  if (want > hi) return { fit: 'under', diff: hi - want };
  return { fit: 'ok' };
}

/** The declared syllable target for each line (null where no pattern covers it or its stanza has the wrong number of lines). */
export function lineTargets(v: Pick<VerseStats, 'stanzas' | 'declared' | 'lines'>): Array<number | null> {
  const out: Array<number | null> = v.lines.map(() => null);
  stanzaPatterns(v).forEach((p, i) => {
    const st = v.stanzas[i]!;
    if (!p.syllables || p.syllables.length !== st.count) return;
    p.syllables.forEach((want, k) => { out[st.start + k] = want; });
  });
  return out;
}

function syllableStats(counts: number[]): VerseStats['syllables'] {
  if (!counts.length) return { mean: 0, sd: 0, min: 0, max: 0 };
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const sd = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length);
  return { mean: round2(mean), sd: round2(sd), min: Math.min(...counts), max: Math.max(...counts) };
}

function repeatsOf(lines: LineStat[]): VerseStats['repeats'] {
  const seen = new Map<string, number[]>();
  for (const l of lines) {
    const key = normalise(l.text);
    if (key) seen.set(key, [...(seen.get(key) ?? []), l.line]);
  }
  return [...seen].filter(([, at]) => at.length > 1).map(([text, at]) => ({ text, lines: at }));
}

/** Tempo and beats per line from frontmatter; invalid values are ignored (a rule reports them), never thrown. */
function beatsFrom(meta: Doc['meta']): { tempo: number; beatsPerLine: number } | null {
  const { tempo, beatsPerLine } = meta;
  if (typeof tempo !== 'number' || !Number.isFinite(tempo) || tempo <= 0) return null;
  if (beatsPerLine === undefined) return { tempo, beatsPerLine: 4 };
  if (typeof beatsPerLine !== 'number' || !Number.isInteger(beatsPerLine) || beatsPerLine <= 0) return null;
  return { tempo, beatsPerLine };
}

function lyricOf(doc: Doc, lines: LineStat[], stanzas: VerseStats['stanzas']): LyricStats {
  const sections: LyricSection[] = [];
  const seen = new Map<string, number>();
  for (const st of stanzas) {
    if (st.section === null) continue;
    const indexes = Array.from({ length: st.count }, (_, k) => st.start + k);
    const last = sections.at(-1);
    if (last && last.label === st.section) {
      last.lines.push(...indexes);
      last.syllables.push(...indexes.map(i => lines[i]!.syllables));
      continue;
    }
    const base = baseLabel(st.section);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    sections.push({ label: st.section, base, occurrence, lines: indexes, syllables: indexes.map(i => lines[i]!.syllables) });
  }
  const bases = [...new Set(sections.map(s => s.base))];
  const of = (base: string) => sections.filter(s => s.base === base);
  const textOf = (s: LyricSection) => s.lines.map(i => normalise(lines[i]!.text));

  const refrains = bases.filter(b => REFRAIN_BASES.has(b) && of(b).length > 1).map(base => {
    const [first, ...later] = of(base);
    const want = textOf(first!);
    const differs = later.flatMap(s => {
      const got = textOf(s);
      return s.lines.filter((_, k) => got[k] !== want[k]).map(line => ({ occurrence: s.occurrence, line }));
    });
    const sameLength = later.every(s => s.lines.length === first!.lines.length);
    return { base, consistent: differs.length === 0 && sameLength, differs };
  });

  const likeSections = bases.filter(b => !REFRAIN_BASES.has(b) && of(b).length > 1).flatMap(base =>
    of(base).slice(1).map((s, k) => {
      const prev = of(base)[k]!;
      const diffs = Array.from({ length: Math.min(prev.syllables.length, s.syllables.length) }, (_, i) => s.syllables[i]! - prev.syllables[i]!);
      return { base, a: prev.occurrence, b: s.occurrence, diffs, max: Math.max(0, ...diffs.map(Math.abs)) };
    }));

  const beats = beatsFrom(doc.meta);
  const perLine = beats ? lines.map(l => round2(l.syllables / beats.beatsPerLine)) : [];
  const syllablesPerBeat = beats && {
    ...beats, perLine, mean: perLine.length ? round2(perLine.reduce((a, b) => a + b, 0) / perLine.length) : 0,
  };
  return { sections, refrains, likeSections, syllablesPerBeat };
}

/** Feet for each line from the form's `feetPerLine`: by line index in a single-stanza form, by position in the stanza otherwise. */
function feetPerLine(def: NonNullable<Form['verse']>, spans: VerseStats['stanzas'], total: number): number[] | undefined {
  const feet = def.feetPerLine;
  if (!feet) return undefined;
  if (def.lines !== undefined) return feet;
  const out: number[] = [];
  for (const st of spans) for (let k = 0; k < st.count; k++) out.push(feet[k] ?? def.meter!.feet);
  return out.slice(0, total);
}

/**
 * Measure a verse draft (poem or lyric). Called only for forms with a `verse` definition, so the pronouncing dictionary
 * (loaded on the first pronunciation) is never read for prose forms.
 */
export function measureVerse(doc: Doc, form: Form): VerseStats | null {
  const def = form.verse;
  if (!def) return null;
  const declared = readDeclared(doc.meta);
  const { stanzas, markup, directions } = extractVerse(doc);
  const analyses: LineAnalysis[] = [];
  const meta: Array<{ line: number; stanza: number; section: string | null }> = [];
  const spans: VerseStats['stanzas'] = [];
  stanzas.forEach((st, stanza) => {
    spans.push({ section: st.section, start: analyses.length, count: st.lines.length });
    for (const l of st.lines) {
      analyses.push(analyseLine(l.text));
      meta.push({ line: l.line, stanza, section: st.section });
    }
  });
  const rhyme = scheme(analyses.map(a => a.endWord));
  const lines: LineStat[] = analyses.map((a, i) => ({
    ...meta[i]!,
    text: a.text,
    syllables: a.syllables,
    ...(a.syllablesAlt !== undefined ? { syllablesAlt: a.syllablesAlt } : {}),
    stress: a.stress,
    endWord: a.endWord?.word ?? null,
    ending: a.ending,
    rhyme: rhyme.scheme[i]!,
    guessed: a.guessed,
    ambiguous: a.ambiguous,
  }));
  const sources = analyses.flatMap(a => a.words.map(w => w.source));
  const count = (s: string) => sources.filter(x => x === s).length;
  return {
    kind: def.kind,
    lines,
    stanzas: spans,
    count: { lines: lines.length, stanzas: spans.length },
    syllables: syllableStats(lines.map(l => l.syllables)),
    scheme: rhyme.scheme,
    nearScheme: rhyme.nearScheme,
    pairs: rhyme.pairs,
    repeats: repeatsOf(lines),
    meter: def.meter ? checkMeter(analyses, def.meter, feetPerLine(def, spans, analyses.length)) : null,
    trust: { dict: count('dict'), affix: count('affix'), guessed: count('guessed'), words: sources.length },
    markup,
    directions,
    declared,
    lyric: def.kind === 'lyric' ? lyricOf(doc, lines, spans) : null,
    dialect: 'US English',
  };
}
