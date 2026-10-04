import { describe, expect, it } from 'vitest';
import { MAX_COMPARE_ROWS, alignUnits, buildCompare, unitCells, wordDiff, type Cell, type Compare, type Op, type UnitCell } from '../src/reading/compare.ts';

/** "SPEAKER: text" becomes a cell with a speaker; anything else is plain text. */
const c = (s: string): UnitCell => { const m = /^([A-Z]+): (.*)$/.exec(s); return m ? { speaker: m[1], text: m[2] } : { text: s }; };
const cs = (...lines: string[]): UnitCell[] => lines.map(c);
const lines = (n: number, tag = 'line'): string[] => Array.from({ length: n }, (_, i) => `${tag} number ${i + 1} says something particular about topic ${i + 1}.`);

/** Every base unit and every variant unit used exactly once, in increasing order. */
function checkSteps(nb: number, nv: number, steps: ReturnType<typeof alignUnits>): void {
  const bs = steps.filter(s => s.b !== undefined).map(s => s.b!);
  const vs = steps.filter(s => s.v !== undefined).map(s => s.v!);
  expect(bs).toEqual(Array.from({ length: nb }, (_, i) => i));
  expect(vs).toEqual(Array.from({ length: nv }, (_, i) => i));
}
const rowOf = (cmp: Compare, base: number) => cmp.rows.find(r => r.base === base)!;
const apply = (ops: Op[], kinds: string): string => ops.filter(([k]) => kinds.includes(k)).map(([, t]) => t).join('').replace(/\s+/g, ' ').trim();

describe('wordDiff', () => {
  it('marks inserted, cut and replaced words', () => {
    expect(wordDiff('a b c', 'a b c d')).toEqual([['=', 'a b c '], ['+', 'd']]);
    expect(wordDiff('a b c d', 'a b c')).toEqual([['=', 'a b c '], ['-', 'd']]);
    expect(wordDiff('the cat sat', 'the dog sat')).toEqual([['=', 'the '], ['-', 'cat '], ['+', 'dog '], ['=', 'sat']]);
  });
  it('is identity for equal text, and empty on both sides is no ops', () => {
    expect(wordDiff('same words here', 'same words here')).toEqual([['=', 'same words here']]);
    expect(wordDiff('', '')).toEqual([]);
  });
  it('treats an empty side as all cut or all new', () => {
    expect(wordDiff('only base', '')).toEqual([['-', 'only base']]);
    expect(wordDiff('', 'only variant')).toEqual([['+', 'only variant']]);
  });
  it('compares punctuation and case exactly', () => {
    expect(wordDiff('Hello, world.', 'Hello world.')).toEqual([['-', 'Hello, '], ['+', 'Hello '], ['=', 'world.']]);
    expect(wordDiff('Fine', 'fine')).toEqual([['-', 'Fine '], ['+', 'fine']]);
  });
  it('handles unicode, accents, curly quotes and emoji as plain tokens', () => {
    expect(wordDiff('café “quoted” naïve', 'café “quoted” naive 🙂')).toEqual([['=', 'café “quoted” '], ['-', 'naïve '], ['+', 'naive 🙂']]);
    expect(wordDiff('日本語 の 文', '日本語 の 文章')).toEqual([['=', '日本語 の '], ['-', '文 '], ['+', '文章']]);
  });
  it('collapses runs of whitespace between words', () => {
    expect(wordDiff('a   b', 'a b')).toEqual([['=', 'a b']]);
  });
  it('keeps repeated words in order', () => {
    const ops = wordDiff('no no no way', 'no way no way');
    expect(apply(ops, '=-')).toBe('no no no way');
    expect(apply(ops, '=+')).toBe('no way no way');
  });
  it('falls back to one cut run and one new run above 120 tokens', () => {
    const big = Array.from({ length: 121 }, (_, i) => `w${i}`).join(' ');
    expect(wordDiff(big, `${big} x`)).toEqual([['-', `${big} `], ['+', `${big} x`]]);
    expect(wordDiff('a b', big)).toEqual([['-', 'a b '], ['+', big]]);
  });
  it('round-trips: the = and - words are the base, the = and + words are the variant (random token lists)', () => {
    let seed = 12345;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const vocab = ['a', 'b', 'c', 'd', 'e', 'a,', 'B', 'ü'];
    const list = () => Array.from({ length: Math.floor(rand() * 14) }, () => vocab[Math.floor(rand() * vocab.length)]).join(' ');
    for (let k = 0; k < 300; k++) {
      const a = list(), b = list();
      const ops = wordDiff(a, b);
      expect(apply(ops, '=-')).toBe(a);
      expect(apply(ops, '=+')).toBe(b);
      ops.slice(0, -1).forEach(([, t]) => expect(t.endsWith(' ')).toBe(true));
    }
  });
  it('never puts markup in an op: the text is returned as typed', () => {
    expect(wordDiff('<b>x</b> y', '<i>x</i> y')).toEqual([['-', '<b>x</b> '], ['+', '<i>x</i> '], ['=', 'y']]);
  });
});

