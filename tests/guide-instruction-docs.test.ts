import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GUIDES_DIR } from '../src/craft/guides.ts';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { describeSource } from '../scripts/managed-runtime.js';

const root = join(import.meta.dirname, '..');
const body = readFileSync(join(GUIDES_DIR, 'instruction-docs.md'), 'utf8').replaceAll('\r\n', '\n');
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const lintSource = (name: string, src: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'prose-guide-md-'));
  made.push(dir);
  const file = join(dir, name);
  writeFileSync(file, `${src}\n`);
  return lint(loadDocument(file));
};

describe('the instructions and technical docs guide', () => {
  it('runs about 450 to 630 lines including the generated table', () => {
    const n = body.split('\n').length;
    expect(n).toBeGreaterThanOrEqual(450);
    expect(n).toBeLessThanOrEqual(630);
  });

  it('lints clean on every Markdown example it shows, in both forms', () => {
    const blocks = [...body.matchAll(/^(`{3,})markdown\n([\s\S]*?)\n\1$/gm)].map(m => m[2]!);
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    const forms = new Set(blocks.map(b => /^---\nform: ([a-z-]+)\n---\n/.exec(b)?.[1]));
    expect([...forms].sort()).toEqual(['instructions', 'tech-doc']);
    blocks.forEach((src, i) => {
      const report = lintSource(`example-${i}.md`, src);
      expect(report.errors.map(f => f.rule), `example ${i}`).toEqual([]);
      expect(report.warnings.map(f => `${f.rule}: ${f.message}`), `example ${i}`).toEqual([]);
    });
  });

  it('reports the lint count it claims for the badly written steps', () => {
    const m = /expect (\d+) warnings -->\n\n```text\n([\s\S]*?)\n```/.exec(body);
    expect(m, 'bad steps example').not.toBeNull();
    const report = lintSource('bad-steps.md', `---\nform: instructions\n---\n\n${m![2]}`);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toHaveLength(Number(m![1]));
    expect(body).toContain(`reports ${m![1]} warnings on these four lines`);
  });

  it('covers the subjects the owner asked for', () => {
    for (const needle of ['one action per step', 'Diátaxis', 'curse of knowledge', 'runbook', 'README', 'docs as code', 'screen reader', 'ANSI Z535', 'procedure.recovery', 'prose measure', 'prose-instruct', 'Maintainer judgement:', 'Convention:', 'Measured here:']) {
      expect(body.toLowerCase(), needle).toContain(needle.toLowerCase());
    }
  });

  it('does not state the secondhand error-time figure', () => {
    expect(body).not.toMatch(/25\s*(?:to|-|–)\s*50\s*(?:%|percent)/i);
  });

  it('is packaged with its reference fragment', () => {
    const files = describeSource(root).files as string[];
    for (const f of ['craft/guides/instruction-docs.md', 'craft/guides/instruction-docs.refs.json']) expect(files, f).toContain(f);
    expect(existsSync(join(GUIDES_DIR, 'instruction-docs.refs.json'))).toBe(true);
  });
});
