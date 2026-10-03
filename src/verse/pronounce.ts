import { syllables as guessSyllables } from '../text.ts';
import { loadCmudict, type Cmudict } from './cmudict.ts';

/**
 * Pronunciation of one word, US English (CMUdict), for verse scansion and rhyme.
 *
 * Lookup order: the whole word in the dictionary (first variant is the best one; the others are reported through
 * `variants`, `syllablesAlt` and `variantKeys`, never resolved, because the flat file has no part of speech);
 * then a regular affix on a dictionary stem (`source: 'affix'`); otherwise the heuristic syllable count with unknown
 * stress and a letters-based rhyme key (`source: 'guessed'`). Hyphenated words absent from the dictionary are
 * pronounced part by part. Poetic and lyric forms: o'er and e'er (as ore, air) and a trailing in' (dancin') are
 * 'affix' pronunciations of the dictionary word they stand for.
 * The dictionary loads on the first call, never at import.
 */
export interface Pronunciation {
  word: string;
  source: 'dict' | 'affix' | 'guessed';
  /** Best variant, Arpabet with stress digits; empty when guessed. */
  phones: string[];
  syllables: number;
  /** Set when variants disagree on the syllable count (ambiguous). */
  syllablesAlt?: number;
  /** One char per syllable: '1' primary, '2' secondary, '0' none; '?' per syllable when guessed. */
  stress: string;
  /** Pronunciation variants: the dictionary's for a dict word, the stem's (each with the suffix added) for an affix word, 1 when guessed. */
  variants: number;
  /** Dict/affix: phones from the last stressed vowel to the end, digits removed. Guessed: letters from the last vowel group, silent final e dropped. */
  rhymeKey: string;
  /** rhymeKey of every variant (`[rhymeKey]` when guessed). */
  variantKeys: string[];
  /** Phones of every variant, aligned with `variantKeys` (`[[]]` when guessed); rhyme.ts takes onsets and alternate anchors from them. */
  variantPhones: string[][];
}

/** Strength of the pronunciation source: a hyphenated word takes the weakest of its parts. */
const SOURCE_STRENGTH = { guessed: 0, affix: 1, dict: 2 } as const;
export const isVowel = (phone: string) => /\d$/.test(phone);
const VOICELESS = new Set(['S', 'F', 'K', 'P', 'T', 'TH', 'CH', 'SH']);
const SIBILANT = new Set(['S', 'Z', 'SH', 'ZH', 'CH', 'JH']);

