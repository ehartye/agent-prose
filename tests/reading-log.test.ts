// The server's errors go to <prose home>/server.log (size-capped, never the token), and the hint says where to look.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadingServer, SERVER_LOG_HINT, probe, readServerInfo, registerProject, serverLogFile } from '../src/reading/server.ts';
import { sessionDir } from '../src/owner/paths.ts';
import { useTempHome, useTmp, tmp } from './owner-helpers.ts';
import { ROOT } from './helpers.ts';
import { http, post, seed, startServer, TOKEN } from './reading-helpers.ts';

useTmp();
useTempHome();
const servers: ReadingServer[] = [];
const cli = join(ROOT, 'scripts', 'prose.mjs');
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map(s => s.close()));
  const info = readServerInfo();
  if (info && info.pid) { spawnSync(process.execPath, [cli, 'serve', '--stop'], { env: process.env, timeout: 30_000 }); if (await probe(info)) { try { process.kill(info.pid); } catch { /* gone */ } } }
});

/** Make GET /api/session/read-1 fail with an unexpected error: a directory where the event log should be (EISDIR). */
function breakLog(s: ReturnType<typeof seed>) {
  rmSync(join(sessionDir(s.project, 'read-1'), 'events.jsonl'));
  mkdirSync(join(sessionDir(s.project, 'read-1'), 'events.jsonl'));
}

describe('the server log', () => {
  it('points the hint at server.log in the prose home', () => {
    expect(SERVER_LOG_HINT).toMatch(/server\.log/);
    expect(SERVER_LOG_HINT).toMatch(/prose home/i);
  });

  it('appends a JSON error line for an unexpected failure, never the token, and answers with the hint', async () => {
    const s = seed();
    breakLog(s);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const logFile = join(tmp('prose-log-'), 'server.log');
    const { info } = await startServer(servers, { projects: [s.project], logFile });
    const r = await http(info, '/api/session/read-1');
    expect(r.body).toEqual({ error: { code: 'E_SERVER', message: 'internal error', hint: SERVER_LOG_HINT } });
    const lines = readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).error).toMatchObject({ code: 'E_SERVER', message: expect.any(String) });
    expect(JSON.parse(lines[0]).at).toMatch(/^\d{4}-/);
    expect(lines[0]).not.toContain(TOKEN);
  });

  it('scrubs the token from a logged message', async () => {
    const s = seed();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const logFile = join(tmp('prose-log-'), 'server.log');
    const { info } = await startServer(servers, {
      projects: [s.project], logFile,
      runProse: async () => { throw new Error(`boom with ${TOKEN} inside`); },
    });
    expect((await post(info, 'read-1', { type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3], eventId: 'l' })).status).toBe(200);
    const r = await post(info, 'read-1', { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab', eventId: 'd' });
    expect(r.status).toBe(500);
    const text = readFileSync(logFile, 'utf8');
    expect(text).toContain('boom with <token> inside');
    expect(text).not.toContain(TOKEN);
  });

  it('truncates a log over 1 MB when the server starts, and keeps a smaller one', async () => {
    const dir = tmp('prose-log-');
    const big = join(dir, 'big.log');
    const small = join(dir, 'small.log');
    writeFileSync(big, 'x'.repeat(1024 * 1024 + 1));
    writeFileSync(small, 'earlier line\n');
    await startServer(servers, { projects: [], logFile: big });
    await startServer(servers, { projects: [], logFile: small });
    expect(statSync(big).size).toBe(0);
    expect(readFileSync(small, 'utf8')).toBe('earlier line\n');
  });

  it('is written by the real detached server: serve --local, then a failing request, then server.log in the home', async () => {
    const run = spawnSync(process.execPath, [cli, 'serve', '--local', '--port', '0'], { env: process.env, encoding: 'utf8', timeout: 60_000 });
    expect(run.status, run.stderr).toBe(0);
    const out = JSON.parse(run.stdout.trim().split('\n').pop()!);
    expect(out.log).toBe(serverLogFile());
    const s = seed();
    breakLog(s);
    registerProject(s.project);
    const info = readServerInfo()!;
    const r = await http(info, `/api/session/read-1`, { token: info.token });
    expect([r.status, r.body.error.hint]).toEqual([500, SERVER_LOG_HINT]);
    const text = readFileSync(serverLogFile(), 'utf8');
    expect(JSON.parse(text.trim().split('\n').pop()!).error.code).toBe('E_SERVER');
    expect(text).not.toContain(info.token);
  }, 90_000);
});
