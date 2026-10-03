import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RULES } from '../src/craft/rules.ts';
import { FORMS } from '../src/forms.ts';
import { loadDocument } from '../src/document.ts';
import { measure } from '../src/measure/index.ts';
import { lint, type Finding } from '../src/lint/lint.ts';
import { fixture, run } from './helpers.ts';
import { sestina, textOf, verse, villanelle } from './verse-drafts.ts';

const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

/** Lint a draft written to its own temp directory. */
function lintText(text: string) {
  const dir = mkdtempSync(join(tmpdir(), 'prose-verse-'));
  made.push(dir);
  const file = join(dir, 'draft.md');
  writeFileSync(file, text);
  return lint(loadDocument(file));
}
const lintFixture = (name: string) => lint(loadDocument(fixture(`verse/${name}`)));
const measureOf = (name: string) => measure(loadDocument(fixture(`verse/${name}`))).verse!;

type Result = ReturnType<typeof lint>;
const all = (r: Result): Finding[] => [...r.errors, ...r.warnings, ...r.info];
const of = (r: Result, rule: string) => all(r).filter(f => f.rule === rule);
const sev = (r: Result, rule: string) => of(r, rule).map(f => f.severity);
/** The 1-based source line holding `needle` in `text`. */
const lineOf = (text: string, needle: string) => text.split('\n').findIndex(l => l.includes(needle)) + 1;

describe('verse rules in the table', () => {
  const byId = (id: string) => RULES.find(r => r.id === id)!;
  const VERSE_FORMS = FORMS.filter(f => f.verse).map(f => f.id);

  it('adds the 12 auto rules and 2 judgement rules with the spec severities', () => {
    const want: Array<[string, 'auto' | 'judgement', string]> = [
      ['verse.form.line-count', 'auto', 'warn'], ['verse.form.rhyme-scheme', 'auto', 'warn'], ['verse.form.syllables', 'auto', 'info'],
      ['verse.form.refrain', 'auto', 'warn'], ['verse.form.end-words', 'auto', 'warn'], ['verse.meter.deviation', 'auto', 'info'],
      ['verse.pronunciation.guessed', 'auto', 'info'], ['verse.pronunciation.ambiguous', 'auto', 'info'], ['verse.rhyme.every-line', 'auto', 'info'],
      ['verse.format.markup', 'auto', 'warn'], ['lyric.refrain.consistent', 'auto', 'warn'], ['lyric.sections.line-match', 'auto', 'info'],
      ['verse.line-break.purpose', 'judgement', 'info'], ['lyric.stress-on-beat', 'judgement', 'info'],
    ];
    for (const [id, check, severity] of want) expect([id, byId(id)?.check, byId(id)?.severity], id).toEqual([id, check, severity]);
  });

  it('restricts each rule to the forms it is about', () => {
    expect(byId('verse.form.line-count').forms).toEqual(['haiku', 'limerick', 'ballad', 'sonnet-shakespearean', 'sonnet-petrarchan', 'villanelle', 'sestina']);
    expect(byId('verse.form.rhyme-scheme').forms).toEqual(['limerick', 'ballad', 'sonnet-shakespearean', 'sonnet-petrarchan', 'villanelle']);
    expect(byId('verse.form.syllables').forms).toEqual(['haiku']);
    expect(byId('verse.form.refrain').forms).toEqual(['villanelle']);
    expect(byId('verse.form.end-words').forms).toEqual(['sestina']);
    expect(byId('verse.rhyme.every-line').forms).toEqual(['free-verse']);
    for (const id of ['lyric.refrain.consistent', 'lyric.sections.line-match', 'lyric.stress-on-beat']) expect(byId(id).forms, id).toEqual(['song']);
    for (const id of ['verse.pronunciation.guessed', 'verse.pronunciation.ambiguous', 'verse.format.markup', 'verse.line-break.purpose']) expect(byId(id).forms, id).toEqual(VERSE_FORMS);
  });

  it('meter.deviation covers every form that declares a meter', () => {
    const declared = FORMS.filter(f => f.verse?.meter).map(f => f.id).sort();
    expect([...(byId('verse.meter.deviation').forms as string[])].sort()).toEqual(declared);
  });

  it('marks the line-match convention derived and the haiku count as sourced', () => {
    expect(byId('lyric.sections.line-match').derived).toBe(true);
    expect(byId('verse.form.syllables').derived).toBe(false);
  });

  it('names the trade-off between counted syllables and line breaks chosen for effect, reciprocally', () => {
    expect(byId('verse.form.syllables').conflicts.map(c => c.rule)).toContain('verse.line-break.purpose');
    expect(byId('verse.line-break.purpose').conflicts.map(c => c.rule)).toContain('verse.form.syllables');
  });
});

