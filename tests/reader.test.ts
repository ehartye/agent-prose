import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/document.ts';
import { readReader, validateLearningMetadata } from '../src/reader.ts';

const markdown = (meta: Record<string, unknown>, options: { form?: string } = {}) =>
  parseDocument('lesson.md', `---\n${JSON.stringify(meta)}\n---\nA passage.`, options);

const schemaError = (fn: () => unknown, pointer: string) => {
  expect(fn).toThrow(expect.objectContaining({ code: 'E_SCHEMA', pointer, message: expect.any(String) }));
};

describe('reader metadata at document loading', () => {
  it('preserves raw reader, legacy audience and length target metadata', () => {
    const meta = {
      reader: { language: 'en-us', schoolGrade: 9 },
      audience: 'Average U.S. high school freshman',
      target: '800 words',
    };
    expect(markdown(meta).meta).toEqual(meta);
  });

  it.each([
    [null, '/reader'],
    [[], '/reader'],
    ['grade 9', '/reader'],
    [9, '/reader'],
    [{}, '/reader/language'],
    [{ language: '' }, '/reader/language'],
    [{ language: '  ' }, '/reader/language'],
    [{ language: 'en_US' }, '/reader/language'],
    [{ language: 'English language' }, '/reader/language'],
    [{ language: 9 }, '/reader/language'],
    [{ language: 'en', schoolGrade: 3 }, '/reader/schoolGrade'],
    [{ language: 'en', schoolGrade: 13 }, '/reader/schoolGrade'],
    [{ language: 'en', schoolGrade: 8.5 }, '/reader/schoolGrade'],
    [{ language: 'en', schoolGrade: '9' }, '/reader/schoolGrade'],
    [{ language: 'en', ageGroup: 'teen' }, '/reader/ageGroup'],
    [{ language: 'en', priorKnowledge: ' ' }, '/reader/priorKnowledge'],
    [{ language: 'en', essentialTerms: 'diffusion' }, '/reader/essentialTerms'],
    [{ language: 'en', essentialTerms: ['diffusion', ' '] }, '/reader/essentialTerms/1'],
    [{ language: 'en', essentialTerms: [7] }, '/reader/essentialTerms/0'],
    [{ language: 'en', ability: 9 }, '/reader/ability'],
    [{ language: 'en', 'bad/key~': true }, '/reader/bad~1key~0'],
  ])('rejects malformed reader %j at %s', (reader, pointer) => {
    schemaError(() => markdown({ reader }), pointer as string);
  });

  it.each([
    [null, '/reader/readingLevel'],
    [[], '/reader/readingLevel'],
    ['grade 8', '/reader/readingLevel'],
    [{ range: [6, 8] }, '/reader/readingLevel/scale'],
    [{ scale: 'cefr', range: [6, 8] }, '/reader/readingLevel/scale'],
    [{ scale: 'us-grade' }, '/reader/readingLevel/range'],
    [{ scale: 'us-grade', range: '6–8' }, '/reader/readingLevel/range'],
    [{ scale: 'us-grade', range: [6] }, '/reader/readingLevel/range'],
    [{ scale: 'us-grade', range: [6, 8, 9] }, '/reader/readingLevel/range'],
    [{ scale: 'us-grade', range: [3, 8] }, '/reader/readingLevel/range/0'],
    [{ scale: 'us-grade', range: [6, 13] }, '/reader/readingLevel/range/1'],
    [{ scale: 'us-grade', range: [6, 8.5] }, '/reader/readingLevel/range/1'],
    [{ scale: 'us-grade', range: [8, 6] }, '/reader/readingLevel/range'],
    [{ scale: 'us-grade', range: [6, 8], score: 7 }, '/reader/readingLevel/score'],
  ])('rejects malformed reading target %j at %s', (readingLevel, pointer) => {
    schemaError(() => markdown({ reader: { language: 'en-US', readingLevel } }), pointer as string);
  });

  it('does not add teaching requirements to existing Markdown forms', () => {
    expect(markdown({}).form).toBe('professional');
  });

  it('rejects teaching metadata on other forms', () => {
    schemaError(() => markdown({ teaching: { unit: 'lesson', goals: ['Explain diffusion.'] } }), '/teaching');
  });
});

