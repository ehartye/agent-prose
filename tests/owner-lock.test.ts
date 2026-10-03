import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync as renameReal, statSync, utimesSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ProseError } from '../src/errors.ts';
import { withSetLock, writeFileAtomic } from '../src/owner/fsutil.ts';
import { setDir } from '../src/owner/paths.ts';
import { createSet, readSet, writeSet } from '../src/owner/sets.ts';
import { BASE, tmp, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
const { home } = useTempHome();
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

function readySet(id = 'demo') {
  const p = tmpProject();
  createSet(p.project, p.write('t.md', BASE), { id, count: 3 });
  return { project: p.project, lock: join(setDir(p.project, id), '.lock') };
}

const ownerFile = (lock: string) => join(lock, 'owner.json');
const plantLock = (lock: string, owner: { pid: number; token: string } | null, ageMs = 0) => {
  mkdirSync(lock);
  if (owner) writeFileSync(ownerFile(lock), JSON.stringify({ ...owner, at: new Date().toISOString() }));
  if (ageMs) { const t = new Date(Date.now() - ageMs); utimesSync(lock, t, t); }
};
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid!;
const leftovers = (project: string) => readdirSync(setDir(project, 'demo')).filter(n => n.startsWith('.lock'));

/** Start tests/lock-holder.mjs: it takes the lock, holds it for holdMs (heartbeating every beatMs if > 0), and logs. */
function holder(project: string, name: string, log: string, holdMs: number, beatMs: number, options: object) {
  const c = spawn(process.execPath, ['tests/lock-holder.mjs', project, 'demo', name, String(holdMs), String(beatMs), log, JSON.stringify(options)],
    { env: { ...process.env, AGENT_PROSE_HOME: home() }, cwd: process.cwd() });
  let err = '';
  c.stderr.on('data', d => { err += d; });
  const done = new Promise<{ status: number | null; err: string }>(resolve => c.on('close', status => resolve({ status, err })));
  return { child: c as ChildProcess, done };
}
const events = (log: string) => existsSync(log)
  ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => { const [what, name, at] = l.split(' '); return { what, name, at: Number(at) }; })
  : [];
async function until(cond: () => boolean, ms = 20_000) {
  const end = Date.now() + ms;
  while (!cond()) { if (Date.now() > end) throw new Error('timed out waiting'); await delay(20); }
}
/** Every holder's [enter, exit] interval, checked not to overlap any other. */
function assertExclusive(log: string) {
  const ev = events(log);
  const spans = [...new Set(ev.map(e => e.name))].map(name => ({
    name, enter: ev.find(e => e.name === name && e.what === 'enter')?.at, exit: ev.find(e => e.name === name && e.what === 'exit')?.at,
  })).filter(s => s.enter !== undefined).sort((a, b) => a.enter! - b.enter!);
  for (let k = 1; k < spans.length; k++) expect(spans[k].enter!, `${spans[k].name} entered before ${spans[k - 1].name} left`).toBeGreaterThanOrEqual(spans[k - 1].exit!);
  return spans;
}

