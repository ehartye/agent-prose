import { describe, expect, it } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { checkSet } from '../src/owner/check.ts';
import { OriginalSchema, draftHash, isStale } from '../src/owner/original.ts';
import { setDir } from '../src/owner/paths.ts';
import { textHash } from '../src/owner/prediction.ts';
import { SetSchema, createSet, readSet, variantPath } from '../src/owner/sets.ts';
import { BASE, tmpProject, useTmp } from './owner-helpers.ts';
import { fixture, run } from './helpers.ts';

useTmp();
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

const HASH = 'a'.repeat(64);
const line = { ref: '5', text: 'Hello.' };
const GATE = readFileSync(fixture('gate.dialog.yaml'), 'utf8');
const PILOT = readFileSync(fixture('pilot.fountain'), 'utf8');
/** Header on lines 1-3, a blank, then one paragraph on line 5 and a second on line 7. */
const TWO = BASE.replace(/\n$/, '') + '\n\nSecond paragraph here.\n';

describe('OriginalSchema', () => {
  it('needs a source, a 64-hex draft hash and one to twenty lines', () => {
    expect(OriginalSchema.safeParse({ source: 't.md', draftHash: HASH, lines: [line] }).success).toBe(true);
    expect(OriginalSchema.safeParse({ source: 't.md', draftHash: HASH, lines: [] }).success).toBe(false);
    expect(OriginalSchema.safeParse({ source: 't.md', draftHash: HASH, lines: Array.from({ length: 21 }, () => line) }).success).toBe(false);
    expect(OriginalSchema.safeParse({ source: 't.md', draftHash: 'abc', lines: [line] }).success).toBe(false);
    expect(OriginalSchema.safeParse({ draftHash: HASH, lines: [line] }).success).toBe(false);
  });

  it('limits a ref to a line or a range, the text to 2000, and is strict', () => {
    const ok = (l: object) => OriginalSchema.safeParse({ source: 't.md', draftHash: HASH, lines: [l] }).success;
    expect(ok({ ref: '12-13', text: 'x' })).toBe(true);
    expect(ok({ ref: '12-', text: 'x' })).toBe(false);
    expect(ok({ ref: 'a', text: 'x' })).toBe(false);
    expect(ok({ ref: '1', text: '' })).toBe(false);
    expect(ok({ ref: '1', text: 'x'.repeat(2000) })).toBe(true);
    expect(ok({ ref: '1', text: 'x'.repeat(2001) })).toBe(false);
    expect(ok({ ref: '1', text: 'x', speaker: '' })).toBe(false);
    expect(ok({ ref: '1', text: 'x', mood: 'sad' })).toBe(false);
    expect(OriginalSchema.safeParse({ source: 't.md', draftHash: HASH, lines: [line], extra: 1 }).success).toBe(false);
  });

  it('is optional on a set: an older set.json reads unchanged, and a bad original is E_SCHEMA at /original', () => {
    const p = tmpProject();
    createSet(p.project, p.write('t.md', BASE), { id: 'old' });
    const file = join(setDir(p.project, 'old'), 'set.json');
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    expect('original' in raw).toBe(false);
    expect(readSet(p.project, 'old').original).toBeUndefined();
    expect(SetSchema.safeParse({ ...raw, original: { source: 't.md', draftHash: HASH, lines: [line] } }).success).toBe(true);
    writeFileSync(file, JSON.stringify({ ...raw, original: { source: 't.md', draftHash: 'nope', lines: [line] } }));
    try { readSet(p.project, 'old'); throw new Error('expected an error'); } catch (e) {
      expect((e as ProseError).code).toBe('E_SCHEMA');
      expect((e as ProseError).pointer).toMatch(/^\/original/);
    }
  });
});

