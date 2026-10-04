import { afterEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { queueDir, queuesDir, sessionsDir } from '../src/owner/paths.ts';
import { recordPick } from '../src/owner/pick.ts';
import { readSet, variantPath } from '../src/owner/sets.ts';
import { probe, readServerInfo } from '../src/reading/server.ts';
import { appendQueueEvent, readQueue } from '../src/reading/queue.ts';
import { appendEvent, readEvents, readSession, writeReveal } from '../src/reading/session.ts';
import { useTempHome, useTmp } from './owner-helpers.ts';
import { makeQueue, seedBatch, type Batch } from './reading-batch-helpers.ts';
import { ROOT } from './helpers.ts';

useTmp();
useTempHome();

const cli = join(ROOT, 'scripts', 'prose.mjs');
const parse = (s: string) => { try { return JSON.parse(s.trim().split('\n').pop()!); } catch { return null; } };

function prose(...args: string[]) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: process.env, timeout: 90_000 });
  return { status: r.status, out: parse(r.stdout), err: parse(r.stderr)?.error, stdout: r.stdout, stderr: r.stderr };
}
/** The CLI as a child that can be left running while the test acts. */
function proseLater(...args: string[]) {
  const child = spawn(process.execPath, [cli, ...args], { env: process.env });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d; });
  child.stderr.on('data', d => { stderr += d; });
  const done = new Promise<{ status: number | null; out: any; err: any; at: number }>(ok => child.on('close', status => ok({ status, out: parse(stdout), err: parse(stderr)?.error, at: Date.now() })));
  return { child, done };
}

afterEach(async () => {
  const info = readServerInfo();
  if (!info) return;
  prose('serve', '--stop');
  if (await probe(info)) { try { process.kill(info.pid); } catch { /* gone */ } }
});

const open = (b: Batch, ...extra: string[]) => prose('reading', 'open', '--local', '--dir', b.project, ...extra);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** What a Send does for one item, without a server: the lineup, the real set pick, the reveal and the ship. */
function sendDirect(b: Batch, qid: string, n: number, variant: number) {
  const q = readQueue(b.project, qid);
  const item = q.items[n - 1];
  const session = readSession(b.project, item.sessionId);
  appendEvent(b.project, item.sessionId, { type: 'lineup', kept: [variant], duds: [], order: session.shown });
  const picked = recordPick(b.project, readSet(b.project, item.setId), variant, {});
  writeReveal(b.project, item.sessionId, { schema: 'prose/session-reveal@1', at: new Date().toISOString(), setId: item.setId, picked: variant, variant, matched: picked.reveal?.agent.hit ?? false, prediction: picked.reveal?.agent ?? null });
  appendEvent(b.project, item.sessionId, { type: 'ship', champion: variant });
}