describe('alignUnits', () => {
  it('pairs identical texts one to one', () => {
    const t = cs(...lines(5));
    const steps = alignUnits(t, t);
    checkSteps(5, 5, steps);
    expect(steps.every(s => s.b === s.v)).toBe(true);
  });
  it('pairs a changed unit by position and keeps the rest anchored', () => {
    const base = cs(...lines(6));
    const v = cs(...lines(6)); v[3] = c('A completely rewritten fourth line.');
    const steps = alignUnits(base, v);
    checkSteps(6, 6, steps);
    expect(steps.find(s => s.b === 3)).toEqual({ b: 3, v: 3 });
  });
  it('a variant that adds lines is extra rows, not a shift of every later line', () => {
    const base = cs(...lines(6));
    const v = [...base.slice(0, 2), c('Brand new aside one.'), c('Brand new aside two.'), ...base.slice(2)];
    const steps = alignUnits(base, v);
    checkSteps(6, 8, steps);
    expect(steps.filter(s => s.b !== undefined && s.v !== undefined).map(s => [s.b, s.v])).toEqual([[0, 0], [1, 1], [2, 4], [3, 5], [4, 6], [5, 7]]);
    expect(steps.filter(s => s.b === undefined).map(s => s.v)).toEqual([2, 3]);
  });
  it('a variant that removes a line leaves a gap (a base unit alone)', () => {
    const base = cs(...lines(6));
    const v = [...base.slice(0, 3), ...base.slice(4)];
    const steps = alignUnits(base, v);
    checkSteps(6, 5, steps);
    expect(steps).toContainEqual({ b: 3 });
    expect(steps.filter(s => s.b !== undefined && s.v !== undefined)).toHaveLength(5);
  });
  it('adds and removes in one variant', () => {
    const base = cs(...lines(8));
    const v = [base[0], c('Inserted near the start.'), ...base.slice(2, 5), ...base.slice(6)];
    checkSteps(8, 7, alignUnits(base, v));
  });
  it('reordered units: both sides keep every unit once, in order', () => {
    const base = cs(...lines(5));
    const v = [base[2], base[0], base[1], base[4], base[3]];
    checkSteps(5, 5, alignUnits(base, v));
  });
  it('entirely different text pairs by position when the counts match, and pairs nothing when they differ and nothing is similar', () => {
    const base = cs('alpha one', 'beta two', 'gamma three');
    const same = alignUnits(base, cs('zebra', 'yak', 'xerus'));
    checkSteps(3, 3, same);
    expect(same.filter(s => s.b !== undefined && s.v !== undefined)).toHaveLength(3);
    const more = alignUnits(base, cs('zebra', 'yak', 'xerus', 'wombat', 'vole'));
    checkSteps(3, 5, more);
    expect(more.filter(s => s.b !== undefined && s.v !== undefined)).toHaveLength(0);
  });
  it('pairs a rewritten line with its source by similarity when counts differ', () => {
    const base = cs('Dust settles over the empty market square.', 'Nobody has bought bread here in years.', 'The bell tower leans and creaks.');
    const v = cs('A new first line about nothing at all.', 'Nobody has bought any bread here in years.', 'The bell tower leans and creaks.', 'And one more closing remark appended.');
    const steps = alignUnits(base, v);
    checkSteps(3, 4, steps);
    expect(steps).toContainEqual({ b: 1, v: 1 });
  });
  it('does not pair units that share nothing (below 0.2) when counts differ', () => {
    const base = cs('Alpha beta gamma delta.', 'Epsilon zeta eta theta.');
    const v = cs('Alpha beta gamma delta.', 'Quick brown fox jumps.', 'Over the lazy dog.');
    const steps = alignUnits(base, v);
    checkSteps(2, 3, steps);
    expect(steps.filter(s => s.b === undefined).map(s => s.v)).toContain(2);
  });
  it('speaker is part of identity', () => {
    const base = cs('MARA: Not tonight.');
    const v = cs('JOSE: Not tonight.');
    const row = buildCompare(base, [{ key: '1', cells: v }], true)!.rows[0];
    expect(row.same).toBeUndefined();
    expect(row.cells!['1']!.speaker).toBe('JOSE');
  });
  it('whitespace is collapsed and case is kept when deciding "same"', () => {
    expect(buildCompare(cs('Hello   there.'), [{ key: '1', cells: cs('Hello there.') }], true)!.rows[0].same).toBe(true);
    expect(buildCompare(cs('Hello there.'), [{ key: '1', cells: cs('hello there.') }], true)!.rows[0].same).toBeUndefined();
  });
  it('handles an empty variant and an empty base', () => {
    checkSteps(3, 0, alignUnits(cs(...lines(3)), []));
    checkSteps(0, 3, alignUnits([], cs(...lines(3))));
    checkSteps(0, 0, alignUnits([], []));
  });
  it('past 400 by 400 the middle is one gap, paired by position, and every unit is still used once', () => {
    const base = cs(...lines(450, 'base'));
    const v = cs(...lines(450, 'variant'));
    const steps = alignUnits(base, v);
    checkSteps(450, 450, steps);
    expect(steps.every(s => s.b === s.v)).toBe(true);
  });
  it('past 20 by 20 inside a gap pairs by position', () => {
    const base = cs('keep one', ...lines(25, 'old'), 'keep two');
    const v = cs('keep one', ...lines(30, 'new'), 'keep two');
    const steps = alignUnits(base, v);
    checkSteps(27, 32, steps);
    expect(steps.filter(s => s.b !== undefined && s.v !== undefined)).toHaveLength(27);
  });
  it('is deterministic', () => {
    const base = cs(...lines(12));
    const v = [base[0], c('x y z'), ...base.slice(3, 9), c('p q'), c('r s')];
    expect(alignUnits(base, v)).toEqual(alignUnits(base, v));
  });
  it('stays fast at the bounds', () => {
    const base = cs(...lines(400, 'a'));
    const v = cs(...lines(400, 'b'));
    const t = Date.now();
    alignUnits(base, v);
    expect(Date.now() - t).toBeLessThan(1500);
  });
});

