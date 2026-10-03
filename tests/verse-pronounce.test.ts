import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { loadCmudict } from '../src/verse/cmudict.ts';
import { pronounce, pronounceWith } from '../src/verse/pronounce.ts';

const dict = loadCmudict();
const vowels = (phones: string[]) => phones.filter(p => /\d$/.test(p)).length;
/** The real dictionary with some entries removed, so the affix rules are reached by common words. */
const without = (...words: string[]) => {
  const d = new Map(dict);
  for (const w of words) d.delete(w);
  return d;
};
/** Affix pronunciation of `word`: its own entry (and the apostrophe-less form) removed, the stem left in. */
const affixOf = (word: string) => pronounceWith(without(word, word.replaceAll("'", '')), word);
const ph = (p: { phones: string[] }) => p.phones.join(' ');
const small = (entries: Record<string, string[][]>) => new Map(Object.entries(entries));

describe('dictionary words', () => {
  it('love and dove share a rhymeKey; move does not', () => {
    expect(pronounce('love').rhymeKey).toBe('AH V');
    expect(pronounce('dove').rhymeKey).toBe(pronounce('love').rhymeKey);
    expect(pronounce('dove').variantKeys).toContain(pronounce('love').rhymeKey);
    expect(pronounce('move').rhymeKey).not.toBe(pronounce('love').rhymeKey);
  });

  it('monosyllables keep the dictionary stress', () => {
    expect(pronounce('love')).toMatchObject({ source: 'dict', syllables: 1, stress: '1', variants: 1, phones: ['L', 'AH1', 'V'] });
    expect(pronounce('thou')).toMatchObject({ syllables: 1, stress: '1' });
  });

  it('fire and hour follow the dictionary first variant', () => {
    for (const w of ['fire', 'hour']) expect(pronounce(w).syllables).toBe(vowels(dict.get(w)![0]));
  });

  it('multi-syllable stress and rhymeKey', () => {
    expect(pronounce('wanted').stress).toBe('10');
    expect(pronounce('hello').stress).toBe('01');
    expect(pronounce('hello').rhymeKey).toBe('OW');
  });

  it('read, lead and wind are heteronyms', () => {
    for (const w of ['read', 'lead', 'wind']) {
      const p = pronounce(w);
      expect(p.variants).toBeGreaterThan(1);
      expect(p.variantKeys).toHaveLength(p.variants);
    }
    expect(pronounce('wind').phones).toEqual(dict.get('wind')![0]);
    expect(new Set(pronounce('wind').variantKeys).size).toBe(2);
  });

  it('flags a syllable-count disagreement between variants', () => {
    const p = pronounce('temperate');
    expect(p.syllables).toBe(vowels(dict.get('temperate')![0]));
    expect(p.syllablesAlt).toBe(vowels(dict.get('temperate')![1]));
    expect(p.syllables).not.toBe(p.syllablesAlt);
    expect(pronounce('love').syllablesAlt).toBeUndefined();
  });
});

describe('normalisation', () => {
  it('lowercases, straightens apostrophes and strips outer punctuation', () => {
    expect(pronounce('THOU').word).toBe('thou');
    expect(pronounce('"Thou,"').phones).toEqual(pronounce('thou').phones);
    const s = pronounce('Summer’s');
    expect(s.word).toBe("summer's");
    expect(s.syllables).toBe(2);
  });

  it('returns an empty guess for empty or punctuation-only input', () => {
    for (const w of ['', '   ', '...', '—']) {
      expect(pronounce(w)).toMatchObject({ word: '', source: 'guessed', phones: [], syllables: 0, stress: '', rhymeKey: '', variants: 1 });
    }
  });
});

describe('hyphenated words', () => {
  it('adds syllables, concatenates phones and stress, keys on the last part', () => {
    const p = pronounce('well-known');
    const a = pronounce('well');
    const b = pronounce('known');
    expect(p.syllables).toBe(a.syllables + b.syllables);
    expect(p.phones).toEqual([...a.phones, ...b.phones]);
    expect(p.stress).toBe(a.stress + b.stress);
    expect(p.rhymeKey).toBe(b.rhymeKey);
    expect(p.source).toBe('dict');
  });

  it('takes the weakest source of the parts', () => {
    const p = pronounce('love-glorpish');
    expect(p.source).toBe('guessed');
    expect(p.stress).toBe('1' + '?'.repeat(pronounce('glorpish').syllables));
    expect(p.rhymeKey).toBe('ish');
    expect(pronounce('slumbers-love').source).toBe('affix');
  });

  it('uses the whole-word entry when the dictionary has one', () => {
    expect(pronounce('mother-in-law')).toMatchObject({ source: 'dict', syllables: 4, stress: '1002' });
  });
});

