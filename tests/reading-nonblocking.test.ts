import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadingServer, registerProject } from '../src/reading/server.ts';
import { readEvents } from '../src/reading/session.ts';
import { tmp, useTempHome, useTmp } from './owner-helpers.ts';
import { http, post, projectRows, seed, startServer, variantFile } from './reading-helpers.ts';

useTmp();
useTempHome();

const servers: ReadingServer[] = [];
const holders: ChildProcess[] = [];
afterEach(async () => {
  for (const h of holders.splice(0)) h.kill();
  await Promise.all(servers.splice(0).map(s => s.close()));
});

/** tests/lock-holder.mjs takes the set lock in another process and holds it (heartbeating) for holdMs. */
async function holdSetLock(project: string, setId: string, holdMs: number, kind: 'set' | 'session' = 'set'): Promise<void> {
  const log = join(tmp('prose-hold-'), 'hold.log');
  const child = spawn(process.execPath, ['tests/lock-holder.mjs', project, setId, 'holder', String(holdMs), '200', log, JSON.stringify({ kind })], { stdio: 'ignore', cwd: join(import.meta.dirname, '..') });
  holders.push(child);
  const deadline = Date.now() + 10_000;
  for (;;) {
    try { if (readFileSync(log, 'utf8').includes('enter')) return; } catch { /* not yet */ }
    if (Date.now() > deadline) throw new Error('the lock holder did not start');
    await new Promise(r => setTimeout(r, 25));
  }
}

describe('the event loop stays free while a write waits for a set lock', () => {
  it('answers a duel with 409 E_CONFLICT and appends nothing, while /api/health stays fast', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    expect((await post(info, 'read-1', { type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3], eventId: 'l' })).status).toBe(200);
    await holdSetLock(s.project, 'demo', 20_000);

    const t0 = Date.now();
    const pending = post(info, 'read-1', { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab', eventId: 'locked' });
    let settled = false;
    void pending.then(() => { settled = true; });
    // The CLI waits for the lock (5 s) before it gives up; probe the server the whole time.
    const slowest: number[] = [];
    await new Promise(r => setTimeout(r, 300)); // let the request start its CLI child
    while (!settled && Date.now() - t0 < 12_000) {
      const t = Date.now();
      const health = await http(info, '/api/health');
      slowest.push(Date.now() - t);
      expect(health.status).toBe(200);
      await new Promise(r => setTimeout(r, 100));
    }
    expect(settled, 'the duel request should have come back by now').toBe(true);
    expect(slowest.length).toBeGreaterThan(5); // the server answered many times while the write was in flight
    expect(Math.max(...slowest)).toBeLessThan(300); // loose bound for a slow CI; a blocked loop would show seconds

    const r = await pending;
    expect([r.status, r.body.error.code]).toEqual([409, 'E_CONFLICT']);
    expect(r.body.error.message).toMatch(/set demo/i);
    expect(readEvents(s.project, 'read-1').map(e => e.type)).toEqual(['lineup']);
    expect(projectRows(s.project)).toEqual([]);
  }, 40_000);

  it('serves other sessions\' events too while one session waits on its set lock', async () => {
    const a = seed({ id: 'read-a', setId: 'seta' });
    const { info } = await startServer(servers, { projects: [a.project] });
    await post(info, 'read-a', { type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3], eventId: 'l' });
    await holdSetLock(a.project, 'seta', 20_000);
    const blocked = post(info, 'read-a', { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab', eventId: 'locked' });
    await new Promise(r => setTimeout(r, 300));
    const t = Date.now();
    const play = await post(info, 'read-a', { type: 'play', index: 1, mode: 'read', eventId: 'p' }); // no CLI, so no lock: queued behind the duel for this session only
    // (the session queue serialises one session; the point is the other routes and sessions are not stalled)
    const listing = await http(info, '/api/sessions');
    expect(listing.status).toBe(200);
    expect(Date.now() - t).toBeLessThan(12_000);
    expect([(await blocked).status, play.status]).toEqual([409, 200]);
  }, 40_000);
});

describe('the event loop stays free while a write waits for the SESSION lock', () => {
  it('answers a play with 409 E_CONFLICT after the lock wait, while /api/health stays fast', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    await holdSetLock(s.project, 'read-1', 20_000, 'session');

    const t0 = Date.now();
    const pending = post(info, 'read-1', { type: 'play', index: 1, mode: 'read', eventId: 'locked-play' });
    let settled = false;
    void pending.then(() => { settled = true; });
    const slowest: number[] = [];
    await new Promise(r => setTimeout(r, 300));
    while (!settled && Date.now() - t0 < 12_000) {
      const t = Date.now();
      expect((await http(info, '/api/health')).status).toBe(200);
      slowest.push(Date.now() - t);
      await new Promise(r => setTimeout(r, 100));
    }
    expect(settled, 'the play request should have given up by now').toBe(true);
    expect(slowest.length).toBeGreaterThan(5);
    expect(Math.max(...slowest)).toBeLessThan(300); // a loop blocked by the lock wait showed 4.7 s here
    const r = await pending;
    expect([r.status, r.body.error.code]).toEqual([409, 'E_CONFLICT']);
    expect(r.body.error.message).toMatch(/session read-1/i);
    expect(readEvents(s.project, 'read-1')).toEqual([]);
  }, 40_000);

  it('an abandon waiting on the session lock also leaves the loop free and appends nothing', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project], runProse: async () => ({}) });
    expect((await post(info, 'read-1', { type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3], eventId: 'l' })).status).toBe(200);
    await holdSetLock(s.project, 'read-1', 20_000, 'session');
    const pending = post(info, 'read-1', { type: 'abandon', eventId: 'bye' });
    // The server shares this event loop, so a blocked server also blocks this timer: measure from before the wait.
    const t = Date.now();
    await new Promise(r => setTimeout(r, 50));
    expect((await http(info, '/api/sessions')).status).toBe(200);
    expect(Date.now() - t).toBeLessThan(300);
    expect((await pending).status).toBe(409);
  }, 40_000);
});

