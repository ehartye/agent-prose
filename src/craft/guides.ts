// Craft reference guides: one Markdown guide per family of forms (craft/guides/<family>.md), the same sections in the
// same order. Two blocks in each guide are generated (the rule table and the numbered sources) so they cannot drift.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ProseError } from '../errors.ts';
import { FORMS } from '../forms.ts';
import { ALL_REFERENCES, RULES, rulesFor, type Reference, type Rule } from './rules.ts';

export const GUIDES_DIR = join(import.meta.dirname, '..', '..', 'craft', 'guides');

/** The sections every guide has, in order. `key` is what `prose guide <name> --section <key>` accepts. */
export const SECTIONS = [
  { key: 'what', title: 'What it is and who reads or hears it' },
  { key: 'anatomy', title: 'Anatomy and conventions' },
  { key: 'length', title: 'Length and timing' },
  { key: 'good', title: 'What good looks like' },
  { key: 'failures', title: 'Common failures and the habits behind them' },
  { key: 'revise', title: 'How to revise' },
  { key: 'rules', title: 'Rules that apply' },
  { key: 'sources', title: 'Sources' },
] as const;
export type SectionKey = (typeof SECTIONS)[number]['key'];

const FamiliesFile = z.strictObject({
  schema: z.literal('prose/guide-families@1'),
  families: z.array(z.strictObject({
    id: z.string().regex(/^[a-z][a-z-]*$/),
    title: z.string().min(1),
    description: z.string().min(1),
    forms: z.array(z.string()).min(1),
  })).min(1),
});
export type Family = z.infer<typeof FamiliesFile>['families'][number];

export const FAMILIES: Family[] = FamiliesFile.parse(JSON.parse(readFileSync(join(GUIDES_DIR, 'families.json'), 'utf8'))).families;

const FrontMatter = z.strictObject({
  family: z.string(),
  title: z.string().min(1),
  forms: z.array(z.string()).min(1),
  reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Reference ids in citation order: the guide's text cites them as [1], [2, 3]. */
  sources: z.array(z.string()).min(1),
});
export type GuideMeta = z.infer<typeof FrontMatter>;

export interface GuideSection { key: SectionKey; title: string; text: string }
export interface Guide extends GuideMeta { sections: GuideSection[] }

const nl = (s: string) => s.replaceAll('\r\n', '\n');
const cell = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ');

export const RULES_FENCE = ['<!-- generated:rules begin (npm run guides) -->', '<!-- generated:rules end -->'] as const;
export const SOURCES_FENCE = ['<!-- generated:sources begin (npm run guides) -->', '<!-- generated:sources end -->'] as const;

/** Rules that apply to any form of the family, in rules.json order. */
export function rulesForFamily(forms: string[]): Rule[] {
  const applying = new Set(forms.flatMap(f => rulesFor(f)));
  return RULES.filter(r => applying.has(r));
}

