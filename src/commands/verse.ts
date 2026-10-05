import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { loadDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import { FORMS, getForm } from '../forms.ts';
import { describeScheme, describeSyllables } from '../declared.ts';
import { lineTargets, measureVerse, syllableFit, type LineStat, type VerseStats } from '../measure/verse.ts';
import { analyseLine } from '../verse/prosody.ts';
import { pronounce } from '../verse/pronounce.ts';

const DIALECT = 'US English';
const TEXT_WIDTH = 60;

export const verseFormIds = (): string[] => FORMS.filter(f => f.verse).map(f => f.id);

interface ScanLine {
  line: number; stanza: number; section: string | null; text: string; syllables: number; syllablesAlt?: number;
  stress: string; endWord: string | null; rhyme: string; ending: string; flags: string[];
  /** Present when a declared syllable pattern covers the line: `over` has more syllables than asked, `under` fewer. */
  declared?: { want: number; fit: 'ok' | 'over' | 'under'; diff?: number };
  words?: Array<{ word: string; source: string; syllables: number; stress: string; variants: number; rhymeKey: string }>;
}

function flagsOf(l: LineStat, stats: VerseStats, index: number): string[] {
  const meter = stats.meter?.find(m => m.line === index);
  return [
    ...l.guessed.map(w => `guessed:${w}`),
    ...l.ambiguous.map(w => `ambiguous:${w}`),
    ...stats.markup.filter(m => m.line === l.line).map(m => `markup:${m.kind}`),
    ...(meter?.deviations.length ? [`meter:${meter.deviations.map(d => d + 1).join(',')}`] : []),
  ];
}

function notesOf(stats: VerseStats): string[] {
  const eye = stats.pairs.find(p => p.class === 'eye');
  return [
    'Pronunciations come from CMUdict (US English); guessed words are estimated from spelling.',
    ...(stats.trust.guessed ? [`${stats.trust.guessed} words were guessed; findings on those lines are weaker.`] : []),
    ...(eye ? [`Pairs like ${stats.lines[eye.a]!.endWord}/${stats.lines[eye.b]!.endWord} look like rhymes but differ in modern US pronunciation (eye rhyme or a historical rhyme).`] : []),
  ];
}

type Spb = NonNullable<NonNullable<VerseStats['lyric']>['syllablesPerBeat']>;

/** Legend lines: what the stress and scheme columns mean, plus how declared values show up (only when the draft declares some). */
function legendOf(stats: VerseStats, wantShown: boolean): string[] {
  const d = stats.declared;
  const parts = [
    ...(wantShown ? ['lines marked +n/-n are n syllables over/under it'] : []),
    ...(d?.scheme ? ['the rhyme letters you declared are checked by prose lint, not shown here (the Scheme line is inferred from sound and may differ)'] : []),
  ];
  return [
    'Stress: 1 stressed, 2 secondary, 0 unstressed, ? flexible (one-syllable words) or unknown (guessed words); only multi-syllable words show real stress.',
    'Scheme counts perfect and identity rhymes; near also counts family, assonance and consonance (slant rhymes).',
    ...(parts.length ? [`Declared pattern: ${parts.join('; ')}.`] : []),
  ];
}

/** The syllables-per-beat note, or nothing when the draft declares no tempo. */
function spbNote(spb: Spb | null): string[] {
  if (!spb || !spb.perLine.length) return [];
  return [`Syllables per beat: tempo ${spb.tempo}, ${spb.beatsPerLine} beats per line, mean ${spb.mean.toFixed(2)} (range ${Math.min(...spb.perLine).toFixed(2)} to ${Math.max(...spb.perLine).toFixed(2)}).`];
}

/** A line against the syllable count the author declared for it; a range that includes the count is ok. */
const fitOf = (l: LineStat, want: number): NonNullable<ScanLine['declared']> => ({ want, ...syllableFit(l, want) });
const fitText = (d: NonNullable<ScanLine['declared']>) => `${d.want} ${d.diff === undefined ? 'ok' : d.diff > 0 ? `+${d.diff}` : String(d.diff)}`;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function table(s: { lines: ScanLine[]; trust: VerseStats['trust']; scheme: string; nearScheme: string; declared: VerseStats['declared']; notes: string[]; legend: string[]; syllablesPerBeat: Spb | null }): string {
  // a `want` column (the declared count and how the line sits against it) appears only when a pattern covers some line
  const want = s.lines.some(l => l.declared);
  const spb = s.syllablesPerBeat;
  const rows = s.lines.map((l, i) => [
    String(l.line), l.syllablesAlt === undefined ? String(l.syllables) : `${l.syllables}/${l.syllablesAlt}`,
    ...(want ? [l.declared ? fitText(l.declared) : ''] : []),
    l.stress, l.rhyme, l.endWord ?? '', clip(l.text, TEXT_WIDTH), l.flags.join(' '),
    ...(spb ? [spb.perLine[i]!.toFixed(2)] : []),
  ]);
  const head = ['line', 'syl', ...(want ? ['want'] : []), 'stress', 'rh', 'end word', 'text', 'flags', ...(spb ? ['spb'] : [])];
  const width = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i]!.length)));
  const fmt = (r: string[]) => r.map((c, i) => (i === 0 || i === 1 ? c.padStart(width[i]!) : c.padEnd(width[i]!))).join('  ').trimEnd();
  const d = s.declared;
  const declared = d ? [`Declared: ${[d.syllables && `syllables ${describeSyllables(d.syllables)}`, d.scheme && `scheme ${describeScheme(d.scheme)}`].filter(Boolean).join('; ')}`] : [];
  return [
    fmt(head), ...rows.map(fmt), '',
    ...declared,
    `Scheme: ${s.scheme}  (near: ${s.nearScheme})`,
    `Words: ${s.trust.words} (dict ${s.trust.dict}, affix ${s.trust.affix}, guessed ${s.trust.guessed})`,
    ...s.notes,
    ...s.legend,
    ...spbNote(spb),
  ].join('\n');
}

