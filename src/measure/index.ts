import type { Block, Doc, Format } from '../ir.ts';
import { getForm, type Form } from '../forms.ts';
import { AI_TELLS, FILLER, matchLexicon, type LexiconHit } from './lexicon.ts';
import { PROSE_KINDS } from '../kinds.ts';
import { resolveSettings } from '../settings.ts';
import { round2 } from '../text.ts';

const ARTIFACT_LEXICON = { ...AI_TELLS, entries: AI_TELLS.entries.filter(e => e.tier === 'artifact') };
const OTHER_LEXICON = { ...AI_TELLS, entries: AI_TELLS.entries.filter(e => e.tier !== 'artifact') };

/** AI-tell hits; artifact patterns read each Markdown block's artifact view (code removed, link targets added). */
const aiTellHits = (prose: Block[]): LexiconHit[] => [
  ...matchLexicon(OTHER_LEXICON, prose),
  ...matchLexicon(ARTIFACT_LEXICON, prose.map(b => (typeof b.meta?.artifactText === 'string' ? { ...b, text: b.meta.artifactText } : b))),
];
import { measureStyle, type StyleStats } from './style.ts';
import { measureSegments, measureSpoken, type Segment, type SpokenStats } from './spoken.ts';
import { measureScript, type ScriptStats } from './script.ts';
import { measureDialog, type DialogStats } from './dialog.ts';
import { measureSpeakers, type SpeakerStats } from './speakers.ts';
import { measureVerse, type VerseStats } from './verse.ts';
import { looksLikeSectionLabel } from '../verse/lines.ts';
import { dirname, resolve } from 'node:path';
import { findProject } from '../project.ts';
import { loadVoices, voiceFor, type Voice } from '../voice.ts';
import { ProseError } from '../errors.ts';

export interface VoiceError { code: string; message: string; file?: string; pointer?: string }

/** The project's bibles, or the error that stopped them loading: one broken bible must not block the rest of lint. */
function projectVoices(project: string | null): { bibles: Voice[]; error?: VoiceError } {
  if (!project) return { bibles: [] };
  try {
    return { bibles: loadVoices(project) };
  } catch (e) {
    if (!(e instanceof ProseError)) throw e;
    const file = typeof e.details.file === 'string' ? e.details.file : undefined;
    return { bibles: [], error: { code: e.code, message: e.message, ...(file ? { file } : {}), ...(e.pointer ? { pointer: e.pointer } : {}) } };
  }
}

