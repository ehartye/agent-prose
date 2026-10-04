// "None of these" end to end through the reading server (the real CLI behind it) and the agent's side (reading wait, status, list):
// a single-set session, a batch with picks, skips and send-backs, tampered requests, and the sealed reveal staying unscored.
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { globalTasteDir, projectTasteDir } from '../src/owner/paths.ts';
import { recordPick } from '../src/owner/pick.ts';
import { readSet } from '../src/owner/sets.ts';
import { readVerdicts } from '../src/owner/verdicts.ts';
import { ReadingServer, type ServerInfo } from '../src/reading/server.ts';
import { readEvents } from '../src/reading/session.ts';
import { useTempHome, useTmp } from './owner-helpers.ts';
import { makeQueue, seedBatch, type Batch } from './reading-batch-helpers.ts';
import { TOKEN, globalRows, http, post, projectRows, seed, startServer, type Seed } from './reading-helpers.ts';
import { ROOT } from './helpers.ts';

useTmp();
useTempHome();
const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });

const cli = join(ROOT, 'scripts', 'prose.mjs');
const parse = (s: string) => { try { return JSON.parse(s.trim().split('\n').pop()!); } catch { return null; } };
function prose(...args: string[]) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: process.env, timeout: 90_000 });
  return { status: r.status, out: parse(r.stdout), err: parse(r.stderr)?.error, stdout: r.stdout, stderr: r.stderr };
}
let k = 0;
const eid = () => `e-${++k}-${Date.now()}`;
const noneLogs = (project: string) => [readVerdicts(join(projectTasteDir(project), 'verdicts.jsonl')).none, readVerdicts(join(globalTasteDir(), 'verdicts.jsonl')).none];

