import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/parse/markdown.ts';
import { extractVerse } from '../src/verse/lines.ts';
import type { Doc } from '../src/ir.ts';

function docOf(src: string): Doc {
  const { meta, blocks } = parseMarkdown(src);
  return { path: 'poem.md', format: 'markdown', form: 'free-verse', meta, blocks };
}

describe('extractVerse', () => {
  it('splits a paragraph on newlines with source line numbers, after frontmatter and a heading', () => {
    const src = ['---', 'form: free-verse', '---', '## Sonnet 18', '', 'Shall I compare thee', 'to a summer\'s day?', '', 'Thou art more lovely'].join('\n');
    const { stanzas, markup } = extractVerse(docOf(src));
    expect(markup).toEqual([]);
    expect(stanzas).toEqual([
      { section: 'Sonnet 18', lines: [{ text: 'Shall I compare thee', line: 6 }, { text: "to a summer's day?", line: 7 }] },
      { section: 'Sonnet 18', lines: [{ text: 'Thou art more lovely', line: 9 }] },
    ]);
  });

  it('puts stanzas before any heading in section null and switches at each heading', () => {
    const src = ['one', 'two', '', '## Verse 1', '', 'three', '', '## Chorus  ', 'four'].join('\n');
    const { stanzas } = extractVerse(docOf(src));
    expect(stanzas.map(s => [s.section, s.lines.map(l => l.line)])).toEqual([
      [null, [1, 2]], ['Verse 1', [6]], ['Chorus', [9]],
    ]);
  });

  it('copes with trailing double-space hard breaks', () => {
    const { stanzas } = extractVerse(docOf('roses are red  \nviolets are blue  \n\nsugar is sweet'));
    expect(stanzas.map(s => s.lines.map(l => [l.text, l.line]))).toEqual([
      [['roses are red', 1], ['violets are blue', 2]], [['sugar is sweet', 4]],
    ]);
  });

  it('reports list, step and quote blocks as markup and still keeps their text as lines', () => {
    const src = ['plain line', '', '- dashed line', '', '1. numbered line', '', '> quoted line'].join('\n');
    const { stanzas, markup } = extractVerse(docOf(src));
    expect(markup).toEqual([
      { line: 3, kind: 'list-item' }, { line: 5, kind: 'step' }, { line: 7, kind: 'quote' },
    ]);
    expect(stanzas.flatMap(s => s.lines.map(l => l.text))).toEqual(['plain line', 'dashed line', 'numbered line', 'quoted line']);
  });

  it('ignores note blocks', () => {
    const { stanzas } = extractVerse(docOf('**[Applause]**\n\nreal line'));
    expect(stanzas).toEqual([{ section: null, lines: [{ text: 'real line', line: 3 }] }]);
  });
});

describe('extractVerse bracket section labels', () => {
  it('reads a label that opens a stanza as the section and removes it from the lines', () => {
    const src = ['[Verse 1]', 'The road was long', 'The night came down', '', '[Chorus]', 'Take me home', '', 'Still the chorus'].join('\n');
    const { stanzas } = extractVerse(docOf(src));
    expect(stanzas).toEqual([
      { section: 'Verse 1', lines: [{ text: 'The road was long', line: 2 }, { text: 'The night came down', line: 3 }] },
      { section: 'Chorus', lines: [{ text: 'Take me home', line: 6 }] },
      { section: 'Chorus', lines: [{ text: 'Still the chorus', line: 8 }] },
    ]);
  });

  it('reads a label on its own paragraph (a note block) as the section for the stanzas after it', () => {
    const { stanzas } = extractVerse(docOf(['[Verse 1]', '', 'line a', '', '[Chorus]:', '', 'line b'].join('\n')));
    expect(stanzas.map(s => [s.section, s.lines.map(l => l.text)])).toEqual([['Verse 1', ['line a']], ['Chorus', ['line b']]]);
  });

  it('accepts a trailing colon and lets a later heading or label replace the section', () => {
    const src = ['[Verse 1]:', 'a', '', '## Bridge', '', 'b', '', '[Outro]', 'c'].join('\n');
    expect(extractVerse(docOf(src)).stanzas.map(s => s.section)).toEqual(['Verse 1', 'Bridge', 'Outro']);
  });

  it('splits a stanza at a label in the middle of a paragraph', () => {
    const { stanzas } = extractVerse(docOf('one\n[Chorus]\ntwo'));
    expect(stanzas.map(s => [s.section, s.lines.map(l => l.text)])).toEqual([[null, ['one']], ['Chorus', ['two']]]);
  });

  it('does not take a stage-style bracket note as a section', () => {
    const { stanzas } = extractVerse(docOf('**[Applause]**\n\nreal line'));
    expect(stanzas.map(s => s.section)).toEqual([null]);
  });

  it('is not a label when text follows the bracket on the line', () => {
    const { stanzas } = extractVerse(docOf('[sic] I said no\nmore'));
    expect(stanzas[0]!.lines).toHaveLength(2);
  });
});