describe('readReader', () => {
  it('returns null without a profile and never infers one from the legacy audience', () => {
    expect(readReader({})).toBeNull();
    expect(readReader({ audience: 'grade 6', target: '800 words' })).toBeNull();
  });

  it('keeps school placement independent from a requested numerical level', () => {
    const doc = markdown({ reader: { language: 'en-US', schoolGrade: 9 } });
    const reader = readReader(doc.meta);
    expect(reader?.schoolGrade).toBe(9);
    expect(reader?.readingLevel).toBeUndefined();
  });

  it('returns canonical language with every supported optional field without changing raw metadata', () => {
    const meta = {
      reader: {
        language: 'EN-us', schoolGrade: 7, ageGroup: 'adolescent',
        priorKnowledge: 'Knows particles; has not studied concentration gradients.',
        readingLevel: { scale: 'us-grade', range: [6, 8] },
        essentialTerms: ['diffusion', 'concentration gradient'],
      },
    };
    const original = structuredClone(meta);
    const reader = readReader(meta);
    expect(reader).toEqual({ ...meta.reader, language: 'en-US' });
    expect(meta).toEqual(original);
  });

  it.each([4, 12])('accepts boundary school grade %s and single-grade targets', schoolGrade => {
    const reader = readReader({ reader: { language: 'en', schoolGrade, readingLevel: { scale: 'us-grade', range: [schoolGrade, schoolGrade] } } });
    expect(reader?.schoolGrade).toBe(schoolGrade);
    expect(reader?.readingLevel?.range).toEqual([schoolGrade, schoolGrade]);
  });

  it.each(['child', 'adolescent', 'adult', 'mixed'])('accepts declared age group %s', ageGroup => {
    expect(readReader({ reader: { language: 'en', ageGroup } })?.ageGroup).toBe(ageGroup);
  });

  it('accepts non-English BCP 47 tags without transforming their targets', () => {
    const doc = markdown({ reader: { language: 'es-mx', readingLevel: { scale: 'us-grade', range: [4, 12] }, essentialTerms: [] } });
    expect(readReader(doc.meta)).toEqual({ language: 'es-MX', readingLevel: { scale: 'us-grade', range: [4, 12] }, essentialTerms: [] });
  });

  it.each([
    ['x-private', 'x-private'],
    ['X-FR-CH', 'x-fr-ch'],
    ['x-a-12345678', 'x-a-12345678'],
    ['I-KLINGON', 'i-klingon'],
    ['en-GB-oed', 'en-gb-oed'],
    ['zh-min-nan', 'zh-min-nan'],
    ['sgn-BE-FR', 'sgn-be-fr'],
    ['zh-cmn-Hans-CN', 'zh-cmn-hans-cn'],
    ['abcd', 'abcd'],
  ])('accepts BCP 47 %s beyond Intl locale syntax and normalizes it as %s', (language, normalized) => {
    const doc = markdown({ reader: { language } });
    expect(readReader(doc.meta)?.language).toBe(normalized);
    expect(doc.meta.reader).toEqual({ language });
  });

  it.each([
    'en-GB-oed', 'i-ami', 'i-bnn', 'i-default', 'i-enochian', 'i-hak', 'i-klingon', 'i-lux', 'i-mingo',
    'i-navajo', 'i-pwn', 'i-tao', 'i-tay', 'i-tsu', 'sgn-BE-FR', 'sgn-BE-NL', 'sgn-CH-DE',
    'art-lojban', 'cel-gaulish', 'no-bok', 'no-nyn', 'zh-guoyu', 'zh-hakka', 'zh-min', 'zh-min-nan', 'zh-xiang',
  ])('accepts the fixed RFC 5646 grandfathered tag %s', language => {
    expect(() => readReader({ reader: { language } })).not.toThrow();
  });

  it('retains Intl canonicalization for modern tags and aliases', () => {
    expect(readReader({ reader: { language: 'sr-latn-rs' } })?.language).toBe('sr-Latn-RS');
    expect(readReader({ reader: { language: 'iw' } })?.language).toBe('he');
  });

  it('checks syntax without requiring a registered language, extlang or extension', () => {
    const language = 'qaa-qab-qac-qad-Latn-US-1234-variant-a-ab-b-cd-x-a';
    expect(readReader({ reader: { language } })?.language).toBe(language.toLowerCase());
  });

  it.each([
    'x', 'x-', 'x-123456789', 'i-madeup', 'i-klingon-US', 'sgn-BE-FR-x-sign',
    'en-x', 'en-a', 'en-a-x-private', 'en-a-123456789', 'en-abcdefghi',
    'en-US-US', 'en-Latn-Latn', 'en--US', '-en', 'en-', 'en_US', 'en US', 'en-ü', 'en\n',
    'qaa-qab-qac-qad-qae', 'en-a-foo-a-bar', 'en-a-foo-A-bar', 'en-1901-1901', 'sl-rozaj-ROZAJ',
    'zh-cmn-a-foo-a-bar', 'zh-cmn-rozaj-ROZAJ',
  ])('rejects malformed or duplicate BCP 47 subtags in %j', language => {
    schemaError(() => markdown({ reader: { language } }), '/reader/language');
    schemaError(() => readReader({ reader: { language } }), '/reader/language');
  });

  it.each(['KK', 'en-KK', 'x-K'])('rejects raw non-ASCII before case folding in %s', language => {
    schemaError(() => markdown({ reader: { language } }), '/reader/language');
    schemaError(() => readReader({ reader: { language } }), '/reader/language');
  });

  it('revalidates metadata that did not pass through document loading', () => {
    schemaError(() => readReader({ reader: { language: 'en', schoolGrade: 2 } }), '/reader/schoolGrade');
    schemaError(() => readReader({ reader: null }), '/reader');
    schemaError(() => readReader({ reader: { language: 'en', readingLevel: { scale: 'us-grade', range: [10, 7] } } }), '/reader/readingLevel/range');
  });
});