export function registerVerseCommands(program: Command, io: Io): void {
  program.command('scan')
    .description('Syllables, stress, rhyme scheme and meter of a verse draft (US English pronunciations)')
    .argument('<file>', '.md or .fountain draft in a verse form')
    .option('--form <id>', 'override the form declared in the draft')
    .option('--text', 'print an aligned table instead of JSON')
    .option('--words', 'add per-word pronunciations to each line')
    .action((file: string, opts: { form?: string; text?: boolean; words?: boolean }) => {
      const doc = loadDocument(file, opts);
      const form = getForm(doc.form);
      const stats = measureVerse(doc, form);
      if (!stats) throw new ProseError('E_USAGE', `Form "${doc.form}" is not a verse form`, { hint: `Scan a poem or lyric: set the draft's form or pass --form with one of ${verseFormIds().join(', ')}` });
      const targets = lineTargets(stats);
      const lines: ScanLine[] = stats.lines.map((l, i) => ({
        line: l.line, stanza: l.stanza, section: l.section, text: l.text, syllables: l.syllables,
        ...(l.syllablesAlt !== undefined ? { syllablesAlt: l.syllablesAlt } : {}),
        stress: l.stress, endWord: l.endWord, rhyme: l.rhyme, ending: l.ending, flags: flagsOf(l, stats, i),
        ...(targets[i] != null ? { declared: fitOf(l, targets[i]!) } : {}),
        ...(opts.words ? { words: analyseLine(l.text).words.map(w => ({ word: w.word, source: w.source, syllables: w.syllables, stress: w.stress, variants: w.variants, rhymeKey: w.rhymeKey })) } : {}),
      }));
      const out = {
        path: doc.path, form: doc.form, kind: stats.kind, dialect: DIALECT, trust: stats.trust,
        scheme: stats.scheme, nearScheme: stats.nearScheme, lines, pairs: stats.pairs, meter: stats.meter, directions: stats.directions, declared: stats.declared, notes: notesOf(stats),
        syllablesPerBeat: stats.lyric?.syllablesPerBeat ?? null, legend: legendOf(stats, lines.some(l => l.declared)),
      };
      if (opts.text) console.log(table(out));
      else io.emit(out);
    });

  program.command('pronounce')
    .description('How the US English dictionary pronounces words, with the source of each answer')
    .argument('<word...>', 'one or more words')
    .action((words: string[]) => {
      if (!words.length) throw new ProseError('E_USAGE', 'Give at least one word', { hint: 'prose pronounce love dove' });
      io.emit({
        dialect: DIALECT,
        note: 'Guessed results are spelling estimates, not dictionary pronunciations.',
        words: words.map(w => {
          const p = pronounce(w);
          return { word: p.word, source: p.source, syllables: p.syllables, ...(p.syllablesAlt !== undefined ? { syllablesAlt: p.syllablesAlt } : {}), stress: p.stress, phones: p.phones, variants: p.variants, rhymeKey: p.rhymeKey };
        }),
      });
    });
}
