import type { Doc } from '../ir.ts';
import { getForm } from '../forms.ts';
import { AI_TELLS } from '../measure/lexicon.ts';
import { parseMarkdown } from '../parse/markdown.ts';
import { clusterOf, type Cluster } from './cluster.ts';
import { detect, measureUnits, unitsOf, type Finding, type Measured } from './detectors.ts';

export interface AuditReport {
  path: string;
  form: string;
  words: number;
  tiers: { hard: Finding[]; soft: Finding[] };
  measured: Measured;
  cluster: Cluster;
  summary: string;
  limits: string;
  lexicon: { reviewed: string };
  /** Set when the form is not audited. */
  skipped?: string;
}

/** The standing text, printed with every report. */
export const LIMITS = [
  'Style alone cannot show authorship: this audit does not say who wrote a text.',
  'A clean result proves nothing, because removing these habits is easy.',
  'Plain wording and non-native writing trigger some detectors in published research; this audit does not flag them.',
  'Thresholds and word lists are conventions that date, which is why the lexicon review date is printed.',
].join(' ');

/** Added to the measured notes when Markdown formatting checks could not read the raw text. */
export const NO_RAW_NOTE = 'Formatting checks were skipped for lack of raw text.';

const SKIPPED = 'Verse forms are skipped: the prose style habits this audit looks for do not apply to poems and lyrics.';

const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function summaryOf(soft: Finding[], hard: Finding[], cluster: Cluster, words: number): string {
  const short = words < cluster.threshold.minWords;
  const notApplied = short && cluster.families.length >= cluster.threshold.minFamilies;
  const parts = [cluster.met
    ? `Reads like default model prose in ${soft.length} places (families: ${cluster.families.join(', ')}). These are style findings, not evidence of who wrote it.`
    : `${notApplied ? `Cluster rule not applied (under ${cluster.threshold.minWords} words).` : 'No cluster of default-model habits found.'} This does not show a person wrote it.`];
  if (hard.length) parts.push(`${noun(hard.length, 'hard artifact', 'hard artifacts')} found; these are defects in finished text whoever wrote it.`);
  if (short && !notApplied) parts.push(`The text is under ${cluster.threshold.minWords} words, too short for the cluster rule.`);
  return parts.join(' ');
}

/**
 * Audit a parsed draft. `source` is the draft's text; Markdown needs it, because inline emphasis and links are
 * stripped from block text and the formatting detectors read the raw lines.
 */
export function buildReport(doc: Doc, source?: string): AuditReport {
  const reviewed = AI_TELLS.reviewed ?? 'unknown';
  const base = { path: doc.path, form: doc.form };
  if (getForm(doc.form).verse !== undefined) {
    return {
      ...base, words: 0, tiers: { hard: [], soft: [] },
      measured: { emDashesPer1000: null, sentenceLengthVariation: null, tripletListsPer1000: null, isAreShare: null, notes: [] },
      cluster: clusterOf([], 0), summary: 'Skipped: verse forms are not audited.', limits: LIMITS, lexicon: { reviewed }, skipped: SKIPPED,
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
  const cluster = clusterOf(findings, words);
  return { ...base, words, tiers: { hard, soft }, measured, cluster, summary: summaryOf(soft, hard, cluster, words), limits: LIMITS, lexicon: { reviewed } };
}

function group(findings: Finding[]): string[] {
  const byFamily = new Map<string, Finding[]>();
  for (const f of findings) byFamily.set(f.family, [...(byFamily.get(f.family) ?? []), f]);
  return [...byFamily].flatMap(([family, list]) => [
    `  ${family} (${list.length})`,
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
  const t = r.cluster.threshold;
  return [
    `Style audit of ${r.path} (${r.form}, ${r.words} words)`,
    ...(r.skipped ? ['', r.skipped] : []),
    ...(r.tiers.hard.length ? ['', 'Hard artifacts (defects in finished text, whoever wrote it)', ...group(r.tiers.hard)] : []),
    ...(r.tiers.soft.length ? ['', 'Soft findings by family', ...group(r.tiers.soft)] : []),
    ...(r.skipped ? [] : [
      '',
      `Cluster: ${r.cluster.met ? 'met' : 'not met'}; ${r.tiers.soft.length} soft findings (${r.cluster.softPerThousand} per 1,000 words) in ${noun(r.cluster.families.length, 'family', 'families')}${r.cluster.families.length ? ` (${r.cluster.families.join(', ')})` : ''}. The rule needs at least ${t.minFamilies} families, ${t.minPerThousand} per 1,000 words and ${t.minWords} words.`,
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