export function renderRuleTable(forms: string[]): string {
  const rows = rulesForFamily(forms).map(r => {
    const threshold = r.value !== null ? `${r.value}${r.unit ? ` ${r.unit}` : ''}` : r.unit === 'form box' ? "the form's text box" : 'none';
    const basis = threshold === 'none' ? 'n/a' : r.derived ? "This plugin's choice (derived)" : "A source's figure";
    return `| \`${r.id}\` | ${cell(r.statement)} | ${r.severity} | ${cell(threshold)} | ${basis} | ${r.check === 'auto' ? 'lint' : 'judgement'} |`;
  });
  return [
    '| Rule | What it checks | Severity | Threshold | Threshold basis | Run by |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

export function renderSources(ids: string[], refs: Reference[] = ALL_REFERENCES): string {
  return ids.map((id, i) => {
    const r = refs.find(x => x.id === id);
    if (!r) throw new Error(`Unknown source "${id}"`);
    return `${i + 1}. ${r.authors}${r.year ? `, ${r.year}` : ''}. [${r.title}](${r.url}) (${r.kind}; id \`${r.id}\`).${r.note ? ` ${r.note}` : ''}`;
  }).join('\n');
}

function fill(text: string, fence: readonly [string, string], body: string): string {
  const a = text.indexOf(fence[0]);
  const b = text.indexOf(fence[1]);
  if (a < 0 || b < a) throw new Error(`Missing generated fence ${fence[0]}`);
  return `${text.slice(0, a + fence[0].length)}\n${body}\n${text.slice(b)}`;
}

/** The guide's text with both generated blocks rewritten from the rules and the references. */
export function regenerate(text: string): string {
  text = nl(text);
  const meta = parseGuide(text, 'guide').meta;
  return fill(fill(text, RULES_FENCE, renderRuleTable(meta.forms)), SOURCES_FENCE, renderSources(meta.sources));
}

/** Split a guide into front matter and H2 sections. Headings inside code fences do not count. */
export function parseGuide(text: string, name: string): { meta: GuideMeta; sections: Array<{ title: string; text: string }> } {
  text = nl(text);
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error(`${name}: missing front matter`);
  const meta = FrontMatter.parse(parseYaml(m[1]!));
  const sections: Array<{ title: string; text: string }> = [];
  let fenced = false;
  let current: { title: string; lines: string[] } | undefined;
  for (const line of text.slice(m[0].length).split('\n')) {
    if (/^```/.test(line)) fenced = !fenced;
    const h = !fenced && /^## (.+?)\s*$/.exec(line);
    if (h) { if (current) sections.push({ title: current.title, text: current.lines.join('\n').trim() }); current = { title: h[1]!, lines: [] }; }
    else current?.lines.push(line);
  }
  if (current) sections.push({ title: current.title, text: current.lines.join('\n').trim() });
  return { meta, sections };
}

export const guideWritten = (family: string) => existsSync(join(GUIDES_DIR, `${family}.md`));
/** Every guide file, as family ids. */
export const writtenGuides = (dir = GUIDES_DIR): string[] => readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();

export function loadGuide(family: string): Guide {
  if (!guideWritten(family)) throw new ProseError('E_NOT_FOUND', `The ${family} guide is not written yet`, { hint: `Written guides: ${writtenGuides().join(', ') || 'none'}` });
  const { meta, sections } = parseGuide(readFileSync(join(GUIDES_DIR, `${family}.md`), 'utf8'), `${family}.md`);
  const keyed = sections.map((s, i) => ({ key: SECTIONS[i]?.key as SectionKey, title: s.title, text: s.text }));
  return { ...meta, sections: keyed };
}

/** A family id or a form id, resolved to its family. */
export function resolveFamily(name: string): Family {
  const hit = FAMILIES.find(f => f.id === name) ?? FAMILIES.find(f => f.forms.includes(name));
  if (hit) return hit;
  throw new ProseError('E_USAGE', `No craft guide or form named "${name}"`, {
    hint: `Families: ${FAMILIES.map(f => f.id).join(', ')}. Forms: ${FORMS.map(f => f.id).join(', ')}`,
  });
}

/** A section by key, by the start of its title, or by a unique word in it. */
export function pickSection(guide: Guide, name: string): GuideSection {
  const q = name.trim().toLowerCase();
  const found = guide.sections.find(s => s.key === q)
    ?? guide.sections.find(s => s.title.toLowerCase().startsWith(q))
    ?? (() => { const hits = guide.sections.filter(s => s.title.toLowerCase().includes(q)); return hits.length === 1 ? hits[0] : undefined; })();
  if (found && q) return found;
  throw new ProseError('E_USAGE', `No section "${name}" in the ${guide.family} guide`, { hint: `Sections: ${SECTIONS.map(s => s.key).join(', ')}` });
}

export function renderGuideText(guide: Guide, only?: GuideSection): string {
  const strip = (t: string) => t.replace(/^<!-- generated:.*-->\n?/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  const sections = only ? [only] : guide.sections;
  return [only ? `# ${guide.title}: ${only.title}` : `# ${guide.title}`, '',
    ...sections.flatMap(s => [...(only ? [] : [`## ${s.title}`, '']), strip(s.text), ''])].join('\n').trimEnd() + '\n';
}
