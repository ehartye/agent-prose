import { letterKey, rhymeAnchors, type Pronunciation } from './pronounce.ts';

/**
 * End-rhyme classes for a pair of words, and rhyme-scheme letters for a run of end words. US English only (CMUdict);
 * "bath/path" and other dialect-dependent rhymes may be wrong. The classes follow Prosodic's definitions and are
 * conventions, not a standard; they are weaker than what a form's rules assert and are never used for a hard error.
 *
 *   identity    the same normalised word. Words that sound alike from the stressed vowel on AND share the onset
 *               (bare/bear) are also reported as identity: nothing new is rhymed.
 *   perfect     same phones from the last stressed vowel to the end (`variantKeys`) and a different onset.
 *   assonance   same stressed vowel (first element of the rhyme key), different tail.
 *   consonance  same non-empty tail after the stressed vowel, different vowel.
 *   eye         the words share their last 3 or more letters (case-insensitive) but are not identity or perfect, AND
 *               sound gives no better class than assonance, consonance or none, AND the shared spelling is more than a
 *               common suffix (ing, ed, es, s, ly, ness, less, ful, er, est: going/doing, hopeless/careless stay as the
 *               sound says), AND it reaches a stressed vowel in at least one word (shadows/windows share only the
 *               unstressed 'dow'). love/move is consonance by sound (AH V, UW V) and the textbook eye rhyme by spelling,
 *               and findings should name it as one. Eye is NOT a rhyme for `scheme` or `nearScheme`; it exists so
 *               findings can say "may be an eye rhyme or a historical pronunciation" (the spike: the dictionary rejects
 *               Shakespeare's own temperate/date and love/remove).
 *   none        otherwise.
 *
 * Every variant pair is compared and the best phonetic class wins; the onset (identity vs perfect) is the one of the
 * pair that matched. A word whose last stressed vowel has only secondary stress (tomorrow ends OW2) is also anchored
 * on its last primary stress, but that anchor can only produce a perfect or identity match (tomorrow/sorrow). `uncertain` is true when either word is
 * `guessed`, or when the winning class needed a non-first variant of either word. The spike
 * (docs/research/verse-dictionary-spike.md): "The first variant of 'wind' is the verb (W AY1 N D), so it rhymes with
 * 'find' and not 'sinned'. This is a heteronym the flat file cannot resolve", so wind/sinned is perfect but only
 * through a variant and must not be reported as certain.
 *
 * Guessed words have only a letters-based key; a guessed word is compared with letter keys on both sides (the
 * dictionary word's key is rebuilt from its spelling), and a match is at best perfect with `uncertain: true`.
 */
export type RhymeClass = 'identity' | 'perfect' | 'assonance' | 'consonance' | 'eye' | 'none';

export interface RhymePair { a: number; b: number; class: RhymeClass; uncertain: boolean }

const CLASS_RANK: Record<RhymeClass, number> = { identity: 5, perfect: 4, assonance: 3, consonance: 2, eye: 1, none: 0 };

const lettersOf = (word: string) => word.toLowerCase().replace(/[^a-z]/g, '');

/** Spellings that are only an inflection or derivation; sharing one says nothing about the stem. Longest first. */
const COMMON_SUFFIXES = ['ness', 'less', 'ings', 'ing', 'ers', 'est', 'ful', 'ed', 'es', 'er', 'ly', 's'];

/** Syllables after the last primary-stressed one (after the last secondary when there is no primary); 0 for guessed words. */
function trailingSyllables(p: Pronunciation): number {
  const at = p.stress.includes('1') ? p.stress.lastIndexOf('1') : Math.max(p.stress.lastIndexOf('2'), -1);
  return at < 0 ? 0 : p.stress.length - 1 - at;
}

/**
 * Eye rhyme by spelling: (b) the words share 3 or more final letters, (c) the shared spelling is more than a common
 * suffix (going/doing share only 'ing'; shadows/windows only reach 'dow' + s), and the shared spelling reaches a stressed
 * vowel in at least one word (love/move 'ove', temperate/date 'ate'), because matching unstressed endings
 * (shadow/window 'dow') is not what an eye rhyme is. The caller applies (a): only when sound gives no better class.
 */