describe('affix rule', () => {
  // [word, stem, suffix phones]; each word is removed from the dictionary first, so none of these can pass vacuously
  const cases: [string, string, string[]][] = [
    ['slumbers', 'slumber', ['Z']],
    ['coursers', 'courser', ['Z']],
    ["courser's", 'courser', ['Z']],
    ['abacks', 'aback', ['S']],
    ['aarhuses', 'aarhus', ['IH0', 'Z']],
    ['slumbered', 'slumber', ['D']],
    ['abacked', 'aback', ['T']],
    ['abaded', 'abad', ['IH0', 'D']],
    ['abaloning', 'abalone', ['IH0', 'NG']],
    ['aalenning', 'aalen', ['IH0', 'NG']],
    ['slumberly', 'slumber', ['L', 'IY0']],
  ];
  for (const [word, stem, suffix] of cases) {
    it(`${word} = ${stem} + ${suffix.join(' ')}`, () => {
      const p = affixOf(word);
      expect(p.source).toBe('affix');
      expect(p.phones).toEqual([...dict.get(stem)![0], ...suffix]);
      expect(p.syllables).toBe(vowels(p.phones));
      expect(p.stress).toHaveLength(p.syllables);
      expect(p.variants).toBe(dict.get(stem)!.length);
      expect(p.variantKeys).toHaveLength(p.variants);
    });
  }

  it('common inflections reached through the affix rule give the right syllable count', () => {
    const expected: Record<string, number> = { wanted: 2, walked: 1, kisses: 2, dogs: 1, "dog's": 1, making: 2, stopping: 2, quickly: 2 };
    for (const [w, n] of Object.entries(expected)) {
      const p = affixOf(w);
      expect(p.source, w).toBe('affix');
      expect(p.syllables, w).toBe(n);
    }
  });

  it('never uses the affix rule when the whole word is in the dictionary', () => {
    expect(dict.has('walked')).toBe(true);
    expect(pronounce('walked')).toMatchObject({ source: 'dict', phones: dict.get('walked')![0] });
  });

  describe('-s and -es', () => {
    it('strips only the s from a stem that is not sibilant: faces = face + IH Z, two syllables', () => {
      const p = affixOf('faces');
      expect(p).toMatchObject({ source: 'affix', syllables: 2, stress: '10' });
      expect(ph(p)).toContain('F EY1 S IH0 Z');
    });
    it('lobes = lobe + Z', () => expect(ph(affixOf('lobes'))).toBe('L OW1 B Z'));
    it('strips es from a sibilant stem: boxes, wishes, churches, kisses', () => {
      expect(ph(affixOf('boxes'))).toBe('B AA1 K S IH0 Z');
      expect(ph(affixOf('wishes'))).toBe('W IH1 SH IH0 Z');
      expect(ph(affixOf('churches'))).toBe('CH ER1 CH IH0 Z');
      expect(affixOf('kisses').syllables).toBe(2);
    });
    it('strips es after o: heroes = hero + Z', () => expect(ph(affixOf('heroes'))).toContain('HH IH1 R OW0 Z'));
    it('falls back to the s-only stem when the sibilant stem is not a word: houses = house + IH Z', () => {
      const d = small({ house: [['HH', 'AW1', 'S']] });
      expect(ph(pronounceWith(d, 'houses'))).toBe('HH AW1 S IH0 Z');
    });
    it('y stems: cries = cry + Z', () => expect(ph(affixOf('cries'))).toBe('K R AY1 Z'));
  });

  describe('-ed', () => {
    it('adds T after the voiceless CH and SH: watched, pushed, wished, couched', () => {
      expect(ph(affixOf('watched'))).toContain('W AA1 CH T');
      expect(ph(affixOf('pushed'))).toBe('P UH1 SH T');
      expect(ph(affixOf('wished'))).toBe('W IH1 SH T');
      expect(ph(affixOf('couched'))).toBe('K AW1 CH T');
    });
    it('voiced stems add D, T and D stems add IH D', () => {
      expect(ph(affixOf('loved'))).toBe('L AH1 V D');
      expect(ph(affixOf('wanted'))).toBe(`${dict.get('want')![0].join(' ')} IH0 D`);
    });
    it('ied: carried = carry + D', () => expect(ph(affixOf('carried'))).toContain('K AE1 R IY0 D'));
  });

  describe('silent e and doubled consonants', () => {
    it('prefers stem+e for a single final consonant: hoping, taped, riding, hating', () => {
      expect(ph(affixOf('hoping'))).toBe('HH OW1 P IH0 NG');
      expect(ph(affixOf('taped'))).toBe('T EY1 P T');
      expect(ph(affixOf('riding'))).toBe('R AY1 D IH0 NG');
      expect(ph(affixOf('hating'))).toBe('HH EY1 T IH0 NG');
    });
    it('undoubles doubled consonants: hopping = hop, tapped = tap', () => {
      expect(ph(affixOf('hopping'))).toBe('HH AA1 P IH0 NG');
      expect(ph(affixOf('tapped'))).toBe('T AE1 P T');
    });
    it('takes the bare stem when stem+e is not a word: visiting', () => {
      const d = small({ visit: [['V', 'IH1', 'Z', 'AH0', 'T']] });
      expect(ph(pronounceWith(d, 'visiting'))).toBe('V IH1 Z AH0 T IH0 NG');
    });
    it('-er and -est use the same stem search: wider, widest', () => {
      expect(ph(affixOf('wider'))).toBe('W AY1 D ER0');
      expect(ph(affixOf('widest'))).toBe('W AY1 D IH0 S T');
    });
  });

  describe('-ly', () => {
    it('does not double the L: beautifully = beautiful + IY', () => {
      const p = affixOf('beautifully');
      expect(ph(p)).toBe('B Y UW1 T AH0 F AH0 L IY0');
      expect(p.syllables).toBe(4);
    });
    it('fully = full + IY (the spelling drops one l)', () => expect(ph(affixOf('fully'))).toBe('F UH1 L IY0'));
    it('ily: happily = happy with IY replaced by IH L IY', () => expect(ph(affixOf('happily'))).toBe('HH AE1 P IH0 L IY0'));
    it('ically: basically = basic + L IY', () => expect(ph(affixOf('basically'))).toBe('B EY1 S IH0 K L IY0'));
    it('quickly = quick + L IY', () => expect(ph(affixOf('quickly'))).toBe(`${dict.get('quick')![0].join(' ')} L IY0`));
  });

  it('carries a heteronym stem through: syllablesAlt, variants and variantKeys', () => {
    const natural = [['N', 'AE1', 'CH', 'ER0', 'AH0', 'L'], ['N', 'AE1', 'CH', 'R', 'AH0', 'L']];
    const p = pronounceWith(small({ natural }), 'naturals');
    expect(p).toMatchObject({ source: 'affix', syllables: 3, syllablesAlt: 2, variants: 2 });
    expect(p.phones).toEqual(['N', 'AE1', 'CH', 'ER0', 'AH0', 'L', 'Z']);
    expect(p.variantKeys).toEqual(['AE CH ER AH L Z', 'AE CH R AH L Z']);
    expect(pronounceWith(small({ wind: dict.get('wind')! }), 'winds').variantKeys).toEqual(['AY N D Z', 'IH N D Z']);
  });

  it('has no rule for -eth: stoppeth is guessed', () => {
    expect(dict.has('stoppeth')).toBe(false);
    const p = pronounce('stoppeth');
    expect(p.source).toBe('guessed');
    expect(p.phones).toEqual([]);
  });
});

