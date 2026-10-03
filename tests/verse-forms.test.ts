import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FORMS, FORMS_PATH, getForm } from '../src/forms.ts';

const NEW_IDS = ['free-verse', 'haiku', 'limerick', 'ballad', 'sonnet-shakespearean', 'sonnet-petrarchan', 'villanelle', 'sestina', 'song'];
const OLD_IDS = ['quest-dialog', 'barks', 'conversation', 'instructions', 'tech-doc', 'academic', 'professional', 'sitcom-multicam',
  'sitcom-singlecam', 'tv-drama', 'stage-play', 'youtube', 'speech-small', 'speech-large', 'speech-recorded'];
const verse = (id: string) => getForm(id).verse!;

describe('verse forms', () => {
  it('keeps the fifteen existing forms unchanged and ids unique', () => {
    const ids = FORMS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 15)).toEqual(OLD_IDS);
    for (const id of OLD_IDS) expect(getForm(id).verse).toBeUndefined();
    expect(ids).toHaveLength(24);
  });

  it('adds the nine verse forms as unspoken markdown with a basis', () => {
    for (const id of NEW_IDS) {
      const f = getForm(id);
      expect(f.format, id).toBe('markdown');
      expect(f.spoken, id).toBe(false);
      expect(f.verse, id).toBeDefined();
      expect(f.basis.length, id).toBeGreaterThan(10);
    }
    for (const id of NEW_IDS.filter(i => i !== 'song' && i !== 'free-verse')) expect(getForm(id).basis, id).toContain('poets.org');
    expect(verse('song').kind).toBe('lyric');
    expect(getForm('song').basis).toMatch(/course descriptions/);
    expect(getForm('song').basis).toMatch(/practitioner article/);
    expect(verse('free-verse')).toEqual({ kind: 'poem' });
  });

  it('rejects unknown keys in verse and a malformed scheme', () => {
    const raw = JSON.parse(readFileSync(FORMS_PATH, 'utf8'));
    const bad = (v: unknown) => () => import('../src/forms.ts').then(m => m.parseFormsFile({ ...raw, forms: [{ ...raw.forms[0], verse: v }] }));
    return Promise.all([
      expect(bad({ kind: 'poem', rhyme: 'abab' })()).rejects.toThrow(),
      // fields no rule reads were removed
      expect(bad({ kind: 'poem', stresses: [3, 4] })()).rejects.toThrow(),
      expect(bad({ kind: 'poem', volta: 8 })()).rejects.toThrow(),
      expect(bad({ kind: 'poem', endWords: 6 })()).rejects.toThrow(),
      expect(bad({ kind: 'poem', scheme: 'ab1b' })()).rejects.toThrow(),
      expect(bad({ kind: 'epic' })()).rejects.toThrow(),
      expect(bad({ kind: 'poem', meter: { foot: 'spondee', feet: 5 } })()).rejects.toThrow(),
      expect(bad({ kind: 'poem', scheme: 'abab', schemes: ['abab'] })()).rejects.toThrow(),
    ]);
  });

  it('defines haiku, limerick and ballad', () => {
    expect(verse('haiku')).toMatchObject({ kind: 'poem', lines: 3, syllables: [5, 7, 5], soft: true });
    expect(getForm('haiku').basis).toMatch(/5\/7\/5/);
    expect(verse('limerick')).toMatchObject({ lines: 5, scheme: 'aabba', meter: { foot: 'anapest', feet: 3 }, feetPerLine: [3, 3, 2, 2, 3] });
    expect(verse('ballad')).toMatchObject({ stanzaSizes: [4], schemes: ['abcb', 'abab'] });
    // ballad stress counts are a definition only: no field, no check (scansion of stress counts is contested)
    expect(verse('ballad')).not.toHaveProperty('stresses');
    expect(getForm('ballad').basis).toMatch(/three or four stresses per line/);
    expect(getForm('ballad').basis).toMatch(/no check enforces/);
  });

  it('defines the sonnets', () => {
    expect(verse('sonnet-shakespearean').scheme).toBe('ababcdcdefefgg');
    expect(verse('sonnet-shakespearean')).toMatchObject({ lines: 14, meter: { foot: 'iamb', feet: 5 } });
    expect(verse('sonnet-petrarchan')).toMatchObject({ lines: 14, meter: { foot: 'iamb', feet: 5 } });
    expect(verse('sonnet-petrarchan')).not.toHaveProperty('volta');
    expect(getForm('sonnet-petrarchan').basis).toMatch(/volta after line 8/);
    expect(verse('sonnet-petrarchan').schemes).toEqual(['abbaabbacdecde', 'abbaabbacdcdcd']);
    for (const s of verse('sonnet-petrarchan').schemes!) expect(s).toHaveLength(14);
  });

  it('defines the villanelle: 19 lines, refrain lines named A1 and A2', () => {
    const v = verse('villanelle');
    expect(v.lines).toBe(19);
    expect(v.stanzaSizes).toEqual([3, 3, 3, 3, 3, 4]);
    expect(v.scheme).toBe('AbAabAabAabAabAabAA');
    expect(v.scheme).toHaveLength(19);
    expect(v.refrains).toEqual({ A1: [1, 6, 12, 18], A2: [3, 9, 15, 19] });
    // Uppercase letters in the scheme are exactly the refrain lines.
    const upper = [...v.scheme!].flatMap((c, i) => (c === c.toUpperCase() ? [i + 1] : []));
    expect(upper).toEqual([1, 3, 6, 9, 12, 15, 18, 19]);
    expect(upper).toEqual(Object.values(v.refrains!).flat().sort((a, b) => a - b));
  });

  it('defines the sestina: six end words rotating, envoi of three', () => {
    const v = verse('sestina');
    expect(v.lines).toBe(39);
    expect(v.stanzaSizes).toEqual([6, 6, 6, 6, 6, 6, 3]);
    expect(v).not.toHaveProperty('endWords');
    expect(v.envoiLines).toBe(3);
    const L = (s: string) => [...s].map(c => c.charCodeAt(0) - 65);
    expect(v.endWordRotation).toEqual(['ABCDEF', 'FAEBDC', 'CFDABE', 'ECBFAD', 'DEACFB', 'BDFECA'].map(L));
    for (const row of v.endWordRotation!) expect([...row].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
