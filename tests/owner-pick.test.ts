import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { FEATURES } from '../src/owner/features.ts';
import { setDir, globalTasteDir, projectTasteDir } from '../src/owner/paths.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { recordPick } from '../src/owner/pick.ts';
import { createSet, readSet, variantPath } from '../src/owner/sets.ts';
import { predictionStats } from '../src/owner/stats.ts';
import { readVerdicts } from '../src/owner/verdicts.ts';
import { BASE, PUNCHY, SHORT, WARM, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
const { home } = useTempHome();
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

function readySet(id = 'demo') {
  const p = tmpProject();
  const set = createSet(p.project, p.write('t.md', BASE), { id, count: 3, directions: ['shorter', 'warmer', 'shorter'] });
  [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  return { ...p, set };
}

describe('recordPick', () => {
  it('writes one verdict per other variant, with frozen feature vectors, to the project and per-user logs', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 2, shortlist: [3], why: 'warm wins weddings' });
    const r = recordPick(project, set, 2, { tags: ['warm'] });
    expect(r.verdicts).toBe(2);
    const rows = readVerdicts(join(projectTasteDir(project), 'verdicts.jsonl')).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ schema: 'prose/verdict@2', set: 'demo', setUid: set.uid, kind: 'pick', form: 'speech-small', tags: ['warm'] });
    expect(rows[0].winner.index).toBe(2);
    expect(rows.map(x => x.loser.index).sort()).toEqual([1, 3]);
    expect(rows[0].weight).toBeCloseTo(0.5, 6); // three shown: one choice totals about one duel
    expect(rows[0].winner.x).toHaveLength(FEATURES.length);
    expect(readVerdicts(join(globalTasteDir(), 'verdicts.jsonl')).rows).toHaveLength(2);
    expect(readSet(project, 'demo')).toMatchObject({ picked: 2 });
  });

  it('reveals whether the sealed guess hit, and logs it for the statistics', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 2, shortlist: [3], why: 'x' });
    const r = recordPick(project, set, 3, {});
    expect(r.reveal).toMatchObject({ agent: { pick: 2, hit: false, shortlistHit: true, sealValid: true } });
    expect(JSON.parse(readFileSync(join(setDir(project, 'demo'), 'reveal.json'), 'utf8')).agent.hit).toBe(false);
  });

  it('refuses a pick without a sealed prediction unless told so, and then reveals nothing', () => {
    const { project, set } = readySet();
    expect(code(() => recordPick(project, set, 1, {}))).toBe('E_PREDICTION_REQUIRED');
    const r = recordPick(project, set, 1, { noPredict: true });
    expect(r.reveal).toBeNull();
  });

  it('refuses a second pick, an unknown variant and a rejected one', () => {
    const { project, set } = readySet();
    expect(code(() => recordPick(project, set, 9, { noPredict: true }))).toBe('E_USAGE');
    recordPick(project, set, 1, { noPredict: true });
    expect(code(() => recordPick(project, readSet(project, 'demo'), 2, { noPredict: true }))).toBe('E_CONFLICT');
    const q = readySet('other');
    writeFileSync(variantPath(q.project, q.set, q.set.variants[0]), BASE); // unchanged → rejected by the check
    expect(code(() => recordPick(q.project, readSet(q.project, 'other'), 1, { noPredict: true }))).toBe('E_USAGE');
  });

  it('refuses a pick when the sealed prediction was edited, unless told to record without a guess', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    const f = join(setDir(project, 'demo'), 'prediction.json');
    writeFileSync(f, readFileSync(f, 'utf8').replace('"pick": 1', '"pick": 2'));
    let err: ProseError | undefined;
    try { recordPick(project, set, 2, {}); } catch (e) { err = e as ProseError; }
    expect(err?.code).toBe('E_CONFLICT');
    expect(err?.message).toMatch(/edited after sealing/);
    expect(err?.hint).toMatch(/--no-predict/);
    expect(readSet(project, 'demo').picked).toBeUndefined();
    const r = recordPick(project, set, 2, { noPredict: true });
    expect(r.reveal).toBeNull();
    expect(existsSync(join(setDir(project, 'demo'), 'reveal.json'))).toBe(false);
    expect(r.voided).toBe('edited');
    expect(predictionStats({})).toMatchObject({ sessions: 1, agent: { predicted: 1, hits: 0, voided: 1 } });
  });

  it('refuses a pick when a shown variant was edited after the prediction was sealed', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    writeFileSync(variantPath(project, set, set.variants[1]), WARM + '\nOne more line.\n');
    let err: ProseError | undefined;
    try { recordPick(project, set, 1, {}); } catch (e) { err = e as ProseError; }
    expect(err?.code).toBe('E_CONFLICT');
    expect(err?.message).toBe('variant 2 changed after the prediction was sealed');
    expect(err?.hint).toMatch(/--no-predict/);
    expect(recordPick(project, set, 1, { noPredict: true }).verdicts).toBe(2);
  });

  it('builds verdicts from the frozen shown list, not from a fresh check', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    const r = recordPick(project, set, 1, {});
    expect(r.verdicts).toBe(2);
    const rows = readVerdicts(join(projectTasteDir(project), 'verdicts.jsonl')).rows;
    expect(rows.map(x => x.loser.index).sort()).toEqual([2, 3]);
  });

  it('refuses a pick when fewer than two variants survive the check, with the check hint', () => {
    const { project, set } = readySet();
    writeFileSync(variantPath(project, set, set.variants[1]), BASE);
    writeFileSync(variantPath(project, set, set.variants[2]), BASE);
    let err: ProseError | undefined;
    try { recordPick(project, set, 1, { noPredict: true }); } catch (e) { err = e as ProseError; }
    expect(err?.code).toBe('E_USAGE');
    expect(err?.hint).toMatch(/at least 2/);
    expect(readVerdicts(join(projectTasteDir(project), 'verdicts.jsonl')).rows).toHaveLength(0);
  });
});

