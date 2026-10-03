import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { recordDuel } from '../src/owner/duel.ts';
import { FEATURES } from '../src/owner/features.ts';
import { globalTasteDir, projectKey, projectTasteDir, setDir } from '../src/owner/paths.ts';
import { recordPick } from '../src/owner/pick.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { createSet, readSet, variantPath } from '../src/owner/sets.ts';
import { VerdictSchema, readVerdicts, verdictKey } from '../src/owner/verdicts.ts';
import { withSetLock, withSetLocks } from '../src/owner/fsutil.ts';
import { BASE, PUNCHY, SHORT, WARM, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';
import { fixture, run } from './helpers.ts';

useTmp();
const { home } = useTempHome();
const fail = (fn: () => unknown): ProseError => { try { fn(); } catch (e) { return e as ProseError; } throw new Error('did not throw'); };

function readySet(id = 'demo') {
  const p = tmpProject();
  const set = createSet(p.project, p.write('t.md', BASE), { id, count: 3, directions: ['shorter', 'warmer', 'shorter'] });
  [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  return { ...p, set };
}
const projectLog = (project: string) => join(projectTasteDir(project), 'verdicts.jsonl');
const globalLog = () => join(globalTasteDir(), 'verdicts.jsonl');

describe('recordDuel', () => {
  it('appends one weight-1 duel row, centred on the set, to the project and global logs', () => {
    const { project } = readySet();
    const r = recordDuel(project, 'demo', { a: 1, b: 3, outcome: 'b', eventId: 'e1' });
    expect(r).toEqual({ appended: 1, skipped: 0 });
    const rows = readVerdicts(projectLog(project)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'duel', eventId: 'e1', weight: 1, shown: [1, 3], n: 2, winner: { index: 3 }, loser: { index: 1 } });
    expect(rows[0].winner.x).toHaveLength(FEATURES.length);
    expect(readVerdicts(globalLog()).rows).toHaveLength(1);
  });

  it('skips a retry with the same eventId and appends a new eventId', () => {
    const { project } = readySet();
    recordDuel(project, 'demo', { a: 1, b: 2, outcome: 'a', eventId: 'e1' });
    expect(recordDuel(project, 'demo', { a: 1, b: 2, outcome: 'a', eventId: 'e1' })).toEqual({ appended: 0, skipped: 1 });
    expect(recordDuel(project, 'demo', { a: 1, b: 2, outcome: 'a', eventId: 'e2' })).toEqual({ appended: 1, skipped: 0 });
    expect(readVerdicts(projectLog(project)).rows).toHaveLength(2);
    expect(readVerdicts(globalLog()).rows).toHaveLength(2);
  });

  it('records a tie and both-bad as one symmetric weight-1 row, winner = a, loser = b', () => {
    const { project } = readySet();
    recordDuel(project, 'demo', { a: 2, b: 1, outcome: 'tie', eventId: 't' });
    recordDuel(project, 'demo', { a: 3, b: 2, outcome: 'bothBad', eventId: 'bb' });
    const rows = readVerdicts(projectLog(project)).rows;
    expect(rows[0]).toMatchObject({ kind: 'tie', weight: 1, shown: [2, 1], n: 2, winner: { index: 2 }, loser: { index: 1 } });
    expect(rows[1]).toMatchObject({ kind: 'bothBad', weight: 1, shown: [3, 2], n: 2, winner: { index: 3 }, loser: { index: 2 } });
  });

  it('refuses when a variant was edited after the prediction was sealed', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    writeFileSync(variantPath(project, set, set.variants[1]), WARM + '\nAn extra sentence nobody sealed.\n');
    const e = fail(() => recordDuel(project, 'demo', { a: 1, b: 2, outcome: 'a', eventId: 'e' }));
    expect(e.code).toBe('E_CONFLICT');
    expect(e.message).toMatch(/variant 2 changed after the prediction was sealed/);
    expect(existsSync(projectLog(project))).toBe(false);
  });

  it('refuses a variant outside the frozen shown list, hinting the kept indexes', () => {
    const { project, set } = readySet();
    writeFileSync(variantPath(project, set, set.variants[2]), BASE); // unchanged -> rejected by the check
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    const e = fail(() => recordDuel(project, 'demo', { a: 1, b: 3, outcome: 'a', eventId: 'e' }));
    expect(e.code).toBe('E_USAGE');
    expect(e.hint).toMatch(/1, 2/);
    expect(fail(() => recordDuel(project, 'demo', { a: 1, b: 9, outcome: 'a', eventId: 'e' })).code).toBe('E_USAGE');
  });

  it('works without a prediction (the check keep list) and refuses a rejected variant and a = b', () => {
    const { project, set } = readySet();
    writeFileSync(variantPath(project, set, set.variants[2]), BASE);
    expect(recordDuel(project, 'demo', { a: 1, b: 2, outcome: 'a', eventId: 'e' }).appended).toBe(1);
    expect(fail(() => recordDuel(project, 'demo', { a: 1, b: 3, outcome: 'a', eventId: 'f' })).code).toBe('E_USAGE');
    expect(fail(() => recordDuel(project, 'demo', { a: 1, b: 1, outcome: 'a', eventId: 'g' })).code).toBe('E_USAGE');
  });

  it('refuses a duel on a picked set', () => {
    const { project } = readySet();
    recordPick(project, readSet(project, 'demo'), 1, { noPredict: true });
    expect(fail(() => recordDuel(project, 'demo', { a: 1, b: 2, outcome: 'a', eventId: 'e' })).code).toBe('E_CONFLICT');
  });

  it('writes no ledger, no reveal and no picked marker', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    recordDuel(project, 'demo', { a: 1, b: 2, outcome: 'a', eventId: 'e' });
    expect(existsSync(join(globalTasteDir(), 'predictions.jsonl'))).toBe(false);
    expect(existsSync(join(setDir(project, 'demo'), 'reveal.json'))).toBe(false);
    expect(readSet(project, 'demo').picked).toBeUndefined();
  });
});

