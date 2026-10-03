import { getForm } from '../forms.ts';
import type { LineStat, VerseStats } from '../measure/verse.ts';
import { pronounce } from '../verse/pronounce.ts';
import { fitsMeter } from '../verse/meter.ts';
import { normalise } from '../verse/lines.ts';
import { TOKEN } from '../verse/prosody.ts';
import { rhymeClass, type RhymeClass } from '../verse/rhyme.ts';
import type { Evaluator, Hit } from './evaluators.ts';

/** Evaluators for the verse.* and lyric.* rules. Each is silent for a draft without verse stats. */

const WEAKER = 'weaker: guessed or variant pronunciation';
const EYE_NOTE = 'may be an eye rhyme or a historical pronunciation (US English dictionary)';
/** Longest word list a finding prints before saying how many more. */
const LIST_CAP = 12;

const quote = (s: string) => `"${s}"`;
/** The last word of a line as written (case kept), for messages. */
const lastWord = (text: string) => text.match(TOKEN)?.at(-1) ?? '';
const unique = <T>(xs: T[]) => [...new Set(xs)];
const joinList = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const linesWord = (n: number[]) => `line${n.length === 1 ? '' : 's'} ${n.join(', ')}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** Verse stats and the form's verse definition, or null for a form without them. */
function verseOf(m: Parameters<Evaluator>[0]['m']) {
  if (!m.verse) return null;
  const def = getForm(m.form).verse;
  return def ? { v: m.verse, def, form: m.form } : null;
}
const srcLine = (v: VerseStats, i: number) => v.lines[i]!.line;

/** Line indexes of each lowercase scheme letter ("A" refrain letters group with "a"), in first-appearance order. */
function groupsOf(scheme: string, indexes: number[]): number[][] {
  const groups = new Map<string, number[]>();
  [...scheme.toLowerCase()].forEach((letter, k) => groups.set(letter, [...(groups.get(letter) ?? []), indexes[k]!]));
  return [...groups.values()].filter(g => g.length > 1);
}

interface PairResult { first: number; other: number; cls: RhymeClass; uncertain: boolean }
interface SchemeResult { warn: PairResult[]; slant: PairResult[]; weak: PairResult[] }

/** Compare every member of each rhyme group with the group's first line, using the end words' pronunciations. */
function checkScheme(v: VerseStats, indexes: number[], scheme: string): SchemeResult {
  const out: SchemeResult = { warn: [], slant: [], weak: [] };
  for (const group of groupsOf(scheme, indexes)) {
    const first = group[0]!;
    const a = v.lines[first]!.endWord;
    if (a === null) continue;
    for (const other of group.slice(1)) {
      const b = v.lines[other]!.endWord;
      if (b === null) continue;
      const r = rhymeClass(pronounce(a), pronounce(b));
      const pair: PairResult = { first, other, cls: r.class, uncertain: r.uncertain };
      if (r.class === 'identity' || r.class === 'perfect') continue;
      if (r.class === 'assonance' || r.class === 'consonance') out.slant.push(pair);
      else if (r.class === 'eye' || r.uncertain) out.weak.push(pair);
      else out.warn.push(pair);
    }
  }
  return out;
}

/** Of several allowed schemes, the one with the fewest warnings (then the fewest findings of any kind). */
function bestScheme(v: VerseStats, indexes: number[], schemes: string[]): SchemeResult | null {
  const fits = schemes.filter(s => s.length === indexes.length);
  if (!fits.length) return null;
  const results = fits.map(s => checkScheme(v, indexes, s));
  const total = (r: SchemeResult) => r.warn.length * 100 + r.weak.length + r.slant.length;
  return results.reduce((best, r) => (total(r) < total(best) ? r : best));
}

const shown = (v: VerseStats, i: number) => lastWord(v.lines[i]!.text) || v.lines[i]!.endWord || '';
const pairText = (v: VerseStats, p: PairResult) => `lines ${srcLine(v, p.first)} and ${srcLine(v, p.other)} (${quote(shown(v, p.first))} and ${quote(shown(v, p.other))})`;

const lineCount: Evaluator = ({ m }) => {
  const ctx = verseOf(m);
  if (!ctx) return [];
  const { v, def, form } = ctx;
  const hits: Hit[] = [];
  if (def.lines !== undefined && v.count.lines !== def.lines) {
    const diff = def.lines - v.count.lines;
    const at = diff < 0 ? srcLine(v, def.lines) : v.lines.length ? srcLine(v, v.lines.length - 1) : null;
    return [{
      message: `Expected ${def.lines} lines (${form}), found ${v.count.lines}`, line: at, measured: { expected: def.lines, actual: v.count.lines },
      fix: diff > 0 ? `Add ${plural(diff, 'line')}, or choose another form.` : `Cut ${plural(-diff, 'line')}, or choose another form.`,
    }];
  }
  if (def.stanzaSizes) {
    // A form with a total (villanelle, sestina) must also break its stanzas the same way; a form without one (ballad)
    // is checked stanza by stanza, each against any allowed size.
    const sizes = def.stanzaSizes;
    const ok = (count: number, i: number) => (def.lines === undefined ? sizes.includes(count) : sizes[i] === count);
    const bad = v.stanzas.findIndex((s, i) => !ok(s.count, i));
    const wrong = def.lines === undefined ? v.stanzas.flatMap((s, i) => (ok(s.count, i) ? [] : [i])) : bad < 0 ? [] : [bad];
    for (const i of wrong) {
      const s = v.stanzas[i]!;
      hits.push({
        message: def.lines === undefined
          ? `Stanza ${i + 1} has ${s.count} lines; a ${form} stanza has ${joinList(unique(sizes).map(String))} (${form === 'ballad' ? 'a quatrain' : 'the form’s stanza size'})`
          : `Stanza ${i + 1} has ${s.count} lines; the form's stanzas run ${sizes.join(', ')}`,
        line: srcLine(v, s.start), measured: { stanza: i + 1, lines: s.count },
        fix: 'Break the stanza where the form does, or choose another form.',
      });
    }
  }
  return hits;
};