describe('judgement rules', () => {
  it('are listed for verse forms and never evaluated', () => {
    const r = lintFixture('sonnet18.md');
    expect(r.judgement.map(j => j.rule)).toContain('verse.line-break.purpose');
    expect(r.judgement.map(j => j.rule)).not.toContain('lyric.stress-on-beat');
    expect(all(r).map(f => f.rule)).not.toContain('verse.line-break.purpose');
  });
  it('lists lyric.stress-on-beat for a song, with its sources', () => {
    const song = lintFixture('song.md');
    expect(song.judgement.find(x => x.rule === 'lyric.stress-on-beat')!.sources.length).toBeGreaterThan(0);
    expect(song.judgement.map(x => x.rule)).toContain('verse.line-break.purpose');
  });
  it('are absent from prose forms', () => {
    for (const form of ['academic', 'speech-small', 'instructions']) {
      const ids = lintText(`---\nform: ${form}\n---\nThe cat sat on the mat.\n`).judgement.map(j => j.rule);
      expect(ids.filter(id => /^(verse|lyric)\./.test(id)), form).toEqual([]);
    }
  });
});

describe('verse.form.line-count', () => {
  it('is quiet on a 14-line sonnet', () => expect(of(lintFixture('sonnet18.md'), 'verse.form.line-count')).toEqual([]));

  it('warns on a 13-line sonnet, naming expected against actual, at the last line', () => {
    const [f] = of(lintFixture('sonnet-13-lines.md'), 'verse.form.line-count');
    expect(f).toMatchObject({ severity: 'warn', at: { line: lineOf(textOf('sonnet-13-lines.md'), 'to thee') } });
    expect(f!.message).toMatch(/14 lines.*13/);
  });

  it('warns on a ballad stanza of 5 lines and stays quiet on quatrains', () => {
    expect(of(lintFixture('ballad.md'), 'verse.form.line-count')).toEqual([]);
    const text = textOf('ballad-5-line-stanza.md');
    const [f] = of(lintFixture('ballad-5-line-stanza.md'), 'verse.form.line-count');
    expect(f).toMatchObject({ severity: 'warn', at: { line: lineOf(text, 'The Bridegroom') } });
    expect(f!.message).toMatch(/Stanza 2 has 5 lines/);
    expect(f!.message).toMatch(/4/);
  });

  it('checks the villanelle (19) and the sestina (39)', () => {
    expect(of(lintText(villanelle()), 'verse.form.line-count')).toEqual([]);
    expect(of(lintText(sestina()), 'verse.form.line-count')).toEqual([]);
    expect(of(lintText(villanelle({ drop: 5 })), 'verse.form.line-count')[0]!.message).toMatch(/19 lines.*18/);
    expect(of(lintText(sestina({ drop: true })), 'verse.form.line-count')[0]!.message).toMatch(/39 lines.*38/);
  });

  it('warns on a 2-line haiku and a 2-line limerick', () => {
    expect(of(lintFixture('haiku.md'), 'verse.form.line-count')).toEqual([]);
    expect(of(lintText(verse('haiku', 'An old silent pond\nSplash! Silence again')), 'verse.form.line-count')[0]!.message).toMatch(/3 lines.*2/);
    expect(sev(lintText(verse('limerick', 'There was a young man from Peru\nWho dreamed he was eating his shoe')), 'verse.form.line-count')).toEqual(['warn']);
  });

  it('checks the villanelle stanza shape when the total is right', () => {
    const [f] = of(lintText(villanelle().replace(/\n\n/g, '\n')), 'verse.form.line-count');
    expect(f!.message).toMatch(/stanza/i);
  });
});

