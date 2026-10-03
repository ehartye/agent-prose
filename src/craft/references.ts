import type { Reference, Rule } from './rules.ts';

/** Escape characters that would break a Markdown table cell. */
const cell = (s: string) => s.replaceAll('|', '\\|');

export function renderReferences(refs: Reference[], rules: Rule[], lexicons: Array<{ id: string; sources: string[] }>): string {
  const citedBy = (id: string) => [
    ...rules.filter(r => r.sources.includes(id)).map(r => r.id),
    ...lexicons.filter(l => l.sources.includes(id)).map(l => `lexicon:${l.id}`),
  ].sort();
  const rows = [...refs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(r => `| ${r.id} | ${cell(r.authors)}${r.year ? `, ${r.year}` : ''}. [${cell(r.title)}](${r.url}) | ${r.kind} | ${citedBy(r.id).join(', ')} |`);
  return [
    '# References', '',
    'Generated from `craft/references.json` by `npm run refs`. Do not edit by hand.', '',
    '| id | Source | Kind | Cited by |',
    '|---|---|---|---|',
    ...rows, '',
  ].join('\n');
}
