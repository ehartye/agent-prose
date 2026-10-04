import type { GuideReferences, Reference, Rule } from './rules.ts';

/** Escape characters that would break a Markdown table cell. */
const cell = (s: string) => s.replaceAll('|', '\\|');

export function renderReferences(refs: Reference[], rules: Rule[], lexicons: Array<{ id: string; sources: string[] }>, audit: Array<{ id: string; sources: string[] }> = [], guides: GuideReferences[] = []): string {
  const citedBy = (id: string) => [
    ...rules.filter(r => r.sources.includes(id)).map(r => r.id),
    ...lexicons.filter(l => l.sources.includes(id)).map(l => `lexicon:${l.id}`),
    ...audit.filter(a => a.sources.includes(id)).map(a => `audit:${a.id}`),
  ].sort();
  const rows = [...refs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(r => `| ${r.id} | ${cell(r.authors)}${r.year ? `, ${r.year}` : ''}. [${cell(r.title)}](${r.url}) | ${r.kind} | ${citedBy(r.id).join(', ')} |`);
  const guideSections = [...guides].filter(g => g.references.length).sort((a, b) => a.family.localeCompare(b.family)).flatMap(g => [
    `### ${g.family}`, '',
    '| id | Source | Kind | Cited by |',
    '|---|---|---|---|',
    ...[...g.references].sort((a, b) => a.id.localeCompare(b.id))
      .map(r => `| ${r.id} | ${cell(r.authors)}${r.year ? `, ${r.year}` : ''}. [${cell(r.title)}](${r.url}) | ${r.kind} | guide:${g.family} |`),
    '',
  ]);
  return [
    '# References', '',
    'Generated from `craft/references.json` and `craft/guides/*.refs.json` by `npm run refs`. Do not edit by hand.', '',
    '| id | Source | Kind | Cited by |',
    '|---|---|---|---|',
    ...rows, '',
    ...(guideSections.length ? ['## Craft guide sources', '', 'Sources only a craft guide (`prose guide`) cites, from its `craft/guides/<family>.refs.json`.', '', ...guideSections] : []),
  ].join('\n');
}
