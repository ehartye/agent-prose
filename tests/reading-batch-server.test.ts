// The queue routes of the reading server: the rail, items, choose, skip, send, finish, and what a tampered or foreign request gets.
import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { queueDir, setDir } from '../src/owner/paths.ts';
import { recordPick } from '../src/owner/pick.ts';
import { readSet } from '../src/owner/sets.ts';
import { ReadingServer, runProse, type RunProse, type ServerInfo } from '../src/reading/server.ts';
import { appendQueueEvent, readQueueEvents, type Queue } from '../src/reading/queue.ts';
import { readEvents, readSession } from '../src/reading/session.ts';
import { tmp, useTempHome, useTmp } from './owner-helpers.ts';
import { makeQueue, seedBatch, variantFileOf, type Batch } from './reading-batch-helpers.ts';
import { TOKEN, globalRows, http, projectRows, startServer } from './reading-helpers.ts';

useTmp();
useTempHome();
const servers: ReadingServer[] = [];
const holders: ChildProcess[] = [];
afterEach(async () => {
  for (const h of holders.splice(0)) h.kill();
  await Promise.all(servers.splice(0).map(s => s.close()));
});

/** `prose set pick` run in this process: the same recordPick the CLI runs, with its errors, and a record of each call. */
function pickStub(calls: string[][]): RunProse {
  return async (args, { cwd }) => {
    calls.push(args);
    if (args[0] === 'set' && args[1] === 'pick') {
      const set = readSet(cwd, args[2]);
      try { return recordPick(cwd, set, Number(args[args.indexOf('--pick') + 1]), { noPredict: args.includes('--no-predict') }); }
      catch (e) { if (e instanceof ProseError) throw e; throw new ProseError('E_SERVER', 'the prose command failed'); }
    }
    return runProse(args, { cwd }); // everything else (strikes) is the real CLI
  };
}

interface Rig { b: Batch; q: Queue; info: ServerInfo; server: ReadingServer; calls: string[][] }
async function rig(n: number, over: { predict?: (k: number) => boolean; real?: boolean } = {}): Promise<Rig> {
  const b = seedBatch(n, { predict: over.predict });
  const q = makeQueue(b);
  const calls: string[][] = [];
  const { server, info } = await startServer(servers, { projects: [b.project], ...(over.real ? {} : { runProse: pickStub(calls) }) });
  return { b, q, info, server, calls };
}

const api = (r: Rig, path: string, opts: { token?: string | null } = {}) => http(r.info, `/api/queue/${r.q.id}${path}`, opts);
const send = (r: Rig, path: string, body: unknown, opts: { token?: string | null } = {}) => http(r.info, `/api/queue/${r.q.id}${path}`, { body: typeof body === 'string' ? body : JSON.stringify(body), ...opts });
let k = 0;
const choose = (r: Rig, item: number, variant: number | null, passes: number[] = []) => send(r, '/choose', { item, variant, passes, eventId: `c-${++k}` });
const skip = (r: Rig, item: number) => send(r, '/skip', { item, eventId: `s-${++k}` });
const sendPicks = (r: Rig, sendId = `send-${++k}`) => send(r, '/send', { sendId, eventId: `e-${k}` });
const sessionOf = (r: Rig, n: number) => r.q.items[n - 1].sessionId;
const sessionTypes = (r: Rig, n: number) => readEvents(r.b.project, sessionOf(r, n)).map(e => e.type);

/** A raw request with exactly these headers. */
function raw(info: ServerInfo, path: string, headers: Record<string, string | undefined>, method = 'GET', body?: string): Promise<{ status: number; body: any }> {
  return new Promise((ok, fail) => {
    const h: Record<string, string> = {};
    for (const [key, v] of Object.entries(headers)) if (v !== undefined) h[key] = v;
    if (body !== undefined) { h['content-type'] = 'application/json'; h['content-length'] = String(Buffer.byteLength(body)); }
    const req = request({ host: '127.0.0.1', port: info.port, path: `${path}${path.includes('?') ? '&' : '?'}t=${TOKEN}`, method, headers: h, agent: false, setHost: false }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { const t = Buffer.concat(chunks).toString('utf8'); let j: any = null; try { j = JSON.parse(t); } catch { /* not JSON */ } ok({ status: res.statusCode!, body: j }); });
    });
    req.on('error', fail);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe('the rail and the item', () => {
  it('the rail lists every item with its labels and status, the counts, and a current item', async () => {
    const r = await rig(3);
    const res = await api(r, '');
    expect(res.status).toBe(200);
    expect(res.body.queue).toMatchObject({ id: r.q.id, total: 3, stage: 'open', cursor: 0, counts: { waiting: 3, picked: 0, sent: 0, skipped: 0, blocked: 0, ended: 0 } });
    expect(res.body.items).toEqual(r.q.items.map(i => ({ n: i.n, who: i.who, where: i.where, form: i.form, status: 'waiting', picked: null })));
    expect(res.body.order).toEqual([1, 2, 3]);
    expect(res.body.current).toBe(1);
  });

  it('is small at 50 sets, never carries text or a prediction, and a poll that finds nothing changed reads nothing', async () => {
    const r = await rig(50);
    const first = await api(r, '');
    expect(first.status).toBe(200);
    expect(first.text.length).toBeLessThan(20_000);
    expect(first.text).not.toMatch(/SEALED|prediction|We built|shortlist/);
    expect(first.body.items).toHaveLength(50);
    const reads = { ...r.server.reads };
    for (let i = 0; i < 4; i++) expect((await api(r, '')).status).toBe(200);
    expect(r.server.reads).toEqual(reads);
    expect(reads.queues).toBe(50);
    await choose(r, 5, 2);
    const after = r.server.reads.queues;
    expect(after - reads.queues).toBeLessThanOrEqual(1); // only the changed child is read again
  });

  it('an item is the child session payload with the compare rows, plus where the queue stands on it', async () => {
    const r = await rig(2);
    const res = await api(r, '/item/2');
    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ id: sessionOf(r, 2), setId: 'a-02', form: 'speech-small' });
    expect(res.body.compare).toMatchObject({ hasCurrent: false });
    expect(res.body.candidates.map((c: any) => c.index).sort()).toEqual([1, 2, 3]);
    expect(res.body.queue).toEqual({ n: 2, stage: 'open', status: 'waiting', choice: { variant: null, passes: [] }, back: null, sentBack: null, sentVariant: null });
    expect(res.text).not.toMatch(/SEALED|shortlistHit|"why"|"prediction"/); // the prediction is never in a payload
    expect(res.body.reveal).toEqual({ shipped: false, sentBack: false });
  });

  it('serves the page at /q/<id> with no token, like /s/<id>, and only for a plain id', async () => {
    const r = await rig(1);
    const page = await http(r.info, `/q/${r.q.id}`, { token: null });
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    for (const bad of ['/q/', '/q/UPPER', '/q/a/b', '/q/..%2f', '/q/a.b']) expect((await http(r.info, bad, { token: null })).status, bad).toBe(404);
  });
});

