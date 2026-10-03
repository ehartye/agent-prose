import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { readPrediction, sealValid, writePrediction } from '../src/owner/prediction.ts';
import { setDir } from '../src/owner/paths.ts';
import { createSet, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { BASE, PUNCHY, SHORT, WARM, tmpProject, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

function newSet() {
  const p = tmpProject();
  const set = createSet(p.project, p.write('t.md', BASE), { id: 'demo', count: 4 });
  [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text)); // variant 4 stays unchanged: rejected
  return { ...p, set };
}

describe('writePrediction', () => {
  it('stores the guess with a seal and reads it back', () => {
    const { project, set } = newSet();
    const p = writePrediction(project, set, { pick: 2, shortlist: [3, 2, 3], why: 'driest', now: new Date(Date.UTC(2026, 9, 3)) });
    expect(p).toMatchObject({ schema: 'prose/prediction@1', set: 'demo', pick: 2, shortlist: [3], why: 'driest', at: '2026-10-03T00:00:00.000Z', shown: [1, 2, 3] });
    expect(Object.keys(p.hashes)).toEqual(['1', '2', '3']);
    expect(p.hashes['2']).toBe(createHash('sha256').update(readFileSync(variantPath(project, set, set.variants[1]))).digest('hex'));
    expect(p.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(readPrediction(project, 'demo')).toEqual(p);
    expect(sealValid(p)).toBe(true);
  });

  it('notices an edit after the fact', () => {
    const { project, set } = newSet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'first instinct' });
    const file = join(setDir(project, 'demo'), 'prediction.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"pick": 1', '"pick": 3'));
    expect(sealValid(readPrediction(project, 'demo')!)).toBe(false);
  });

  it('checks the picks, allows one prediction per set, and none after the pick', () => {
    const { project, set } = newSet();
    expect(code(() => writePrediction(project, set, { pick: 9, shortlist: [], why: 'x' }))).toBe('E_USAGE');
    expect(code(() => writePrediction(project, set, { pick: 4, shortlist: [], why: 'x' }))).toBe('E_USAGE'); // rejected by the check
    expect(code(() => writePrediction(project, set, { pick: 1, shortlist: [4], why: 'x' }))).toBe('E_USAGE');
    expect(code(() => writePrediction(project, set, { pick: 1, shortlist: [8], why: 'x' }))).toBe('E_USAGE');
    expect(code(() => writePrediction(project, set, { pick: 1, shortlist: [], why: '' }))).toBe('E_USAGE');
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    expect(code(() => writePrediction(project, set, { pick: 2, shortlist: [], why: 'y' }))).toBe('E_CONFLICT');
    const other = createSet(project, join(project, 't.md'), { id: 'done', count: 2 });
    writeSet(project, { ...other, picked: 1 });
    expect(code(() => writePrediction(project, readSet(project, 'done'), { pick: 1, shortlist: [], why: 'late' }))).toBe('E_CONFLICT');
  });
});

describe('what the owner will see is frozen', () => {
  it('refuses to predict when fewer than two variants survive, hinting at the check', () => {
    const p = tmpProject();
    const set = createSet(p.project, p.write('t.md', BASE), { id: 'flat', count: 3 });
    let err: ProseError | undefined;
    try { writePrediction(p.project, set, { pick: 1, shortlist: [], why: 'x' }); } catch (e) { err = e as ProseError; }
    expect(err?.code).toBe('E_USAGE');
    expect(err?.hint).toMatch(/at least 2/);
  });

  it('names the kept variants when the pick is not one of them, and drops the pick from the shortlist', () => {
    const { project, set } = newSet();
    let err: ProseError | undefined;
    try { writePrediction(project, set, { pick: 4, shortlist: [], why: 'x' }); } catch (e) { err = e as ProseError; }
    expect(err?.hint).toMatch(/1, 2, 3/);
    expect(writePrediction(project, set, { pick: 2, shortlist: [2, 1], why: 'x' }).shortlist).toEqual([1]);
  });

  it('seals the shown list and the hashes too', () => {
    const { project, set } = newSet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    const file = join(setDir(project, 'demo'), 'prediction.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/"shown": \[[^\]]*\]/, '"shown": [1, 2]'));
    const p = readPrediction(project, 'demo')!;
    expect(p.shown).toEqual([1, 2]);
    expect(sealValid(p)).toBe(false);
  });
});

describe('readPrediction on damaged files', () => {
  it('explains invalid JSON and a pick outside the set instead of crashing', () => {
    const { project, set } = newSet();
    const file = join(setDir(project, 'demo'), 'prediction.json');
    writeFileSync(file, '{oops');
    let err: ProseError | undefined;
    try { readPrediction(project, 'demo'); } catch (e) { err = e as ProseError; }
    expect(err?.code).toBe('E_SCHEMA');
    expect(err?.message).toContain(file);
    expect(err?.hint).toMatch(/delete it and predict again/);
    writeFileSync(file, JSON.stringify({ schema: 'prose/prediction@1', set: 'demo', pick: 99, shortlist: [], why: 'x', at: 'x', shown: [1, 2], hashes: {}, seal: 'a'.repeat(64) }));
    expect(code(() => readPrediction(project, 'demo', set))).toBe('E_SCHEMA');
  });
});

describe('prose predict', () => {
  it('seals a guess from the CLI', async () => {
    const { project } = newSet();
    const out = await run('predict', '--set', 'demo', '--pick', '2', '--shortlist', '2,3', '--why', 'driest and shortest', '--dir', project);
    expect(out).toMatchObject({ set: 'demo', pick: 2, shortlist: [3], shown: [1, 2, 3] });
    expect(out.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(out.next).toMatch(/prose set pick demo/);
  });
});
