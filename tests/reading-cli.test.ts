import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectKey, setDir } from '../src/owner/paths.ts';
import { textHash, writePrediction } from '../src/owner/prediction.ts';
import { createSet, variantPath } from '../src/owner/sets.ts';
import { ReadingServer, SERVER_API, probe, readServerInfo, serverInfoFile, type ServerInfo } from '../src/reading/server.ts';
import { appendEvent, openSession, readEvents, readSession } from '../src/reading/session.ts';
import { LOCAL_NOTICE, NOTICE, ensureServer, serveReport } from '../src/commands/reading.ts';
import { PUNCHY, SHORT, WARM, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';
import { http, post, seed, startServer, type Seed } from './reading-helpers.ts';
import { ROOT, run } from './helpers.ts';

useTmp();
useTempHome();

const cli = join(ROOT, 'scripts', 'prose.mjs');
const servers: ReadingServer[] = [];

/** Spawn the real CLI (the temp home is inherited through the environment); stdout and stderr parsed as JSON. */
function prose(...args: string[]) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: process.env, timeout: 60_000 });
  const parse = (s: string) => { try { return JSON.parse(s.trim().split('\n').pop()!); } catch { return null; } };
  return { status: r.status, out: parse(r.stdout), err: parse(r.stderr)?.error, stdout: r.stdout, stderr: r.stderr };
}

// Every server a test starts is stopped here: the in-process ones are closed, and a detached one (started by
// `prose serve` or `prose reading open`) is stopped by `serve --stop`, with a kill by recorded pid as the backstop.
// Registered after useTempHome(), so this runs before the temp home is restored.
afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => s.close()));
  const info = readServerInfo();
  if (!info) return;
  prose('serve', '--stop');
  if (await probe(info)) { try { process.kill(info.pid); } catch { /* gone */ } }
});

const serveLocal = (...extra: string[]) => {
  const r = prose('serve', '--local', '--port', '0', ...extra);
  expect(r.status, r.stderr).toBe(0);
  return r.out;
};

const tokenOf = (url: string) => new URL(url).searchParams.get('t')!;

/** The set `next`, three rewrites, as a refine round's answer (variants 1..3). */
function newSet(s: Seed, id = 'next', edit = [SHORT.replace('We built', 'We forged'), WARM.replace('you know', 'friends'), PUNCHY.replace('Nobody', 'No one')]) {
  const next = createSet(s.project, join(s.project, 't.md'), { id, count: 3, directions: ['shorter', 'warmer', 'punchier'] });
  edit.forEach((text, k) => writeFileSync(variantPath(s.project, next, next.variants[k]), text));
  return next;
}

const lineup = { type: 'lineup', kept: [1, 2, 3], duds: [], order: [2, 1, 3], eventId: 'l1' };
const duel = (a: number, b: number, outcome: string, eventId: string) => ({ type: 'duel', a, b, outcome, position: 'ab', eventId });
/** Session `read-1` taken to the waiting stage by a refine (champion 2) through the session helper. */
function toWaiting(s: Seed, notes = true) {
  for (const e of [lineup, duel(1, 2, 'b', 'd1'), duel(2, 3, 'a', 'd2'), duel(1, 3, 'a', 'd3')]) appendEvent(s.project, 'read-1', e);
  if (notes) appendEvent(s.project, 'read-1', { type: 'note', index: 1, unit: 0, text: 'too blunt', eventId: 'n1' });
}
const refine = { type: 'refine', champion: 2, directions: ['warmer', 'shorter'], like: 3, eventId: 'r1' };

