// Limits that keep one misbehaving client from filling the disk or the server: connections, timeouts, events per
// session, notes per variant, and the size of the lineup arrays.
import { afterEach, describe, expect, it } from 'vitest';
import { connect, type Socket } from 'node:net';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessionDir } from '../src/owner/paths.ts';
import { MAX_EVENTS_PER_SESSION, MAX_NOTES_PER_VARIANT, ReadingServer } from '../src/reading/server.ts';
import { readEvents } from '../src/reading/session.ts';
import { useTempHome, useTmp } from './owner-helpers.ts';
import { http, post, seed, startServer, type Seed } from './reading-helpers.ts';

useTmp();
useTempHome();
const servers: ReadingServer[] = [];
const sockets: Socket[] = [];
afterEach(async () => { sockets.splice(0).forEach(s => s.destroy()); await Promise.all(servers.splice(0).map(s => s.close())); });

/** `count` engagement events written straight into the log, as valid stored lines. */
function fill(s: Seed, count: number, make: (k: number) => object) {
  const start = readEvents(s.project, 'read-1').length;
  const lines = Array.from({ length: count }, (_, k) => JSON.stringify({ ...make(k), at: new Date().toISOString(), seq: start + k + 1 })).join('\n') + '\n';
  appendFileSync(join(sessionDir(s.project, 'read-1'), 'events.jsonl'), lines);
}
const play = (k: number) => ({ type: 'play', index: 1, mode: 'read', eventId: `p${k}` });

describe('server limits', () => {
  it('sets connection and timeout limits on the HTTP server', async () => {
    const { server } = await startServer(servers, { projects: [] });
    expect(server.server.maxConnections).toBe(200);
    expect(server.server.headersTimeout).toBe(15_000);
    expect(server.server.requestTimeout).toBe(30_000);
    expect(server.server.keepAliveTimeout).toBe(5_000);
  });

  it('refuses connections beyond maxConnections and recovers when one closes', async () => {
    const { info } = await startServer(servers, { projects: [], maxConnections: 2 });
    const open = () => new Promise<Socket>((ok, fail) => { const c = connect(info.port, '127.0.0.1', () => ok(c)); c.on('error', fail); sockets.push(c); });
    const a = await open();
    const b = await open();
    const c = await open(); // the TCP handshake completes; the server then drops it
    const closed = await new Promise<boolean>(done => { c.on('close', () => done(true)); c.on('error', () => done(true)); setTimeout(() => done(false), 2000); });
    expect(closed).toBe(true);
    a.destroy(); b.destroy();
    await new Promise(r => setTimeout(r, 200));
    expect((await http(info, '/api/health')).status).toBe(200);
  });
});

describe('events per session', () => {
  it(`answers 429 E_SERVER "session is full" for an engagement event once ${MAX_EVENTS_PER_SESSION} are stored, and appends nothing`, async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    fill(s, MAX_EVENTS_PER_SESSION - 1, play);
    expect((await post(info, 'read-1', { ...play(1), eventId: 'last' })).status).toBe(200);
    const r = await post(info, 'read-1', { ...play(2), eventId: 'over' });
    expect([r.status, r.body.error.code, r.body.error.message]).toEqual([429, 'E_SERVER', 'session is full']);
    expect(readEvents(s.project, 'read-1')).toHaveLength(MAX_EVENTS_PER_SESSION);
    for (const e of [{ type: 'peek', index: 1, eventId: 'k' }, { type: 'note', index: 1, unit: 0, text: 'x', eventId: 'n' }]) {
      expect((await post(info, 'read-1', e)).status).toBe(429);
    }
  }, 60_000);

  it('a full session can still be shipped or abandoned: the owner is never locked out of finishing', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project], runProse: async () => ({}) });
    await post(info, 'read-1', { type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3], eventId: 'l' });
    fill(s, MAX_EVENTS_PER_SESSION, play);
    expect((await post(info, 'read-1', { ...play(1), eventId: 'x' })).status).toBe(429);
    expect((await post(info, 'read-1', { type: 'abandon', eventId: 'bye' })).status).toBe(200);
  }, 60_000);
});

describe('notes per variant', () => {
  it(`answers 429 once a variant has ${MAX_NOTES_PER_VARIANT} notes, while another variant still takes one`, async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    fill(s, MAX_NOTES_PER_VARIANT, k => ({ type: 'note', index: 1, unit: 0, text: `n${k}`, eventId: `n${k}` }));
    const r = await post(info, 'read-1', { type: 'note', index: 1, unit: 0, text: 'one more', eventId: 'more' });
    expect([r.status, r.body.error.code]).toEqual([429, 'E_SERVER']);
    expect(r.body.error.message).toMatch(/notes/);
    expect((await post(info, 'read-1', { type: 'note', index: 2, unit: 0, text: 'fine', eventId: 'other' })).status).toBe(200);
  });
});

describe('lineup arrays', () => {
  it('accepts 50 entries and refuses 51 in kept, duds and order', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    const many = (n: number) => Array.from({ length: n }, (_, k) => k + 1);
    for (const field of ['kept', 'duds', 'order']) {
      const over = await post(info, 'read-1', { type: 'lineup', kept: [1], duds: [], order: [1], eventId: `o-${field}`, [field]: many(51) });
      expect([over.status, over.body.error.code], field).toEqual([400, 'E_SCHEMA']);
    }
    const ok = await post(info, 'read-1', { type: 'lineup', kept: many(50), duds: [], order: many(50), eventId: 'fifty' });
    expect(ok.status).toBe(200);
  });
});