const rhymeScheme: Evaluator = ({ m }) => {
  const ctx = verseOf(m);
  if (!ctx) return [];
  const { v, def } = ctx;
  const schemes = def.scheme ? [def.scheme] : def.schemes ?? [];
  if (!schemes.length) return [];
  // Domains whose line count is wrong stay silent: the line-count rule speaks for them.
  const domains: number[][] = def.lines !== undefined
    ? (v.count.lines === def.lines ? [v.lines.map((_, i) => i)] : [])
    : v.stanzas.filter(s => !def.stanzaSizes || def.stanzaSizes.includes(s.count)).map(s => Array.from({ length: s.count }, (_, k) => s.start + k));
  const total: SchemeResult = { warn: [], slant: [], weak: [] };
  for (const indexes of domains) {
    const r = bestScheme(v, indexes, schemes);
    if (r) { total.warn.push(...r.warn); total.slant.push(...r.slant); total.weak.push(...r.weak); }
  }
  const hits: Hit[] = total.warn.map(p => ({
    message: `${cap(pairText(v, p))} should rhyme in this form, but the end words do not rhyme`,
    line: srcLine(v, p.other), measured: { first: srcLine(v, p.first), other: srcLine(v, p.other), class: p.cls },
    fix: 'Reword one of the lines so the end words rhyme, or change the form.',
  }));
  if (total.slant.length) {
    hits.push({
      message: `Slant rhyme only (assonance or consonance, not a full rhyme): ${joinList(total.slant.map(p => pairText(v, p)))}${total.slant.some(p => p.uncertain) ? `; ${WEAKER}` : ''}`,
      severity: 'info', line: srcLine(v, total.slant[0]!.other), measured: total.slant.map(p => ({ first: srcLine(v, p.first), other: srcLine(v, p.other), class: p.cls })),
      fix: 'Keep the slant rhyme on purpose, or choose a word that rhymes fully.',
    });
  }
  if (total.weak.length) {
    const notes = [
      ...(total.weak.some(p => p.cls === 'eye') ? [EYE_NOTE] : []),
      ...(total.weak.some(p => p.uncertain) ? [WEAKER] : []),
    ];
    hits.push({
      message: `${cap(joinList(total.weak.map(p => pairText(v, p))))}: not a perfect rhyme in the dictionary; ${notes.join('; ')}`,
      severity: 'info', line: srcLine(v, total.weak[0]!.other), measured: total.weak.map(p => ({ first: srcLine(v, p.first), other: srcLine(v, p.other), class: p.cls, uncertain: p.uncertain })),
      fix: 'Read the lines aloud; if they rhyme for you, leave them.',
    });
  }
  return hits;
};

