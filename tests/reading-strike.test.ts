import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadingServer, type RunProse } from '../src/reading/server.ts';
import { strikeDir } from '../src/owner/paths.ts';
import { createSet, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { appendEvent } from '../src/reading/session.ts';
import { strikeKey } from '../src/strike/store.ts';
import { run } from './helpers.ts';
import { SHORT, tmp, useTempHome, useTmp } from './owner-helpers.ts';
import { TOKEN, http, seed, startServer, type Reply, type Seed } from './reading-helpers.ts';

useTmp();
useTempHome();

const servers: ReadingServer[] = [];
const holders: ChildProcess[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const h of holders.splice(0)) h.kill();
  await Promise.all(servers.splice(0).map(s => s.close()));
});

const STRIKE = '/api/session/read-1/strike';
const json = (o: unknown) => JSON.stringify(o);
const get = (info: { port: number }, id = 'read-1') => http(info as never, `/api/session/${id}`);
const hashOf = async (info: { port: number }) => (await get(info)).body.draft.hash as string;
const body = (hash: string, over: Record<string, unknown> = {}) => ({ ref: '5', reason: 'wrong-direction', draftHash: hash, eventId: `e-${Math.random().toString(36).slice(2, 10)}`, ...over });
const logFile = (s: Seed) => join(strikeDir(s.project, strikeKey('t.md')), 'events.jsonl');
const logRows = (s: Seed) => (existsSync(logFile(s)) ? readFileSync(logFile(s), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);

/** A stub for the CLI that records its argv and answers like a successful strike. */
function stub(answer: unknown = { strike: { id: 's1' } }): { run: RunProse; calls: Array<{ args: string[]; cwd: string }> } {
  const calls: Array<{ args: string[]; cwd: string }> = [];
  return { calls, run: async (args, opts) => { calls.push({ args, cwd: opts.cwd }); return answer; } };
}

describe('the draft in the payload', () => {
  it('lists the draft as strike lines with a hash and a rev, and nothing struck yet', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    const { draft } = (await get(info)).body;
    expect(draft).toMatchObject({ source: 't.md', editable: true, strikes: [], applied: null });
    expect(draft.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(draft.rev).toMatch(/^[0-9a-f]{16}$/);
    expect(draft.lines).toEqual([
      { ref: '5', start: 5, end: 5, text: 'We built the bridge in the rain and the dark. A thousand people cross it every day.', strikable: true },
    ]);
    expect(draft.truncated).toBeUndefined();
  });

  it('shows a strike with its reason, note and text, and the rev changes with it', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    const first = (await get(info)).body.draft;
    await run('strike', join(s.project, 't.md'), '--line', '5', '--reason', 'faulty-premise', '--note', 'not true');
    const after = (await get(info)).body.draft;
    expect(after.strikes).toEqual([expect.objectContaining({ id: 's1', ref: '5', reason: 'faulty-premise', note: 'not true', stale: false, text: expect.stringContaining('We built the bridge') })]);
    expect(after.rev).not.toBe(first.rev);
    expect(after.hash).toBe(first.hash);
  });

  it('says every strike is stale once the draft changes, even an edit elsewhere, and the rev changes', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    await run('strike', join(s.project, 't.md'), '--line', '5', '--reason', 'wrong-direction');
    const before = (await get(info)).body.draft;
    writeFileSync(join(s.project, 't.md'), `${SHORT}\nA new closing line.\n`);
    const after = (await get(info)).body.draft;
    expect(after.strikes.map((x: { stale: boolean }) => x.stale)).toEqual([true]);
    expect(after.hash).not.toBe(before.hash);
    expect(after.rev).not.toBe(before.rev);
  });

  it('a poll that finds nothing changed adds no read of the draft or of the strike log', async () => {
    const s = seed();
    const { server, info } = await startServer(servers, { projects: [s.project] });
    await run('strike', join(s.project, 't.md'), '--line', '5', '--reason', 'wrong-direction');
    await get(info);
    const { lines, strikes } = server.reads;
    expect([lines, strikes]).toEqual([1, 1]);
    for (let k = 0; k < 4; k++) await get(info);
    expect([server.reads.lines, server.reads.strikes]).toEqual([lines, strikes]);
    writeFileSync(join(s.project, 't.md'), `${SHORT}\nChanged.\n`);
    await get(info);
    expect(server.reads.lines).toBe(lines + 1);
  });

  it('the view is read only once the session is abandoned', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    appendEvent(s.project, 'read-1', { type: 'abandon', eventId: 'bye' });
    expect((await get(info)).body.draft.editable).toBe(false);
  });

  it('is null for a draft that is gone, a draft that does not parse, and a source that escapes the project', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    const file = join(s.project, 't.md');
    writeFileSync(file, '---\nform: [unterminated\n---\nText.\n');
    expect((await get(info)).body.draft).toBeNull();
    writeFileSync(file, SHORT);
    expect((await get(info)).body.draft).not.toBeNull();

    const outside = tmp('prose-outside-');
    writeFileSync(join(outside, 'x.md'), SHORT);
    try { symlinkSync(outside, join(s.project, 'link'), 'junction'); } catch { return; }
    writeSet(s.project, { ...readSet(s.project, 'demo'), source: 'link/x.md' });
    expect((await get(info)).body.draft).toBeNull();
    writeSet(s.project, { ...readSet(s.project, 'demo'), source: '.agent-prose/project.json.md' });
    expect((await get(info)).body.draft).toBeNull();
    writeSet(s.project, { ...readSet(s.project, 'demo'), source: 'gone.md' });
    expect((await get(info)).body.draft).toBeNull();
  });

  it('truncates a very long draft and says so', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    writeFileSync(join(s.project, 't.md'), Array.from({ length: 2100 }, (_, k) => `Paragraph ${k + 1}.`).join('\n\n') + '\n');
    const { draft } = (await get(info)).body;
    expect(draft.lines).toHaveLength(2000);
    expect(draft.truncated).toBe(true);
  });
});

