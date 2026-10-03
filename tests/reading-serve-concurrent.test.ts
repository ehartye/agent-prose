// Two `prose serve` calls at the same moment must end with ONE server: the second waits for the first's start (a lock
// in the prose home) and then reuses it, instead of starting a second server that overwrites server.json.
import { afterEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { probe, readServerInfo } from '../src/reading/server.ts';
import { useTempHome, useTmp } from './owner-helpers.ts';
import { ROOT } from './helpers.ts';

useTmp();
useTempHome();

const cli = join(ROOT, 'scripts', 'prose.mjs');
const seen = new Set<number>();

interface Out { status: number | null; out: any; stderr: string }
/** Spawn the real CLI without waiting (the temp home is inherited through the environment). */
function proseAsync(...args: string[]): Promise<Out> {
  return new Promise(done => {
    const child = spawn(process.execPath, [cli, ...args], { env: process.env, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', status => {
      let out: any = null;
      try { out = JSON.parse(stdout.trim().split('\n').pop()!); } catch { /* not JSON */ }
      if (out?.pid) seen.add(out.pid);
      done({ status, out, stderr });
    });
  });
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// Every server pid any call reported is stopped here, whatever the test did (an orphan must not outlive the run).
afterEach(async () => {
  const recorded = readServerInfo();
  if (recorded?.pid) seen.add(recorded.pid);
  spawnSync(process.execPath, [cli, 'serve', '--stop'], { env: process.env, timeout: 30_000 });
  for (const pid of seen) { try { process.kill(pid); } catch { /* gone */ } }
  seen.clear();
  await new Promise(r => setTimeout(r, 200));
});

describe('concurrent prose serve', () => {
  it('two simultaneous starts leave one server: same pid and url, one started, one reused, nothing orphaned', async () => {
    const [a, b] = await Promise.all([proseAsync('serve', '--local', '--port', '0'), proseAsync('serve', '--local', '--port', '0')]);
    expect([a.status, b.status], a.stderr + b.stderr).toEqual([0, 0]);
    expect(a.out.pid).toBe(b.out.pid);
    expect(a.out.url).toBe(b.out.url);
    expect([a.out.started, b.out.started].sort()).toEqual([false, true]);
    expect(readServerInfo()!.pid).toBe(a.out.pid);
    expect(await probe(readServerInfo())).toBe(true);

    const stop = await proseAsync('serve', '--stop');
    expect(stop.out).toMatchObject({ running: false, stopped: true, pid: a.out.pid });
    // exactly one server process existed: once it is stopped, no pid either call reported is still running
    await new Promise(r => setTimeout(r, 300));
    expect([...seen].filter(alive)).toEqual([]);
  }, 90_000);

  it('three at once, one of them replacing nothing: still one server', async () => {
    const outs = await Promise.all([1, 2, 3].map(() => proseAsync('serve', '--local', '--port', '0')));
    expect(outs.map(o => o.status), outs.map(o => o.stderr).join()).toEqual([0, 0, 0]);
    expect(new Set(outs.map(o => o.out.pid)).size).toBe(1);
    expect(outs.filter(o => o.out.started)).toHaveLength(1);
  }, 90_000);
});