describe('createSet with lines', () => {
  it('snapshots the draft hash, the source and the selected text', () => {
    const p = tmpProject();
    const draft = p.write('t.md', TWO);
    const s = createSet(p.project, draft, { id: 'rev', lines: '7' });
    expect(s.original).toEqual({ source: 't.md', draftHash: textHash(TWO), lines: [{ ref: '7', text: 'Second paragraph here.' }] });
    expect(s.original!.source).toBe(s.source);
    expect(readSet(p.project, 'rev').original).toEqual(s.original);
  });

  it('records nothing without lines: a new line shows no current line', () => {
    const p = tmpProject();
    expect(createSet(p.project, p.write('t.md', TWO), { id: 'new' }).original).toBeUndefined();
  });

  it('a Markdown block is one entry however many sentences it has, and a line inside it names the block', () => {
    const p = tmpProject();
    const s = createSet(p.project, p.write('t.md', TWO), { id: 'rev', lines: '5' });
    expect(s.original!.lines).toHaveLength(1);
    expect(s.original!.lines[0].ref).toBe('5');
    expect(s.original!.lines[0].text).toMatch(/^We built the bridge in the rain, in the dark, .* Today it carries a thousand people a day\.$/);
  });

  it('takes the speaker apart from the text for Fountain and dialog', () => {
    const p = tmpProject();
    const f = createSet(p.project, p.write('p.fountain', PILOT), { id: 'f', lines: '11,12' });
    expect(f.original!.lines).toEqual([{ ref: '11', text: '(under her breath)' }, { ref: '12', speaker: 'MAYA', text: 'Nobody told me the quiet would be the hard part.' }]);
    const d = createSet(p.project, p.write('g.dialog.yaml', GATE), { id: 'd', lines: '15,33-34' });
    expect(d.original!.lines.map(l => [l.ref, l.speaker, l.text])).toEqual([
      ['15', 'GUARD', "Market's that way."], ['33', 'GUARD', 'Quiet night on the wall.'], ['34', 'GUARD', 'Quiet night on the wall again.'],
    ]);
  });

  it('keeps the draft order and drops duplicate refs', () => {
    const p = tmpProject();
    const s = createSet(p.project, p.write('g.dialog.yaml', GATE), { id: 'd', lines: '19, 6, 6, 19' });
    expect(s.original!.lines.map(l => l.ref)).toEqual(['6', '19']);
  });

  it('a ref that holds no unit is E_USAGE naming the refs that exist, and no set is left behind', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', TWO);
    const e = await fail('set', 'new', draft, '--id', 'rev', '--lines', '99');
    expect(e.code).toBe('E_USAGE');
    expect(e.hint).toBe('Units: 5, 7');
    expect((await fail('set', 'new', draft, '--lines', 'five')).code).toBe('E_USAGE');
    expect((await run('set', 'list', '--dir', p.project)).sets).toEqual([]);
  });

  it('refuses a selection of more than twenty lines', () => {
    const p = tmpProject();
    const many = p.write('many.md', Array.from({ length: 25 }, (_, k) => `Paragraph number ${k + 1}.`).join('\n\n') + '\n');
    expect(code(() => createSet(p.project, many, { lines: '1-60' }))).toBe('E_USAGE');
    expect(createSet(p.project, many, { lines: '1-39' }).original!.lines).toHaveLength(20);
  });

  it('cuts text past 2000 characters with an ellipsis instead of refusing', () => {
    const p = tmpProject();
    const s = createSet(p.project, p.write('long.md', 'x'.repeat(2500) + '\n'), { id: 'long', lines: '1' });
    expect(s.original!.lines[0].text).toHaveLength(2000);
    expect(s.original!.lines[0].text.endsWith('…')).toBe(true);
  });

  it('reads a CRLF draft with a BOM the same way, and hashes it as the page does', () => {
    const p = tmpProject();
    const plain = createSet(p.project, p.write('a.md', TWO), { id: 'a', lines: '7' });
    const crlf = '﻿' + TWO.replace(/\n/g, '\r\n');
    const b = createSet(p.project, p.write('b.md', crlf), { id: 'b', lines: '7' });
    expect(b.original!.lines).toEqual(plain.original!.lines);
    expect(b.original!.draftHash).toBe(plain.original!.draftHash);
    expect(draftHash(crlf)).toBe(textHash(crlf));
  });

  it('the original is not a variant: the set still has only its own variants', () => {
    const p = tmpProject();
    const s = createSet(p.project, p.write('t.md', TWO), { id: 'rev', lines: '7', count: 3 });
    expect(s.variants.map(v => v.index)).toEqual([1, 2, 3]);
    const check = checkSet(p.project, s);
    expect(check.variants.map(v => v.index)).toEqual([1, 2, 3]);
  });
});