describe('lock ownership', () => {
  it('writes owner.json with this pid and a random token while held', () => {
    const { project, lock } = readySet();
    const owner = withSetLock(project, 'demo', () => JSON.parse(readFileSync(ownerFile(lock), 'utf8')));
    expect(owner.pid).toBe(process.pid);
    expect(owner.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(existsSync(lock)).toBe(false);
  });

  it('(a) release never removes a lock owned by another token, and does not throw', () => {
    const { project, lock } = readySet();
    const out = withSetLock(project, 'demo', () => {
      writeFileSync(ownerFile(lock), JSON.stringify({ pid: process.pid, token: 'someone-else', at: new Date().toISOString() }));
      return 'ran';
    });
    expect(out).toBe('ran');
    expect(existsSync(lock)).toBe(true);
    expect(JSON.parse(readFileSync(ownerFile(lock), 'utf8')).token).toBe('someone-else');
  });

  it('heartbeat refreshes the lock mtime, and throws E_CONFLICT once the lock is no longer ours', () => {
    const { project, lock } = readySet();
    withSetLock(project, 'demo', ctx => {
      const old = new Date(Date.now() - 60_000);
      utimesSync(lock, old, old);
      ctx.heartbeat();
      expect(Date.now() - statSync(lock).mtimeMs).toBeLessThan(5_000);
      writeFileSync(ownerFile(lock), JSON.stringify({ pid: process.pid, token: 'someone-else', at: new Date().toISOString() }));
      expect(code(() => ctx.heartbeat())).toBe('E_CONFLICT');
    });
  });
});

describe('lock takeover', () => {
  it('(c) takes over a lock whose owner pid is dead, after deadGraceMs', () => {
    const { project, lock } = readySet();
    plantLock(lock, { pid: deadPid(), token: 'dead' });
    const start = Date.now();
    expect(withSetLock(project, 'demo', () => JSON.parse(readFileSync(ownerFile(lock), 'utf8')).token, { deadGraceMs: 150, timeoutMs: 3000, pollMs: 5 })).not.toBe('dead');
    expect(Date.now() - start).toBeGreaterThanOrEqual(100);
    expect(leftovers(project)).toEqual([]);
  });

  it('takes over a lock with no owner.json (crashed between mkdir and owner write) after deadGraceMs', () => {
    const { project, lock } = readySet();
    plantLock(lock, null, 60_000);
    expect(withSetLock(project, 'demo', () => 1, { timeoutMs: 500 })).toBe(1);
    expect(leftovers(project)).toEqual([]);
  });

  it('takes over a live owner only once its mtime is older than hardStaleMs', () => {
    const { project, lock } = readySet();
    plantLock(lock, { pid: process.pid, token: 'silent' }, 60_000);
    expect(withSetLock(project, 'demo', () => 1, { timeoutMs: 500, hardStaleMs: 10_000 })).toBe(1);
    expect(leftovers(project)).toEqual([]);
  });

  it('(d) never takes over a lock whose owner is alive and whose mtime is fresh', () => {
    const { project, lock } = readySet();
    plantLock(lock, { pid: process.pid, token: 'live' }, 5_000); // older than deadGraceMs, younger than hardStaleMs
    let ran = false;
    expect(code(() => withSetLock(project, 'demo', () => { ran = true; }, { timeoutMs: 300, pollMs: 5 }))).toBe('E_CONFLICT');
    expect(code(() => withSetLock(project, 'demo', () => { ran = true; }, { timeoutMs: 200, deadGraceMs: 1, hardStaleMs: 10_000, pollMs: 5 }))).toBe('E_CONFLICT');
    expect(ran).toBe(false);
    expect(JSON.parse(readFileSync(ownerFile(lock), 'utf8')).token).toBe('live');
  });

  it('an invalid owner.json counts as an unknown owner', () => {
    const { project, lock } = readySet();
    mkdirSync(lock);
    writeFileSync(ownerFile(lock), '{torn');
    expect(code(() => withSetLock(project, 'demo', () => 1, { timeoutMs: 100 }))).toBe('E_CONFLICT'); // fresh: wait
    const t = new Date(Date.now() - 10_000);
    utimesSync(lock, t, t);
    expect(withSetLock(project, 'demo', () => 2, { timeoutMs: 500 })).toBe(2);
  });
});

describe('lock across processes', () => {
  it('(b) a heartbeating holder keeps its lock past hardStaleMs; a second taker times out instead of entering', async () => {
    const { project } = readySet();
    const log = join(tmp(), 'log');
    const a = holder(project, 'A', log, 3000, 25, { hardStaleMs: 300, deadGraceMs: 50 });
    await until(() => events(log).some(e => e.what === 'enter'));
    let ran = false;
    expect(code(() => withSetLock(project, 'demo', () => { ran = true; }, { timeoutMs: 1200, hardStaleMs: 300, deadGraceMs: 50, pollMs: 10 }))).toBe('E_CONFLICT');
    expect(ran).toBe(false);
    expect((await a.done).status).toBe(0);
    expect(events(log).map(e => e.what)).toEqual(['enter', 'exit']);
  }, 60_000);

  it("the reviewer's scenario: A holds through a long check, B waits, C arrives after the old stale time; neither enters while A is alive", async () => {
    const { project, lock } = readySet();
    const log = join(tmp(), 'log');
    // staleMs: 300 is the old mtime-only rule scaled down (it was 10s); the new lock ignores it and A never heartbeats.
    const opts = { staleMs: 300, deadGraceMs: 100, timeoutMs: 20_000, pollMs: 10 };
    const a = holder(project, 'A', log, 2000, 0, opts); // no heartbeat during its one long step
    await until(() => events(log).some(e => e.name === 'A' && e.what === 'enter'));
    const b = holder(project, 'B', log, 100, 0, opts);
    await delay(600); // C arrives after the old stale time
    const c = holder(project, 'C', log, 100, 0, opts);
    const results = await Promise.all([a.done, b.done, c.done]);
    expect(results.map(r => r.status)).toEqual([0, 0, 0]);
    const spans = assertExclusive(log);
    expect(spans[0].name).toBe('A');
    expect(existsSync(lock)).toBe(false);
  }, 60_000);

  it('recovers within about deadGraceMs after the holder is killed', async () => {
    const { project, lock } = readySet();
    const log = join(tmp(), 'log');
    const a = holder(project, 'A', log, 30_000, 0, {});
    await until(() => events(log).some(e => e.what === 'enter'));
    a.child.kill();
    await a.done;
    expect(existsSync(lock)).toBe(true); // the crash left it behind
    expect(withSetLock(project, 'demo', () => 'recovered', { deadGraceMs: 100, timeoutMs: 5000, pollMs: 10 })).toBe('recovered');
    expect(leftovers(project)).toEqual([]);
  }, 60_000);

  it('several heartbeating holders with tiny timings never overlap', async () => {
    const { project, lock } = readySet();
    const log = join(tmp(), 'log');
    const opts = { deadGraceMs: 50, hardStaleMs: 400, timeoutMs: 20_000, pollMs: 5 };
    const procs = ['P1', 'P2', 'P3', 'P4'].map(n => holder(project, n, log, 150, 20, opts));
    const results = await Promise.all(procs.map(p => p.done));
    expect(results.map(r => r.status)).toEqual([0, 0, 0, 0]);
    expect(assertExclusive(log)).toHaveLength(4);
    expect(existsSync(lock)).toBe(false);
  }, 60_000);
});

describe('writeFileAtomic retries', () => {
  const failing = (times: number, codeName = 'EPERM') => {
    let calls = 0;
    const rename = (from: string, to: string) => {
      calls++;
      if (calls <= times) throw Object.assign(new Error(`${codeName}: rename`), { code: codeName });
      // the real rename
      return renameReal(from, to);
    };
    return { rename, calls: () => calls };
  };

  it('succeeds when rename fails a few times with EPERM/EBUSY/EACCES', () => {
    const d = tmp();
    const f = join(d, 'a.json');
    writeFileSync(f, 'old');
    for (const c of ['EPERM', 'EBUSY', 'EACCES']) {
      const r = failing(3, c);
      writeFileAtomic(f, `new-${c}`, { rename: r.rename });
      expect(r.calls()).toBe(4);
      expect(readFileSync(f, 'utf8')).toBe(`new-${c}`);
    }
    expect(readdirSync(d)).toEqual(['a.json']);
  });

  it('gives up after 10 attempts with E_INTERNAL naming the path, cleaning up its temp file', () => {
    const d = tmp();
    const f = join(d, 'a.json');
    writeFileSync(f, 'old');
    const r = failing(1000, 'EBUSY');
    let err: ProseError | undefined;
    try { writeFileAtomic(f, 'new', { rename: r.rename }); } catch (e) { err = e as ProseError; }
    expect(err).toBeInstanceOf(ProseError);
    expect(err?.code).toBe('E_INTERNAL');
    expect(err?.message).toContain(f);
    expect(r.calls()).toBe(10);
    expect(readFileSync(f, 'utf8')).toBe('old');
    expect(readdirSync(d)).toEqual(['a.json']);
  });

  it('does not retry an error that is not a transient lock', () => {
    const d = tmp();
    const r = failing(1000, 'ENOENT');
    expect(code(() => writeFileAtomic(join(d, 'a.json'), 'x', { rename: r.rename }))).toBe('E_INTERNAL');
    expect(r.calls()).toBe(1);
    expect(readdirSync(d)).toEqual([]);
  });
});

describe('writeSet', () => {
  it('replaces set.json atomically (a new file renamed into place, not rewritten in place)', () => {
    const { project } = readySet();
    const file = join(setDir(project, 'demo'), 'set.json');
    const before = statSync(file).ino;
    writeSet(project, { ...readSet(project, 'demo'), directions: ['warmer'] });
    expect(readSet(project, 'demo').directions).toEqual(['warmer']);
    expect(statSync(file).ino).not.toBe(before);
    expect(readdirSync(setDir(project, 'demo')).filter(n => n.endsWith('.tmp'))).toEqual([]);
  });
});