describe('buildCompare', () => {
  const base = cs('SCOUT: Hold the gate.', 'MARA: Not tonight.', 'Rain on the window.', 'MARA: Please.', 'The kettle screams.');
  it('is identical rows for identical variants: every row same, no cells', () => {
    const cmp = buildCompare(base, [{ key: '1', cells: base }, { key: '2', cells: base }], true)!;
    expect(cmp.rows).toHaveLength(5);
    expect(cmp.rows.every(r => r.same && r.cells === undefined && r.cur !== null)).toBe(true);
  });
  it('one changed unit: that row carries ops for the variant that changed, and a missing key means unchanged', () => {
    const v1 = cs(...[ 'SCOUT: Hold the gate.', 'MARA: Not tonight, please.', 'Rain on the window.', 'MARA: Please.', 'The kettle screams.' ]);
    const cmp = buildCompare(base, [{ key: '1', cells: v1 }, { key: '2', cells: base }], true)!;
    expect(cmp.rows.filter(r => !r.same).map(r => r.base)).toEqual([1]);
    const row = rowOf(cmp, 1);
    expect(row.cells!['2']).toBeUndefined();
    expect(row.cells!['1']).toMatchObject({ unit: 1, speaker: 'MARA', text: 'Not tonight, please.' });
    expect(row.cells!['1']!.ops).toEqual([['=', 'Not '], ['-', 'tonight. '], ['+', 'tonight, please.']]);
    expect(row.cur).toEqual({ unit: 1, speaker: 'MARA', text: 'Not tonight.' });
  });
  it('variants that add different numbers of lines share insertion rows and leave the other cells empty', () => {
    const v1 = [...base.slice(0, 2), c('Added one.'), ...base.slice(2)];
    const v2 = [...base.slice(0, 2), c('Other one.'), c('Other two.'), ...base.slice(2)];
    const cmp = buildCompare(base, [{ key: '1', cells: v1 }, { key: '2', cells: v2 }], true)!;
    expect(cmp.rows.map(r => r.base)).toEqual([0, 1, null, null, 2, 3, 4]);
    expect(cmp.rows[2].cur).toBeNull();
    expect(cmp.rows[2].cells!['1']).toMatchObject({ unit: 2, text: 'Added one.' });
    expect(cmp.rows[2].cells!['1']!.ops).toBeUndefined();
    expect(cmp.rows[2].cells!['2']).toMatchObject({ unit: 2, text: 'Other one.' });
    expect(cmp.rows[3].cells!['1']).toBeNull();
    expect(cmp.rows[3].cells!['2']).toMatchObject({ unit: 3, text: 'Other two.' });
    // later rows are not shifted: base row 2 still holds the variants' units 3 and 4
    expect(rowOf(cmp, 2).same).toBe(true);
  });
  it('a removed line is a null cell on its base row', () => {
    const v = [...base.slice(0, 2), ...base.slice(3)];
    const cmp = buildCompare(base, [{ key: '1', cells: v }], true)!;
    expect(rowOf(cmp, 2).cells).toEqual({ '1': null });
    expect(rowOf(cmp, 3).same).toBe(true);
  });
  it('lines added before the first and after the last unit get rows too', () => {
    const v = [c('Before.'), ...base, c('After.')];
    const cmp = buildCompare(base, [{ key: '1', cells: v }], true)!;
    expect(cmp.rows[0].base).toBeNull();
    expect(cmp.rows.at(-1)!.base).toBeNull();
    expect(cmp.rows.at(-1)!.cells!['1']).toMatchObject({ unit: 6, text: 'After.' });
  });
  it('one column and six variants both work, each variant unit appearing exactly once', () => {
    const six = Array.from({ length: 6 }, (_, k) => ({ key: String(k + 1), cells: base.map((b, i) => (i === k % 5 ? c(`Changed by ${k + 1}.`) : b)) }));
    const cmp = buildCompare(base, six, false)!;
    expect(cmp.hasCurrent).toBe(false);
    for (const v of six) {
      const units: number[] = [];
      for (const r of cmp.rows) {
        const cell: Cell | null | undefined = r.same ? r.cur : r.cells?.[v.key] === undefined ? r.cur : r.cells[v.key];
        if (cell) units.push(cell.unit);
      }
      expect(units.sort((a, b) => a - b)).toEqual(v.cells.map((_, i) => i));
    }
    expect(buildCompare(base, [six[0]], true)!.rows).toHaveLength(5);
  });
  it('flags struck units without folding them', () => {
    const cmp = buildCompare(base, [{ key: '1', cells: base, struck: [2] }], true, [2])!;
    expect(rowOf(cmp, 2).same).toBeUndefined();
    expect(rowOf(cmp, 2).cur!.struck).toBe(true);
    expect(rowOf(cmp, 2).cells!['1']!.struck).toBe(true);
  });
  it('is null when there is nothing to compare, past 1,500 units, or past 600 rows', () => {
    expect(buildCompare(base, [], true)).toBeNull();
    expect(buildCompare(cs(...lines(1501)), [{ key: '1', cells: cs(...lines(3)) }], true)).toBeNull();
    expect(buildCompare(cs(...lines(MAX_COMPARE_ROWS)), [{ key: '1', cells: cs(...lines(MAX_COMPARE_ROWS)) }], true)).not.toBeNull();
    expect(buildCompare(cs(...lines(MAX_COMPARE_ROWS)), [{ key: '1', cells: [...cs(...lines(MAX_COMPARE_ROWS)), c('extra')] }], true)).toBeNull();
  });
  it('is deterministic and puts no markup in any field', () => {
    const v = [base[0], c('<script>alert(1)</script> ok'), ...base.slice(2)];
    const a = buildCompare(base, [{ key: '1', cells: v }], true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(buildCompare(base, [{ key: '1', cells: v }], true)));
    expect(rowOf(a!, 1).cells!['1']!.text).toBe('<script>alert(1)</script> ok');
  });
  it('payload size: 6 variants of a 200-unit draft that all differ in different lines stays small', () => {
    const b = cs(...lines(200));
    const vs = Array.from({ length: 6 }, (_, k) => ({ key: String(k + 1), cells: b.map((x, i) => (i % 6 === k ? c(`${x.text} Plus an added closing clause number ${k}.`) : x)) }));
    const size = JSON.stringify(buildCompare(b, vs, true)).length;
    expect(size).toBeLessThan(120_000);
  });
  it('payload size, worst case: 6 variants that rewrite every one of 200 units', () => {
    const b = cs(...lines(200));
    const vs = Array.from({ length: 6 }, (_, k) => ({ key: String(k + 1), cells: cs(...lines(200, `rewrite${k}`)) }));
    const size = JSON.stringify(buildCompare(b, vs, true)).length;
    expect(size).toBeLessThan(450_000);
  });
});