describe('verse.form.rhyme-scheme', () => {
  it('is quiet on drafts whose rhymes are perfect', () => {
    for (const name of ['limerick.md', 'ballad.md', 'sonnet-clean.md', 'petrarchan-clean.md']) expect(of(lintFixture(name), 'verse.form.rhyme-scheme'), name).toEqual([]);
    expect(of(lintText(villanelle()), 'verse.form.rhyme-scheme')).toEqual([]);
  });

  it('warns when a group of the limerick does not rhyme, naming lines and end words', () => {
    const [f] = of(lintFixture('limerick-no-aabba.md'), 'verse.form.rhyme-scheme');
    expect(f).toMatchObject({ severity: 'warn' });
    expect(f!.message).toMatch(/Hen/);
    expect(f!.message).toMatch(/bird/);
    expect(f!.at.line).toBe(lineOf(textOf('limerick-no-aabba.md'), 'Four Larks'));
  });

  it('warns on one ballad stanza whose second and fourth lines do not rhyme', () => {
    const text = textOf('ballad.md').replace('May\'st hear the merry din."', 'May\'st hear the music play."');
    const found = of(lintText(text), 'verse.form.rhyme-scheme');
    expect(found.map(f => f.severity)).toEqual(['warn']);
    expect(found[0]!.at.line).toBe(lineOf(text, 'music play'));
  });

  it('reports slant-only rhyme as one info listing the pair, not a warning', () => {
    const r = lintText(textOf('limerick.md').replace('a Wren', 'a Wine'));
    expect(sev(r, 'verse.form.rhyme-scheme')).toEqual(['info']);
    expect(of(r, 'verse.form.rhyme-scheme')[0]!.message).toMatch(/slant|assonance|consonance/i);
    expect(of(r, 'verse.form.rhyme-scheme')[0]!.message).toMatch(/Hen/);
  });

  it("calls Sonnet 18's temperate/date an eye rhyme or a historical pronunciation, at info", () => {
    const found = of(lintFixture('sonnet18.md'), 'verse.form.rhyme-scheme');
    expect(found.length).toBeGreaterThan(0);
    expect(found.every(f => f.severity === 'info')).toBe(true);
    const text = found.map(f => f.message).join('\n');
    expect(text).toMatch(/may be an eye rhyme or a historical pronunciation \(US English dictionary\)/);
    expect(text).toMatch(/temperate/);
  });

  it('downgrades a finding that rests on a guessed end word to info with a weaker note', () => {
    const r = lintText(textOf('limerick.md').replace('a Wren', 'a glorpish'));
    expect(sev(r, 'verse.form.rhyme-scheme')).toEqual(['info']);
    expect(of(r, 'verse.form.rhyme-scheme')[0]!.message).toMatch(/weaker: guessed or variant pronunciation/);
  });

  it('stays silent when the line count is wrong (line-count speaks)', () => {
    expect(of(lintFixture('sonnet-13-lines.md'), 'verse.form.rhyme-scheme')).toEqual([]);
    expect(of(lintFixture('ballad-5-line-stanza.md'), 'verse.form.rhyme-scheme')).toEqual([]);
  });

  it('accepts the Petrarchan sestet in either of its two shapes', () => {
    const text = textOf('petrarchan-clean.md');
    expect(of(lintText(text), 'verse.form.rhyme-scheme')).toEqual([]);
    // cdcdcd: lines 9-14 end sound, grew, found, through, ground, new
    const cdcdcd = text.slice(0, text.indexOf('The morning brought')) + [
      'The morning brought a gentle sound,', 'And somewhere in the garden grew', 'A rose that I had never found;',
      'I walked the paths the whole night through,', 'And stood, a stranger, on the ground,', 'And all the world was fresh and new.'].join('\n') + '\n';
    expect(of(lintText(cdcdcd), 'verse.form.rhyme-scheme').filter(f => f.severity === 'warn')).toEqual([]);
  });
});

describe('verse.form.syllables', () => {
  it('is quiet on a 5/7/5 haiku', () => expect(of(lintFixture('haiku.md'), 'verse.form.syllables')).toEqual([]));

  it('reports a 5/6/5 haiku as info, never higher, naming the line and counts', () => {
    const r = lintFixture('haiku-5-6-5.md');
    const [f] = of(r, 'verse.form.syllables');
    expect(r.warnings.map(w => w.rule)).not.toContain('verse.form.syllables');
    expect(f).toMatchObject({ severity: 'info', at: { line: lineOf(textOf('haiku-5-6-5.md'), 'A frog') } });
    expect(f!.message).toMatch(/6 syllables/);
    expect(f!.message).toMatch(/7/);
  });

  it('says a soft form is soft, from the form definition (form.verse.soft)', () => {
    const [f] = of(lintFixture('haiku-5-6-5.md'), 'verse.form.syllables');
    expect(f!.message).toContain('soft: contemporary practice often breaks 5/7/5');
    expect(f!.measured).toMatchObject({ soft: true });
  });

  it('accepts a target inside the range of an ambiguous line', () => {
    // "temperate" scans as 2 or 3 syllables: "Temperate frogs sit still" is 5 or 6, and 5 is the target
    expect(of(lintText(verse('haiku', 'Temperate frogs sit still\nA frog jumps into the pond\nSplash! Silence again')), 'verse.form.syllables')).toEqual([]);
  });
});