describe('prose serve', () => {
  it('starts a detached server, reports it, and keeps the token inside links only', () => {
    const out = serveLocal();
    expect(out).toMatchObject({ running: true, host: '127.0.0.1', api: SERVER_API });
    expect(out.port).toBeGreaterThan(0);
    expect(out.pid).toBeGreaterThan(0);
    expect(out.notice).toBe(LOCAL_NOTICE); // a local server must not say the network can read it
    expect(NOTICE).toMatch(/anyone on this network who has the link can read the drafts in the projects registered with this server/i);
    expect(NOTICE).toContain('--local');
    expect(NOTICE).toMatch(/mark their lines as struck \(a record; no draft text is removed yet\)/);
    expect(LOCAL_NOTICE).toMatch(/can also mark lines of those drafts as struck/);
    expect(out.urls[0]).toMatchObject({ via: 'local', url: expect.stringContaining('http://127.0.0.1:') });
    expect(out).not.toHaveProperty('token');
    const token = readServerInfo()!.token;
    expect(tokenOf(out.url)).toBe(token);
    // the token occurs only as the value of ?t= in a link
    expect(JSON.stringify(out).split(`?t=${token}`).join('').includes(token)).toBe(false);
  });

  it('reuses a healthy server on a second call', () => {
    const first = serveLocal();
    const second = serveLocal();
    expect(second.pid).toBe(first.pid);
    expect(second.port).toBe(first.port);
    expect(second.started).toBe(false);
    expect(first.started).toBe(true);
  });

  it('replaces a running server of another API level and keeps the token', async () => {
    const first = serveLocal();
    const info = readServerInfo()!;
    writeFileSync(serverInfoFile(), JSON.stringify({ ...info, api: SERVER_API - 1 }));
    const second = serveLocal();
    expect(second.pid).not.toBe(first.pid);
    expect(await probe({ ...info, pid: first.pid })).toBe(false);
    expect(readServerInfo()!.token).toBe(info.token);
  });

  it('--status reports the recorded server and whether it answers; --stop stops it, keeps the record, and is idempotent', async () => {
    expect(prose('serve', '--status').out).toMatchObject({ running: false, recorded: null });
    const out = serveLocal();
    expect(prose('serve', '--status').out).toMatchObject({ running: true, pid: out.pid, port: out.port });
    const info = readServerInfo()!;
    const stop = prose('serve', '--stop');
    expect(stop.status, stop.stderr).toBe(0);
    expect(stop.out).toMatchObject({ running: false, stopped: true, pid: out.pid });
    expect(await probe(info)).toBe(false);
    // stopped, not forgotten: the record keeps the token and projects, with the process fields cleared
    expect(readServerInfo()).toMatchObject({ pid: 0, port: 0, url: '', token: info.token, projects: info.projects });
    expect(prose('serve', '--status').out).toMatchObject({ running: false, recorded: null });
    expect(prose('serve', '--stop').out).toMatchObject({ running: false, stopped: false });
    expect(readServerInfo()!.token).toBe(info.token);
  });

  it('keeps the token, the projects and a session link across stop and start', async () => {
    const s = seed();
    serveLocal();
    const opened = await run('reading', 'open', '--set', 'demo', '--dir', s.project);
    const before = readServerInfo()!;
    const link = new URL(opened.url);
    expect(before.projects.map(projectKey)).toContain(projectKey(s.project));
    expect(prose('serve', '--stop').out).toMatchObject({ stopped: true });
    expect(await probe(before)).toBe(false);
    const again = serveLocal();
    expect(again.started).toBe(true);
    const after = readServerInfo()!;
    expect(after.pid).not.toBe(before.pid);
    expect(after.token).toBe(before.token);
    expect(after.projects).toEqual(before.projects);
    expect(tokenOf(again.url)).toBe(link.searchParams.get('t'));
    // the link from before the restart still opens the session on the new port
    const payload = await http(after, link.pathname.replace('/s/', '/api/session/'), { token: link.searchParams.get('t') });
    expect(payload.status).toBe(200);
    expect(payload.body.session.id).toBe(opened.id);
  });

  it('treats a record whose process is gone as no server: stop clears it but keeps the token and projects, start reuses them', () => {
    serveLocal();
    const live = readServerInfo()!;
    prose('serve', '--stop');
    const dead = JSON.stringify({ ...live, pid: 2147483000, port: 1, url: 'http://127.0.0.1:1' });
    writeFileSync(serverInfoFile(), dead);
    expect(prose('serve', '--status').out).toMatchObject({ running: false, recorded: { pid: 2147483000 } });
    expect(prose('serve', '--stop').out).toMatchObject({ running: false, stopped: false, note: expect.stringContaining('kept') });
    expect(readServerInfo()).toMatchObject({ pid: 0, token: live.token });
    writeFileSync(serverInfoFile(), dead);
    expect(serveLocal().started).toBe(true); // a dead pid is the same as stopped
    expect(readServerInfo()!.token).toBe(live.token);
  });

  it('on the LAN says so once, with the port and the firewall hint; --local needs no hint', () => {
    const info: ServerInfo = { pid: 1, port: 47999, host: '0.0.0.0', token: 'a'.repeat(32), projects: [], startedAt: '', url: 'http://box:47999', api: SERVER_API };
    const lan = serveReport(info, { started: true });
    expect(lan.firewall).toMatch(/47999/);
    expect(lan.firewall).toMatch(/Windows Firewall/);
    expect(serveReport(info, { started: false })).not.toHaveProperty('firewall');
    expect(serveReport({ ...info, host: '127.0.0.1', url: 'http://127.0.0.1:47999' }, { started: true })).not.toHaveProperty('firewall');
    expect(lan.notice).toBe(NOTICE);
    expect(lan.urls[0]).toMatchObject({ via: 'hostname', url: `http://box:47999/?t=${info.token}` });
  });

  it('lists the serve and reading commands in capabilities', async () => {
    const caps = await run('capabilities');
    expect(caps.commands).toEqual(expect.arrayContaining(['serve', 'reading open', 'reading wait', 'reading round', 'reading status', 'reading list', 'reading close']));
  });
});