describe('lyric and poetic forms', () => {
  it("dancin' = dancing with the final NG as N", () => {
    const p = pronounce("dancin'");
    expect(p).toMatchObject({ word: "dancin'", source: 'affix', syllables: 2 });
    expect(ph(p)).toBe('D AE1 N S IH0 N');
    expect(p.rhymeKey).toBe('AE N S IH N');
  });
  it('walkin’ with a curly apostrophe and surrounding punctuation', () => {
    const p = pronounce('“Walkin’,”');
    expect(p).toMatchObject({ source: 'affix', syllables: 2 });
    expect(ph(p)).toBe('W AO1 K IH0 N');
  });
  it("leaves in' alone when the ing form is not a word, and plain -ing words untouched", () => {
    expect(pronounce("glorpin'").source).toBe('guessed');
    expect(pronounce('dancing').phones.at(-1)).toBe('NG');
  });
  it("o'er = ore, e'er = air", () => {
    expect(pronounce("o'er")).toMatchObject({ word: "o'er", source: 'affix', syllables: 1, phones: ['AO1', 'R'], rhymeKey: 'AO R' });
    expect(pronounce('o’er').phones).toEqual(['AO1', 'R']);
    expect(pronounce("e'er")).toMatchObject({ source: 'affix', syllables: 1, phones: ['EH1', 'R'] });
  });
});

describe('guessed words', () => {
  it('uses the heuristic count, ? stress and a letters rhymeKey', () => {
    expect(pronounce('glorpish')).toMatchObject({ source: 'guessed', phones: [], syllables: 2, stress: '??', variants: 1, rhymeKey: 'ish', variantKeys: ['ish'] });
  });

  it("guesses ow'st", () => {
    const p = pronounce("ow'st");
    expect(p.source).toBe('guessed');
    expect(p.syllables).toBeGreaterThan(0);
    expect(p.stress).toBe('?'.repeat(p.syllables));
  });

  it('drops a silent final e from the letters key', () => {
    expect(pronounce('glorpe').rhymeKey).toBe('orp');
    expect(pronounce('flimsaboove').rhymeKey).toBe('oov');
  });
});

describe('laziness', () => {
  it('does not load the dictionary until the first pronounce() call', () => {
    const script = `
      const c = await import('./src/verse/cmudict.ts');
      const p = await import('./src/verse/pronounce.ts');
      const before = c.cmudictLoads;
      p.pronounce('love'); p.pronounce('thou');
      console.log(before, c.cmudictLoads);`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: import.meta.dirname + '/..', encoding: 'utf8' });
    expect(out.trim()).toBe('0 1');
  });
});