describe('predictionStats', () => {
  it('counts hits and shortlist hits across sets, and per project', () => {
    const a = readySet('a');
    const b = readySet('b');
    writePrediction(a.project, a.set, { pick: 2, shortlist: [], why: 'x' });
    recordPick(a.project, a.set, 2, {});
    writePrediction(b.project, b.set, { pick: 1, shortlist: [3], why: 'x' });
    recordPick(b.project, b.set, 3, {});
    const all = predictionStats({});
    expect(all).toMatchObject({ sessions: 2, agent: { predicted: 2, hits: 1, shortlistHits: 0, shortlistEligible: 0, rate: 0.5 } });
    expect(predictionStats({ project: a.project })).toMatchObject({ sessions: 1, agent: { hits: 1, rate: 1 } });
    expect(predictionStats({ project: '/nowhere' })).toMatchObject({ sessions: 0, agent: { predicted: 0, rate: null } });
    expect(home()).toBeTruthy();
  });
});

describe('predictionStats and voided rows', () => {
  it('counts a voided row as a missed prediction, and still parses rows without a schema', () => {
    const { project } = readySet();
    mkdirSync(globalTasteDir(), { recursive: true });
    const row = (set: string, extra: object) => JSON.stringify({ at: 'x', project, set, picked: 1, agent: { pick: 1, shortlist: [], why: 'x', hit: true, shortlistHit: true, sealValid: true, ...extra } });
    writeFileSync(join(globalTasteDir(), 'predictions.jsonl'), `${row('a', {})}
${row('b', { hit: false, shortlistHit: false, sealValid: false, voided: 'edited' })}
`);
    expect(predictionStats({})).toMatchObject({ sessions: 2, agent: { predicted: 2, hits: 1, voided: 1, rate: 0.5 } });
  });

  it('records a discarded prediction as a voided miss in the ledger', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    writeFileSync(variantPath(project, set, set.variants[1]), WARM + '\nOne more line.\n');
    const r = recordPick(project, set, 1, { noPredict: true });
    expect(r.reveal).toBeNull();
    expect(r.voided).toBe('variant-changed');
    expect(r.next).toMatch(/voided/);
    const rows = readFileSync(join(globalTasteDir(), 'predictions.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ schema: 'prose/ledger@1', set: 'demo', picked: 1, agent: { hit: false, shortlistHit: false, sealValid: false, voided: 'variant-changed' } });
    expect(predictionStats({})).toMatchObject({ agent: { predicted: 1, hits: 0, voided: 1, rate: 0 } });
  });

  it('puts the schema on a normal ledger row and on pick.pending.json', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    recordPick(project, set, 1, {});
    expect(JSON.parse(readFileSync(join(globalTasteDir(), 'predictions.jsonl'), 'utf8').trim())).toMatchObject({ schema: 'prose/ledger@1' });
  });

  it('writes pick.pending.json with its schema', () => {
    const { project, set } = readySet();
    mkdirSync(join(globalTasteDir(), 'verdicts.jsonl'), { recursive: true }); // the per-user append fails, leaving the pending file
    expect(() => recordPick(project, set, 1, { noPredict: true })).toThrow();
    expect(JSON.parse(readFileSync(join(setDir(project, 'demo'), 'pick.pending.json'), 'utf8'))).toMatchObject({ schema: 'prose/pick-pending@1', pick: 1 });
  });
});

describe('prose set pick and prose taste stats', () => {
  it('records the pick from the CLI and shows the hit rate', async () => {
    const { project, set } = readySet();
    await run('predict', '--set', set.id, '--pick', '2', '--why', 'warm', '--dir', project);
    const out = await run('set', 'pick', set.id, '--pick', '2', '--dir', project);
    expect(out).toMatchObject({ set: 'demo', picked: 2, verdicts: 2, reveal: { agent: { hit: true } } });
    expect(out.file).toBe('v2.md');
    expect(out.next).toMatch(/apply|copy/i);
    expect((await run('taste', 'stats', '--dir', project)).agent).toMatchObject({ predicted: 1, hits: 1, rate: 1 });
  });
});