describe('verse.form.refrain', () => {
  it('is quiet when both refrains repeat verbatim (case and punctuation ignored)', () => {
    expect(of(lintText(villanelle()), 'verse.form.refrain')).toEqual([]);
    expect(of(lintText(villanelle({ refrain12: 'the light returns, along the shore!' })), 'verse.form.refrain')).toEqual([]);
  });

  it('warns on a changed refrain, at its source line, naming the refrain and the first line', () => {
    const text = villanelle({ refrain12: 'The light comes back along the shore' });
    const [f] = of(lintText(text), 'verse.form.refrain');
    expect(f).toMatchObject({ severity: 'warn', at: { line: lineOf(text, 'comes back') } });
    expect(f!.message).toMatch(/A1/);
    expect(f!.message).toMatch(/The light returns along the shore/);
  });

  it('is silent when the line count is wrong', () => expect(of(lintText(villanelle({ drop: 5 })), 'verse.form.refrain')).toEqual([]));
});

describe('verse.form.end-words', () => {
  it('is quiet on a correctly rotated sestina', () => expect(of(lintText(sestina()), 'verse.form.end-words')).toEqual([]));

  it('warns on a wrong end word, naming the line, the word found and the one expected', () => {
    const text = sestina({ swap: { line: 8, word: 'lamp' } });
    const found = of(lintText(text), 'verse.form.end-words');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'warn', at: { line: lineOf(text, 'day 2 toward the lamp') } });
    expect(found[0]!.message).toMatch(/"lamp"/);
    expect(found[0]!.message).toMatch(/"river"|"stone"|"bread"|"salt"|"door"/);
  });

  it('warns when the envoi leaves out an end word', () => {
    const found = of(lintText(sestina({ envoi: ['Between the river and the salt', 'the lamp is lit above the bread', 'the door is closed against the hill'] })), 'verse.form.end-words');
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/envoi/);
    expect(found[0]!.message).toMatch(/stone/);
  });

  it('is silent when the line count is wrong', () => expect(of(lintText(sestina({ drop: true })), 'verse.form.end-words')).toEqual([]));
});

describe('verse.meter.deviation', () => {
  // one line of a sonnet replaced by a run of trochees (stress on the first syllable of each word), iambic form
  const base = textOf('sonnet-clean.md');
  const OPENING = 'And all the gulls came down to search the night,';

  it('is quiet on a regular iambic line', () => {
    expect(of(lintText(base), 'verse.meter.deviation').filter(f => f.at.line === lineOf(base, 'I watched the sea'))).toEqual([]);
  });

  it('reports one info per deviating line with its syllable positions', () => {
    const trochaic = base.replace(OPENING, 'Mountain, river, ocean, island, tonight,');
    const found = of(lintText(trochaic), 'verse.meter.deviation');
    const hit = found.find(f => f.at.line === lineOf(trochaic, 'Mountain'));
    expect(hit, 'finding on the trochaic line').toBeDefined();
    expect(hit).toMatchObject({ severity: 'info' });
    expect(hit!.message).toMatch(/syllables? \d/);
    expect(found.every(f => f.severity === 'info')).toBe(true);
  });

  it('is silent on a line holding a guessed word', () => {
    const guessed = base.replace(OPENING, 'Glorpish blimmerton zorbling at the night,');
    expect(of(lintText(guessed), 'verse.meter.deviation').filter(f => f.at.line === lineOf(guessed, 'Glorpish'))).toEqual([]);
  });

  it('adds a summary info when more than half the lines were skipped for guessed words', () => {
    const lines = base.split('\n').map((l, i) => (i >= 5 && i < 17 && l.trim() ? `Glorpish blimmerton ${l.trim().split(' ').at(-1)}` : l));
    const found = of(lintText(lines.join('\n')), 'verse.meter.deviation');
    expect(found.some(f => /skipped/.test(f.message) && /guessed/.test(f.message))).toBe(true);
    expect(of(lintText(base), 'verse.meter.deviation').some(f => /skipped/.test(f.message))).toBe(false);
  });
});

