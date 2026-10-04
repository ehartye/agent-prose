import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GUIDES_DIR } from '../src/craft/guides.ts';
import { getForm } from '../src/forms.ts';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { measure } from '../src/measure/index.ts';
import { pronounce } from '../src/verse/pronounce.ts';
import { rhymeClass } from '../src/verse/rhyme.ts';
import { describeSource } from '../scripts/managed-runtime.js';
import { fixture, run } from './helpers.ts';

const root = join(import.meta.dirname, '..');
const body = readFileSync(join(GUIDES_DIR, 'verse.md'), 'utf8').replaceAll('\r\n', '\n');
/** The guide with its line wraps joined, for checking sentences. */
const flat = body.replace(/\s*\n\s*/g, ' ');
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const write = (name: string, src: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'prose-guide-verse-'));
  made.push(dir);
  const file = join(dir, name);
  writeFileSync(file, `${src}\n`);
  return file;
};
const lintSource = (name: string, src: string) => lint(loadDocument(write(name, src)));
const measureSource = (name: string, src: string) => measure(loadDocument(write(name, src))).verse!;

/** Every Markdown example in the guide, with the warning count declared before it (0 when it is a good example). */
const examples = [...body.matchAll(/(?:<!-- bad example, on purpose: the guide's tests lint it as ([a-z-]+) and expect (\d+) warnings? -->\n\n)?^(`{3,})markdown\n([\s\S]*?)\n\3$/gm)]
  .map(m => ({ bad: m[2] !== undefined, expected: m[2] === undefined ? 0 : Number(m[2]), src: m[4]!, form: /^form: ([a-z-]+)$/m.exec(m[4]!)?.[1] }));
const find = (form: string, needle: string) => examples.find(e => e.form === form && e.src.includes(needle))!.src;
const all = (r: ReturnType<typeof lint>) => [...r.errors, ...r.warnings, ...r.info];
/** The poem's lines, without its frontmatter. */
const poemOf = (src: string) => src.replace(/^---\n[\s\S]*?\n---\n/, '');
const withFront = (front: string, src: string) => `---\n${front}\n---\n${poemOf(src)}`;

describe('the verse guide', () => {
  // Eight forms, a 39-line sestina, two full sonnets and a 19-line villanelle as lint-checked examples, and the
  // generated rule table (26 lines) and 38 sources make this guide longer than the 590 to 620 lines of the earlier ones.
  it('runs about 450 to 760 lines including the generated parts', () => {
    const n = body.split('\n').length;
    expect(n).toBeGreaterThanOrEqual(450);
    expect(n).toBeLessThanOrEqual(760);
  });

  it('shows examples that lint with no errors, in all eight forms, with the declared warning counts', () => {
    expect(examples.length).toBe(11);
    expect([...new Set(examples.map(e => e.form))].sort()).toEqual(['ballad', 'free-verse', 'haiku', 'limerick', 'sestina', 'sonnet-petrarchan', 'sonnet-shakespearean', 'villanelle']);
    examples.forEach((e, i) => {
      const report = lintSource(`example-${i}.md`, e.src);
      expect(report.errors.map(f => f.rule), `example ${i}`).toEqual([]);
      expect(report.warnings.map(f => `${f.rule}: ${f.message}`), `example ${i}`).toHaveLength(e.expected);
    });
    const bad = examples.filter(e => e.bad);
    expect(bad.map(e => [e.form, e.expected])).toEqual([['free-verse', 0], ['haiku', 0], ['ballad', 1]]);
  });

  it('reports what it claims for the free-verse and haiku pairs', () => {
    const fvBad = lintSource('fv-bad.md', find('free-verse', 'made me sad'));
    expect(fvBad.warnings).toEqual([]);
    expect(fvBad.info.map(f => f.rule)).toEqual(['verse.rhyme.every-line']);
    expect(all(lintSource('fv-good.md', find('free-verse', 'porch roof')))).toEqual([]);
    expect(flat).toContain('lint reports 0 warnings and 1 info finding, `verse.rhyme.every-line`');

    expect(all(lintSource('hk-bad.md', find('haiku', 'beautiful dawn')))).toEqual([]);
    const hk = lintSource('hk-good.md', find('haiku', 'first frost'));
    expect(hk.warnings).toEqual([]);
    expect(hk.info.map(f => f.rule)).toEqual(['verse.form.syllables', 'verse.form.syllables', 'verse.form.syllables']);
    expect(hk.info.map(f => (f.measured as { syllables: number }).syllables)).toEqual([2, 5, 4]);
    expect(flat).toContain('lint reports 0 warnings and 3 info findings (lines of 2, 5 and 4 syllables against a soft 5/7/5)');
    expect(hk.info[0]!.tradeoffs?.[0]?.rule).toBe('verse.line-break.purpose');
  });

  it('reports what it claims for the limerick and the ballad', () => {
    const lim = find('limerick', 'curator');
    expect(all(lintSource('lim.md', lim))).toEqual([]);
    const wall = lintSource('lim-wall.md', lim.replace('on the stair;', 'on the wall;'));
    expect(wall.warnings.map(f => f.rule)).toEqual(['verse.form.rhyme-scheme']);
    expect(wall.warnings[0]!.message).toMatch(/^Lines 4 and 5 \("Claire" and "wall"\)/);

    const bad = lintSource('bal-bad.md', find('ballad', 'ferryman felt sorry'));
    expect(bad.warnings.map(f => f.rule)).toEqual(['verse.form.rhyme-scheme']);
    expect(bad.warnings[0]!.message).toMatch(/"money" and "free"/);
    const good = find('ballad', 'ripple');
    expect(all(lintSource('bal-good.md', good))).toEqual([]);
    return run('scan', write('bal-scan.md', good)).then(out => {
      expect(out.lines).toHaveLength(12);
      expect(out.lines.every((l: any) => l.declared.fit === 'ok')).toBe(true);
    });
  });

  it('reports what it claims for the two sonnets', () => {
    const shk = find('sonnet-shakespearean', 'waiting was a loss');
    const pet = find('sonnet-petrarchan', 'sold the farm');
    expect(all(lintSource('shk.md', shk))).toEqual([]);
    expect(all(lintSource('pet.md', pet))).toEqual([]);
    for (const src of [shk, pet]) {
      const v = measureSource('sonnet.md', src);
      expect(v.lines).toHaveLength(14);
      expect(v.lines.every(l => l.syllables === 10 || l.syllablesAlt === 10 || l.syllables === 11)).toBe(true);
    }
    expect(shk).toMatch(/\nBut what I tallied/);
    expect(pet).toMatch(/\nBut in the spring/);
    expect(measureSource('shk.md', shk).scheme).toBe('ababcdcdefefgg');
    expect(measureSource('pet.md', pet).scheme).toBe('abbaabbacdecde');

    const late = lintSource('sore.md', shk.replace('feeling cross,', 'feeling late,'));
    expect(late.warnings.map(f => f.rule)).toEqual(['verse.form.rhyme-scheme']);
    expect(late.warnings[0]!.message).toMatch(/^Lines 4 and 6 /);
    const shortOne = lintSource('short.md', shk.replace(/\nShe spent as hers, and so the day was made\./, ''));
    expect(shortOne.warnings.map(f => f.rule)).toEqual(['verse.form.line-count']);
    expect(shortOne.warnings[0]!.message).toMatch(/Expected 14 lines .* found 13/);

    const tens = `form: sonnet-shakespearean\nsyllables: [${Array(14).fill(10).join(', ')}]`;
    const oneBlock = poemOf(shk).split('\n').filter(l => l.trim() !== '').join('\n');
    expect(all(lintSource('tens.md', `---\n${tens}\n---\n${oneBlock}`))).toEqual([]);
    const longer = lintSource('long.md', `---\n${tens}\n---\n${oneBlock.replace('and look the other way.', 'and then look the other way.')}`);
    expect(longer.warnings.map(f => f.rule)).toEqual(['verse.form.syllables']);
    expect(longer.warnings[0]!.message).toMatch(/has 11 syllables; your pattern asks for 10/);

    const and = lintSource('and.md', pet.replace('But in the spring', 'And in the spring'));
    expect(all(and)).toEqual([]);
  });

  it('reports what it claims for the villanelle', () => {
    const vil = find('villanelle', 'We bury');
    expect(measureSource('vil.md', vil).scheme).toBe('abaabaabaabaabaabaa');
    expect(flat).toContain('`abaabaabaabaabaabaa`');
    const lines = vil.split('\n');
    const at = lines.findIndex((l, i) => i > 0 && l === 'We bury what we love and let it grow.' && lines.slice(0, i).filter(x => x === l).length === 2);
    expect(at + 1).toBe(18);
    const then = lintSource('then.md', vil.split('\n').map((l, i) => (i === at ? 'We bury what we love, then let it grow.' : l)).join('\n'));
    expect(then.warnings.map(f => f.rule)).toEqual(['verse.form.refrain']);
    expect(then.warnings[0]!.message).toMatch(/^Line 18 should repeat the A1 refrain \(line 4\) verbatim: "We bury what we love and let it grow\."/);
    const punct = lintSource('punct.md', vil.split('\n').map((l, i) => (i === at ? 'We bury what we love, and let it grow.' : l)).join('\n'));
    expect(all(punct)).toEqual([]);
  });

  it('reports what it claims for the sestina', () => {
    const ses = find('sestina', 'At three');
    expect(measureSource('ses.md', ses).scheme).toBe('abcdeffaebdccfdabeecbfaddeacfbbdfecaeca');
    expect(flat).toContain('`abcdef faebdc cfdabe ecbfad deacfb bdfeca eca`');
    const src = ses.split('\n');
    const line = (n: number) => src[n - 1]!;
    expect(line(19).endsWith('the door')).toBe(true);
    expect(line(20).endsWith('the light')).toBe(true);
    const swapped = src.map((l, i) => (i === 18 ? l.replace(/door$/, 'light') : i === 19 ? l.replace(/light$/, 'door') : l));
    const two = lintSource('swap.md', swapped.join('\n'));
    expect(two.warnings.map(f => f.rule)).toEqual(['verse.form.end-words', 'verse.form.end-words']);
    expect(two.warnings[0]!.message).toMatch(/^Line 19 ends "light", but stanza 3 should end this line with "door"/);
    expect(line(46)).toBe('I leave the door unlocked. I run the water.');
    const tap = lintSource('tap.md', src.map((l, i) => (i === 45 ? 'I leave the door unlocked. I run the tap.' : l)).join('\n'));
    expect(tap.warnings.map(f => f.rule)).toEqual(['verse.form.end-words']);
    expect(tap.warnings[0]!.message).toMatch(/missing "water"/);
  });

  it('states the sestina rotation as the plugin stores it, and the rule for rebuilding it', () => {
    const rows = getForm('sestina').verse!.endWordRotation!;
    expect(rows.map(r => r.map(n => 'ABCDEF'[n]).join(''))).toEqual(['ABCDEF', 'FAEBDC', 'CFDABE', 'ECBFAD', 'DEACFB', 'BDFECA']);
    for (let i = 1; i < rows.length; i++) expect(rows[i], `row ${i + 1}`).toEqual([5, 0, 4, 1, 3, 2].map(k => rows[i - 1]![k]));
    for (const row of ['1 ABCDEF', '2 FAEBDC', '3 CFDABE', '4 ECBFAD', '5 DEACFB', '6 BDFECA']) expect(flat).toContain(row);
    expect(flat).toContain('read in the order 6, 1, 5, 2, 4, 3');
  });

  it('lists the rhyme classes with the pairs it measured', () => {
    const cls = (a: string, b: string) => rhymeClass(pronounce(a), pronounce(b));
    expect(cls('light', 'light').class).toBe('identity');
    expect(cls('night', 'light').class).toBe('perfect');
    expect(cls('day', 'late').class).toBe('assonance');
    expect(cls('young', 'long').class).toBe('consonance');
    expect(cls('love', 'move').class).toBe('eye');
    expect(cls('cat', 'dog').class).toBe('none');
    expect(cls('wind', 'sinned')).toEqual({ class: 'perfect', uncertain: true });
    for (const row of ['| `identity` |', '| `perfect` |', '| `assonance` |', '| `consonance` |', '| `eye` |', '| `none` |', 'light / light', 'night / light', 'day / late', 'young / long', 'love / move', 'cat / dog']) expect(body, row).toContain(row);
  });

  it('measures Sonnet 18, an eight-syllable draft, the trust tags and the target as the text says', async () => {
    const s18 = lint(loadDocument(fixture('verse/sonnet18.md')));
    expect(s18.errors).toEqual([]);
    expect(s18.warnings).toEqual([]);
    expect(s18.info).toHaveLength(6);
    const messages = s18.info.map(f => f.message).join(' | ');
    expect(messages).toMatch(/"temperate" and "date"\): not a perfect rhyme in the dictionary; may be an eye rhyme or a historical pronunciation/);
    expect(messages).toMatch(/dimm'd \(line 12\), untrimm'd \(line 14\), ow'st \(line 17\), wander'st \(line 18\), grow'st \(line 19\)/);
    expect(flat).toContain('six info findings');

    const short = lint(loadDocument(fixture('verse/petrarchan-clean.md')));
    expect(all(short)).toEqual([]);
    expect(measure(loadDocument(fixture('verse/petrarchan-clean.md'))).verse!.lines.every(l => l.syllables === 8)).toBe(true);
    expect(measure(loadDocument(fixture('verse/petrarchan-clean.md'))).verse!.lines).toHaveLength(14);

    const out = await run('pronounce', 'hummed', 'teakettles');
    expect(out.words.map((w: any) => [w.word, w.source])).toEqual([['hummed', 'affix'], ['teakettles', 'guessed']]);
    expect(pronounce('temperate').syllablesAlt).toBe(3);

    const fv = find('free-verse', 'porch roof');
    const target = lintSource('target.md', withFront('form: free-verse\ntarget: 100 words', fv));
    expect(target.warnings.map(f => f.message)).toEqual(['Runs 46 words against a 100-word target (-54%); add about 54 words']);
    expect(flat).toContain('"Runs 46 words against a 100-word target (-54%)"');
    const m = measure(loadDocument(write('fv.md', fv)));
    expect(m.spoken).toBeNull();
    expect(m.verse!.lines[0]!.line).toBe(4);
  });

  it('describes the engine as it behaves: line endings, meter and guessed words', () => {
    const v = measureSource('ends.md', '---\nform: free-verse\n---\nOne, two,\nthree four\nfive six.\n');
    expect(v.lines.map(l => l.ending)).toEqual(['weak', 'run-on', 'stop']);
    const meter = measureSource('meter.md', find('limerick', 'curator'));
    expect(meter.meter).not.toBeNull();
    expect(getForm('limerick').verse!.feetPerLine).toEqual([3, 3, 2, 2, 3]);
    expect(getForm('sonnet-petrarchan').verse!.schemes).toContain('abbaabbacdcdcd');
    expect(getForm('haiku').verse!.soft).toBe(true);
    const markup = lintSource('markup.md', '---\nform: free-verse\n---\n- a dash line\nplain line\n');
    expect(markup.warnings.map(f => f.rule)).toEqual(['verse.format.markup']);
    const sections = measureSource('labels.md', '---\nform: free-verse\n---\nChorus\nA line here\n');
    expect(sections.lines).toHaveLength(2);
  });

  it('covers the subjects the owner asked for', () => {
    for (const needle of ['enjambment', 'caesura', 'volta', 'refrain', 'envoi', 'kigo', 'kireji', 'on)', 'eye rhyme', 'identity', 'assonance', 'consonance', 'feminine ending', 'advisory', 'guessed', 'affix', 'prose scan', 'prose pronounce', 'prose lint', 'prose measure', 'variant set', 'prose-poetry', 'form as constraint', 'syllables: 8.6.8.6', 'Maintainer judgement:', 'Convention:', 'Measured here:']) {
      expect(flat.toLowerCase(), needle).toContain(needle.toLowerCase());
    }
  });

  it('keeps the weak evidence labelled as the sources allow', () => {
    expect(flat).toContain('That does not show that rhyme makes a poem better');
    expect(flat).not.toMatch(/(?<!not show that )rhyme (makes|improves) (a )?poems? (better|good)/i);
    expect(flat).toMatch(/abstracts? only|read as abstracts|abstract read/);
    expect(flat).toMatch(/English slant rhyme is untested/);
    expect(flat).toMatch(/not plain-lookup accuracy/);
    expect(flat).not.toMatch(/95\.1% (accurate|accuracy of CMUdict)/);
    expect(flat).toMatch(/Identity and eye rhyme are not defined by any source held for this guide/);
    expect(flat).toMatch(/4-3-4-3 is the common textbook shape, not a rule/);
    expect(flat).toMatch(/No source covers revising a poem/);
    expect(flat).toMatch(/one practitioner/);
    expect(flat).toMatch(/no Japanese-side source/);
    expect(flat).toMatch(/is not used here/);
    expect(flat).not.toContain('Because I could not stop');
    expect(body.replace(/https?:\/\/\S+/g, '')).not.toMatch(/\bwiki\b/i);
  });

  it('is packaged with its reference fragment, and the poetry skill points at it', () => {
    const files = describeSource(root).files as string[];
    for (const f of ['craft/guides/verse.md', 'craft/guides/verse.refs.json']) expect(files, f).toContain(f);
    expect(existsSync(join(GUIDES_DIR, 'verse.refs.json'))).toBe(true);
    const text = readFileSync(join(root, 'skills', 'prose-poetry', 'SKILL.md'), 'utf8');
    expect(text).toContain('prose guide verse --text --section <name>');
  });
});
