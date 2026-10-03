import { describe, expect, it } from 'vitest';
import { measureStyle } from '../src/measure/style.ts';
import type { Block } from '../src/ir.ts';

const para = (text: string, line = 1): Block => ({ kind: 'paragraph', text, line });

describe('measureStyle', () => {
  it('measures rhythm', () => {
    const s = measureStyle([para('One two three. One two three four five.', 2)]);
    expect(s.words).toBe(8);
    expect(s.sentences).toBe(2);
    expect(s.sentenceLength).toEqual({ mean: 4, sd: 1, max: 5 });
    expect(s.longest).toEqual({ line: 2, words: 5 });
  });

  it('detects passive voice including irregular participles', () => {
    const s = measureStyle([para('The ball was thrown by Sam. Sam threw the ball. The form is completed online.')]);
    expect(s.passive).toEqual({ count: 2, rate: 0.67 });
  });

  it('counts contractions but not possessives', () => {
    expect(measureStyle([para("It's late and we don't care. John's car is red.")]).contractions.count).toBe(2);
  });

  it('counts nominalizations and hedges', () => {
    const s = measureStyle([para('The implementation of the configuration requires consideration. It is somewhat late and perhaps very cold.')]);
    expect(s.nominalizations.count).toBe(3);
    expect(s.hedges.count).toBe(3);
  });

  it('records There is / There are openers by line', () => {
    expect(measureStyle([para('There are three steps. Follow them.', 9)]).thereIs).toEqual({ count: 1, lines: [9] });
  });

  it('records a There is opener behind an opening quote or bracket', () => {
    expect(measureStyle([para('\u201CThere are two.', 4)]).thereIs).toEqual({ count: 1, lines: [4] });
    expect(measureStyle([para('(Here is one.)', 5)]).thereIs).toEqual({ count: 1, lines: [5] });
  });

  it('does not count common -tion/-ence words like question or experience as nominalizations', () => {
    expect(measureStyle([para('That question shaped my experience.')]).nominalizations.count).toBe(0);
  });

  it('finds repeated 3-word phrases across blocks', () => {
    const s = measureStyle([para('Take the old mill road home.', 1), para('Take the old mill road home.', 2), para('Take the old mill road home.', 3)]);
    expect(s.echo.find(e => e.phrase === 'old mill road')).toEqual({ phrase: 'old mill road', count: 3, lines: [1, 2, 3] });
  });

  it('reports reading grade only with 30 or more words', () => {
    expect(measureStyle([para('Short text here.')]).readingGrade).toBeNull();
    const long = 'The committee reviewed the proposal carefully and agreed that the budget needed more detail before anyone could approve it for the coming year and the next two years after that.';
    expect(typeof measureStyle([para(long)]).readingGrade).toBe('number');
  });
});