describe('unitCells', () => {
  const FOUNTAIN = `INT. KITCHEN - NIGHT

Rain on the window. A kettle screams.

MARA
(whispering)
Not tonight.

NAME: this is an action line that looks like a speech.

CUT TO:
`;
  it('reads the speaker from the block, not from the text, and agrees with the units the page shows', () => {
    const cells = unitCells(FOUNTAIN, 'fountain');
    expect(cells.find(x => x.text === 'Not tonight.')).toEqual({ speaker: 'MARA', text: 'Not tonight.' });
    expect(cells.find(x => x.text.startsWith('NAME:'))).toEqual({ text: 'NAME: this is an action line that looks like a speech.' });
    expect(cells.find(x => x.text === '(whispering)')).toEqual({ text: '(whispering)' });
  });
  it('splits markdown prose into sentences without speakers', () => {
    expect(unitCells('One fine day. And then rain.\n', 'markdown')).toEqual([{ text: 'One fine day.' }, { text: 'And then rain.' }]);
  });
  it('reads dialog node and bark speakers, and no speaker for a choice', () => {
    const cells = unitCells('form: quest-dialog\nstart: a\nnodes:\n  - id: a\n    speaker: GUARD\n    text: Halt.\n    choices:\n      - text: I trade.\n        to: b\n  - id: b\n    speaker: GUARD\n    text: Go.\n    end: true\n', 'dialog');
    expect(cells).toEqual([{ speaker: 'GUARD', text: 'Halt.' }, { text: 'I trade.' }, { speaker: 'GUARD', text: 'Go.' }]);
  });
  it('is empty for empty text', () => { expect(unitCells('', 'markdown')).toEqual([]); });
});
