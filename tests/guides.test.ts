import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ALL_REFERENCES, GUIDE_REFERENCES, REFERENCES, RULES, rulesFor } from '../src/craft/rules.ts';
import { FAMILIES, GUIDES_DIR, SECTIONS, loadGuide, parseGuide, regenerate, renderRuleTable, resolveFamily, writtenGuides } from '../src/craft/guides.ts';
import { FORMS } from '../src/forms.ts';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { describeSource } from '../scripts/managed-runtime.js';

const root = join(import.meta.dirname, '..');
const made: string[] = [];
const tmp = (prefix: string) => { const d = mkdtempSync(join(tmpdir(), prefix)); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const text = (family: string) => readFileSync(join(GUIDES_DIR, `${family}.md`), 'utf8').replaceAll('\r\n', '\n');

describe('guide families', () => {
  it('cover every form exactly once, and name only real forms', () => {
    const formIds = FORMS.map(f => f.id);
    const listed = FAMILIES.flatMap(f => f.forms);
    for (const id of formIds) expect(listed.filter(x => x === id), `form ${id}`).toHaveLength(1);
    for (const id of listed) expect(formIds, `unknown form ${id}`).toContain(id);
    expect(new Set(FAMILIES.map(f => f.id)).size).toBe(FAMILIES.length);
  });

  it('resolves a family id or a form id to its family, and rejects anything else with the valid names', () => {
    expect(resolveFamily('game-dialogue').id).toBe('game-dialogue');
    expect(resolveFamily('barks').id).toBe('game-dialogue');
    expect(resolveFamily('sestina').id).toBe('verse');
    expect(() => resolveFamily('nonsense')).toThrow(/No craft guide or form named "nonsense"/);
    try { resolveFamily('nonsense'); } catch (e: any) { expect(e.hint).toMatch(/game-dialogue.*quest-dialog/s); }
  });
});

describe.each(writtenGuides())('the %s guide', family => {
  const body = text(family);
  const meta = FAMILIES.find(f => f.id === family);

  it('belongs to a declared family and names exactly its forms', () => {
    expect(meta, `${family} is not in families.json`).toBeDefined();
    const guide = loadGuide(family);
    expect(guide.family).toBe(family);
    expect(guide.forms).toEqual(meta!.forms);
  });

  it('has the required sections in the required order', () => {
    const { sections } = parseGuide(body, family);
    expect(sections.map(s => s.title)).toEqual(SECTIONS.map(s => s.title));
    for (const s of sections) expect(s.text.length, s.title).toBeGreaterThan(40);
  });

  it('keeps the generated rule table and sources current', () => {
    expect(regenerate(body)).toBe(body);
    expect(body).toContain(renderRuleTable(meta!.forms));
  });

  it('cites only known sources, each at least once, by number', () => {
    const { meta: m, sections } = parseGuide(body, family);
    for (const id of m.sources) expect(ALL_REFERENCES.map(r => r.id), `unknown source ${id}`).toContain(id);
    expect(new Set(m.sources).size).toBe(m.sources.length);
    const prose = sections.filter(s => s.title !== 'Sources' && s.title !== 'Rules that apply').map(s => s.text).join('\n').replace(/```[\s\S]*?```/g, '');
    const cited = new Set<number>();
    for (const g of prose.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) for (const n of g[1]!.split(',')) cited.add(Number(n));
    for (const n of cited) expect(n, `[${n}] is outside 1..${m.sources.length}`).toBeLessThanOrEqual(m.sources.length);
    for (let n = 1; n <= m.sources.length; n++) expect(cited, `source [${n}] ${m.sources[n - 1]} is never cited`).toContain(n);
  });

  it('labels conventions and unsourced advice', () => {
    expect(body).toMatch(/Convention:/);
    expect(body).toMatch(/Maintainer judgement:/);
  });

  it('keeps the plugin free of private-notes references, wikilinks and machine paths', () => {
    expect(body.replace(/https?:\/\/\S+/g, '')).not.toMatch(/\bwiki\b/i);
    expect(body).not.toMatch(/wiki-master|\.wiki-master-vault/);
    expect(body).not.toMatch(/\[\[[A-Za-z][^\][,]*\]\]/);
    expect(body).not.toMatch(/[A-Za-z]:\\Users\\|\/c\/Users\/|AppData/);
    expect(body).not.toMatch(/[$][0-9]|[$]ARG/);
  });

  it('has a refs fragment only when it needs one, and that fragment is cited', () => {
    const frag = GUIDE_REFERENCES.find(g => g.family === family);
    if (!frag) return;
    const cited = new Set(parseGuide(body, family).meta.sources);
    for (const r of frag.references) expect(cited, `${r.id} is in ${family}.refs.json but never cited`).toContain(r.id);
  });
});

describe('reference fragments', () => {
  it('belong to a family, and no id is defined twice anywhere', () => {
    for (const g of GUIDE_REFERENCES) expect(FAMILIES.map(f => f.id), `${g.family}.refs.json`).toContain(g.family);
    const ids = ALL_REFERENCES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(REFERENCES.length).toBeLessThan(ALL_REFERENCES.length);
  });

  it('is the only thing in craft/guides besides guides and the family list', () => {
    for (const f of readdirSync(GUIDES_DIR)) expect(f, f).toMatch(/^(families\.json|[a-z-]+\.md|[a-z-]+\.refs\.json)$/);
  });
});

describe('the generator', () => {
  const script = join(root, 'scripts', 'build-guides.mjs');
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  it('passes --check on the shipped guides', () => {
    const r = run('--check');
    expect(r.status, r.stderr).toBe(0);
  });

  it('fails --check when a table is stale, and rewrites it without --check', () => {
    const dir = tmp('prose-guides-');
    const file = join(dir, 'game-dialogue.md');
    cpSync(join(GUIDES_DIR, 'game-dialogue.md'), file);
    writeFileSync(file, readFileSync(file, 'utf8').replace('dialog.graph.dead-end', 'dialog.graph.dead-endx'));
    const stale = run('--check', '--dir', dir);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toMatch(/Stale guides: game-dialogue/);
    expect(run('--dir', dir).status).toBe(0);
    expect(run('--check', '--dir', dir).status).toBe(0);
    expect(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).toBe(text('game-dialogue'));
  });

  it('lists a rule once for a family, in rules.json order, with its threshold basis', () => {
    const table = renderRuleTable(['quest-dialog', 'barks', 'conversation']);
    const ids = [...table.matchAll(/^\| `([^`]+)`/gm)].map(m => m[1]);
    expect(ids).toEqual(RULES.filter(r => ['quest-dialog', 'barks', 'conversation'].some(f => rulesFor(f).includes(r))).map(r => r.id));
    expect(table).toMatch(/\| `dialog\.barks\.variety` \|[^\n]*\| 0\.6 jaccard \| This plugin's choice \(derived\) \|/);
    expect(table).toMatch(/\| `dialog\.line\.box` \|[^\n]*\| the form's text box \| A source's figure \|/);
    expect(table).not.toMatch(/procedure\.filler/);
  });
});

describe('the game dialogue guide', () => {
  const body = text('game-dialogue');

  it('runs about 400 to 600 lines including the generated table', () => {
    const n = body.split('\n').length;
    expect(n).toBeGreaterThanOrEqual(400);
    expect(n).toBeLessThanOrEqual(630);
  });

  it('lints clean on every dialogue example it shows', () => {
    const blocks = [...body.matchAll(/```yaml\n([\s\S]*?)\n```/g)].map(m => m[1]!);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    const dir = tmp('prose-guide-examples-');
    blocks.forEach((src, i) => {
      const file = join(dir, `example-${i}.dialog.yaml`);
      writeFileSync(file, `${src}\n`);
      const report = lint(loadDocument(file));
      expect(report.errors.map(f => f.rule), `example ${i}`).toEqual([]);
      expect(report.warnings.map(f => `${f.rule}: ${f.message}`), `example ${i}`).toEqual([]);
    });
  });

  it('covers the subjects the owner asked for', () => {
    for (const needle of ['critical path', 'once-only', 'variants', 'menu-speak', 'Menu-speak', 'one piece of information', 'cooldown', '40 characters', 'catchphrase', 'contractions']) {
      expect(body, needle).toContain(needle);
    }
  });
});

describe('packaging', () => {
  it('ships the guides, the family list and the reference fragments in the managed runtime', () => {
    const files = describeSource(root).files as string[];
    for (const f of ['craft/guides/families.json', 'craft/guides/game-dialogue.md', 'craft/guides/game-dialogue.refs.json']) expect(files, f).toContain(f);
    expect(existsSync(join(root, 'craft', 'guides'))).toBe(true);
  });
});
