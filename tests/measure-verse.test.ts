import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDocument } from '../src/document.ts';
import { measure } from '../src/measure/index.ts';
import { syllableFit, syllableRange } from '../src/measure/verse.ts';
import type { Doc } from '../src/ir.ts';
import { fixture } from './helpers.ts';

const verse = (name: string, patch: (d: Doc) => Doc = d => d) => measure(patch(loadDocument(fixture(`verse/${name}`)))).verse!;

describe('measure verse: a sonnet', () => {
  const v = verse('sonnet18.md');

  it('finds 14 lines in four stanzas under the heading', () => {
    expect(v.kind).toBe('poem');
    expect(v.count).toEqual({ lines: 14, stanzas: 4 });
    expect(v.stanzas.map(s => [s.section, s.start, s.count])).toEqual([['Sonnet 18', 0, 4], ['Sonnet 18', 4, 4], ['Sonnet 18', 8, 4], ['Sonnet 18', 12, 2]]);
    expect(v.lines[0]).toMatchObject({ text: "Shall I compare thee to a summer's day?", stanza: 0, section: 'Sonnet 18', syllables: 10, endWord: 'day', ending: 'stop' });
    expect(v.dialect).toBe('US English');
    expect(v.lyric).toBeNull();
  });

  it('records per-line syllables and the syllable summary', () => {
    expect(v.lines.map(l => l.syllables)).toEqual([10, 9, 10, 10, 10, 10, 11, 10, 10, 10, 10, 10, 10, 10]);
    expect(v.syllables).toEqual({ mean: 10, sd: 0.38, min: 9, max: 11 });
  });

  it('pins the scheme; temperate/date is an eye rhyme the dictionary rejects', () => {
    // Line 2 ends "temperate" and line 4 "date": a rhyme in Shakespeare's English but not in the dictionary's. It is
    // only an eye rhyme here and never counts for the scheme, so "date" opens a new letter (c) instead of closing
    // b, and every later letter shifts: the form's ababcdcdefefgg reads abacdedefgfghh. Sonnet 18's other lines
    // that end in words the dictionary lacks (dimm'd, untrimm'd, ow'st, grow'st) rhyme only by a guessed key.
    expect(v.scheme).toBe('abacdedefgfghh');
    expect(v.nearScheme).toBe('abaacdcdaeaeff');
    expect(v.pairs.some(p => p.a === 1 && p.b === 3 && p.class === 'eye')).toBe(true);
  });

  it('checks meter against the form and skips guessed lines', () => {
    expect(v.meter).not.toBeNull();
    expect(v.meter!).toHaveLength(14);
    expect(v.meter!.filter(m => m.skipped).map(m => m.line)).toEqual([5, 7, 9, 10, 11]);
    expect(v.meter![0]).toEqual({ line: 0, syllables: 10, expected: 10, deviations: [] });
    // line 1 ("temperate", 2 or 3 syllables) is read with the variant that fits
    expect(v.meter![1]).toEqual({ line: 1, syllables: 9, expected: 10, deviations: [9] });
    expect(v.lines.filter(l => l.syllablesAlt !== undefined).map(l => l.line)).toEqual([7, 13]);
  });

  it('counts words by pronunciation source', () => {
    const t = v.trust;
    expect(t.dict + t.affix + t.guessed).toBe(t.words);
    expect(t.words).toBe(114);
    expect(t.guessed).toBe(5);
  });
});

describe('measure verse: free verse', () => {
  const v = verse('free-verse.md');
  it('summarises syllables and endings', () => {
    expect(v.meter).toBeNull();
    expect(v.count).toEqual({ lines: 7, stanzas: 2 });
    expect(v.lines.map(l => l.syllables)).toEqual([7, 3, 5, 7, 5, 4, 8]);
    expect(v.syllables).toEqual({ mean: 5.57, sd: 1.68, min: 3, max: 8 });
    expect(v.lines.map(l => l.ending)).toEqual(['run-on', 'run-on', 'run-on', 'run-on', 'run-on', 'stop', 'stop']);
  });
  it('gives every line its own letter', () => {
    expect(v.scheme).toBe('abcdefg');
    // only slant pairs (stove/holds, stove/holds, glass/laughing), none that count for the scheme
    expect(v.pairs.map(p => [p.a, p.b, p.class])).toEqual([[1, 2, 'assonance'], [5, 6, 'assonance']]);
    expect(v.nearScheme).toBe('abbcdee');
    expect(v.repeats).toEqual([]);
  });
});