const rangeText = (l: LineStat) => (l.syllablesAlt === undefined ? String(l.syllables) : `${Math.min(l.syllables, l.syllablesAlt)} or ${Math.max(l.syllables, l.syllablesAlt)}`);

const syllables: Evaluator = ({ m }) => {
  const ctx = verseOf(m);
  if (!ctx?.def.syllables) return [];
  const { v, def } = ctx;
  const target = def.syllables!;
  return v.lines.slice(0, target.length).flatMap((l, i) => {
    const want = target[i]!;
    const lo = Math.min(l.syllables, l.syllablesAlt ?? l.syllables);
    const hi = Math.max(l.syllables, l.syllablesAlt ?? l.syllables);
    if (want >= lo && want <= hi) return [];
    const weak = l.guessed.length || l.syllablesAlt !== undefined;
    const soft = def.soft === true;
    return [{
      message: `Line ${l.line} has ${rangeText(l)} syllables; the form's pattern is ${target.join('/')}, so this line wants ${want}${soft ? `; soft: contemporary practice often breaks ${target.join('/')}` : ''}${weak ? `; ${WEAKER}` : ''}`,
      line: l.line, measured: { syllables: l.syllables, ...(l.syllablesAlt !== undefined ? { alt: l.syllablesAlt } : {}), want, soft },
      fix: soft ? 'Add or cut a syllable, or keep the line: poets.org notes that the pattern is routinely broken.' : 'Add or cut a syllable to match the form.',
      // soft counts are conventions: never above info, whatever the rule's severity
      ...(soft ? { severity: 'info' as const } : {}),
    }];
  });
};

const refrain: Evaluator = ({ m }) => {
  const ctx = verseOf(m);
  if (!ctx?.def.refrains || ctx.def.lines === undefined || ctx.v.count.lines !== ctx.def.lines) return [];
  const { v, def } = ctx;
  return Object.entries(def.refrains!).flatMap(([name, positions]) => {
    const head = v.lines[positions[0]! - 1]!;
    return positions.slice(1).flatMap(p => {
      const l = v.lines[p - 1]!;
      return normalise(l.text) === normalise(head.text) ? [] : [{
        message: `Line ${l.line} should repeat the ${name} refrain (line ${head.line}) verbatim: ${quote(head.text)}`,
        line: l.line, measured: { refrain: name, want: head.text, got: l.text },
        fix: 'Copy the refrain line exactly; capitalisation and punctuation may differ.',
      }];
    });
  });
};

