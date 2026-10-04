// The batch page's pure helpers (the rail, the tally, the staged choice, the keys) and what its source promises.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const DIR = join(import.meta.dirname, '..', 'runtime', 'reading');
const js = readFileSync(join(DIR, 'app.js'), 'utf8');
const css = readFileSync(join(DIR, 'style.css'), 'utf8');
const html = readFileSync(join(DIR, 'index.html'), 'utf8');
const window: Record<string, any> = { __READING_TEST__: true };
runInNewContext(js, { window, URLSearchParams, Date, Math, console });
const r = window.__reading;

const counts = (o: Partial<Record<string, number>> = {}) => ({ waiting: 0, picked: 0, sent: 0, skipped: 0, blocked: 0, ended: 0, ...o });
const item = (status: string, over: object = {}) => ({ n: 1, who: 'TALLY-4', where: 'd.yaml, line 4', form: 'dialog', status, picked: null, ...over });

describe('the address', () => {
  it('reads a queue id from /q/<id> only', () => {
    expect(r.queueIdFromPath('/q/queue-20261004-1830-ab12')).toBe('queue-20261004-1830-ab12');
    expect(r.queueIdFromPath('/q/abc/')).toBe('abc');
    for (const bad of ['/s/abc', '/q/', '/q/AB', '/q/a/b', '/', '', undefined]) expect(r.queueIdFromPath(bad), String(bad)).toBeNull();
    expect(r.sessionIdFromPath('/q/abc')).toBeNull();
  });
});

describe('tally and rail summary', () => {
  it('is the count alone until something is chosen', () => {
    expect(r.tallyText(counts({ waiting: 5 }), 5)).toBe('0 of 5 chosen');
  });
  it('says nothing is sent until Send picks, while only staged', () => {
    expect(r.tallyText(counts({ picked: 2, waiting: 3 }), 5)).toBe('2 of 5 chosen - nothing sent until you press Send picks');
  });
  it('says what is sent and what is not once some are sent', () => {
    expect(r.tallyText(counts({ sent: 2, picked: 1, waiting: 2 }), 5)).toBe('3 of 5 chosen - 2 sent, 1 not sent yet');
    expect(r.tallyText(counts({ sent: 5 }), 5)).toBe('5 of 5 chosen - 5 sent');
    expect(r.tallyText(counts({ sent: 1, waiting: 4 }), 5)).toBe('1 of 5 chosen - 1 sent');
  });
  it('the rail line counts skipped and blocked in words, not as chosen', () => {
    expect(r.railSummary(counts({ picked: 1, skipped: 2, blocked: 1, waiting: 1 }), 5)).toBe('1 of 5 chosen. 2 skipped, back at the end. 1 blocked');
    expect(r.railSummary(counts({ waiting: 3 }), 3)).toBe('0 of 3 chosen');
  });
});

describe('status words and labels', () => {
  it('every state has words', () => {
    expect(r.statusWord(item('waiting'))).toBe('Waiting');
    expect(r.statusWord(item('picked', { picked: 'B' }))).toBe('Picked B, not sent');
    expect(r.statusWord(item('sent', { picked: 'B' }))).toBe('Sent B');
    expect(r.statusWord(item('sent', { picked: 'B', via: 'cli' }))).toBe('Picked B outside this page');
    expect(r.statusWord(item('skipped'))).toBe('Skipped');
    expect(r.statusWord(item('blocked', { message: 'draft 2 changed' }))).toBe('Blocked: draft 2 changed');
    expect(r.statusWord(item('blocked'))).toBe('Blocked: could not be sent');
    expect(r.statusWord(item('ended'))).toBe('Closed');
  });
  it('the rail button reads the whole state with its place', () => {
    expect(r.railLabel(item('picked', { picked: 'B' }), 1, 5)).toBe('TALLY-4, d.yaml, line 4, picked b, not sent, item 1 of 5');
  });
});

