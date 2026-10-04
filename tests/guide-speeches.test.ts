import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GUIDES_DIR } from '../src/craft/guides.ts';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { measure } from '../src/measure/index.ts';
import { describeSource } from '../scripts/managed-runtime.js';

const root = join(import.meta.dirname, '..');
const body = readFileSync(join(GUIDES_DIR, 'speeches.md'), 'utf8').replaceAll('\r\n', '\n');
const FORMS = ['speech-large', 'speech-recorded', 'speech-small'];
// The Bliss copy of the Gettysburg Address (public domain, Wikisource); the guide measures it.
const GETTYSBURG = `Four score and seven years ago our fathers brought forth, on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.

Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure. We are met on a great battle-field of that war. We have come to dedicate a portion of that field, as a final resting place for those who here gave their lives that that nation might live. It is altogether fitting and proper that we should do this.

But, in a larger sense, we can not dedicate—we can not consecrate—we can not hallow—this ground. The brave men, living and dead, who struggled here, have consecrated it, far above our poor power to add or detract. The world will little note, nor long remember what we say here, but it can never forget what they did here. It is for us the living, rather, to be dedicated here to the unfinished work which they who fought here have thus far so nobly advanced. It is rather for us to be here dedicated to the great task remaining before us—that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion—that we here highly resolve that these dead shall not have died in vain—that this nation, under God, shall have a new birth of freedom—and that government of the people, by the people, for the people, shall not perish from the earth.`;
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'prose-guide-speech-')); made.push(d); return d; };
const write = (name: string, src: string, dir = scratch()) => { const file = join(dir, name); writeFileSync(file, `${src}\n`); return file; };
const lintSource = (name: string, src: string) => lint(loadDocument(write(name, src)));
const measureSource = (src: string) => measure(loadDocument(write('m.md', src)));
const markdownBlocks = [...body.matchAll(/^(`{3,})markdown\n([\s\S]*?)\n\1$/gm)].map(m => m[2]!);
const exampleOf = (heading: string) => {
  const section = new RegExp(`### ${heading}\\n([\\s\\S]*?)(?=\\n###? )`).exec(body)![1]!;
  return { bad: /```text\n([\s\S]*?)\n```/.exec(section)![1]!, good: /```markdown\n([\s\S]*?)\n```/.exec(section)![1]! };
};
const formOf: Record<string, string> = {
  'A toast opening': 'speech-small', 'A eulogy paragraph': 'speech-small', 'A keynote opening': 'speech-large',
  'A sentence too long for the ear': 'speech-large', 'A recorded address opening': 'speech-recorded',
};

describe('the speeches guide', () => {
  it('runs about 450 to 620 lines including the generated parts', () => {
    const n = body.split('\n').length;
    expect(n).toBeGreaterThanOrEqual(450);
    expect(n).toBeLessThanOrEqual(620);
  });

  it('lints clean on every Markdown example it shows, in all three forms', () => {
    expect(markdownBlocks.length).toBeGreaterThanOrEqual(6);
    const forms = new Set(markdownBlocks.map(b => /^---\nform: ([a-z-]+)\n/.exec(b)?.[1]));
    expect([...forms].sort()).toEqual(FORMS);
    markdownBlocks.forEach((src, i) => {
      const report = lintSource(`example-${i}.md`, src);
      expect(report.errors.map(f => f.rule), `example ${i}`).toEqual([]);
      expect(report.warnings.map(f => `${f.rule}: ${f.message}`), `example ${i}`).toEqual([]);
    });
  });

  it('reports the warning count it claims for each badly written example', () => {
    const bad = [...body.matchAll(/<!-- bad example, on purpose: the guide's tests lint it as (speech-small|speech-large|speech-recorded) and expect (\d+) warnings? -->\n\n```text\n([\s\S]*?)\n```\n\nMeasured here: `prose lint` reports ([^\n]*)/g)];
    expect(bad.length).toBe(6);
    expect([...new Set(bad.map(m => m[1]))].sort()).toEqual(FORMS);
    bad.forEach((m, i) => {
      const [, form, count, text, claim] = m;
      const report = lintSource(`bad-${i}.md`, `---\nform: ${form}\n---\n\n${text}`);
      expect(report.errors, `bad example ${i}`).toEqual([]);
      expect(report.warnings, `bad example ${i}`).toHaveLength(Number(count));
      expect(claim, `bad example ${i}`).toMatch(count === '0' ? /^no warnings/ : new RegExp(`^${count} warnings?`));
    });
  });

  it('states the sentence lengths and reading grades it quotes for the examples', () => {
    const lengths: Array<[string, number[]]> = [['A toast opening', [82]], ['A eulogy paragraph', [60]], ['A keynote opening', [18, 27]], ['A sentence too long for the ear', [48]], ['A recorded address opening', [53]]];
    for (const [heading, expected] of lengths) {
      const { bad } = exampleOf(heading);
      const found = lintSource('len.md', `---\nform: ${formOf[heading]}\n---\n\n${bad}`).warnings.map(w => Number(/Sentence of (\d+) words/.exec(w.message)![1]));
      expect(found, heading).toEqual(expected);
      expect(body, heading).toContain(expected.length > 1 ? `sentences of ${expected.join(' and ')} words` : `a sentence of ${expected[0]} words`);
    }
    const toast = exampleOf('A toast opening');
    expect(measureSource(`---\nform: speech-small\n---\n\n${toast.bad}`).style.readingGrade).toBe(33.2);
    expect(measureSource(toast.good).style.readingGrade).toBe(1.3);
    expect(body).toContain('grade 33.2 and its rewrite at 1.3');
  });

  it('measures the marked script and the Gettysburg Address as the guide says', () => {
    const { bad, good } = exampleOf('A script marked for pauses');
    const plain = measureSource(`---\nform: speech-large\n---\n\n${bad}`);
    const marked = measureSource(good);
    expect(plain.spoken!.words).toBe(40);
    expect(marked.spoken!.words).toBe(40);
    expect(plain.spoken!.longestBreathUnit!.words).toBe(12);
    expect(marked.spoken!.longestBreathUnit!.words).toBe(8);
    expect(body).toContain('counts 40 words with a 12-word longest breath');
    expect(body).toContain('falls from 12 words to 8');
    const gb = measureSource(`---\nform: speech-large\n---\n\n${GETTYSBURG}`);
    expect(gb.spoken!.words).toBe(272);
    expect(gb.spoken!.minutes).toBe(2.09);
    expect(gb.style.sentences).toBe(10);
    expect(gb.style.sentenceLength.mean).toBe(27.2);
    expect(gb.style.sentenceLength.max).toBe(82);
    const flagged = lintSource('gb.md', `---\nform: speech-large\n---\n\n${GETTYSBURG}`).warnings.filter(w => w.rule === 'spoken.sentence.max');
    expect(flagged).toHaveLength(8);
    expect(body).toContain('trips the flag on 8 of its 10');
    expect(body).toContain('(272 words) reads in 2.09 minutes at 130');
  });

  it('plans all three forms at 130 words per minute and lets the draft, form or project override it', () => {
    const text = 'One two three four five six seven eight nine ten.';
    for (const form of FORMS) expect(measureSource(`---\nform: ${form}\n---\n\n${text}`).spoken!.wpm).toBe(130);
    expect(measureSource(`---\nform: speech-recorded\nwpm: 120\n---\n\n${text}`).spoken!.wpm).toBe(120);
    const dir = scratch();
    mkdirSync(join(dir, '.agent-prose'));
    writeFileSync(join(dir, '.agent-prose', 'project.json'), JSON.stringify({ schema: 'prose/project@1', wpm: 150, forms: { 'speech-recorded': { wpm: 160 } } }));
    const at = (form: string, extra = '') => measure(loadDocument(write(`${form}.md`, `---\nform: ${form}\n${extra}---\n\n${text}`, dir))).spoken!.wpm;
    expect(at('speech-large')).toBe(150);
    expect(at('speech-recorded')).toBe(160);
    expect(at('speech-recorded', 'wpm: 120\n')).toBe(120);
  });

  it('does not count cues on their own line and counts a bracket inside a sentence', () => {
    const own = measureSource('---\nform: speech-small\n---\n\nI thank her.\n\n[raise glass]\n\n<!-- a note -->\n\nDone.');
    expect(own.spoken!.words).toBe(4);
    const inline = measureSource('---\nform: speech-small\n---\n\nI thank [name] for this.');
    expect(inline.spoken!.words).toBe(5);
    expect(inline.placeholders.length).toBe(1);
  });

  it('covers the subjects the owner asked for', () => {
    for (const needle of ['toast', 'eulogy', 'keynote', 'recorded', 'signpost', 'rule of three', 'applause', 'ethos', 'statistics', 'teleprompter', 'captions', 'NPR', 'spoken.duration.report', 'spoken.sentence.max', 'wpm', 'project.json', 'prose set new', 'prose measure', 'prose parse', 'prose lint', 'prose-speech', 'Maintainer judgement:', 'Convention:', 'Measured here:', 'W3C', 'UN guidelines', 'manuscript', 'breath unit', 'slides', 'microphone']) {
      expect(body.toLowerCase(), needle).toContain(needle.toLowerCase());
    }
  });

  it('keeps each claim inside what its source supports', () => {
    const flat = body.replace(/\s+/g, ' ');
    expect(flat).toMatch(/130 is CRS's planning figure, a rule of thumb and not a measurement/);
    expect(flat).toMatch(/nothing read shows it is better than another rate/);
    expect(flat).toMatch(/no eulogy length is stated here as fact/);
    expect(flat).toMatch(/There is no source on teleprompter layout/);
    expect(flat).toMatch(/does not rely on it/);
    expect(flat).toMatch(/do not present it as a persuasion finding/);
    expect(flat).toMatch(/What none of it shows: that three beats two or four/);
    expect(flat).toMatch(/\(Bull reports these second-hand\)/);
    expect(flat).toMatch(/only the abstract was captured/);
    expect(flat).toMatch(/Do not state a hard attention limit/);
    expect(flat).toMatch(/the number is mine, not W3C's/);
    expect(flat).toMatch(/second-language listeners, not natives/);
    expect(flat).toMatch(/not in the translation read here/);
    expect(flat).toMatch(/It gives no rate and no pause length/);
    expect(flat).toMatch(/Gaps: nothing read covers race, disability or age/);
    expect(flat).toMatch(/news write-up/);
    // no eulogy length or hard attention limit stated as fact, and no persuasion claim for lists of three
    expect(flat).not.toMatch(/eulogy[^.]{0,40}\b(should|must|is)\b[^.]{0,30}\b\d+\s*(to \d+\s*)?minutes/i);
    expect(flat).not.toMatch(/(attention span|attention) (is|lasts|of) (about |only )?\d/i);
    expect(flat).not.toMatch(/triads? (persuade|improve recall|are more persuasive)/i);
    expect(flat).not.toMatch(/\b93 ?(%|percent) (of|is)\b/i);
  });

  it('quotes none of the garbled second-hand rate figures', () => {
    expect(body).not.toMatch(/\b(127|188|200) (wpm|words)\b/);
    expect(body).toContain('no table figure is used');
  });

  it('is packaged with its reference fragment and pointed to by the skill', () => {
    const files = describeSource(root).files as string[];
    for (const f of ['craft/guides/speeches.md', 'craft/guides/speeches.refs.json']) expect(files, f).toContain(f);
    expect(existsSync(join(GUIDES_DIR, 'speeches.refs.json'))).toBe(true);
    const skill = readFileSync(join(root, 'skills', 'prose-speech', 'SKILL.md'), 'utf8').replace(/\s+/g, ' ');
    expect(skill).toContain('Craft guide: `prose guide speeches --text --section <name>`');
    expect(skill).toContain('Read the section you need, not all of it');
  });
});
