import { describe, expect, it } from 'vitest';
import { checkMeter } from '../src/verse/meter.ts';
import { analyseLine } from '../src/verse/prosody.ts';

const check = (texts: string[], foot: Parameters<typeof checkMeter>[1]['foot'], feet: number) =>
  checkMeter(texts.map(analyseLine), { foot, feet });
const IAMB5 = (t: string) => check([t], 'iamb', 5)[0]!;

describe('checkMeter', () => {
  it('passes Sonnet 18 line 1 in iambic pentameter', () => {
    expect(IAMB5("Shall I compare thee to a summer's day?")).toEqual({ line: 0, syllables: 10, expected: 10, deviations: [] });
  });

  it('reads "Thou art more lovely and more temperate" with the 3-syllable variant, the one that fits', () => {
    // The first variant of "temperate" has two syllables (9 total, syllablesAlt 10). Only the alternative fits the
    // pentameter, so the positions come from its stresses: the last syllable of "temperate" (TEM-per-ate) sits in a
    // strong slot as an unstressed syllable.
    const l = analyseLine('Thou art more lovely and more temperate');
    expect([l.syllables, l.syllablesAlt]).toEqual([9, 10]);
    expect(IAMB5(l.text)).toEqual({ line: 0, syllables: 9, expected: 10, deviations: [9] });
  });

  it('reports the stress positions where a trochaic line fights an iambic form', () => {
    const t = 'Hungry sailors wander lonely, weary';
    expect(IAMB5(t).deviations).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(check(['Tell me not in mournful numbers'], 'iamb', 4)[0]).toEqual({ line: 0, syllables: 8, expected: 8, deviations: [4, 5, 6, 7] });
    expect(check([t], 'trochee', 5)[0]!.deviations).toEqual([]);
  });

  it('skips a line with a guessed word', () => {
    expect(IAMB5('Mournful zxqvt numbers')).toEqual({ line: 0, syllables: 5, expected: 10, deviations: [], skipped: 'guessed' });
  });

  it('allows one extra final weak syllable without reporting it', () => {
    const f = IAMB5('To be or not to be, that is the question');
    expect([f.syllables, f.expected]).toEqual([11, 10]);
    expect(f.deviations).toEqual([]);
  });

  it('reports no positions when the syllable count cannot fit', () => {
    expect(IAMB5('Tell me not in mournful numbers')).toEqual({ line: 0, syllables: 8, expected: 10, deviations: [] });
  });

  it('expects feet x foot length per foot', () => {
    const l = 'Hungry sailors wander lonely, weary';
    expect(check([l], 'anapest', 3)[0]!.expected).toBe(9);
    expect(check([l], 'dactyl', 3)[0]!.expected).toBe(9);
    expect(check([l], 'trochee', 5)[0]!.expected).toBe(10);
  });

  it('reads common meter as iambic lines alternating four and three feet, starting with four', () => {
    const r = check(['Amazing grace how sweet the sound', 'That saved a wretch like me'], 'common', 4);
    expect(r.map(x => [x.line, x.expected])).toEqual([[0, 8], [1, 6]]);
    const four = check(['a b c d', 'e f g h', 'i j k l', 'm n o p'], 'common', 4);
    expect(four.map(x => x.expected)).toEqual([8, 6, 8, 6]);
  });
});

describe('checkMeter with feetPerLine (limerick)', () => {
  const LIMERICK = [3, 3, 2, 2, 3];
  const lear = [
    'There was an Old Man with a beard,',
    'Who said, "It is just as I feared!',
    'Two Owls and a Hen,',
    'Four Larks and a Wren,',
    'Have all built their nests in my beard!"',
  ];
  const run = (texts: string[]) => checkMeter(texts.map(analyseLine), { foot: 'anapest', feet: 3 }, LIMERICK);

  it('expects the feet each line has, not the longest line for all', () => {
    expect(run(lear).map(l => l.expected)).toEqual([9, 9, 6, 6, 9]);
  });

  it('passes Lear\'s limerick with no deviations (lines open on a dropped weak syllable)', () => {
    const r = run(lear);
    expect(r.map(l => [l.syllables, l.expected, l.deviations, l.skipped])).toEqual([
      [8, 9, [], undefined], [8, 9, [], undefined], [5, 6, [], undefined], [5, 6, [], undefined], [8, 9, [], undefined],
    ]);
  });

  it('does not fit a draft whose lines 3 and 4 run three feet', () => {
    const draft = [...lear.slice(0, 2), 'Two Owls and a Hen in the garden,', 'Four Larks and a Wren in the hedges,', lear[4]!];
    const r = run(draft);
    expect(r.map(l => [l.syllables, l.expected])).toEqual([[8, 9], [8, 9], [9, 6], [9, 6], [8, 9]]);
    // Nine syllables against six expected: neither count fits, so the line is reported as a mismatch.
    expect(r.filter(l => l.syllables !== l.expected && l.syllables !== l.expected + 1 && l.syllables !== l.expected - 1).map(l => l.line)).toEqual([2, 3]);
  });

  it('checks a line that drops the opening weak syllable against the shifted pattern', () => {
    // "Pretty garden pond" is 5 syllables (stress 1010?) against 6 expected: read from slot 2 of the foot, so the
    // stressed syllables 1 and 3 fall in weak slots and the unstressed syllable 2 in a strong one.
    expect(check(['Pretty garden pond'], 'anapest', 2)[0]).toEqual({ line: 0, syllables: 5, expected: 6, deviations: [0, 1, 2] });
  });

  it('without feetPerLine every line uses meter.feet', () => {
    expect(checkMeter(lear.map(analyseLine), { foot: 'anapest', feet: 3 }).map(l => l.expected)).toEqual([9, 9, 9, 9, 9]);
  });
});
