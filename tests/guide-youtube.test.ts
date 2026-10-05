import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GUIDES_DIR } from '../src/craft/guides.ts';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { measure } from '../src/measure/index.ts';
import { describeSource } from '../scripts/managed-runtime.js';

const root = join(import.meta.dirname, '..');
const body = readFileSync(join(GUIDES_DIR, 'youtube.md'), 'utf8').replaceAll('\r\n', '\n');
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const write = (name: string, src: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'prose-guide-yt-'));
  made.push(dir);
  const file = join(dir, name);
  writeFileSync(file, `${src}\n`);
  return file;
};
const lintSource = (name: string, src: string) => lint(loadDocument(write(name, src)));
const measureSource = (name: string, src: string) => measure(loadDocument(write(name, src)));
const flat = body.replace(/\s+/g, ' ');

describe('the YouTube scripts guide', () => {
  it('runs about 450 to 620 lines including the generated parts', () => {
    const n = body.split('\n').length;
    expect(n).toBeGreaterThanOrEqual(450);
    expect(n).toBeLessThanOrEqual(620);
  });

  it('lints clean on every Markdown example it shows, all in the youtube form', () => {
    const blocks = [...body.matchAll(/^(`{3,})markdown\n([\s\S]*?)\n\1$/gm)].map(m => m[2]!);
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    for (const [i, src] of blocks.entries()) {
      expect(src, `example ${i}`).toMatch(/^---\nform: youtube\n/);
      const report = lintSource(`example-${i}.md`, src);
      expect(report.errors.map(f => f.rule), `example ${i}`).toEqual([]);
      expect(report.warnings.map(f => `${f.rule}: ${f.message}`), `example ${i}`).toEqual([]);
    }
  });

  it('reports the warning count it claims for each badly written example', () => {
    const bad = [...body.matchAll(/<!-- bad example, on purpose: the guide's tests lint it as youtube and expect (\d+) warnings? -->\n\n```text\n([\s\S]*?)\n```\n\nMeasured here: `prose lint` reports ([^\n]*)/g)];
    expect(bad.length).toBe(4);
    expect(bad.map(m => m[1])).toEqual(['0', '2', '0', '0']);
    bad.forEach((m, i) => {
      const [, count, text, claim] = m;
      const report = lintSource(`bad-${i}.md`, `---\nform: youtube\n---\n\n${text}`);
      expect(report.errors, `bad example ${i}`).toEqual([]);
      expect(report.warnings, `bad example ${i}`).toHaveLength(Number(count));
      expect(claim, `bad example ${i}`).toMatch(count === '0' ? /^no warnings/ : new RegExp(`^${count} warnings?`));
    });
  });

  it('measures the numbers it quotes from prose measure and prose lint', () => {
    const open = body.match(/```markdown\n(---\nform: youtube\ntarget: 45 seconds\n[\s\S]*?)\n```/)![1]!;
    const m = measureSource('open.md', open);
    expect(m.spoken?.words).toBe(113);
    expect(m.spoken?.minutes).toBe(0.71);
    const rates = m.segments.map(s => s.wpm);
    expect(Math.min(...rates)).toBe(133);
    expect(Math.max(...rates)).toBe(162);
    expect(m.segments[0]!.start).toBe('0:00');
    expect(flat).toContain('113 spoken words in 45 seconds of timeline, between 133 and 162 words per minute');

    const dense = body.match(/<!-- bad example[^\n]*expect 2 warnings -->\n\n```text\n([\s\S]*?)\n```/)![1]!;
    const report = lintSource('dense.md', `---\nform: youtube\n---\n\n${dense}`);
    const messages = report.warnings.map(w => w.message).join(' | ');
    expect(messages).toMatch(/45 words in 10 s is 270 wpm \(cap 180\); cut about 15 words/);
    expect(messages).toMatch(/Sentence of 46 words \(limit 16\)/);
    expect(flat).toContain('45 words in 10 seconds is 270 words per minute');

    const fixed = body.match(/```markdown\n(---\nform: youtube\n---\n\n## 0:00–0:08[\s\S]*?)\n```/)![1]!;
    expect(measureSource('fixed.md', fixed).spoken?.words).toBe(28);
    expect(flat).toContain('28 spoken words across 18 seconds');
  });

  it('describes minute and hour ranges as the parser reads them', () => {
    const m = measureSource('hours.md', '---\nform: youtube\n---\n\n## 1:02:00–1:03:00\n\nVO: One two three.\n\n## 75:00–76:00\n\nVO: One two three.');
    expect(m.segments.map(s => s.start)).toEqual(['1:02:00', '75:00']);
    expect(flat).toContain('1:02:00–1:03:00');
    expect(flat).toContain('Malformed ranges get a source-line warning');
    expect(m.segments.map(s => [s.seconds, s.words])).toEqual([[60, 3], [60, 3]]);
    const dir = measureSource('dirs.md', '---\nform: youtube\n---\n\n## 0:00–0:10\n\nVISUAL: a b c d e f\n\nB-ROLL: g h\n\nON SCREEN: i\n\nSFX: j\n\nMUSIC: k\n\nTEXT: l\n\nGRAPHIC: m\n\nSHOT: n\n\nCUT TO: o\n\nVO: One two three.');
    expect(dir.segments[0]!.words).toBe(3);
  });

  it('covers the subjects the owner asked for', () => {
    for (const needle of ['promise', 'payoff', 'cold open', 'hook', 'chapters', '00:00', 'at least three timestamps', 'at least 10 seconds', 'youtube.segment.pace', 'spoken.sentence.max', 'contractions', 'signposting', 'script grid', 'footage', 'captions', 'WCAG', 'sponsor', 'disclosure', 'fair use', 'made for kids', 'voice-over', 'on-camera', 'Tutorials', 'Explainers', 'prose parse', 'prose measure', 'prose lint', 'wpm', 'project.json', 'Maintainer judgement:', 'Convention:', 'Measured here:']) {
      expect(body.toLowerCase(), needle).toContain(needle.toLowerCase());
    }
  });

  it('keeps each claim inside what its source supports', () => {
    expect(flat).toMatch(/no credible controlled evidence/);
    expect(flat).toMatch(/unauthenticated/);
    expect(flat).toMatch(/only (their|the) abstract/);
    expect(flat).toMatch(/none of this is legal advice/);
    expect(flat).toMatch(/self-selected fans/);
    expect(flat).toMatch(/no sample or method disclosed/);
    expect(flat).toMatch(/not long video essays/);
    expect(flat).toMatch(/not a study of what causes retention/);
    expect(flat).toMatch(/one project's method/);
    expect(flat).not.toMatch(/\b(proves?|guarantees?|always (works|raises))\b/i);
    expect(flat).not.toMatch(/\bgo viral\b|\bhack\b|\balgorithm (rewards|loves)\b/i);
  });

  it('says the BBC figure is a subtitle reading speed and the 180 cap is this plugin\'s own', () => {
    expect(flat).toContain('That is a reading speed for subtitles');
    expect(flat).toMatch(/subtitle reading speed, and the 180 cap on spoken segments is this plugin's own choice/);
    expect(flat).not.toMatch(/160[-–]180[^.]{0,40}speech\b(?! rate)/i);
  });

  it('is packaged with its reference fragment and pointed to by the skill', () => {
    const files = describeSource(root).files as string[];
    for (const f of ['craft/guides/youtube.md', 'craft/guides/youtube.refs.json']) expect(files, f).toContain(f);
    expect(existsSync(join(GUIDES_DIR, 'youtube.refs.json'))).toBe(true);
    const skill = readFileSync(join(root, 'skills', 'prose-script', 'SKILL.md'), 'utf8').replace(/\s+/g, ' ');
    expect(skill).toContain('Craft guide: `prose guide youtube --text --section <name>`');
    expect(skill).toContain('Read the section you need, not all of it');
  });
});

describe('the corrected wording for the BBC subtitle figure', () => {
  const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8').replace(/\s+/g, ' ');

  it('no longer calls 160-180 wpm a speech rate in the rule, the reference or the craft guide', () => {
    const rules = JSON.parse(readFileSync(join(root, 'craft', 'rules.json'), 'utf8')).rules as Array<{ id: string; rationale: string; value: number | null; sources: string[]; derived: boolean }>;
    const pace = rules.find(r => r.id === 'youtube.segment.pace')!;
    expect(pace.rationale).toMatch(/reading speed for subtitles, not a speech rate/);
    expect(pace.rationale).toMatch(/this plugin's choice/);
    expect(pace.value).toBe(180);
    expect(pace.derived).toBe(true);
    expect(pace.sources).toEqual(['bbc-subtitles']);

    const refs = JSON.parse(readFileSync(join(root, 'craft', 'references.json'), 'utf8')).references as Array<{ id: string; note: string }>;
    const bbc = refs.find(r => r.id === 'bbc-subtitles')!;
    expect(bbc.note).toMatch(/reading speed for subtitles, not a speech rate/);

    const guide = read('craft', 'GUIDE.md');
    expect(guide).toMatch(/a reading speed for subtitles rather than a speech rate/);
    expect(guide).toMatch(/180 cap is this plugin's own choice/);

    for (const text of [JSON.stringify(rules), JSON.stringify(refs), guide, flat]) {
      expect(text).not.toMatch(/assumes 160[-–]180 ?(wpm|words per minute)? speech|assumes speech at 160/i);
      expect(text).not.toMatch(/subtitle timing assumes/i);
    }
  });
});