describe('who can ask what', () => {
  it('needs the token on every queue route; a wrong token is 401 and nothing is written', async () => {
    const r = await rig(2);
    const body = { item: 1, variant: 1, passes: [], eventId: 'x1' };
    for (const [path, method, payload] of [
      ['', 'GET', undefined], ['/item/1', 'GET', undefined], ['/item/1/reveal', 'GET', undefined], ['/item/1/strike/preview', 'GET', undefined],
      ['/item/1/event', 'POST', { type: 'play', index: 1, mode: 'speech' }], ['/item/1/strike', 'POST', {}],
      ['/choose', 'POST', body], ['/skip', 'POST', { item: 1, eventId: 'x2' }], ['/send', 'POST', { sendId: 's' }], ['/finish', 'POST', { eventId: 'x3' }],
    ] as const) {
      for (const token of [null, 'wrong']) {
        const res = await http(r.info, `/api/queue/${r.q.id}${path}`, { token, method, ...(payload ? { body: JSON.stringify(payload) } : {}) });
        expect(res.status, `${method} ${path} ${token}`).toBe(401);
      }
    }
    expect(readQueueEvents(r.b.project, r.q.id)).toEqual([]);
    expect(r.calls).toEqual([]);
  });

  it('refuses a cross-origin POST and, on a local bind, a Host that is not its own, on the new routes', async () => {
    const r = await rig(1);
    const host = `127.0.0.1:${r.info.port}`;
    const body = JSON.stringify({ item: 1, variant: 1, passes: [], eventId: 'o1' });
    expect((await raw(r.info, `/api/queue/${r.q.id}/choose`, { host, origin: 'http://evil.example' }, 'POST', body)).status).toBe(403);
    expect((await raw(r.info, `/api/queue/${r.q.id}/choose`, { host, origin: `http://${host}` }, 'POST', body)).status).toBe(200);
    for (const path of [`/api/queue/${r.q.id}`, `/api/queue/${r.q.id}/item/1`]) {
      expect((await raw(r.info, path, { host: `evil.example:${r.info.port}` })).status, path).toBe(421);
    }
    expect((await raw(r.info, `/api/queue/${r.q.id}/send`, { host: 'evil.example', origin: 'http://evil.example' }, 'POST', JSON.stringify({ sendId: 'z' }))).status).toBeGreaterThanOrEqual(400);
    expect(readQueueEvents(r.b.project, r.q.id).map(e => e.type)).toEqual(['choose']);
  });

  it('knows no queue that is not in a registered project, and no queue by a bad id', async () => {
    const r = await rig(1);
    for (const id of ['queue-nope', 'UPPER', '..', 'a%2fb', '%00', 'x'.repeat(80)]) {
      expect((await http(r.info, `/api/queue/${id}`)).status, id).toBe(404);
    }
    const other = seedBatch(1);
    const foreign = makeQueue(other);
    expect((await http(r.info, `/api/queue/${foreign.id}`)).status).toBe(404); // another project, not registered with this server
  });

  it('item numbers must be plain numbers the queue holds: 0, 3, 007, 100, letters, signs and traversal are 404', async () => {
    const r = await rig(2);
    for (const bad of ['0', '3', '07', '100', 'a', '-1', '1.5', '1e1', '..']) {
      for (const tail of ['', '/reveal', '/strike/preview']) expect((await api(r, `/item/${bad}${tail}`)).status, `${bad}${tail}`).toBe(404);
      expect((await send(r, `/item/${bad}/event`, { type: 'play', index: 1, mode: 's' })).status, `${bad} event`).toBe(404);
    }
    expect((await api(r, '/item/2')).status).toBe(200);
  });

  it('a queue.json that names another project\'s session is not followed: the item is not available', async () => {
    const r = await rig(2);
    const other = seedBatch(1);
    const foreign = makeQueue(other);
    // a second server project: register both, then make queue 1's item 2 point at the other project's child
    const both = await startServer(servers, { projects: [r.b.project, other.project], runProse: pickStub([]) });
    const file = join(queueDir(r.b.project, r.q.id), 'queue.json');
    const q = JSON.parse(readFileSync(file, 'utf8'));
    q.items[1].sessionId = foreign.items[0].sessionId;
    writeFileSync(file, JSON.stringify(q));
    const res = await http(both.info, `/api/queue/${r.q.id}/item/2`);
    expect(res.status).toBe(404);
    expect(res.text).not.toMatch(/We built|SEALED/);
    for (const tail of ['/reveal', '/strike/preview']) expect((await http(both.info, `/api/queue/${r.q.id}/item/2${tail}`)).status).toBe(404);
    expect((await http(both.info, `/api/queue/${r.q.id}/item/2/event`, { body: JSON.stringify({ type: 'play', index: 1, mode: 's' }) })).status).toBe(404);
    const rail = (await http(both.info, `/api/queue/${r.q.id}`)).body;
    expect(rail.items[1].status).toBe('blocked');
    expect(readEvents(other.project, foreign.items[0].sessionId)).toEqual([]);
  });

  it('a child that says it belongs to another queue is not an item of this one', async () => {
    const r = await rig(2);
    const file = join(r.b.project, '.agent-prose', 'sessions', sessionOf(r, 1), 'session.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace(r.q.id, 'queue-20260101-0000-dead'));
    expect((await api(r, '/item/1')).status).toBe(404);
    expect((await api(r, '')).body.items[0].status).toBe('blocked');
  });
});

describe('the item event route takes engagement only', () => {
  it('accepts play and peek, and refuses every judging event with 403 and nothing appended', async () => {
    const r = await rig(1);
    const ev = (e: object) => send(r, '/item/1/event', e);
    expect((await ev({ type: 'play', index: 1, mode: 'speech', eventId: 'p1' })).status).toBe(200);
    expect((await ev({ type: 'peek', index: 1, eventId: 'k1' })).status).toBe(200);
    for (const e of [
      { type: 'lineup', kept: [1], duds: [], order: [1, 2, 3] }, { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab', eventId: 'd1' },
      { type: 'refine', champion: 1, directions: [], like: null }, { type: 'ship', champion: 1 }, { type: 'abandon' },
      { type: 'round', n: 1, setId: 'a-02', candidates: [] }, { type: 'note', index: 1, unit: 0, text: 'hi' },
    ]) {
      const res = await ev(e);
      expect(res.status, e.type).toBe(403);
      expect(res.body.error.message).toMatch(/only play and peek/);
    }
    expect((await ev({ type: 'wat' })).status).toBe(400);
    expect(sessionTypes(r, 1)).toEqual(['play', 'peek']);
    expect(r.calls).toEqual([]);
    expect(readSet(r.b.project, 'a-01').picked).toBeUndefined();
  });

  it('records the peek in the child, so the page can show what changed and the log knows the owner looked', async () => {
    const r = await rig(1);
    await send(r, '/item/1/event', { type: 'peek', index: 2, eventId: 'k1' });
    const item = await api(r, '/item/1');
    expect(item.body.state.peeked).toEqual([2]);
    expect(item.body.candidates.find((c: any) => c.index === 2)).toHaveProperty('direction');
  });

  it('strikes pass through to the child, in its own draft', async () => {
    const r = await rig(1);
    const item = (await api(r, '/item/1')).body;
    expect(item.draft.lines.length).toBeGreaterThan(0);
    const line = item.draft.lines.find((l: any) => l.strikable);
    const struck = await send(r, '/item/1/strike', { ref: line.ref, reason: 'wrong-direction', draftHash: item.draft.hash, eventId: 'st1' });
    expect(struck.status, struck.text).toBe(200);
    expect(struck.body.state.draft.strikes).toHaveLength(1);
    expect((await api(r, '/item/1/strike/preview')).status).toBe(200);
  });
});

describe('choose and skip', () => {
  it('stages a choice in the queue log; the rail shows it picked with its letter and nothing is sent', async () => {
    const r = await rig(2);
    const res = await choose(r, 1, 2, [3]);
    expect(res.status, res.text).toBe(200);
    expect(res.body.state.queue).toMatchObject({ n: 1, status: 'picked', choice: { variant: 2, passes: [3] } });
    expect(res.body.rail.items[0]).toMatchObject({ status: 'picked', picked: expect.stringMatching(/^[A-C]$/) });
    expect(res.body.rail.queue.counts).toMatchObject({ picked: 1, waiting: 1, sent: 0 });
    expect(readQueueEvents(r.b.project, r.q.id).map(e => e.type)).toEqual(['choose']);
    expect(sessionTypes(r, 1)).toEqual([]);          // the child is untouched
    expect(r.calls).toEqual([]);                      // no set pick
    expect(readSet(r.b.project, 'a-01').picked).toBeUndefined();
    expect(projectRows(r.b.project)).toEqual([]);
  });

  it('keeping another draft replaces the choice; clearing returns the item to waiting', async () => {
    const r = await rig(1);
    await choose(r, 1, 1);
    expect((await choose(r, 1, 3)).body.state.queue.choice.variant).toBe(3);
    const cleared = await choose(r, 1, null, [2]);
    expect(cleared.body.state.queue).toMatchObject({ status: 'waiting', choice: { variant: null, passes: [2] } });
  });

  it('a retried eventId is recognised and appends nothing', async () => {
    const r = await rig(1);
    const body = { item: 1, variant: 2, passes: [], eventId: 'same' };
    expect((await send(r, '/choose', body)).body).not.toHaveProperty('duplicate');
    const again = await send(r, '/choose', body);
    expect(again.body.duplicate).toBe(true);
    expect(readQueueEvents(r.b.project, r.q.id)).toHaveLength(1);
    await skip(r, 1);
    expect(readQueueEvents(r.b.project, r.q.id)).toHaveLength(2);
  });

  it('skip moves the item to the end; choosing it later clears skipped but it stays where the skip put it', async () => {
    const r = await rig(3);
    let rail = (await skip(r, 1)).body.rail;
    expect(rail.order).toEqual([2, 3, 1]);
    expect(rail.items[0].status).toBe('skipped');
    expect(rail.current).toBe(2);
    rail = (await skip(r, 2)).body.rail;
    expect(rail.order).toEqual([3, 1, 2]);
    rail = (await choose(r, 1, 1)).body.rail;
    expect(rail.items[0].status).toBe('picked');
    expect(rail.order).toEqual([3, 1, 2]);
  });

  it('refuses a variant the set does not have, passes it does not have, and bad shapes, with nothing logged', async () => {
    const r = await rig(2);
    const bad: Array<[object, number]> = [
      [{ item: 1, variant: 9, passes: [], eventId: 'b1' }, 400], [{ item: 1, variant: 1, passes: [9], eventId: 'b2' }, 400],
      [{ item: 3, variant: 1, passes: [], eventId: 'b3' }, 400], [{ item: 0, variant: 1, passes: [], eventId: 'b4' }, 400],
      [{ item: 51, variant: 1, passes: [], eventId: 'b5' }, 400], [{ item: 1.5, variant: 1, passes: [], eventId: 'b6' }, 400],
      [{ item: '1', variant: 1, passes: [], eventId: 'b7' }, 400], [{ item: 1, variant: 0, passes: [], eventId: 'b8' }, 400],
      [{ item: 1, variant: -2, passes: [], eventId: 'b9' }, 400], [{ item: 1, variant: 1, passes: [1, 2, 3, 4, 5, 6, 7], eventId: 'b10' }, 400],
      [{ item: 1, variant: 1, passes: [], eventId: 'bad id' }, 400], [{ item: 1, variant: 1, passes: [] }, 400],
      [{ item: 1, variant: 1, passes: [], eventId: 'b11', extra: 1 }, 400], [{ item: 1, variant: 1, eventId: 'b12' }, 400],
      [{ item: 1, variant: 1, passes: 'x', eventId: 'b13' }, 400], [{ item: 1, variant: null, passes: [null], eventId: 'b14' }, 400],
    ];
    for (const [body, status] of bad) expect((await send(r, '/choose', body)).status, JSON.stringify(body)).toBe(status);
    expect((await send(r, '/choose', 'not json')).status).toBe(400);
    expect((await send(r, '/choose', '[]')).status).toBe(400);
    expect((await send(r, '/skip', { item: 3, eventId: 's1' })).status).toBe(400);
    expect((await send(r, '/skip', { item: 1 })).status).toBe(400);
    expect((await send(r, '/choose', JSON.stringify({ item: 1, variant: 1, passes: [], eventId: 'x', pad: 'x'.repeat(70_000) }))).status).toBe(413);
    expect(readQueueEvents(r.b.project, r.q.id)).toEqual([]);
  });

  it('refuses a draft that changed after it was sealed, and nothing is staged', async () => {
    const r = await rig(1);
    writeFileSync(variantFileOf(r.b, 'a-01', 2), 'something else entirely');
    const res = await choose(r, 1, 2);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/changed after it was sealed/);
    expect((await choose(r, 1, 1)).status).toBe(200); // another draft of the set is still fine
  });

  it('is refused once the queue is finished, and for a sent item', async () => {
    const r = await rig(2);
    await choose(r, 1, 2);
    await sendPicks(r);
    const sent = await choose(r, 1, 3);
    expect(sent.status).toBe(409);
    expect(sent.body.error.message).toMatch(/already sent/);
    expect((await skip(r, 1)).status).toBe(409);
    await send(r, '/finish', { eventId: 'f1' });
    expect((await choose(r, 2, 1)).status).toBe(409);
    expect((await skip(r, 2)).status).toBe(409);
  });

  it('caps the log: past 4,000 events choose and skip are 429 (the queue is full), finish still works', async () => {
    const r = await rig(1);
    const file = join(queueDir(r.b.project, r.q.id), 'events.jsonl');
    writeFileSync(file, Array.from({ length: 4000 }, (_, i) => JSON.stringify({ type: 'choose', item: 1, variant: 1, passes: [], at: 'x', seq: i + 1 })).join('\n') + '\n');
    const res = await choose(r, 1, 2);
    expect(res.status).toBe(429);
    expect(res.body.error.message).toMatch(/queue is full/);
    expect((await skip(r, 1)).status).toBe(429);
    expect((await send(r, '/finish', { eventId: 'f1' })).status).toBe(200);
  });
});

describe('send', () => {
  it('with nothing chosen is 409 and records nothing', async () => {
    const r = await rig(2);
    await skip(r, 1);
    const res = await sendPicks(r);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/nothing is chosen/);
    expect(readQueueEvents(r.b.project, r.q.id).map(e => e.type)).toEqual(['skip']);
    expect(r.calls).toEqual([]);
  });

  it('records the pick per set exactly as a single ship does: one lineup, one ship, one set pick, the verdict rows and the reveal', async () => {
    const r = await rig(3);
    await choose(r, 1, 2, [1]);
    await choose(r, 3, 3);
    await skip(r, 2);
    const res = await sendPicks(r, 'send-a');
    expect(res.status, res.text).toBe(200);
    expect(res.body.results).toEqual([{ n: 1, status: 'sent' }, { n: 3, status: 'sent' }]);
    expect(res.body.rail.queue.counts).toMatchObject({ sent: 2, skipped: 1, picked: 0 });
    expect(res.body.rail.items.map((i: any) => i.status)).toEqual(['sent', 'skipped', 'sent']);
    expect(r.calls.map(c => c.slice(0, 5))).toEqual([['set', 'pick', 'a-01', '--pick', '2'], ['set', 'pick', 'a-03', '--pick', '3']]);
    expect(sessionTypes(r, 1)).toEqual(['lineup', 'ship']);
    expect(sessionTypes(r, 3)).toEqual(['lineup', 'ship']);
    expect(sessionTypes(r, 2)).toEqual([]);
    const lineup = readEvents(r.b.project, sessionOf(r, 1))[0] as any;
    expect(lineup).toMatchObject({ kept: [2], duds: [1], eventId: 'send-a-1-l' });
    expect(readEvents(r.b.project, sessionOf(r, 1))[1]).toMatchObject({ champion: 2, eventId: 'send-a-1-s' });
    expect(readSet(r.b.project, 'a-01').picked).toBe(2);
    expect(readSet(r.b.project, 'a-03').picked).toBe(3);
    expect(readSet(r.b.project, 'a-02').picked).toBeUndefined();
    // the same rows a CLI pick writes: one per loser, weighted, in the project and the per-user log
    expect(projectRows(r.b.project).filter(x => x.set === 'a-01').map(x => [x.kind, x.winner.index, x.loser.index])).toEqual([['pick', 2, 1], ['pick', 2, 3]]);
    expect(globalRows()).toHaveLength(projectRows(r.b.project).length);
    expect(readQueueEvents(r.b.project, r.q.id).filter(e => e.type === 'send')).toEqual([expect.objectContaining({ sendId: 'send-a', items: [1, 3] })]);
  });

  it('the page gets the sealed reveal for a sent item only: 404 until then, and no response before holds a prediction', async () => {
    const r = await rig(2);
    expect((await api(r, '/item/1/reveal')).status).toBe(404);
    await choose(r, 1, 2);
    const staged = [await api(r, ''), await api(r, '/item/1'), await api(r, '/item/2'), await api(r, '/item/1/reveal')];
    for (const x of staged) expect(x.text, x.status.toString()).not.toMatch(/SEALED|shortlistHit|"why"|"prediction"/);
    await sendPicks(r);
    const reveal = await api(r, '/item/1/reveal');
    expect(reveal.status).toBe(200);
    expect(reveal.body).toMatchObject({ picked: 2, matched: true, prediction: { pick: 2, why: 'SEALED-a-01' } });
    expect((await api(r, '/item/2/reveal')).status).toBe(404); // the next set is still sealed
    expect((await api(r, '/item/2')).text).not.toMatch(/SEALED/);
  });

  it('sending twice: the same sendId again changes nothing and answers the same; a new send with nothing chosen is 409', async () => {
    const r = await rig(2);
    await choose(r, 1, 1);
    const first = await sendPicks(r, 'once');
    expect(first.body.results).toEqual([{ n: 1, status: 'sent' }]);
    const again = await sendPicks(r, 'once');
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ duplicate: true, results: [{ n: 1, status: 'sent' }] });
    expect(r.calls).toHaveLength(1);
    expect(sessionTypes(r, 1)).toEqual(['lineup', 'ship']);
    expect(readQueueEvents(r.b.project, r.q.id).filter(e => e.type === 'send')).toHaveLength(1);
    expect((await sendPicks(r, 'twice')).status).toBe(409);
    expect(projectRows(r.b.project).filter(x => x.set === 'a-01')).toHaveLength(2);
  });

  it('two sends at once serialise: each pick is recorded once', async () => {
    const r = await rig(3);
    await choose(r, 1, 1); await choose(r, 2, 2);
    const [a, b] = await Promise.all([sendPicks(r, 'race-a'), sendPicks(r, 'race-b')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(r.calls).toHaveLength(2);
    expect(projectRows(r.b.project).filter(x => x.set === 'a-01')).toHaveLength(2);
  });

  it('a blocked item does not stop the rest; its message is shown, and choosing again sends it', async () => {
    const r = await rig(3);
    await choose(r, 1, 1); await choose(r, 2, 2); await choose(r, 3, 3);
    writeFileSync(variantFileOf(r.b, 'a-02', 2), 'edited after sealing');
    const res = await sendPicks(r);
    expect(res.body.results).toEqual([{ n: 1, status: 'sent' }, { n: 2, status: 'blocked', message: expect.stringMatching(/Draft 2 changed after it was sealed/) }, { n: 3, status: 'sent' }]);
    expect(res.body.rail.items[1]).toMatchObject({ status: 'blocked', message: expect.stringMatching(/changed after it was sealed/) });
    expect(readSet(r.b.project, 'a-02').picked).toBeUndefined();
    expect(sessionTypes(r, 2)).toEqual([]);
    // the writer restores the file; the owner chooses again and sends again
    writeFileSync(variantFileOf(r.b, 'a-02', 2), readFileSync(variantFileOf(r.b, 'a-01', 2), 'utf8'));
    expect((await choose(r, 2, 3)).body.rail.items[1].status).toBe('picked');
    const retry = await sendPicks(r);
    expect(retry.body.results).toEqual([{ n: 2, status: 'sent' }]);
    expect(readSet(r.b.project, 'a-02').picked).toBe(3);
  });

  it('a pick the CLI refuses blocks only that item, with the CLI\'s words and no paths', async () => {
    const r = await rig(2);
    await choose(r, 1, 1); await choose(r, 2, 2);
    const refuse: RunProse = async (args, o) => {
      if (args[2] === 'a-01') throw new ProseError('E_CONFLICT', `variant 3 changed in ${o.cwd}`, { hint: 'Restore the file' });
      return pickStub([])(args, o);
    };
    const { info } = await startServer(servers, { projects: [r.b.project], runProse: refuse });
    const res = await http(info, `/api/queue/${r.q.id}/send`, { body: JSON.stringify({ sendId: 's1' }) });
    expect(res.body.results[0]).toMatchObject({ n: 1, status: 'blocked' });
    expect(res.body.results[0].message).toContain('Restore the file');
    expect(res.body.results[0].message).not.toContain(r.b.project);
    expect(res.body.results[1]).toEqual({ n: 2, status: 'sent' });
    expect(readSet(r.b.project, 'a-01').picked).toBeUndefined();
  });

  it('retrying after a crash between the lineup and the ship finishes the job without a second lineup', async () => {
    const r = await rig(1);
    await choose(r, 1, 2);
    // the first attempt got as far as the lineup (the server died before the ship)
    let first = true;
    const dying: RunProse = async (args, o) => { if (first) { first = false; throw new ProseError('E_SERVER', 'the prose command failed'); } return pickStub(r.calls)(args, o); };
    const { info } = await startServer(servers, { projects: [r.b.project], runProse: dying });
    const one = await http(info, `/api/queue/${r.q.id}/send`, { body: JSON.stringify({ sendId: 's1' }) });
    expect(one.body.results[0]).toMatchObject({ status: 'blocked' });
    expect(sessionTypes(r, 1)).toEqual(['lineup']);
    const two = await http(info, `/api/queue/${r.q.id}/send`, { body: JSON.stringify({ sendId: 's2' }) });
    expect(two.body.results).toEqual([{ n: 1, status: 'sent' }]);
    expect(sessionTypes(r, 1)).toEqual(['lineup', 'ship']);
    expect(readSet(r.b.project, 'a-01').picked).toBe(2);
  });

  it('a set picked from the CLI outside the queue shows as sent; a send skips it and the rest still go', async () => {
    const r = await rig(3);
    await choose(r, 1, 1); await choose(r, 2, 2);
    recordPick(r.b.project, readSet(r.b.project, 'a-01'), 3, {}); // the agent or the owner ran `set pick` meanwhile
    const rail = (await api(r, '')).body;
    expect(rail.items[0]).toMatchObject({ status: 'sent', via: 'cli', picked: expect.stringMatching(/^[A-C]$/) });
    expect(rail.queue.counts.sent).toBe(1);
    const res = await sendPicks(r);
    expect(res.body.results).toEqual([{ n: 2, status: 'sent' }]);
    expect(sessionTypes(r, 1)).toEqual([]); // the page never touched that child
    expect(readSet(r.b.project, 'a-01').picked).toBe(3);
    expect((await choose(r, 1, 1)).status).toBe(409);
  });

  it('a set picked from the CLI while the send runs is blocked with its reason, and the other picks are kept', async () => {
    const r = await rig(2);
    await choose(r, 1, 1); await choose(r, 2, 2);
    const racing: RunProse = async (args, o) => {
      if (args[2] === 'a-01') recordPick(r.b.project, readSet(r.b.project, 'a-01'), 3, {}); // someone else picks first
      return pickStub(r.calls)(args, o);
    };
    const { info } = await startServer(servers, { projects: [r.b.project], runProse: racing });
    const res = await http(info, `/api/queue/${r.q.id}/send`, { body: JSON.stringify({ sendId: 's1' }) });
    expect(res.body.results[0]).toMatchObject({ n: 1, status: 'blocked', message: expect.stringMatching(/already picked/) });
    expect(res.body.results[1]).toEqual({ n: 2, status: 'sent' });
    expect(readSet(r.b.project, 'a-01').picked).toBe(3); // exactly one pick recorded for that set
    expect(projectRows(r.b.project).filter(x => x.set === 'a-01')).toHaveLength(2);
  });

  it('a set deleted mid-queue is blocked in the rail and cannot be chosen or sent; the others go', async () => {
    const r = await rig(3);
    await choose(r, 2, 1);
    rmSync(setDir(r.b.project, 'a-03'), { recursive: true, force: true });
    const rail = (await api(r, '')).body;
    expect(rail.items[2]).toMatchObject({ status: 'blocked', message: expect.stringMatching(/no longer available/) });
    expect((await choose(r, 3, 1)).status).toBe(409);
    const res = await sendPicks(r);
    expect(res.body.results).toEqual([{ n: 2, status: 'sent' }]);
    expect((await api(r, '/item/3')).status).toBe(200); // the page can still say what happened
  });

  it('a draft edited after choosing is blocked at send, not recorded', async () => {
    const r = await rig(1);
    await choose(r, 1, 3);
    writeFileSync(variantFileOf(r.b, 'a-01', 3), 'changed since');
    const res = await sendPicks(r);
    expect(res.body.results[0]).toMatchObject({ status: 'blocked' });
    expect(r.calls).toEqual([]);
    expect(projectRows(r.b.project)).toEqual([]);
  });

  it('a set opened with --no-predict is picked with --no-predict and reveals nothing', async () => {
    const b = seedBatch(2, { predict: k => k === 0 });
    const calls: string[][] = [];
    const { planOpen } = await import('../src/reading/open.ts');
    const { createQueue } = await import('../src/commands/reading-queue.ts');
    const q = createQueue(b.project, b.sets.map(s => planOpen(b.project, s, false)), '');
    const { info } = await startServer(servers, { projects: [b.project], runProse: pickStub(calls) });
    for (const n of [1, 2]) await http(info, `/api/queue/${q.id}/choose`, { body: JSON.stringify({ item: n, variant: 1, passes: [], eventId: `c${n}` }) });
    const res = await http(info, `/api/queue/${q.id}/send`, { body: JSON.stringify({ sendId: 's' }) });
    expect(res.body.results.map((x: any) => x.status)).toEqual(['sent', 'sent']);
    expect(calls[0]).not.toContain('--no-predict');
    expect(calls[1]).toContain('--no-predict');
    const reveal = await http(info, `/api/queue/${q.id}/item/2/reveal`);
    expect(reveal.body).toMatchObject({ matched: false, prediction: null, note: expect.stringMatching(/No prediction was sealed/) });
  });
});

