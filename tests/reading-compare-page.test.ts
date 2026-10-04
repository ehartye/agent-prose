import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildCompare, wordDiff, type UnitCell } from '../src/reading/compare.ts';

const DIR = join(import.meta.dirname, '..', 'runtime', 'reading');
const js = readFileSync(join(DIR, 'app.js'), 'utf8');
const css = readFileSync(join(DIR, 'style.css'), 'utf8');
const window: Record<string, any> = { __READING_TEST__: true };
runInNewContext(js, { window, URLSearchParams, Date, Math, console });
const r = window.__reading;

const cs = (...lines: string[]): UnitCell[] => lines.map(l => { const m = /^([A-Z]+): (.*)$/.exec(l); return m ? { speaker: m[1], text: m[2] } : { text: l }; });
const base = cs('A: One.', 'A: Two is here.', 'B: Three.', 'B: Four.', 'Five.', 'Six.');
const rows = (v: Record<string, UnitCell[]>, hasCurrent = true) => buildCompare(base, Object.entries(v).map(([key, cells]) => ({ key, cells })), hasCurrent)!.rows;

describe('the picker', () => {
  const all = ['1', '2', '3', '4', '5', '6'];
  it('limits columns to three beside Current and four without', () => {
    expect(r.compareLimit(true)).toBe(3);
    expect(r.compareLimit(false)).toBe(4);
  });
  it('starts with the first variants in display order', () => {
    expect(r.shownKeys(all, null, 3)).toEqual(['1', '2', '3']);
    expect(r.shownKeys(all.slice(0, 2), null, 3)).toEqual(['1', '2']);
  });
  it('swaps out the least recently chosen when a further one is chosen at the limit', () => {
    let recent = r.togglePicked(all, null, '5', 3);
    expect(recent).toEqual(['2', '3', '5']);            // 1 was the oldest default
    recent = r.togglePicked(all, recent, '1', 3);
    expect(recent).toEqual(['3', '5', '1']);
    expect(r.shownKeys(all, recent, 3)).toEqual(['1', '3', '5']);   // always shown in display order
  });
  it('hides a shown one, but never the last', () => {
    expect(r.togglePicked(all, ['1', '2'], '1', 3)).toEqual(['2']);
    expect(r.togglePicked(all, ['2'], '2', 3)).toEqual(['2']);
  });
  it('ignores keys that are no longer variants', () => {
    expect(r.shownKeys(['1', '2'], ['9', '2'], 3)).toEqual(['2']);
  });
});