describe('POST /api/session/<id>/strike', () => {
  it('runs the CLI with an argv array: the draft path from set.json, = forms for a note and an event id', async () => {
    const s = seed();
    const st = stub();
    const { info } = await startServer(servers, { projects: [s.project], runProse: st.run });
    const hash = await hashOf(info);
    const r = await http(info, STRIKE, { body: json({ ref: '5', reason: 'not-worth-rewrite', note: '--not a flag; $(rm -rf)', draftHash: hash, eventId: 'ev-1' }) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, state: { draft: { source: 't.md' } } });
    expect(st.calls).toEqual([{ cwd: s.project, args: ['strike', 'add', join(s.project, 't.md'), '--line', '5', '--reason', 'not-worth-rewrite', '--note=--not a flag; $(rm -rf)', '--draft-hash', hash, '--event-id=ev-1', '--dir', s.project] }]);
  });

  it('passes the CLI\'s duplicate answer through', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project], runProse: stub({ duplicate: true }).run });
    const r = await http(info, STRIKE, { body: json(body(await hashOf(info))) });
    expect(r.body.duplicate).toBe(true);
  });

  it('refuses a tampered request before the CLI is asked: bad ref, reason, note, hash, event id, extra keys, missing keys', async () => {
    const s = seed();
    const st = stub();
    const { info } = await startServer(servers, { projects: [s.project], runProse: st.run });
    const h = await hashOf(info);
    const bad: Array<[string, Record<string, unknown>]> = [
      ['ref', { ref: '5; rm -rf /' }], ['ref range', { ref: '5-' }], ['ref flag', { ref: '--all' }], ['ref number', { ref: 5 }], ['ref negative', { ref: '-5' }],
      ['reason', { reason: 'boring' }], ['reason case', { reason: 'Wrong-Direction' }],
      ['note long', { note: 'x'.repeat(501) }], ['note empty', { note: '' }], ['note type', { note: ['x'] }],
      ['hash short', { draftHash: 'abc' }], ['hash upper', { draftHash: 'A'.repeat(64) }],
      ['event id space', { eventId: 'has space' }], ['event id long', { eventId: 'e'.repeat(101) }], ['event id missing', { eventId: undefined }],
      ['extra key', { draft: '../../etc/passwd' }], ['extra file', { file: 'x.md' }], ['ref missing', { ref: undefined }],
    ];
    for (const [what, over] of bad) {
      const r = await http(info, STRIKE, { body: json(body(h, over)) });
      expect([what, r.status, r.body?.error?.code]).toEqual([what, 400, 'E_SCHEMA']);
    }
    expect((await http(info, STRIKE, { body: '{not json' })).status).toBe(400);
    expect((await http(info, STRIKE, { body: '[]' })).status).toBe(400);
    expect((await http(info, STRIKE, { body: 'null' })).status).toBe(400);
    expect(st.calls).toEqual([]);
  });

  it('refuses without the token, with a wrong one, and from another origin', async () => {
    const s = seed();
    const st = stub();
    const { info } = await startServer(servers, { projects: [s.project], runProse: st.run });
    const b = json(body(await hashOf(info)));
    expect((await http(info, STRIKE, { body: b, token: null })).status).toBe(401);
    expect((await http(info, STRIKE, { body: b, token: 'wrong' })).status).toBe(401);
    const cross = await new Promise<number>((ok, fail) => {
      const req = request({ host: '127.0.0.1', port: info.port, path: `${STRIKE}?t=${TOKEN}`, method: 'POST', agent: false, headers: { origin: 'http://evil.example', 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(b)) } }, res => { res.resume(); res.on('end', () => ok(res.statusCode!)); });
      req.on('error', fail);
      req.end(b);
    });
    expect(cross).toBe(403);
    expect(st.calls).toEqual([]);
  });

  it('refuses a body over 64 KB with 413, and a wrong method or an unknown session', async () => {
    const s = seed();
    const st = stub();
    const { info } = await startServer(servers, { projects: [s.project], runProse: st.run });
    expect((await http(info, STRIKE, { body: json(body(await hashOf(info), { note: 'x'.repeat(70 * 1024) })) })).status).toBe(413);
    expect((await http(info, STRIKE)).status).toBe(405);
    expect((await http(info, `${STRIKE}/clear`)).status).toBe(405);
    expect((await http(info, '/api/session/nope/strike', { body: '{}' })).status).toBe(404);
    expect((await http(info, '/api/session/..%2f..%2fetc/strike', { body: '{}' })).status).toBe(404);
    expect(st.calls).toEqual([]);
  });

  it('is 409 once the session has ended, and nothing reaches the CLI', async () => {
    const s = seed();
    const st = stub();
    const { info } = await startServer(servers, { projects: [s.project], runProse: st.run });
    const h = await hashOf(info);
    appendEvent(s.project, 'read-1', { type: 'abandon', eventId: 'bye' });
    const r = await http(info, STRIKE, { body: json(body(h)) });
    expect([r.status, r.body.error.code]).toEqual([409, 'E_CONFLICT']);
    expect((await http(info, `${STRIKE}/clear`, { body: json({ strike: 's1', eventId: 'c1' }) })).status).toBe(409);
    expect(st.calls).toEqual([]);
  });

  it('is 404 when the draft is not available, and never names a path from the request', async () => {
    const s = seed();
    const st = stub();
    const { info } = await startServer(servers, { projects: [s.project], runProse: st.run });
    const h = await hashOf(info);
    writeSet(s.project, { ...readSet(s.project, 'demo'), source: 'gone.md' });
    const r = await http(info, STRIKE, { body: json(body(h)) });
    expect([r.status, r.body.error.code]).toEqual([404, 'E_NOT_FOUND']);
    expect(st.calls).toEqual([]);
  });

  it('serialises writes of one session: two strikes never run their CLI at the same time', async () => {
    const s = seed();
    let running = 0;
    let peak = 0;
    const runProse: RunProse = async () => { running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 40)); running--; return {}; };
    const { info } = await startServer(servers, { projects: [s.project], runProse });
    const h = await hashOf(info);
    const all = await Promise.all([1, 2, 3, 4].map(k => http(info, STRIKE, { body: json(body(h, { eventId: `par-${k}` })) })));
    expect(all.map(r => r.status)).toEqual([200, 200, 200, 200]);
    expect(peak).toBe(1);
  });
});

