import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/document.ts';
import { buildReport } from '../src/audit/report.ts';

const artifacts = (text: string, name = 'draft.md') => {
  const r = buildReport(parseDocument(name, text, {}), text);
  return r.tiers.hard.filter(f => f.family === 'artifact').map(f => f.text);
};

describe('artifact patterns are read in link targets too', () => {
  it('finds tracking parameters in an inline link target', () => {
    expect(artifacts('See [the source](https://example.com/a?utm_source=chatgpt.com) for details.')).toHaveLength(1);
    expect(artifacts('See [the source](https://example.com/a?utm_source=openai) for details.')).toHaveLength(1);
    expect(artifacts('See [the source](https://example.com/a?utm_source=copilot.com) here.')).toHaveLength(1);
    expect(artifacts('See [the source](https://example.com/a?referrer=grok.com) here.')).toHaveLength(1);
  });
  it('finds them in reference definitions and autolinks', () => {
    expect(artifacts('Text [1].\n\n[1]: https://example.com/a?utm_source=chatgpt.com')).toHaveLength(1);
    expect(artifacts('Visit <https://example.com/a?utm_source=chatgpt.com> now.')).toHaveLength(1);
    expect(artifacts('Visit https://example.com/a?utm_source=chatgpt.com now.')).toHaveLength(1);
  });
  it('finds a placeholder inside a link target', () => {
    expect(artifacts('See [the source](INSERT_SOURCE_URL) for details.')).toHaveLength(1);
  });
  it('does not flag ordinary links, footnotes and citation markers', () => {
    expect(artifacts('Read [Link text](https://example.org/page) today.')).toEqual([]);
    expect(artifacts('A claim.[^1]\n\n[^1]: A footnote about the claim.')).toEqual([]);
    expect(artifacts('A claim [1] and another [2, 3].\n\n[1]: https://example.org/one')).toEqual([]);
  });
});

describe('documented artifact patterns', () => {
  const hit = [
    'Thanks, [INSERT SOURCE HERE] says so.', 'Dear [Company Name], we write.', 'Sincerely, [Your Title]', 'Hello {{first_name}}, welcome.',
    'Published 2025-XX-XX in the paper.', 'The link is INSERT_SOURCE_URL today.',
  ];
  for (const t of hit) it(`flags ${JSON.stringify(t)}`, () => expect(artifacts(t)).toHaveLength(1));
  const clean = [
    'TODO: check this later.', 'Use a literal `{{name}}` in the template.', 'A note [1] stands.', 'The XX chromosome is large.',
    'Call [the office](https://example.org/office) soon.', 'See [Your Name](https://example.org/me) for more.',
  ];
  for (const t of clean) it(`does not flag ${JSON.stringify(t)}`, () => expect(artifacts(t)).toEqual([]));
  it('excludes {{ in a fenced code block', () => {
    expect(artifacts('Intro.\n\n```\nHello {{name}}\n```\n\nOutro.')).toEqual([]);
  });
});