describe('finish', () => {
  it('records the finish and abandons only the unsent children; picks already sent stay, the sets stay unpicked and sealed', async () => {
    const r = await rig(3);
    await choose(r, 1, 1);
    await sendPicks(r);
    await choose(r, 2, 2); // staged, never sent
    const res = await send(r, '/finish', { eventId: 'f1' });
    expect(res.status).toBe(200);
    expect(res.body.rail.queue).toMatchObject({ stage: 'finished', counts: { sent: 1, ended: 2 } });
    expect(sessionTypes(r, 1)).toEqual(['lineup', 'ship']);
    expect(sessionTypes(r, 2)).toEqual(['abandon']);
    expect(sessionTypes(r, 3)).toEqual(['abandon']);
    expect(readSet(r.b.project, 'a-02').picked).toBeUndefined();
    expect(existsSync(join(setDir(r.b.project, 'a-02'), 'prediction.json'))).toBe(true);
    expect((await api(r, '/item/2/reveal')).status).toBe(404);
    // a retry is harmless, and sending after a finish is refused
    expect((await send(r, '/finish', { eventId: 'f1' })).status).toBe(200);
    expect(readQueueEvents(r.b.project, r.q.id).filter(e => e.type === 'finish')).toHaveLength(1);
    expect((await sendPicks(r)).status).toBe(409);
  });

  it('sweeps the children again on a retry, when the first attempt died after recording the finish', async () => {
    const r = await rig(2);
    appendQueueEvent(r.b.project, r.q.id, { type: 'finish', eventId: 'f1' }); // recorded, children not yet abandoned
    expect((await api(r, '')).body.items.map((i: any) => i.status)).toEqual(['ended', 'ended']); // the log is the truth
    await send(r, '/finish', { eventId: 'f1' });
    expect(sessionTypes(r, 1)).toEqual(['abandon']);
    expect(sessionTypes(r, 2)).toEqual(['abandon']);
  });
});

