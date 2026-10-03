import { describe, expect, it } from 'vitest';
import { analyseLine } from '../src/verse/prosody.ts';

describe('analyseLine', () => {
  it('counts syllables and stress, making monosyllables flexible', () => {
    const a = analyseLine('Shall I compare thee to a summer’s day?');
    expect(a.syllables).toBe(10);
    expect(a.stress).toBe('??01???10?');
    expect(a.words).toHaveLength(8);
    expect(a.endWord?.word).toBe('day');
    expect(a.ending).toBe('stop');
  });

  it('keeps dictionary stress for polysyllables and ? for monosyllables', () => {
    const a = analyseLine('the garden');
    expect(a.stress).toBe('?10');
  });

  it('classifies endings and ignores closing quotes and brackets', () => {
    expect(analyseLine('stop here.').ending).toBe('stop');
    expect(analyseLine('what now?').ending).toBe('stop');
    expect(analyseLine('wait;').ending).toBe('stop');
    expect(analyseLine('wait…').ending).toBe('stop');
    expect(analyseLine('and then,').ending).toBe('weak');
    expect(analyseLine('and then —').ending).toBe('weak');
    expect(analyseLine('and then –').ending).toBe('weak');
    expect(analyseLine('and then-').ending).toBe('weak');
    expect(analyseLine('she said “go.”').ending).toBe('stop');
    expect(analyseLine('(and then,)').ending).toBe('weak');
    expect(analyseLine('and the').ending).toBe('run-on');
  });

  it('returns zeros for empty or punctuation-only text', () => {
    for (const t of ['', '   ', '— …']) {
      const a = analyseLine(t);
      expect(a).toMatchObject({ syllables: 0, stress: '', words: [], endWord: null, ending: 'run-on', guessed: [], ambiguous: [] });
    }
  });

  it('lists guessed words, numerals included', () => {
    const a = analyseLine('in 1999 the zzxqv came');
    expect(a.guessed).toContain('1999');
    expect(a.guessed).toContain('zzxqv');
    expect(a.stress).toContain('?');
  });

  it('lists an end word whose variants rhyme differently, and a syllablesAlt total when counts differ', () => {
    const a = analyseLine('the wind in the wind');
    expect(a.ambiguous).toEqual(['wind']);
    expect(a.syllablesAlt).toBeUndefined(); // both wind variants have one syllable
  });

  it('does not flag function words whose variants only differ in vowel quality', () => {
    expect(analyseLine('the road to the sea').ambiguous).toEqual([]);
    expect(analyseLine('a hand on the door').ambiguous).toEqual([]);
  });

  it('flags rhyme-key disagreement only on the end word', () => {
    expect(analyseLine('the wind is cold').ambiguous).toEqual([]);
    expect(analyseLine('a cold wind').ambiguous).toEqual(['wind']);
  });

  it('flags a syllable-count disagreement on any word', () => {
    const a = analyseLine('every day');
    expect(a.ambiguous).toEqual(['every']);
    expect([a.syllables, a.syllablesAlt]).toEqual([4, 3]); // EH1 V ER0 IY0 / EH1 V R IY0, then day
  });

  it('sums the alternative count of each word in syllablesAlt', () => {
    const a = analyseLine('a natural thing');
    expect([a.syllables, a.syllablesAlt]).toEqual([5, 4]);
    expect(a.ambiguous).toEqual(['natural']);
  });

  it('keeps a hyphenated word together and lets pronounce() handle it', () => {
    const a = analyseLine('my mother-in-law');
    expect(a.words.map(w => w.word)).toEqual(['my', 'mother-in-law']);
    expect(a.stress).toBe('?1002');
    expect(a.syllables).toBe(5);
    expect(analyseLine('well-known').words.map(w => w.word)).toEqual(['well-known']);
  });

  it('splits at an em or en dash, which is not a hyphen', () => {
    expect(analyseLine('the sea—and the sky').words.map(w => w.word)).toEqual(['the', 'sea', 'and', 'the', 'sky']);
    expect(analyseLine('mother – in – law').words.map(w => w.word)).toEqual(['mother', 'in', 'law']);
    expect(analyseLine('stay — go').words.map(w => w.word)).toEqual(['stay', 'go']);
  });

  it("keeps a trailing in' so the lyric form reaches pronounce()", () => {
    const a = analyseLine("dancin' in the street");
    expect(a.words[0]).toMatchObject({ word: "dancin'", source: 'affix', syllables: 2 });
    expect(a.words.map(w => w.word)).toEqual(["dancin'", 'in', 'the', 'street']);
    expect(analyseLine("it's the end").words.map(w => w.word)).toEqual(["it's", 'the', 'end']);
  });
});