describe('verse.pronunciation.guessed and .ambiguous', () => {
  it('guessed is quiet when every word is in the dictionary', () => {
    expect(of(lintFixture('free-verse.md'), 'verse.pronunciation.guessed')).toEqual([]);
  });

  it('guessed lists the words with their lines in one info', () => {
    const text = verse('free-verse', 'The glorpish moon\nrose over the zibbleton hills\nand glorpish light came down');
    const found = of(lintText(text), 'verse.pronunciation.guessed');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'info', at: { line: lineOf(text, 'glorpish moon') } });
    expect(found[0]!.message).toMatch(/glorpish \(lines \d+, \d+\)/);
    expect(found[0]!.message).toMatch(/zibbleton/);
    expect(found[0]!.message).toMatch(/weaker/);
  });

  it('guessed caps the list at 12 words and says how many more', () => {
    const words = Array.from({ length: 15 }, (_, i) => `zibblex${'abcdefghijklmno'[i]}ork`);
    const [f] = of(lintText(verse('free-verse', words.map(w => `the ${w} stood`).join('\n'))), 'verse.pronunciation.guessed');
    expect(f!.message).toMatch(/\+3 more/);
    expect(f!.message).toContain('zibblexlork');
    expect(f!.message).not.toContain('zibblexmork');
  });

  it('ambiguous is quiet on a poem with no variant-dependent words', () => {
    expect(of(lintFixture('free-verse.md'), 'verse.pronunciation.ambiguous')).toEqual([]);
  });

  it('ambiguous lists each such word once with its lines', () => {
    const found = of(lintFixture('sonnet18.md'), 'verse.pronunciation.ambiguous');
    const temperate = found.filter(f => /temperate/.test(f.message));
    expect(temperate).toHaveLength(1);
    expect(temperate[0]).toMatchObject({ severity: 'info' });
    expect(temperate[0]!.message).toMatch(/line \d+/);
  });
});

describe('verse.rhyme.every-line', () => {
  const rhymed = verse('free-verse', 'The cat sat down all day\nand watched the rain go away\nthe bells rang out at night\nand filled the room with light\nwe walked down to the sea\nand left the rest to me');

  it('is quiet on free verse where not every line rhymes', () => expect(of(lintFixture('free-verse.md'), 'verse.rhyme.every-line')).toEqual([]));

  it('is quiet below six lines', () => {
    expect(of(lintText(verse('free-verse', 'The cat sat down all day\nand watched the rain go away\nthe bells rang out at night\nand filled the room with light')), 'verse.rhyme.every-line')).toEqual([]);
  });

  it('notes a six-line draft where every end word rhymes, as a sameness signal and not a verdict', () => {
    const [f] = of(lintText(rhymed), 'verse.rhyme.every-line');
    expect(f).toMatchObject({ severity: 'info' });
    expect(f!.message).toMatch(/89%/);
    expect(f!.message).toMatch(/40%/);
    expect(f!.message).toMatch(/not an authorship verdict/);
    const rule = RULES.find(r => r.id === 'verse.rhyme.every-line')!;
    expect(rule.rationale).toMatch(/89%.*40%/);
    expect(rule.rationale).toMatch(/never an authorship verdict/);
  });
});

describe('verse.format.markup', () => {
  it('is quiet on plain lines', () => expect(of(lintFixture('free-verse.md'), 'verse.format.markup')).toEqual([]));

  it('warns on a line the parser read as a list item, with the fix', () => {
    const text = verse('free-verse', 'The kettle ticks as it cools\n\n- and the window holds\na small grey rain');
    const [f] = of(lintText(text), 'verse.format.markup');
    expect(f).toMatchObject({ severity: 'warn', at: { line: lineOf(text, '- and the window') } });
    expect(f!.message).toMatch(/Line \d+ was read as a list-item \(a verse line that starts like Markdown\)/);
    expect(f!.message).toMatch(/start it with a word or escape the marker/);
  });

  it('warns once per swallowed line', () => {
    expect(of(lintText(verse('free-verse', 'one\n\n- two\n\n> three')), 'verse.format.markup')).toHaveLength(2);
  });
});

