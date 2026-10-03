import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';

const artifactErrors = (body: string) => {
  const file = join(mkdtempSync(join(tmpdir(), 'prose-lint-')), 'memo.md');
  writeFileSync(file, `---\nform: professional\n---\n\n${body}\n`);
  return lint(loadDocument(file)).errors.filter(f => f.rule === 'ai.artifact');
};

describe('lint ai.artifact sees link targets and the new patterns', () => {
  it('flags a tracking parameter in an inline link target', () => {
    expect(artifactErrors('See [the source](https://example.com/a?utm_source=chatgpt.com) for details.')).toHaveLength(1);
  });
  it('flags the documented placeholders', () => {
    expect(artifactErrors('Dear [Company Name], we write.')).toHaveLength(1);
    expect(artifactErrors('Hello {{first_name}}, welcome.')).toHaveLength(1);
  });
  it('does not flag an ordinary link, inline code or a fenced block', () => {
    expect(artifactErrors('Read [Link text](https://example.org/page) today.')).toEqual([]);
    expect(artifactErrors('Use a literal `{{name}}` in the template.')).toEqual([]);
    expect(artifactErrors('Intro.\n\n```\nHello {{name}}\n```\n\nOutro.')).toEqual([]);
  });
});