describe('folding', () => {
  const v1 = base.map((b, i) => (i === 2 ? { speaker: 'B', text: 'Three, changed.' } : b));
  const v2 = base.map((b, i) => (i === 4 ? { text: 'Five, changed.' } : b));

  it('folds runs of rows that are the same in every visible column', () => {
    const segs = r.foldSegments(rows({ '1': v1 }), ['1'], true);
    expect(segs.map((s: any) => (s.fold ? `fold${s.rows.length}` : 'row'))).toEqual(['fold2', 'row', 'fold3']);
    expect(segs[0].id).toBe(0);
  });
  it('re-folds when the visible columns change: a row only a hidden variant touches folds', () => {
    const rs = rows({ '1': v1, '2': v2 });
    expect(r.foldSegments(rs, ['1', '2'], true).map((s: any) => (s.fold ? `fold${s.rows.length}` : 'row'))).toEqual(['fold2', 'row', 'fold1', 'row', 'fold1']);
    expect(r.foldSegments(rs, ['1'], true).map((s: any) => (s.fold ? `fold${s.rows.length}` : 'row'))).toEqual(['fold2', 'row', 'fold3']);
    expect(r.foldSegments(rs, ['2'], true).map((s: any) => (s.fold ? `fold${s.rows.length}` : 'row'))).toEqual(['fold4', 'row', 'fold1']);
  });
  it('without a Current column, variants that agree with each other fold even if they differ from the base', () => {
    const same = base.map((b, i) => (i === 1 ? { speaker: 'A', text: 'Two, rewritten.' } : b));
    const rs = rows({ '1': same, '2': same }, false);
    expect(r.rowIsSame(rs[1], ['1', '2'], false)).toBe(true);
    expect(r.rowIsSame(rs[1], ['1', '2'], true)).toBe(false);
  });
  it('never folds an added, a removed or a struck line', () => {
    const added = [...base.slice(0, 2), { text: 'Brand new.' }, ...base.slice(2)];
    const rs = rows({ '1': added });
    expect(rs.some((x: any) => x.base === null && r.rowIsSame(x, ['1'], true))).toBe(false);
    const gone = [...base.slice(0, 3), ...base.slice(4)];
    expect(r.rowIsSame(rows({ '1': gone })[3], ['1'], true)).toBe(false);
    const struck = buildCompare(base, [{ key: '1', cells: base, struck: [1] }], true, [1])!.rows;
    expect(r.rowIsSame(struck[1], ['1'], true)).toBe(false);
  });
  it('labels a fold with its count and where it starts and ends', () => {
    const segs = r.foldSegments(rows({ '1': v1 }), ['1'], true);
    expect(r.foldLabel(segs[0].rows)).toEqual({ text: '2 lines unchanged', where: 'A, line 1 - A, line 2' });
    expect(r.foldLabel(segs[2].rows)).toEqual({ text: '3 lines unchanged', where: 'B, line 4 - line 6' });
    expect(r.foldLabel([segs[0].rows[0]])).toEqual({ text: '1 line unchanged', where: 'A, line 1' });
  });
  it('a draft nobody touched is one fold', () => {
    expect(r.foldSegments(rows({ '1': base, '2': base }), ['1', '2'], true)).toHaveLength(1);
  });
});

describe('units and new words', () => {
  it('numbers a variant line by line, counting the lines before it, skipping a removed one', () => {
    const added = [base[0], { text: 'Brand new.' }, ...base.slice(1)];
    const rs = rows({ '1': added });
    expect(r.unitMap(rs, '1')).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rs.map((x: any, i: number) => x.cells?.['1']?.unit ?? r.unitMap(rs, '1')[i]).slice(0, 3)).toEqual([0, 1, 2]);
    const gone = [...base.slice(0, 2), ...base.slice(3)];
    expect(r.unitMap(rows({ '1': gone }), '1')).toEqual([0, 1, -1, 2, 3, 4]);
  });
  it('agrees with the units the server numbered on every explicit cell', () => {
    const v = [base[0], { text: 'New one.' }, { speaker: 'A', text: 'Two is different now.' }, ...base.slice(2, 4), { text: 'Five, again.' }, base[5]];
    const rs = rows({ '1': v });
    const map = r.unitMap(rs, '1');
    rs.forEach((row: any, i: number) => { const c = row.cells?.['1']; if (c) expect(c.unit).toBe(map[i]); });
  });
  it('counts the words of added lines and the + words of changed ones, not the unchanged ones', () => {
    const v = [base[0], { speaker: 'A', text: 'Two is here, truly.' }, { text: 'Brand new aside here.' }, ...base.slice(2)];
    expect(r.newWords(rows({ '1': v }), '1')).toBe(2 + 4);   // "here, truly." on the changed line, four words on the added one
  });
  it('is zero for an unchanged variant', () => { expect(r.newWords(rows({ '1': base }), '1')).toBe(0); });
});