/** Lowercase, straight apostrophes, no leading or trailing punctuation; internal apostrophes and hyphens stay. */
function normalise(word: string): string {
  return word.toLowerCase().replaceAll('’', "'").replaceAll('‘', "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export const stressOf = (phones: string[]) => phones.filter(isVowel).map(p => p.at(-1)).join('');

/** Index of the last stressed vowel (digit 1 or 2); with no stressed vowel, of the last vowel; 0 when there is none. */
function anchorAt(phones: string[]): number {
  let at = phones.findLastIndex(p => /[12]$/.test(p));
  if (at < 0) at = phones.findLastIndex(isVowel);
  return Math.max(at, 0);
}

/** From the last stressed vowel (digit 1 or 2) to the end; with no stressed vowel, from the last vowel. */
function phoneKey(phones: string[]): string {
  return phones.slice(anchorAt(phones)).map(p => p.replace(/\d$/, '')).join(' ');
}

/**
 * Where a rhyme can be anchored: the key from the last stressed vowel and the phones before it (the onset). When that
 * vowel has only secondary stress after a primary one (tomorrow ends OW2, sorrow OW0), a second anchor on the last
 * primary stress is listed too (`alt`), so tomorrow/sorrow compare as AA R OW against AA R OW.
 */
export function rhymeAnchors(phones: string[]): { key: string; onset: string; alt: boolean }[] {
  const at = anchorAt(phones);
  const at1 = phones.findLastIndex(p => /1$/.test(p));
  const anchor = (i: number, alt: boolean) => ({
    key: phones.slice(i).map(p => p.replace(/\d$/, '')).join(' '), onset: phones.slice(0, i).join(' '), alt,
  });
  return at1 >= 0 && at1 < at ? [anchor(at, false), anchor(at1, true)] : [anchor(at, false)];
}

/** Letters from the last vowel group to the end, after dropping a silent final e (love -> "ov"). */
export function letterKey(word: string): string {
  let w = word.replace(/[^a-z]/g, '');
  if (/[^aeiouy]e$/.test(w) && w.length > 2) w = w.slice(0, -1);
  return w.match(/[aeiouy]+[^aeiouy]*$/)?.[0] ?? w;
}

function fromVariants(word: string, variants: string[][], source: 'dict' | 'affix'): Pronunciation {
  const counts = variants.map(v => v.filter(isVowel).length);
  const phones = variants[0];
  const alt = counts.find(c => c !== counts[0]);
  return {
    word, source, phones, syllables: counts[0], ...(alt === undefined ? {} : { syllablesAlt: alt }),
    stress: stressOf(phones), variants: variants.length,
    rhymeKey: phoneKey(phones), variantKeys: variants.map(phoneKey), variantPhones: variants,
  };
}

function guessed(word: string): Pronunciation {
  const n = guessSyllables(word);
  const key = letterKey(word);
  return { word, source: 'guessed', phones: [], syllables: n, stress: '?'.repeat(n), variants: 1, rhymeKey: key, variantKeys: [key], variantPhones: [[]] };
}

/** Stem spellings to try after removing a suffix, best first; `dict` decides whether a silent e is restored. */
function stems(base: string, dict: Cmudict): string[] {
  const out: string[] = [];
  // A single final consonant after a vowel (hop-, tap-, rid-, hat-) may hide a silent e: hoping -> hope, taped -> tape.
  // stem+e goes first only when it is a word, so visiting stays visit and a bare stem such as 'want' is untouched.
  if (/[aeiou][^aeiouwxy]$/.test(base) && dict.has(`${base}e`)) out.push(`${base}e`);
  out.push(base);
  // A doubled consonant is the spelling of a short vowel: hopping -> hop, tapped -> tap (tried after the bare stem, so 'ball' stays).
  if (/([^aeiou])\1$/.test(base)) out.push(base.slice(0, -1));
  out.push(`${base}e`); // mak -> make, lov -> love, for stems the first test did not cover
  return [...new Set(out)];
}

interface Rule {
  stems: string[];
  /** The affixed phones for one variant of the stem, or undefined when this rule cannot apply to that variant. */
  build: (base: string[]) => string[] | undefined;
}

const lastPhone = (base: string[]) => base.at(-1)!.replace(/\d$/, '');
const plain = (...add: string[]) => (base: string[]) => [...base, ...add];

/**
 * Regular endings, tried in this order; the first rule with a dictionary stem wins. Every variant of the stem is
 * carried through (so `syllablesAlt` and `variantKeys` survive); the stem's last phone picks the suffix phones.
 *   -ing   stopping = stop + IH NG; hoping = hope + IH NG; hopping = hop (see stems()).
 *   -ied   carried = carry + D.
 *   -ed/d  slumbered = slumber + D; stems ending voiceless (S F K P T TH CH SH) add T (hacked, watched, pushed);
 *          stems ending T or D add IH D (wanted); loved = love + D.
 *   -er/-est/-ier/-iest  wider = wide + ER; widest = wide + IH S T; happier = happy.
 *   -ly    slumberly = slumber + L IY; beautifully = beautiful + IY (no second L); fully = full + IY;
 *          happily = happy with IY -> IH L IY; basically = basic + L IY.
 *          NOT covered: -ly after a stem in -le/-ble (gently, simply, possibly) and other spelling changes.
 *   -ies/-'s/-s/-es  cries = cry + Z; slumbers = slumber + Z; hacks = hack + S; courser's = courser + Z.
 *          IH Z after a sibilant stem (S Z SH ZH CH JH): kisses, fishes, faces = face + IH Z. `es` is stripped only
 *          from a stem that ends s/x/z/ch/sh (boxes, wishes) or after o (heroes); otherwise only the s is
 *          (faces -> face, lobes -> lobe), with the other reading as a fallback (houses -> house).
 * Only used when the whole word is absent from the dictionary.
 */
function affixRules(w: string, dict: Cmudict): Rule[] {
  const rules: Rule[] = [];
  const add = (stemsList: string[], build: Rule['build']) => rules.push({ stems: stemsList, build });
  const dropped = (n: number) => w.slice(0, -n);
  if (w.endsWith('ing')) add(stems(dropped(3), dict), plain('IH0', 'NG'));
  if (w.endsWith('ied')) add([`${dropped(3)}y`], plain('D'));
  if (w.endsWith('ed')) {
    add(stems(dropped(2), dict), base => {
      const last = lastPhone(base);
      return last === 'T' || last === 'D' ? [...base, 'IH0', 'D'] : VOICELESS.has(last) ? [...base, 'T'] : [...base, 'D'];
    });
  }
  if (w.endsWith('est')) add(stems(dropped(3), dict), plain('IH0', 'S', 'T'));
  if (w.endsWith('iest')) add([`${dropped(4)}y`], plain('IY0', 'IH0', 'S', 'T'));
  if (w.endsWith('er')) add(stems(dropped(2), dict), plain('ER0'));
  if (w.endsWith('ier')) add([`${dropped(3)}y`], base => [...base.slice(0, -1), 'IY0', 'ER0']);
  if (w.endsWith('ically')) add([dropped(4)], plain('L', 'IY0'));
  if (w.endsWith('ily')) add([`${dropped(3)}y`], base => (base.at(-1) === 'IY0' ? [...base.slice(0, -1), 'IH0', 'L', 'IY0'] : undefined));
  if (w.endsWith('ly')) {
    const stem = dropped(2);
    add(stem.endsWith('l') ? [stem, `${stem}l`] : [stem], base => (lastPhone(base) === 'L' ? plain('IY0')(base) : plain('L', 'IY0')(base)));
  }
  const plural = (base: string[]) => {
    const last = lastPhone(base);
    return [...base, ...(SIBILANT.has(last) ? ['IH0', 'Z'] : VOICELESS.has(last) ? ['S'] : ['Z'])];
  };
  if (w.endsWith("'s")) add([dropped(2)], plural);
  else if (w.endsWith('ies')) add([`${dropped(3)}y`], plural);
  else if (w.endsWith('es')) {
    const stem = dropped(2);
    add(/(s|x|z|ch|sh)$/.test(stem) || w.endsWith('oes') ? [stem, dropped(1)] : [dropped(1)], plural);
  } else if (w.endsWith('s') && !w.includes("'")) add([dropped(1)], plural);
  return rules;
}

function affix(word: string, dict: Cmudict): Pronunciation | undefined {
  for (const rule of affixRules(word, dict)) {
    for (const stem of rule.stems) {
      const bases = stem.length >= 2 ? dict.get(stem) : undefined;
      const built = bases?.map(rule.build).filter((v): v is string[] => v !== undefined);
      if (built?.length) return fromVariants(word, built, 'affix');
    }
  }
  return undefined;
}

/** Poetic contractions the dictionary lacks, spelled as the word they sound like. */
const POETIC: Record<string, string> = { "o'er": 'ore', "e'er": 'air' };

const lookup = (dict: Cmudict, word: string) => dict.get(word) ?? dict.get(word.replaceAll("'", ''));

function pronounceOne(dict: Cmudict, word: string): Pronunciation {
  const variants = lookup(dict, word);
  if (variants) return fromVariants(word, variants, 'dict');
  const poetic = POETIC[word] && dict.get(POETIC[word]);
  if (poetic) return fromVariants(word, poetic, 'affix');
  return affix(word, dict) ?? guessed(word);
}

/** Lyric -in' for -ing (dancin', walkin'): the -ing form's phones with the final NG as N. Needs the raw word, which keeps the apostrophe. */
function droppedG(dict: Cmudict, word: string): Pronunciation | undefined {
  const m = /^(.*\p{L}in)['’]$/su.exec(word.trim().replace(/[^\p{L}\p{N}'’]+$/u, ''));
  if (!m) return undefined;
  const base = normalise(m[1]);
  const ing = dict.get(`${base}g`)?.filter(v => v.at(-1) === 'NG').map(v => [...v.slice(0, -1), 'N']);
  return ing?.length ? fromVariants(`${base}'`, ing, 'affix') : undefined;
}

