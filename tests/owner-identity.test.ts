import { describe, expect, it } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { globalTasteDir, projectTasteDir, setDir } from '../src/owner/paths.ts';
import { recordPick } from '../src/owner/pick.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { createSet, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { readVerdicts } from '../src/owner/verdicts.ts';
import { BASE, PUNCHY, SHORT, WARM, tmp, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
useTempHome();
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

function makeSet(project: string, draft: string, id: string) {
  const set = createSet(project, draft, { id, count: 3 });
  [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(project, set, set.variants[k]), text));
  return set;
}
const projectLog = (project: string) => join(projectTasteDir(project), 'verdicts.jsonl');
const ledger = () => join(globalTasteDir(), 'predictions.jsonl');
const lines = (f: string) => readFileSync(f, 'utf8').trim().split('\n');

describe('set identity', () => {
  it('gives every set a random uid, and requires one in set.json', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    const a = makeSet(p.project, draft, 'a');
    const b = makeSet(p.project, draft, 'b');
    expect(a.uid).toMatch(/^[0-9a-f]{12}$/);
    expect(a.uid).not.toBe(b.uid);
    expect(readSet(p.project, 'a').uid).toBe(a.uid);
    const f = join(setDir(p.project, 'a'), 'set.json');
    const { uid, ...rest } = JSON.parse(readFileSync(f, 'utf8'));
    void uid;
    writeFileSync(f, JSON.stringify(rest));
    expect(code(() => readSet(p.project, 'a'))).toBe('E_SCHEMA');
  });

  it('a set id reused after deletion gets its own verdict and ledger rows (nothing silently dropped)', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    const first = makeSet(p.project, draft, 't2');
    writePrediction(p.project, first, { pick: 2, shortlist: [], why: 'x' });
    expect(recordPick(p.project, first, 2, {})).toMatchObject({ verdicts: 2, appended: 2, skipped: 0 });
    rmSync(setDir(p.project, 't2'), { recursive: true });
    const second = makeSet(p.project, draft, 't2');
    expect(second.uid).not.toBe(first.uid);
    writePrediction(p.project, second, { pick: 2, shortlist: [], why: 'x' });
    expect(recordPick(p.project, second, 2, {})).toMatchObject({ verdicts: 2, appended: 2, skipped: 0 });
    const rows = readVerdicts(projectLog(p.project)).rows;
    expect(rows).toHaveLength(4);
    expect(rows.map(r => r.setUid)).toEqual([first.uid, first.uid, second.uid, second.uid]);
    expect(readVerdicts(join(globalTasteDir(), 'verdicts.jsonl')).rows).toHaveLength(4);
    expect(lines(ledger()).map(l => JSON.parse(l).setUid)).toEqual([first.uid, second.uid]);
  });

  it('a retry that finds every row already logged says so', () => {
    const p = tmpProject();
    const set = makeSet(p.project, p.write('t.md', BASE), 'demo');
    recordPick(p.project, set, 2, { noPredict: true });
    const { picked, pickedAt, ...rest } = readSet(p.project, 'demo');
    void picked; void pickedAt;
    writeSet(p.project, rest); // as if the crash came before set.json was written
    const r = recordPick(p.project, readSet(p.project, 'demo'), 2, { noPredict: true });
    expect(r).toMatchObject({ verdicts: 2, appended: 0, skipped: 2 });
    expect(r.note).toMatch(/already/);
    expect(readVerdicts(projectLog(p.project)).rows).toHaveLength(2);
  });

  it('dedupes by project key, so a path that differs only by case on Windows is the same project', () => {
    if (process.platform !== 'win32') return;
    const p = tmpProject();
    const set = makeSet(p.project, p.write('t.md', BASE), 'demo');
    recordPick(p.project, set, 2, { noPredict: true });
    const f = projectLog(p.project);
    const shouted = lines(f).map(l => JSON.stringify({ ...JSON.parse(l), project: p.project.toUpperCase() }));
    writeFileSync(f, shouted.join('\n') + '\n');
    const { picked, pickedAt, ...rest } = readSet(p.project, 'demo');
    void picked; void pickedAt;
    writeSet(p.project, rest);
    expect(recordPick(p.project, readSet(p.project, 'demo'), 2, { noPredict: true })).toMatchObject({ appended: 0, skipped: 2 });
    expect(readVerdicts(f).rows).toHaveLength(2);
  });
});

describe('readVerdicts', () => {
  it('keeps good rows, counts older-version rows apart from malformed lines, and says where the bad lines are', () => {
    const p = tmpProject();
    const set = makeSet(p.project, p.write('t.md', BASE), 'demo');
    recordPick(p.project, set, 2, { noPredict: true });
    const f = projectLog(p.project);
    const [good] = lines(f);
    const v1 = JSON.stringify({ ...JSON.parse(good), schema: 'prose/verdict@1', setUid: undefined });
    const noUid = JSON.stringify({ ...JSON.parse(good), setUid: undefined });
    writeFileSync(f, [good, v1, '{garbage', '', noUid, '"a string"'].join('\n') + '\n');
    expect(readVerdicts(f)).toEqual({ rows: [JSON.parse(good)], none: [], unknownVersion: 1, malformed: 3, malformedLines: [3, 5, 6] });
    expect(readVerdicts(join(tmp(), 'none.jsonl'))).toEqual({ rows: [], none: [], unknownVersion: 0, malformed: 0, malformedLines: [] });
  });

  it('lists at most the first 20 malformed line numbers', () => {
    const f = join(tmp(), 'v.jsonl');
    writeFileSync(f, Array.from({ length: 30 }, () => 'x').join('\n'));
    const r = readVerdicts(f);
    expect(r.malformed).toBe(30);
    expect(r.malformedLines).toEqual(Array.from({ length: 20 }, (_, k) => k + 1));
  });
});

describe('prose taste stats verdict counts', () => {
  it('reports rows, unknown-version and malformed lines for the project and global logs', async () => {
    const p = tmpProject();
    const set = makeSet(p.project, p.write('t.md', BASE), 'demo');
    recordPick(p.project, set, 2, { noPredict: true });
    const f = projectLog(p.project);
    const [good] = lines(f);
    writeFileSync(f, [good, JSON.stringify({ ...JSON.parse(good), schema: 'prose/verdict@1' }), 'garbage'].join('\n') + '\n');
    const out = await run('taste', 'stats', '--dir', p.project);
    expect(out.verdicts).toEqual({ project: { rows: 1, unknownVersion: 1, malformed: 1 }, global: { rows: 2, unknownVersion: 0, malformed: 0 } });
    const all = await run('taste', 'stats', '--all-projects', '--dir', p.project);
    expect(all.verdicts).toEqual({ global: { rows: 2, unknownVersion: 0, malformed: 0 } });
  });
});
