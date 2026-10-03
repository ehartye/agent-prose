// withDirLockAsync: the same lock directory, owner token, heartbeat and takeover rules as withDirLock, but a waiter
// awaits a timer, so the event loop (a server's other requests) keeps running while it waits.
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ProseError } from '../src/errors.ts';
import { withDirLock, withDirLockAsync } from '../src/owner/fsutil.ts';
import { tmp, useTmp } from './owner-helpers.ts';

useTmp();
const what = { noun: 'session', id: 'read-1', project: 'p' };
const fresh = () => { const dir = tmp('prose-alock-'); return { dir, lock: join(dir, '.lock') }; };
const ownerFile = (lock: string) => join(lock, 'owner.json');
const plant = (lock: string, owner: { pid: number; token: string } | null, ageMs = 0) => {
  mkdirSync(lock);
  if (owner) writeFileSync(ownerFile(lock), JSON.stringify({ ...owner, at: new Date().toISOString() }));
  if (ageMs) { const t = new Date(Date.now() - ageMs); utimesSync(lock, t, t); }
};
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid!;
const codeOf = async (p: Promise<unknown>) => { try { await p; } catch (e) { return (e as ProseError).code; } return 'none'; };
const leftovers = (dir: string) => readdirSync(dir).filter(n => n.startsWith('.lock'));

describe('withDirLockAsync', () => {
  it('writes the same owner.json as the sync lock while held, and releases', async () => {
    const { dir, lock } = fresh();
    const owner = await withDirLockAsync(dir, what, async () => JSON.parse(readFileSync(ownerFile(lock), 'utf8')));
    expect(owner.pid).toBe(process.pid);
    expect(owner.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(existsSync(lock)).toBe(false);
  });

  it('serialises two in-process callers and with the sync lock', async () => {
    const { dir } = fresh();
    const log: string[] = [];
    const slow = (name: string) => withDirLockAsync(dir, what, async () => { log.push(`in ${name}`); await delay(60); log.push(`out ${name}`); }, { pollMs: 5 });
    await Promise.all([slow('a'), slow('b')]);
    expect(log.map(l => l.split(' ')[0])).toEqual(['in', 'out', 'in', 'out']);
    // a sync holder is waited for as well
    withDirLock(dir, what, () => { expect(existsSync(join(dir, '.lock'))).toBe(true); });
  });

  it('does not block the event loop while it waits for a live owner', async () => {
    const { dir, lock } = fresh();
    plant(lock, { pid: process.pid, token: 'live' }, 5_000);
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 10);
    const t0 = Date.now();
    const code = await codeOf(withDirLockAsync(dir, what, async () => 1, { timeoutMs: 400, pollMs: 10 }));
    clearInterval(timer);
    expect(code).toBe('E_CONFLICT');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(350);
    expect(ticks).toBeGreaterThan(15); // a blocked loop would tick about once
    expect(JSON.parse(readFileSync(ownerFile(lock), 'utf8')).token).toBe('live');
  });

  it('takes over a dead owner after deadGraceMs, a heartbeat-less hard-stale one, and an owner-less one', async () => {
    for (const [owner, age, opts] of [
      [{ pid: deadPid(), token: 'dead' }, 0, { deadGraceMs: 120 }],
      [{ pid: process.pid, token: 'silent' }, 60_000, { hardStaleMs: 10_000 }],
      [null, 60_000, {}],
    ] as const) {
      const { dir, lock } = fresh();
      plant(lock, owner, age);
      const t0 = Date.now();
      expect(await withDirLockAsync(dir, what, async () => JSON.parse(readFileSync(ownerFile(lock), 'utf8')).token, { timeoutMs: 3000, pollMs: 5, ...opts })).not.toBe(owner?.token ?? 'x');
      if (age === 0) expect(Date.now() - t0).toBeGreaterThanOrEqual(80);
      expect(leftovers(dir)).toEqual([]);
    }
  });

  it('never takes over a live, fresh owner', async () => {
    const { dir, lock } = fresh();
    plant(lock, { pid: process.pid, token: 'live' }, 5_000);
    let ran = false;
    expect(await codeOf(withDirLockAsync(dir, what, async () => { ran = true; }, { timeoutMs: 200, deadGraceMs: 1, hardStaleMs: 10_000, pollMs: 5 }))).toBe('E_CONFLICT');
    expect(ran).toBe(false);
  });

  it('heartbeat works and throws E_CONFLICT once the lock is no longer ours; release leaves someone else\'s lock', async () => {
    const { dir, lock } = fresh();
    await withDirLockAsync(dir, what, async ctx => {
      ctx.heartbeat();
      writeFileSync(ownerFile(lock), JSON.stringify({ pid: process.pid, token: 'someone-else', at: new Date().toISOString() }));
      expect(() => ctx.heartbeat()).toThrow(expect.objectContaining({ code: 'E_CONFLICT' }));
    });
    expect(JSON.parse(readFileSync(ownerFile(lock), 'utf8')).token).toBe('someone-else');
  });

  it('releases when fn throws, and a missing directory is E_NOT_FOUND', async () => {
    const { dir, lock } = fresh();
    await expect(withDirLockAsync(dir, what, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(existsSync(lock)).toBe(false);
    expect(await codeOf(withDirLockAsync(join(dir, 'nope'), what, async () => 1))).toBe('E_NOT_FOUND');
  });
});