describe('prose reading open', () => {
  it('needs a sealed prediction (E_PREDICTION_REQUIRED) before it touches any server', async () => {
    const s = seed({ predict: false });
    await expect(run('reading', 'open', '--set', 'demo', '--dir', s.project)).rejects.toMatchObject({
      code: 'E_PREDICTION_REQUIRED', hint: expect.stringContaining('prose predict --set demo --pick <n> --shortlist'),
    });
    expect(readServerInfo()).toBeNull();
    expect(readSession(s.project, 'read-1').setId).toBe('demo'); // only the seeded session exists
  });

  it('refuses a set that fails its check, with the check\'s next step', async () => {
    const s = seed();
    createSet(s.project, join(s.project, 't.md'), { id: 'dull', count: 3 }); // three copies of the draft: nothing survives
    await expect(run('reading', 'open', '--set', 'dull', '--no-predict', '--dir', s.project)).rejects.toMatchObject({ code: 'E_USAGE', hint: expect.stringContaining('prose set check dull') });
  });

  it('with --no-predict records predicted:false and the current keep list and hashes', async () => {
    const s = seed({ predict: false });
    // the base draft declares a target and its own pace; the session carries what measure would use
    writeFileSync(join(setDir(s.project, 'demo'), s.set.base), SHORT.replace('form: speech-small', 'form: speech-small\ntarget: 2 minutes\nwpm: 160'));
    serveLocal();
    const out = await run('reading', 'open', '--set', 'demo', '--no-predict', '--prompt', 'the bridge', '--dir', s.project);
    const session = readSession(s.project, out.id);
    expect(session).toMatchObject({ predicted: false, shown: [1, 2, 3], prompt: 'the bridge', form: 'speech-small', target: { minutes: 2 }, wpm: 160 });
    expect(Object.keys(session.hashes).sort()).toEqual(['1', '2', '3']);
    expect(session.hashes['2']).toBe(textHash(readFileSync(variantPath(s.project, s.set, s.set.variants[1]), 'utf8')));
  });

  it('with a prediction freezes its shown list and hashes, registers the project and prints a link with ?t=', async () => {
    const s = seed();
    serveLocal();
    const out = await run('reading', 'open', '--set', 'demo', '--dir', s.project);
    expect(out.id).toMatch(/^demo-\d{8}-\d{4}-[0-9a-f]{4}$/);
    const info = readServerInfo()!;
    expect(tokenOf(out.url)).toBe(info.token);
    expect(out.url).toContain(`/s/${out.id}?t=`);
    expect(out.wait).toBe(`prose reading wait --id ${out.id}`);
    expect(out.notice).toBe(LOCAL_NOTICE);
    expect(out).not.toHaveProperty('token');
    expect(out.predicted).toBe(true);
    expect(info.projects.map(projectKey)).toContain(projectKey(s.project));
    const session = readSession(s.project, out.id);
    expect(session).toMatchObject({ predicted: true, shown: s.prediction!.shown, hashes: s.prediction!.hashes, target: null, wpm: 130 }); // the form's default pace, no declared target
    expect(session.candidates.map(c => c.index)).toEqual(s.prediction!.shown);
    // the page can read it with that token
    const payload = await http(info, `/api/session/${out.id}`, { token: info.token });
    expect(payload.status).toBe(200);
    expect(JSON.stringify(payload.body)).not.toContain('SEALED-REASON');
  });

  it('--local with no server starts a 127.0.0.1 server', async () => {
    const s = seed();
    const out = await run('reading', 'open', '--set', 'demo', '--dir', s.project, '--local');
    expect(readServerInfo()!.host).toBe('127.0.0.1');
    expect(out.url).toContain('http://127.0.0.1:');
    expect(out.ipUrls).toEqual([]);
    expect(out.notice).toBe(LOCAL_NOTICE);
  });

  it('without --local reuses a running local server and says it is local only', async () => {
    const s = seed();
    const first = serveLocal();
    const out = await run('reading', 'open', '--set', 'demo', '--dir', s.project);
    expect(readServerInfo()).toMatchObject({ host: '127.0.0.1', pid: first.pid });
    expect(out.url).toContain('http://127.0.0.1:');
    expect(out.notice).toBe(LOCAL_NOTICE);
    expect(out.notice).not.toMatch(/anyone on this network/i);
  });

  it('with nothing running and no flag asks for the default (LAN) bind; --local asks for loopback (spawn stubbed)', async () => {
    const seen: string[][] = [];
    const stub = ((_cmd: string, args: string[]) => { seen.push(args); throw new Error('stubbed'); }) as never;
    await expect(ensureServer({}, stub)).rejects.toThrow('stubbed');
    await expect(ensureServer({ local: true }, stub)).rejects.toThrow('stubbed');
    expect(seen[0]).not.toContain('--local');
    expect(seen[1]).toContain('--local');
  });

  it('spawned as a process, prints one JSON object', () => {
    const s = seed();
    serveLocal();
    const r = prose('reading', 'open', '--set', 'demo', '--dir', s.project);
    expect(r.status, r.stderr).toBe(0);
    expect(Object.keys(r.out).sort()).toEqual(['id', 'ipUrls', 'notice', 'predicted', 'url', 'wait']);
    expect(r.out.ipUrls).toEqual([]); // a local server has no LAN links
  });
});

