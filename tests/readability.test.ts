import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/document.ts';
import type { Doc } from '../src/ir.ts';
import { measure } from '../src/measure/index.ts';
import { lint } from '../src/lint/lint.ts';
import { EVALUATORS } from '../src/lint/evaluators.ts';
import { RULES } from '../src/craft/rules.ts';

// Every cat is one syllable and every rabbit is two: the arithmetic below is independent of the text helpers.
function passage(sentenceCount = 5, wordsPerSentence = 20, rabbits = 0): string {
  return Array.from({ length: sentenceCount }, (_, sentence) => Array.from({ length: wordsPerSentence }, (_, word) => {
    const token = sentence * wordsPerSentence + word < rabbits ? 'rabbit' : 'cat';
    return word === 0 ? token[0].toUpperCase() + token.slice(1) : token;
  }).join(' ') + '.').join(' ');
}

function draft(body: string, reader: Record<string, unknown> | null = { language: 'en-US' }): Doc {
  return parseDocument('lesson.md', `---\nform: academic\n${reader ? `reader: ${JSON.stringify(reader)}\n` : ''}---\n\n${body}`);
}

const report = (doc: Doc) => measure(doc).readability;
const readingRule = RULES.find(r => r.id === 'readability.grade.report')!;
const termRule = { ...readingRule, id: 'reader.essential-terms' };