describe('POST /api/session/<id>/strike/clear', () => {
  it('runs the CLI clear with an event id and validates its body', async () => {
    const s = seed();
    const st = stub();
    const { info } = await startServer(servers, { projects: [s.project], runProse: st.run });
    expect((await http(info, `${STRIKE}/clear`, { body: json({ strike: 's3', eventId: 'c-1' }) })).status).toBe(200);
    expect(st.calls[0].args).toEqual(['strike', 'clear', join(s.project, 't.md'), 's3', '--event-id=c-1', '--dir', s.project]);
    for (const bad of [{ strike: '../s1', eventId: 'c' }, { strike: 's1' }, { strike: 's1', eventId: 'c', all: true }, { strike: '--all', eventId: 'c' }, { strike: 's1', eventId: 'a b' }]) {
      const r = await http(info, `${STRIKE}/clear`, { body: json(bad) });
      expect([r.status, r.body.error.code]).toEqual([400, 'E_SCHEMA']);
    }
    expect(st.calls).toHaveLength(1);
  });
});

describe('strike and clear through the real CLI', () => {
  it('strikes, retries safely, shows it struck, and takes it back', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    const h = await hashOf(info);
    const b = body(h, { note: 'too sweet', eventId: 'real-1' });
    const first = await http(info, STRIKE, { body: json(b) });
    expect(first.status).toBe(200);
    expect(first.body.state.draft.strikes).toEqual([expect.objectContaining({ id: 's1', reason: 'wrong-direction', note: 'too sweet', stale: false })]);
    const retry = await http(info, STRIKE, { body: json(b) });
    expect(retry.body.duplicate).toBe(true);
    expect(retry.body.state.draft.strikes).toHaveLength(1);
    expect(logRows(s)).toHaveLength(1);
    const cleared = await http(info, `${STRIKE}/clear`, { body: json({ strike: 's1', eventId: 'real-c1' }) });
    expect(cleared.body.state.draft.strikes).toEqual([]);
    expect((await http(info, `${STRIKE}/clear`, { body: json({ strike: 's1', eventId: 'real-c1' }) })).body.duplicate).toBe(true);
    expect((await http(info, `${STRIKE}/clear`, { body: json({ strike: 's1', eventId: 'real-c2' }) })).status).toBe(404);
    expect(logRows(s).map(r => r.type)).toEqual(['strike', 'clear']);
  }, 30_000);

  it('refuses a stale draft hash (409), a line that is not there (400) and a second strike of the same line (409)', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    const h = await hashOf(info);
    const stale = await http(info, STRIKE, { body: json(body('0'.repeat(64))) });
    expect([stale.status, stale.body.error.code]).toEqual([409, 'E_CONFLICT']);
    const missing = await http(info, STRIKE, { body: json(body(h, { ref: '99' })) });
    expect([missing.status, missing.body.error.code]).toEqual([400, 'E_USAGE']);
    expect((await http(info, STRIKE, { body: json(body(h)) })).status).toBe(200);
    const again = await http(info, STRIKE, { body: json(body(h)) });
    expect([again.status, again.body.error.code]).toEqual([409, 'E_CONFLICT']);
    expect(logRows(s)).toHaveLength(1);
  }, 30_000);

  it('strikes of different lines at once all land (the strike lock), each once', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    writeFileSync(join(s.project, 't.md'), Array.from({ length: 6 }, (_, k) => `Paragraph number ${k + 1}.`).join('\n\n') + '\n');
    const h = await hashOf(info);
    const all = await Promise.all([1, 3, 5, 7, 9, 11].map(ref => http(info, STRIKE, { body: json(body(h, { ref: String(ref) })) })));
    expect(all.map((r: Reply) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(logRows(s).map(r => r.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect((await get(info)).body.draft.strikes).toHaveLength(6);
  }, 60_000);

  it('a strike made while a draft edit lands is refused, not recorded against the old text', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    const h = await hashOf(info);
    writeFileSync(join(s.project, 't.md'), SHORT.replace('We built', 'We raised'));
    const r = await http(info, STRIKE, { body: json(body(h)) });
    expect([r.status, r.body.error.code]).toEqual([409, 'E_CONFLICT']);
    expect(logRows(s)).toEqual([]);
  }, 30_000);
});

