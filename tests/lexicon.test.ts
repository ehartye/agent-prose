import { describe, expect, it } from 'vitest';
import { AI_TELLS, ALL_LEXICONS, FILLER, HEDGES, matchLexicon } from '../src/measure/lexicon.ts';
import type { Block } from '../src/ir.ts';

const para = (text: string, line = 1): Block => ({ kind: 'paragraph', text, line });

describe('lexicons', () => {
  it('loads all three with sources', () => {
    expect(ALL_LEXICONS.map(l => l.id).sort()).toEqual(['ai-tells', 'filler', 'hedges']);
    for (const l of ALL_LEXICONS) expect(l.sources.length).toBeGreaterThan(0);
  });

  it('finds vocabulary, structure and artifact tells with lines and eras', () => {
    const hits = matchLexicon(AI_TELLS, [
      para('We delve into the intricate tapestry.', 3),
      para('It serves as a testament to grit. :contentReference[oaicite:3]{index=3}', 4),
    ]);
    const ids = hits.map(h => h.id).sort();
    expect(ids).toEqual(['copula-avoidance', 'delve', 'intricate', 'oaicite', 'tapestry', 'testament']);
    expect(hits.find(h => h.id === 'delve')).toEqual({ id: 'delve', tier: 'vocabulary', eras: ['gpt-4'], count: 1, lines: [3], examples: ['delve'] });
    expect(hits.find(h => h.id === 'oaicite')!.tier).toBe('artifact');
  });

  it('counts repeated hits per line once per line in lines[]', () => {
    const hits = matchLexicon(HEDGES, [para('Very, very, perhaps very.', 7)]);
    expect(hits.find(h => h.id === 'very')).toEqual({ id: 'very', tier: 'hedge', count: 3, lines: [7], examples: ['Very', 'very'] });
  });

  it('counts one citation artifact once', () => {
    const hits = matchLexicon(AI_TELLS, [para(':contentReference[oaicite:3]{index=3}')]);
    expect(hits.find(h => h.id === 'oaicite')!.count).toBe(1);
  });

  it('matches curly apostrophes', () => {
    expect(matchLexicon(FILLER, [para('It’s easy. Please wait.')]).map(h => h.id).sort()).toEqual(['its-easy', 'please']);
  });
});

describe('lexicon examples', () => {
  it('keeps up to three distinct matched strings as written', () => {
    const hits = matchLexicon(HEDGES, [para('Very good. very good. VERY good. Very nice. vERy fine.', 2)]);
    expect(hits.find(h => h.id === 'very')!.examples).toEqual(['Very', 'very', 'VERY']);
  });

  it('quotes the verb phrase, not the article, for copula avoidance', () => {
    expect(matchLexicon(AI_TELLS, [para('It functions as a bridge.')]).find(h => h.id === 'copula-avoidance')!.examples).toEqual(['functions as']);
  });
});

describe('lexicon matching across hard wraps', () => {
  it('matches a phrase broken over two lines and quotes it on one line', () => {
    const hits = matchLexicon(AI_TELLS, [para('Our office sits in the\nheart of the city.', 5)]);
    expect(hits.find(h => h.id === 'in-the-heart-of')).toMatchObject({ tier: 'promotional', count: 1, lines: [5], examples: ['in the heart of'] });
    const copula = matchLexicon(AI_TELLS, [para('It serves\nas a bridge.')]).find(h => h.id === 'copula-avoidance')!;
    expect(copula.examples).toEqual(['serves as']);
  });
});

describe('lexicon review date', () => {
  it('carries a valid review date on the era-tagged list', () => {
    expect(AI_TELLS.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('treats the date as optional for the other lists', () => {
    for (const l of [HEDGES, FILLER]) if (l.reviewed !== undefined) expect(l.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
