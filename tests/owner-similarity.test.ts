import { describe, expect, it } from 'vitest';
import { DUPLICATE_AT, SIMILAR_AT, similarity } from '../src/owner/similarity.ts';

describe('similarity', () => {
  it('is 1 for the same words and 0 for none shared', () => {
    expect(similarity('Quiet night on the wall.', 'quiet night on the wall')).toBe(1);
    expect(similarity('alpha beta', 'gamma delta')).toBe(0);
  });

  it('uses single words for short texts: a one-word addition is a duplicate', () => {
    expect(similarity("I can't believe you ate the last slice.", "I can't believe you ate the last slice, again.")).toBeGreaterThanOrEqual(DUPLICATE_AT);
  });

  it('keeps different takes on one setup apart', () => {
    expect(similarity("I can't believe you ate the last slice of pizza.", "Even the pizza didn't wait for me.")).toBeLessThan(SIMILAR_AT);
  });

  it('uses three-word phrases once both texts reach 30 words', () => {
    const a = 'We built it in the rain, in the dark, when nobody believed we could, and look: a thousand of you cross it every day, rain or shine, year after year.';
    const b = 'Rain or shine, year after year, a thousand of you cross it every day, and look: nobody believed we could, in the dark, in the rain, when we built it.';
    expect(similarity(a, b)).toBeLessThan(SIMILAR_AT); // same words, rearranged phrases
  });

  it('has no cliff at 30 words: one swap scores about the same at 29 and 31', () => {
    const w = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`);
    const swap = (n: number) => { const a = w(n); const b = a.slice(); b[Math.floor(n / 2)] = 'CHANGED'; return similarity(a.join(' '), b.join(' ')); };
    expect(Math.abs(swap(29) - swap(31))).toBeLessThanOrEqual(0.1);
    const rev = w(31);
    expect(similarity(rev.join(' '), rev.slice().reverse().join(' '))).toBeLessThan(SIMILAR_AT);
  });

  it('treats two empty texts as different, not identical', () => {
    expect(similarity('', '')).toBe(0);
  });
});