describe('teaching metadata', () => {
  it.each(['explanation', 'lesson', 'chapter'])('accepts a textbook %s with goals', unit => {
    const teaching = { unit, goals: ['Explain diffusion.'], prerequisites: ['Particles move randomly.'] };
    expect(() => validateLearningMetadata({ teaching }, 'markdown', 'textbook')).not.toThrow();
  });

  it('requires teaching metadata for textbooks', () => {
    schemaError(() => validateLearningMetadata({}, 'markdown', 'textbook'), '/teaching');
  });

  it.each([
    [null, '/teaching'],
    [[], '/teaching'],
    ['lesson', '/teaching'],
    [{ goals: ['Explain diffusion.'] }, '/teaching/unit'],
    [{ unit: 'activity', goals: ['Explain diffusion.'] }, '/teaching/unit'],
    [{ unit: 'lesson' }, '/teaching/goals'],
    [{ unit: 'lesson', goals: [] }, '/teaching/goals'],
    [{ unit: 'lesson', goals: 'Explain diffusion.' }, '/teaching/goals'],
    [{ unit: 'lesson', goals: [' '] }, '/teaching/goals/0'],
    [{ unit: 'lesson', goals: [1] }, '/teaching/goals/0'],
    [{ unit: 'lesson', goals: ['Explain diffusion.'], prerequisites: 'Particles move randomly.' }, '/teaching/prerequisites'],
    [{ unit: 'lesson', goals: ['Explain diffusion.'], prerequisites: [false] }, '/teaching/prerequisites/0'],
    [{ unit: 'lesson', goals: ['Explain diffusion.'], answers: [] }, '/teaching/answers'],
  ])('rejects malformed textbook teaching %j at %s', (teaching, pointer) => {
    schemaError(() => validateLearningMetadata({ teaching }, 'markdown', 'textbook'), pointer as string);
  });

  it('permits an optional empty prerequisites list', () => {
    expect(() => validateLearningMetadata({ teaching: { unit: 'explanation', goals: ['Explain diffusion.'], prerequisites: [] } }, 'markdown', 'textbook')).not.toThrow();
  });

  it('validates against the resolved form rather than the raw declared form', () => {
    const teaching = { unit: 'lesson', goals: ['Explain diffusion.'] };
    schemaError(() => markdown({ form: 'professional' }, { form: 'textbook' }), '/teaching');
    expect(markdown({ form: 'professional', teaching }, { form: 'textbook' }).form).toBe('textbook');
    schemaError(() => markdown({ form: 'textbook', teaching }, { form: 'professional' }), '/teaching');
  });
});

describe('learning metadata format boundary', () => {
  it.each(['fountain', 'dialog'] as const)('rejects reader metadata outside Markdown (%s)', format => {
    schemaError(() => validateLearningMetadata({ reader: { language: 'en-US' } }, format, 'stage-play'), '/reader');
  });

  it('enforces the reader boundary during Fountain loading', () => {
    schemaError(() => parseDocument('lesson.fountain', 'Title: A lesson\nReader: en-US\n\nINT. SCHOOL - DAY\n\nA lesson begins.'), '/reader');
  });
});