describe('reading open --sets', () => {
  it('opens one queue over ordinary child sessions, in the order given, and prints the link and the items', () => {
    const b = seedBatch(3);
    const r = open(b, '--sets', 'a-03,a-01,a-02', '--prompt', 'the bark lines');
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toMatchObject({ kind: 'queue', skipped: [], remaining: 0, predicted: true });
    expect(r.out.id).toMatch(/^queue-\d{8}-\d{4}-[0-9a-f]{4}$/);
    expect(r.out.url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:\\d+/q/${r.out.id}\\?t=[0-9a-f]{32}$`));
    expect(r.out.wait).toBe(`prose reading wait --id ${r.out.id} --since 0`);
    expect(r.out.items.map((i: any) => [i.n, i.set])).toEqual([[1, 'a-03'], [2, 'a-01'], [3, 'a-02']]);
    expect(r.out.notice).toMatch(/record picks/);
    const q = readQueue(b.project, r.out.id);
    expect(q.prompt).toBe('the bark lines');
    for (const item of q.items) {
      const s = readSession(b.project, item.sessionId);
      expect(s).toMatchObject({ queue: q.id, setId: item.setId, prompt: 'the bark lines', predicted: true });
      expect(s.shown).toEqual([1, 2, 3]);
      expect(Object.keys(s.hashes)).toHaveLength(3);
    }
    expect(existsSync(join(queueDir(b.project, q.id), 'events.jsonl'))).toBe(true);
  });

  it('labels the rail from the line a set revises, else the set id and its form', () => {
    const b = seedBatch(2, { lines: '5' });
    const r = open(b, '--sets', 'a-01,a-02');
    expect(r.out.items[0].who).toBe('a-01');
    expect(r.out.items[0].where).toBe('t.md, line 5');
    const b2 = seedBatch(1);
    const r2 = open(b2, '--sets', 'a-01');
    expect(r2.out.items[0]).toMatchObject({ who: 'a-01', where: 'speech-small' });
  });

  it('works for one set, and for 50, but not 51 (a hard cap, with the way out)', () => {
    const one = open(seedBatch(1), '--sets', 'a-01');
    expect(one.status).toBe(0);
    expect(one.out.items).toHaveLength(1);
    const b = seedBatch(51);
    const ok = open(b, '--sets', b.ids.slice(0, 50).join(','));
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.out.items).toHaveLength(50);
    expect(readdirSync(sessionsDir(b.project))).toHaveLength(50);
    const over = open(b, '--sets', b.ids.join(','));
    expect(over.status).not.toBe(0);
    expect(over.err).toMatchObject({ code: 'E_USAGE', message: expect.stringMatching(/51 sets.*at most 50/), hint: expect.stringMatching(/batches of 50/) });
    expect(readdirSync(sessionsDir(b.project))).toHaveLength(50); // nothing was created by the refused call
  });

  it('is all or nothing: every failing set is listed and no session or queue is made', () => {
    const b = seedBatch(4, { predict: k => k !== 1 });
    const r = open(b, '--sets', 'a-01,a-02,a-03,nope');
    expect(r.status).not.toBe(0);
    expect(r.err.code).toBe('E_USAGE');
    expect(r.err.message).toMatch(/2 of 4 sets cannot be opened/);
    expect(r.err.message).toContain('a-02');
    expect(r.err.message).toContain('nope');
    expect(r.err.failures.map((f: any) => f.set)).toEqual(['a-02', 'nope']);
    expect(existsSync(sessionsDir(b.project)) ? readdirSync(sessionsDir(b.project)) : []).toEqual([]);
    expect(existsSync(queuesDir(b.project))).toBe(false);
  });

  it('says E_PREDICTION_REQUIRED, with the hint, when missing seals are the only problem; --no-predict lets those sets in', () => {
    const b = seedBatch(3, { predict: k => k === 0 });
    const r = open(b, '--sets', 'a-01,a-02,a-03');
    expect(r.err).toMatchObject({ code: 'E_PREDICTION_REQUIRED', hint: expect.stringMatching(/prose predict --set <id>/) });
    expect(r.err.message).toMatch(/a-02.*a-03/);
    const ok = open(b, '--sets', 'a-01,a-02,a-03', '--no-predict');
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.out.items.map((i: any) => i.predicted)).toEqual([true, false, false]);
    expect(ok.out.predicted).toBe(false);
    const q = readQueue(b.project, ok.out.id);
    expect(readSession(b.project, q.items[0].sessionId).predicted).toBe(true);
    expect(readSession(b.project, q.items[1].sessionId).predicted).toBe(false);
  });

  it('refuses a duplicate id, an empty list, and a tampered seal', () => {
    const b = seedBatch(3);
    expect(open(b, '--sets', 'a-01,a-01').err).toMatchObject({ code: 'E_USAGE', message: expect.stringMatching(/a-01 is named twice/) });
    expect(open(b, '--sets', ' , ').err.code).toBe('E_USAGE');
    const file = join(b.project, '.agent-prose', 'sets', 'a-02', 'prediction.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('SEALED-a-02', 'EDITED'));
    const r = open(b, '--sets', 'a-01,a-02');
    expect(r.err.code).toBe('E_USAGE');
    expect(r.err.failures[0]).toMatchObject({ set: 'a-02', code: 'E_CONFLICT', reason: expect.stringMatching(/edited after sealing/) });
  });

  it('refuses a set with fewer than two surviving variants without opening the others', () => {
    const b = seedBatch(2);
    const set = readSet(b.project, 'a-02');
    writeFileSync(variantPath(b.project, set, set.variants[1]), readFileSync(variantPath(b.project, set, set.variants[0]), 'utf8')); // duplicates are rejected by the set check
    writeFileSync(variantPath(b.project, set, set.variants[2]), readFileSync(variantPath(b.project, set, set.variants[0]), 'utf8'));
    const r = open(b, '--sets', 'a-01,a-02');
    expect(r.err.failures).toEqual([expect.objectContaining({ set: 'a-02', reason: expect.stringMatching(/fewer than two surviving variants/) })]);
    expect(existsSync(queuesDir(b.project))).toBe(false);
  });

  it('removes the sessions it made when the queue cannot be written', () => {
    const b = seedBatch(3);
    mkdirSyncFile(queuesDir(b.project)); // a file where the queues folder should be
    const r = open(b, '--sets', 'a-01,a-02,a-03');
    expect(r.status).not.toBe(0);
    expect(existsSync(sessionsDir(b.project)) ? readdirSync(sessionsDir(b.project)) : []).toEqual([]);
  });

  it('needs exactly one of --set, --sets and --pending, and --limit only with --pending', () => {
    const b = seedBatch(2);
    expect(open(b).err.code).toBe('E_USAGE');
    expect(open(b, '--set', 'a-01', '--sets', 'a-01,a-02').err.code).toBe('E_USAGE');
    expect(open(b, '--sets', 'a-01,a-02', '--pending').err.code).toBe('E_USAGE');
    expect(open(b, '--sets', 'a-01,a-02', '--limit', '3').err.message).toMatch(/--limit goes with --pending/);
    expect(open(b, '--pending', '--no-predict').err.message).toMatch(/--no-predict is for --sets/);
  });

  it('leaves every single-set open exactly as it was: no queue field, no queue folder', () => {
    const b = seedBatch(1);
    const r = open(b, '--set', 'a-01');
    expect(r.status, r.stderr).toBe(0);
    expect(Object.keys(r.out).sort()).toEqual(['id', 'ipUrls', 'notice', 'predicted', 'url', 'wait']);
    expect(r.out.url).toContain(`/s/${r.out.id}?t=`);
    expect(readSession(b.project, r.out.id)).not.toHaveProperty('queue');
    expect(existsSync(queuesDir(b.project))).toBe(false);
  });
});

function mkdirSyncFile(path: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, 'not a folder');
}

describe('reading open --pending', () => {
  it('takes every sealed, unpicked set, oldest first, and says how many were left out by --limit', () => {
    const b = seedBatch(5, { predict: k => k !== 2 });
    const r = open(b, '--pending', '--limit', '3');
    expect(r.status, r.stderr).toBe(0);
    expect(r.out.items.map((i: any) => i.set)).toEqual(['a-01', 'a-02', 'a-04']);
    expect(r.out.remaining).toBe(1);
  });

  it('leaves out a picked set and a set already open on the page, and names the open one', () => {
    const b = seedBatch(4);
    recordPick(b.project, readSet(b.project, 'a-01'), 2, {});
    expect(open(b, '--set', 'a-02').status).toBe(0);
    const r = open(b, '--pending');
    expect(r.out.items.map((i: any) => i.set)).toEqual(['a-03', 'a-04']);
    expect(r.out.skipped).toEqual([{ set: 'a-02', reason: expect.stringMatching(/already open in session a-02-/) }]);
    // the batch it just made now holds a-03 and a-04: nothing is pending any more
    const again = open(b, '--pending');
    expect(again.err).toMatchObject({ code: 'E_USAGE', message: 'Nothing is waiting for a pick' });
    expect(again.err.skipped.map((s: any) => s.set)).toEqual(['a-02', 'a-03', 'a-04']);
  });

  it('with none pending is E_USAGE with the way to make one, and creates nothing', () => {
    const b = seedBatch(2, { predict: () => false });
    const r = open(b, '--pending');
    expect(r.err).toMatchObject({ code: 'E_USAGE', message: 'Nothing is waiting for a pick', hint: expect.stringMatching(/prose predict --set <id>/) });
    expect(existsSync(queuesDir(b.project))).toBe(false);
  });

  it('puts a tampered seal in skipped with its reason instead of failing the batch', () => {
    const b = seedBatch(3);
    const file = join(b.project, '.agent-prose', 'sets', 'a-02', 'prediction.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('SEALED-a-02', 'EDITED'));
    const r = open(b, '--pending');
    expect(r.out.items.map((i: any) => i.set)).toEqual(['a-01', 'a-03']);
    expect(r.out.skipped).toEqual([{ set: 'a-02', reason: expect.stringMatching(/edited after sealing/) }]);
  });

  it('rejects a --limit that is not 1 to 50', () => {
    const b = seedBatch(2);
    for (const bad of ['0', '51', 'x', '-1', '2.5']) expect(open(b, '--pending', '--limit', bad).err.code, bad).toBe('E_USAGE');
  });
});

describe('reading wait for a queue', () => {
  it('times out with the cursor and counts when nothing has been sent, naming the call to make again', () => {
    const b = seedBatch(2);
    const q = makeQueue(b);
    const r = prose('reading', 'wait', '--id', q.id, '--timeout', '0', '--dir', b.project);
    expect(r.status).toBe(0);
    expect(r.out).toMatchObject({ timeout: true, cursor: 0, counts: { waiting: 2, skipped: 0, sent: 0, blocked: 0, ended: 0 }, next: expect.stringContaining(`--since 0`) });
  });

  it('returns a pick with its reveal, only that item, and the cursor to pass next', () => {
    const b = seedBatch(3);
    const q = makeQueue(b);
    sendDirect(b, q.id, 2, 3);
    const r = prose('reading', 'wait', '--id', q.id, '--settle', '0', '--timeout', '5', '--dir', b.project);
    expect(r.out).toMatchObject({ event: 'picks', cursor: 1, done: false, counts: { waiting: 2, sent: 1 } });
    expect(r.out.picks).toHaveLength(1);
    expect(r.out.picks[0]).toMatchObject({ item: 2, set: 'a-02', variant: 3, via: 'page', form: 'speech-small', reveal: { picked: 3, matched: false, prediction: { pick: 2, shortlist: [3], why: 'SEALED-a-02', shortlistHit: true } } });
    expect(r.out.picks[0].file).toMatch(/v3\.md$/);
    expect(r.out.picks[0].label).toMatch(/^[A-C]$/);
    expect(r.out.next).toBe(`prose reading wait --id ${q.id} --since 1`);
    // sealed predictions of unpicked sets are nowhere in the output
    expect(r.stdout).not.toContain('SEALED-a-01');
    expect(r.stdout).not.toContain('SEALED-a-03');
  });

  it('--since replays: a lost reply is recovered by asking again with the old cursor, and a delivered pick is never delivered twice', () => {
    const b = seedBatch(3);
    const q = makeQueue(b);
    sendDirect(b, q.id, 1, 2);
    const first = prose('reading', 'wait', '--id', q.id, '--settle', '0', '--timeout', '5', '--dir', b.project);
    expect(first.out.cursor).toBe(1);
    const lost = prose('reading', 'wait', '--id', q.id, '--since', '0', '--settle', '0', '--timeout', '5', '--dir', b.project);
    expect(lost.out.picks.map((p: any) => p.item)).toEqual([1]);
    const none = prose('reading', 'wait', '--id', q.id, '--since', '1', '--timeout', '0', '--dir', b.project);
    expect(none.out).toMatchObject({ timeout: true, cursor: 1 });
    sendDirect(b, q.id, 3, 1);
    const next = prose('reading', 'wait', '--id', q.id, '--since', '1', '--settle', '0', '--timeout', '5', '--dir', b.project);
    expect(next.out.picks.map((p: any) => p.item)).toEqual([3]);
    expect(next.out.cursor).toBe(2);
  });

  it('refuses a cursor past the picks recorded, and a cursor that is not a number', () => {
    const b = seedBatch(2);
    const q = makeQueue(b);
    expect(prose('reading', 'wait', '--id', q.id, '--since', '3', '--timeout', '0', '--dir', b.project).err).toMatchObject({ code: 'E_USAGE', message: expect.stringMatching(/past the 0 picks/) });
    expect(prose('reading', 'wait', '--id', q.id, '--since', 'x', '--timeout', '0', '--dir', b.project).err.code).toBe('E_USAGE');
    expect(prose('reading', 'wait', '--id', q.id, '--settle', '-1', '--timeout', '0', '--dir', b.project).err.message).toMatch(/--settle/);
  });

  it('settles: picks recorded a moment apart come back together, after the quiet window', async () => {
    const b = seedBatch(3);
    const q = makeQueue(b);
    sendDirect(b, q.id, 1, 2);
    const started = Date.now();
    const w = proseLater('reading', 'wait', '--id', q.id, '--settle', '1.2', '--timeout', '20', '--dir', b.project);
    await sleep(500);
    sendDirect(b, q.id, 2, 1); // 0.5 s later: still inside the window
    const r = await w.done;
    expect(r.out.picks.map((p: any) => p.item)).toEqual([1, 2]);
    expect(r.at - started).toBeGreaterThanOrEqual(1500); // waited out the window after the second pick
  }, 60_000);

  it('returns at once when the queue is finished, with the picks since the cursor and what stays unpicked', () => {
    const b = seedBatch(3);
    const q = makeQueue(b);
    sendDirect(b, q.id, 1, 2);
    appendQueueEvent(b.project, q.id, { type: 'finish' });
    const r = prose('reading', 'wait', '--id', q.id, '--dir', b.project, '--timeout', '30');
    expect(r.out).toMatchObject({ event: 'done', reason: 'finished', cursor: 1, counts: { sent: 1, ended: 2 } });
    expect(r.out.picks.map((p: any) => p.item)).toEqual([1]);
    expect(r.out.unpicked).toEqual([{ item: 2, set: 'a-02' }, { item: 3, set: 'a-03' }]);
    expect(r.out.next).toMatch(/prose reading open --pending/);
  });

  it('is done with reason all-picked once every item is sent, and never earlier because of a skip', () => {
    const b = seedBatch(2);
    const q = makeQueue(b);
    appendQueueEvent(b.project, q.id, { type: 'skip', item: 1 });
    sendDirect(b, q.id, 2, 3);
    const mid = prose('reading', 'wait', '--id', q.id, '--settle', '0', '--timeout', '5', '--dir', b.project);
    expect(mid.out.event).toBe('picks');
    expect(mid.out.counts).toMatchObject({ skipped: 1, sent: 1 });
    sendDirect(b, q.id, 1, 1);
    const end = prose('reading', 'wait', '--id', q.id, '--since', String(mid.out.cursor), '--timeout', '5', '--dir', b.project);
    expect(end.out).toMatchObject({ event: 'done', reason: 'all-picked', cursor: 2, unpicked: [] });
    expect(end.out.picks.map((p: any) => p.item)).toEqual([1]);
  });

  it('is done with reason closed when the agent closes the queue, and the close abandons the unsent children', async () => {
    const b = seedBatch(3);
    const q = makeQueue(b);
    sendDirect(b, q.id, 1, 2);
    const w = proseLater('reading', 'wait', '--id', q.id, '--since', '1', '--settle', '0', '--timeout', '30', '--dir', b.project);
    await sleep(300);
    const c = prose('reading', 'close', '--id', q.id, '--dir', b.project);
    expect(c.out).toMatchObject({ id: q.id, kind: 'queue', closed: true, stage: 'closed', sent: 1, abandoned: 2 });
    const r = await w.done;
    expect(r.out).toMatchObject({ event: 'done', reason: 'closed' });
    const stages = q.items.map(i => readEvents(b.project, i.sessionId).map(e => e.type).at(-1));
    expect(stages).toEqual(['ship', 'abandon', 'abandon']);
    expect(prose('reading', 'close', '--id', q.id, '--dir', b.project).out).toMatchObject({ closed: false, stage: 'closed' });
  }, 60_000);

  it('notices a set picked from the CLI outside the queue, and reports it as a pick with its reveal', () => {
    const b = seedBatch(2);
    const q = makeQueue(b);
    recordPick(b.project, readSet(b.project, 'a-02'), 1, {});
    const r = prose('reading', 'wait', '--id', q.id, '--settle', '0', '--timeout', '5', '--dir', b.project);
    expect(r.out.picks).toEqual([expect.objectContaining({ item: 2, variant: 1, via: 'cli', reveal: expect.objectContaining({ picked: 1, matched: false, prediction: expect.objectContaining({ pick: 2 }) }) })]);
  });

  it('unknown ids say so, and a session id still waits as it always did', () => {
    const b = seedBatch(1);
    const r = prose('reading', 'wait', '--id', 'queue-20260101-0000-ffff', '--timeout', '0', '--dir', b.project);
    expect(r.err).toMatchObject({ code: 'E_NOT_FOUND', message: expect.stringMatching(/No session or queue/) });
    const single = open(b, '--set', 'a-01');
    expect(prose('reading', 'wait', '--id', single.out.id, '--timeout', '0', '--dir', b.project).out).toMatchObject({ timeout: true, next: expect.stringContaining('wait --id') });
    expect(prose('reading', 'wait', '--id', single.out.id, '--since', '1', '--timeout', '0', '--dir', b.project).err.code).toBe('E_USAGE');
  });
});

describe('reading status, list and close for a queue', () => {
  it('status shows each item, and the pick and reveal only for a sent one; a staged choice is not a pick', () => {
    const b = seedBatch(3);
    const q = makeQueue(b);
    sendDirect(b, q.id, 1, 2);
    appendQueueEvent(b.project, q.id, { type: 'choose', item: 2, variant: 3, passes: [] });
    appendQueueEvent(b.project, q.id, { type: 'skip', item: 3 });
    const r = prose('reading', 'status', '--id', q.id, '--dir', b.project);
    expect(r.out).toMatchObject({ id: q.id, kind: 'queue', stage: 'open', total: 3, cursor: 1, counts: { waiting: 1, skipped: 1, sent: 1 }, order: [1, 2, 3] });
    expect(r.out.items.map((i: any) => [i.n, i.status, i.picked, i.variant])).toEqual([[1, 'sent', true, 2], [2, 'waiting', false, null], [3, 'skipped', false, null]]);
    expect(r.out.items[0].reveal).toMatchObject({ prediction: { why: 'SEALED-a-01' } });
    expect(r.out.items[1].reveal).toBeNull();
    expect(r.stdout).not.toContain('SEALED-a-02');
    expect(r.stdout).not.toContain('SEALED-a-03');
  });

  it('list groups children under their queue and leaves them out of sessions; a child asked for by id carries its queue', () => {
    const b = seedBatch(3);
    const single = open(b, '--set', 'a-01');
    const q = makeQueue(b, ['a-02', 'a-03']);
    sendDirect(b, q.id, 1, 2);
    const r = prose('reading', 'list', '--dir', b.project);
    expect(r.out.sessions.map((s: any) => s.id)).toEqual([single.out.id]);
    expect(r.out.queues).toEqual([{ id: q.id, stage: 'open', total: 2, sent: 1, sentBack: 0, createdAt: q.createdAt }]);
    expect(prose('reading', 'status', '--id', q.items[1].sessionId, '--dir', b.project).out).toMatchObject({ queue: q.id, stage: 'lineup' });
    expect(prose('reading', 'status', '--id', single.out.id, '--dir', b.project).out).not.toHaveProperty('queue');
  });

  it('round on a child is refused and points at opening the set alone', () => {
    const b = seedBatch(2);
    const q = makeQueue(b);
    const r = prose('reading', 'round', '--id', q.items[0].sessionId, '--set', 'a-02', '--dir', b.project);
    expect(r.err).toMatchObject({ code: 'E_USAGE', message: expect.stringMatching(/a batch item has no rounds/), hint: expect.stringContaining('--set a-01') });
  });

  it('close keeps picks already sent and the sets stay sealed and unpicked for --pending to offer again', () => {
    const b = seedBatch(3);
    const q = makeQueue(b);
    sendDirect(b, q.id, 2, 1);
    expect(prose('reading', 'close', '--id', q.id, '--dir', b.project).out).toMatchObject({ closed: true, sent: 1, abandoned: 2 });
    expect(readSet(b.project, 'a-02').picked).toBe(1);
    expect(readSet(b.project, 'a-01').picked).toBeUndefined();
    const again = open(b, '--pending');
    expect(again.out.items.map((i: any) => i.set)).toEqual(['a-01', 'a-03']);
  });
});