describe('moving through the queue', () => {
  const items = [item('picked'), item('waiting'), item('sent'), item('skipped'), item('waiting')].map((x, k) => ({ ...x, n: k + 1 }));
  it('next unchosen wraps, skips decided items and the current one', () => {
    const order = [1, 2, 3, 4, 5];
    expect(r.nextUnchosen(order, items, 1)).toBe(2);
    expect(r.nextUnchosen(order, items, 2)).toBe(4);
    expect(r.nextUnchosen(order, items, 5)).toBe(2);
    expect(r.nextUnchosen([2, 5, 4, 1, 3], items, 3)).toBe(2);
  });
  it('is null when nothing else is undecided', () => {
    const done = [item('sent'), item('picked'), item('waiting')].map((x, k) => ({ ...x, n: k + 1 }));
    expect(r.nextUnchosen([1, 2, 3], done, 3)).toBeNull();
    expect(r.nextUnchosen([1, 2, 3], done.map(x => ({ ...x, status: 'sent' })), 1)).toBeNull();
  });
  it('blocked counts as undecided; ended does not', () => {
    const it2 = [item('waiting'), item('blocked'), item('ended')].map((x, k) => ({ ...x, n: k + 1 }));
    expect(r.nextUnchosen([1, 2, 3], it2, 1)).toBe(2);
    expect(r.nextUnchosen([1, 2, 3], it2, 2)).toBe(1);
  });
  it('j and k step without wrapping', () => {
    expect(r.stepItem([3, 1, 2], 1, 1)).toBe(2);
    expect(r.stepItem([3, 1, 2], 1, -1)).toBe(3);
    expect(r.stepItem([3, 1, 2], 3, -1)).toBeNull();
    expect(r.stepItem([3, 1, 2], 2, 1)).toBeNull();
    expect(r.stepItem([1, 2], 9, 1)).toBeNull();
  });
});