describe('the log is the truth: a restart, the agent, and another process', () => {
  it('a server restarted mid-queue shows the same staged choices, skips and order', async () => {
    const r = await rig(4);
    await choose(r, 1, 2, [1]); await skip(r, 2); await choose(r, 3, 3);
    const before = (await api(r, '')).body;
    await r.server.close();
    const again = await startServer(servers, { projects: [r.b.project], runProse: pickStub(r.calls) });
    const after = (await http(again.info, `/api/queue/${r.q.id}`)).body;
    expect(after).toEqual(before);
    expect(after.order).toEqual([1, 3, 4, 2]);
    const item = (await http(again.info, `/api/queue/${r.q.id}/item/1`)).body;
    expect(item.queue.choice).toEqual({ variant: 2, passes: [1] });
  });

  it('a send interrupted by a restart is finished by sending again: nothing is recorded twice', async () => {
    const r = await rig(3);
    await choose(r, 1, 1); await choose(r, 2, 2); await choose(r, 3, 3);
    // item 1 was sent and the server died before item 2 (simulated: the first server's runProse fails from the second pick on)
    let n = 0;
    const flaky: RunProse = async (args, o) => { if (++n > 1) throw new ProseError('E_SERVER', 'the prose command failed'); return pickStub(r.calls)(args, o); };
    const first = await startServer(servers, { projects: [r.b.project], runProse: flaky });
    const one = await http(first.info, `/api/queue/${r.q.id}/send`, { body: JSON.stringify({ sendId: 's1' }) });
    expect(one.body.results.map((x: any) => x.status)).toEqual(['sent', 'blocked', 'blocked']);
    await first.server.close();
    const second = await startServer(servers, { projects: [r.b.project], runProse: pickStub(r.calls) });
    const two = await http(second.info, `/api/queue/${r.q.id}/send`, { body: JSON.stringify({ sendId: 's2' }) });
    expect(two.body.results.map((x: any) => [x.n, x.status])).toEqual([[2, 'sent'], [3, 'sent']]);
    for (const set of ['a-01', 'a-02', 'a-03']) expect(projectRows(r.b.project).filter(x => x.set === set), set).toHaveLength(2);
    expect(sessionTypes(r, 1)).toEqual(['lineup', 'ship']);
  });

  it('a queue closed by the agent reads as closed on the page and refuses choices', async () => {
    const r = await rig(2);
    appendQueueEvent(r.b.project, r.q.id, { type: 'close' });
    const rail = (await api(r, '')).body;
    expect(rail.queue.stage).toBe('closed');
    expect(rail.items.map((i: any) => i.status)).toEqual(['ended', 'ended']);
    expect((await choose(r, 1, 1)).status).toBe(409);
  });

  it('a session shipped from its own link (the escape hatch) shows as sent in the queue', async () => {
    const r = await rig(2);
    const own = sessionOf(r, 1);
    await http(r.info, `/api/session/${own}/event`, { body: JSON.stringify({ type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3], eventId: 'l1' }) });
    for (const [a, b, o] of [[1, 2, 'a'], [1, 3, 'a'], [2, 3, 'a']] as const) await http(r.info, `/api/session/${own}/event`, { body: JSON.stringify({ type: 'duel', a, b, outcome: o, position: 'ab', eventId: `d${a}${b}` }) });
    // the shortlist's champion is picked in the single-set flow
    const state = (await http(r.info, `/api/session/${own}`)).body.state;
    await http(r.info, `/api/session/${own}/event`, { body: JSON.stringify({ type: 'ship', champion: state.champion, eventId: 'sh' }) });
    const rail = (await api(r, '')).body;
    expect(rail.items[0]).toMatchObject({ status: 'sent', picked: expect.stringMatching(/^[A-C]$/) });
    expect(rail.queue.cursor).toBe(1);
  });
});