describe('prose reading wait', () => {
  it('returns the refine request with notes and the unit text when one is posted', async () => {
    // the refine is posted later (a play before it is not an answer): wait must block until it
    const s2 = seed({ id: 'read-2' });
    for (const e of [lineup, duel(1, 2, 'b', 'd1'), duel(2, 3, 'a', 'd2'), duel(1, 3, 'a', 'd3'), { type: 'note', index: 1, unit: 0, text: 'too blunt', eventId: 'n1' }]) appendEvent(s2.project, 'read-2', e);
    const timer = setTimeout(() => { appendEvent(s2.project, 'read-2', { type: 'play', index: 1, mode: 'speak' }); appendEvent(s2.project, 'read-2', refine); }, 500);
    const t0 = Date.now();
    const out = await run('reading', 'wait', '--id', 'read-2', '--dir', s2.project);
    clearTimeout(timer);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(400);
    expect(out).toMatchObject({ event: 'refine', champion: 2, directions: ['warmer', 'shorter'], like: 3 });
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toMatchObject({ candidate: 1, note: 'too blunt', unit: 0 });
    expect(out.notes[0].label).toMatch(/^[A-C]$/);
    expect(out.notes[0].unitText).toContain('We raised');
    expect(out.next).toContain('prose set new');
    expect(out.next).toContain('--directions warmer,shorter');
    expect(out.next).toContain('prose reading round --id read-2 --set <new-set>');
    expect(out.championFile).toContain('v2.md');
  });

  it('hands the agent the line, not a sentence, for a note on a verse draft', async () => {
    const lines = Array.from({ length: 14 }, (_, i) => `Line ${i + 1} of the sonnet. And a second thought a while.`);
    const draft = `---\nform: sonnet-shakespearean\n---\n\n${lines.join('\n')}\n`;
    const p = tmpProject();
    const set = createSet(p.project, p.write('s.md', draft), { id: 'verse', count: 3, directions: ['shorter', 'warmer', 'punchier'] });
    const texts = [1, 2, 3].map(k => `---\nform: sonnet-shakespearean\n---\n\n${lines.map((l, i) => `V${k} ${l.replace('a while', `a while${i}`)}`).join('\n')}\n`);
    set.variants.forEach((v, k) => writeFileSync(variantPath(p.project, set, v), texts[k]));
    const prediction = writePrediction(p.project, set, { pick: 2, shortlist: [3], why: 'w' });
    openSession(p.project, {
      id: 'verse-1', setId: 'verse', form: 'sonnet-shakespearean', register: null, prompt: '', shown: prediction.shown, hashes: prediction.hashes,
      target: null, wpm: 130, candidates: set.variants.map(v => ({ index: v.index, name: `v${v.index}`, direction: v.direction, round: 0 })),
    });
    for (const e of [lineup, duel(1, 2, 'b', 'd1'), duel(2, 3, 'a', 'd2'), duel(1, 3, 'a', 'd3'), { type: 'note', index: 2, unit: 3, text: 'weak', eventId: 'n1' }, refine]) appendEvent(p.project, 'verse-1', e);
    const out = await run('reading', 'wait', '--id', 'verse-1', '--dir', p.project, '--timeout', '5');
    expect(out.notes[0].unitText).toBe(texts[1].trim().split('\n').filter(Boolean).slice(-14)[3]);
    expect(out.notes[0].unitText).toMatch(/^V2 Line 4 of the sonnet. And/);
  });

  it('answers at once when the request is already there, and again until a round answers it', async () => {
    const s = seed();
    toWaiting(s);
    appendEvent(s.project, 'read-1', refine);
    const a = await run('reading', 'wait', '--id', 'read-1', '--dir', s.project);
    const b = await run('reading', 'wait', '--id', 'read-1', '--dir', s.project);
    expect([a.event, b.event]).toEqual(['refine', 'refine']);
  });

  it('reports ship and abandon', async () => {
    const s = seed();
    toWaiting(s, false);
    appendEvent(s.project, 'read-1', { type: 'ship', champion: 2 });
    const out = await run('reading', 'wait', '--id', 'read-1', '--dir', s.project);
    expect(out).toMatchObject({ event: 'ship', champion: 2 });
    expect(out.next).toContain('prose reading status --id read-1');
    const t = seed({ id: 'read-3' });
    appendEvent(t.project, 'read-3', { type: 'abandon' });
    expect(await run('reading', 'wait', '--id', 'read-3', '--dir', t.project)).toMatchObject({ event: 'abandon', next: expect.stringContaining('abandoned') });
  });

  it('--timeout 1 returns { timeout: true } and exits 0', () => {
    const s = seed();
    const r = prose('reading', 'wait', '--id', 'read-1', '--timeout', '1', '--dir', s.project);
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toMatchObject({ timeout: true, next: expect.stringContaining('prose reading wait --id read-1') });
  });

  it('is E_NOT_FOUND for an unknown session', async () => {
    const s = seed();
    await expect(run('reading', 'wait', '--id', 'nope', '--timeout', '1', '--dir', s.project)).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
  });
});