const endWords: Evaluator = ({ m }) => {
  const ctx = verseOf(m);
  if (!ctx?.def.endWordRotation || ctx.def.lines === undefined || ctx.v.count.lines !== ctx.def.lines) return [];
  const { v, def } = ctx;
  const rotation = def.endWordRotation!;
  const word = (i: number) => lastWord(v.lines[i]!.text).toLowerCase().replace(/’/g, "'");
  const size = rotation[0]!.length;
  const set = Array.from({ length: size }, (_, k) => word(k)); // A..F, from the first stanza
  const hits: Hit[] = [];
  rotation.forEach((row, r) => row.forEach((slot, k) => {
    const i = r * size + k;
    if (word(i) === set[slot]) return;
    hits.push({
      message: `Line ${srcLine(v, i)} ends ${quote(word(i))}, but stanza ${r + 1} should end this line with ${quote(set[slot]!)} (end word ${String.fromCharCode(65 + slot)} from stanza 1)`,
      line: srcLine(v, i), measured: { stanza: r + 1, want: set[slot], got: word(i) },
      fix: `End the line with ${quote(set[slot]!)}.`,
    });
  }));
  const envoi = v.lines.slice(-(def.envoiLines ?? 3));
  const present = new Set(envoi.flatMap(l => (l.text.toLowerCase().replace(/’/g, "'").match(TOKEN) ?? [])));
  const missing = unique(set).filter(w => !present.has(w));
  if (missing.length) {
    hits.push({
      message: `The envoi (last ${envoi.length} lines) must contain all ${size} end words; missing ${joinList(missing.map(quote))}`,
      line: envoi[0]!.line, measured: { missing },
      fix: 'Work the missing end words into the envoi (two per line is traditional).',
    });
  }
  return hits;
};

const FOOT_NAME = { iamb: 'iambic', trochee: 'trochaic', anapest: 'anapestic', dactyl: 'dactylic', common: 'common' } as const;

const meterDeviation: Evaluator = ({ m }) => {
  const ctx = verseOf(m);
  if (!ctx?.v.meter || !ctx.def.meter) return [];
  const { v, def } = ctx;
  const name = FOOT_NAME[def.meter!.foot];
  const hits: Hit[] = v.meter!.filter(l => !l.skipped && l.deviations.length).map(l => ({
    message: `Line ${srcLine(v, l.line)}: stress falls against the ${name} meter at syllable${l.deviations.length === 1 ? '' : 's'} ${joinList(l.deviations.map(d => String(d + 1)))} (meter is advisory)`,
    line: srcLine(v, l.line), measured: { syllables: l.syllables, deviations: l.deviations },
  }));
  const skipped = v.meter!.filter(l => l.skipped).length;
  if (skipped * 2 > v.meter!.length) {
    hits.push({
      message: `${skipped} of ${v.meter!.length} lines were skipped for guessed words, so the meter findings cover only the rest (${WEAKER})`,
      line: null, measured: { skipped, lines: v.meter!.length },
    });
  }
  return hits;
};

/** Lines by word, for words in `pick(line)`, in order of first appearance. */
const wordLines = (v: VerseStats, pick: (l: LineStat) => string[]) => {
  const byWord = new Map<string, number[]>();
  for (const l of v.lines) for (const w of unique(pick(l))) byWord.set(w, [...(byWord.get(w) ?? []), l.line]);
  return byWord;
};

const guessed: Evaluator = ({ m }) => {
  if (!m.verse) return [];
  const byWord = wordLines(m.verse, l => l.guessed);
  if (!byWord.size) return [];
  const entries = [...byWord];
  const listed = entries.slice(0, LIST_CAP).map(([w, lines]) => `${w} (${linesWord(lines)})`);
  const more = entries.length - listed.length;
  return [{
    message: `${plural(entries.length, 'word')} not in the dictionary, so the pronunciation was guessed: ${listed.join(', ')}${more > 0 ? `, +${more} more` : ''}; syllable, stress and rhyme results on those lines are weaker`,
    line: Math.min(...entries.flatMap(([, lines]) => lines)), measured: Object.fromEntries(entries),
    fix: 'Check these words by ear; spell a regular word the regular way, or accept the weaker verdict.',
  }];
};

/**
 * Line indexes that take part in a rhyme group the form expects: a scheme letter shared by two lines of the same domain
 * (the whole poem, or one stanza for a stanza form). Where a form allows several schemes, a line counts if any fitting
 * scheme groups it.
 */
function expectedRhymeLines(v: VerseStats, def: NonNullable<ReturnType<typeof verseOf>>['def']): Set<number> {
  const schemes = def.scheme ? [def.scheme] : def.schemes ?? [];
  const domains: number[][] = def.lines !== undefined
    ? [v.lines.map((_, i) => i)]
    : v.stanzas.map(s => Array.from({ length: s.count }, (_, k) => s.start + k));
  const out = new Set<number>();
  for (const indexes of domains) {
    for (const s of schemes.filter(x => x.length === indexes.length)) for (const g of groupsOf(s, indexes)) g.forEach(i => out.add(i));
  }
  return out;
}