describe('measure verse: repeats and markup', () => {
  const doc = (text: string): Doc => ({ path: 'x.md', format: 'markdown', form: 'free-verse', meta: {}, blocks: [{ kind: 'paragraph', text, line: 3 }] });
  it('reports exactly repeated lines with source line numbers', () => {
    const v = measure(doc('Rain on the roof,\nand nothing to say;\nrain on the roof!\nOne more day.')).verse!;
    expect(v.repeats).toEqual([{ text: 'rain on the roof', lines: [3, 5] }]);
    expect(v.scheme).toBe('abab'); // roof/roof is an identity rhyme, and day/say close the other pair
  });
  it('reports a verse line the parser swallowed as markup', () => {
    const v = measure(doc('A line of verse\nstill a line')).verse!;
    expect(v.markup).toEqual([]);
    const d = loadDocument(fixture('verse/free-verse.md'));
    const v2 = measure({ ...d, blocks: [...d.blocks, { kind: 'list-item', text: 'a dash line', line: 20 }] }).verse!;
    expect(v2.markup).toEqual([{ line: 20, kind: 'list-item' }]);
    expect(v2.count.lines).toBe(8);
  });
  it('gives a line with no words no end word and a blank rhyme letter', () => {
    const v = measure(doc('...\nreal words')).verse!;
    expect(v.lines[0]).toMatchObject({ endWord: null, rhyme: '-' });
  });
});

describe('measure verse: a song', () => {
  const v = verse('song.md');
  it('lists sections with their lines and syllables', () => {
    expect(v.kind).toBe('lyric');
    const l = v.lyric!;
    expect(l.sections.map(s => [s.label, s.base, s.occurrence, s.lines])).toEqual([
      ['Verse 1', 'verse', 1, [0, 1, 2]], ['Chorus', 'chorus', 1, [3, 4, 5]],
      ['Verse 2', 'verse', 2, [6, 7, 8]], ['Chorus', 'chorus', 2, [9, 10, 11]],
    ]);
    expect(l.sections[0]!.syllables).toEqual(v.lines.slice(0, 3).map(x => x.syllables));
  });
  it('finds the second chorus differing from the first by one line', () => {
    const l = v.lyric!;
    expect(l.refrains).toEqual([{ base: 'chorus', consistent: false, differs: [{ occurrence: 2, line: 10 }] }]);
  });
  it('compares like sections by syllables only', () => {
    const l = v.lyric!;
    expect(l.likeSections).toHaveLength(1);
    expect(l.likeSections[0]).toMatchObject({ base: 'verse', a: 1, b: 2 });
    expect(l.likeSections[0]!.diffs).toHaveLength(3);
    expect(l.likeSections[0]!.max).toBe(Math.max(...l.likeSections[0]!.diffs.map(Math.abs)));
  });
  it('computes syllables per beat only with a valid tempo', () => {
    expect(v.lyric!.syllablesPerBeat).toBeNull();
    const withTempo = verse('song.md', d => ({ ...d, meta: { ...d.meta, tempo: 120, beatsPerLine: 4 } })).lyric!.syllablesPerBeat!;
    expect(withTempo.tempo).toBe(120);
    expect(withTempo.beatsPerLine).toBe(4);
    expect(withTempo.perLine).toHaveLength(12);
    expect(withTempo.perLine[0]).toBe(Math.round((v.lines[0]!.syllables / 4) * 100) / 100);
    const dflt = verse('song.md', d => ({ ...d, meta: { ...d.meta, tempo: 90 } })).lyric!.syllablesPerBeat!;
    expect(dflt.beatsPerLine).toBe(4);
    for (const bad of [{ tempo: -1 }, { tempo: 'fast' }, { tempo: 120, beatsPerLine: 2.5 }, { beatsPerLine: 4 }]) {
      expect(verse('song.md', d => ({ ...d, meta: { ...d.meta, ...bad } })).lyric!.syllablesPerBeat).toBeNull();
    }
  });
});

describe('measure verse: other forms and laziness', () => {
  it('is null for a prose form', () => {
    expect(measure(loadDocument(fixture('keynote.md'))).verse).toBeNull();
  });

  const probe = (path: string, form: string) => {
    const src = pathToFileURL(join(import.meta.dirname, '..', 'src')).href;
    const code = `
      import { loadDocument } from '${src}/document.ts';
      import { measure } from '${src}/measure/index.ts';
      import * as dict from '${src}/verse/cmudict.ts';
      const before = dict.cmudictLoads;
      measure(loadDocument(${JSON.stringify(path)}, { form: ${JSON.stringify(form)} }));
      console.log(JSON.stringify([before, dict.cmudictLoads]));`;
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }));
  };
  it('does not load the dictionary for a prose draft, and loads it once for a sonnet', () => {
    expect(probe(fixture('keynote.md'), 'professional')).toEqual([0, 0]);
    expect(probe(fixture('verse/sonnet18.md'), 'sonnet-shakespearean')).toEqual([0, 1]);
  });
});

describe('syllableFit and syllableRange', () => {
  it('compare a target with the whole range a line can be read as', () => {
    expect(syllableRange({ syllables: 3 })).toEqual([3, 3]);
    expect(syllableRange({ syllables: 3, syllablesAlt: 2 })).toEqual([2, 3]);
    expect(syllableFit({ syllables: 3, syllablesAlt: 2 }, 2)).toEqual({ fit: 'ok' });
    expect(syllableFit({ syllables: 3, syllablesAlt: 2 }, 3)).toEqual({ fit: 'ok' });
    expect(syllableFit({ syllables: 3, syllablesAlt: 2 }, 1)).toEqual({ fit: 'over', diff: 1 });
    expect(syllableFit({ syllables: 3, syllablesAlt: 2 }, 5)).toEqual({ fit: 'under', diff: -2 });
  });
});
