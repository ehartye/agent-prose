import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { measure } from '../src/measure/index.ts';

const doc = (body: string, form = 'academic') => { const d = mkdtempSync(join(tmpdir(), 'prose-ph-')); const f = join(d, 'a.md'); writeFileSync(f, `---\nform: ${form}\n---\n\n${body}\n`); return loadDocument(f); };

describe('placeholders and promotional words', () => {
  it('lists placeholders still to fill', () => {
    expect(measure(doc('Flake rate went from [X%] to [Y%].')).placeholders).toEqual([{ text: 'X%', line: 5 }, { text: 'Y%', line: 5 }]);
    expect(lint(doc('Flake rate went from [X%] to [Y%].')).info.find(i => i.rule === 'draft.placeholders')!.message).toBe('2 placeholders to fill: [X%], [Y%]');
  });
  it('uses the singular for one placeholder and is quiet with none', () => {
    expect(lint(doc('Owner: [name].')).info.find(i => i.rule === 'draft.placeholders')!.message).toBe('1 placeholder to fill: [name]');
    expect(lint(doc('Nothing left to fill.')).info.map(i => i.rule)).not.toContain('draft.placeholders');
  });
  it('flags promotional words in formal forms, quoting the matched text', () => {
    const found = lint(doc('This groundbreaking study is renowned.')).info.filter(i => i.rule === 'ai.promotional');
    expect(found).toHaveLength(2);
    expect(found.map(i => i.message)).toEqual(['Promotional word: “groundbreaking”', 'Promotional word: “renowned”']);
  });
  it('leaves promotional words alone in forms outside the rule', () => {
    expect(lint(doc('This groundbreaking toast is renowned.', 'speech-small')).info.filter(i => i.rule === 'ai.promotional')).toHaveLength(0);
  });
});

describe('placeholder noise', () => {
  const texts = (body: string) => measure(doc(body)).placeholders.map(p => p.text);
  it('skips numeric citations and footnotes', () => {
    expect(texts('As shown [1], [2, 3] and [4–6] and [7-9].')).toEqual([]);
    expect(texts('A claim.[^1]')).toEqual([]);
  });
  it('skips checkboxes', () => {
    expect(texts('- [ ] open\n- [x] done\n- [X] done')).toEqual([]);
  });
  it('skips brackets after a word or ], and before ( or :', () => {
    expect(texts('arr[i] and x[0]')).toEqual([]);
    expect(texts('[a][b]')).not.toContain('b');
    expect(texts('see [the docs](http://x.y) now')).toEqual([]);
    expect(texts('[ref]: http://x.y')).toEqual([]);
  });
  it('keeps [X] placeholders outside a list-item checkbox', () => {
    expect(texts('Revenue grew by [X]% this year.')).toEqual(['X']);
    expect(texts('[X] done before launch.')).toEqual(['X']);
  });
  it('keeps a placeholder followed by a colon unless the line is a link definition', () => {
    expect(texts('[TBD]: confirm')).toEqual(['TBD']);
    expect(texts('[CLIENT]: said hi')).toEqual(['CLIENT']);
    expect(texts('Intro.\n[ref]: ./docs/a.md "Title"')).toEqual([]);
  });
  it('keeps a placeholder right after a word and each of an adjacent pair', () => {
    expect(texts('Dear[Name], welcome.')).toEqual(['Name']);
    expect(texts('To [Name][Surname] at home.')).toEqual(['Name', 'Surname']);
    expect(texts('arr[i] and x[0] and m[12]')).toEqual([]);
  });
  it('keeps real placeholders', () => {
    expect(texts('Rate [X%], date [TBD], owner [Name].')).toEqual(['X%', 'TBD', 'Name']);
  });
  it('gives the line the placeholder is on within a wrapped paragraph', () => {
    expect(measure(doc('First line here\nsecond line [TBD]\nthird [X%]')).placeholders).toEqual([{ text: 'TBD', line: 6 }, { text: 'X%', line: 7 }]);
  });
  it('never reads a Fountain note remnant as a placeholder', () => {
    const d = mkdtempSync(join(tmpdir(), 'prose-ph-'));
    const f = join(d, 'a.fountain');
    writeFileSync(f, 'Title: T\n\nINT. ROOM - DAY\n\nShe waits. [[unclosed note]\n\nBOB\nHi [[aside]] there [TBD].\n');
    expect(measure(loadDocument(f)).placeholders.map(p => p.text)).toEqual(['TBD']);
  });
});
