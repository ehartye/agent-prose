import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GUIDES_DIR } from '../src/craft/guides.ts';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { describeSource } from '../scripts/managed-runtime.js';

const root = join(import.meta.dirname, '..');
const body = readFileSync(join(GUIDES_DIR, 'formal-prose.md'), 'utf8').replaceAll('\r\n', '\n');
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const lintSource = (name: string, src: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'prose-guide-md-'));
  made.push(dir);
  const file = join(dir, name);
  writeFileSync(file, `${src}\n`);
  return lint(loadDocument(file));
};

describe('the academic and professional prose guide', () => {
  it('runs about 450 to 620 lines including the generated parts', () => {
    const n = body.split('\n').length;
    expect(n).toBeGreaterThanOrEqual(450);
    expect(n).toBeLessThanOrEqual(620);
  });

  it('lints clean on every Markdown example it shows, in both forms', () => {
    const blocks = [...body.matchAll(/^(`{3,})markdown\n([\s\S]*?)\n\1$/gm)].map(m => m[2]!);
    expect(blocks.length).toBeGreaterThanOrEqual(7);
    const forms = new Set(blocks.map(b => /^---\nform: ([a-z-]+)\n/.exec(b)?.[1]));
    expect([...forms].sort()).toEqual(['academic', 'professional']);
    blocks.forEach((src, i) => {
      const report = lintSource(`example-${i}.md`, src);
      expect(report.errors.map(f => f.rule), `example ${i}`).toEqual([]);
      expect(report.warnings.map(f => `${f.rule}: ${f.message}`), `example ${i}`).toEqual([]);
    });
  });

  it('reports the warning count it claims for each badly written example', () => {
    const bad = [...body.matchAll(/<!-- bad example, on purpose: the guide's tests lint it as (academic|professional) and expect (\d+) warnings? -->\n\n```text\n([\s\S]*?)\n```\n\nMeasured here: `prose lint` reports ([^\n]*)/g)];
    expect(bad.length).toBe(7);
    const forms = new Set(bad.map(m => m[1]));
    expect([...forms].sort()).toEqual(['academic', 'professional']);
    bad.forEach((m, i) => {
      const [, form, count, text, claim] = m;
      const report = lintSource(`bad-${i}.md`, `---\nform: ${form}\n---\n\n${text}`);
      expect(report.errors, `bad example ${i}`).toEqual([]);
      expect(report.warnings, `bad example ${i}`).toHaveLength(Number(count));
      expect(claim, `bad example ${i}`).toMatch(count === '0' ? /^no warnings/ : new RegExp(`^${count} warnings?`));
    });
  });

  it('measures the numbers it quotes from prose measure', async () => {
    const { measure } = await import('../src/measure/index.ts');
    const hedged = body.match(/```text\nThese results prove[\s\S]*?\n```/)![0].replace(/```(text)?\n?/g, '').trim();
    const dir = mkdtempSync(join(tmpdir(), 'prose-guide-measure-'));
    made.push(dir);
    const file = join(dir, 'hedge.md');
    writeFileSync(file, `---\nform: academic\n---\n\n${hedged}\n`);
    const m = measure(loadDocument(file));
    expect(m.style.hedges.count).toBe(3);
    expect(body).toContain('counts 3 hedges in the second sentence');
  });

  it('covers the subjects the owner asked for', () => {
    for (const needle of ['IMRaD', 'Gopen and Swan', 'stress position', 'topic position', 'bottom line', 'Hedging', 'passive', 'literature review', 'Verify every reference', 'Specific Aims', 'non-native', 'executive summary', 'status update', 'subject line', 'plain language', 'prose measure', 'prose audit', 'prose-formal', 'formal.bluf', 'formal.supported-claims', 'Maintainer judgement:', 'Convention:', 'Measured here:']) {
      expect(body.toLowerCase(), needle).toContain(needle.toLowerCase());
    }
  });

  it('keeps each claim inside what its source supports', () => {
    const flat = body.replace(/\s+/g, ' ');
    expect(flat).toContain('are reported to help');
    expect(flat).toMatch(/non-systematic and an opinion piece/);
    expect(flat).toMatch(/no data on how readers judge hedges/);
    expect(flat).toMatch(/judged themselves/);
    expect(flat).toMatch(/comprehension was not tested/);
    expect(flat).toMatch(/no longer updated/);
    expect(flat).toMatch(/not a detector/);
    expect(flat).toMatch(/never a judgement of who wrote the text/);
    // no funder page limit is stated as fact, and no sentence implies who wrote a text
    expect(flat).not.toMatch(/\b12 pages\b|\bR01\b[^.]*\bpages\b/);
    expect(flat).not.toMatch(/\bwritten by (an? )?(AI|model|chatbot)\b|\bsounds like AI\b|\blikely AI\b/i);
  });

  it('does not quote a rate for fabricated references', () => {
    const section = /\*\*Verify every reference\.\*\*[\s\S]*?(?=\n###)/.exec(body)![0];
    expect(section).not.toMatch(/\d+\s*(%|percent)/);
  });

  it('is packaged with its reference fragment and pointed to by the skill', () => {
    const files = describeSource(root).files as string[];
    for (const f of ['craft/guides/formal-prose.md', 'craft/guides/formal-prose.refs.json']) expect(files, f).toContain(f);
    expect(existsSync(join(GUIDES_DIR, 'formal-prose.refs.json'))).toBe(true);
    const skill = readFileSync(join(root, 'skills', 'prose-formal', 'SKILL.md'), 'utf8').replace(/\s+/g, ' ');
    expect(skill).toContain('Craft guide: `prose guide formal-prose --text --section <name>`');
    expect(skill).toContain('Read the section you need, not all of it');
  });
});