describe('a single-set session: the none event', () => {
  async function rig(over: { predict?: boolean } = {}): Promise<{ s: Seed; info: ServerInfo }> {
    const s = seed(over);
    const { info } = await startServer(servers, { projects: [s.project] });
    return { s, info };
  }
  const none = (info: ServerInfo, body: object = {}) => post(info, 'read-1', { type: 'none', closest: 2, reasons: ['too-similar', 'wrong-direction'], note: ' all three open the same way ', eventId: eid(), ...body });

  it('sends the set back: the session ends, the set closes, one none row is logged and nothing is a pick, a duel or taste data', async () => {
    const { s, info } = await rig();
    const res = await none(info);
    expect(res.status, res.text).toBe(200);
    expect(res.body.state.state).toMatchObject({ stage: 'sentBack', shipped: null, sentBack: { closest: 2, reasons: ['too-similar', 'wrong-direction'], note: 'all three open the same way' } });
    expect(res.body.state.reveal).toEqual({ shipped: false, sentBack: true });
    expect(readSet(s.project, 'demo')).toMatchObject({ sentBack: { closest: 2, reasons: ['too-similar', 'wrong-direction'], note: 'all three open the same way', shown: [1, 2, 3] } });
    expect(readSet(s.project, 'demo').picked).toBeUndefined();
    expect(projectRows(s.project)).toEqual([]);
    expect(globalRows()).toEqual([]);
    for (const log of noneLogs(s.project)) expect(log).toHaveLength(1);
    expect(existsSync(join(globalTasteDir(), 'predictions.jsonl'))).toBe(false);
    expect(readEvents(s.project, 'read-1').map(e => e.type)).toEqual(['none']);
  });

  it('keeps the sealed prediction sealed until the send-back, then reveals it unscored ("No pick to compare")', async () => {
    const { info } = await rig();
    const before = await http(info, '/api/session/read-1');
    expect(before.text).not.toMatch(/SEALED-REASON/);
    expect((await http(info, '/api/session/read-1/reveal')).status).toBe(404);
    await none(info);
    const reveal = await http(info, '/api/session/read-1/reveal');
    expect(reveal.status).toBe(200);
    expect(reveal.body).toMatchObject({ outcome: 'none', picked: null, matched: null, prediction: { pick: 2, shortlist: [3], why: 'SEALED-REASON', unscored: true } });
    expect(reveal.body.prediction).not.toHaveProperty('hit');
    expect(reveal.body.prediction).not.toHaveProperty('shortlistHit');
    expect(reveal.body).not.toHaveProperty('model.hit');
  });

  it('with no sealed prediction the reveal says there was nothing to show', async () => {
    const { info } = await rig({ predict: false });
    await none(info);
    const reveal = await http(info, '/api/session/read-1/reveal');
    expect(reveal.body).toMatchObject({ outcome: 'none', prediction: null, note: expect.stringMatching(/No prediction was sealed/) });
  });

  it('a retry with the same event id is a duplicate: one row, one event', async () => {
    const { s, info } = await rig();
    const body = { type: 'none', closest: null, reasons: ['other'], eventId: 'retry-1' };
    expect((await post(info, 'read-1', body)).body.ok).toBe(true);
    const again = await post(info, 'read-1', body);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(noneLogs(s.project).map(l => l.length)).toEqual([1, 1]);
    expect(readEvents(s.project, 'read-1')).toHaveLength(1);
  });

  it('takes no further event once sent back, and a set closed that way cannot be picked or sent back again', async () => {
    const { s, info } = await rig();
    await none(info);
    for (const event of [{ type: 'lineup', kept: [1], duds: [], order: [1, 2, 3] }, { type: 'ship', champion: 1 }, { type: 'none', closest: null, reasons: ['other'] }, { type: 'abandon' }]) {
      const res = await post(info, 'read-1', { ...event, eventId: eid() });
      expect(res.status, JSON.stringify(event)).toBe(409);
    }
    const dup = prose('set', 'pick', 'demo', '--pick', '1', '--no-predict', '--dir', s.project);
    expect(dup.err.code).toBe('E_CONFLICT');
    expect(readEvents(s.project, 'read-1').map(e => e.type)).toEqual(['none']);
    expect((await http(info, '/api/session/read-1/strike', { body: '{}' })).status).toBeGreaterThanOrEqual(400);
  });

  it('refuses tampered requests with nothing written: unknown reason, no feedback, long note, control characters, bad closest, extra fields', async () => {
    const { s, info } = await rig();
    const bad: object[] = [
      { reasons: ['meh'] }, { reasons: [] }, { reasons: [], note: '   ' }, { reasons: ['other'], note: 'x'.repeat(1001) }, { reasons: ['other'], note: 'a\u0000b' },
      { reasons: ['other'], closest: 9 }, { reasons: ['other'], closest: 0 }, { reasons: ['other'], closest: 1.5 }, { reasons: 'other' }, { reasons: ['other'], extra: 1 },
      { reasons: ['other', 'other', 'other', 'other', 'other', 'other', 'other', 'other', 'other'] },
    ];
    for (const body of bad) {
      const res = await post(info, 'read-1', { type: 'none', closest: null, eventId: eid(), ...body });
      expect([400, 409], JSON.stringify(body)).toContain(res.status);
      expect(res.body.error, JSON.stringify(body)).toBeDefined();
    }
    expect(readSet(s.project, 'demo').sentBack).toBeUndefined();
    expect(readEvents(s.project, 'read-1')).toEqual([]);
    for (const log of noneLogs(s.project)) expect(log).toEqual([]);
  });

  it('refuses when the set was picked outside the page meanwhile, and writes no event', async () => {
    const { s, info } = await rig();
    recordPick(s.project, readSet(s.project, 'demo'), 1, {});
    const res = await none(info);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already picked/);
    expect(readEvents(s.project, 'read-1')).toEqual([]);
  });

  it('is accepted in the duel and refine stages too, but not while the writer is making a round', async () => {
    const { info } = await rig();
    expect((await post(info, 'read-1', { type: 'lineup', kept: [1, 2], duds: [3], order: [1, 2, 3], eventId: eid() })).status).toBe(200);
    expect((await none(info, { closest: 1 })).body.state.state.stage).toBe('sentBack'); // the duel stage
    const b = await rig();
    await post(b.info, 'read-1', { type: 'lineup', kept: [2], duds: [], order: [1, 2, 3], eventId: eid() });
    await post(b.info, 'read-1', { type: 'refine', champion: 2, directions: [], like: null, eventId: eid() });
    const res = await none(b.info);
    expect(res.status).toBe(409); // waiting for the writer
  });

  it('stores a note full of markup as plain text, in the payload and in the reveal', async () => {
    const { s, info } = await rig();
    const note = '<img src=x onerror=alert(1)> <script>alert(2)</script>';
    const res = await none(info, { note });
    expect(res.body.state.state.sentBack.note).toBe(note);
    expect(readSet(s.project, 'demo').sentBack?.note).toBe(note);
  });

  it('the agent side: wait returns the outcome none with the feedback and the unscored reveal; status and list show it', async () => {
    const { s, info } = await rig();
    await none(info);
    const w = prose('reading', 'wait', '--id', 'read-1', '--timeout', '5', '--dir', s.project);
    expect(w.status, w.stderr).toBe(0);
    expect(w.out).toMatchObject({
      event: 'none', outcome: 'none', set: 'demo', closest: 2, reasons: ['too-similar', 'wrong-direction'], reasonWords: ['Too similar to each other', 'Wrong direction'], note: 'all three open the same way',
      reveal: { outcome: 'none', prediction: { pick: 2, unscored: true } }, next: expect.stringMatching(/set new --redo demo/),
    });
    const st = prose('reading', 'status', '--id', 'read-1', '--dir', s.project);
    expect(st.out).toMatchObject({ stage: 'sentBack', shipped: null, sentBack: { closest: 2, reasons: ['too-similar', 'wrong-direction'], note: 'all three open the same way' }, reveal: { outcome: 'none' } });
    expect(prose('reading', 'list', '--dir', s.project).out.sessions[0]).toMatchObject({ id: 'read-1', stage: 'sentBack' });
    expect(prose('reading', 'close', '--id', 'read-1', '--dir', s.project).out).toMatchObject({ closed: false, stage: 'sentBack' });
  });

  it('the redo set shows what the owner said last time in its payload', async () => {
    const { s, info } = await rig();
    await none(info);
    const out = prose('set', 'new', '--redo', 'demo', '--id', 'again', '--dir', s.project);
    expect(out.status, out.stderr).toBe(0);
    const set = readSet(s.project, 'again');
    [1, 2, 3].forEach(i => writeFileSync(join(s.project, '.agent-prose', 'sets', 'again', set.variants[i - 1].file), readFileSync(join(s.project, 't.md'), 'utf8').replace('We built', `We rebuilt ${i}`)));
    const pred = prose('predict', '--set', 'again', '--pick', '2', '--why', 'x', '--dir', s.project);
    expect(pred.status, pred.stderr).toBe(0);
    const open = prose('reading', 'open', '--set', 'again', '--local', '--dir', s.project);
    expect(open.status, open.stderr).toBe(0);
    const link = new URL(open.out.url);
    const payload = await http({ ...info, port: Number(link.port) }, link.pathname.replace('/s/', '/api/session/'), { token: link.searchParams.get('t') });
    expect(payload.body.session.lastFeedback).toEqual({ reasons: ['Too similar to each other', 'Wrong direction'], note: 'all three open the same way' });
    prose('serve', '--stop');
  }, 60_000);
});