describe('opt-in readability report', () => {
  it('adds null for untargeted documents and retains their exact legacy grade finding', () => {
    const doc = draft(passage(), null);
    const m = measure(doc);
    expect(m.readability).toBeNull();
    expect(m.style.readingGrade).toBe(4);
    expect(EVALUATORS['readability.grade.report']({ doc, m, rule: readingRule })).toEqual([
      { message: 'Reading grade about 4 (reported only; not a target)', line: null, measured: 4 },
    ]);
  });

  it('reports independently calculated FK arithmetic with an explicit method and coverage', () => {
    const doc = draft(passage());
    const r = report(doc)!;
    // 100 words, 5 sentences, 100 syllables: 0.39 * 20 + 11.8 * 1 - 15.59 = 4.01.
    expect(r).toMatchObject({
      reader: { language: 'en-US' }, method: 'flesch-kincaid-grade', methodVersion: '1',
      inputPolicy: 'markdown-paragraphs-v1', syllableMethod: 'english-spelling-heuristic-v1', language: 'en-US',
      status: 'estimated', estimate: 4, counts: { words: 100, sentences: 5, paragraphs: 1 }, lines: [6],
      target: null, comparison: 'not-requested', essentialTerms: [],
    });
    expect(r.exclusions.join(' ')).toMatch(/heading.*list.*step.*quote.*note/i);
    expect(r.limitations.join(' ')).toMatch(/comprehension.*suitability/i);
    expect(r.limitations.join(' ')).toMatch(/100.*5.*convention/i);
    expect(r.limitations.join(' ')).toMatch(/code.*table.*parser/i);
    expect(r.limitations.join(' ')).toMatch(/inline code.*math/i);
    expect(r.limitations.join(' ')).toMatch(/listening.*decodability/i);
  });

  it.each([
    ['99 words in five sentence units', passage(4) + ' ' + passage(1, 19), 99, 5],
    ['100 words in four sentence units', passage(4, 25), 100, 4],
    ['an unpunctuated fragment', Array(100).fill('cat').join(' '), 100, 1],
    ['empty input', '', 0, 0],
  ])('retains counts but withholds the estimate for %s', (_label, body, wordCount, sentenceCount) => {
    const r = report(draft(body as string, { language: 'en', readingLevel: { scale: 'us-grade', range: [4, 8] } }))!;
    expect(r).toMatchObject({ status: 'insufficient-sample', estimate: null, comparison: 'unavailable' });
    expect(r.counts.words).toBe(wordCount);
    expect(r.counts.sentences).toBe(sentenceCount);
  });

  it('uses the existing abbreviation-aware sentence units', () => {
    const r = report(draft(passage().replace('Cat cat', 'Dr. cat')))!;
    expect(r.counts).toEqual({ words: 100, sentences: 5, paragraphs: 1 });
    expect(r.status).toBe('estimated');
  });

  it('compares the unrounded estimate against inclusive target endpoints', () => {
    const r = report(draft(passage(), { language: 'en', readingLevel: { scale: 'us-grade', range: [4, 4] } }))!;
    expect(r.estimate).toBe(4);
    expect(r.comparison).toBe('above'); // 4.01 is above 4 despite displaying as 4.0.
    const below = report(draft(passage(10, 20, 67), { language: 'en', readingLevel: { scale: 'us-grade', range: [8, 8] } }))!;
    // 200 words, 10 sentences, 267 syllables: 7.963, displayed as 8.0, below the target.
    expect(below.estimate).toBe(8);
    expect(below.comparison).toBe('below');
    expect(report(draft(passage(), { language: 'en', readingLevel: { scale: 'us-grade', range: [4, 8] } }))?.comparison).toBe('within');
    // 1180 words, 59 sentences, 1579 syllables: exactly 8, the inclusive upper endpoint.
    expect(report(draft(passage(59, 20, 399), { language: 'en', readingLevel: { scale: 'us-grade', range: [4, 8] } }))?.comparison).toBe('within');
  });

  it('keeps school placement and the complete reader profile independent from a formula target', () => {
    const reader = { language: 'en-US', schoolGrade: 9, ageGroup: 'adolescent', priorKnowledge: 'Knows particles.' };
    const r = report(draft(passage(), reader))!;
    expect(r.reader).toEqual(reader);
    expect(r.target).toBeNull();
    expect(r.comparison).toBe('not-requested');
  });

  it('scores only paragraphs while leaving every legacy style input unchanged', () => {
    const doc = draft(`# Topic\n\n${passage()}\n\n> ${passage(5, 20, 100)}\n\n- rabbit\n\n1. rabbit\n\n[An onscreen note]`);
    const m = measure(doc);
    expect(m.readability).toMatchObject({ estimate: 4, counts: { words: 100, sentences: 5, paragraphs: 1 }, lines: [8] });
    // Legacy style still includes the quotation, bullet and step: 202 words, 12 units, 304 syllables -> 8.7.
    expect(m.style.words).toBe(202);
    expect(m.style.sentences).toBe(12);
    expect(m.style.readingGrade).toBe(8.7);
  });

  it.each(['References', 'bIbLiOgRaPhY', 'WORKS CITED', 'Answer key', 'Instructor notes'])('excludes the entire %s section until a peer heading', heading => {
    const doc = draft(`## ${heading}\n\n${passage()}\n\n### Subsection\n\n${passage()}\n\n## Lesson\n\n${passage()}`);
    expect(report(doc)).toMatchObject({ counts: { words: 100, sentences: 5, paragraphs: 1 }, lines: [16] });
  });

  it.each(['References ##', 'Instructor notes ###'])('recognizes optional closing hashes in %s without changing the legacy parse or style view', heading => {
    const doc = draft(`## ${heading}\n\n${passage(5, 20, 100)}\n\n### Nested section ##\n\n${passage(5, 20, 100)}\n\n## Learner text ###\n\n${passage()}`, {
      language: 'en', essentialTerms: ['rabbit', 'cat'],
    });
    const m = measure(doc);
    expect(m.readability).toMatchObject({
      counts: { words: 100, sentences: 5, paragraphs: 1 }, lines: [16], estimate: 4,
      essentialTerms: [{ term: 'rabbit', present: false, lines: [] }, { term: 'cat', present: true, lines: [16] }],
    });
    expect(doc.blocks.filter(block => block.kind === 'heading').map(block => block.text)).toEqual([
      heading, 'Nested section ##', 'Learner text ###',
    ]);
    expect(m.style.words).toBe(300);
    expect(m.style.sentences).toBe(15);
    expect(m.style.readingGrade).toBe(11.9);
  });

  it('ends an excluded section at a higher heading but does not exclude similarly named headings', () => {
    const doc = draft(`## References\n\n${passage()}\n\n# Back to learners\n\n${passage()}\n\n## References in context\n\n${passage()}`);
    expect(report(doc)).toMatchObject({ counts: { words: 200, sentences: 10, paragraphs: 2 }, lines: [12, 16] });
  });

  it('does not count parser-discarded code or tables as assessed text', () => {
    const doc = draft(`\`\`\`txt\n${passage()}\n\`\`\`\n\n| Text |\n| --- |\n| ${passage()} |\n\nA short paragraph.`);
    expect(report(doc)).toMatchObject({ status: 'insufficient-sample', counts: { words: 3, sentences: 1, paragraphs: 1 } });
  });

  it('reports unsupported declared languages without guessing a grade or comparing the target', () => {
    const r = report(draft(passage(), { language: 'fr-CA', readingLevel: { scale: 'us-grade', range: [4, 8] } }))!;
    expect(r).toMatchObject({ status: 'unsupported-language', language: 'fr-CA', estimate: null, comparison: 'unavailable' });
    expect(r.counts.words).toBe(100);
  });

  it('reports verse as an unsupported genre even if enough prose-like words are present', () => {
    const doc = draft(passage());
    doc.form = 'free-verse';
    expect(report(doc)).toMatchObject({ status: 'unsupported-genre', estimate: null, comparison: 'unavailable' });
  });
});