/** Two sets in one project: `old` (the champion's, round 0) and `new` (a later round's), with different texts. */
function twoSets() {
  const p = tmpProject();
  const old = createSet(p.project, p.write('t.md', BASE), { id: 'old', count: 3, directions: ['shorter', 'warmer', 'shorter'] });
  [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, old, old.variants[k]), text));
  const next = createSet(p.project, p.write('t.md', BASE), { id: 'new', count: 3, directions: ['shorter', 'warmer', 'shorter'] });
  [SHORT.replace('We built', 'We forged'), WARM.replace('you know', 'friends'), PUNCHY.replace('Nobody', 'No one')]
    .forEach((text, k) => writeFileSync(variantPath(p.project, next, next.variants[k]), text));
  return { ...p, old, next };
}
const OLD = (index: number) => ({ set: 'old', index });

describe('recordDuel across two sets', () => {
  it('appends one decisive row in the challenger set; only the foreign side carries set and setUid', () => {
    const { project, old, next } = twoSets();
    writePrediction(project, old, { pick: 2, shortlist: [], why: 'x' });
    expect(recordDuel(project, 'new', { a: OLD(2), b: 3, outcome: 'b', eventId: 'e1' })).toEqual({ appended: 1, skipped: 0 });
    const rows = readVerdicts(projectLog(project)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'duel', set: 'new', setUid: next.uid, eventId: 'e1', weight: 1, shown: [2, 3], n: 2, winner: { index: 3 }, loser: { index: 2, set: 'old', setUid: old.uid } });
    expect(Object.keys(rows[0].winner)).toEqual(['index', 'x']);
    expect(rows[0].loser.x).toHaveLength(FEATURES.length);
    // centred on the pair: the two vectors are exact opposites
    expect(rows[0].winner.x.every((v, i) => Math.abs(v + rows[0].loser.x[i]) < 1e-9)).toBe(true);
    expect(readVerdicts(globalLog()).rows).toHaveLength(1);
  });

  it('records tie and both-bad across sets as symmetric rows, winner = a, loser = b', () => {
    const { project, old } = twoSets();
    recordDuel(project, 'new', { a: OLD(1), b: 2, outcome: 'tie', eventId: 't' });
    recordDuel(project, 'new', { a: 2, b: OLD(3), outcome: 'bothBad', eventId: 'bb' });
    const [tie, bad] = readVerdicts(projectLog(project)).rows;
    expect(tie).toMatchObject({ kind: 'tie', winner: { index: 1, set: 'old', setUid: old.uid }, loser: { index: 2 } });
    expect(tie.loser.set).toBeUndefined();
    expect(bad).toMatchObject({ kind: 'bothBad', winner: { index: 2 }, loser: { index: 3, set: 'old', setUid: old.uid } });
  });

  it('skips a retry with the same eventId; a different pair or a new eventId is a new row', () => {
    const { project } = twoSets();
    recordDuel(project, 'new', { a: OLD(2), b: 3, outcome: 'a', eventId: 'e1' });
    expect(recordDuel(project, 'new', { a: OLD(2), b: 3, outcome: 'a', eventId: 'e1' })).toEqual({ appended: 0, skipped: 1 });
    expect(recordDuel(project, 'new', { a: OLD(1), b: 3, outcome: 'a', eventId: 'e1' })).toEqual({ appended: 1, skipped: 0 }); // other pair
    expect(recordDuel(project, 'new', { a: OLD(2), b: 3, outcome: 'a', eventId: 'e2' })).toEqual({ appended: 1, skipped: 0 });
    expect(readVerdicts(projectLog(project)).rows).toHaveLength(3);
    expect(readVerdicts(globalLog()).rows).toHaveLength(3);
  });

  it('refuses a foreign variant edited after ITS sealing, naming that set', () => {
    const { project, old } = twoSets();
    writePrediction(project, old, { pick: 2, shortlist: [], why: 'x' });
    writeFileSync(variantPath(project, old, old.variants[1]), WARM + '\nAn extra sentence nobody sealed.\n');
    const e = fail(() => recordDuel(project, 'new', { a: OLD(2), b: 3, outcome: 'a', eventId: 'e' }));
    expect(e.code).toBe('E_CONFLICT');
    expect(e.message).toMatch(/Set old: variant 2 changed after the prediction was sealed/);
    expect(existsSync(projectLog(project))).toBe(false);
  });

  it("refuses a foreign variant outside its set's frozen shown list, and one rejected by its set check", () => {
    const { project, old } = twoSets();
    writeFileSync(variantPath(project, old, old.variants[2]), BASE); // unchanged -> rejected
    expect(fail(() => recordDuel(project, 'new', { a: OLD(3), b: 1, outcome: 'a', eventId: 'e' })).message).toMatch(/Set old: Variant 3 was rejected/);
    writePrediction(project, old, { pick: 1, shortlist: [], why: 'x' }); // shown = [1, 2]
    const e = fail(() => recordDuel(project, 'new', { a: OLD(3), b: 1, outcome: 'a', eventId: 'e' }));
    expect(e.code).toBe('E_USAGE');
    expect(e.message).toMatch(/Set old: Variant 3 was not among/);
    expect(e.hint).toMatch(/1, 2/);
    expect(existsSync(projectLog(project))).toBe(false);
  });

  it('refuses when either set was already picked, when the call set holds neither side, and an equal pair', () => {
    const { project, old } = twoSets();
    expect(fail(() => recordDuel(project, 'new', { a: OLD(1), b: OLD(2), outcome: 'a', eventId: 'e' })).code).toBe('E_USAGE');
    expect(fail(() => recordDuel(project, 'new', { a: { set: 'new', index: 1 }, b: 1, outcome: 'a', eventId: 'e' })).code).toBe('E_USAGE');
    recordPick(project, old, 1, { noPredict: true });
    expect(fail(() => recordDuel(project, 'new', { a: OLD(2), b: 3, outcome: 'a', eventId: 'e' })).message).toMatch(/Set old was already picked/);
  });

  it('a same-set row is unchanged on disk and in its dedupe key', () => {
    const { project, set } = readySet();
    recordDuel(project, 'demo', { a: 1, b: 3, outcome: 'b', eventId: 'e1' }, { now: new Date('2026-10-03T00:00:00.000Z') });
    const line = readFileSync(projectLog(project), 'utf8').trim();
    const row = JSON.parse(line);
    expect(Object.keys(row)).toEqual(['schema', 'at', 'project', 'set', 'setUid', 'kind', 'eventId', 'form', 'register', 'voices', 'winner', 'loser', 'weight', 'tags', 'features', 'shown', 'n']);
    expect(Object.keys(row.winner)).toEqual(['index', 'x']);
    expect(Object.keys(row.loser)).toEqual(['index', 'x']);
    expect(line.match(/"setUid"/g)).toHaveLength(1);
    expect(line.startsWith(`{"schema":"prose/verdict@2","at":"2026-10-03T00:00:00.000Z","project":${JSON.stringify(project)},"set":"demo","setUid":"${set.uid}","kind":"duel","eventId":"e1"`)).toBe(true);
    expect(verdictKey(row)).toBe(JSON.stringify([projectKey(project), 'demo', set.uid, 3, 1, 'duel', 'e1']));
  });

  it('cross-set keys name both sides, so they differ from a same-set key and from each other', () => {
    const { project, old, next } = twoSets();
    const base = { project, set: 'new', setUid: next.uid, kind: 'duel', eventId: 'e' };
    const k = (w: object, l: object) => verdictKey({ ...base, winner: w, loser: l } as any);
    const f = { set: 'old', setUid: old.uid };
    expect(k({ index: 3 }, { index: 2, ...f })).not.toBe(k({ index: 3 }, { index: 1, ...f }));
    expect(k({ index: 3 }, { index: 2, ...f })).not.toBe(k({ index: 3 }, { index: 2 }));
    expect(k({ index: 3 }, { index: 2, ...f })).toBe(k({ index: 3 }, { index: 2, ...f }));
  });
});