describe('the server stays responsive', () => {
  it('while a choose waits on the queue lock, other requests are answered at once', async () => {
    const r = await rig(2);
    const log = join(tmp('prose-hold-'), 'hold.log');
    const releaseFile = `${log}.release`;
    const child = spawn(process.execPath, ['tests/lock-holder.mjs', r.b.project, r.q.id, 'holder', '30000', '200', log, JSON.stringify({ kind: 'queue', releaseFile })], { stdio: 'ignore', cwd: join(import.meta.dirname, '..') });
    holders.push(child);
    const deadline = Date.now() + 10_000;
    while (!(existsSync(log) && readFileSync(log, 'utf8').includes('enter'))) { if (Date.now() > deadline) throw new Error('no lock'); await new Promise(res => setTimeout(res, 25)); }
    const pending = choose(r, 1, 1);
    let settled = false;
    void pending.then(() => { settled = true; });
    try {
      // The holder is released by us, so scheduler load cannot make it expire before this assertion.
      expect((await api(r, '')).status).toBe(200);
      expect((await http(r.info, '/api/health')).status).toBe(200);
      expect(settled).toBe(false);
      expect(readQueueEvents(r.b.project, r.q.id)).toHaveLength(0);
    } finally { writeFileSync(releaseFile, 'release'); }
    expect((await pending).status).toBe(200); // it waited for the lock, then wrote
    expect(readQueueEvents(r.b.project, r.q.id)).toHaveLength(1);
  }, 30_000);
});

