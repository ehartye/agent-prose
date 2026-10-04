// "None of these" on the page: the pure helpers (the reason list agrees with the server's, send needs a reason or a note, the tallies and status
// words with send-backs) and what the page source promises (a modal dialog with a focus trap, text only, no inline style).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { MAX_NONE_NOTE, NONE_REASONS, NONE_REASON_LABELS } from '../src/owner/feedback.ts';

const DIR = join(import.meta.dirname, '..', 'runtime', 'reading');
const js = readFileSync(join(DIR, 'app.js'), 'utf8');
const css = readFileSync(join(DIR, 'style.css'), 'utf8');
const window: Record<string, any> = { __READING_TEST__: true };
runInNewContext(js, { window, URLSearchParams, Date, Math, console });
const r = window.__reading;
const counts = (o: Partial<Record<string, number>> = {}) => ({ waiting: 0, picked: 0, back: 0, sent: 0, sentBack: 0, skipped: 0, blocked: 0, ended: 0, ...o });

describe('the reasons and the note', () => {
  it('offers exactly the server\'s fixed reasons, with the words the owner reads', () => {
    expect(r.NONE_REASONS.map((x: any) => x.id)).toEqual([...NONE_REASONS]);
    for (const x of r.NONE_REASONS) expect(x.label).toBe(NONE_REASON_LABELS[x.id as keyof typeof NONE_REASON_LABELS]);
    expect(r.MAX_NONE_NOTE).toBe(MAX_NONE_NOTE);
  });
  it('toggles a reason and keeps the chosen ones in the panel\'s order', () => {
    expect(r.toggleReason([], 'too-long')).toEqual(['too-long']);
    expect(r.toggleReason(['too-long'], 'wrong-direction')).toEqual(['wrong-direction', 'too-long']);
    expect(r.toggleReason(['wrong-direction', 'too-long'], 'wrong-direction')).toEqual(['too-long']);
  });
  it('needs at least one reason or a note, and a note within 1000 characters after trimming', () => {
    const d = (reasons: string[], note: string) => ({ reasons, note });
    expect(r.noneReady(d([], ''))).toBe(false);
    expect(r.noneReady(d([], '   '))).toBe(false);
    expect(r.noneReady(d(['other'], ''))).toBe(true);
    expect(r.noneReady(d([], 'x'))).toBe(true);
    expect(r.noneReady(d(['other'], ` ${'x'.repeat(1000)} `))).toBe(true);
    expect(r.noneReady(d(['other'], 'x'.repeat(1001)))).toBe(false);
    expect(r.noneHelp(d([], ''))).toMatch(/reason or write a note/);
    expect(r.noneHelp(d(['other'], 'x'.repeat(1001)))).toBe('The note is 1 character too long.');
    expect(r.noneHelp(d(['other'], 'x'.repeat(1003)))).toBe('The note is 3 characters too long.');
    expect(r.noneHelp(d(['other'], ''))).toBe('');
  });
  it('shows the premise hint only while that reason is chosen', () => {
    expect(r.premiseHint({ reasons: ['premise-wrong', 'other'] })).toBe(true);
    expect(r.premiseHint({ reasons: ['other'] })).toBe(false);
  });
  it('builds the request: the closest draft (or null), the reasons, a trimmed note only when there is one', () => {
    expect(r.noneBody({ closest: 2, reasons: ['too-long'], note: '  hi  ' })).toEqual({ closest: 2, reasons: ['too-long'], note: 'hi' });
    expect(r.noneBody({ closest: null, reasons: ['other'], note: '   ' })).toEqual({ closest: null, reasons: ['other'] });
  });
  it('offers the drafts on offer in the lineup, not an earlier round\'s pinned champion', () => {
    const p = { state: { round: 0, champion: null, lineup: [1, 2, 3] }, candidates: [{ index: 1, label: 'B' }, { index: 2, label: 'A' }, { index: 3, label: 'C' }, { index: 9, label: 'X' }] };
    expect(r.noneOptions(p)).toEqual([{ index: 1, label: 'B' }, { index: 2, label: 'A' }, { index: 3, label: 'C' }]);
    const later = { state: { round: 1, champion: 2, lineup: [2, 4, 5] }, candidates: [{ index: 2, label: 'A' }, { index: 4, label: 'B' }, { index: 5, label: 'C' }] };
    expect(r.noneOptions(later).map((o: any) => o.index)).toEqual([4, 5]);
  });
  it('says what was said, and what the last time said above a redo set (reasons, then the note)', () => {
    expect(r.noneSummary({ reasons: ['too-long', 'premise-wrong'], note: 'Too cute.' })).toBe('Too long, The premise is wrong, Too cute.');
    expect(r.lastFeedbackText({ reasons: ['Wrong direction', 'Too long'], note: 'Too cute.' })).toBe('Sent back last time: Wrong direction, Too long, Too cute.');
    expect(r.lastFeedbackText({ reasons: ['Other'], note: null })).toBe('Sent back last time: Other');
    expect(r.lastFeedbackText(null)).toBe('');
  });
});