describe('prose reading round', () => {
  it('is E_CONFLICT unless the session is waiting', async () => {
    const s = seed();
    newSet(s);
    await expect(run('reading', 'round', '--id', 'read-1', '--set', 'next', '--dir', s.project)).rejects.toMatchObject({ code: 'E_CONFLICT', hint: expect.stringContaining('wait') });
    expect(readEvents(s.project, 'read-1')).toEqual([]);
  });

  it('is E_USAGE with the check\'s next step when fewer than two variants survive', async () => {
    const s = seed();
    toWaiting(s);
    appendEvent(s.project, 'read-1', refine);
    newSet(s, 'thin', [SHORT, SHORT, PUNCHY.replace('Nobody', 'No one')]); // two are the base: one survivor
    await expect(run('reading', 'round', '--id', 'read-1', '--set', 'thin', '--dir', s.project)).rejects.toMatchObject({ code: 'E_USAGE', hint: expect.stringContaining('prose set check thin') });
    expect(readEvents(s.project, 'read-1').at(-1)!.type).toBe('refine');
  });

  it('appends one round event with hashes and variant numbers, and the page shows the new candidates unchanged', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    toWaiting(s);
    appendEvent(s.project, 'read-1', refine);
    const next = newSet(s);
    const before = readEvents(s.project, 'read-1').length;
    const out = await run('reading', 'round', '--id', 'read-1', '--set', 'next', '--dir', s.project);
    const events = readEvents(s.project, 'read-1');
    expect(events).toHaveLength(before + 1);
    const round = events.at(-1)!;
    expect(round).toMatchObject({ type: 'round', n: 1, setId: 'next' });
    if (round.type !== 'round') throw new Error('not a round');
    expect(round.candidates.map(c => [c.index, c.variant, c.round, c.direction])).toEqual([[4, 1, 1, 'shorter'], [5, 2, 1, 'warmer'], [6, 3, 1, 'punchier']]);
    for (const c of round.candidates) expect(c.hash).toBe(textHash(readFileSync(variantPath(s.project, next, next.variants[c.variant! - 1]), 'utf8')));
    expect(out).toMatchObject({ round: 1, next: 'the page picks it up; run prose reading wait --id read-1 again' });
    expect(out.candidates).toHaveLength(3);
    const payload = (await http(info, '/api/session/read-1')).body;
    expect(payload.state).toMatchObject({ stage: 'lineup', round: 1, champion: 2 });
    for (const i of [4, 5, 6]) expect(payload.candidates.find((c: any) => c.index === i)).toMatchObject({ changed: false, hashOk: true });
    expect(payload.candidates.find((c: any) => c.index === 2)).toMatchObject({ changed: false }); // the pinned champion stays on offer
    // and a second round is refused until the owner refines again
    await expect(run('reading', 'round', '--id', 'read-1', '--set', 'next', '--dir', s.project)).rejects.toMatchObject({ code: 'E_CONFLICT' });
  });
});

