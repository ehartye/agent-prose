import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProgram } from '../src/cli.ts';
import { ProseError } from '../src/errors.ts';
import { globalTasteDir, projectTasteDir, setDir } from '../src/owner/paths.ts';
import { recordPick } from '../src/owner/pick.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { createSet, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { readVerdicts } from '../src/owner/verdicts.ts';
import { BASE, PUNCHY, SHORT, WARM, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
useTempHome();
const fails = (fn: () => unknown) => { try { fn(); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };

function readySet(id = 'demo') {
  const p = tmpProject();
  const set = createSet(p.project, p.write('t.md', BASE), { id, count: 3 });
  [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  return { ...p, set };
}
const projectLog = (project: string) => join(projectTasteDir(project), 'verdicts.jsonl');
const globalLog = () => join(globalTasteDir(), 'verdicts.jsonl');
const unpick = (project: string) => {
  const { picked, pickedAt, ...rest } = readSet(project, 'demo');
  void picked; void pickedAt;
  writeSet(project, rest);
};

describe('variant hashes ignore line endings and a BOM', () => {
  it('a variant converted to CRLF (or given a BOM) after predict does not block the pick; a changed word does', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 2, shortlist: [], why: 'x' });
    writeFileSync(variantPath(project, set, set.variants[0]), SHORT.replace(/\n/g, '\r\n'));
    writeFileSync(variantPath(project, set, set.variants[1]), '﻿' + WARM);
    writeFileSync(variantPath(project, set, set.variants[2]), PUNCHY.replace(/\n/g, '\r'));
    expect(recordPick(project, set, 2, {}).reveal?.agent.hit).toBe(true);

    const q = readySet();
    writePrediction(q.project, q.set, { pick: 2, shortlist: [], why: 'x' });
    writeFileSync(variantPath(q.project, q.set, q.set.variants[0]), SHORT.replace('rain', 'snow'));
    const err = fails(() => recordPick(q.project, q.set, 2, {}));
    expect(err.code).toBe('E_CONFLICT');
    expect(err.message).toBe('variant 1 changed after the prediction was sealed');
  });
});

describe('--no-predict with a valid sealed prediction', () => {
  it('still reveals and logs the prediction: the flag only lifts the requirement', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 3, shortlist: [], why: 'x' });
    const r = recordPick(project, set, 2, { noPredict: true });
    expect(r.reveal).toMatchObject({ agent: { pick: 3, hit: false, sealValid: true } });
    expect(existsSync(join(setDir(project, 'demo'), 'reveal.json'))).toBe(true);
    expect(readFileSync(join(globalTasteDir(), 'predictions.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('says so in prose set pick --help', () => {
    const program = buildProgram({ emit: () => {} });
    const pick = program.commands.find(c => c.name() === 'set')!.commands.find(c => c.name() === 'pick')!;
    expect(pick.helpInformation().replace(/\s+/g, ' ')).toMatch(/--no-predict .*a valid sealed prediction is still revealed/);
  });
});

describe('a pick interrupted after the first log append', () => {
  it('can only be finished with the same --pick, and finishing it clears pick.pending.json', () => {
    const { project, set } = readySet();
    const pending = join(setDir(project, 'demo'), 'pick.pending.json');
    mkdirSync(globalLog(), { recursive: true }); // the per-user append fails: a crash between the two logs
    expect(() => recordPick(project, set, 2, { noPredict: true })).toThrow();
    expect(readSet(project, 'demo').picked).toBeUndefined();
    expect(JSON.parse(readFileSync(pending, 'utf8'))).toMatchObject({ pick: 2 });
    expect(readVerdicts(projectLog(project)).rows).toHaveLength(2);
    rmSync(globalLog(), { recursive: true });

    const other = fails(() => recordPick(project, readSet(project, 'demo'), 3, { noPredict: true }));
    expect(other.code).toBe('E_CONFLICT');
    expect(other.hint).toContain('--pick 2');
    expect(readVerdicts(projectLog(project)).rows).toHaveLength(2);
    expect(existsSync(globalLog())).toBe(false);

    const r = recordPick(project, readSet(project, 'demo'), 2, { noPredict: true });
    expect(r).toMatchObject({ picked: 2, verdicts: 2, appended: 2, skipped: 0 });
    expect(readVerdicts(projectLog(project)).rows).toHaveLength(2);
    expect(readVerdicts(globalLog()).rows).toHaveLength(2);
    expect(existsSync(pending)).toBe(false);
  });

  it('a clean pick leaves no pick.pending.json', () => {
    const { project, set } = readySet();
    recordPick(project, set, 1, { noPredict: true });
    expect(existsSync(join(setDir(project, 'demo'), 'pick.pending.json'))).toBe(false);
  });
});

describe('dedupe cost', () => {
  it('a pick against 20k-row logs completes well under a second', () => {
    const { project, set } = readySet();
    recordPick(project, set, 2, { noPredict: true });
    const [row] = readFileSync(projectLog(project), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const filler = Array.from({ length: 20_000 }, (_, k) => JSON.stringify({ ...row, set: `other-${k % 500}`, setUid: `uid-${k}-xxxx` })).join('\n') + '\n';
    for (const f of [projectLog(project), globalLog()]) writeFileSync(f, filler + readFileSync(f, 'utf8'));
    unpick(project);
    rmSync(projectLog(project)); // the retry must append to the project log again
    writeFileSync(projectLog(project), filler);
    const start = performance.now();
    const r = recordPick(project, readSet(project, 'demo'), 2, { noPredict: true });
    const ms = performance.now() - start;
    expect(r).toMatchObject({ appended: 2, skipped: 0 });
    expect(readVerdicts(globalLog()).rows).toHaveLength(20_002);
    expect(readVerdicts(projectLog(project)).rows).toHaveLength(20_002);
    expect(ms).toBeLessThan(1000);
  });
});