describe('withSetLocks', () => {
  it('takes the locks in set-id order whatever order they are named in', () => {
    const { project } = twoSets(); // sets `new` and `old`; `new` sorts first
    // with `new` held, a caller naming (old, new) fails on `new` WITHOUT having taken `old`
    withSetLock(project, 'new', () => {
      const e = fail(() => withSetLocks(project, ['old', 'new'], () => 0, { timeoutMs: 150 }));
      expect(e.code).toBe('E_CONFLICT');
      expect(e.message).toMatch(/Set new/);
      expect(existsSync(join(setDir(project, 'old'), '.lock'))).toBe(false);
    });
    // with `old` held, `new` (earlier) is taken first, then the wait for `old` times out and `new` is released
    withSetLock(project, 'old', () => {
      expect(fail(() => withSetLocks(project, ['new', 'old'], () => 0, { timeoutMs: 150 })).message).toMatch(/Set old/);
      expect(existsSync(join(setDir(project, 'new'), '.lock'))).toBe(false);
    });
  });
});

describe('prose set duel across sets', () => {
  it('records in <id> with --a-set / --b-set; an unknown set, an equal pair and a set holding neither side are E_USAGE', async () => {
    const { project, old } = twoSets();
    const out = await run('set', 'duel', 'new', '--a', '2', '--a-set', 'old', '--b', '3', '--outcome', 'b', '--event-id', 'x', '--dir', project);
    expect(out).toMatchObject({ set: 'new', appended: 1, rows: [{ kind: 'duel', winner: 3, loser: 2 }] });
    expect(readVerdicts(projectLog(project)).rows[0].loser).toMatchObject({ index: 2, set: 'old', setUid: old.uid });
    const bad = async (...args: string[]) => { try { await run('set', 'duel', 'new', '--dir', project, ...args); } catch (e) { return e as ProseError; } throw new Error('ok'); };
    expect((await bad('--a', '1', '--b', '2', '--a-set', 'nope', '--outcome', 'a')).code).toBe('E_USAGE');
    expect((await bad('--a', '1', '--b', '1', '--a-set', 'new', '--b-set', 'new', '--outcome', 'a')).code).toBe('E_USAGE');
    expect((await bad('--a', '1', '--b', '2', '--a-set', 'old', '--b-set', 'old', '--outcome', 'a')).code).toBe('E_USAGE'); // neither side in <id>
  });

  it('processes with the sides swapped, started together, never deadlock: all finish inside the lock timeout', async () => {
    const { project } = twoSets();
    const env = { ...process.env, AGENT_PROSE_HOME: home() };
    const proc = (args: string[]) => new Promise<{ status: number | null; out: string; err: string }>(resolve => {
      const c = spawn(process.execPath, ['scripts/prose.mjs', 'set', 'duel', 'new', ...args, '--outcome', 'a', '--dir', project], { env, cwd: process.cwd() });
      let out = ''; let err = '';
      c.stdout.on('data', d => { out += d; });
      c.stderr.on('data', d => { err += d; });
      c.on('close', status => resolve({ status, out, err }));
    });
    const started = Date.now();
    const results = await Promise.all([1, 2, 3].flatMap(k => [
      proc(['--a', '1', '--a-set', 'old', '--b', '2', '--b-set', 'new', '--event-id', `ab${k}`]),
      proc(['--a', '2', '--a-set', 'new', '--b', '1', '--b-set', 'old', '--event-id', `ba${k}`]),
    ]));
    // a deadlock would run into the 5 s lock timeout, and the process would exit non-zero with E_CONFLICT
    for (const r of results) expect({ status: r.status, err: r.err }).toEqual({ status: 0, err: '' });
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(readVerdicts(projectLog(project)).rows).toHaveLength(6);
  }, 60_000);
});

