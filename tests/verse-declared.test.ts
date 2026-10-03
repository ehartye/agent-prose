import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { ProseError } from '../src/errors.ts';
import { measure } from '../src/measure/index.ts';
import { lint, type Finding } from '../src/lint/lint.ts';
import { readDeclared } from '../src/declared.ts';
import { RULES } from '../src/craft/rules.ts';
import { FORMS } from '../src/forms.ts';
import { fixture, run } from './helpers.ts';
import { textOf, verse } from './verse-drafts.ts';

/** Run `fn` on a draft written to its own temp directory. */
function withDraft<T>(text: string, fn: (file: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'prose-declared-'));
  try {
    const file = join(dir, 'draft.md');
    writeFileSync(file, text);
    return fn(file);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
/** Run the real CLI with a throwaway home, so nothing touches the real ~/.agent-prose. */
function prose(...args: string[]) {
  const home = mkdtempSync(join(tmpdir(), 'prose-declared-home-'));
  try {
    const r = spawnSync(process.execPath, [join(import.meta.dirname, '..', 'scripts', 'prose.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, AGENT_PROSE_HOME: home } });
    return { status: r.status, stdout: r.stdout, error: r.stderr.trim() ? JSON.parse(r.stderr.trim()).error : undefined };
  } finally { rmSync(home, { recursive: true, force: true }); }
}
const lintText = (text: string) => withDraft(text, f => lint(loadDocument(f)));
const measureText = (text: string) => withDraft(text, f => measure(loadDocument(f)).verse!);
const lintFixture = (name: string) => lint(loadDocument(fixture(`verse/${name}`)));
const all = (r: ReturnType<typeof lint>): Finding[] => [...r.errors, ...r.warnings, ...r.info];
const of = (r: ReturnType<typeof lint>, rule: string) => all(r).filter(f => f.rule === rule);
const thrown = (fn: () => unknown): ProseError => { try { fn(); } catch (e) { return e as ProseError; } throw new Error('did not throw'); };

describe('the message for a malformed syllables value', () => {
  const msg = (raw: unknown) => thrown(() => readDeclared({ syllables: raw })).message;

  it('tells an integer to use a list or a string, not to quote a decimal', () => {
    expect(msg(8)).toMatch(/\[8\]/);
    expect(msg(8)).toMatch(/"8"/);
    expect(msg(8)).not.toMatch(/decimal/);
  });

  it('keeps the decimal advice for a non-integer such as 8.6', () => {
    expect(msg(8.6)).toMatch(/quote it: a bare 8\.6 is a decimal number/);
  });

  it.each(['8.6.8.6.', '8-6-8-6', '8.x.6', '8;6'])('tells %j to separate counts with . , or a space', raw => {
    expect(msg(raw)).toMatch(/separate counts with \. , or a space/);
    expect(msg(raw)).not.toMatch(/found ""$/);
  });
});

describe('readDeclared', () => {
  it('is null when nothing is declared', () => expect(readDeclared({})).toBeNull());

  it.each([
    [[8, 6, 8, 6]], ['8.6.8.6'], ['8 6 8 6'], ['8,6,8,6'], ['8, 6, 8, 6'],
  ])('reads %j as the pattern 8 6 8 6', raw => {
    expect(readDeclared({ syllables: raw })).toEqual({ syllables: [8, 6, 8, 6], scheme: null });
  });

  it('reads a map by section base, lowercased, and a scheme string or map', () => {
    expect(readDeclared({ syllables: { Verse: [8, 6, 8, 6], chorus: '7 7 8' }, scheme: 'XAXA' })).toEqual({
      syllables: { verse: [8, 6, 8, 6], chorus: [7, 7, 8] }, scheme: 'xaxa',
    });
    expect(readDeclared({ scheme: { verse: 'abcb', chorus: 'aabb' } })!.scheme).toEqual({ verse: 'abcb', chorus: 'aabb' });
  });

  it.each([
    ['a negative count', { syllables: [8, -6] }, '/syllables'],
    ['text', { syllables: 'eight six' }, '/syllables'],
    ['a zero', { syllables: '8.0.8' }, '/syllables'],
    ['an empty list', { syllables: [] }, '/syllables'],
    ['a fractional list entry', { syllables: [8, 6.5] }, '/syllables'],
    ['a bare number (8.6 reads as a float)', { syllables: 8.6 }, '/syllables'],
    ['a map with a non-list', { syllables: { verse: 8, chorus: [7, 7, 8] } }, '/syllables/verse'],
    ['a map with a bad list', { syllables: { chorus: [7, 'x'] } }, '/syllables/chorus'],
    ['a scheme with digits', { scheme: 'ab1b' }, '/scheme'],
    ['a scheme that is a list', { scheme: ['a', 'b'] }, '/scheme'],
    ['an empty scheme', { scheme: '' }, '/scheme'],
    ['a scheme map with a number', { scheme: { verse: 4 } }, '/scheme/verse'],
  ])('rejects %s with E_SCHEMA, a pointer and a hint', (_name, meta, pointer) => {
    const e = thrown(() => readDeclared(meta));
    expect(e).toBeInstanceOf(ProseError);
    expect(e.code).toBe('E_SCHEMA');
    expect(e.pointer).toBe(pointer);
    expect(e.hint).toMatch(/8\.6\.8\.6|abcb/);
  });
});

describe('a malformed declared pattern', () => {
  it('stops measure and lint with E_SCHEMA, as a bad target does', () => {
    const text = verse('free-verse', 'one two\nthree four', 'syllables: -3\n');
    const e = thrown(() => lintText(text));
    expect(e.code).toBe('E_SCHEMA');
    expect(e.message).toMatch(/syllables/);
  });

  it('reaches the CLI as an E_SCHEMA error with the pointer and the accepted forms', () => {
    const { status, error } = withDraft(verse('free-verse', 'one two', 'scheme: 4\n'), f => prose('scan', f));
    expect(status).not.toBe(0);
    expect(error).toMatchObject({ code: 'E_SCHEMA', pointer: '/scheme' });
    expect(error.hint).toMatch(/abcb/);
  });

  it('is ignored in a prose form, as the verse keys mean nothing there', () => {
    const r = lintText('---\nform: academic\nsyllables: -3\n---\nThe cat sat on the mat.\n');
    expect(r.ok).toBe(true);
  });
});

describe('hymn words with syllables: 8.6.8.6', () => {
  it('passes with the right counts and the declared pattern is reported', () => {
    const r = lintFixture('hymn-common-meter.md');
    expect(of(r, 'verse.form.syllables')).toEqual([]);
    expect(of(r, 'verse.form.rhyme-scheme')).toEqual([]);
    const v = measure(loadDocument(fixture('verse/hymn-common-meter.md'))).verse!;
    expect(v.declared).toEqual({ syllables: [8, 6, 8, 6], scheme: 'xaxa' });
    expect(v.count).toEqual({ lines: 16, stanzas: 4 });
  });

  it('names the stanza and line of a wrong line, as a warning', () => {
    const r = lintFixture('hymn-common-meter-wrong.md');
    const f = of(r, 'verse.form.syllables');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', at: { line: 18 } });
    expect(f[0]!.message).toBe('Line 18 has 10 syllables; your pattern asks for 8 (stanza 3, line 3)');
    expect(r.warnings).toContain(f[0]);
  });

  it('a wrong line that is also a miss for the scheme warns once for each rule', () => {
    const text = textOf('hymn-common-meter.md').replace('The bells begin to ring', 'The bells begin to chime');
    const r = lintText(text);
    const rhyme = of(r, 'verse.form.rhyme-scheme');
    expect(rhyme).toHaveLength(1);
    expect(rhyme[0]).toMatchObject({ severity: 'warn', at: { line: 14 } });
    expect(rhyme[0]!.message).toMatch(/lines 12 and 14.*"chime" and "sing"/i);
  });
});

describe('words for a 7-7-7-5 tune with scheme: xaxa', () => {
  const stanza = ['Small grey cat sat on the wall', 'Watching all the birds go by', 'Tail curled warm around her paws', 'Dreaming of the sky'];
  const draft = (lines = stanza, front = 'syllables: [7, 7, 7, 5]\nscheme: xaxa\n') => verse('free-verse', `${lines.join('\n')}\n\n${lines.join('\n')}`, front);

  it('passes when lines 2 and 4 rhyme and the counts hold', () => {
    const r = lintText(draft());
    expect(of(r, 'verse.form.syllables')).toEqual([]);
    expect(of(r, 'verse.form.rhyme-scheme')).toEqual([]);
  });

  it('warns when lines 2 and 4 do not rhyme and ignores the x lines', () => {
    const r = lintText(draft(['Small grey cat sat on the wall', 'Watching all the birds go by', 'Tail curled warm around her paws', 'Dreaming of the moon']));
    const f = of(r, 'verse.form.rhyme-scheme');
    expect(f.map(x => x.severity)).toEqual(['warn', 'warn']);
    expect(f.map(x => x.at.line)).toEqual([9, 14]);
    expect(f[0]!.message).toMatch(/lines 7 and 9 \("by" and "moon"\)/i);
  });

  it('x lines never pair: a rhyming 1 and 3 are not required, a non-rhyming pair is not reported', () => {
    const r = lintText(draft(['Small grey cat sat on the wall', 'Watching all the birds go by', 'Tail curled warm around the hall', 'Dreaming of the sky']));
    expect(of(r, 'verse.form.rhyme-scheme')).toEqual([]);
  });

  it('a slant pair is info, not a warning', () => {
    const r = lintText(draft(['Small grey cat sat on the wall', 'Watching all the birds go by', 'Tail curled warm around her paws', 'Dreaming of a bite']));
    expect(of(r, 'verse.form.rhyme-scheme').filter(f => f.severity === 'warn')).toEqual([]);
  });
});

describe('per-section patterns', () => {
  const song = (extra = '') => [
    '---', 'form: song', 'syllables:', '  verse: [8, 6, 8, 6]', '  chorus: [7, 7, 8]', 'scheme:', '  verse: xaxa', '  chorus: aab', '---',
    '[Verse 1]', 'The morning breaks upon the hill', 'And wakes the sleeping town', 'The river runs with silver light', 'Where all the shadows drown', '',
    '[Chorus]', 'Come on home along the shore', 'Come on home and close the door', 'The lamp is lit, the supper spread', '',
    '[Bridge]', 'A line with any number of syllables at all in it', extra,
  ].join('\n');

  it('checks each stanza against its section pattern and leaves a section with none alone', () => {
    const r = lintText(song());
    expect(of(r, 'verse.form.syllables')).toEqual([]);
    expect(of(r, 'verse.form.rhyme-scheme')).toEqual([]);
  });

  it('reports a chorus line against the chorus pattern, not the verse one', () => {
    const r = lintText(song().replace('The lamp is lit, the supper spread', 'The lamp is lit'));
    const f = of(r, 'verse.form.syllables');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toBe('Line 19 has 4 syllables; your pattern asks for 8 (stanza 2, line 3)');
  });

  it('reports a chorus rhyme that fails, with the section scheme aab', () => {
    const r = lintText(song().replace('Come on home and close the door', 'Come on home and close the gate'));
    expect(of(r, 'verse.form.rhyme-scheme').map(f => f.severity)).toEqual(['warn']);
  });

  it('a section base also matches a numbered label and a stanza before any label is unchecked', () => {
    const text = song().replace('[Verse 1]', 'A line before any label\n[Verse 2]');
    expect(of(lintText(text), 'verse.form.syllables')).toEqual([]);
  });
});

describe('a section map that names no section of the draft', () => {
  const body = ['[Verse 1]', 'The morning breaks upon the hill', 'And wakes the sleeping town', 'The river runs with silver light', 'Where all the shadows drown', '', '[Chorus]', 'Come on home along the shore', 'Come on home and close the door'].join('\n');
  const song = (front: string) => verse('song', body, front);

  it('warns when a syllables key matches no section, naming the sections the draft has', () => {
    const f = of(lintText(song('syllables: {vers: [8, 6, 8, 6]}' + '\n')), 'verse.form.syllables');
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warn');
    expect(f[0]!.message).toBe('syllables names section "vers", but the draft has sections: verse, chorus');
  });

  it('warns for a section the draft lacks even when another key matches', () => {
    const f = of(lintText(song('syllables: {verse: [8, 6, 8, 6], bridge: [7, 7]}' + '\n')), 'verse.form.syllables');
    expect(f.map(x => x.message)).toEqual(['syllables names section "bridge", but the draft has sections: verse, chorus']);
  });

  it('warns for a scheme key that matches no section', () => {
    const f = of(lintText(song('scheme: {chorus: aa, vers: abcb}' + '\n')), 'verse.form.rhyme-scheme');
    expect(f.map(x => [x.severity, x.message])).toEqual([['warn', 'scheme names section "vers", but the draft has sections: verse, chorus']]);
  });

  it('warns when a map is declared but the draft has no section labels', () => {
    const text = verse('free-verse', 'one two three' + '\n' + 'four five six', 'syllables: {verse: [3, 3]}' + '\n' + 'scheme: {verse: ab}' + '\n');
    const r = lintText(text);
    expect(of(r, 'verse.form.syllables').map(f => f.message)).toEqual(['syllables is a per-section map but the draft has no section labels; label sections with ## Verse 1 or [Verse 1]']);
    expect(of(r, 'verse.form.rhyme-scheme').map(f => f.message)).toEqual(['scheme is a per-section map but the draft has no section labels; label sections with ## Verse 1 or [Verse 1]']);
  });

  it('is quiet when every key matches a section, a numbered label included, and for a list', () => {
    expect(of(lintText(song('syllables: {verse: [8, 6, 8, 6], chorus: [7, 7]}' + '\n')), 'verse.form.syllables')).toEqual([]);
    expect(of(lintText(verse('free-verse', 'one two three' + '\n' + 'four five six', 'syllables: [3, 3]' + '\n')), 'verse.form.syllables')).toEqual([]);
  });
});

describe('stanza line counts', () => {
  const four = ['The morning breaks upon the hill', 'And wakes the sleeping town', 'The river runs with silver light', 'Where all the shadows drown'];
  it('reports a stanza whose length differs from the pattern once, and does not compare its lines', () => {
    const text = verse('free-verse', `${four.join('\n')}\n\n${[...four, 'And all is still'].join('\n')}`, 'syllables: 8.6.8.6\nscheme: xaxa\n');
    const r = lintText(text);
    const f = of(r, 'verse.form.syllables');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', at: { line: 11 } });
    expect(f[0]!.message).toBe('Stanza 2 has 5 lines; your pattern has 4');
    expect(of(r, 'verse.form.rhyme-scheme')).toEqual([]);
  });

  it('a scheme without a syllable pattern still reports a stanza of the wrong length, once', () => {
    const text = verse('free-verse', `${four.join('\n')}\n\n${four.slice(0, 3).join('\n')}`, 'scheme: xaxa\n');
    const f = of(lintText(text), 'verse.form.rhyme-scheme');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toBe('Stanza 2 has 3 lines; your scheme has 4');
  });
});

describe('syllable ranges', () => {
  it('accepts a line whose range includes the target ("every" is 2 or 3 syllables)', () => {
    const line = 'Every light along the way';
    const v = measureText(verse('free-verse', line, 'syllables: [7]\n'));
    expect(v.lines[0]).toMatchObject({ syllables: 8, syllablesAlt: 7 });
    for (const want of [7, 8]) expect(of(lintText(verse('free-verse', line, `syllables: [${want}]\n`)), 'verse.form.syllables'), String(want)).toEqual([]);
    const f = of(lintText(verse('free-verse', line, 'syllables: [6]\n')), 'verse.form.syllables');
    expect(f[0]!.message).toMatch(/^Line 5 has 7 or 8 syllables; your pattern asks for 6 \(stanza 1, line 1\)/);
  });
});

describe('the declared pattern wins over the form', () => {
  it('a sonnet that declares its own scheme is checked against that one', () => {
    const clean = textOf('sonnet-clean.md');
    expect(of(lintText(clean), 'verse.form.rhyme-scheme')).toEqual([]);
    const declared = clean.replace('---\n', '---\nscheme: aabb\n');
    const f = of(lintText(declared), 'verse.form.rhyme-scheme');
    expect(f.length).toBeGreaterThan(0);
    expect(f.every(x => x.severity === 'warn')).toBe(true);
  });

  it('a declared syllable pattern on a sonnet adds a syllables check the form lacks', () => {
    const declared = textOf('sonnet-clean.md').replace('---\n', '---\nsyllables: [10, 10, 10, 10]\n');
    expect(of(lintText(declared), 'verse.form.syllables').every(x => x.severity === 'warn')).toBe(true);
  });

  it('a declared pattern overrides the haiku count and warns instead of staying soft', () => {
    const text = textOf('haiku-5-6-5.md');
    const soft = of(lintText(text), 'verse.form.syllables');
    expect(soft.map(f => f.severity)).toEqual(['info']);
    const declared = of(lintText(text.replace('---\n', '---\nsyllables: 5.6.5\n')), 'verse.form.syllables');
    expect(declared).toEqual([]);
    const other = of(lintText(text.replace('---\n', '---\nsyllables: 5.7.5\n')), 'verse.form.syllables');
    expect(other.map(f => f.severity)).toEqual(['warn']);
  });
});

describe('without a declared pattern', () => {
  it('a non-haiku form gets no syllables finding and no declared stats', () => {
    for (const name of ['sonnet18.md', 'limerick.md', 'song.md', 'free-verse.md', 'ballad.md']) {
      expect(of(lintFixture(name), 'verse.form.syllables'), name).toEqual([]);
      expect(measure(loadDocument(fixture(`verse/${name}`))).verse!.declared, name).toBeNull();
    }
  });
});

describe('scan output', () => {
  it('JSON carries the declared pattern and each line against it', async () => {
    const out = await run('scan', fixture('verse/hymn-common-meter-wrong.md'));
    expect(out.declared).toEqual({ syllables: [8, 6, 8, 6], scheme: 'xaxa' });
    expect(out.lines[0].declared).toEqual({ want: 8, fit: 'ok' });
    const bad = out.lines.find((l: { line: number }) => l.line === 18);
    expect(bad.declared).toEqual({ want: 8, fit: 'over', diff: 2 });
  });

  it('shows the declared pattern and a per-line fit in --text', () => {
    const { status, stdout } = prose('scan', fixture('verse/hymn-common-meter-wrong.md'), '--text');
    expect(status).toBe(0);
    expect(stdout).toMatch(/Declared: syllables 8\.6\.8\.6; scheme xaxa/);
    expect(stdout).toMatch(/\bwant\b/);
    expect(stdout).toMatch(/^\s*18\s+10\s+8 \+2\s/m);
    expect(stdout).toMatch(/^\s*6\s+8\s+8 ok\s/m);
  });

  it('adds nothing for a draft without a declared pattern', async () => {
    const out = await run('scan', fixture('verse/sonnet18.md'));
    expect(out.declared).toBeNull();
    expect(out.lines[0]).not.toHaveProperty('declared');
  });
});

describe('the rules', () => {
  const byId = (id: string) => RULES.find(r => r.id === id)!;
  it('verse.form.syllables and verse.form.rhyme-scheme cover every verse form', () => {
    const all = FORMS.filter(f => f.verse).map(f => f.id);
    expect(byId('verse.form.syllables').forms).toEqual(all);
    expect(byId('verse.form.rhyme-scheme').forms).toEqual(all);
  });
});

describe('an unknown form', () => {
  it('is still an E_USAGE error from scan, naming the form', () => {
    const { status, error } = withDraft(verse('free-verse', 'one two\nthree four'), f => prose('scan', f, '--form', 'nope'));
    expect(status).not.toBe(0);
    expect(error).toMatchObject({ code: 'E_USAGE' });
    expect(error.message).toMatch(/Unknown form "nope"/);
  });
});
