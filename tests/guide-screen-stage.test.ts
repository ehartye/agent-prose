import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GUIDES_DIR } from '../src/craft/guides.ts';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { describeSource } from '../scripts/managed-runtime.js';

const root = join(import.meta.dirname, '..');
const body = readFileSync(join(GUIDES_DIR, 'screen-stage.md'), 'utf8').replaceAll('\r\n', '\n');
/** The guide with its line wraps joined, for checking sentences. */
const flat = body.replace(/\s*\n\s*/g, ' ');
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const lintSource = (name: string, src: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'prose-guide-fountain-'));
  made.push(dir);
  const file = join(dir, name);
  writeFileSync(file, `${src}\n`);
  return lint(loadDocument(file));
};
const pages = (report: ReturnType<typeof lint>) => (report.info.find(f => f.rule === 'script.runtime.report')!.measured as { pages: number }).pages;

/** Every fountain example in the guide, with the warning count declared before it (0 when it is a good example). */
const examples = [...body.matchAll(/(?:<!-- bad example: expect (\d+) warnings -->\n\n)?^(`{3,})fountain\n([\s\S]*?)\n\2$/gm)]
  .map(m => ({ expected: m[1] === undefined ? null : Number(m[1]), src: m[3]! }));

describe('the screen and stage guide', () => {
  it('runs about 450 to 620 lines including the generated parts', () => {
    const n = body.split('\n').length;
    expect(n).toBeGreaterThanOrEqual(450);
    expect(n).toBeLessThanOrEqual(620);
  });

  it('shows Fountain examples that lint with no errors, in the three forms it shows', () => {
    expect(examples.length).toBeGreaterThanOrEqual(8);
    const forms = new Set(examples.map(e => /^Form: ([a-z-]+)$/m.exec(e.src)?.[1]));
    expect([...forms].sort()).toEqual(['sitcom-multicam', 'sitcom-singlecam', 'stage-play', 'tv-drama']);
    examples.forEach((e, i) => {
      const report = lintSource(`example-${i}.fountain`, e.src);
      expect(report.errors.map(f => f.rule), `example ${i}`).toEqual([]);
      expect(report.warnings.map(f => `${f.rule}: ${f.message}`), `example ${i}`).toHaveLength(e.expected ?? 0);
    });
  });

  it('reports the counts it claims for the failure examples', () => {
    const bad = examples.filter(e => e.expected !== null);
    expect(bad.length).toBe(4);
    expect(bad.map(e => e.expected)).toEqual([0, 1, 0, 0]);
    expect(flat).toContain('Measured here: lint reports 0 warnings on it');
    expect(flat).toContain('it draws 1 warning from');
    expect(flat).toContain('`script.multicam.caps-action`');
  });

  it('measures the cold open the way the timing section says', () => {
    const cold = examples.find(e => e.src.includes('>COLD OPEN<'))!;
    const withMarker = pages(lintSource('cold.fountain', cold.src));
    const without = pages(lintSource('cold-no-marker.fountain', cold.src.replace(/^>COLD OPEN<\n\n/m, '')));
    expect(withMarker).toBeCloseTo(1.76, 2);
    expect(without).toBeCloseTo(0.76, 2);
    expect(flat).toContain('0.76 pages without the marker and 1.76 with it');
    expect(flat).toMatch(/runs 0\.76 pages \(1\.76 with the marker\) and plans at 0\.34 minute/);
    const minutes = (lintSource('cold-minutes.fountain', cold.src.replace(/^>COLD OPEN<\n\n/m, '')).info.find(f => f.rule === 'script.runtime.report')!.measured as { minutes: number }).minutes;
    expect(minutes).toBeCloseTo(0.34, 2);
  });

  it('describes the cue guard the parser really has', () => {
    const src = 'Form: tv-drama\n\nINT. ROOM - DAY\n\nTHE DOOR SLAMS\nWhere were you?\n\nTHE DOOR SLAMS.\nWhere were you?\n\nGRETA I made tea.\n';
    const dir = mkdtempSync(join(tmpdir(), 'prose-guide-cue-'));
    made.push(dir);
    const file = join(dir, 'cue.fountain');
    writeFileSync(file, src);
    const kinds = loadDocument(file).blocks.map(b => `${b.kind}:${b.speaker ?? ''}`);
    expect(kinds).toEqual(['scene:', 'line:THE DOOR SLAMS', 'action:', 'action:']);
    expect(flat).toContain('`THE DOOR SLAMS.` stays action');
    expect(flat).toContain('A BBC-UK line with name and speech together reads as action');
  });

  it('covers the subjects the owner asked for', () => {
    for (const needle of ['cold open', 'teaser', 'act-out', 'on the nose', 'subtext', 'misdirection', 'benign', 'incongruity', 'prose parse', 'prose measure', 'prose lint', 'prose-comedy', 'prose-script', 'variant set', 'script.runtime.report', 'Maintainer judgement:', 'Convention:', 'Measured here:']) {
      expect(flat.toLowerCase(), needle).toContain(needle.toLowerCase());
    }
  });

  it('keeps the weak evidence labelled as the sources allow', () => {
    expect(flat).toContain('Read this as an illustration, not a finding');
    expect(flat).toMatch(/52 to 58 pages/);
    expect(flat).toMatch(/Will & Grace 40 and Call Me Kat 42 to 45/);
    expect(flat).toContain('Several layouts are accepted');
    expect(flat).toMatch(/placeholder/);
    expect(flat).toMatch(/not peer-reviewed/);
    expect(flat).toMatch(/read only as an abstract|read only as abstracts|only as an abstract/);
    expect(flat).toMatch(/second-hand/);
  });

  it('states no stage page-per-minute rule and no joke quota as fact', () => {
    expect(flat).not.toMatch(/festival/i);
    expect(flat).not.toMatch(/stage page (?:is|equals|runs) (?:about )?(?:one|a) minute/i);
    expect(flat).toMatch(/no ratio/);
    expect(flat).not.toMatch(/\b(?:aim for|at least|a target of) \d+ jokes/i);
  });

  it('is packaged with its reference fragment, and the screen skills point at it', () => {
    const files = describeSource(root).files as string[];
    for (const f of ['craft/guides/screen-stage.md', 'craft/guides/screen-stage.refs.json']) expect(files, f).toContain(f);
    expect(existsSync(join(GUIDES_DIR, 'screen-stage.refs.json'))).toBe(true);
    for (const skill of ['prose-script', 'prose-comedy']) {
      const text = readFileSync(join(root, 'skills', skill, 'SKILL.md'), 'utf8');
      expect(text, skill).toContain('prose guide screen-stage --text --section <name>');
    }
  });
});