describe('taste stats across sets', () => {
  it('counts a cross-set row as a decisive duel', async () => {
    const { project } = twoSets();
    recordDuel(project, 'new', { a: OLD(2), b: 3, outcome: 'a', eventId: '1' });
    expect((await run('taste', 'stats', '--dir', project)).duels).toEqual({ project: { decisive: 1, ties: 0, bothBad: 0 }, global: { decisive: 1, ties: 0, bothBad: 0 } });
  });
});

describe('verdict rows written by 0.2.0', () => {
  const old = readFileSync(fixture('verdict-0.2.0.jsonl'), 'utf8').trim();

  it('still parse, with no eventId', () => {
    const row = VerdictSchema.parse(JSON.parse(old));
    expect(row.kind).toBe('pick');
    expect(row.eventId).toBeUndefined();
  });

  it('still dedupe against a freshly written pick', () => {
    const { project, set } = readySet();
    const row = { ...JSON.parse(old), project, setUid: set.uid };
    for (const f of [projectLog(project), globalLog()]) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(row) + '\n'); }
    const r = recordPick(project, set, 2, { noPredict: true }); // rows (2 over 1) and (2 over 3)
    expect(r).toMatchObject({ verdicts: 2, appended: 1, skipped: 1 });
    expect(readVerdicts(projectLog(project)).rows).toHaveLength(2);
  });

  it('a duel row has a different key from a pick row of the same pair', () => {
    const { project, set } = readySet();
    const row = { ...JSON.parse(old), project, setUid: set.uid, kind: 'duel', eventId: 'e', n: 2, shown: [2, 1], weight: 1 };
    for (const f of [projectLog(project), globalLog()]) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(row) + '\n'); }
    expect(recordPick(project, set, 2, { noPredict: true })).toMatchObject({ verdicts: 2, appended: 2, skipped: 0 });
  });
});

