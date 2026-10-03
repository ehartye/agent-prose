// Accuracy spike (plan Task 1): heuristic vs dictionary-plus-fallback on a hand-labelled gold set.
// The test asserts only that both paths run; the numbers it prints are recorded in docs/research/verse-dictionary-spike.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { syllables, words } from '../src/text.ts';
import { loadCmudict } from '../src/verse/cmudict.ts';

interface GoldLine { poem: string; text: string; syllables: number; endWord: string; group?: string; uncertain?: boolean }
interface GoldPair { a: string; b: string; rhymes: boolean; kind: string }
const gold: { lines: GoldLine[]; pairs: GoldPair[] } = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'verse', 'gold.json'), 'utf8'));

const dict = loadCmudict();
const norm = (w: string) => w.toLowerCase().replaceAll('’', "'");
const lookup = (w: string) => dict.get(norm(w)) ?? dict.get(norm(w).replaceAll("'", ''));
const isVowel = (phone: string) => /\d$/.test(phone);

// (a) existing heuristic: summed syllables(); key = last vowel group plus the tail, after dropping a silent final e.
function heuristicKey(word: string): string {
  const letters = norm(word).replace(/[^a-z]/g, '').replace(/(?<=[^aeiouy])e$/, '');
  return letters.match(/[aeiouy]+[^aeiouy]*$/)?.[0] ?? letters;
}
const heuristicLine = (text: string) => words(text).reduce((sum, w) => sum + syllables(w), 0);

// (b) dictionary first variant, heuristic for words it lacks; key = phones from the last stressed vowel to the end.
function dictLine(text: string): { count: number; guessed: string[] } {
  let count = 0;
  const guessed: string[] = [];
  for (const w of words(text)) {
    const phones = lookup(w)?.[0];
    if (phones) count += phones.filter(isVowel).length;
    else { count += syllables(w); guessed.push(w); }
  }
  return { count, guessed };
}
function dictKey(word: string): string {
  const phones = lookup(word)?.[0];
  if (!phones) return `~${heuristicKey(word)}`;
  let i = phones.findLastIndex(p => p.endsWith('1'));
  if (i < 0) i = phones.findLastIndex(p => p.endsWith('2'));
  if (i < 0) i = phones.findLastIndex(isVowel);
  return phones.slice(i).map(p => p.replace(/\d/, '')).join(' ');
}
// A dictionary key and a letters key never compare equal; a guessed word against a dictionary word is judged on letters.
const dictKeys = (a: string, b: string) => {
  const ka = dictKey(a), kb = dictKey(b);
  if (ka.startsWith('~') !== kb.startsWith('~')) return heuristicKey(a) === heuristicKey(b);
  return ka === kb;
};

interface Pair { a: string; b: string; rhymes: boolean; kind: string }
function poemPairs(): Pair[] {
  const out: Pair[] = [];
  const poems = [...new Set(gold.lines.map(l => l.poem))];
  for (const poem of poems) {
    const ls = gold.lines.filter(l => l.poem === poem && l.group);
    for (let i = 0; i < ls.length; i++) {
      for (let j = i + 1; j < ls.length; j++) {
        out.push({ a: ls[i].endWord, b: ls[j].endWord, rhymes: ls[i].group === ls[j].group, kind: 'poem' });
      }
    }
  }
  return out;
}

const pct = (n: number, d: number) => `${n}/${d} (${((100 * n) / d).toFixed(1)}%)`;

describe('verse dictionary spike', () => {
  it('scores both paths on the gold set and prints the numbers', () => {
    const scored = gold.lines.filter(l => !l.uncertain);
    const hMiss: string[] = [];
    const dMiss: string[] = [];
    let hOk = 0, dOk = 0;
    const guessedWords = new Set<string>();
    for (const l of scored) {
      const h = heuristicLine(l.text);
      const d = dictLine(l.text);
      d.guessed.forEach(w => guessedWords.add(w));
      if (h === l.syllables) hOk++; else hMiss.push(`${l.text} [gold ${l.syllables}, got ${h}]`);
      if (d.count === l.syllables) dOk++; else dMiss.push(`${l.text} [gold ${l.syllables}, got ${d.count}${d.guessed.length ? `, guessed ${d.guessed.join('/')}` : ''}]`);
    }

    const groups: Array<[string, Pair[]]> = [
      ['poem', poemPairs()],
      ['lexical', gold.pairs.filter(p => p.kind === 'lexical')],
      ['eye-or-weak', gold.pairs.filter(p => ['weak', 'historical', 'slant'].includes(p.kind))],
    ];
    const rhyme: Record<string, { h: number; d: number; n: number; hMiss: string[]; dMiss: string[] }> = {};
    for (const [name, pairs] of groups) {
      const r = { h: 0, d: 0, n: pairs.length, hMiss: [] as string[], dMiss: [] as string[] };
      for (const p of pairs) {
        const label = `${p.a}/${p.b} [gold ${p.rhymes ? 'rhyme' : 'no'}]`;
        if ((heuristicKey(p.a) === heuristicKey(p.b)) === p.rhymes) r.h++; else r.hMiss.push(label);
        if (dictKeys(p.a, p.b) === p.rhymes) r.d++; else r.dMiss.push(label);
      }
      rhyme[name] = r;
    }

    const lines = [
      `lines: ${gold.lines.length} total, ${scored.length} scored, ${gold.lines.length - scored.length} uncertain (excluded)`,
      `syllables exact, heuristic: ${pct(hOk, scored.length)}`,
      `syllables exact, dictionary+fallback: ${pct(dOk, scored.length)}`,
      `words missing from dictionary on scored lines: ${[...guessedWords].join(', ') || 'none'}`,
      ...Object.entries(rhyme).flatMap(([name, r]) => [
        `rhyme pairs [${name}], heuristic: ${pct(r.h, r.n)}`,
        `rhyme pairs [${name}], dictionary+fallback: ${pct(r.d, r.n)}`,
      ]),
      '--- heuristic syllable misses', ...hMiss,
      '--- dictionary syllable misses', ...dMiss,
      ...Object.entries(rhyme).flatMap(([name, r]) => [`--- heuristic rhyme misses [${name}]`, ...r.hMiss, `--- dictionary rhyme misses [${name}]`, ...r.dMiss]),
    ];
    console.log(`\n${lines.join('\n')}\n`);
    expect(scored.length).toBeGreaterThan(30);
    expect(hOk).toBeGreaterThan(0);
    expect(dOk).toBeGreaterThan(0);
  });
});