describe('lyric.refrain.consistent', () => {
  it('warns when a later chorus differs, naming the first differing line', () => {
    const text = textOf('song.md');
    const [f] = of(lintText(text), 'lyric.refrain.consistent');
    expect(f).toMatchObject({ severity: 'warn', at: { line: lineOf(text, 'glows') } });
    expect(f!.message).toMatch(/Where the porch light glows/);
    expect(f!.message).toMatch(/Where the porch light burns/);
  });

  it('is quiet when the choruses match', () => {
    expect(of(lintText(textOf('song.md').replace('glows', 'burns')), 'lyric.refrain.consistent')).toEqual([]);
  });

  it('warns when a later chorus is shorter', () => {
    const text = textOf('song.md').replace('Where the porch light glows\nTake me home', 'Where the porch light burns');
    expect(of(lintText(text), 'lyric.refrain.consistent')[0]!.message).toMatch(/2 lines/);
  });
});

describe('lyric.sections.line-match', () => {
  it('is quiet when like sections stay within 2 syllables per line', () => expect(of(lintFixture('song.md'), 'lyric.sections.line-match')).toEqual([]));

  it('reports a 3-syllable difference as info', () => {
    const text = textOf('song.md').replace('Somebody called and I was there', 'Somebody called out my name across the water and I was there');
    const [f] = of(lintText(text), 'lyric.sections.line-match');
    expect(f).toMatchObject({ severity: 'info', at: { line: lineOf(text, 'Somebody called out') } });
    expect(f!.message).toMatch(/\d syllables/);
    expect(f!.message).toMatch(/Verse 2/);
  });
});

describe('verse lint end to end', () => {
  const clean: Array<[string, () => Result]> = [
    ['free-verse', () => lintFixture('free-verse.md')],
    ['haiku', () => lintFixture('haiku.md')],
    ['limerick', () => lintFixture('limerick.md')],
    ['ballad', () => lintFixture('ballad.md')],
    ['sonnet-shakespearean', () => lintFixture('sonnet-clean.md')],
    ['sonnet-petrarchan', () => lintFixture('petrarchan-clean.md')],
    ['villanelle', () => lintText(villanelle())],
    ['sestina', () => lintText(sestina())],
    ['song', () => lintText(textOf('song.md').replace('glows', 'burns'))],
  ];

  for (const [form, make] of clean) {
    it(`${form}: lints a well-formed draft with no errors or warnings and lists the judgement rules`, () => {
      const r = make();
      expect(r.form).toBe(form);
      expect(r.ok).toBe(true);
      expect(r.warnings.map(w => `${w.rule}: ${w.message}`)).toEqual([]);
      expect(r.judgement.map(j => j.rule)).toContain('verse.line-break.purpose');
    });
  }

  it('prose lint on a verse draft runs from the CLI', async () => {
    const out = await run('lint', fixture('verse/sonnet-13-lines.md'));
    expect(out.form).toBe('sonnet-shakespearean');
    expect(out.warnings.map((w: Finding) => w.rule)).toContain('verse.form.line-count');
    expect(out.judgement.map((j: { rule: string }) => j.rule)).toContain('verse.line-break.purpose');
  });
});

