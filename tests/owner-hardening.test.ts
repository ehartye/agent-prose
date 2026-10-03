import { describe, expect, it } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { checkSet } from '../src/owner/check.ts';
import { FEATURE_SET_ID } from '../src/owner/features.ts';
import { projectKey, projectTasteDir } from '../src/owner/paths.ts';
import { pickWeight, recordPick } from '../src/owner/pick.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { createSet, variantPath } from '../src/owner/sets.ts';
import { predictionStats } from '../src/owner/stats.ts';
import { readVerdicts } from '../src/owner/verdicts.ts';
import { BASE, PUNCHY, SHORT, WARM, tmp, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
useTempHome();
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };

function readySet(id = 'demo', texts = [SHORT, WARM, PUNCHY]) {
  const p = tmpProject();
  const set = createSet(p.project, p.write('t.md', BASE), { id, count: texts.length });
  texts.forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  return { ...p, set };
}

describe('a variant that quietly changes the form', () => {
  it('is rejected (Markdown frontmatter)', () => {
    const { project, set } = readySet('f', [WARM.replace('speech-small', 'professional'), SHORT, PUNCHY]);
    const r = checkSet(project, set);
    expect(r.variants[0]).toMatchObject({ status: 'rejected' });
    expect(r.variants[0].reasons).toContain('form-changed: declares professional, the set is speech-small');
    expect(r.keep).toEqual([2, 3]);
  });

  it('is rejected (Fountain Form: line), whatever the case', () => {
    const p = tmpProject();
    const draft = 'Title: T\nForm: tv-drama\n\nINT. ROOM - DAY\n\nShe waits for the kettle.\n';
    const set = createSet(p.project, p.write('s.fountain', draft), { id: 'ft', count: 2 });
    writeFileSync(variantPath(p.project, set, set.variants[0]), draft.replace('tv-drama', 'Sitcom-Multicam').replace('waits for the kettle', 'waits, and the kettle lies'));
    const r = checkSet(p.project, set);
    expect(r.variants[0].reasons.some(x => x.startsWith('form-changed: declares sitcom-multicam'))).toBe(true);
  });
});

describe('prose set show', () => {
  it('reports status, reasons, keep and next, and survives a missing variant file', async () => {
    const { project, set } = readySet('s', [BASE, WARM, PUNCHY, SHORT]);
    rmSync(variantPath(project, set, set.variants[2]));
    const out = await run('set', 'show', 's', '--dir', project);
    expect(out.keep).toEqual([2, 4]);
    expect(out.next).toMatch(/Present only the kept variants \((2, 4)\)/);
    expect(out.variants[0]).toMatchObject({ index: 1, status: 'rejected', reasons: ['unchanged'] });
    expect(out.variants[1]).toMatchObject({ index: 2, status: 'ok', reasons: [] });
    expect(out.variants[2]).toMatchObject({ index: 3, status: 'missing', text: null });
  });
});

describe('pick weight and provenance', () => {
  it('weights each loser at 1/(shown-1)', () => {
    expect(pickWeight(2)).toBe(1);
    expect(pickWeight(3)).toBe(0.5);
    expect(pickWeight(4)).toBeCloseTo(1 / 3, 9);
  });

  it('stamps verdicts with the feature set, the shown list and n', () => {
    const { project, set } = readySet();
    recordPick(project, set, 1, { noPredict: true });
    const rows = readVerdicts(join(projectTasteDir(project), 'verdicts.jsonl')).rows;
    expect(FEATURE_SET_ID).toBe('v1');
    expect(rows[0]).toMatchObject({ features: 'v1', shown: [1, 2, 3], n: 3, weight: 0.5 });
  });
});

describe('project comparison and taste stats', () => {
  it('compares project paths by key', () => {
    expect(projectKey(join(tmp(), '..'))).toBe(projectKey(join(tmp(), '..')));
    if (process.platform === 'win32') expect(projectKey('C:\Some\Dir')).toBe(projectKey('c:\some\dir'));
  });

  it('matches a project whose path differs only by case on Windows', () => {
    if (process.platform !== 'win32') return;
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    recordPick(project, set, 1, {});
    expect(predictionStats({ project: project.toUpperCase() }).sessions).toBe(1);
  });

  it('needs a project unless --all-projects is given', async () => {
    const outside = tmp();
    expect((await fail('taste', 'stats', '--dir', outside)).code).toBe('E_PROJECT');
    expect((await run('taste', 'stats', '--all-projects', '--dir', outside)).sessions).toBe(0);
  });
});

describe('numbers from the command line', () => {
  it('rejects a pick or shortlist entry that is not a whole number', async () => {
    const { project } = readySet();
    for (const args of [
      ['predict', '--set', 'demo', '--pick', 'abc', '--why', 'x', '--dir', project],
      ['predict', '--set', 'demo', '--pick', '1', '--shortlist', '2,x', '--why', 'x', '--dir', project],
      ['set', 'pick', 'demo', '--pick', 'abc', '--dir', project],
    ]) {
      const e = await fail(...args);
      expect(e.code).toBe('E_USAGE');
      expect(e.message).toMatch(/must be a whole number/);
    }
  });
});

describe('hints and paths', () => {
  it('hints on already-sealed and already-picked, and gives an absolute path to apply', async () => {
    const { project } = readySet();
    await run('predict', '--set', 'demo', '--pick', '1', '--why', 'x', '--dir', project);
    const sealed = await fail('predict', '--set', 'demo', '--pick', '2', '--why', 'y', '--dir', project);
    expect(sealed.code).toBe('E_CONFLICT');
    expect(sealed.hint).toBe('Run prose set pick demo --pick <n>');
    const out = await run('set', 'pick', 'demo', '--pick', '1', '--dir', project);
    expect(out.next).toContain(join(project, 't.md'));
    expect(isAbsolute(out.next.split(' over ')[1])).toBe(true);
    const again = await fail('set', 'pick', 'demo', '--pick', '2', '--dir', project);
    expect(again.code).toBe('E_CONFLICT');
    expect(again.hint).toBe('Start a new set with prose set new');
  });
});