describe('the rail pages', () => {
  const order = Array.from({ length: 50 }, (_, k) => k + 1);
  it('shows ten at a time, follows the current item, and clamps the page', () => {
    expect(r.RAIL_PAGE).toBe(10);
    expect(r.railPageOf(order, 1)).toBe(0);
    expect(r.railPageOf(order, 10)).toBe(0);
    expect(r.railPageOf(order, 11)).toBe(1);
    expect(r.railPageOf(order, 50)).toBe(4);
    expect(r.railWindow(order, 4)).toMatchObject({ page: 4, pages: 5, from: 40 });
    expect(r.railWindow(order, 4).ns).toEqual([41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
    expect(r.railWindow(order, 99).page).toBe(4);
    expect(r.railWindow(order, -3).page).toBe(0);
    expect(r.railWindow([1, 2, 3], 0)).toMatchObject({ pages: 1, ns: [1, 2, 3] });
  });
  it('a skipped item that moved to the end is on the last page', () => {
    expect(r.railPageOf([...order.slice(1), 1], 1)).toBe(4);
  });
});

describe('the staged choice', () => {
  it('Keep is a radio: another draft replaces it, the same one clears it, a pass is dropped', () => {
    expect(r.keepChoice({ variant: null, passes: [] }, 2)).toEqual({ variant: 2, passes: [] });
    expect(r.keepChoice({ variant: 1, passes: [3] }, 2)).toEqual({ variant: 2, passes: [3] });
    expect(r.keepChoice({ variant: 2, passes: [3] }, 2)).toEqual({ variant: null, passes: [3] });
    expect(r.keepChoice({ variant: null, passes: [2, 3] }, 2)).toEqual({ variant: 2, passes: [3] });
  });
  it('Pass toggles, and passing the kept draft takes the keep away', () => {
    expect(r.passChoice({ variant: null, passes: [] }, 3)).toEqual({ variant: null, passes: [3] });
    expect(r.passChoice({ variant: null, passes: [3] }, 3)).toEqual({ variant: null, passes: [] });
    expect(r.passChoice({ variant: 2, passes: [] }, 2)).toEqual({ variant: null, passes: [2] });
    expect(r.passChoice({ variant: 2, passes: [] }, 3)).toEqual({ variant: 2, passes: [3] });
  });
  it('the marks come from the staged choice', () => {
    expect(r.marksFromChoice({ variant: 2, passes: [1, 3] })).toEqual({ 1: 'pass', 2: 'keep', 3: 'pass' });
    expect(r.marksFromChoice({ variant: null, passes: [] })).toEqual({});
    expect(r.noChoice({ variant: null, passes: [] })).toBe(true);
    expect(r.noChoice({ variant: null, passes: [1] })).toBe(false);
  });
  it('the review quotes the changed line, cut at 60 characters, as text', () => {
    const long = 'x'.repeat(80);
    expect(r.previewText([long]).length).toBe(63);
    expect(r.previewText(['  Short  ', '', 'line'])).toBe('Short line');
    expect(r.reviewLine(item('picked'), 'B', ['<b>Fine</b>'])).toBe('TALLY-4 (d.yaml, line 4): B - <b>Fine</b>');
    const p = { candidates: [{ index: 2, units: ['INT. BRIDGE', 'whole draft'] }], compare: { rows: [{ base: 0, cur: { text: 'a' } }, { base: 1, cur: { text: 'b' }, cells: { 2: { speaker: 'MARA', text: 'new line', ops: [['+', 'new line']] } } }] } };
    expect(r.changedUnits(p, 2)).toEqual(['MARA: new line']);
    expect(r.changedUnits({ candidates: p.candidates, compare: null }, 2)).toEqual(['INT. BRIDGE', 'whole draft']);
    expect(r.changedUnits({ candidates: [], compare: null }, 9)).toEqual([]);
  });
  it('the column word is "Your pick" in a batch and "Kept" in a single set', () => {
    expect(r.stateWord('keep', true)).toBe('Your pick');
    expect(r.stateWord('keep', false)).toBe('Kept');
    expect(r.stateWord('keep')).toBe('Kept');
    expect(r.stateWord('pass', true)).toBe('Passed');
  });
});

describe('the key map', () => {
  const key = (k: string, over: object = {}) => ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, inField: false, ...over });
  const st = (over: object = {}) => ({ keysOn: true, batch: true, panel: null, ...over });
  it('maps the plain keys on the batch desk', () => {
    expect(r.keyAction(key('j'), st())).toEqual({ action: 'next' });
    expect(r.keyAction(key('k'), st())).toEqual({ action: 'previous' });
    expect(r.keyAction(key('n'), st())).toEqual({ action: 'unchosen' });
    expect(r.keyAction(key('s'), st())).toEqual({ action: 'skip' });
    expect(r.keyAction(key('u'), st())).toEqual({ action: 'clear' });
    expect(r.keyAction(key('e'), st())).toEqual({ action: 'fold' });
    expect(r.keyAction(key('b'), st())).toEqual({ action: 'brief' });
    expect(r.keyAction(key('?', { shiftKey: true }), st())).toEqual({ action: 'help' });
    expect(r.keyAction(key('a'), st())).toEqual({ action: 'keep', letter: 'A' });
    expect(r.keyAction(key('f'), st())).toEqual({ action: 'keep', letter: 'F' });
    expect(r.keyAction(key('B', { shiftKey: true }), st())).toEqual({ action: 'pass', letter: 'B' });
  });
  it('ignores a key typed in a field, and any with Ctrl, Alt or Meta (except Ctrl or Cmd+Enter)', () => {
    for (const k of ['j', 'a', 's', '?']) expect(r.keyAction(key(k, { inField: true }), st()), k).toBeNull();
    for (const mod of ['ctrlKey', 'altKey', 'metaKey']) for (const k of ['j', 'a', 'n']) expect(r.keyAction(key(k, { [mod]: true }), st()), `${mod} ${k}`).toBeNull();
    expect(r.keyAction(key('Enter', { ctrlKey: true }), st())).toEqual({ action: 'review' });
    expect(r.keyAction(key('Enter', { metaKey: true }), st())).toEqual({ action: 'review' });
    expect(r.keyAction(key('Enter', { ctrlKey: true }), st({ panel: 'send' }))).toEqual({ action: 'confirm' });
    expect(r.keyAction(key('Enter', { ctrlKey: true, inField: true }), st())).toBeNull();
    expect(r.keyAction(key('Enter', { ctrlKey: true, altKey: true }), st())).toBeNull();
    expect(r.keyAction(key('Enter'), st())).toBeNull();
  });
  it('the off switch silences every single-character key but not Escape or Ctrl+Enter', () => {
    for (const k of ['j', 'k', 'n', 's', 'u', 'a', '?']) expect(r.keyAction(key(k), st({ keysOn: false })), k).toBeNull();
    expect(r.keyAction(key('Escape'), st({ keysOn: false, panel: 'help' }))).toEqual({ action: 'close' });
    expect(r.keyAction(key('Enter', { ctrlKey: true }), st({ keysOn: false }))).toEqual({ action: 'review' });
  });
  it('Escape closes a panel and does nothing otherwise; a field does not block it', () => {
    expect(r.keyAction(key('Escape'), st({ panel: 'send' }))).toEqual({ action: 'close' });
    expect(r.keyAction(key('Escape', { inField: true }), st({ panel: 'finish' }))).toEqual({ action: 'close' });
    expect(r.keyAction(key('Escape'), st())).toBeNull();
  });
  it('a single-set page has no batch keys, and unmapped keys do nothing', () => {
    expect(r.keyAction(key('j'), st({ batch: false }))).toBeNull();
    expect(r.keyAction(key('a'), st({ batch: false }))).toBeNull();
    expect(r.keyAction(key('Enter', { ctrlKey: true }), st({ batch: false }))).toBeNull();
    expect(r.keyAction(key('x'), st())).toBeNull();
    expect(r.keyAction(key('g'), st())).toBeNull();
    expect(r.keyAction(key('Tab'), st())).toBeNull();
  });
});

