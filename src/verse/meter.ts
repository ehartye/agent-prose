import { isVowel, stressOf } from './pronounce.ts';
import type { LineAnalysis } from './prosody.ts';

export type Foot = 'iamb' | 'trochee' | 'anapest' | 'dactyl' | 'common';

export interface MeterLine {
  /** Index into the analysed lines. */
  line: number;
  syllables: number;
  expected: number;
  /** 0-based syllable positions where a polysyllabic word's stress contradicts its slot. */
  deviations: number[];
  skipped?: 'guessed';
}

/** Whether a syllable count scans as a line of `expected` syllables: it, or one more (feminine ending), or one less for a headless anapest. */
export const fitsMeter = (n: number | undefined, expected: number, headless: boolean): boolean =>
  n === expected || n === expected + 1 || (headless && n === expected - 1);

/** Weak = 0, strong = 1, repeated per foot. */
const PATTERN = { iamb: '01', trochee: '10', anapest: '001', dactyl: '100' } as const;

/** The line's stress string with each ambiguous word read as its alternative (other-length) variant. */
function altStress(l: LineAnalysis): string {
  return l.words.map(w => {
    if (w.syllables === 1 && w.syllablesAlt === undefined) return '?';
    const phones = w.syllablesAlt === undefined ? w.phones : w.variantPhones.find(v => v.filter(isVowel).length === w.syllablesAlt);
    if (!phones || !phones.length) return w.stress;
    const stress = stressOf(phones);
    return stress.length === 1 ? '?' : stress;
  }).join('');
}

/**
 * Meter conformance, advisory: scansion is gradient, so only a polysyllable's lexical stress is held against its slot.
 * A '1' in a weak slot or a '0' in a strong slot is a deviation; '?' (monosyllables and guessed words, which bend to
 * the meter) never deviates and '2' (secondary stress) is neutral. One extra syllable after the last foot (a feminine
 * ending) is allowed and its slot is not checked.
 *
 * `common` is iambic with four feet on the first, third... line and three on the second, fourth... (index 0, 2... have
 * four): the 8/6/8/6 of hymns and ballads. `meter.feet` is ignored for it.
 *
 * `feetPerLine` gives the feet for each line (limerick: 3, 3, 2, 2, 3) in place of `meter.feet`; a line past its end uses
 * `meter.feet`. An anapestic line may also open without its first weak syllable (the usual limerick line "Two Owls and
 * a Hen" is 5 syllables, not 6): one syllable short is read against the pattern shifted by one slot.
 *
 * Positions index the syllables of the first (best) pronunciation when its count fits the expected length or one more;
 * when only the alternative count (`syllablesAlt`) fits, they index the stresses of the alternative variants, so the
 * line is checked as read the way that fits. When neither fits, the line is returned with no deviations and the
 * mismatch shows in `syllables` against `expected`; a later rule reports it.
 * Lines holding a guessed word are skipped: their stress is unknown.
 */
export function checkMeter(lines: LineAnalysis[], meter: { foot: Foot; feet: number }, feetPerLine?: number[]): MeterLine[] {
  return lines.map((l, line) => {
    const common = meter.foot === 'common';
    const pattern = PATTERN[meter.foot === 'common' ? 'iamb' : meter.foot];
    const feet = common ? (line % 2 === 0 ? 4 : 3) : feetPerLine?.[line] ?? meter.feet;
    const expected = feet * pattern.length;
    const out: MeterLine = { line, syllables: l.syllables, expected, deviations: [] };
    if (l.guessed.length) return { ...out, skipped: 'guessed' };
    // Anapest only: the opening weak syllable may be dropped, which moves every syllable one slot along.
    const headless = meter.foot === 'anapest';
    const fits = (n: number | undefined) => fitsMeter(n, expected, headless);
    // The first pronunciation's count, else the alternative's when only that one fits ("temperate" 2 or 3 syllables).
    const stress = fits(l.syllables) ? l.stress : fits(l.syllablesAlt) ? altStress(l) : null;
    if (stress === null) return out;
    // Monosyllables are '?' in the line stress, so words need no separate handling.
    const shift = headless && (fits(l.syllables) ? l.syllables : l.syllablesAlt) === expected - 1 ? 1 : 0;
    for (let i = 0; i < Math.min(stress.length, expected - shift); i++) {
      const strong = pattern[(i + shift) % pattern.length] === '1';
      if ((stress[i] === '1' && !strong) || (stress[i] === '0' && strong)) out.deviations.push(i);
    }
    return out;
  });
}
