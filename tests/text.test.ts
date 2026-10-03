import { describe, expect, it } from 'vitest';
import { plain, round2, sentences, syllables, words, wrapCount } from '../src/text.ts';

describe('plain on pathological input', () => {
  const timed = (s: string) => { const t = performance.now(); plain(s); return performance.now() - t; };
  it('strips unclosed emphasis across many lines in linear time', () => {
    expect(timed('*a\n'.repeat(50_000 / 3))).toBeLessThan(200);
  });
  it('strips unclosed link brackets in linear time', () => {
    expect(timed('[a '.repeat(50_000 / 3))).toBeLessThan(200);
  });
  it('strips every other unclosed span in linear time', () => {
    for (const unit of ['**a\n', '_a\n', '__a\n', '![a ']) expect(timed(unit.repeat(50_000 / unit.length)), unit).toBeLessThan(200);
  });
});

describe('words', () => {
  it('keeps contractions and drops punctuation and dashes', () => {
    expect(words("Don't stop—it's 5 o’clock")).toEqual(["Don't", 'stop', "it's", '5', 'o’clock']);
  });
});

describe('sentences', () => {
  it('splits on terminal punctuation but not on abbreviations or mid-quote', () => {
    expect(sentences('Mr. Smith left. Then he came back! "Did he?" she asked.')).toEqual([
      'Mr. Smith left.', 'Then he came back!', '"Did he?" she asked.',
    ]);
  });
  it('keeps e.g. inside a sentence', () => {
    expect(sentences('Use a tool, e.g. a wrench. Then stop.')).toEqual(['Use a tool, e.g. a wrench.', 'Then stop.']);
  });
  it('drops empty fragments', () => {
    expect(sentences('  ')).toEqual([]);
  });
});

describe('syllables', () => {
  it.each([['cat', 1], ['the', 1], ['table', 2], ['reading', 2], ['communication', 5]])('%s has %i', (w, n) => {
    expect(syllables(w)).toBe(n);
  });
});

describe('wrapCount', () => {
  it('counts word-wrapped lines', () => {
    expect(wrapCount('', 10)).toBe(0);
    expect(wrapCount('a b c', 3)).toBe(2);
    expect(wrapCount('x'.repeat(25), 10)).toBe(3);
  });
});

describe('plain', () => {
  it('strips inline markup', () => {
    expect(plain('**Bold** and *it* with [a link](http://x) and `code`')).toBe('Bold and it with a link and code');
  });
});

describe('round2', () => {
  it('rounds to two decimals', () => expect(round2(1.23456)).toBe(1.23));
});

describe('review edge cases', () => {
  it('does not treat lowercase "no." as an abbreviation', () => {
    expect(sentences('I said no. Then left.')).toEqual(['I said no.', 'Then left.']);
  });
  it('keeps the capitalized "No." abbreviation', () => {
    expect(sentences('Use No. 5 today.')).toEqual(['Use No. 5 today.']);
  });
  it('rejects a wrap width below 1', () => {
    expect(() => wrapCount('a b', 0)).toThrow(expect.objectContaining({ code: 'E_USAGE', message: 'wrap width must be at least 1' }));
  });
  it('leaves underscores inside words alone', () => {
    expect(plain('call snake_case_name now')).toBe('call snake_case_name now');
    expect(plain('a dunder__init__name here')).toBe('a dunder__init__name here');
  });
  it('strips boundary underscore and asterisk emphasis', () => {
    expect(plain('_under_ and *it*')).toBe('under and it');
    expect(plain('__strong__ and **bold**')).toBe('strong and bold');
  });
  it.each([['2024', 1], ['café', 2], ['naïve', 2], ['wanted', 2], ['needed', 2], ['boxes', 2], ['wishes', 2]])('%s has %i syllables', (w, n) => {
    expect(syllables(w)).toBe(n);
  });
});

describe('real-script review fixes', () => {
  it('protects uppercase titles in ALL CAPS action', () => {
    expect(sentences('DR. OKAFOR ENTERS. MAYA FREEZES.')).toEqual(['DR. OKAFOR ENTERS.', 'MAYA FREEZES.']);
  });
  it('leaves spaced math asterisks alone', () => {
    expect(plain('2 * 3 and 4 * 5')).toBe('2 * 3 and 4 * 5');
    expect(plain('say *it* now')).toBe('say it now');
  });
});

describe('plain correctness', () => {
  it('keeps one level of nested brackets in link text', () => {
    expect(plain('[link [x]](u)')).toBe('link [x]');
  });
  it('handles adjacent and nested emphasis', () => {
    expect(plain('**a** and **b**')).toBe('a and b');
    expect(plain('**bold *it* bold**')).toBe('bold it bold');
    expect(plain('_a_b_c_')).toBe('a_b_c');
    expect(plain('[a](u) and [b](u)')).toBe('a and b');
  });
});