/** A bracketed span such as [X%], [TBD] or [Name]: never a link (`[text](`) or inside a double-bracket note remnant. */
const PLACEHOLDER = /(?<!\[)\[([^[\]\n]{1,60})\](?![(\]])/gu;
/** Bracket contents that are citations [1], [2, 3], [4–6], footnotes [^1], or blank. */
const NOT_PLACEHOLDER = /^(?:\d+(?:[,–-]\s*\d+)*|\^.*|\s*)$/;
/** A code subscript after a word or `]` (arr[i], x[0], m[a][b]): one identifier character or digits. */
const SUBSCRIPT = /^(?:[\p{L}_]|\d+)$/u;
/** Text before a list-item checkbox in unparsed text: `- [x]`, `* [ ]`, `1. [X]`. */
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s*$/;
/** What follows `[id]` on a Markdown link definition line: `: destination` (URL- or path-like) and an optional title. */
const LINK_DEF_REST = /^:\s*(?:<[^>]*>|\S*[/#:]\S*|\S*\.[\p{L}\p{N}]\S*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/u;

function placeholdersIn(b: Block, verse: boolean): Array<{ text: string; line: number }> {
  const t = b.text;
  return [...t.matchAll(PLACEHOLDER)]
    .filter(p => {
      const content = p[1];
      if (NOT_PLACEHOLDER.test(content)) return false;
      // in a poem or lyric, [Verse 1] and [Chorus] label a section
      if (verse && looksLikeSectionLabel(content)) return false;
      const lineStart = t.lastIndexOf('\n', p.index - 1) + 1;
      const lineEnd = t.indexOf('\n', p.index) === -1 ? t.length : t.indexOf('\n', p.index);
      const before = t.slice(lineStart, p.index);
      const after = t.slice(p.index + p[0].length, lineEnd);
      // parsed list items and steps have their marker stripped, so there a checkbox opens the block's text
      const itemStart = LIST_ITEM.test(before) || ((b.kind === 'list-item' || b.kind === 'step') && p.index === 0);
      if (/^[ xX]$/.test(content) && itemStart) return false;
      if (/^\s*$/.test(before) && !/\s/.test(content) && LINK_DEF_REST.test(after)) return false;
      if (/[\p{L}\p{N}_\]]$/u.test(before) && SUBSCRIPT.test(content)) return false;
      return true;
    })
    .map(p => ({ text: p[1], line: b.line + (t.slice(0, p.index).match(/\n/g)?.length ?? 0) }));
}

export interface Measurement {
  path: string;
  format: Format;
  form: string;
  register: string | null;
  style: StyleStats;
  lexicon: { aiTells: LexiconHit[]; filler: LexiconHit[] };
  spoken: SpokenStats | null;
  script: ScriptStats | null;
  dialog: DialogStats | null;
  /** Poems and lyrics: null for a form without a `verse` definition. The pronouncing dictionary loads only when this is set. */
  verse: VerseStats | null;
  speakers: Record<string, SpeakerStats>;
  /**
   * The project found from the draft's directory upward, its voice bibles, and the bible id each speaker resolves to.
   * `error` is set (and `bibles` empty) when a bible failed to load.
   */
  voices: { project: string | null; matches: Record<string, string | null>; bibles: Voice[]; error?: VoiceError };
  segments: Segment[];
  /** Bracketed placeholders in prose blocks, e.g. [X%], still to fill. */
  placeholders: Array<{ text: string; line: number }>;
  target: { checks: Array<{ unit: 'minutes' | 'words' | 'pages'; target: number; measured: number | null; ratio: number | null }> } | null;
}

export function measure(doc: Doc): Measurement {
  const project = findProject(dirname(resolve(doc.path)));
  const settings = resolveSettings(doc, project);
  // the form with the project's and document's overrides applied
  const form: Form = {
    ...getForm(doc.form),
    ...(settings.wpm !== null ? { wpm: settings.wpm } : {}),
    ...(settings.boxChars !== null ? { boxChars: settings.boxChars } : {}),
    ...(settings.boxLines !== null ? { boxLines: settings.boxLines } : {}),
  };
  const prose = doc.blocks.filter(b => PROSE_KINDS.has(b.kind));
  const style = measureStyle(prose);
  const spoken = measureSpoken(doc, form);
  const script = doc.format === 'fountain' ? measureScript(doc.blocks, form) : null;
  const declared = settings.target;
  const speakers = measureSpeakers(prose);
  const { bibles, error } = projectVoices(project);
  const measuredFor = (unit: 'minutes' | 'words' | 'pages'): number | null =>
    unit === 'words' ? style.words : unit === 'pages' ? (script?.pages ?? null) : (spoken?.minutes ?? script?.minutes ?? null);
  const target = declared && {
    checks: (['minutes', 'words', 'pages'] as const).filter(u => declared[u] !== undefined).map(unit => {
      const measured = measuredFor(unit);
      return { unit, target: declared[unit]!, measured, ratio: measured === null ? null : round2(measured / declared[unit]!) };
    }),
  };
  return {
    path: doc.path,
    format: doc.format,
    form: form.id,
    register: doc.register ?? null,
    style,
    lexicon: { aiTells: aiTellHits(prose), filler: matchLexicon(FILLER, prose) },
    spoken,
    script,
    dialog: doc.graph ? measureDialog(doc, form) : null,
    verse: measureVerse(doc, form),
    speakers,
    voices: {
      project, matches: Object.fromEntries(Object.keys(speakers).map(sp => [sp, voiceFor(bibles, sp)?.id ?? null])),
      bibles, ...(error ? { error } : {}),
    },
    segments: doc.format === 'markdown' ? measureSegments(doc) : [],
    target,
    placeholders: prose.flatMap(b => placeholdersIn(b, form.verse !== undefined)),
  };
}
