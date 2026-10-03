import type { Doc } from '../ir.ts';
import { getForm } from '../forms.ts';
import { AI_TELLS } from '../measure/lexicon.ts';
import { parseMarkdown } from '../parse/markdown.ts';
import { detect, FAMILIES, measureUnits, unitsOf, type Evidence, type Finding, type Measured } from './detectors.ts';

export interface AuditReport {
  path: string;
  form: string;
  words: number;
  tiers: { hard: Finding[]; soft: Finding[] };
  /** Evidence tier and sources for each family that has a finding, in report order. */
  families: Record<string, { evidence: Evidence; sources: string[] }>;
  measured: Measured;
  summary: string;
  limits: string;
  lexicon: { reviewed: string };
  /** Set when the form is not audited. */
  skipped?: string;
}

/** The standing text, printed with every report. */
export const LIMITS = [
  'Style alone cannot show authorship: this audit reports hallmarks some readers associate with AI-generated text and does not say who wrote a text.',
  'A clean result proves nothing, because removing these hallmarks is easy.',
  'Plain wording and non-native writing trigger some detectors in published research; this audit does not flag them.',
  'Word lists date and are conventions, which is why the lexicon review date is printed.',
].join(' ');

/** Added to the measured notes when Markdown formatting checks could not read the raw text. */
export const NO_RAW_NOTE = 'Formatting checks were skipped for lack of raw text.';

const SKIPPED = 'Verse forms are skipped: the prose style habits this audit looks for do not apply to poems and lyrics.';

/** A passage shorter than this gets a sentence saying there is little to find. */
const SHORT_WORDS = 100;

const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function summaryOf(soft: Finding[], hard: Finding[], words: number): string {
  const families = [...new Set(soft.map(f => f.family))];
  const parts = [soft.length
    ? `${soft.length} phrasing or structure ${soft.length === 1 ? 'hallmark' : 'hallmarks'} some readers associate with AI-generated text, in ${noun(families.length, 'family', 'families')} (${families.join(', ')}). Human writers use these patterns too; this shows nothing about who wrote the passage.`
    : 'No such hallmarks found. This shows nothing about who wrote the passage.'];
  if (hard.length) parts.push(`${noun(hard.length, 'hard artifact', 'hard artifacts')} found; these are defects in finished text whoever wrote it.`);
  if (words < SHORT_WORDS) parts.push(`The passage is under ${SHORT_WORDS} words, so there is little to find.`);
  return parts.join(' ');
}

/** Each family with a finding, with its evidence tier and sources. */
function familiesOf(findings: Finding[]): AuditReport['families'] {
  const out: AuditReport['families'] = {};
  for (const f of findings) {
    const def = FAMILIES.find(d => d.id === f.family);
    if (def && !out[f.family]) out[f.family] = { evidence: def.evidence, sources: def.sources };
  }
  return out;
}

/** The evidence tier in plain words, for the text report. */
export const EVIDENCE_WORDS: Record<Evidence, string> = {
  'corpus': 'corpus studies (published word-list studies; abstract-only in our notes)',
  'field-guide': "field guide (Wikipedia's descriptive, informational writing)",
  'reader-reported': 'reader-reported (habits readers and our own baseline audits named; there is no published source)',
};

/**
 * Audit a parsed draft. `source` is the draft's text; Markdown needs it, because inline emphasis and links are
 * stripped from block text and the formatting detectors read the raw lines.
 */
export function buildReport(doc: Doc, source?: string): AuditReport {
  const reviewed = AI_TELLS.reviewed ?? 'unknown';
  const base = { path: doc.path, form: doc.form };
  if (getForm(doc.form).verse !== undefined) {
    return {
      ...base, words: 0, tiers: { hard: [], soft: [] }, families: {},
      measured: { emDashesPer1000: null, sentenceLengthVariation: null, tripletListsPer1000: null, isAreShare: null, notes: [] },
      summary: 'Skipped: verse forms are not audited.', limits: LIMITS, lexicon: { reviewed }, skipped: SKIPPED,
    };
  }
  const raws: string[] = [];
  if (doc.format === 'markdown' && source !== undefined) parseMarkdown(source.replace(/^﻿/, '').replace(/\r\n?/g, '\n'), raws);
  const units = unitsOf(doc, raws.length ? raws : undefined);
  const findings = detect(units, { markdown: doc.format === 'markdown', limited: doc.format !== 'markdown' });
  const { words, measured: counted } = measureUnits(units);
  // Without raw text the formatting detectors cannot run; say so instead of staying silent.
  const measured = doc.format === 'markdown' && raws.length !== doc.blocks.length
    ? { ...counted, notes: [...counted.notes, NO_RAW_NOTE] }
    : counted;
  const hard = findings.filter(f => f.tier === 'hard');
  const soft = findings.filter(f => f.tier === 'soft');
  return { ...base, words, tiers: { hard, soft }, families: familiesOf(findings), measured, summary: summaryOf(soft, hard, words), limits: LIMITS, lexicon: { reviewed } };
}

function group(findings: Finding[], families: AuditReport['families']): string[] {
  const byFamily = new Map<string, Finding[]>();
  for (const f of findings) byFamily.set(f.family, [...(byFamily.get(f.family) ?? []), f]);
  return [...byFamily].flatMap(([family, list]) => [
    `  ${family} (${list.length})`,
    `    Evidence: ${EVIDENCE_WORDS[families[family].evidence]}`,
    ...list.flatMap(f => [
      `    line ${f.line}: "${f.text}"${f.eras ? ` [${f.eras.join(', ')}]` : ''}`,
      `      Why: ${f.why}`,
      `      Direction: ${f.direction}`,
    ]),
  ]);
}

const show = (v: number | null) => (v === null ? 'n/a' : String(v));

/** The report as a readable list grouped by family, with the limits at the end. */
export function renderText(r: AuditReport): string {
  return [
    `Style audit of ${r.path} (${r.form}, ${r.words} words)`,
    ...(r.skipped ? ['', r.skipped] : []),
    ...(r.tiers.hard.length ? ['', 'Hard artifacts (defects in finished text, whoever wrote it)', ...group(r.tiers.hard, r.families)] : []),
    ...(r.tiers.soft.length ? ['', 'Hallmarks some readers associate with AI-generated text', ...group(r.tiers.soft, r.families)] : []),
    ...(r.skipped ? [] : [
      '',
      'Measured, not flagged',
      `  em dashes per 1,000 words: ${show(r.measured.emDashesPer1000)}`,
      `  sentence-length variation (sd/mean): ${show(r.measured.sentenceLengthVariation)}`,
      `  triplet lists per 1,000 words: ${show(r.measured.tripletListsPer1000)}`,
      `  is/are share of copular verbs: ${show(r.measured.isAreShare)}`,
      ...r.measured.notes.map(n => `  ${n}`),
    ]),
    '',
    'Summary',
    `  ${r.summary}`,
    '',
    'Limits',
    `  ${r.limits}`,
    '',
    `Lexicon reviewed ${r.lexicon.reviewed}`,
  ].join('\n');
}
