import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMarkdown } from '../src/parse/markdown.ts';
import { ProseError } from '../src/errors.ts';
import { fixture } from './helpers.ts';

describe('parseMarkdown', () => {
  it('reads frontmatter and blocks with source line numbers', () => {
    const { meta, blocks } = parseMarkdown(readFileSync(fixture('keynote.md'), 'utf8'));
    expect(meta).toEqual({ form: 'speech-large', register: 'professional' });
    expect(blocks.map(b => [b.kind, b.line])).toEqual([
      ['heading', 6], ['paragraph', 8], ['paragraph', 10], ['step', 12], ['step', 13], ['note', 15],
    ]);
    expect(blocks[5]).toEqual({ kind: 'note', text: 'Slide: the finished bridge at dawn', line: 15, meta: { onscreen: true } });
  });

  it('merges quote lines and indented list continuations, skips code fences and tables', () => {
    const src = ['> one', '> two', '', '- item', '  continues', '', '```', 'code here', '```', '| a | b |', '', 'after'].join('\n');
    const { blocks } = parseMarkdown(src);
    expect(blocks).toEqual([
      { kind: 'quote', text: 'one two', line: 1 },
      { kind: 'list-item', text: 'item continues', line: 4 },
      { kind: 'paragraph', text: 'after', line: 12 },
    ]);
  });

  it('keeps paragraph line breaks so per-line cues survive', () => {
    const { blocks } = parseMarkdown(['**VISUAL:** fork', 'VO: four words here now'].join('\n'));
    expect(blocks).toEqual([{ kind: 'paragraph', text: 'VISUAL: fork\nVO: four words here now', line: 1 }]);
  });

  it('treats bold or italic bracketed cues as onscreen notes', () => {
    const { blocks } = parseMarkdown(['**[Slide 1: title]**', '', '*[Applause]*', ''].join('\n'));
    expect(blocks).toEqual([
      { kind: 'note', text: 'Slide 1: title', line: 1, meta: { onscreen: true } },
      { kind: 'note', text: 'Applause', line: 3, meta: { onscreen: true } },
    ]);
  });

  it('reports unclosed frontmatter as E_PARSE with a line', () => {
    try { parseMarkdown('---\nform: x\n'); expect.unreachable(); }
    catch (e) { expect((e as ProseError).code).toBe('E_PARSE'); expect((e as ProseError).details.line).toBe(1); }
  });
});

describe('inline markup across line breaks', () => {
  it('strips a link whose text wraps, keeping the text and dropping the URL', () => {
    const { blocks } = parseMarkdown('[the long\nlink text](http://x.y) end');
    expect(blocks).toEqual([{ kind: 'paragraph', text: 'the long\nlink text end', line: 1, meta: { artifactText: 'the long\nlink text end http://x.y' } }]);
  });
  it('strips bold that wraps', () => {
    const { blocks } = parseMarkdown('**bold that\nwraps** here');
    expect(blocks[0].text).toBe('bold that\nwraps here');
  });
  it('keeps per-line cues on their own lines', () => {
    const { blocks } = parseMarkdown('**VISUAL:** a *wide\nshot*\nVO: words here');
    expect(blocks[0].text).toBe('VISUAL: a wide\nshot\nVO: words here');
  });
});