/** Whether the end word's reading changes whether it rhymes with `other`: some of its variants share a rhyme key with it and some do not. */
function verdictDepends(a: ReturnType<typeof pronounce>, b: ReturnType<typeof pronounce>): boolean {
  if (a.word === b.word) return false;
  const hits = a.variantKeys.filter(k => b.variantKeys.includes(k)).length;
  return hits > 0 && hits < a.variantKeys.length;
}

/** The range of the line's syllable counts, as [low, high]. */
const rangeOf = (l: LineStat): [number, number] => [Math.min(l.syllables, l.syllablesAlt ?? l.syllables), Math.max(l.syllables, l.syllablesAlt ?? l.syllables)];

/**
 * Report an ambiguous word only when the choice of reading matters here: (a) the end word, when its readings rhyme
 * differently and the line is in a rhyme group the form expects or its rhyme with another line depends on the reading;
 * (b) a word that changes the syllable count, when the form declares a syllable or meter target and one reading fits
 * it and the other does not. Free verse and song lines never report count ambiguity.
 */
const ambiguous: Evaluator = ({ m }) => {
  if (!m.verse) return [];
  const ctx = verseOf(m);
  const v = m.verse;
  const found: Array<{ word: string; line: number; why: 'rhyme' | 'count' }> = [];
  const rhymed = ctx ? expectedRhymeLines(v, ctx.def) : new Set<number>();
  const ends = v.lines.map(l => (l.endWord === null ? null : pronounce(l.endWord)));
  v.lines.forEach((l, i) => {
    const end = ends[i];
    if (end && l.ambiguous.includes(end.word) && new Set(end.variantKeys).size > 1) {
      const dependsOnReading = ends.some((other, j) => j !== i && other !== null && verdictDepends(end, other));
      if (rhymed.has(i) || dependsOnReading) found.push({ word: end.word, line: l.line, why: 'rhyme' });
    }
    // Count ambiguity: only against a declared target, and only when the readings disagree about meeting it.
    if (l.syllablesAlt === undefined || !ctx) return;
    const [lo, hi] = rangeOf(l);
    const fits = (n: number): boolean | null => {
      const target = ctx.def.syllables?.[i];
      if (target !== undefined) return n === target;
      const meter = ctx.v.meter?.find(x => x.line === i);
      return meter && ctx.def.meter ? fitsMeter(n, meter.expected, ctx.def.meter.foot === 'anapest') : null;
    };
    const a = fits(lo);
    const b = fits(hi);
    if (a === null || b === null || a === b) return;
    for (const w of l.ambiguous.filter(w => pronounce(w).syllablesAlt !== undefined)) found.push({ word: w, line: l.line, why: 'count' });
  });
  const reasons = { rhyme: 'how the end word rhymes', count: 'whether the line fits the form’s syllable pattern' } as const;
  return unique(found.map(f => f.word)).map(word => {
    const mine = found.filter(f => f.word === word);
    const lines = unique(mine.map(f => f.line));
    const why = unique(mine.map(f => f.why));
    return {
      message: `${quote(word)} has more than one pronunciation (${linesWord(lines)}) that changes ${why.map(w => reasons[w]).join(' and ')}; the tool uses the first, so check the reading you mean`,
      line: lines[0]!, measured: { word, lines, matters: why },
    };
  });
};

const everyLine: Evaluator = ({ m, rule }) => {
  const v = m.verse;
  const minLines = rule.value ?? 6;
  if (!v || v.lines.length < minLines || v.lines.some(l => l.endWord === null)) return [];
  const covered = (certainOnly: boolean) => v.lines.every((_, i) => v.pairs.some(p => (p.a === i || p.b === i) && p.class === 'perfect' && !(certainOnly && p.uncertain)));
  if (!covered(false)) return [];
  return [{
    message: `Every one of the ${v.lines.length} end words rhymes with another line. In Porter and Machery’s stimuli 89% of the AI poems rhymed at every line against 40% of the human poems: a sameness signal for your own review, not an authorship verdict${covered(true) ? '' : `; ${WEAKER}`}`,
    line: v.lines[0]!.line,
    fix: 'If the rhyme is not the point, let a few lines end on a different sound.',
  }];
};