describe('prose reading status, list and close', () => {
  it('shows the folded state, lists sessions, and closes once', async () => {
    const s = seed();
    toWaiting(s);
    const st = await run('reading', 'status', '--id', 'read-1', '--dir', s.project);
    expect(st).toMatchObject({ id: 'read-1', stage: 'refine', round: 0, champion: 2, notes: 1, shipped: null, reveal: null });
    expect(st.duels).toHaveLength(3);
    expect(st.candidates.map((c: any) => c.index)).toEqual([1, 2, 3]);
    expect(st.candidates.every((c: any) => /^[A-C]$/.test(c.label))).toBe(true);
    expect(JSON.stringify(st)).not.toContain('SEALED-REASON');

    const list = await run('reading', 'list', '--dir', s.project);
    expect(list.sessions).toEqual([expect.objectContaining({ id: 'read-1', setId: 'demo', stage: 'refine', createdAt: expect.any(String) })]);

    expect(await run('reading', 'close', '--id', 'read-1', '--dir', s.project)).toMatchObject({ id: 'read-1', closed: true, stage: 'abandoned' });
    expect(readEvents(s.project, 'read-1').at(-1)!.type).toBe('abandon');
    const count = readEvents(s.project, 'read-1').length;
    expect(await run('reading', 'close', '--id', 'read-1', '--dir', s.project)).toMatchObject({ closed: false, stage: 'abandoned' });
    expect(readEvents(s.project, 'read-1')).toHaveLength(count);
    await expect(run('reading', 'status', '--id', 'nope', '--dir', s.project)).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
  });
});