describe('a batch: staged send-backs', () => {
  async function rig(n: number) {
    const b = seedBatch(n);
    const q = makeQueue(b);
    const { info } = await startServer(servers, { projects: [b.project] });
    const api = (path: string, opts: { token?: string | null } = {}) => http(info, `/api/queue/${q.id}${path}`, opts);
    const send = (path: string, body: unknown, opts: { token?: string | null } = {}) => http(info, `/api/queue/${q.id}${path}`, { body: JSON.stringify(body), ...opts });
    const back = (item: number, over: object = {}) => send('/sendback', { item, closest: 2, reasons: ['wrong-direction'], note: 'no', eventId: eid(), ...over });
    const choose = (item: number, variant: number | null, passes: number[] = []) => send('/choose', { item, variant, passes, eventId: eid() });
    const skip = (item: number) => send('/skip', { item, eventId: eid() });
    const sendAll = (sendId = `send-${eid()}`) => send('/send', { sendId });
    return { b, q, info, api, send, back, choose, skip, sendAll };
  }
  const sess = (r: { b: Batch; q: { items: Array<{ sessionId: string }> } }, n: number) => readEvents(r.b.project, r.q.items[n - 1].sessionId).map(e => e.type);

  it('staging sends nothing: the rail says so in words, the set stays open and no row is written', async () => {
    const r = await rig(3);
    const res = await r.back(2);
    expect(res.status, res.text).toBe(200);
    expect(res.body.rail.queue.counts).toMatchObject({ back: 1, waiting: 2, sentBack: 0, sent: 0 });
    expect(res.body.rail.items[1]).toMatchObject({ n: 2, status: 'back', reasons: ['Wrong direction'] });
    expect(res.body.state.queue).toMatchObject({ n: 2, status: 'back', back: { closest: 2, reasons: ['wrong-direction'], note: 'no' }, choice: { variant: null, passes: [] } });
    expect(sess(r, 2)).toEqual([]);
    expect(readSet(r.b.project, 'a-02').sentBack).toBeUndefined();
    expect(noneLogs(r.b.project).map(l => l.length)).toEqual([0, 0]);
    expect((await r.api('')).text).not.toMatch(/SEALED/);
  });

  it('a choice replaces a staged send-back, a send-back replaces a staged choice, and a skip drops either', async () => {
    const r = await rig(2);
    await r.back(1);
    expect((await r.choose(1, 3)).body.rail.items[0]).toMatchObject({ status: 'picked' });
    expect((await r.api('/item/1')).body.queue).toMatchObject({ back: null, choice: { variant: 3 } });
    const swapped = await r.back(1);
    expect(swapped.body.rail.items[0].status).toBe('back');
    expect(swapped.body.state.queue.choice).toEqual({ variant: null, passes: [] });
    expect((await r.skip(1)).body.rail.items[0].status).toBe('skipped');
    expect((await r.api('/item/1')).body.queue.back).toBeNull();
    await r.back(2);
    expect((await r.choose(2, null)).body.rail.items[1].status).toBe('waiting'); // clearing the choice clears the send-back
  });

  it('send applies the none write per sent-back item; the item can no longer change; the session and the set are closed', async () => {
    const r = await rig(2);
    await r.back(1, { closest: null, reasons: ['too-long', 'premise-wrong'], note: undefined });
    const res = await r.sendAll();
    expect(res.status, res.text).toBe(200);
    expect(res.body.results).toEqual([{ n: 1, status: 'sent' }]);
    expect(res.body.rail.items[0]).toMatchObject({ status: 'sentBack', reasons: ['Too long', 'The premise is wrong'] });
    expect(res.body.rail.queue.counts).toMatchObject({ sentBack: 1, back: 0, waiting: 1 });
    expect(sess(r, 1)).toEqual(['none']);
    expect(readSet(r.b.project, 'a-01').sentBack).toMatchObject({ closest: null, reasons: ['too-long', 'premise-wrong'] });
    expect(res.body.rail.queue.cursor).toBe(1);
    // nothing on the item can change after the send
    for (const change of [r.choose(1, 1), r.skip(1), r.back(1)]) {
      const c = await change;
      expect(c.status).toBe(409);
      expect(c.body.error.message).toMatch(/already sent back/);
    }
    expect((await r.send('/item/1/event', { type: 'ship', champion: 1, eventId: eid() })).status).toBe(403);
    expect((await r.send('/item/1/event', { type: 'none', closest: null, reasons: ['other'], eventId: eid() })).status).toBe(403);
    expect(sess(r, 1)).toEqual(['none']);
    // the item shows its reveal, unscored
    const rev = await r.api('/item/1/reveal');
    expect(rev.body).toMatchObject({ outcome: 'none', prediction: { pick: 2, unscored: true } });
    expect((await r.api('/item/2/reveal')).status).toBe(404);
    expect((await r.api('/item/2')).text).not.toMatch(/SEALED/);
  });

  it('a mix of picks, a skip and send-backs: each is applied once, a skipped item stays in the queue, and a retried send writes nothing twice', async () => {
    const r = await rig(5);
    await r.choose(1, 2, [3]);
    await r.back(2, { closest: 1, reasons: ['too-similar'] });
    await r.skip(3);
    await r.back(4, { closest: null, reasons: ['other'], note: 'x' });
    // item 5 waits
    const sendId = 'send-mix-1';
    const res = await r.sendAll(sendId);
    expect(res.body.results).toEqual([{ n: 1, status: 'sent' }, { n: 2, status: 'sent' }, { n: 4, status: 'sent' }]);
    expect(res.body.rail.queue.counts).toMatchObject({ sent: 1, sentBack: 2, skipped: 1, waiting: 1, picked: 0, back: 0 });
    expect(res.body.rail.queue.stage).toBe('open'); // a skip returns to the queue: not done
    expect(sess(r, 1)).toEqual(['lineup', 'ship']);
    expect(sess(r, 2)).toEqual(['none']);
    expect(sess(r, 3)).toEqual([]);
    expect(readSet(r.b.project, 'a-01').picked).toBe(2);
    expect(readSet(r.b.project, 'a-02').sentBack).toBeDefined();
    // the verdict logs: pick rows for the pick only, two none rows
    expect(new Set(projectRows(r.b.project).map(x => x.set))).toEqual(new Set(['a-01']));
    expect(noneLogs(r.b.project).map(l => l.map(x => x.set).sort())).toEqual([['a-02', 'a-04'], ['a-02', 'a-04']]);
    const again = await r.sendAll(sendId);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(noneLogs(r.b.project).map(l => l.length)).toEqual([2, 2]);
    // the skipped and the waiting item are then resolved: done
    await r.back(3);
    await r.choose(5, 1);
    const last = await r.sendAll();
    expect(last.body.rail.queue).toMatchObject({ stage: 'done', counts: { sent: 2, sentBack: 3 } });
    expect(last.body.rail.queue.cursor).toBe(5);
  }, 60_000);

  it('finish keeps what was sent back and only abandons what is left', async () => {
    const r = await rig(3);
    await r.back(1);
    await r.sendAll();
    const fin = await r.send('/finish', { eventId: eid() });
    expect(fin.status).toBe(200);
    expect(fin.body.rail.queue).toMatchObject({ stage: 'finished', counts: { sentBack: 1, ended: 2 } });
    expect(sess(r, 1)).toEqual(['none']);
    expect(sess(r, 2)).toEqual(['abandon']);
  });

  it('an item whose set was picked outside the page meanwhile reads as sent by that pick and is not sent back; the rest go through', async () => {
    const r = await rig(3);
    await r.back(1);
    await r.choose(2, 1);
    recordPick(r.b.project, readSet(r.b.project, 'a-01'), 1, {});
    const res = await r.sendAll();
    expect(res.body.results.map((x: any) => [x.n, x.status])).toEqual([[2, 'sent']]);
    expect(res.body.rail.items[0]).toMatchObject({ status: 'sent', via: 'cli' });
    expect(readSet(r.b.project, 'a-01').sentBack).toBeUndefined();
    expect(sess(r, 1)).toEqual([]);
  });

  it('refuses tampered send-backs with nothing staged', async () => {
    const r = await rig(2);
    const cases: Array<[object, number]> = [
      [{ reasons: ['meh'] }, 400], [{ reasons: [], note: undefined }, 400], [{ note: 'x'.repeat(1001) }, 400], [{ note: 'a\u0000' }, 400], [{ closest: 9 }, 400],
      [{ closest: -1 }, 400], [{ item: 3 }, 400], [{ item: 0 }, 400], [{ item: 1.5 }, 400], [{ extra: true }, 400], [{ eventId: 'bad id!' }, 400], [{ reasons: 'other' }, 400],
    ];
    for (const [over, status] of cases) {
      const res = await r.back(1, over);
      expect(res.status, JSON.stringify(over)).toBe(status);
    }
    expect((await r.send('/sendback', '{not json')).status).toBe(400);
    expect((await r.back(1, {}, )).status).toBe(200); // a good one still works after all that
    expect((await r.api('')).body.queue.counts).toMatchObject({ back: 1, waiting: 1 });
    expect((await r.back(1, {}).then(() => r.send('/sendback', { item: 1, closest: null, reasons: ['other'], eventId: eid() }, { token: 'wrong' }))).status).toBe(401);
    expect((await r.send('/sendback', { item: 1, closest: null, reasons: ['other'], eventId: eid() }, { token: null })).status).toBe(401);
  });

  it('a retried stage with the same event id is a duplicate, and a full log refuses it with 429 like a choice', async () => {
    const r = await rig(1);
    const body = { item: 1, closest: null, reasons: ['other'], eventId: 'dup-1' };
    expect((await r.send('/sendback', body)).body.ok).toBe(true);
    expect((await r.send('/sendback', body)).body.duplicate).toBe(true);
    const events = readFileSync(join(r.b.project, '.agent-prose', 'queues', r.q.id, 'events.jsonl'), 'utf8').trim().split('\n');
    expect(events).toHaveLength(1);
  });

  it('the agent side: wait delivers a sent-back item as sentBack with its feedback and reveal; status lists it; staged ones are not outcomes', async () => {
    const r = await rig(3);
    await r.back(1, { closest: 3, reasons: ['too-short'], note: 'thin' });
    await r.choose(2, 1);
    const staged = prose('reading', 'status', '--id', r.q.id, '--dir', r.b.project);
    expect(staged.out.counts).toMatchObject({ waiting: 3, sent: 0, sentBack: 0 });
    expect(staged.out.items.map((i: any) => i.status)).toEqual(['waiting', 'waiting', 'waiting']);
    expect(staged.stdout).not.toMatch(/SEALED|too-short/);
    const quiet = prose('reading', 'wait', '--id', r.q.id, '--timeout', '0', '--dir', r.b.project);
    expect(quiet.out).toMatchObject({ timeout: true, cursor: 0 });
    await r.sendAll();
    const w = prose('reading', 'wait', '--id', r.q.id, '--settle', '0', '--timeout', '5', '--dir', r.b.project);
    expect(w.out).toMatchObject({ event: 'picks', cursor: 2, done: false, counts: { sent: 1, sentBack: 1, waiting: 1 } });
    expect(w.out.picks.map((p: any) => p.item)).toEqual([2]);
    expect(w.out.sentBack).toHaveLength(1);
    expect(w.out.sentBack[0]).toMatchObject({
      item: 1, set: 'a-01', outcome: 'none', closest: 3, reasons: ['too-short'], reasonWords: ['Too short'], note: 'thin', reveal: { outcome: 'none', prediction: { pick: 2, unscored: true } },
      next: expect.stringMatching(/set new --redo a-01/),
    });
    expect(w.out.next).toMatch(/set new --redo/);
    const replay = prose('reading', 'wait', '--id', r.q.id, '--since', '0', '--settle', '0', '--timeout', '5', '--dir', r.b.project);
    expect(replay.out.sentBack.map((x: any) => x.item)).toEqual([1]);
    const status = prose('reading', 'status', '--id', r.q.id, '--dir', r.b.project);
    expect(status.out.items[0]).toMatchObject({ n: 1, status: 'sentBack', picked: false, sentBack: { closest: 3, reasons: ['too-short'], note: 'thin' }, reveal: { outcome: 'none' } });
    expect(status.out.items[1]).toMatchObject({ n: 2, status: 'sent', picked: true, variant: 1 });
    expect(prose('reading', 'list', '--dir', r.b.project).out.queues[0]).toMatchObject({ sent: 1, sentBack: 1 });
    // done: every item resolved (picked or sent back) counts as done; the reason says some were sent back
    await r.back(3, { reasons: ['other'] });
    await r.sendAll();
    const end = prose('reading', 'wait', '--id', r.q.id, '--since', '2', '--timeout', '5', '--dir', r.b.project);
    expect(end.out).toMatchObject({ event: 'done', reason: 'all-resolved', cursor: 3, unpicked: [] });
    expect(end.out.sentBack.map((x: any) => x.item)).toEqual([3]);
  }, 90_000);

  it('a queue with only picks is unchanged: the same event and reason, with an empty sentBack list', async () => {
    const r = await rig(1);
    await r.choose(1, 2);
    await r.sendAll();
    const end = prose('reading', 'wait', '--id', r.q.id, '--timeout', '5', '--dir', r.b.project);
    expect(end.out).toMatchObject({ event: 'done', reason: 'all-picked', cursor: 1, sentBack: [] });
    expect(end.out.picks).toHaveLength(1);
    expect(TOKEN).toBeTruthy();
  });

  it('an item sent back from the command line shows as sent back via cli, and its set cannot be opened or picked', async () => {
    const r = await rig(2);
    expect(prose('set', 'none', 'a-01', '--reason', 'other', '--dir', r.b.project).status).toBe(0);
    const rail = await r.api('');
    expect(rail.body.items[0]).toMatchObject({ status: 'sentBack', via: 'cli' });
    expect(rail.body.queue.counts.sentBack).toBe(1);
    expect(prose('reading', 'open', '--set', 'a-01', '--local', '--dir', r.b.project).err.code).toBe('E_CONFLICT');
    expect(prose('reading', 'open', '--pending', '--local', '--dir', r.b.project).err?.details?.skipped ?? []).toEqual(expect.anything());
    expect((await r.choose(1, 1)).status).toBe(409);
  });
});
