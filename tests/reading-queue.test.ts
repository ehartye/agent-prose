import { describe, expect, it } from 'vitest';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_QUEUE_EVENTS, appendQueueEvent, appendQueueEventAsync, currentItem, foldQueue, parseQueueEvents, rankedPicks, readQueue, readQueueEvents, readQueueEventsDetailed, writeQueue,
  type ChildInfo, type Queue, type StoredQueueEvent,
} from '../src/reading/queue.ts';
import { SessionSchema, openSession, readSession } from '../src/reading/session.ts';
import { queueDir } from '../src/owner/paths.ts';
import { tmpProject, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
useTempHome();

const queueOf = (n: number): Queue => ({
  schema: 'prose/queue@1', id: 'queue-20261004-1830-ab12', project: '/p', createdAt: '2026-10-04T18:30:00.000Z', prompt: '',
  items: Array.from({ length: n }, (_, k) => ({ n: k + 1, setId: `set-${k + 1}`, sessionId: `sess-${k + 1}`, form: 'dialog', who: `W${k + 1}`, where: `d.yaml, line ${k + 1}`, predicted: true })),
});
let seq = 0;
const ev = (e: object): StoredQueueEvent => ({ ...e, at: `2026-10-04T18:3${seq % 10}:00.000Z`, seq: ++seq }) as StoredQueueEvent;
const open = (): ChildInfo => ({ stage: 'lineup', sentBack: null, shipped: null, shippedAt: null, pickedElsewhere: null, pickedAt: null, missing: false });
const kids = (n: number, over: Record<number, Partial<ChildInfo>> = {}) => Object.fromEntries(Array.from({ length: n }, (_, k) => [k + 1, { ...open(), ...over[k + 1] }]));
const choose = (item: number, variant: number | null, passes: number[] = [], eventId?: string) => ev({ type: 'choose', item, variant, passes, ...(eventId ? { eventId } : {}) });
const skip = (item: number, eventId?: string) => ev({ type: 'skip', item, ...(eventId ? { eventId } : {}) });

describe('foldQueue', () => {
  it('starts with every item waiting in item order', () => {
    const s = foldQueue(queueOf(3), [], kids(3));
    expect(s.stage).toBe('open');
    expect(s.order).toEqual([1, 2, 3]);
    expect(s.items.map(i => i.status)).toEqual(['waiting', 'waiting', 'waiting']);
    expect(s.counts).toEqual({ waiting: 3, picked: 0, back: 0, sent: 0, sentBack: 0, skipped: 0, blocked: 0, ended: 0 });
  });

  it('a choice stages a pick; choosing again replaces it; variant null clears it but keeps the passes', () => {
    const q = queueOf(2);
    let s = foldQueue(q, [choose(1, 2, [1])], kids(2));
    expect(s.items[0]).toMatchObject({ status: 'picked', choice: { variant: 2, passes: [1] } });
    s = foldQueue(q, [choose(1, 2, [1]), choose(1, 3, [])], kids(2));
    expect(s.items[0].choice).toEqual({ variant: 3, passes: [] });
    s = foldQueue(q, [choose(1, 2, [1]), choose(1, null, [1, 3])], kids(2));
    expect(s.items[0]).toMatchObject({ status: 'waiting', choice: { variant: null, passes: [1, 3] } });
  });

  it('a pass never contains the chosen variant, and repeats collapse', () => {
    const s = foldQueue(queueOf(1), [choose(1, 2, [2, 1, 1, 3])], kids(1));
    expect(s.items[0].choice).toEqual({ variant: 2, passes: [1, 3] });
  });

  it('a skip sends the item to the end, once per skip, and a second skip puts it last again', () => {
    const q = queueOf(4);
    expect(foldQueue(q, [skip(1)], kids(4)).order).toEqual([2, 3, 4, 1]);
    expect(foldQueue(q, [skip(1), skip(2)], kids(4)).order).toEqual([3, 4, 1, 2]);
    expect(foldQueue(q, [skip(1), skip(2), skip(1)], kids(4)).order).toEqual([3, 4, 2, 1]);
    expect(foldQueue(q, [skip(1)], kids(4)).items[0].status).toBe('skipped');
  });

  it('a choice after a skip clears skipped (the item stays where the skip put it); a skip after a choice clears the choice', () => {
    const q = queueOf(3);
    let s = foldQueue(q, [skip(1), choose(1, 2)], kids(3));
    expect(s.items[0].status).toBe('picked');
    expect(s.order).toEqual([2, 3, 1]);
    s = foldQueue(q, [choose(1, 2, [3]), skip(1)], kids(3));
    expect(s.items[0]).toMatchObject({ status: 'skipped', choice: { variant: null, passes: [] } });
    // clearing after a skip returns it to waiting, not skipped
    s = foldQueue(q, [skip(1), choose(1, null, [])], kids(3));
    expect(s.items[0].status).toBe('waiting');
  });

  it('a repeated event id of the same type counts once (a retried POST)', () => {
    const q = queueOf(3);
    const s = foldQueue(q, [skip(1, 'k1'), skip(2, 'k2'), skip(1, 'k1')], kids(3));
    expect(s.order).toEqual([3, 1, 2]);
    expect(s.events).toBe(2);
    // the same id on a different type is a different event
    expect(foldQueue(q, [choose(1, 1, [], 'x'), skip(2, 'x')], kids(3)).events).toBe(2);
  });

  it('ignores an event for an item the queue does not hold', () => {
    const s = foldQueue(queueOf(2), [choose(9, 1), skip(7)], kids(2));
    expect(s.order).toEqual([1, 2]);
    expect(s.counts.waiting).toBe(2);
  });

  it('a child that shipped is sent whatever the log says, with the variant it shipped and who shipped it', () => {
    const q = queueOf(2);
    const s = foldQueue(q, [choose(1, 2), skip(2)], kids(2, { 1: { stage: 'shipped', shipped: 3, shippedAt: '2026-10-04T19:00:00.000Z' } }));
    expect(s.items[0]).toMatchObject({ status: 'sent', sentVariant: 3, via: 'page', choice: { variant: 2 } });
    expect(s.items[1].status).toBe('skipped');
  });

  it('a set picked outside the queue shows as sent (via the CLI), taking its time from the pick', () => {
    const s = foldQueue(queueOf(1), [], kids(1, { 1: { pickedElsewhere: 2, pickedAt: '2026-10-04T19:05:00.000Z' } }));
    expect(s.items[0]).toMatchObject({ status: 'sent', sentVariant: 2, via: 'cli', sentAt: '2026-10-04T19:05:00.000Z' });
  });

  it('an abandoned child is ended; a missing child is blocked with its words', () => {
    const q = queueOf(2);
    const s = foldQueue(q, [], kids(2, { 1: { stage: 'abandoned' }, 2: { missing: true } }));
    expect(s.items[0].status).toBe('ended');
    expect(s.items[1]).toMatchObject({ status: 'blocked', message: expect.stringMatching(/no longer available/) });
  });

  it('a blocked send shows its message until the item is chosen or skipped again', () => {
    const q = queueOf(1);
    const b = ev({ type: 'blocked', item: 1, message: 'variant 2 changed' });
    expect(foldQueue(q, [choose(1, 2), b], kids(1)).items[0]).toMatchObject({ status: 'blocked', message: 'variant 2 changed', choice: { variant: 2 } });
    expect(foldQueue(q, [choose(1, 2), b, choose(1, 3)], kids(1)).items[0]).toMatchObject({ status: 'picked' });
    expect(foldQueue(q, [choose(1, 2), b, skip(1)], kids(1)).items[0].status).toBe('skipped');
  });

  it('stage: done when every item is sent or ended; finished and closed win; unsent items end with the queue', () => {
    const q = queueOf(2);
    const sent = (v: number): Partial<ChildInfo> => ({ stage: 'shipped', shipped: v, shippedAt: 'x' });
    expect(foldQueue(q, [], kids(2, { 1: sent(1) })).stage).toBe('open');
    expect(foldQueue(q, [], kids(2, { 1: sent(1), 2: sent(2) })).stage).toBe('done');
    expect(foldQueue(q, [], kids(2, { 1: sent(1), 2: { stage: 'abandoned' } })).stage).toBe('done');
    const fin = foldQueue(q, [ev({ type: 'finish' })], kids(2, { 1: sent(1) }));
    expect(fin.stage).toBe('finished');
    expect(fin.items.map(i => i.status)).toEqual(['sent', 'ended']);
    expect(foldQueue(q, [ev({ type: 'finish' }), ev({ type: 'close' })], kids(2)).stage).toBe('closed');
    expect(foldQueue(q, [ev({ type: 'close' })], kids(2, { 1: sent(1), 2: sent(2) })).stage).toBe('closed');
  });

  it('a send marker changes nothing in the state', () => {
    const q = queueOf(2);
    const a = foldQueue(q, [choose(1, 1)], kids(2));
    const b = foldQueue(q, [choose(1, 1), ev({ type: 'send', sendId: 's1', items: [1] })], kids(2));
    expect({ ...b, events: 0 }).toEqual({ ...a, events: 0 });
  });

  it('currentItem is the first undecided in rail order, then a chosen one', () => {
    const q = queueOf(3);
    expect(currentItem(foldQueue(q, [], kids(3)))).toBe(1);
    expect(currentItem(foldQueue(q, [choose(1, 1)], kids(3)))).toBe(2);
    expect(currentItem(foldQueue(q, [skip(1), choose(2, 1), choose(3, 1)], kids(3)))).toBe(1);
    expect(currentItem(foldQueue(q, [choose(1, 1), choose(2, 1), choose(3, 1)], kids(3)))).toBe(1);
    expect(currentItem(foldQueue(q, [], kids(3, { 1: { pickedElsewhere: 1, pickedAt: 'x' } })))).toBe(2);
  });

  it('rankedPicks orders by when each was recorded, ties by item number, and leaves out unsent items', () => {
    const q = queueOf(4);
    const s = foldQueue(q, [choose(4, 1)], kids(4, {
      1: { stage: 'shipped', shipped: 2, shippedAt: '2026-10-04T19:00:02.000Z' },
      2: { stage: 'shipped', shipped: 1, shippedAt: '2026-10-04T19:00:01.000Z' },
      3: { stage: 'shipped', shipped: 3, shippedAt: '2026-10-04T19:00:02.000Z' },
    }));
    expect(rankedPicks(s).map(p => p.n)).toEqual([2, 1, 3]);
  });

  it('is deterministic and does not mutate its inputs', () => {
    const q = queueOf(3);
    const events = [skip(1), choose(2, 1, [2]), skip(3)];
    const frozen = JSON.stringify([q, events]);
    expect(foldQueue(q, events, kids(3))).toEqual(foldQueue(q, events, kids(3)));
    expect(JSON.stringify([q, events])).toBe(frozen);
  });
});

describe('queue log', () => {
  const made = () => {
    const p = tmpProject();
    const q = queueOf(3);
    writeQueue(p.project, { id: q.id, project: p.project, createdAt: q.createdAt, prompt: 'p', items: q.items });
    return { ...p, q };
  };

  it('writes queue.json once and refuses to overwrite it', () => {
    const { project, q } = made();
    expect(readQueue(project, q.id).items).toHaveLength(3);
    expect(() => writeQueue(project, { id: q.id, project, createdAt: q.createdAt, prompt: '', items: q.items })).toThrow(/already exists/);
  });

  it('refuses a queue with no items, more than 50, or a bad id', () => {
    const { project, q } = made();
    expect(() => writeQueue(project, { id: 'queue-empty', project, createdAt: q.createdAt, prompt: '', items: [] })).toThrow(/Invalid queue/);
    expect(() => writeQueue(project, { id: 'queue-big', project, createdAt: q.createdAt, prompt: '', items: queueOf(51).items })).toThrow(/Invalid queue/);
    expect(() => writeQueue(project, { id: '../x', project, createdAt: q.createdAt, prompt: '', items: q.items })).toThrow(/Queue id/);
  });

  it('appends numbered events and reads them back', () => {
    const { project, q } = made();
    appendQueueEvent(project, q.id, { type: 'choose', item: 1, variant: 2, passes: [1] });
    appendQueueEvent(project, q.id, { type: 'skip', item: 2 });
    const events = readQueueEvents(project, q.id);
    expect(events.map(e => [e.seq, e.type])).toEqual([[1, 'choose'], [2, 'skip']]);
    expect(typeof events[0].at).toBe('string');
  });

  it('a retried event id appends nothing and returns the stored event; a retried send id too', async () => {
    const { project, q } = made();
    const a = appendQueueEvent(project, q.id, { type: 'skip', item: 1, eventId: 'k1' });
    const b = appendQueueEvent(project, q.id, { type: 'skip', item: 1, eventId: 'k1' });
    expect(b.duplicate).toBe(true);
    expect(b.stored.seq).toBe(a.stored.seq);
    await appendQueueEventAsync(project, q.id, { type: 'send', sendId: 's1', items: [1] });
    expect((await appendQueueEventAsync(project, q.id, { type: 'send', sendId: 's1', items: [1, 2] })).duplicate).toBe(true);
    expect(readQueueEvents(project, q.id)).toHaveLength(2);
  });

  it('validates every field: unknown types, bad items, too many passes, extra keys', () => {
    const { project, q } = made();
    for (const bad of [
      { type: 'nope' }, { type: 'skip', item: 0 }, { type: 'skip', item: 51 }, { type: 'skip', item: 1.5 }, { type: 'skip', item: '1' },
      { type: 'choose', item: 1, variant: 0, passes: [] }, { type: 'choose', item: 1, variant: 1, passes: [1, 2, 3, 4, 5, 6, 7] },
      { type: 'choose', item: 1, variant: 1, passes: [], extra: 1 }, { type: 'skip', item: 1, eventId: 'has space' },
      { type: 'send', sendId: '', items: [] }, { type: 'blocked', item: 1, message: 'x'.repeat(301) },
    ]) expect(() => appendQueueEvent(project, q.id, bad), JSON.stringify(bad)).toThrow(/Invalid queue event/);
    expect(readQueueEvents(project, q.id)).toHaveLength(0);
  });

  it('skips and counts a torn, unknown or unnumbered line, and terminates a torn last line before appending', () => {
    const { project, q } = made();
    const file = join(queueDir(project, q.id), 'events.jsonl');
    appendQueueEvent(project, q.id, { type: 'skip', item: 1 });
    appendFileSync(file, '{"type":"skip","item":2,"at":"x","seq":2');                // torn, no newline
    expect(readQueueEventsDetailed(project, q.id)).toMatchObject({ skipped: 1 });
    appendQueueEvent(project, q.id, { type: 'skip', item: 3 });
    const { events, skipped } = readQueueEventsDetailed(project, q.id);
    expect(events.map(e => (e as { item?: number }).item)).toEqual([1, 3]);
    expect(skipped).toBe(1);
    expect(readFileSync(file, 'utf8').split('\n').filter(Boolean)).toHaveLength(3);
    expect(parseQueueEvents('{"type":"wat","at":"x","seq":1}\n{"type":"skip","item":1}\nnot json\n').skipped).toBe(3);
  });

  it('refuses choose and skip past the cap but always takes send, blocked, finish and close', () => {
    const { project, q } = made();
    const file = join(queueDir(project, q.id), 'events.jsonl');
    const lines = Array.from({ length: MAX_QUEUE_EVENTS }, (_, i) => JSON.stringify({ type: 'skip', item: 1, at: 'x', seq: i + 1 })).join('\n') + '\n';
    writeFileSync(file, lines);
    expect(() => appendQueueEvent(project, q.id, { type: 'skip', item: 1 })).toThrow(/queue is full/);
    expect(() => appendQueueEvent(project, q.id, { type: 'choose', item: 1, variant: 1, passes: [] })).toThrow(/queue is full/);
    try { appendQueueEvent(project, q.id, { type: 'skip', item: 1 }); } catch (e) { expect((e as { status?: number }).status).toBe(429); }
    for (const e of [{ type: 'send', sendId: 's', items: [1] }, { type: 'blocked', item: 1, message: 'm' }, { type: 'finish' }, { type: 'close' }]) {
      expect(() => appendQueueEvent(project, q.id, e)).not.toThrow();
    }
  });

  it('an event for a missing queue is E_NOT_FOUND', () => {
    const { project } = made();
    expect(() => appendQueueEvent(project, 'queue-nope', { type: 'finish' })).toThrow(/No queue queue-nope/);
    expect(existsSync(queueDir(project, 'queue-nope'))).toBe(false);
  });
});

describe('SessionSchema.queue', () => {
  const base = {
    schema: 'prose/session@1', id: 's1', setId: 'a', project: '/p', form: 'dialog', register: null, prompt: '', createdAt: 'x', shown: [1, 2],
    hashes: {}, target: null, wpm: null, candidates: [{ index: 1, name: 'v1', direction: null, round: 0 }],
  };
  it('is optional, a string when present, and an old session parses unchanged', () => {
    expect(SessionSchema.parse(base)).not.toHaveProperty('queue');
    expect(SessionSchema.parse({ ...base, queue: 'queue-1' }).queue).toBe('queue-1');
    expect(SessionSchema.safeParse({ ...base, queue: 5 }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...base, other: 1 }).success).toBe(false);
  });
  it('openSession writes the queue field for a child and nothing for a single-set session', () => {
    const p = tmpProject();
    const input = { setId: 'a', form: 'dialog', register: null, prompt: '', shown: [1], hashes: {}, target: null, wpm: null, candidates: [{ index: 1, name: 'v1', direction: null, round: 0 }] };
    openSession(p.project, { ...input, id: 'single-1' });
    openSession(p.project, { ...input, id: 'child-1', queue: 'queue-9' });
    expect(readSession(p.project, 'single-1')).not.toHaveProperty('queue');
    expect(readSession(p.project, 'child-1').queue).toBe('queue-9');
  });
});
