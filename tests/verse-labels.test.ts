import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { measure } from '../src/measure/index.ts';
import { lint } from '../src/lint/lint.ts';
import { parseMarkdown } from '../src/parse/markdown.ts';
import { extractVerse } from '../src/verse/lines.ts';
import type { Doc } from '../src/ir.ts';
import { fixture } from './helpers.ts';
import { textOf } from './verse-drafts.ts';

function docOf(src: string, form = 'song'): Doc {
  const { meta, blocks } = parseMarkdown(src);
  return { path: 'x.md', format: 'markdown', form, meta, blocks };
}
const sectionsOf = (src: string) => extractVerse(docOf(src)).stanzas.map(s => [s.section, s.lines.map(l => l.text)]);

/** Run `fn` on a draft written to its own temp directory. */
function withDraft<T>(text: string, fn: (file: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'prose-labels-'));
  try {
    const file = join(dir, 'draft.md');
    writeFileSync(file, text);
    return fn(file);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const lintText = (text: string) => withDraft(text, f => lint(loadDocument(f)));
const rules = (r: ReturnType<typeof lint>) => [...r.errors, ...r.warnings, ...r.info];

describe('section labels written as plain or bold lines (song)', () => {
  it.each([
    'Verse 1', 'Chorus (x2)', 'Bridge', 'Pre-Chorus:', 'PRECHORUS', 'Verse 2', 'Outro', 'Intro [soft]', 'Solo', 'Verse', 'Refrain', 'Hook',
    'Interlude', 'Coda', 'Break', 'Tag', 'Instrumental', 'A', 'B (bridge, rise a little)', 'D', 'C [quiet]',
  ])('%s is a label, not a lyric', label => {
    const [s] = extractVerse(docOf(`${label}\n\nsome words here`)).stanzas;
    expect(s!.lines.map(l => l.text)).toEqual(['some words here']);
    expect(s!.section).toBe(label.replace(/:$/, '').trim());
  });

  it.each(['Bridge over troubled water', 'Verses of the sea', 'E', 'AB', 'Chorus line', 'A cold night'])('%s stays a lyric line', text => {
    const { stanzas } = extractVerse(docOf(text));
    expect(stanzas[0]!.lines.map(l => l.text)).toEqual([text]);
    expect(stanzas[0]!.section).toBeNull();
  });

  it('a label sets the section for the stanza and the following stanzas, and a label inside a paragraph splits it', () => {
    expect(sectionsOf('Verse 1\n\nline a\n\nline b\n\nChorus\nline c\nBridge\nline d')).toEqual([
      ['Verse 1', ['line a']], ['Verse 1', ['line b']], ['Chorus', ['line c']], ['Bridge', ['line d']],
    ]);
  });

  it('bracket labels and headings keep working beside plain labels', () => {
    expect(sectionsOf('[Verse 1]\nline a\n\nChorus\nline b\n\n## Bridge\n\nline c').map(s => s[0])).toEqual(['Verse 1', 'Chorus', 'Bridge']);
  });

  it('only applies to lyric forms: a poem keeps "Verse 1" and "A" as lines', () => {
    const { stanzas } = extractVerse(docOf('Verse 1\n\nA\n\nsome words', 'free-verse'));
    expect(stanzas.flatMap(s => s.lines.map(l => l.text))).toEqual(['Verse 1', 'A', 'some words']);
  });
});

describe('directions in lyrics', () => {
  it('a fully parenthesised line and a tempo or time-signature line are directions, not lyrics', () => {
    const r = extractVerse(docOf('Folk, about 90 bpm, 4/4\n\nVerse 1\n\nreal line one\n(hum softly)\nreal line two\n\n*(AABA, slow and soft)*'));
    expect(r.stanzas.map(s => s.lines.map(l => l.text))).toEqual([['real line one', 'real line two']]);
    expect(r.directions).toEqual([
      { line: 1, text: 'Folk, about 90 bpm, 4/4' }, { line: 6, text: '(hum softly)' }, { line: 9, text: '(AABA, slow and soft)' },
    ]);
  });

  it('a long line that happens to hold a fraction is still a lyric', () => {
    const long = 'I walked eleven miles and then I counted 3/4 of the stars alone';
    const r = extractVerse(docOf(long));
    expect(r.directions).toEqual([]);
    expect(r.stanzas[0]!.lines).toHaveLength(1);
  });

  it.each([
    '(Ooh) take me home (ooh)', 'I love you 24/7', 'Half of me is 1/2 yours', 'Oh we were dancing in 3/4 time tonight',
    '(Ooh) take me home', 'Waltz me home 3/4', 'I run at 3/16 of the speed',
  ])('%s stays a lyric line', text => {
    const r = extractVerse(docOf(text));
    expect(r.directions).toEqual([]);
    expect(r.stanzas[0]!.lines.map(l => l.text)).toEqual([text]);
  });

  it.each([
    'Folk, about 90 bpm, 4/4', '4/4', 'Waltz time, 3/4', '(hum softly)', '(Ooh)', '6/8, slow', 'Time signature: 12/8',
  ])('%s is still a direction', text => {
    const r = extractVerse(docOf(`${text}\n\nreal line`));
    expect(r.directions).toEqual([{ line: 1, text }]);
    expect(r.stanzas.flatMap(s => s.lines.map(l => l.text))).toEqual(['real line']);
  });

  it('a poem keeps a parenthesised line and a tempo line as verse lines', () => {
    const r = extractVerse(docOf('(and then the rain)\nabout 90 bpm', 'free-verse'));
    expect(r.directions).toEqual([]);
    expect(r.stanzas[0]!.lines.map(l => l.text)).toEqual(['(and then the rain)', 'about 90 bpm']);
  });
});

describe('song with bold labels (fixture)', () => {
  const v = () => measure(loadDocument(fixture('verse/song-bold-labels.md'))).verse!;

  it('finds the sections, the directions and the lyric lines', () => {
    const s = v();
    expect(s.lyric!.sections.map(x => [x.label, x.base, x.occurrence, x.lines.length])).toEqual([
      ['Verse 1', 'verse', 1, 2], ['Chorus (x2)', 'chorus', 1, 3], ['Verse 2', 'verse', 2, 2], ['Chorus', 'chorus', 2, 3], ['Bridge', 'bridge', 1, 1],
    ]);
    expect(s.count).toEqual({ lines: 11, stanzas: 5 });
    expect(s.directions).toEqual([{ line: 4, text: 'Folk, about 90 bpm, 4/4' }, { line: 10, text: '(hum the first line softly)' }]);
  });

  it('no longer reports 90, bpm or 4 as guessed words', () => {
    const s = v();
    expect(s.lines.flatMap(l => l.guessed)).toEqual([]);
    expect(s.trust.guessed).toBe(0);
  });

  it('lyric.refrain.consistent fires when the second chorus differs by a word', () => {
    const r = lintText(textOf('song-bold-labels.md'));
    const f = rules(r).filter(x => x.rule === 'lyric.refrain.consistent');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toMatch(/Chorus differs from the first Chorus \(x2\).*cold.*warm/);
    expect(rules(r).filter(x => x.rule === 'verse.pronunciation.guessed')).toEqual([]);
  });

  it('lyric.sections.line-match fires when the second verse runs long', () => {
    const text = textOf('song-bold-labels.md').replace('The frost is thin on the window pane', 'The frost is thin and silver on the window pane tonight');
    const f = rules(lintText(text)).filter(x => x.rule === 'lyric.sections.line-match');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toMatch(/Verse 2 line/);
  });
});

describe('lullaby with A and B labels (fixture)', () => {
  const s = measure(loadDocument(fixture('verse/lullaby-aaba.md'))).verse!;
  it('reads **A** and **B** *(bridge, rise a little)* as sections and the italic header as a direction', () => {
    expect(s.lyric!.sections.map(x => [x.label, x.base, x.lines.length])).toEqual([['A', 'a', 8], ['B (bridge, rise a little)', 'b', 2], ['A', 'a', 4]]);
    expect(s.directions).toEqual([{ line: 4, text: '(AABA, slow and soft, hummed or sung low)' }]);
    expect(s.count).toEqual({ lines: 14, stanzas: 4 });
  });
});

describe('the same content as a free-verse poem', () => {
  it('keeps the parenthesised line as a verse line and reports no directions', () => {
    const text = textOf('song-bold-labels.md').replace('form: song', 'form: free-verse');
    const v = withDraft(text, f => measure(loadDocument(f)).verse!);
    expect(v.directions).toEqual([]);
    expect(v.lyric).toBeNull();
    expect(v.lines.map(l => l.text)).toContain('(hum the first line softly)');
    expect(v.lines.map(l => l.text)).toContain('Verse 1');
  });
});
