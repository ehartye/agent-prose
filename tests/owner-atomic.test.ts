import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { withSetLock, writeFileAtomic } from '../src/owner/fsutil.ts';
import { globalTasteDir, projectTasteDir, setDir, setsDir } from '../src/owner/paths.ts';
import { recordPick } from '../src/owner/pick.ts';
import { createSet, listSets, listSetsDetailed, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { readVerdicts } from '../src/owner/verdicts.ts';
import { BASE, PUNCHY, SHORT, WARM, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
const { home } = useTempHome();
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

function readySet(id = 'demo') {
  const p = tmpProject();
  const set = createSet(p.project, p.write('t.md', BASE), { id, count: 3 });
  [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  return { ...p, set };
}

describe('writeFileAtomic', () => {
  it('replaces the file and leaves no temp file behind', () => {
    const p = tmpProject();
    const f = p.write('a.json', 'old');
    writeFileAtomic(f, 'new');
    expect(readFileSync(f, 'utf8')).toBe('new');
    expect(readdirSync(p.project).filter(n => n.endsWith('.tmp'))).toEqual([]);
  });
});

describe('withSetLock', () => {
  it('runs the function and releases the lock, even when it throws', () => {
    const { project } = readySet();
    expect(withSetLock(project, 'demo', () => 7)).toBe(7);
    expect(existsSync(join(setDir(project, 'demo'), '.lock'))).toBe(false);
    expect(() => withSetLock(project, 'demo', () => { throw new Error('boom'); })).toThrow('boom');
    expect(existsSync(join(setDir(project, 'demo'), '.lock'))).toBe(false);
  });

  it('times out with E_CONFLICT while another holder has the lock', () => {
    const { project, set } = readySet();
    mkdirSync(join(setDir(project, 'demo'), '.lock'));
    expect(code(() => recordPick(project, set, 1, { noPredict: true, lock: { timeoutMs: 80 } }))).toBe('E_CONFLICT');
    expect(readSet(project, 'demo').picked).toBeUndefined();
  });

  it('takes over an owner-less lock older than deadGraceMs', () => {
    const { project, set } = readySet();
    const lock = join(setDir(project, 'demo'), '.lock');
    mkdirSync(lock);
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    expect(recordPick(project, set, 1, { noPredict: true, lock: { timeoutMs: 500 } }).picked).toBe(1);
    expect(existsSync(lock)).toBe(false);
  });
});

describe('recordPick crash recovery', () => {
  it('is safe to repeat after a crash before set.json was written', () => {
    const { project, set } = readySet();
    recordPick(project, set, 2, { noPredict: true });
    const file = join(projectTasteDir(project), 'verdicts.jsonl');
    const global = join(globalTasteDir(), 'verdicts.jsonl');
    expect(readVerdicts(file).rows).toHaveLength(2);
    const { picked, pickedAt, ...rest } = readSet(project, 'demo');
    void picked; void pickedAt;
    writeSet(project, rest);
    expect(recordPick(project, readSet(project, 'demo'), 2, { noPredict: true }).picked).toBe(2);
    expect(readVerdicts(file).rows).toHaveLength(2);
    expect(readVerdicts(global).rows).toHaveLength(2);
    expect(home()).toBeTruthy();
  });
});

describe('createSet and listSets', () => {
  it('leaves no half-built set behind when creation fails, and no temp directory', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    expect(code(() => createSet(p.project, draft, { id: 'dup', count: 3, now: new Date('invalid') }))).not.toBe('none');
    expect(existsSync(setDir(p.project, 'dup'))).toBe(false);
    expect(existsSync(setsDir(p.project)) ? readdirSync(setsDir(p.project)) : []).toEqual([]);
  });

  it('lists the good sets and reports a corrupt or half-built one instead of throwing', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    createSet(p.project, draft, { id: 'good' });
    createSet(p.project, draft, { id: 'bad' });
    writeFileSync(join(setDir(p.project, 'bad'), 'set.json'), '{not json');
    mkdirSync(join(setsDir(p.project), 'half'));
    mkdirSync(join(setsDir(p.project), '.tmp-x'));
    expect(listSets(p.project).map(s => s.id)).toEqual(['good']);
    const d = listSetsDetailed(p.project);
    expect(d.sets.map(s => s.id)).toEqual(['good']);
    expect(d.problems.map(x => x.id).sort()).toEqual(['bad', 'half']);
    expect(d.problems[0].error).toBeTruthy();
  });

  it('prose set list emits problems only when there are some', async () => {
    const p = tmpProject();
    p.write('t.md', BASE);
    await run('set', 'new', join(p.project, 't.md'), '--id', 'one');
    expect((await run('set', 'list', '--dir', p.project)).problems).toBeUndefined();
    mkdirSync(join(setsDir(p.project), 'half'));
    expect((await run('set', 'list', '--dir', p.project)).problems).toEqual([expect.objectContaining({ id: 'half' })]);
  });
});

describe('three concurrent picks', () => {
  it('lets exactly one win; the others fail with E_CONFLICT and the log has one pick', async () => {
    const { project, set } = readySet();
    const env = { ...process.env, AGENT_PROSE_HOME: home() };
    const proc = () => new Promise<{ status: number | null; err: string }>(resolve => {
      const c = spawn(process.execPath, ['scripts/prose.mjs', 'set', 'pick', set.id, '--pick', '2', '--no-predict', '--dir', project], { env, cwd: process.cwd() });
      let err = '';
      c.stderr.on('data', d => { err += d; });
      c.on('close', status => resolve({ status, err }));
    });
    const results = await Promise.all([proc(), proc(), proc()]);
    expect(results.filter(r => r.status === 0)).toHaveLength(1);
    const failed = results.filter(r => r.status !== 0);
    expect(failed).toHaveLength(2);
    for (const f of failed) expect(f.err).toContain('E_CONFLICT');
    expect(readVerdicts(join(projectTasteDir(project), 'verdicts.jsonl')).rows).toHaveLength(2);
    expect(readSet(project, 'demo').picked).toBe(2);
  }, 60_000);
});
