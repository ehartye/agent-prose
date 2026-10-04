// "None of these": the validation, the verdict-log row and its fold, the closed set, the unscored reveal, the taste model ignoring it, and set new --redo.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { MAX_NONE_NOTE, NONE_REASONS, newFeedback } from '../src/owner/feedback.ts';
import { recordNone } from '../src/owner/none.ts';
import { recordPick } from '../src/owner/pick.ts';
import { globalTasteDir, projectTasteDir, setDir } from '../src/owner/paths.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { createSet, readSet, variantPath } from '../src/owner/sets.ts';
import { predictionStats, duelCounts } from '../src/owner/stats.ts';
import { appendJsonlRows, parseVerdicts, readVerdicts, verdictCounts } from '../src/owner/verdicts.ts';
import { loadTaste, loadTasteAsync } from '../src/taste/load.ts';
import { BASE, PUNCHY, SHORT, WARM, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
useTempHome();
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };

function readySet(id = 'demo', opts: { predict?: boolean; lines?: string } = {}) {
  const p = tmpProject();
  const set = createSet(p.project, p.write('t.md', BASE), { id, count: 3, directions: ['shorter', 'warmer', 'shorter'], ...(opts.lines ? { lines: opts.lines } : {}) });
  [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  const prediction = opts.predict === false ? null : writePrediction(p.project, set, { pick: 2, shortlist: [3], why: 'warm wins weddings' });
  return { ...p, set, prediction };
}
const projectLog = (project: string) => join(projectTasteDir(project), 'verdicts.jsonl');
const globalLog = () => join(globalTasteDir(), 'verdicts.jsonl');

describe('newFeedback (validation)', () => {
  it('takes reasons from the fixed list only, drops repeats, and keeps their order', () => {
    expect(newFeedback({ reasons: ['too-long', 'wrong-direction', 'too-long'] })).toEqual({ closest: null, reasons: ['too-long', 'wrong-direction'] });
    for (const bad of ['Too long', 'nope', '', 'too-long ', '<b>']) expect(code(() => newFeedback({ reasons: [bad], note: 'x' }))).toBe('E_USAGE');
    expect(NONE_REASONS).toHaveLength(8);
  });
  it('needs a reason or a note, and a note that is only space is no note', () => {
    expect(code(() => newFeedback({}))).toBe('E_USAGE');
    expect(code(() => newFeedback({ reasons: [], note: '   \n ' }))).toBe('E_USAGE');
    expect(newFeedback({ note: '  hello  ' })).toEqual({ closest: null, reasons: [], note: 'hello' });
  });
  it('trims the note, folds line endings and caps it at 1000 characters after trimming', () => {
    expect(newFeedback({ note: ' a\r\nb ' }).note).toBe('a\nb');
    expect(newFeedback({ note: ` ${'x'.repeat(MAX_NONE_NOTE)} ` }).note).toHaveLength(MAX_NONE_NOTE);
    expect(code(() => newFeedback({ note: 'x'.repeat(MAX_NONE_NOTE + 1) }))).toBe('E_USAGE');
  });
  it('refuses control characters in the note, keeps markup as plain text, and checks closest', () => {
    expect(code(() => newFeedback({ note: 'a\u0000b' }))).toBe('E_USAGE');
    expect(code(() => newFeedback({ note: 'bell\u0007' }))).toBe('E_USAGE');
    expect(newFeedback({ note: '<script>alert(1)</script>' }).note).toBe('<script>alert(1)</script>');
    expect(code(() => newFeedback({ reasons: ['other'], closest: 0 }))).toBe('E_USAGE');
    expect(code(() => newFeedback({ reasons: ['other'], closest: 1.5 }))).toBe('E_USAGE');
    expect(newFeedback({ reasons: ['other'], closest: 2 }).closest).toBe(2);
  });
});

describe('recordNone', () => {
  it('appends one none row to the project and per-user logs and closes the set', () => {
    const { project, set } = readySet();
    const r = recordNone(project, set.id, { reasons: ['too-similar', 'wrong-direction'], note: 'all three open the same way', closest: 3 });
    expect(r).toMatchObject({ set: 'demo', outcome: 'none', closest: 3, reasons: ['too-similar', 'wrong-direction'], note: 'all three open the same way', shown: [1, 2, 3], appended: true });
    for (const path of [projectLog(project), globalLog()]) {
      const log = readVerdicts(path);
      expect(log.none).toHaveLength(1);
      expect(log.none[0]).toMatchObject({ schema: 'prose/verdict-none@1', kind: 'none', set: 'demo', setUid: set.uid, closest: 3, reasons: ['too-similar', 'wrong-direction'], form: 'speech-small', shown: [1, 2, 3] });
      expect(log.malformed).toBe(0);
    }
    const closed = readSet(project, 'demo');
    expect(closed.picked).toBeUndefined();
    expect(closed.sentBack).toMatchObject({ closest: 3, reasons: ['too-similar', 'wrong-direction'], note: 'all three open the same way', shown: [1, 2, 3] });
  });

  it('is never a pick, a duel or taste data: rows stay empty and every counter ignores it', () => {
    const { project, set } = readySet();
    recordNone(project, set.id, { reasons: ['other'] });
    for (const path of [projectLog(project), globalLog()]) {
      expect(readVerdicts(path).rows).toEqual([]);
      expect(verdictCounts(path)).toEqual({ rows: 0, unknownVersion: 0, malformed: 0 });
      expect(duelCounts(path)).toEqual({ decisive: 0, ties: 0, bothBad: 0 });
    }
    const taste = loadTaste({ project });
    expect(taste.counts).toMatchObject({ rows: 0, malformed: 0, unknownVersion: 0 });
    expect(taste.model.n).toBe(0);
  });

  it('leaves the taste model exactly as it was when a none row sits among pick rows', async () => {
    const a = readySet('a', { predict: false });
    recordPick(a.project, readSet(a.project, 'a'), 2, { noPredict: true });
    const before = loadTaste({ project: a.project });
    const windowBefore = await loadTasteAsync({ project: a.project, maxRows: 2 });
    // a second set in the same project is sent back; the log now holds a pick and a none row
    const b = createSet(a.project, join(a.project, 't.md'), { id: 'b', count: 3 });
    [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(a.project, b, b.variants[k]), text));
    recordNone(a.project, 'b', { reasons: ['wrong-direction'], note: 'no', closest: 1 });
    const after = loadTaste({ project: a.project });
    expect(after.model).toEqual(before.model);
    expect(after.counts).toEqual(before.counts);
    // the none row does not take a place in the window of the last rows the server reads
    expect((await loadTasteAsync({ project: a.project, maxRows: 2 })).counts).toEqual(windowBefore.counts);
    expect((await loadTasteAsync({ project: a.project, maxRows: 2 })).model).toEqual(windowBefore.model);
  });

  it('is read back with the other rows, and a malformed or other-version none row is counted, not folded', () => {
    const good = { schema: 'prose/verdict-none@1', kind: 'none', at: 'x', project: '/p', set: 's', setUid: 'uid-12345678', form: 'prose', register: null, voices: [], closest: null, reasons: ['other'], shown: [1, 2] };
    const text = [JSON.stringify(good), JSON.stringify({ ...good, reasons: ['nope'] }), JSON.stringify({ ...good, schema: 'prose/verdict-none@9' }), JSON.stringify({ ...good, extra: 1 })].join('\n');
    const log = parseVerdicts(text);
    expect(log.none).toHaveLength(1);
    expect(log.rows).toEqual([]);
    expect(log.malformed).toBe(2);
    expect(log.unknownVersion).toBe(1);
  });

  it('is idempotent in the logs: a retry after a crash before set.json was written adds no second row', () => {
    const { project, set } = readySet();
    recordNone(project, set.id, { reasons: ['too-long'] });
    // simulate the crash: the logs were written, the set was not closed
    const file = join(setDir(project, 'demo'), 'set.json');
    const closed = JSON.parse(readFileSync(file, 'utf8'));
    delete closed.sentBack;
    writeFileSync(file, JSON.stringify(closed));
    const again = recordNone(project, set.id, { reasons: ['too-long'] });
    expect(again.appended).toBe(false);
    expect(readVerdicts(projectLog(project)).none).toHaveLength(1);
    expect(readSet(project, 'demo').sentBack).toBeDefined();
  });

  it('refuses a set that was already picked or already sent back, and a closest it did not show', () => {
    const picked = readySet('p');
    recordPick(picked.project, picked.set, 1, {});
    const e = (() => { try { recordNone(picked.project, 'p', { reasons: ['other'] }); } catch (x) { return x as ProseError; } })()!;
    expect(e.code).toBe('E_CONFLICT');
    expect(e.message).toMatch(/already picked/);

    const { project, set } = readySet();
    expect(code(() => recordNone(project, set.id, { reasons: ['other'], closest: 4 }))).toBe('E_USAGE');
    expect(readSet(project, 'demo').sentBack).toBeUndefined(); // a refused request writes nothing
    expect(readVerdicts(projectLog(project)).none).toEqual([]);
    recordNone(project, set.id, { reasons: ['other'] });
    const again = (() => { try { recordNone(project, set.id, { reasons: ['other'] }); } catch (x) { return x as ProseError; } })()!;
    expect(again.code).toBe('E_CONFLICT');
    expect(again.message).toMatch(/already sent back/);
    expect(again.hint).toMatch(/set new --redo demo/);
  });

  it('closes the set: no pick, duel, prediction or brief edit after it', async () => {
    const { project, set } = readySet();
    recordNone(project, set.id, { reasons: ['other'] });
    expect(code(() => recordPick(project, readSet(project, 'demo'), 1, { noPredict: true }))).toBe('E_CONFLICT');
    expect((await fail('set', 'duel', 'demo', '--a', '1', '--b', '2', '--outcome', 'a', '--dir', project)).code).toBe('E_CONFLICT');
    expect((await fail('set', 'brief', 'demo', '--context', 'x', '--dir', project)).code).toBe('E_CONFLICT');
    expect((await fail('predict', '--set', 'demo', '--pick', '1', '--why', 'x', '--dir', project)).code).toBe('E_CONFLICT');
  });

  it('reveals the sealed guess unscored: no hit or miss, no ledger row, no change to the agent accuracy', () => {
    const { project, set } = readySet();
    const before = predictionStats({});
    const r = recordNone(project, set.id, { reasons: ['wrong-direction'] });
    expect(r.reveal.agent).toEqual({ pick: 2, shortlist: [3], why: 'warm wins weddings', sealValid: true, unscored: true });
    expect(r.reveal.agent).not.toHaveProperty('hit');
    expect(r.reveal.agent).not.toHaveProperty('shortlistHit');
    const file = JSON.parse(readFileSync(join(setDir(project, 'demo'), 'reveal.json'), 'utf8'));
    expect(file).toMatchObject({ outcome: 'none', picked: null, agent: { pick: 2, unscored: true } });
    expect(existsSync(join(globalTasteDir(), 'predictions.jsonl'))).toBe(false);
    expect(predictionStats({})).toEqual(before);
    expect(predictionStats({}).agent).toMatchObject({ predicted: 0, hits: 0, rate: null });
  });

  it('reveals the taste model guess unscored too (no hit fields), when one was sealed', () => {
    const { project, set } = readySet();
    const modelFile = join(setDir(project, 'demo'), 'model-prediction.json');
    const r = recordNone(project, set.id, { reasons: ['other'] });
    if (existsSync(modelFile)) {
      expect(r.reveal.model).toMatchObject({ unscored: true });
      expect(r.reveal.model).not.toHaveProperty('hit');
    } else expect(r.reveal.model).toBeUndefined();
  });

  it('says so when there is no sealed prediction to reveal, and ignores a tampered one', () => {
    const none = readySet('n', { predict: false });
    const r = recordNone(none.project, 'n', { reasons: ['other'] });
    expect(r.reveal.agent).toBeNull();
    expect(r.reveal.note).toMatch(/No prediction was sealed/);

    const t = readySet('t');
    const file = join(setDir(t.project, 't'), 'prediction.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), pick: 3 }));
    const x = recordNone(t.project, 't', { reasons: ['other'] });
    expect(x.reveal.agent).toBeNull();
    expect(x.reveal.note).toMatch(/edited after sealing/);
  });

  it('keeps the note as plain text in every file it lands in (never executed or rendered by the CLI)', () => {
    const { project, set } = readySet();
    const note = '<img src=x onerror=alert(1)> $(rm -rf /) `x`';
    recordNone(project, set.id, { note });
    expect(readSet(project, 'demo').sentBack?.note).toBe(note);
    expect(readVerdicts(projectLog(project)).none[0].note).toBe(note);
  });
});

describe('prose set none', () => {
  it('records, prints the reasons in words, and shows in set show and set list as sent back', async () => {
    const { project } = readySet();
    const out = await run('set', 'none', 'demo', '--reason', 'too-long,not-their-voice', '--note', '  Too wordy.  ', '--closest', '2', '--dir', project);
    expect(out).toMatchObject({ set: 'demo', outcome: 'none', closest: 2, reasons: ['too-long', 'not-their-voice'], reasonWords: ['Too long', "Doesn't sound like them"], note: 'Too wordy.' });
    expect(out.next).toMatch(/set new --redo demo/);
    const show = await run('set', 'show', 'demo', '--dir', project);
    expect(show).toMatchObject({ status: 'sent back', picked: null, sentBack: { closest: 2, closestDirection: 'warmer', reasons: ['too-long', 'not-their-voice'], note: 'Too wordy.' } });
    const list = await run('set', 'list', '--dir', project);
    expect(list.sets[0]).toMatchObject({ id: 'demo', status: 'sent back', picked: null });
  });

  it('rejects a bad reason, empty feedback, a long note, a closest out of range, and an unknown set', async () => {
    const { project } = readySet();
    expect((await fail('set', 'none', 'demo', '--reason', 'meh', '--dir', project)).code).toBe('E_USAGE');
    expect((await fail('set', 'none', 'demo', '--dir', project)).code).toBe('E_USAGE');
    expect((await fail('set', 'none', 'demo', '--reason', ' , ', '--dir', project)).code).toBe('E_USAGE');
    expect((await fail('set', 'none', 'demo', '--note', 'x'.repeat(1001), '--dir', project)).code).toBe('E_USAGE');
    expect((await fail('set', 'none', 'demo', '--reason', 'other', '--closest', '9', '--dir', project)).code).toBe('E_USAGE');
    expect((await fail('set', 'none', 'demo', '--reason', 'other', '--closest', 'two', '--dir', project)).code).toBe('E_USAGE');
    expect((await fail('set', 'none', 'nope', '--reason', 'other', '--dir', project)).code).toBe('E_NOT_FOUND');
    expect(readSet(project, 'demo').sentBack).toBeUndefined();
  });

  it('refuses a set that was already picked or already sent back', async () => {
    const { project } = readySet();
    await run('set', 'none', 'demo', '--reason', 'other', '--dir', project);
    expect((await fail('set', 'none', 'demo', '--reason', 'other', '--dir', project)).code).toBe('E_CONFLICT');
    const q = readySet('q');
    recordPick(q.project, q.set, 1, {});
    expect((await fail('set', 'none', 'q', '--reason', 'other', '--dir', q.project)).code).toBe('E_CONFLICT');
  });
});

describe('prose set new --redo', () => {
  it('copies the brief and the line, records redoOf and carries the feedback; shows the feedback to the agent', async () => {
    const p = tmpProject();
    const draft = p.write('talk.md', '---\nform: speech-small\n---\n\nFirst line here.\n\nSecond line here, the one under review.\n');
    await run('set', 'new', draft, '--id', 'old', '--lines', '7', '--character', 'Dry, tired, kind.', '--context', 'Said at the door', '--brief-confirmed', '--directions', 'shorter,warmer,punchier');
    const old = readSet(p.project, 'old');
    [1, 2, 3].forEach(i => writeFileSync(variantPath(p.project, old, old.variants[i - 1]), readFileSync(variantPath(p.project, old, old.variants[i - 1]), 'utf8').replace('under review', `edited ${i}`)));
    await run('set', 'none', 'old', '--reason', 'wrong-direction,too-long', '--note', 'Too cute.', '--closest', '2', '--dir', p.project);

    const out = await run('set', 'new', '--redo', 'old', '--id', 'again', '--directions', 'plainer', '--dir', p.project);
    expect(out).toMatchObject({ set: 'again', redoOf: 'old', brief: { character: 'Dry, tired, kind.', context: 'Said at the door', confirmed: true } });
    expect(out.original).toMatchObject({ lines: [expect.objectContaining({ ref: '7' })] });
    expect(out.feedback).toEqual({ closest: 2, closestDirection: 'warmer', reasons: ['wrong-direction', 'too-long'], reasonWords: ['Wrong direction', 'Too long'], note: 'Too cute.' });
    expect(out.next).toMatch(/do not repeat/);
    const again = readSet(p.project, 'again');
    expect(again).toMatchObject({ redoOf: 'old', feedback: { closest: 2, reasons: ['wrong-direction', 'too-long'], note: 'Too cute.' }, brief: old.brief, original: old.original, source: old.source });
    const show = await run('set', 'show', 'again', '--dir', p.project);
    expect(show).toMatchObject({ status: 'open', redoOf: 'old', feedback: { note: 'Too cute.' } });
    expect((await run('set', 'list', '--dir', p.project)).sets.find((s: any) => s.id === 'again')).toMatchObject({ redoOf: 'old', status: 'open' });
  });

  it('refuses a set that was not sent back (open or picked) and mixing with the flags it replaces', async () => {
    const { project } = readySet('open');
    const e1 = await fail('set', 'new', '--redo', 'open', '--dir', project);
    expect(e1.code).toBe('E_CONFLICT');
    expect(e1.message).toMatch(/was not sent back/);
    const q = readySet('q');
    recordPick(q.project, q.set, 1, {});
    expect((await fail('set', 'new', '--redo', 'q', '--dir', q.project)).hint).toMatch(/was picked|It was picked/);
    await run('set', 'none', 'open', '--reason', 'other', '--dir', project);
    for (const flags of [['--character', 'x'], ['--context', 'x'], ['--brief-from', 'open'], ['--lines', '1'], ['--brief-confirmed']]) {
      expect((await fail('set', 'new', '--redo', 'open', ...flags, '--dir', project)).code).toBe('E_USAGE');
    }
    expect((await fail('set', 'new', '--redo', 'ghost', '--dir', project)).code).toBe('E_NOT_FOUND');
    expect((await fail('set', 'new', '--dir', project)).code).toBe('E_USAGE');
  });

  it('a new set can be picked, while the sent-back one stays closed', async () => {
    const { project } = readySet();
    await run('set', 'none', 'demo', '--reason', 'other', '--dir', project);
    await run('set', 'new', '--redo', 'demo', '--id', 'second', '--dir', project);
    const second = readSet(project, 'second');
    [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(project, second, second.variants[k]), text));
    const r = await run('set', 'pick', 'second', '--pick', '2', '--no-predict', '--dir', project);
    expect(r.picked).toBe(2);
    expect((await fail('set', 'pick', 'demo', '--pick', '2', '--no-predict', '--dir', project)).code).toBe('E_CONFLICT');
  });
});

describe('the log file itself', () => {
  it('a hand-written none row in an old-style log does not disturb pick rows', () => {
    const { project } = readySet('x', { predict: false });
    recordPick(project, readSet(project, 'x'), 1, { noPredict: true });
    appendJsonlRows(projectLog(project), [{ schema: 'prose/verdict-none@1', kind: 'none', at: 'x', project, set: 'x', setUid: 'uid-12345678', form: 'prose', register: null, voices: [], closest: null, reasons: ['other'], shown: [1, 2] }]);
    const log = readVerdicts(projectLog(project));
    expect(log.rows).toHaveLength(2);
    expect(log.none).toHaveLength(1);
    expect(log.malformed).toBe(0);
  });
});