function join(word: string, parts: Pronunciation[]): Pronunciation {
  const last = parts.at(-1)!;
  const alts = parts.some(p => p.syllablesAlt !== undefined);
  const syllables = parts.reduce((n, p) => n + p.syllables, 0);
  const source = parts.reduce((s, p) => (SOURCE_STRENGTH[p.source] < SOURCE_STRENGTH[s] ? p.source : s), 'dict' as Pronunciation['source']);
  return {
    word, source, phones: parts.flatMap(p => p.phones), syllables,
    ...(alts ? { syllablesAlt: parts.reduce((n, p) => n + (p.syllablesAlt ?? p.syllables), 0) } : {}),
    stress: parts.map(p => p.stress).join(''), variants: Math.max(...parts.map(p => p.variants)),
    rhymeKey: last.rhymeKey, variantKeys: last.variantKeys,
    variantPhones: last.variantPhones.map(v => [...parts.slice(0, -1).flatMap(p => p.phones), ...v]),
  };
}

export function pronounce(word: string): Pronunciation {
  return pronounceWith(loadCmudict(), word);
}

/** pronounce() against a given dictionary (internal: tests pass one with an inflected form removed to reach the affix rules). */
export function pronounceWith(dict: Cmudict, word: string): Pronunciation {
  const w = normalise(word);
  if (!w) return { word: '', source: 'guessed', phones: [], syllables: 0, stress: '', variants: 1, rhymeKey: '', variantKeys: [''], variantPhones: [[]] };
  const lyric = droppedG(dict, word);
  if (lyric) return lyric;
  const whole = lookup(dict, w);
  if (whole) return fromVariants(w, whole, 'dict');
  const parts = w.split('-').filter(Boolean);
  return parts.length > 1 ? join(w, parts.map(p => pronounceOne(dict, p))) : pronounceOne(dict, w);
}