function eyeRhyme(a: Pronunciation, b: Pronunciation): boolean {
  const x = lettersOf(a.word);
  const y = lettersOf(b.word);
  let n = 0;
  while (n < Math.min(x.length, y.length) && x[x.length - 1 - n] === y[y.length - 1 - n]) n++;
  if (n < 3) return false;
  const shared = x.slice(-n);
  const suffix = COMMON_SUFFIXES.find(s => shared.endsWith(s));
  if (suffix && n - suffix.length < 3) return false;
  const vowelGroups = shared.replace(/(?<=[^aeiou])e$/, '').match(/[aeiouy]+/g)?.length ?? 0;
  const reach = a.source === 'guessed' || b.source === 'guessed' ? 0 : Math.min(trailingSyllables(a), trailingSyllables(b));
  return vowelGroups >= reach + 1;
}

/** Class of one pair of rhyme keys, space-separated phones with the stressed vowel first. */
function keyClass(ka: string, kb: string, sameOnset: boolean): RhymeClass {
  if (ka === kb) return sameOnset ? 'identity' : 'perfect';
  const [va, ...ta] = ka.split(' ');
  const [vb, ...tb] = kb.split(' ');
  if (va === vb) return 'assonance';
  if (ta.length > 0 && ta.join(' ') === tb.join(' ')) return 'consonance';
  return 'none';
}

export function rhymeClass(a: Pronunciation, b: Pronunciation): { class: RhymeClass; uncertain: boolean } {
  const guessed = a.source === 'guessed' || b.source === 'guessed';
  if (a.word === b.word) return { class: 'identity', uncertain: guessed };
  const eye = eyeRhyme(a, b);

  if (guessed) {
    const key = (p: Pronunciation) => (p.source === 'guessed' ? p.rhymeKey : letterKey(lettersOf(p.word)));
    const same = key(a) !== '' && key(a) === key(b);
    return { class: same ? 'perfect' : eye ? 'eye' : 'none', uncertain: true };
  }

  let best: RhymeClass = 'none';
  let bestFirst = false; // some first-variant pair reaches the best class
  a.variantPhones.forEach((pa, i) => b.variantPhones.forEach((pb, j) => {
    for (const x of rhymeAnchors(pa)) {
      for (const y of rhymeAnchors(pb)) {
        // The onset is the one of the variant pair (and anchor) that produced the match, not of the first variants.
        const c = keyClass(x.key, y.key, x.onset === y.onset);
        if ((x.alt || y.alt) && CLASS_RANK[c] < CLASS_RANK.perfect) continue; // a primary-stress anchor only upgrades to a full rhyme
        if (CLASS_RANK[c] > CLASS_RANK[best]) { best = c; bestFirst = i === 0 && j === 0; }
        else if (c === best && i === 0 && j === 0) bestFirst = true;
      }
    }
  }));
  if (eye && CLASS_RANK[best] < CLASS_RANK.perfect) return { class: 'eye', uncertain: false };
  return { class: best, uncertain: best !== 'none' && !bestFirst };
}

/**
 * Rhyme letters over end words. Letters are assigned in order of first appearance; a word joins the first group whose
 * first member it rhymes with (greedy against the group's first member, not union-find, so a chain a~b, b~c with a!~c
 * does not merge). `scheme` counts identity and perfect; `nearScheme` also assonance and consonance. A null end word is
 * '-' and takes no part in any pair. `pairs` lists every non-'none' pair of non-null end words, a < b.
 */
export function scheme(endWords: Array<Pronunciation | null>): { scheme: string; nearScheme: string; pairs: RhymePair[] } {
  const pairs: RhymePair[] = [];
  for (let a = 0; a < endWords.length; a++) {
    for (let b = a + 1; b < endWords.length; b++) {
      const x = endWords[a];
      const y = endWords[b];
      if (!x || !y) continue;
      const r = rhymeClass(x, y);
      if (r.class !== 'none') pairs.push({ a, b, class: r.class, uncertain: r.uncertain });
    }
  }
  const letters = (accepts: (c: RhymeClass) => boolean) => {
    const firsts: number[] = [];
    return endWords.map((w, i) => {
      if (!w) return '-';
      let g = firsts.findIndex(f => {
        const r = rhymeClass(endWords[f]!, w);
        return accepts(r.class);
      });
      if (g < 0) { firsts.push(i); g = firsts.length - 1; }
      return g < 26 ? String.fromCharCode(97 + g) : '?';
    }).join('');
  };
  const strict = (c: RhymeClass) => c === 'identity' || c === 'perfect';
  return { scheme: letters(strict), nearScheme: letters(c => strict(c) || c === 'assonance' || c === 'consonance'), pairs };
}