describe('the item signature', () => {
  const base = { state: { stage: 'lineup', round: 0, events: 0 }, session: {}, draft: null };
  it('changes with the staged choice, the status and a message, so the screen re-renders', () => {
    const a = r.signature({ ...base, queue: { status: 'waiting', stage: 'open', choice: { variant: null, passes: [] }, sentVariant: null } });
    const b = r.signature({ ...base, queue: { status: 'picked', stage: 'open', choice: { variant: 2, passes: [] }, sentVariant: null } });
    const c = r.signature({ ...base, queue: { status: 'blocked', stage: 'open', choice: { variant: 2, passes: [] }, message: 'x', sentVariant: null } });
    expect(new Set([a, b, c]).size).toBe(3);
    expect(r.signature(base)).not.toBe(a);
  });
});

describe('the page source', () => {
  it('sends a batch only through the queue routes, with the item number from the page state, never a path or text', () => {
    expect(js).toContain("'/api/queue/' + batchId + '/item/' + ui.cur");
    for (const p of ["'/choose'", "'/skip'", "'/send'", "'/finish'"]) expect(js, p).toContain(p);
    expect(js).toContain("batchPost('/choose', { item: n, variant: next.variant, passes: next.passes })");
    expect(js).not.toMatch(/JSON\.stringify\(\{[^}]*(file|path|text|prediction)[^}]*\}\)/);
  });
  it('turns notes off in a batch and keeps the shortcut switch in local storage with a guard', () => {
    expect(js).toContain('...(batch ? {} : { role:');
    expect(js).toMatch(/try \{ return window\.localStorage\.getItem\('prose-keys'\)/);
    expect(js).toMatch(/try \{ window\.localStorage\.setItem\('prose-keys'/);
  });
  it('says the facts the owner needs on the panels', () => {
    for (const s of ['Picks cannot be changed once sent.', "'Not yet'", "'Send picks'", "'Next unchosen'", "'All chosen'", "'Finish'", 'Send them first?', 'Send and finish', 'Finish without them', "'Keys'"]) expect(js, s).toContain(s);
  });
  it('the rail is a labelled nav with a list, a live region announces moves, and the title takes the focus', () => {
    expect(html).toContain('<nav id="rail" class="rail" aria-label="Review queue"');
    expect(html).toContain('id="live"');
    expect(html).toContain('id="title" tabindex="-1"');
    expect(js).toContain("h('ol', { class: 'queue' }");
    expect(js).toContain("'aria-current': n === ui.cur ? 'true' : undefined");
  });
  it('draws the rail marks as the mock does and turns the rail into a strip on a phone', () => {
    expect(css).toMatch(/\.state\.picked \{[^}]*background: var\(--blue\)/);
    expect(css).toMatch(/\.state\.skipped::after \{[^}]*rotate\(40deg\)/);
    expect(css).toMatch(/\.queue \{ display: flex; gap: 0\.4rem; overflow-x: auto/);
    expect(css).toMatch(/\.desk\.batch \{ display: grid; grid-template-columns: 17rem minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.qitem \{[^}]*min-height: 44px/);
  });
});