describe('bracket section labels', () => {
  const heading = () => lintFixture('song.md');
  const brackets = () => lintFixture('song-brackets.md');
  const shape = (r: Result) => all(r).filter(f => /^(verse|lyric|draft)\./.test(f.rule) && f.rule !== 'verse.pronunciation.guessed').map(f => [f.rule, f.severity, f.message]);

  it('make the same sections and measurements as the same song under headings', () => {
    const a = measureOf('song.md').lyric!;
    const b = measureOf('song-brackets.md').lyric!;
    expect(b.sections.map(s => [s.label, s.base, s.occurrence, s.syllables])).toEqual(a.sections.map(s => [s.label, s.base, s.occurrence, s.syllables]));
    expect(b.sections.map(s => s.label)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
    expect(measureOf('song-brackets.md').lines.map(l => l.syllables)).toEqual(measureOf('song.md').lines.map(l => l.syllables));
  });

  it('give a clean song no placeholder, guessed-line or section findings', () => {
    expect(of(brackets(), 'draft.placeholders')).toEqual([]);
    expect(of(brackets(), 'lyric.refrain.consistent')).toHaveLength(1);
    expect(shape(brackets()).map(([rule, severity, message]) => [rule, severity, String(message).replace(/line \d+/g, 'line N')]))
      .toEqual(shape(heading()).map(([rule, severity, message]) => [rule, severity, String(message).replace(/line \d+/g, 'line N')]));
  });

  it('find a changed second chorus and an overlong like-section line', () => {
    const text = textOf('song-brackets.md').replace('Somebody called and I was there', 'Somebody called out my name across the water and I was there');
    const r = lintText(text);
    expect(of(r, 'lyric.refrain.consistent')[0]).toMatchObject({ severity: 'warn', at: { line: lineOf(text, 'glows') } });
    expect(of(r, 'lyric.sections.line-match')[0]).toMatchObject({ severity: 'info', at: { line: lineOf(text, 'Somebody called out') } });
  });

  it('work in a draft that mixes headings and bracket labels', () => {
    const text = textOf('song.md').replace('## Chorus\n\nTake me home, take me home\nWhere the porch light glows', '[Chorus]\nTake me home, take me home\nWhere the porch light glows');
    const r = lintText(text);
    expect(of(r, 'lyric.refrain.consistent')).toHaveLength(1);
    expect(of(r, 'draft.placeholders')).toEqual([]);
  });
});

describe('verse.pronunciation.ambiguous only reports words that matter', () => {
  const amb = (text: string) => of(lintText(text), 'verse.pronunciation.ambiguous');
  const words = (text: string) => amb(text).map(f => (f.message.match(/"([^"]+)"/) ?? [])[1]);

  it('is quiet on everyday ambiguous words in free verse', () => {
    const text = verse('free-verse', 'I said it was fine\nand said it all again\nwe spent the hours with us\nevery morning after');
    expect(amb(text)).toEqual([]);
  });

  it('reports an ambiguous end word whose rhyme verdict depends on the reading (wind / sinned, wind / find)', () => {
    expect(words(verse('free-verse', 'He sat and thought of all he sinned\nand watched the leaves go with the wind'))).toEqual(['wind']);
    expect(words(verse('free-verse', 'She left her keys and then she left her mind\nand watched the leaves go with the wind'))).toEqual(['wind']);
  });

  it('reports an ambiguous end word that sits in a rhyme group the form expects', () => {
    // a limerick pairs lines 1, 2 and 5; "wind" ends line 2
    const text = verse('limerick', 'A fellow who loved to be kind\nWould whistle and whisper the wind\nHe walked to the shore\nAnd then he said more\nAnd all of his worries were thinned');
    expect(words(text)).toContain('wind');
  });

  it('reports a count ambiguity that decides whether a meter line fits (temperate)', () => {
    const [f] = amb(verse('sonnet-shakespearean', 'Thou art more lovely and more temperate'));
    expect(f!.message).toMatch(/"temperate"/);
    expect(f!.message).toMatch(/syllable pattern/);
  });

  it('reports a count ambiguity that decides whether a haiku line hits 5 (every)', () => {
    const found = amb(verse('haiku', 'Every leaf is old\nthe river carries it far\nwinter at the gate'));
    expect(found.map(f => f.message.match(/"([^"]+)"/)![1])).toEqual(['every']);
    expect(found[0]!.severity).toBe('info');
  });

  it('is quiet when both readings miss, or both fit, the target', () => {
    // 10 or 11 syllables both fit iambic pentameter (feminine ending)
    expect(amb(verse('sonnet-shakespearean', 'Shall I compare thee to a temperate day'))).toEqual([]);
  });
});

describe('prose-only metrics stay quiet on verse', () => {
  const ids = ['readability.grade.report', 'style.passive.report'];
  for (const name of ['song.md', 'song-brackets.md', 'free-verse.md', 'sonnet18.md', 'haiku.md']) {
    it(`${name}: no reading grade or passive count`, () => {
      const r = lintFixture(name);
      for (const id of ids) expect(of(r, id), `${name} ${id}`).toEqual([]);
    });
  }
  it('still reports them for a prose draft', () => {
    const r = lint(loadDocument(fixture('keynote.md')));
    expect(of(r, 'readability.grade.report')).toHaveLength(1);
  });
});