describe('prose set duel', () => {
  it('emits appended/skipped and validates its arguments', async () => {
    const { project } = readySet();
    const out = await run('set', 'duel', 'demo', '--a', '1', '--b', '2', '--outcome', 'tie', '--event-id', 'abc', '--position', 'ba', '--dir', project);
    expect(out).toMatchObject({ set: 'demo', appended: 1, skipped: 0, rows: [{ kind: 'tie', winner: 1, loser: 2, weight: 1 }] });
    const again = await run('set', 'duel', 'demo', '--a', '1', '--b', '2', '--outcome', 'tie', '--event-id', 'abc', '--dir', project);
    expect(again).toMatchObject({ appended: 0, skipped: 1 });
    const bad = async (...args: string[]) => { try { await run('set', 'duel', 'demo', '--dir', project, ...args); } catch (e) { return e as ProseError; } throw new Error('ok'); };
    expect((await bad('--a', 'x', '--b', '2', '--outcome', 'a')).code).toBe('E_USAGE');
    expect((await bad('--a', '1', '--b', '1', '--outcome', 'a')).code).toBe('E_USAGE');
    const o = await bad('--a', '1', '--b', '2', '--outcome', 'win');
    expect(o.code).toBe('E_USAGE');
    expect(o.hint).toMatch(/a, b, tie, bothBad/);
    expect((await bad('--a', '1', '--b', '2', '--outcome', 'a', '--position', 'xx')).code).toBe('E_USAGE');
  });

  it('without --event-id a repeated duel is never silently deduped', async () => {
    const { project } = readySet();
    const args = ['set', 'duel', 'demo', '--a', '1', '--b', '2', '--outcome', 'a', '--dir', project];
    await run(...args);
    expect((await run(...args)).appended).toBe(1);
  });

  it('three concurrent processes with one --event-id append exactly one row; the rest report skipped', async () => {
    const { project } = readySet();
    const env = { ...process.env, AGENT_PROSE_HOME: home() };
    const proc = () => new Promise<{ status: number | null; out: string; err: string }>(resolve => {
      const c = spawn(process.execPath, ['scripts/prose.mjs', 'set', 'duel', 'demo', '--a', '1', '--b', '2', '--outcome', 'a', '--event-id', 'same', '--dir', project], { env, cwd: process.cwd() });
      let out = ''; let err = '';
      c.stdout.on('data', d => { out += d; });
      c.stderr.on('data', d => { err += d; });
      c.on('close', status => resolve({ status, out, err }));
    });
    const results = await Promise.all([proc(), proc(), proc()]);
    for (const r of results) expect({ status: r.status, err: r.err }).toEqual({ status: 0, err: '' });
    const parsed = results.map(r => JSON.parse(r.out));
    expect(parsed.filter(p => p.appended === 1)).toHaveLength(1);
    expect(parsed.filter(p => p.skipped === 1)).toHaveLength(2);
    expect(readVerdicts(projectLog(project)).rows).toHaveLength(1);
    expect(readVerdicts(globalLog()).rows).toHaveLength(1);
  }, 60_000);
});

