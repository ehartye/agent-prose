import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { FEATURES } from '../src/owner/features.ts';
import { globalTasteDir, setDir } from '../src/owner/paths.ts';
import { recordPick } from '../src/owner/pick.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { createSet, readSet, variantPath } from '../src/owner/sets.ts';
import { predictionStats } from '../src/owner/stats.ts';
import { appendJsonlRows, LedgerModelSchema, type Verdict } from '../src/owner/verdicts.ts';
import { registerTasteCommands } from '../src/commands/taste.ts';
import { predictWithModel, writeModelPrediction } from '../src/taste/prediction.ts';
import { ModelPredictionSchema, modelReveal, modelSealFile, modelSealOf } from '../src/taste/reveal.ts';
import { ROOT, run } from './helpers.ts';
import { BASE, PUNCHY, SHORT, WARM, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
useTempHome();

const NOW = new Date(Date.UTC(2026, 9, 3));
const DIM = FEATURES.length;
const SENTENCE = FEATURES.indexOf('sentence');
const unit = (i: number, v = 1) => Array.from({ length: DIM }, (_, k) => (k === i ? v : 0));
const LONG = '---\nform: speech-small\n---\n\nWe built the bridge across the wide river through four long years of rain and cold and dark, and the town that doubted us at the start now walks it every morning on the way to work without a thought for what it cost.\n';

/** A synthetic owner who prefers shorter sentences: 30 duels from another project, so only the global layer is fitted. */
function seedShorterOwner() {
  const rows = Array.from({ length: 30 }, (_, i) => {
    const s = (i % 3) + 1;
    return {
      schema: 'prose/verdict@2', features: 'v1', at: '2026-01-01T00:00:00.000Z', project: '/elsewhere', set: `s${i}`, setUid: `uid-${String(i).padStart(8, '0')}`, kind: 'duel', form: 'speech-small',
      register: null, voices: [], winner: { index: 1, x: unit(SENTENCE, -s) }, loser: { index: 2, x: unit(SENTENCE, s) }, weight: 1, tags: [], shown: [1, 2], n: 2,
    } as Verdict;
  });
  appendJsonlRows(join(globalTasteDir(), 'verdicts.jsonl'), rows);
}

function readySet(id = 'demo', texts = [SHORT, WARM, PUNCHY, LONG]) {
  const p = tmpProject();
  const set = createSet(p.project, p.write('t.md', BASE), { id, count: texts.length });
  texts.forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  return { ...p, set };
}
const predict = (project: string, set: ReturnType<typeof readSet>, pick = 1) => predictWithModel(project, set, { pick, shortlist: [], why: 'x', now: NOW });
const modelFile = (project: string, id = 'demo') => join(setDir(project, id), 'model-prediction.json');
const readModel = (project: string, id = 'demo') => JSON.parse(readFileSync(modelFile(project, id), 'utf8'));
const ledger = () => readFileSync(join(globalTasteDir(), 'predictions.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const rmGlobal = () => rmSync(globalTasteDir(), { recursive: true, force: true });

describe('writeModelPrediction at predict time', () => {
  it('with no verdicts writes an abstaining model prediction and leaves the agent prediction byte-identical', () => {
    const before = readySet(), after = readySet();
    writePrediction(before.project, before.set, { pick: 1, shortlist: [], why: 'x', now: NOW }); // what predict wrote before this task
    predict(after.project, after.set, 1);
    expect(readFileSync(join(setDir(after.project, 'demo'), 'prediction.json'), 'utf8')).toBe(readFileSync(join(setDir(before.project, 'demo'), 'prediction.json'), 'utf8'));
    const m = readModel(after.project);
    expect(m).toMatchObject({ schema: 'prose/model-prediction@1', set: 'demo', features: 'v1', pick: null, shortlist: [], ranking: [], abstained: 'no data yet', shown: [1, 2, 3, 4] });
    expect(ModelPredictionSchema.safeParse(m).success).toBe(true);
    expect(m.seal).toBe(modelSealOf(m));
  });

  it('follows the learned preference: a synthetic owner who prefers shorter sentences gets the shortest-sentence variant', () => {
    seedShorterOwner();
    const { project, set } = readySet();
    const { model } = predict(project, set, 1);
    expect(model.abstained).toBeNull();
    expect(model.pick).toBe(3); // PUNCHY: the shortest sentences
    expect(model.ranking[0].index).toBe(3);
    expect(model.ranking.at(-1)?.index).toBe(4); // LONG: the longest
    expect(model.shortlist).toEqual(model.ranking.slice(0, 3).map(r => r.index));
    expect(model.ranking[0].u).toBeGreaterThan(model.ranking[1].u);
    expect(model.layers).toEqual([{ name: 'global', pairs: 30 }]);
    expect(model.weights).toHaveLength(DIM);
    expect(model.weights[SENTENCE]).toBeLessThan(0);
    expect(readFileSync(modelFile(project), 'utf8')).toBe(JSON.stringify(model, null, 2) + '\n');
  });

  it('survives a corrupt global log: an abstention, and predict still succeeds', () => {
    const { project, set } = readySet();
    mkdirSync(join(globalTasteDir(), 'verdicts.jsonl'), { recursive: true }); // unreadable as a log
    const first = predict(project, set, 2);
    expect(first.prediction.pick).toBe(2);
    expect(first.model.pick).toBeNull();
    expect(first.model.abstained).toBeTruthy();
    rmGlobal();
    mkdirSync(globalTasteDir(), { recursive: true });
    writeFileSync(join(globalTasteDir(), 'verdicts.jsonl'), '{not json\n\u0000\u0000\n');
    const g = readySet();
    expect(predict(g.project, g.set, 2).model.abstained).toBeTruthy();
  });

  it('a failure while building writes an abstention that names the class and no path', () => {
    const { project, set } = readySet();
    const agent = writePrediction(project, set, { pick: 1, shortlist: [], why: 'x', now: NOW });
    const m = writeModelPrediction(project, readSet(project, 'demo'), agent, { load: () => { throw new RangeError(`bad ${project}`); } });
    expect(m).toMatchObject({ pick: null, shortlist: [], ranking: [] });
    expect(m.abstained).toContain('RangeError');
    expect(m.abstained).not.toContain(project);
    expect(readModel(project).abstained).toBe(m.abstained);
  });

  it('prose predict says the model is sealed or abstained and never reveals its pick or ranking', async () => {
    const empty = readySet();
    const out = await run('predict', '--set', 'demo', '--pick', '1', '--why', 'x', '--dir', empty.project);
    expect(out.model).toBe('abstained (no data yet)');
    seedShorterOwner();
    const p = readySet();
    const sealed = await run('predict', '--set', 'demo', '--pick', '1', '--why', 'x', '--dir', p.project);
    expect(sealed.model).toBe('sealed');
    expect(Object.keys(sealed)).toEqual(['set', 'pick', 'shortlist', 'shown', 'why', 'at', 'seal', 'model', 'next']);
    expect(JSON.stringify(sealed)).not.toMatch(/ranking|sigma|weights/);
    expect(sealed.pick).toBe(1);
    expect(JSON.stringify(await run('set', 'show', 'demo', '--dir', p.project))).not.toMatch(/ranking|sigma|weights|model-prediction/);
    expect(JSON.stringify(await run('set', 'list', '--dir', p.project))).not.toMatch(/ranking|sigma/);
  });
});

describe('prose predict --model-only (repair after a crash between the two writes)', () => {
  it('writes the model prediction for an already-sealed agent prediction, before the pick, and scores it at the pick', async () => {
    seedShorterOwner();
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x', now: NOW }); // the crash: the agent's file is there, the model's is not
    expect(existsSync(modelFile(project))).toBe(false);
    const out = await run('predict', '--set', 'demo', '--model-only', '--dir', project);
    expect(out.model).toBe('sealed');
    expect(JSON.stringify(out)).not.toMatch(/ranking|sigma|weights/);
    expect(readModel(project)).toMatchObject({ pick: 3, abstained: null });
    expect(recordPick(project, readSet(project, 'demo'), 3, {}).reveal?.model).toMatchObject({ pick: 3, hit: true, sealValid: true });
  });

  it('refuses when there is no agent prediction, when a model file or marker already exists, or when the set is picked', async () => {
    seedShorterOwner();
    const a = readySet();
    await expect(run('predict', '--set', 'demo', '--model-only', '--dir', a.project)).rejects.toThrow(/no sealed prediction/i);
    predict(a.project, a.set, 1);
    await expect(run('predict', '--set', 'demo', '--model-only', '--dir', a.project)).rejects.toThrow(/already has a model prediction/i);
    rmSync(modelFile(a.project)); // the marker alone still counts as "the model was sealed"
    await expect(run('predict', '--set', 'demo', '--model-only', '--dir', a.project)).rejects.toThrow(/already has a model prediction/i);
    const b = readySet();
    predict(b.project, b.set, 1);
    recordPick(b.project, b.set, 3, {});
    await expect(run('predict', '--set', 'demo', '--model-only', '--dir', b.project)).rejects.toThrow(/already picked/i);
  });

  it('a normal predict still needs --pick and --why', async () => {
    const { project } = readySet();
    await expect(run('predict', '--set', 'demo', '--dir', project)).rejects.toThrow(/--pick/);
  });
});

describe('the seal', () => {
  it('detects an edited file, and a changed shown or hashes (even re-sealed) against the agent frozen ones', () => {
    seedShorterOwner();
    const { project, set } = readySet();
    const { prediction } = predict(project, set, 1);
    const frozen = { shown: prediction.shown, hashes: prediction.hashes };
    expect(modelReveal(project, 'demo', frozen, 3)).toMatchObject({ pick: 3, hit: true, sealValid: true, abstained: false });
    const good = readFileSync(modelFile(project), 'utf8');

    writeFileSync(modelFile(project), good.replace('"pick": 3', '"pick": 1'));
    expect(modelReveal(project, 'demo', frozen, 1)).toMatchObject({ sealValid: false, voided: 'edited', hit: false });

    const m = JSON.parse(good);
    const reseal = (x: Record<string, unknown>) => { const { seal: _s, ...rest } = x; return { ...rest, seal: modelSealOf(rest as never) }; };
    writeFileSync(modelFile(project), JSON.stringify(reseal({ ...m, shown: [1, 2, 3] })));
    expect(modelReveal(project, 'demo', frozen, 3)).toMatchObject({ sealValid: false, voided: 'edited' });
    writeFileSync(modelFile(project), JSON.stringify(reseal({ ...m, hashes: { ...m.hashes, '1': 'f'.repeat(64) } })));
    expect(modelReveal(project, 'demo', frozen, 3)).toMatchObject({ sealValid: false, voided: 'edited' });
    writeFileSync(modelFile(project), JSON.stringify(reseal({ ...m, features: 'v2' })));
    expect(modelReveal(project, 'demo', frozen, 3)).toMatchObject({ sealValid: false, voided: 'edited' });
    writeFileSync(modelFile(project), good);
    expect(modelReveal(project, 'demo', frozen, 3)).toMatchObject({ sealValid: true, hit: true });
  });
});

describe('the reveal at pick time', () => {
  it('reveals both predictors and scores a hit, a miss and a shortlist hit', () => {
    seedShorterOwner();
    const hit = readySet();
    predict(hit.project, hit.set, 1);
    const r = recordPick(hit.project, hit.set, 3, {});
    expect(r.reveal).toMatchObject({ agent: { pick: 1, hit: false }, model: { pick: 3, hit: true, shortlistHit: true, abstained: false, sealValid: true } });
    expect(JSON.parse(readFileSync(join(setDir(hit.project, 'demo'), 'reveal.json'), 'utf8')).model).toMatchObject({ pick: 3, hit: true });
    expect(ledger()[0]).toMatchObject({ agent: { hit: false }, model: { pick: 3, hit: true, shortlistHit: true, abstained: false, sealValid: true } });
    expect(LedgerModelSchema.safeParse(ledger()[0].model).success).toBe(true);

    const near = readySet();
    predict(near.project, near.set, 3);
    const second = readModel(near.project).ranking[1].index;
    expect(recordPick(near.project, near.set, second, {}).reveal?.model).toMatchObject({ hit: false, shortlistHit: true, abstained: false });

    const miss = readySet();
    predict(miss.project, miss.set, 3);
    expect(recordPick(miss.project, miss.set, 4, {}).reveal?.model).toMatchObject({ hit: false, shortlistHit: false, abstained: false });
  });

  it('does not reveal the model pick before the pick is recorded (no reveal file, no ledger row)', () => {
    seedShorterOwner();
    const { project, set } = readySet();
    predict(project, set, 1);
    expect(existsSync(join(setDir(project, 'demo'), 'reveal.json'))).toBe(false);
    expect(existsSync(join(globalTasteDir(), 'predictions.jsonl'))).toBe(false);
  });

  it('a model that abstained is scored as abstained, never as a miss, even if its file is edited or deleted', () => {
    for (const tamper of ['none', 'edit', 'delete']) {
      rmSync(join(globalTasteDir(), 'verdicts.jsonl'), { force: true }); // the previous round's pick would give the model data
      const { project, set } = readySet();
      predict(project, set, 1);
      if (tamper === 'edit') writeFileSync(modelFile(project), readFileSync(modelFile(project), 'utf8').replace('"pick": null', '"pick": 2'));
      if (tamper === 'delete') rmSync(modelFile(project));
      const m = recordPick(project, set, 1, {}).reveal?.model;
      expect(m, tamper).toMatchObject({ pick: null, hit: false, abstained: true });
      expect(m?.voided).toBeUndefined();
    }
    expect(predictionStats({}).model).toMatchObject({ predicted: 0, abstained: 3, voided: 0, rate: null });
  });

  it('an edited or deleted model file is a miss when the model had predicted', () => {
    seedShorterOwner();
    const edited = readySet();
    predict(edited.project, edited.set, 1);
    writeFileSync(modelFile(edited.project), readFileSync(modelFile(edited.project), 'utf8').replace('"pick": 3', '"pick": 4'));
    expect(recordPick(edited.project, edited.set, 4, {}).reveal?.model).toMatchObject({ hit: false, shortlistHit: false, sealValid: false, abstained: false, voided: 'edited' });

    const deleted = readySet();
    predict(deleted.project, deleted.set, 1);
    rmSync(modelFile(deleted.project));
    expect(recordPick(deleted.project, deleted.set, 3, {}).reveal?.model).toMatchObject({ hit: false, sealValid: false, abstained: false, voided: 'missing' });
    expect(predictionStats({}).model).toMatchObject({ predicted: 2, voided: 2, hits: 0, rate: 0 });
  });

  it('a set predicted by 0.3.0 code (no model file) records nothing for the model, and the ledger row has no model key', () => {
    seedShorterOwner();
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x', now: NOW }); // the old predict: no model file
    const r = recordPick(project, set, 3, {});
    expect(r.reveal?.agent.pick).toBe(1);
    expect(r.reveal?.model).toBeUndefined();
    expect('model' in ledger()[0]).toBe(false);
    expect(predictionStats({})).toMatchObject({ sessions: 1, agent: { predicted: 1 }, model: { predicted: 0, abstained: 0, rate: null } });
  });

  it('a variant changed after sealing voids both, as today for the agent; an abstaining model is still not a miss', () => {
    seedShorterOwner();
    const { project, set } = readySet();
    predict(project, set, 1);
    writeFileSync(variantPath(project, set, set.variants[1]), WARM + '\nOne more line.\n');
    const r = recordPick(project, set, 3, { noPredict: true });
    expect(r.reveal).toBeNull();
    expect(r.voided).toBe('variant-changed');
    expect(ledger()[0]).toMatchObject({ agent: { voided: 'variant-changed' }, model: { hit: false, abstained: false, voided: 'variant-changed' } });

    rmGlobal();
    const none = readySet();
    predict(none.project, none.set, 1); // no verdicts now: abstains
    writeFileSync(variantPath(none.project, none.set, none.set.variants[1]), WARM + '\nOne more line.\n');
    recordPick(none.project, none.set, 3, { noPredict: true });
    expect(ledger()[0]).toMatchObject({ agent: { voided: 'variant-changed' }, model: { abstained: true } });
    expect(ledger()[0].model.voided).toBeUndefined();
  });

  it('a retry after a crash does not double-count either predictor', () => {
    seedShorterOwner();
    const { project, set } = readySet();
    predict(project, set, 1);
    const blocker = join(globalTasteDir(), 'predictions.jsonl');
    mkdirSync(blocker, { recursive: true }); // the ledger append fails after the verdicts were logged
    expect(() => recordPick(project, set, 3, {})).toThrow();
    rmSync(blocker, { recursive: true });
    recordPick(project, set, 3, {});
    const rows = ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toMatchObject({ pick: 3, hit: true });
    expect(predictionStats({})).toMatchObject({ sessions: 1, agent: { predicted: 1 }, model: { predicted: 1, hits: 1 } });
  });
});

describe('the marker cannot hide a model miss', () => {
  const marker = (project: string) => JSON.parse(readFileSync(modelSealFile(project, 'demo'), 'utf8'));
  const setMarker = (project: string, patch: object) => writeFileSync(modelSealFile(project, 'demo'), JSON.stringify({ ...marker(project), ...patch }) + '\n');
  const predictedSet = () => { seedShorterOwner(); const r = readySet(); const { prediction } = predict(r.project, r.set, 1); return { ...r, frozen: { shown: prediction.shown, hashes: prediction.hashes } }; };

  it('a marker edited to abstained does not turn a model miss into an abstention (the repro)', () => {
    const { project, frozen } = predictedSet();
    setMarker(project, { abstained: true });
    expect(modelReveal(project, 'demo', frozen, 4)).toMatchObject({ abstained: false, hit: false, voided: 'edited', sealValid: false });
  });

  it('a marker with a different seal voids the prediction as edited', () => {
    const { project, frozen } = predictedSet();
    setMarker(project, { seal: 'a'.repeat(64) });
    expect(modelReveal(project, 'demo', frozen, 3)).toMatchObject({ abstained: false, hit: false, voided: 'edited', sealValid: false });
  });

  it('a marker that says predicted over a file that abstained is an edit, and a miss', () => {
    const { project, set } = readySet(); // no data: the model abstains
    const { prediction } = predict(project, set, 1);
    const frozen = { shown: prediction.shown, hashes: prediction.hashes };
    expect(modelReveal(project, 'demo', frozen, 1)).toMatchObject({ abstained: true });
    setMarker(project, { abstained: false });
    expect(modelReveal(project, 'demo', frozen, 1)).toMatchObject({ abstained: false, hit: false, voided: 'edited' });
  });

  it('an agreeing marker and file score normally; a file without a marker still does', () => {
    const { project, frozen } = predictedSet();
    expect(modelReveal(project, 'demo', frozen, 3)).toMatchObject({ abstained: false, hit: true, sealValid: true });
    rmSync(modelSealFile(project, 'demo'));
    expect(modelReveal(project, 'demo', frozen, 3)).toMatchObject({ abstained: false, hit: true, sealValid: true });
  });

  it('a missing file: the marker alone decides (predicted: missing miss; abstained: abstention); no marker and no file records nothing', () => {
    const { project, frozen } = predictedSet();
    rmSync(modelFile(project));
    expect(modelReveal(project, 'demo', frozen, 3)).toMatchObject({ abstained: false, hit: false, voided: 'missing' });
    setMarker(project, { abstained: true });
    expect(modelReveal(project, 'demo', frozen, 3)).toMatchObject({ abstained: true, hit: false });
    rmSync(modelSealFile(project, 'demo'));
    expect(modelReveal(project, 'demo', frozen, 3)).toBeNull();
  });

  it('a corrupt model file under an abstained marker is an edit, not an abstention', () => {
    const { project, frozen } = predictedSet();
    setMarker(project, { abstained: true });
    writeFileSync(modelFile(project), '{not json');
    expect(modelReveal(project, 'demo', frozen, 3)).toMatchObject({ abstained: false, voided: 'edited' });
  });
});

describe('ledger rows and stats', () => {
  const row = (set: string, agent: object, model?: object, shownCount: number | null = 4) => JSON.stringify({ schema: 'prose/ledger@1', at: 'x', project: '/p', set, setUid: `uid-${set}-xxxxxxxx`, form: 'speech-small', picked: 1, ...(shownCount === null ? {} : { shownCount }), agent: { pick: 1, shortlist: [], why: 'x', hit: true, shortlistHit: true, sealValid: true, ...agent }, ...(model ? { model } : {}) });
  const m = (extra: object) => ({ pick: 1, shortlist: [1], hit: true, shortlistHit: true, abstained: false, sealValid: true, ...extra });
  const write = (...lines: string[]) => { mkdirSync(globalTasteDir(), { recursive: true }); writeFileSync(join(globalTasteDir(), 'predictions.jsonl'), lines.join('\n') + '\n'); };

  it('a 0.3.0-shaped row without model still reads, and counts for the agent', () => {
    write(row('a', {}), row('b', { hit: false, shortlistHit: false }));
    expect(predictionStats({})).toMatchObject({
      sessions: 2, agent: { predicted: 2, hits: 1, rate: 0.5 }, recent: { window: 10, agentRate: 0.5 },
      model: { predicted: 0, abstained: 0, hits: 0, shortlistHits: 0, voided: 0, rate: null, recent: { window: 10, rate: null } },
      comparison: { both: 0, modelBetter: 0, same: 0, agentBetter: 0 },
    });
  });

  it('dedupes a new pick against an old row exactly as before', () => {
    seedShorterOwner();
    const { project, set } = readySet();
    predict(project, set, 1);
    write(JSON.stringify({ schema: 'prose/ledger@1', at: 'x', project, set: 'demo', setUid: set.uid, form: 'speech-small', picked: 1, agent: { pick: 1, shortlist: [], why: 'x', hit: true, shortlistHit: true, sealValid: true } }));
    recordPick(project, set, 3, {});
    expect(ledger()).toHaveLength(1);
    expect('model' in ledger()[0]).toBe(false);
  });

  it('separates agent and model, counts abstentions, and compares them on sessions where both predicted', () => {
    write(
      row('a', {}, m({})), // both hit: same
      row('b', { hit: false, shortlistHit: false }, m({})), // model better
      row('c', {}, m({ hit: false, shortlistHit: true })), // agent better (a hit against a shortlist hit)
      row('d', { hit: false, shortlistHit: true }, m({ hit: false, shortlistHit: true })), // same
      row('e', {}, m({ pick: null, shortlist: [], hit: false, shortlistHit: false, abstained: true })), // abstained
      row('f', {}), // no model data
      row('g', { hit: false, shortlistHit: false, voided: 'edited' }, m({ hit: false, shortlistHit: false, voided: 'missing', sealValid: false })), // both voided: same
    );
    const s = predictionStats({});
    expect(s.sessions).toBe(7);
    expect(s.agent).toEqual({ predicted: 7, hits: 4, shortlistHits: 5, shortlistEligible: 7, voided: 1, rate: 0.571 });
    expect(s.model).toEqual({ predicted: 5, abstained: 1, hits: 2, shortlistHits: 4, shortlistEligible: 5, voided: 1, rate: 0.4, recent: { window: 10, rate: 0.4 } });
    expect(s.comparison).toEqual({ both: 5, modelBetter: 1, same: 3, agentBetter: 1 });
  });

  it('compares on the pick only: an agent miss with an empty shortlist against a model miss in a three-variant set is the same, not a model win', () => {
    write(
      row('a', { hit: false, shortlistHit: false }, m({ hit: false, shortlistHit: true }), 3),
      row('b', { hit: false, shortlistHit: false }, m({ hit: false, shortlistHit: true }), 3),
    );
    const s = predictionStats({});
    expect(s.comparison).toEqual({ both: 2, modelBetter: 0, same: 2, agentBetter: 0 });
    // three or fewer shown variants: a shortlist hit means nothing, so neither predictor reports one
    expect(s.agent).toMatchObject({ shortlistHits: 0, shortlistEligible: 0 });
    expect(s.model).toMatchObject({ shortlistHits: 0, shortlistEligible: 0 });
  });

  it('counts shortlist hits only over sets of four or more variants (rows without a shown count are not eligible)', () => {
    write(
      row('a', { shortlistHit: true }, m({ shortlistHit: true }), 4),
      row('b', { hit: false, shortlistHit: false }, m({ hit: false, shortlistHit: true }), 5),
      row('c', { shortlistHit: true }, m({ shortlistHit: true }), 3),
      row('d', { shortlistHit: true }, m({ shortlistHit: true }), null),
    );
    const s = predictionStats({});
    expect(s.agent).toMatchObject({ predicted: 4, shortlistEligible: 2, shortlistHits: 1 });
    expect(s.model).toMatchObject({ predicted: 4, shortlistEligible: 2, shortlistHits: 2 });
  });

  it('records the number of shown variants in the ledger row at pick time', () => {
    const { project, set } = readySet();
    predict(project, set, 1);
    recordPick(project, set, 3, {});
    expect(ledger()[0].shownCount).toBe(4);
  });

  it('keeps the existing agent fields and --all-projects behaviour, adding only model and comparison', async () => {
    write(row('a', {}, m({})));
    const { project } = readySet();
    expect((await run('taste', 'stats', '--dir', project)).sessions).toBe(0);
    const all = await run('taste', 'stats', '--all-projects', '--dir', project);
    expect(Object.keys(all)).toEqual(['project', 'sessions', 'agent', 'recent', 'model', 'comparison', 'verdicts', 'duels']);
    expect(all).toMatchObject({ project: null, sessions: 1, agent: { predicted: 1 }, model: { predicted: 1, hits: 1 } });
  });
});

describe('the command surface keeps the model sealed', () => {
  it('has no taste rank command, and only the reveal path reads the model prediction', () => {
    const program = new Command();
    registerTasteCommands(program, { emit: () => {} });
    const names = program.commands.find(c => c.name() === 'taste')!.commands.map(c => c.name());
    expect(names).not.toContain('rank');
    expect([...names].sort()).toEqual(['show', 'stats']);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.ts$/.test(e.name) && /modelReveal|readModelPrediction|model-prediction/.test(readFileSync(p, 'utf8'))) offenders.push(p.slice(ROOT.length + 1).replace(/\\/g, '/'));
      }
    };
    walk(join(ROOT, 'src'));
    expect(offenders.sort()).toEqual(['src/owner/pick.ts', 'src/taste/reveal.ts']);
  });
});