describe('with the real CLI', () => {
  it('Send runs the real `prose set pick`: the pick rows, the reveal and the set marker are the CLI\'s own', async () => {
    const r = await rig(2, { real: true });
    await choose(r, 1, 2); await choose(r, 2, 3);
    const res = await sendPicks(r);
    expect(res.status, res.text).toBe(200);
    expect(res.body.results).toEqual([{ n: 1, status: 'sent' }, { n: 2, status: 'sent' }]);
    expect(readSet(r.b.project, 'a-01')).toMatchObject({ picked: 2 });
    expect(readSet(r.b.project, 'a-02')).toMatchObject({ picked: 3 });
    expect(projectRows(r.b.project).map(x => [x.set, x.winner.index])).toEqual([['a-01', 2], ['a-01', 2], ['a-02', 3], ['a-02', 3]]);
    expect(existsSync(join(setDir(r.b.project, 'a-01'), 'reveal.json'))).toBe(true);
    expect(readSession(r.b.project, sessionOf(r, 1)).queue).toBe(r.q.id);
    expect((await api(r, '/item/1/reveal')).body).toMatchObject({ matched: true });
    expect((await api(r, '/item/2/reveal')).body).toMatchObject({ matched: false, prediction: { pick: 2, shortlistHit: true } });
  }, 60_000);
});