describe('no synchronous child-process or blocking APIs in the server', () => {
  const source = readFileSync(join(import.meta.dirname, '..', 'src', 'reading', 'server.ts'), 'utf8');
  const code = source.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  it('never uses execFileSync, spawnSync, execSync or Atomics.wait', () => {
    expect(code).not.toMatch(/\b(execFileSync|spawnSync|execSync|execFileSync)\b/);
    expect(code).not.toMatch(/Atomics\.wait/);
  });

  it('shells out with the async execFile only', () => {
    expect(code).toMatch(/\bexecFile\b/);
    const names = /import {([^}]*)} from 'node:child_process'/.exec(code)?.[1] ?? '';
    expect(names.split(',').map(n => n.trim()).filter(Boolean)).toEqual(['execFile']);
  });

  it('does not import the synchronous lock functions', () => {
    expect(code).not.toMatch(/\b(withSetLock|withDirLock|sleepSync)\b/);
  });

  it('calls no synchronous lock, append, reveal or sleep (the async names are allowed)', () => {
    expect(code).not.toMatch(/\bwithDirLock\(|\bappendEvent\(|\bwriteReveal\(|\bsleepSync\b|\bwithSetLocks?\(/);
    expect(code).not.toMatch(/\b(appendEvent|writeReveal|withDirLock)\b(?!Async)/);
    expect(code).toMatch(/\bappendEventAsync\(/);
    expect(code).toMatch(/\bwriteRevealAsync\(/);
  });
});

describe('the taste code on the request path has no blocking calls', () => {
  const codeOf = (...parts: string[]) => readFileSync(join(import.meta.dirname, '..', ...parts), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const select = codeOf('src', 'taste', 'select.ts');
  const duels = codeOf('src', 'reading', 'taste.ts');
  const server = codeOf('src', 'reading', 'server.ts');

  it('select.ts is pure: no fs, child process or timer', () => {
    expect(select).not.toMatch(/from 'node:(fs|fs\/promises|child_process)'/);
    expect(select).not.toMatch(/\b(execFile|spawn|setTimeout|Atomics\.wait)\w*\(/);
  });

  it('the taste cache reads with async fs only, and takes no lock or child process', () => {
    expect(duels).toMatch(/from 'node:fs\/promises'/);
    expect(duels).not.toMatch(/from 'node:fs'/);
    expect(duels).not.toMatch(/\b\w+Sync\(/);
    expect(duels).not.toMatch(/child_process|withDirLock|withSetLock|Atomics\.wait|\bloadTaste\(|\breadVerdicts\(|\bloadDocument\(/);
    expect(duels).toMatch(/\bloadTasteAsync\(/);
  });

  it('the server never loads the taste logs or models synchronously', () => {
    expect(server).not.toMatch(/\bloadTaste\(|\breadVerdicts\(|\bparseVerdicts\(|\bloadDocument\(|\bforEachLine\(/);
  });

  it('resolves the voice with the async variant only: neither the server nor the duel cache calls resolveVoice( or loadVoices(', () => {
    for (const code of [server, duels]) expect(code).not.toMatch(/\bresolveVoice\(|\bloadVoices\(|\bvoiceIds\(/);
    expect(duels).toMatch(/\bresolveVoiceAsync\(/);
  });
});

describe('the poll path does not redo work that has not changed', () => {
  const touch = (file: string, seconds: number) => { const t = new Date(Date.now() + seconds * 1000); utimesSync(file, t, t); };

  it('reads and hashes each variant once, not once per poll, and notices an edit (same size, new mtime) on the next poll', async () => {
    const s = seed();
    const { server, info } = await startServer(servers, { projects: [s.project] });
    const first = await http(info, '/api/session/read-1');
    expect(first.body.candidates.every((c: any) => c.hashOk)).toBe(true);
    const after = server.reads.variants;
    expect(after).toBe(3);
    for (let k = 0; k < 4; k++) expect((await http(info, '/api/session/read-1')).status).toBe(200);
    expect(server.reads.variants).toBe(after); // four more polls, no file read

    const file = variantFile(s, 1);
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, text.replace('We raised', 'We razed.'.slice(0, 9))); // same length, other content
    touch(file, 5);
    const changed = await http(info, '/api/session/read-1');
    expect(changed.body.candidates.map((c: any) => [c.index, c.hashOk]).sort()).toEqual([[1, false], [2, true], [3, true]]);
    expect(server.reads.variants).toBe(after + 1);
  });

  it('a note is checked against the file itself, not the poll memory', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    await http(info, '/api/session/read-1'); // warm the memory
    const file = variantFile(s, 1);
    const before = statSync(file);
    writeFileSync(file, readFileSync(file, 'utf8').replace('We raised', 'We razed.'.slice(0, 9)));
    utimesSync(file, before.atime, before.mtime); // same size, same mtime: only a real read can tell
    const r = await post(info, 'read-1', { type: 'note', index: 1, unit: 0, text: 'x', eventId: 'n1' });
    expect([r.status, r.body.error?.code]).toEqual([409, 'E_CONFLICT']);
  });

  it('sees a project registered in server.json by another process (the file stat changes)', async () => {
    const s = seed();
    const home = process.env.AGENT_PROSE_HOME!;
    const { info } = await startServer(servers, { projects: [] , persist: true });
    expect((await http(info, '/api/sessions')).body.sessions).toEqual([]);
    registerProject(s.project);
    expect((await http(info, '/api/sessions')).body.sessions.map((x: any) => x.id)).toEqual(['read-1']);
    expect(existsSync(join(home, 'server.json'))).toBe(true);
  });
});