describe('prose set new --lines, set show and stale', () => {
  it('echoes the original on creation and says null without --lines', async () => {
    const p = tmpProject();
    const draft = p.write('g.dialog.yaml', GATE);
    const rev = await run('set', 'new', draft, '--id', 'rev', '--lines', '15');
    expect(rev.original).toEqual({ source: 'g.dialog.yaml', lines: [{ ref: '15', speaker: 'GUARD', text: "Market's that way." }], stale: false });
    expect((await run('set', 'new', draft, '--id', 'plain')).original).toBeNull();
  });

  it('show carries the original with stale false, and null for a set made without lines', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', TWO);
    await run('set', 'new', draft, '--id', 'rev', '--lines', '7');
    await run('set', 'new', draft, '--id', 'plain');
    expect((await run('set', 'show', 'rev', '--dir', p.project)).original).toEqual({ source: 't.md', lines: [{ ref: '7', speaker: null, text: 'Second paragraph here.' }], stale: false });
    expect((await run('set', 'show', 'plain', '--dir', p.project)).original).toBeNull();
  });

  it('reports stale once the draft changes, and fresh again when it is put back', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', TWO);
    await run('set', 'new', draft, '--id', 'rev', '--lines', '7');
    const stale = async () => (await run('set', 'show', 'rev', '--dir', p.project)).original.stale;
    writeFileSync(draft, TWO.replace('Second', 'Third'));
    expect(await stale()).toBe(true);
    writeFileSync(draft, TWO);
    expect(await stale()).toBe(false);
  });

  it('an edit elsewhere in the draft is stale too, and a line-ending-only change is not', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', TWO);
    await run('set', 'new', draft, '--id', 'rev', '--lines', '7');
    writeFileSync(draft, TWO.replace('bridge', 'viaduct'));
    expect((await run('set', 'show', 'rev', '--dir', p.project)).original.stale).toBe(true);
    writeFileSync(draft, '﻿' + TWO.replace(/\n/g, '\r\n'));
    expect((await run('set', 'show', 'rev', '--dir', p.project)).original.stale).toBe(false);
  });

  it('a deleted draft is stale, and the snapshot still shows what was asked', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', TWO);
    await run('set', 'new', draft, '--id', 'rev', '--lines', '7');
    rmSync(draft);
    const shown = (await run('set', 'show', 'rev', '--dir', p.project)).original;
    expect(shown.stale).toBe(true);
    expect(shown.lines[0].text).toBe('Second paragraph here.');
    expect(isStale(p.project, readSet(p.project, 'rev').original!)).toBe(true);
  });

  it('a refine round made from a champion file records no original, even while --lines works on it', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', TWO);
    await run('set', 'new', draft, '--id', 'rev', '--lines', '7');
    const champion = join(setDir(p.project, 'rev'), 'v2.md');
    const round = await run('set', 'new', champion, '--id', 'next');
    expect(round.original).toBeNull();
    expect(readSet(p.project, 'next').original).toBeUndefined();
  });

  it('does not change the brief or the variants of the set', async () => {
    const p = tmpProject();
    const out = await run('set', 'new', p.write('t.md', TWO), '--id', 'rev', '--lines', '7', '--character', 'Dry', '--brief-confirmed');
    expect(out.brief).toMatchObject({ character: 'Dry', confirmed: true });
    expect(out.variants).toHaveLength(3);
    expect(out.next).toMatch(/prose set check rev/);
  });
});

describe('set check: outside-selection-changed', () => {
  const setup = () => {
    const p = tmpProject();
    const draft = p.write('t.md', TWO);
    const s = createSet(p.project, draft, { id: 'rev', lines: '7', count: 2 });
    const write = (k: number, text: string) => writeFileSync(variantPath(p.project, s, s.variants[k]), text);
    return { p, s, write };
  };

  it('is silent when only the selected line changed', () => {
    const { p, s, write } = setup();
    write(0, TWO.replace('Second paragraph here.', 'Another closing thought entirely.'));
    write(1, TWO.replace('Second paragraph here.', 'A different second paragraph.'));
    expect(checkSet(p.project, s).variants.flatMap(v => v.warnings.filter(w => w.startsWith('outside-selection-changed')))).toEqual([]);
  });

  it('warns for a variant that altered a line outside the selection, naming it', () => {
    const { p, s, write } = setup();
    write(0, TWO.replace('Second paragraph here.', 'Another closing thought entirely.').replace('four years', 'five winters'));
    write(1, TWO.replace('Second paragraph here.', 'A different second paragraph.'));
    const [a, b] = checkSet(p.project, s).variants;
    expect(a.warnings.some(w => /^outside-selection-changed: 1 line outside the selection changed/.test(w))).toBe(true);
    expect(b.warnings.some(w => w.startsWith('outside-selection-changed'))).toBe(false);
  });

  it('a deleted outside line counts, and the warning never rejects the variant', () => {
    const { p, s, write } = setup();
    write(0, TWO.replace('Second paragraph here.', 'Another closing thought entirely.').replace(/^We built.*\n/m, ''));
    write(1, TWO.replace('Second paragraph here.', 'A different second paragraph.'));
    const a = checkSet(p.project, s).variants[0];
    expect(a.warnings.some(w => w.startsWith('outside-selection-changed'))).toBe(true);
    expect(a.status).toBe('ok');
  });

  it('is not raised for a set without an original', () => {
    const p = tmpProject();
    const s = createSet(p.project, p.write('t.md', TWO), { id: 'plain', count: 2 });
    writeFileSync(variantPath(p.project, s, s.variants[0]), TWO.replace('bridge', 'viaduct'));
    expect(checkSet(p.project, s).variants[0].warnings.some(w => w.startsWith('outside-selection-changed'))).toBe(false);
  });

  it('works for a dialog draft: the speaker is part of the line that stayed put', () => {
    const p = tmpProject();
    const s = createSet(p.project, p.write('g.dialog.yaml', GATE), { id: 'd', lines: '15', count: 2 });
    writeFileSync(variantPath(p.project, s, s.variants[0]), GATE.replace("Market's that way.", 'Stalls are down the hill.'));
    writeFileSync(variantPath(p.project, s, s.variants[1]), GATE.replace("Market's that way.", 'Try the square.').replace('Go on, then.', 'Off you go.'));
    const [a, b] = checkSet(p.project, s).variants;
    expect(a.warnings.some(w => w.startsWith('outside-selection-changed'))).toBe(false);
    expect(b.warnings.some(w => w.startsWith('outside-selection-changed'))).toBe(true);
  });
});