describe('the whole hand-off', () => {
  it('open -> lineup, duel, refine on the page -> wait -> set new -> round -> cross-set duel -> ship -> status reveals', async () => {
    const s = seed({ id: 'old-session' });
    serveLocal();
    const opened = await run('reading', 'open', '--set', 'demo', '--dir', s.project);
    const id = opened.id;
    const info = readServerInfo()!;
    const page = (event: unknown) => post(info, id, event, { token: info.token });

    for (const e of [
      { type: 'lineup', kept: [1, 2, 3], duds: [], order: [3, 1, 2], eventId: 'l1' },
      { type: 'note', index: 1, unit: 0, text: 'warmer please', eventId: 'n1' },
      duel(1, 2, 'b', 'd1'), duel(2, 3, 'a', 'd2'), duel(1, 3, 'a', 'd3'),
      { type: 'refine', champion: 2, directions: ['warmer'], like: null, eventId: 'r1' },
    ]) { const r = await page(e); expect([e.type, r.status, r.body?.error]).toEqual([e.type, 200, undefined]); }

    const asked = await run('reading', 'wait', '--id', id, '--timeout', '30', '--dir', s.project);
    expect(asked).toMatchObject({ event: 'refine', champion: 2, directions: ['warmer'] });
    expect(asked.notes[0]).toMatchObject({ candidate: 1, note: 'warmer please' });

    // what the agent does next: a new set from the champion's draft, then the round
    const draft = asked.championFile as string;
    const made = await run('set', 'new', draft, '--directions', 'warmer,shorter', '--count', '2', '--id', 'second');
    expect(made.set).toBe('second');
    const set2 = (await run('set', 'show', 'second', '--dir', s.project)).variants as Array<{ index: number }>;
    expect(set2).toHaveLength(2);
    writeFileSync(join(s.project, '.agent-prose', 'sets', 'second', 'v1.md'), WARM.replace('you know', 'my friends'));
    writeFileSync(join(s.project, '.agent-prose', 'sets', 'second', 'v2.md'), PUNCHY.replace('Nobody', 'No one'));
    const round = await run('reading', 'round', '--id', id, '--set', 'second', '--dir', s.project);
    expect(round.round).toBe(1);

    const payload = (await http(info, `/api/session/${id}`, { token: info.token })).body;
    expect(payload.state).toMatchObject({ stage: 'lineup', round: 1, champion: 2 });
    for (const c of payload.candidates) expect(c).toMatchObject({ changed: false });

    const added = round.candidates.map((c: any) => c.index) as number[];
    expect((await page({ type: 'lineup', kept: added, duds: [], order: [...added, 2], eventId: 'l2' })).status).toBe(200);
    // the champion (round 0, set demo) against a new variant (set second): a cross-set duel
    expect((await page(duel(2, added[0], 'b', 'd4'))).status).toBe(200);
    expect((await page(duel(2, added[1], 'a', 'd5'))).status).toBe(200);
    expect((await page(duel(added[0], added[1], 'a', 'd6'))).status).toBe(200);
    const shipped = await page({ type: 'ship', champion: added[0], eventId: 's1' });
    expect([shipped.status, shipped.body?.error]).toEqual([200, undefined]);

    expect(await run('reading', 'wait', '--id', id, '--timeout', '5', '--dir', s.project)).toMatchObject({ event: 'ship', champion: added[0] });
    const status = await run('reading', 'status', '--id', id, '--dir', s.project);
    expect(status).toMatchObject({ stage: 'shipped', round: 1, shipped: added[0] });
    expect(status.reveal).toMatchObject({ schema: 'prose/session-reveal@1', picked: added[0], setId: 'second' });
    expect(readEvents(s.project, id).map(e => e.type)).toContain('round');
    expect(readEvents(s.project, id).filter(e => e.type === 'round')).toHaveLength(1);
  }, 120_000);
});