describe('GET /api/session/<id>/strike/preview', () => {
  const seedStruck = async (refs: string[] = ['5']) => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    writeFileSync(join(s.project, 't.md'), `${SHORT}\nA second paragraph here.\n\nA third one follows.\n`);
    for (const ref of refs) await run('strike', join(s.project, 't.md'), '--line', ref, '--reason', ref === '5' ? 'wrong-direction' : 'faulty-premise', '--note', `note for ${ref}`);
    return { s, info };
  };

  it('is the removal plan the pending strikes would make: digest, count and every removed line with its reason', async () => {
    const { info } = await seedStruck(['5', '7']);
    const r = await http(info, `${STRIKE}/preview`);
    expect(r.status).toBe(200);
    expect(r.body.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body).toMatchObject({ count: 2 });
    expect(r.body.removed).toEqual([
      expect.objectContaining({ start: 5, end: 5, kind: 'unit', strike: 's1', reason: 'wrong-direction', note: 'note for 5', text: expect.stringContaining('We built the bridge') }),
      expect.objectContaining({ start: 6, end: 6, kind: 'blank' }),
      expect.objectContaining({ start: 7, end: 7, kind: 'unit', strike: 's2', reason: 'faulty-premise', text: 'A second paragraph here.' }),
      expect.objectContaining({ start: 8, end: 8, kind: 'blank' }),
    ]);
  });

  it('is read only: no lock, no write, and the same digest every time', async () => {
    const { s, info } = await seedStruck();
    const dir = strikeDir(s.project, strikeKey('t.md'));
    const before = readdirSync(dir).sort();
    const log = readFileSync(logFile(s), 'utf8');
    const a = await http(info, `${STRIKE}/preview`);
    const b = await http(info, `${STRIKE}/preview`);
    expect(a.body.digest).toBe(b.body.digest);
    expect(readdirSync(dir).sort()).toEqual(before);
    expect(before).not.toContain('apply.pending.json');
    expect(readFileSync(logFile(s), 'utf8')).toBe(log);
  });

  it('is 409 when nothing is struck or a strike is stale, and 404 when the draft is gone; needs the token', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    expect((await http(info, `${STRIKE}/preview`)).status).toBe(409);
    await run('strike', join(s.project, 't.md'), '--line', '5', '--reason', 'wrong-direction');
    expect((await http(info, `${STRIKE}/preview`)).status).toBe(200);
    expect((await http(info, `${STRIKE}/preview`, { token: null })).status).toBe(401);
    writeFileSync(join(s.project, 't.md'), `${SHORT}\nMore.\n`);
    const stale = await http(info, `${STRIKE}/preview`);
    expect([stale.status, stale.body.error.code]).toEqual([409, 'E_CONFLICT']);
    writeSet(s.project, { ...readSet(s.project, 'demo'), source: 'gone.md' });
    expect((await http(info, `${STRIKE}/preview`)).status).toBe(404);
  });
});