describe('the Current line with several variants', () => {
  const cell = (a: string, b: string) => ({ ops: wordDiff(a, b), text: b, unit: 0 });
  const text = 'Does the feeling get its own form or are you billing it by the hour?';
  const v = (to: string) => cell(text, to);

  it('strikes a word solid when every visible variant cut it, dashed when only some did, and lists who', () => {
    const a = v('Does the feeling get its own form');                          // cuts "or are you billing it by the hour?"
    const b = v('Does the feeling get its own form or are you billing it');    // cuts "by the hour?"
    const runs = r.curRuns(text, [{ label: 'A', cell: a }, { label: 'B', cell: b }]);
    expect(runs.map((x: any) => [x.text.trim(), x.cut, x.by.join('')])).toEqual([
      ['Does the feeling get its own form', null, ''],
      ['or are you billing it', 'some', 'A'],
      ['by the hour?', 'all', 'AB'],
    ]);
  });
  it('with one visible variant (the phone) it is exactly that variant’s cuts, always solid', () => {
    const runs = r.curRuns(text, [{ label: 'A', cell: v('Does the feeling get its own form') }]);
    expect(runs.filter((x: any) => x.cut).map((x: any) => [x.cut, x.text.trim()])).toEqual([['all', 'or are you billing it by the hour?']]);
  });
  it('an unchanged variant cuts nothing, so a word one variant cut is only dashed', () => {
    const runs = r.curRuns(text, [{ label: 'A', cell: v('Does the feeling.') }, { label: 'B', cell: undefined }]);
    expect(runs.some((x: any) => x.cut === 'all')).toBe(false);
    expect(runs.some((x: any) => x.cut === 'some')).toBe(true);
  });
  it('a variant with no line there cuts every word', () => {
    const runs = r.curRuns('One two.', [{ label: 'A', cell: null }]);
    expect(runs).toEqual([{ text: 'One two.', cut: 'all', by: ['A'] }]);
  });
  it('ops that do not describe the text cut nothing, and the runs always rebuild the text', () => {
    const runs = r.curRuns('a b c', [{ label: 'A', cell: { ops: [['-', 'x y '], ['=', 'z z z z']] } }]);
    expect(runs.map((x: any) => x.cut)).toEqual([null]);
    for (const t of [text, 'a  b', 'x']) expect(r.curRuns(t, [{ label: 'A', cell: v('Does') }]).map((x: any) => x.text).join('').replace(/\s+/g, ' ').trim()).toBe(t.replace(/\s+/g, ' ').trim());
  });
});

describe('variant cell runs', () => {
  it('shows = words plain and + words as new; cut words are not shown in a variant', () => {
    expect(r.cellRuns({ unit: 0, text: 'a b c', ops: [['=', 'a '], ['-', 'x '], ['+', 'b c']] }, false)).toEqual([{ text: 'a ', fresh: false }, { text: 'b c', fresh: true }]);
  });
  it('shows an added line whole as new, and a plain cell as plain', () => {
    expect(r.cellRuns({ unit: 0, text: 'All new.' }, true)).toEqual([{ text: 'All new.', fresh: true }]);
    expect(r.cellRuns({ unit: 0, text: 'Struck.', struck: true }, false)).toEqual([{ text: 'Struck.', fresh: false }]);
    expect(r.cellRuns(null, false)).toEqual([]);
  });
  it('says Kept and Passed in words', () => {
    expect([r.stateWord('keep'), r.stateWord('pass'), r.stateWord(null)]).toEqual(['Kept', 'Passed', '']);
  });
});

describe('the page source for the compare view', () => {
  it('builds the marks with createElementNS and no style attribute, and puts every word in as a text node', () => {
    expect(js).toContain('createElementNS');
    expect(js).not.toMatch(/setAttribute\(\s*['"]style/);
    expect(js).toContain("'aria-hidden': 'true'");
    expect(js).toContain('pathLength');
  });
  it('draws a mark once, by a class when the state changes, never by a timer', () => {
    expect(js).toContain('ui.drawn');
    expect(js).not.toMatch(/setTimeout\([^)]*draw/);
    expect(css).toMatch(/@keyframes draw/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[^}]*\{[\s\S]*\.badge path[^}]*stroke-dashoffset: 0/);
  });
  it('keeps a 44 px fold bar and a passed column at full opacity', () => {
    expect(css).toMatch(/\.fold button \{[^}]*min-height: 44px/);
    expect(css).not.toMatch(/\.passed[^{]*\{[^}]*opacity:\s*0?\.6/);
  });
  it('restores focus to the same control after a render, by a stable key', () => {
    expect(js).toContain('data-key');
  });
});