describe('the batch with send-backs', () => {
  it('tallies chosen and sent back, and says what is and is not sent', () => {
    expect(r.tallyText(counts({ waiting: 3 }), 3)).toBe('0 of 3 chosen');
    expect(r.tallyText(counts({ back: 1, waiting: 2 }), 3)).toBe('0 of 3 chosen, 1 sent back - nothing sent until you press Send picks');
    expect(r.tallyText(counts({ picked: 1, back: 1, waiting: 1 }), 3)).toBe('1 of 3 chosen, 1 sent back - nothing sent until you press Send picks');
    expect(r.tallyText(counts({ sent: 1, sentBack: 1, picked: 0, back: 1 }), 3)).toBe('1 of 3 chosen, 2 sent back - 2 sent, 1 not sent yet');
    expect(r.tallyText(counts({ sent: 2, sentBack: 1 }), 3)).toBe('2 of 3 chosen, 1 sent back - 3 sent');
    expect(r.tallyText({ waiting: 1, picked: 1, sent: 0, skipped: 0, blocked: 0, ended: 0 }, 2)).toBe('1 of 2 chosen - nothing sent until you press Send picks'); // an older server's counts
  });
  it('has its own rail words, distinct from skipped', () => {
    expect(r.statusWord({ status: 'back' })).toBe('Sent back, not sent yet');
    expect(r.statusWord({ status: 'sentBack' })).toBe('Sent back');
    expect(r.statusWord({ status: 'sentBack', via: 'cli' })).toBe('Sent back outside this page');
    expect(r.statusWord({ status: 'skipped' })).toBe('Skipped');
    expect(r.railSummary(counts({ sent: 1, sentBack: 1, back: 1, skipped: 1 }), 5)).toBe('1 of 5 chosen. 2 sent back. 1 skipped, back at the end');
    expect(r.isUndecided('back')).toBe(false);
    expect(r.isUndecided('skipped')).toBe(true);
  });
  it('words the Send review for picks, send-backs or both', () => {
    expect(r.sendWords(2, 0)).toBe('2 picks');
    expect(r.sendWords(1, 1)).toBe('1 pick and 1 send-back');
    expect(r.sendWords(0, 3)).toBe('3 send-backs');
    expect(r.backLine({ who: 'TALLY-4', where: 'd.yaml, line 4' }, { reasons: ['too-short'], note: 'thin' })).toBe('TALLY-4 (d.yaml, line 4): sent back - Too short, thin');
    expect(r.backLine({ who: 'W', where: 'w' }, { reasons: [], note: 'n'.repeat(300) }).length).toBeLessThanOrEqual(123);
  });
  it('re-renders when a staged or a sent send-back changes', () => {
    const base = { state: { stage: 'lineup', round: 0, events: 0 }, session: { brief: null, original: null, lastFeedback: null }, draft: null, queue: { status: 'waiting', stage: 'open', choice: { variant: null, passes: [] }, back: null } };
    const staged = { ...base, queue: { ...base.queue, status: 'back', back: { closest: null, reasons: ['other'] } } };
    expect(r.signature(staged)).not.toBe(r.signature(base));
    expect(r.signature({ ...base, state: { ...base.state, stage: 'sentBack', sentBack: { closest: null, reasons: ['other'] } } })).not.toBe(r.signature(base));
  });
});

describe('the reveal of a sent-back set', () => {
  const label = (i: number) => 'draft ' + 'ABC'[i - 1];
  it('says No pick to compare, shows the guess, and never calls it a hit or a miss', () => {
    const parts = r.revealParts({ outcome: 'none', prediction: { pick: 2, shortlist: [3], why: 'warm', sealValid: true, unscored: true }, matched: null }, label, true, 'You sent this set back, so there is no pick.');
    const text = parts.map((p: any) => p.text).join(' | ');
    expect(parts[0]).toMatchObject({ text: 'No pick to compare' });
    expect(text).toMatch(/guessed you would choose draft B, with draft C as other possibilities/);
    expect(text).toMatch(/not scored/);
    expect(text).not.toMatch(/That matches|Not this time|shortlist\./);
  });
  it('without a sealed guess it says there is nothing to show', () => {
    const parts = r.revealParts({ outcome: 'none', prediction: null, note: 'No prediction was sealed for this set, so there is nothing to reveal' }, label, true, 'x');
    expect(parts.map((p: any) => p.text)).toEqual(['No pick to compare', 'x', 'No prediction was sealed for this set, so there is nothing to reveal']);
  });
  it('leaves the reveal of a pick as it was', () => {
    const parts = r.revealParts({ prediction: { pick: 2, shortlist: [], why: 'w', hit: true, shortlistHit: true, sealValid: true }, matched: true }, label, true, 'You chose draft B.');
    expect(parts.map((p: any) => p.text)).toContain('That matches. Your writer read your taste well this time.');
  });
});

describe('the page source', () => {
  it('builds a modal dialog: role, aria-modal, a labelled heading, a focus trap, Escape, the page behind inert', () => {
    expect(js).toMatch(/role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'none-h'/);
    expect(js).toMatch(/ev\.key === 'Escape'/);
    expect(js).toMatch(/setAttribute\('inert', ''\)/);
    expect(js).toMatch(/document\.addEventListener\('keydown', onDialogKey, true\)/);
    expect(js).toMatch(/\[Tab\]|ev\.key !== 'Tab'/);
  });
  it('sends only through the existing routes, with the note as a value (never markup, never an inline style)', () => {
    expect(js).toMatch(/'\/api\/queue\/' \+ batchId \+ '\/sendback'/);
    expect(js).toMatch(/type: 'none'/);
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
    expect((js.match(/\bfetch\(/g) || []).length).toBe(1);
  });
  it('has the rail mark (a hollow circle with a bar), 44 px targets in the panel and a forced-colours rule', () => {
    expect(css).toMatch(/\.state\.back\b/);
    expect(css).toMatch(/\.dialog \.opt \{[^}]*min-height: 44px/);
    expect(css).toMatch(/forced-colors: active\) \{[^}]*\.dialog/s);
    expect(css).not.toMatch(/style=/);
  });
});
