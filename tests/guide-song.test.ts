import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GUIDES_DIR } from '../src/craft/guides.ts';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { measure } from '../src/measure/index.ts';
import { pronounce } from '../src/verse/pronounce.ts';
import { rhymeClass } from '../src/verse/rhyme.ts';
import { describeSource } from '../scripts/managed-runtime.js';

const root = join(import.meta.dirname, '..');
const body = readFileSync(join(GUIDES_DIR, 'song.md'), 'utf8').replaceAll('\r\n', '\n');
const flat = body.replace(/\s+/g, ' ');
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'prose-guide-song-')); made.push(d); return d; };
const write = (src: string) => { const file = join(scratch(), 'draft.md'); writeFileSync(file, `${src}\n`); return file; };
const lintSource = (src: string) => lint(loadDocument(write(src)));
const verseOf = (src: string) => measure(loadDocument(write(src))).verse!;
const markdownBlocks = [...body.matchAll(/^(`{3,})markdown\n([\s\S]*?)\n\1$/gm)].map(m => m[2]!);
/** The `### heading` section's text, ignoring `#` lines inside code fences (lyric examples have `## Verse 1`). */
const sectionOf = (heading: string) => {
  const out: string[] = [];
  let found = false;
  let fenced = false;
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    if (!fenced && /^#{1,3} /.test(line)) { if (found) break; found = line === `### ${heading}`; continue; }
    if (found) out.push(line);
  }
  return out.join('\n');
};
const exampleOf = (heading: string) => {
  const section = sectionOf(heading);
  return { bad: /```text\n([\s\S]*?)\n```/.exec(section)?.[1], good: /```markdown\n([\s\S]*?)\n```/.exec(section)?.[1] as string };
};
const withForm = (text: string, extra = '') => `---\nform: song\n${extra}---\n\n${text}`;
const HEADINGS = {
  verseChorus: 'A verse and chorus with consistent counts',
  stress: 'A line whose stress falls off the beat',
  hymn: 'A hymn text in Common Meter',
  chorus: 'A chorus repeated with variation',
  bridge: 'A bridge',
  aaba: 'Four labelled sections in AABA',
};
const HYMN_PATTERN = 'syllables: 8.6.8.6\nscheme: xaxa\n';

describe('the song guide', () => {
  it('runs about 450 to 650 lines including the generated parts', () => {
    const n = body.split('\n').length;
    expect(n).toBeGreaterThanOrEqual(450);
    expect(n).toBeLessThanOrEqual(650);
  });

  it('lints clean on every Markdown example it shows', () => {
    expect(markdownBlocks.length).toBeGreaterThanOrEqual(5);
    markdownBlocks.forEach((src, i) => {
      expect(src, `example ${i}`).toMatch(/^---\nform: song\n/);
      const report = lintSource(src);
      expect(report.errors.map(f => f.rule), `example ${i}`).toEqual([]);
      expect(report.warnings.map(f => `${f.rule}: ${f.message}`), `example ${i}`).toEqual([]);
    });
  });

  it('reports the warning count it claims for each badly written example', () => {
    const bad = [...body.matchAll(/<!-- bad example, on purpose: the guide's tests ([^\n]*?) and expect (\d+) warnings?[^\n]*-->\n\n```text\n([\s\S]*?)\n```\n\nMeasured here: ([^\n]*)/g)];
    expect(bad.length).toBe(3);
    const extra: Record<string, string> = { stress: 'syllables: [8]\n', hymn: HYMN_PATTERN, chorus: '' };
    const key = (t: string) => (t.startsWith('Silver') ? 'stress' : t.startsWith('The lamp') ? 'hymn' : 'chorus');
    for (const m of bad) {
      const [, , count, text] = m;
      const report = lintSource(withForm(text!, extra[key(text!)]));
      expect(report.errors).toEqual([]);
      expect(report.warnings, key(text!)).toHaveLength(Number(count));
    }
  });

  it('measures the verse and chorus example as the guide says', () => {
    const v = verseOf(exampleOf(HEADINGS.verseChorus).good);
    expect(v.lines.map(l => l.syllables)).toEqual([8, 8, 8, 8, 8, 8, 8, 6, 8, 8, 8, 8, 8, 8, 8, 6]);
    expect(v.lines.map(l => l.rhyme).join('')).toBe('abcbddeefbgbddee');
    expect(v.trust.words).toBe(114);
    expect(v.trust.dict).toBe(114);
    expect(v.lyric!.syllablesPerBeat!.perLine.filter(x => x === 2)).toHaveLength(14);
    expect(v.lyric!.syllablesPerBeat!.perLine.filter(x => x === 1.5)).toHaveLength(2);
    expect(v.lyric!.refrains.every(r => r.consistent)).toBe(true);
    expect(v.lyric!.likeSections.every(s => s.max === 0)).toBe(true);
    for (const phrase of ['114 words are `dict`', '2.00 syllables per beat', '1.50 on the 6']) expect(flat, phrase).toContain(phrase);
  });

  it('shows a stress that a count check cannot see', () => {
    const { bad, good } = exampleOf(HEADINGS.stress);
    const wrong = verseOf(withForm(bad!, 'syllables: [8]\n'));
    const right = verseOf(good);
    expect(wrong.lines[0]!.syllables).toBe(8);
    expect(right.lines[0]!.syllables).toBe(8);
    expect(wrong.lines[0]!.stress).toBe('1010????');
    expect(right.lines[0]!.stress).toBe('?1010???');
    expect(lintSource(withForm(bad!, 'syllables: [8]\n')).warnings).toEqual([]);
    for (const phrase of ['`1010????`', '`?1010???`', 'land on syllables 1 and 3', 'fall on syllables 2 and 4']) expect(flat, phrase).toContain(phrase);
  });

  it('puts the polysyllable stresses of the hymn on even syllables, and flags the 10-syllable line', () => {
    const { bad, good } = exampleOf(HEADINGS.hymn);
    const v = verseOf(good);
    expect(v.lines.map(l => l.syllables)).toEqual([8, 6, 8, 6, 8, 6, 8, 6]);
    for (const l of v.lines) for (let i = 0; i < l.stress.length; i++) if (l.stress[i] === '1') expect((i + 1) % 2, `${l.text} syllable ${i + 1}`).toBe(0);
    const warnings = lintSource(withForm(bad!, HYMN_PATTERN)).warnings;
    expect(warnings.map(w => w.message)).toEqual(['Line 8 has 10 syllables; your pattern asks for 8 (stanza 1, line 3)'].map(m => m.replace('Line 8', `Line ${warnings[0]!.at!.line}`)));
    expect(flat).toContain('line 3 has 10');
    expect(flat).toContain('with `syllables: 8.6.8.6` and `scheme: xaxa` declared');
  });

  it('measures the varied chorus and the bridge as the guide says', () => {
    const { bad } = exampleOf(HEADINGS.chorus);
    const report = lintSource(withForm(bad!));
    expect(report.warnings.map(w => w.rule)).toEqual(['lyric.refrain.consistent']);
    expect(report.warnings[0]!.message).toContain('"Come in out of the air" where the first has "Just come on up the stair"');
    const fixed = bad!.replace(/## Chorus\n(?![\s\S]*## Chorus)/, '## Final Chorus\n').replace(/(## Chorus[\s\S]*?)## Chorus/, '$1## Final Chorus');
    expect(fixed).toContain('## Final Chorus');
    const relabelled = lintSource(withForm(fixed));
    expect(relabelled.warnings).toEqual([]);
    const v = verseOf(exampleOf(HEADINGS.bridge).good);
    expect(v.lines.map(l => l.syllables).slice(0, 4)).toEqual([8, 6, 8, 6]);
    expect(v.scheme.slice(0, 4)).toBe('abab');
    expect(v.lyric!.syllablesPerBeat!.mean).toBe(1.81);
    expect(flat).toContain('1.81 syllables per beat');
    const aaba = verseOf(exampleOf(HEADINGS.aaba).good);
    expect(aaba.lyric!.sections.map(s => s.base)).toEqual(['a', 'a', 'b', 'a']);
    expect(aaba.lyric!.likeSections.every(s => s.max === 0)).toBe(true);
  });

  it('classes the rhyme pairs the table names as it says', () => {
    const cls = (a: string, b: string) => rhymeClass(pronounce(a), pronounce(b)).class;
    for (const [a, b] of [['fire', 'desire'], ['light', 'tonight']] as const) expect(cls(a, b), `${a}/${b}`).toBe('perfect');
    expect(cls('bare', 'bear')).toBe('identity');
    for (const [a, b] of [['life', 'tide'], ['snow', 'rose']] as const) expect(cls(a, b), `${a}/${b}`).toBe('assonance');
    for (const [a, b] of [['mud', 'truck'], ['love', 'blush'], ['strum', 'hung']] as const) expect(cls(a, b), `${a}/${b}`).toBe('family');
    expect(cls('stone', 'plane')).toBe('consonance');
    for (const [a, b] of [['love', 'move'], ['where', 'here']] as const) expect(cls(a, b), `${a}/${b}`).toBe('eye');
    expect(cls('done', 'dim')).toBe('none');
    expect(rhymeClass(pronounce('wind'), pronounce('sinned'))).toEqual({ class: 'perfect', uncertain: true });
    expect(flat).toContain('The `family` class follows Pattison');
  });

  it('says what the trust tags do for the words it names', () => {
    const p = (w: string) => pronounce(w);
    expect(p('unlatched')).toMatchObject({ source: 'guessed', syllables: 2, stress: '??' });
    expect(p('every')).toMatchObject({ source: 'dict', syllables: 3, syllablesAlt: 2 });
    expect(p('dancin\'').source).toBe('affix');
    const line = verseOf(withForm('I wind it every night for you', 'syllables: [8]\n')).lines[0]!;
    expect([line.syllables, line.syllablesAlt]).toEqual([9, 8]);
    expect(lintSource(withForm('I wind it every night for you', 'syllables: [8]\n')).warnings).toEqual([]);
    expect(flat).toContain('reads `9/8`');
  });

  it('normalizes hymn labels and accepts the written-out counts', () => {
    for (const alias of ['CM', '8686', '8.7.8.7.D']) expect(() => lintSource(withForm('One line here now', `syllables: "${alias}"\n`)), alias).not.toThrow();
    expect(lintSource(withForm('One line here now\nTwo here\nThree line here now\nFour here', 'syllables: 8.7.8.7\n')).errors).toEqual([]);
    expect(lintSource(withForm('One line here now', 'syllables: 8.7.8.7.8.7.8.7\n')).errors).toEqual([]);
    expect(flat).toContain('`8.6.8.6` normalize to common-meter counts');
  });

  it('divides syllables by beatsPerLine and does not use the tempo, and reads the label forms', () => {
    const at = (tempo: number, extra = '') => verseOf(withForm('Come home, come home, I have kept the light', `tempo: ${tempo}\n${extra}`)).lyric!.syllablesPerBeat!;
    expect(at(60).perLine).toEqual(at(180).perLine);
    expect(at(96).perLine[0]).toBe(2.25);
    expect(at(96, 'beatsPerLine: 8\n').perLine[0]).toBe(1.13);
    expect(at(96).beatsPerLine).toBe(4);
    const labelled = verseOf(withForm('[Verse 1]\nOne line here now\n\n**Chorus**\nSing it out loud\n\nPre-Chorus:\nHere it comes\n\n(hum softly)\nFolk, about 90 bpm, 4/4'));
    expect(labelled.lyric!.sections.map(s => s.label)).toEqual(['Verse 1', 'Chorus', 'Pre-Chorus']);
    expect(labelled.directions.map(d => d.text)).toEqual(['(hum softly)', 'Folk, about 90 bpm, 4/4']);
  });

  it('warns on a song target and not on sentence reports', () => {
    const song = exampleOf(HEADINGS.verseChorus).good.replace('tempo: 96\n', 'tempo: 96\ntarget: 20 words\n');
    const report = lintSource(song);
    expect(report.warnings.map(w => w.rule)).toEqual(['length.target']);
    expect(report.warnings[0]!.message).toContain('cut about 94 words');
    expect(flat).toContain('cut about 94 words');
    expect(lintSource(exampleOf(HEADINGS.verseChorus).good).info.map(i => i.rule)).toEqual([]);
  });

  it('covers the subjects the owner asked for', () => {
    for (const needle of ['verse-chorus', 'AABA', 'pre-chorus', 'bridge', 'refrain', 'hook', 'earworm', 'prosody', 'stress', 'syllables per beat', 'prose scan', 'prose pronounce', 'prose lint', 'dict', 'affix', 'guessed', 'Common Metre', 'Long Metre', 'Short Metre', 'metrical index', 'perfect', 'assonance', 'consonance', 'singab', 'direct address', 'sense-bound', 'central idea', '[Verse 1]', 'fair use', 'permission', 'prose-songwriting', 'prose set new', 'tempo', 'beatsPerLine', 'Maintainer judgement:', 'Convention:', 'Measured here:']) {
      expect(flat.toLowerCase(), needle).toContain(needle.toLowerCase());
    }
  });

  it('keeps each claim inside what its source supports', () => {
    expect(flat).toMatch(/no source for a syllables-per-beat figure and no source for a tolerance/);
    expect(flat).toMatch(/any tolerance in the plugin is its own convention/);
    expect(flat).toMatch(/Only the abstract was captured/);
    expect(flat).toMatch(/Chart data show association, not that added repetition causes success/);
    expect(flat).toMatch(/the results report increased repetition, and this guide uses the results/);
    expect(flat).toMatch(/reports, second-hand, that 90 percent/);
    expect(flat).toMatch(/What none of it shows: how many repeats a song needs/);
    expect(flat).toMatch(/Sixteen people, isochronous sentences/);
    expect(flat).toMatch(/There is no pop corpus of mismatches, no tolerance/);
    expect(flat).toMatch(/Proto's own survey of about 90 songs/);
    expect(flat).toMatch(/These definitions rest on one encyclopedia article, one database record and two glossary entries/);
    expect(flat).toMatch(/Whether a stress deviation is acceptable is a convention with no source/);
    expect(flat).toMatch(/gives no\s+rule about open vowels on long notes, consonant clusters or breath/);
    expect(flat).toMatch(/This is a pointer, not legal advice/);
    expect(flat).toMatch(/Nothing read covers parody, singing translation/);
    expect(flat).toMatch(/at least 95 percent of chart songs are verse-chorus has no source or count/);
    // no invented effect: no claim that repetition or alignment causes success or that a hook can be engineered
    expect(flat).not.toMatch(/(?<!not that (added )?)repetition (causes|guarantees|drives) (a )?(hit|success)/i);
    expect(flat).not.toMatch(/\b(hit|earworm)s? (can|will) be (engineered|manufactured)/i);
    expect(flat).not.toMatch(/(verse|chorus|bridge)[^.]{0,30}\b(must|should) (have|be) (exactly )?\d+ (lines|bars)/i);
  });

  it('is packaged with its reference fragment and pointed to by the skill', () => {
    const files = describeSource(root).files as string[];
    for (const f of ['craft/guides/song.md', 'craft/guides/song.refs.json']) expect(files, f).toContain(f);
    expect(existsSync(join(GUIDES_DIR, 'song.refs.json'))).toBe(true);
    const skill = readFileSync(join(root, 'skills', 'prose-songwriting', 'SKILL.md'), 'utf8').replace(/\s+/g, ' ');
    expect(skill).toContain('Craft guide: `prose guide song --text --section <name>`');
    expect(skill).toContain('Read the section you need, not all of it');
  });
});