describe('the event loop stays free while a strike waits for the strike lock', () => {
  it('keeps /api/health fast while the CLI waits, then records the strike once the lock is released', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    const h = await hashOf(info);
    mkdirSync(strikeDir(s.project, strikeKey('t.md')), { recursive: true });
    const log = join(tmp('prose-hold-'), 'hold.log');
    const child = spawn(process.execPath, ['tests/lock-holder.mjs', s.project, strikeKey('t.md'), 'holder', '1500', '200', log, json({ kind: 'strikes' })], { stdio: 'ignore', cwd: join(import.meta.dirname, '..') });
    holders.push(child);
    for (const deadline = Date.now() + 10_000; !(existsSync(log) && readFileSync(log, 'utf8').includes('enter')); await new Promise(r => setTimeout(r, 25))) {
      if (Date.now() > deadline) throw new Error('the lock holder did not start');
    }
    const t0 = Date.now();
    const pending = http(info, STRIKE, { body: json(body(h)) });
    let settled = false;
    void pending.then(() => { settled = true; });
    const slowest: number[] = [];
    await new Promise(r => setTimeout(r, 300));
    while (!settled && Date.now() - t0 < 30_000) {
      const t = Date.now();
      expect((await http(info, '/api/health')).status).toBe(200);
      slowest.push(Date.now() - t);
      await new Promise(r => setTimeout(r, 100));
    }
    expect(settled).toBe(true);
    expect(Math.max(...slowest)).toBeLessThan(300);
    expect((await pending).status).toBe(200);
    expect(logRows(s)).toHaveLength(1);
  }, 40_000);
});

describe('struck lines carried into a set show as struck on the page', () => {
  it('marks the units of a variant that still holds an excluded line', async () => {
    const s = seed();
    // Strike the paragraph, then make a set from the draft: its variants are full copies that keep the struck line.
    await run('strike', join(s.project, 't.md'), '--line', '5', '--reason', 'wrong-direction');
    const set = createSet(s.project, join(s.project, 't.md'), { id: 'next', count: 2 });
    expect(set.excluded).toEqual([{ ref: '5', text: 'We built the bridge in the rain and the dark. A thousand people cross it every day.' }]);
    const { openSession } = await import('../src/reading/session.ts');
    openSession(s.project, {
      id: 'read-2', setId: 'next', form: 'speech-small', register: 'plain', prompt: 'p', shown: [1, 2], hashes: {}, target: { minutes: 3 }, wpm: 150,
      candidates: set.variants.map(v => ({ index: v.index, name: `v${v.index}`, direction: v.direction, round: 0 })),
    });
    const { createHash } = await import('node:crypto');
    const hashes = Object.fromEntries(set.variants.map(v => [String(v.index), createHash('sha256').update(readFileSync(variantPath(s.project, set, v), 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n'), 'utf8').digest('hex')]));
    writeFileSync(join(s.project, '.agent-prose', 'sessions', 'read-2', 'session.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(s.project, '.agent-prose', 'sessions', 'read-2', 'session.json'), 'utf8')), hashes }, null, 2));
    const { info } = await startServer(servers, { projects: [s.project] });
    const res = await get(info, 'read-2');
    expect(res.status).toBe(200);
    expect(res.body.candidates.map((c: { struck?: number[] }) => c.struck)).toEqual([[0, 1], [0, 1]]);
  });
});