describe('essential-term observations', () => {
  it('normalizes NFKC, case and whitespace while retaining spelling, hyphens and whole Unicode word boundaries', () => {
    const doc = draft('ＦＵＳＩＯＮ and concentration\n  gradient. Co-operate, co operate, catfish, ions, ion_7 and éion.', {
      language: 'en', essentialTerms: ['fusion', 'Concentration   gradient', 'co-operate', 'cooperate', 'cat', 'ion'],
    });
    expect(report(doc)?.essentialTerms).toEqual([
      { term: 'fusion', present: true, lines: [6] },
      { term: 'Concentration   gradient', present: true, lines: [6] },
      { term: 'co-operate', present: true, lines: [6] },
      { term: 'cooperate', present: false, lines: [] },
      { term: 'cat', present: false, lines: [] },
      { term: 'ion', present: false, lines: [] },
    ]);
  });

  it('searches learner-facing headings and prose kinds, omitting notes and excluded sections', () => {
    const doc = draft('# Diffusion\n\n- gradient\n\n1. molecule\n\n> membrane\n\n[secret]\n\n## References\n\nreferenceonly\n\n### Subsection\n\nsubsectiononly\n\n## More\n\nDiffusion.', {
      language: 'en', essentialTerms: ['diffusion', 'gradient', 'molecule', 'membrane', 'secret', 'references', 'referenceonly', 'subsectiononly'],
    });
    expect(report(doc)?.essentialTerms).toEqual([
      { term: 'diffusion', present: true, lines: [6, 26] },
      { term: 'gradient', present: true, lines: [8] },
      { term: 'molecule', present: true, lines: [10] },
      { term: 'membrane', present: true, lines: [12] },
      { term: 'secret', present: false, lines: [] },
      { term: 'references', present: false, lines: [] },
      { term: 'referenceonly', present: false, lines: [] },
      { term: 'subsectiononly', present: false, lines: [] },
    ]);
  });

  it('returns no term findings without an opted-in reader or declared terms', () => {
    for (const doc of [draft('Fusion.', null), draft('Fusion.')]) {
      expect(EVALUATORS['reader.essential-terms']?.({ doc, m: measure(doc), rule: termRule })).toEqual([]);
    }
  });

  it('reports plain present/missing observations even when the sample cannot be scored', () => {
    const doc = draft('Diffusion.', { language: 'en', essentialTerms: ['diffusion', 'gradient'] });
    const hits = EVALUATORS['reader.essential-terms']?.({ doc, m: measure(doc), rule: termRule });
    expect(hits).toEqual([
      expect.objectContaining({ message: expect.stringMatching(/diffusion.*present/i), line: 6, severity: 'info', measured: { term: 'diffusion', present: true, lines: [6] } }),
      expect.objectContaining({ message: expect.stringMatching(/gradient.*not found/i), line: null, severity: 'info', measured: { term: 'gradient', present: false, lines: [] } }),
    ]);
    expect(hits?.map(h => h.message).join(' ')).not.toMatch(/is defined|correctly used|meaning preserved/i);
  });
});

describe('informational reader lint', () => {
  it('uses the opted-in report instead of the competing legacy grade and never blocks lint', () => {
    const doc = draft(passage(), { language: 'en', readingLevel: { scale: 'us-grade', range: [4, 4] }, essentialTerms: ['rabbit'] });
    const result = lint(doc);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    const grade = result.info.filter(f => f.rule === 'readability.grade.report');
    expect(grade).toHaveLength(1);
    expect(grade[0]).toMatchObject({ severity: 'info', measured: { status: 'estimated', comparison: 'above' } });
    expect(grade[0].message).toMatch(/approximately grade 4/i);
    expect(grade[0].message).toMatch(/above.*\[4, 4\]/i);
    expect(grade[0].message).not.toContain('not a target');
    expect(result.info).toContainEqual(expect.objectContaining({ rule: 'reader.essential-terms', severity: 'info' }));
    expect(result.warnings.some(f => f.rule.startsWith('reader.') || f.rule.startsWith('readability.'))).toBe(false);
  });

  it.each([
    ['insufficient-sample', () => draft('A short fragment.'), /insufficient.*100.*5/i],
    ['unsupported-language', () => draft(passage(), { language: 'es' }), /unsupported.*language.*es/i],
    ['unsupported-genre', () => ({ ...draft(passage()), form: 'free-verse' }), /unsupported.*genre|verse/i],
  ])('states the %s reason instead of a legacy grade', (_status, makeDoc, reason) => {
    const result = lint((makeDoc as () => Doc)());
    const grade = result.info.filter(f => f.rule === 'readability.grade.report');
    expect(result.ok).toBe(true);
    expect(grade).toHaveLength(1);
    expect(grade[0].message).toMatch(reason as RegExp);
    expect(grade[0].measured).toMatchObject({ status: _status, estimate: null });
  });
});