describe('taste stats and duels', () => {
  it('counts only picks for predictions, and reports duels separately', async () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    recordDuel(project, 'demo', { a: 1, b: 2, outcome: 'a', eventId: '1' });
    recordDuel(project, 'demo', { a: 1, b: 2, outcome: 'b', eventId: '2' });
    recordDuel(project, 'demo', { a: 1, b: 2, outcome: 'tie', eventId: '3' });
    recordDuel(project, 'demo', { a: 1, b: 2, outcome: 'bothBad', eventId: '4' });
    const before = await run('taste', 'stats', '--dir', project);
    expect(before).toMatchObject({ sessions: 0, agent: { predicted: 0, hits: 0, rate: null } });
    expect(before.duels).toEqual({ project: { decisive: 2, ties: 1, bothBad: 1 }, global: { decisive: 2, ties: 1, bothBad: 1 } });
    recordPick(project, readSet(project, 'demo'), 1, {});
    const after = await run('taste', 'stats', '--dir', project);
    expect(after).toMatchObject({ sessions: 1, agent: { predicted: 1, hits: 1, rate: 1 } });
    expect(after.duels.project).toEqual({ decisive: 2, ties: 1, bothBad: 1 }); // the pick's own rows are not duels
    const all = await run('taste', 'stats', '--all-projects', '--dir', project);
    expect(all.duels).toEqual({ global: { decisive: 2, ties: 1, bothBad: 1 } });
  });
});