const markup: Evaluator = ({ m }) => (m.verse?.markup ?? []).map(k => ({
  message: `Line ${k.line} was read as a ${k.kind} (a verse line that starts like Markdown); start it with a word or escape the marker`,
  line: k.line, measured: k, fix: 'Start the line with a word, or escape the marker with a backslash.',
}));

const refrainConsistent: Evaluator = ({ m }) => {
  const v = m.verse;
  if (!v?.lyric) return [];
  const { sections } = v.lyric;
  return v.lyric.refrains.filter(r => !r.consistent).flatMap(r => {
    const [first, ...later] = sections.filter(s => s.base === r.base);
    return later.flatMap((s): Hit[] => {
      const differs = r.differs.filter(d => d.occurrence === s.occurrence);
      if (differs.length) {
        const d = differs[0]!;
        const want = first!.lines[s.lines.indexOf(d.line)];
        return [{
          message: `${s.label} differs from the first ${first!.label}: line ${srcLine(v, d.line)} reads ${quote(v.lines[d.line]!.text)}${want === undefined ? ' where the first has no such line' : ` where the first has ${quote(v.lines[want]!.text)}`}`,
          line: srcLine(v, d.line), measured: { base: r.base, occurrence: s.occurrence },
          fix: 'Make the repeat match the first, or keep the change on purpose.',
        }];
      }
      if (s.lines.length !== first!.lines.length) {
        return [{
          message: `${s.label} has ${plural(s.lines.length, 'line')}; the first ${first!.label} has ${first!.lines.length}`,
          line: srcLine(v, s.lines.at(-1)!), measured: { base: r.base, occurrence: s.occurrence },
          fix: 'Make the repeat match the first, or keep the change on purpose.',
        }];
      }
      return [];
    });
  });
};

const lineMatch: Evaluator = ({ m, rule }) => {
  const v = m.verse;
  if (!v?.lyric) return [];
  const limit = rule.value ?? 2;
  return v.lyric.likeSections.filter(s => s.max > limit).map(s => {
    const a = v.lyric!.sections.find(x => x.base === s.base && x.occurrence === s.a)!;
    const b = v.lyric!.sections.find(x => x.base === s.base && x.occurrence === s.b)!;
    const over = s.diffs.flatMap((d, k) => (Math.abs(d) > limit ? [k] : []));
    const k = over[0]!;
    const d = s.diffs[k]!;
    return {
      message: `${b.label} line ${srcLine(v, b.lines[k]!)} is ${plural(Math.abs(d), 'syllable')} ${d > 0 ? 'longer' : 'shorter'} than the matching line of ${a.label} (${v.lines[b.lines[k]!]!.syllables} against ${v.lines[a.lines[k]!]!.syllables}); ${plural(over.length, 'line')} differ by more than ${limit}. Like sections usually share a tune`,
      line: srcLine(v, b.lines[k]!), measured: s,
      fix: 'Trim or pad the line toward the matching line, or accept it if the melody bends.',
    };
  });
};

export const VERSE_EVALUATORS: Record<string, Evaluator> = {
  'verse.form.line-count': lineCount,
  'verse.form.rhyme-scheme': rhymeScheme,
  'verse.form.syllables': syllables,
  'verse.form.refrain': refrain,
  'verse.form.end-words': endWords,
  'verse.meter.deviation': meterDeviation,
  'verse.pronunciation.guessed': guessed,
  'verse.pronunciation.ambiguous': ambiguous,
  'verse.rhyme.every-line': everyLine,
  'verse.format.markup': markup,
  'lyric.refrain.consistent': refrainConsistent,
  'lyric.sections.line-match': lineMatch,
};
