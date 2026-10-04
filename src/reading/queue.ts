// Batch review: a queue over ordinary child sessions, one per set. The queue is an index and a staging area: each item is
// a normal `prose/session@1` session (its own log, hashes, reveal), so nothing about the session fold changes. The queue
// holds only what the owner staged (choices), skipped, finished, or what the agent closed. A pick is real only when the
// child session has shipped (`set pick` ran); the queue never records one itself.
//
// Files, under `<project>/.agent-prose/queues/<id>/`:
//   queue.json    the frozen queue (its items and the labels the rail shows); written once, atomically, last
//   events.jsonl  one JSON event per line, appended under a lock; a torn or unknown line is skipped and counted
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ProseError } from '../errors.ts';
import { withDirLock, withDirLockAsync, writeFileAtomic } from '../owner/fsutil.ts';
import { MAX_NONE_NOTE, NONE_REASONS } from '../owner/feedback.ts';
import { EVENT_ID_RE, queueDir, queuesDir, validId } from '../owner/paths.ts';
import { readSet, type PromptSet } from '../owner/sets.ts';
import { foldSession, readEvents, readSession, type Session, type SessionState, type StoredEvent } from './session.ts';

/** Sets in one queue, a hard cap. */
export const MAX_QUEUE_ITEMS = 50;
/** Stored events after which choose, skip and sendback are refused (429); send, finish, close and blocked are always accepted. */
export const MAX_QUEUE_EVENTS = 4000;
/** Variants a set has at most; `passes` cannot name more. */
const MAX_PASSES = 6;

const Item = z.number().int().min(1).max(MAX_QUEUE_ITEMS);
const Variant = z.number().int().min(1);
const EventId = z.string().regex(EVENT_ID_RE, 'must be 1-100 letters, digits, dot, underscore, colon or hyphen');

export const QueueItemSchema = z.strictObject({
  /** 1 to 50, never changes. */
  n: Item,
  setId: z.string().min(1),
  sessionId: z.string().min(1),
  form: z.string().min(1),
  /** Frozen rail labels: the first original line's speaker (else the set id), and `<draft>, line <ref>` (else the form). */
  who: z.string().max(200),
  where: z.string().max(300),
  predicted: z.boolean(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const QueueSchema = z.strictObject({
  schema: z.literal('prose/queue@1'),
  id: z.string(),
  project: z.string(),
  createdAt: z.string(),
  prompt: z.string(),
  items: z.array(QueueItemSchema).min(1).max(MAX_QUEUE_ITEMS),
});
export type Queue = z.infer<typeof QueueSchema>;

export const QueueEventSchema = z.discriminatedUnion('type', [
  /** The staged choice for an item: the session candidate index kept (null clears it) and the ones passed. */
  z.strictObject({ type: z.literal('choose'), item: Item, variant: Variant.nullable(), passes: z.array(Variant).max(MAX_PASSES), eventId: EventId.optional() }),
  z.strictObject({ type: z.literal('skip'), item: Item, eventId: EventId.optional() }),
  /** The staged "none of these" for an item (nothing is sent until Send): the session candidate index that came closest (or null), the reasons and a note. A later choose or skip replaces it; it replaces a staged choice. */
  z.strictObject({ type: z.literal('sendback'), item: Item, closest: Variant.nullable(), reasons: z.array(z.enum(NONE_REASONS)).max(NONE_REASONS.length), note: z.string().max(MAX_NONE_NOTE).optional(), eventId: EventId.optional() }),
  /** An audit marker written when a send starts; the picks themselves are the children's ship events. */
  z.strictObject({ type: z.literal('send'), sendId: EventId, items: z.array(Item).max(MAX_QUEUE_ITEMS), eventId: EventId.optional() }),
  /** A send attempt failed for this item (with the message the owner sees); cleared by the item's next choose or skip. */
  z.strictObject({ type: z.literal('blocked'), item: Item, message: z.string().max(300), eventId: EventId.optional() }),
  z.strictObject({ type: z.literal('finish'), eventId: EventId.optional() }),
  z.strictObject({ type: z.literal('close'), eventId: EventId.optional() }),
]);
export type QueueEvent = z.infer<typeof QueueEventSchema>;
export type StoredQueueEvent = QueueEvent & { at: string; seq: number };

/** Events the owner's page may cause (through the choose, skip, send and finish routes); `close` and `blocked` are the CLI's and the server's own. */
export const COUNTED = new Set(['choose', 'skip', 'sendback']);

// ---- the fold (pure) ----

/** What the owner said when they sent an item back; `closest` is a session candidate index when it comes from the child, a set variant number from the command line. */
export interface SentBackInfo { closest: number | null; reasons: string[]; note?: string; at: string | null; via: 'page' | 'cli' }

/** What the fold needs to know of an item's child session and set, read by the caller. */
export interface ChildInfo {
  stage: 'lineup' | 'duel' | 'refine' | 'waiting' | 'shipped' | 'sentBack' | 'abandoned';
  /** The owner sent this item back (none of these), in the child session or, from the command line, on the set; null when not. */
  sentBack: SentBackInfo | null;
  /** The candidate (variant) index the child shipped, or null. */
  shipped: number | null;
  shippedAt: string | null;
  /** The variant the set was picked with when that happened outside this child (`prose set pick` in the CLI), or null. */
  pickedElsewhere: number | null;
  pickedAt: string | null;
  /** The child or its set cannot be read any more. */
  missing: boolean;
}

export type ItemStatus = 'waiting' | 'picked' | 'back' | 'skipped' | 'sent' | 'sentBack' | 'blocked' | 'ended';

/** A staged send-back: what Send will record for the item. */
export interface StagedBack { closest: number | null; reasons: string[]; note?: string }

export interface ItemState {
  n: number;
  status: ItemStatus;
  /** The staged choice (variant null and no passes when there is none). Kept after the item is sent, for the record. */
  choice: { variant: number | null; passes: number[] };
  /** The staged "none of these" (status `back`), or null. */
  back: StagedBack | null;
  /** What the owner said, once the item is sent back (status `sentBack`). */
  sentBack: SentBackInfo | null;
  /** The variant that was actually picked, when the item is sent. */
  sentVariant: number | null;
  sentAt: string | null;
  /** `page` when the child shipped, `cli` when the set was picked outside the queue. */
  via: 'page' | 'cli' | null;
  message?: string;
}

export type QueueStage = 'open' | 'finished' | 'closed' | 'done';

export interface QueueState {
  stage: QueueStage;
  /** Item numbers in rail order: 1..N with each skip moving that item to the end. */
  order: number[];
  items: ItemState[];
  counts: Record<ItemStatus, number>;
  /** Valid events folded. */
  events: number;
}

const unique = (xs: number[]) => [...new Set(xs)];

/**
 * The pure fold of the queue log and the children's states into the queue's state. An event for an item the queue does not
 * hold is ignored; a repeated event id of the same type is ignored (a retried POST); events after a finish or a close
 * still fold their own item (the server refuses them, a hand-edited log cannot reopen the queue because the stage is
 * decided by finish and close alone).
 */
export function foldQueue(queue: Queue, events: StoredQueueEvent[], children: Record<number, ChildInfo | undefined>): QueueState {
  const known = new Set(queue.items.map(i => i.n));
  const staged = new Map<number, { variant: number | null; passes: number[]; back: StagedBack | null; last: 'choose' | 'skip' | 'sendback' | 'blocked' | null; message?: string }>();
  for (const i of queue.items) staged.set(i.n, { variant: null, passes: [], back: null, last: null });
  let order = queue.items.map(i => i.n);
  let finished = false, closed = false;
  const seen = new Set<string>();
  let valid = 0;
  for (const e of events) {
    if (e.eventId !== undefined) {
      const key = `${e.type}\0${e.eventId}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    valid++;
    switch (e.type) {
      case 'choose': {
        const s = staged.get(e.item);
        if (!known.has(e.item) || !s) break;
        s.variant = e.variant;
        s.passes = unique(e.passes).filter(p => p !== e.variant);
        s.back = null; // choosing (or clearing) takes a staged send-back away
        s.last = 'choose'; delete s.message;
        break;
      }
      case 'sendback': {
        const s = staged.get(e.item);
        if (!known.has(e.item) || !s) break;
        s.variant = null; s.passes = [];
        s.back = { closest: e.closest, reasons: [...new Set(e.reasons)], ...(e.note ? { note: e.note } : {}) };
        s.last = 'sendback'; delete s.message;
        break;
      }
      case 'skip': {
        const s = staged.get(e.item);
        if (!known.has(e.item) || !s) break;
        s.variant = null; s.passes = []; s.back = null; s.last = 'skip'; delete s.message;
        order = [...order.filter(n => n !== e.item), e.item];
        break;
      }
      case 'blocked': {
        const s = staged.get(e.item);
        if (!known.has(e.item) || !s) break;
        s.last = 'blocked'; s.message = e.message;
        break;
      }
      case 'finish': finished = true; break;
      case 'close': closed = true; break;
      case 'send': break; // an audit marker
    }
  }
  const ended = finished || closed;
  const items: ItemState[] = queue.items.map(q => {
    const s = staged.get(q.n)!;
    const child = children[q.n];
    const choice = { variant: s.variant, passes: [...s.passes] };
    const base = { n: q.n, choice, back: s.back, sentBack: null as SentBackInfo | null, sentVariant: null as number | null, sentAt: null as string | null, via: null as ItemState['via'] };
    if (child && child.shipped !== null) return { ...base, status: 'sent', sentVariant: child.shipped, sentAt: child.shippedAt, via: 'page' };
    if (child && child.pickedElsewhere !== null) return { ...base, status: 'sent', sentVariant: child.pickedElsewhere, sentAt: child.pickedAt, via: 'cli' };
    if (child && child.sentBack) return { ...base, status: 'sentBack', sentBack: child.sentBack, sentAt: child.sentBack.at, via: child.sentBack.via };
    if (ended) return { ...base, status: 'ended' };
    if (!child || child.missing) return { ...base, status: 'blocked', message: 'This set is no longer available' };
    if (child.stage === 'abandoned') return { ...base, status: 'ended' };
    if (s.last === 'blocked') return { ...base, status: 'blocked', message: s.message };
    if (s.last === 'skip') return { ...base, status: 'skipped' };
    return { ...base, status: s.variant !== null ? 'picked' : s.back ? 'back' : 'waiting' };
  });
  const counts: Record<ItemStatus, number> = { waiting: 0, picked: 0, back: 0, sent: 0, sentBack: 0, skipped: 0, blocked: 0, ended: 0 };
  for (const i of items) counts[i.status]++;
  // every item is resolved: picked or sent back (a skipped or waiting item is never done by itself: a skip returns it to the queue)
  const settled = items.every(i => i.status === 'sent' || i.status === 'sentBack' || i.status === 'ended');
  const stage: QueueStage = closed ? 'closed' : finished ? 'finished' : settled ? 'done' : 'open';
  return { stage, order, items, counts, events: valid };
}

/** The send-back recorded on a set (from the command line, or by a session of its own), as the fold reads it. */
export const sentBackOfSet = (set: PromptSet | null): SentBackInfo | null =>
  set?.sentBack ? { closest: set.sentBack.closest, reasons: set.sentBack.reasons, ...(set.sentBack.note ? { note: set.sentBack.note } : {}), at: set.sentBack.at, via: 'cli' } : null;

/** An item's child session and set, as the fold wants them. `set` is null when it cannot be read (deleted, or half-written). */
export function childInfoOf(session: Session, events: StoredEvent[], set: PromptSet | null): { info: ChildInfo; state: SessionState } {
  const state = foldSession(session, events);
  const shipEvent = events.find(e => e.type === 'ship');
  const noneEvent = events.find(e => e.type === 'none');
  const fromSet = sentBackOfSet(set);
  return {
    state,
    info: {
      stage: state.stage, shipped: state.shipped, shippedAt: shipEvent?.at ?? null,
      sentBack: state.sentBack ? { ...state.sentBack, at: noneEvent?.at ?? null, via: 'page' } : fromSet,
      pickedElsewhere: set && set.picked !== undefined ? set.picked : null, pickedAt: set?.pickedAt ?? null, missing: set === null,
    },
  };
}

/** Everything `wait`, `status` and `close` need, read from disk: each child's session, log and set. An unreadable child is `missing`. */
export interface LoadedChild { item: QueueItem; session: Session | null; events: StoredEvent[]; state: SessionState | null; info: ChildInfo; set: PromptSet | null }

export function loadChildren(project: string, queue: Queue): LoadedChild[] {
  return queue.items.map(item => {
    let session: Session | null = null, events: StoredEvent[] = [], set: PromptSet | null = null;
    try { session = readSession(project, item.sessionId); events = readEvents(project, item.sessionId); } catch { /* the child is gone */ }
    try { set = readSet(project, item.setId); } catch { /* the set is gone */ }
    if (!session) return { item, session, events, state: null, set, info: { stage: 'abandoned', sentBack: null, shipped: null, shippedAt: null, pickedElsewhere: set?.picked ?? null, pickedAt: set?.pickedAt ?? null, missing: true } };
    const { info, state } = childInfoOf(session, events, set);
    return { item, session, events, state, set, info };
  });
}

export const childrenMap = (loaded: LoadedChild[]): Record<number, ChildInfo> => Object.fromEntries(loaded.map(c => [c.item.n, c.info]));

/** The item the page opens on: the first in rail order still to be decided, then a chosen one, else the first. */
export function currentItem(state: QueueState): number {
  const by = (statuses: ItemStatus[]) => state.order.find(n => statuses.includes(state.items[n - 1].status));
  return by(['waiting', 'blocked', 'skipped']) ?? by(['picked']) ?? state.order[0];
}

/**
 * The picks delivered so far, in the order `reading wait` hands them out: by when each was recorded (the child's ship, or
 * the set's pick when it happened in the CLI), ties by item number. `--since` counts into this list, so it must only ever grow at the end.
 */
export function rankedPicks(state: QueueState): Array<{ n: number; variant: number; at: string; via: 'page' | 'cli' }> {
  return state.items
    .filter(i => i.status === 'sent' && i.sentVariant !== null)
    .map(i => ({ n: i.n, variant: i.sentVariant!, at: i.sentAt ?? '', via: i.via! }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.n - b.n);
}

/**
 * The outcomes `reading wait` hands out, picks and send-backs together in one order (when each was recorded, ties by item number):
 * the cursor counts into this list, so it must only ever grow at the end. With no send-back in the queue it is `rankedPicks` exactly.
 */
export type Outcome = { n: number; at: string; via: 'page' | 'cli' } & ({ kind: 'pick'; variant: number } | { kind: 'none' });
export function rankedOutcomes(state: QueueState): Outcome[] {
  const out: Outcome[] = rankedPicks(state).map(p => ({ kind: 'pick' as const, ...p }));
  for (const i of state.items) if (i.status === 'sentBack' && i.sentBack) out.push({ kind: 'none', n: i.n, at: i.sentAt ?? '', via: i.via ?? 'page' });
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.n - b.n);
}

// ---- files ----

const noQueue = (project: string, id: string) => new ProseError('E_NOT_FOUND', `No queue ${id} in ${project}`, { hint: 'prose reading list shows the queues' });

export function queueExists(project: string, id: string): boolean {
  try { validId(id, 'Queue id'); } catch { return false; }
  return existsSync(join(queueDir(project, id), 'queue.json'));
}

function parseQueue(file: string, text: string): Queue {
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch (e) { throw new ProseError('E_SCHEMA', `${file} is not valid JSON: ${(e as Error).message}`); }
  const parsed = QueueSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProseError('E_SCHEMA', `${file}: ${issue.message}`, { pointer: '/' + issue.path.join('/') });
  }
  return parsed.data;
}

export function readQueue(project: string, id: string): Queue {
  const file = join(queueDir(project, id), 'queue.json');
  if (!existsSync(file)) throw noQueue(project, id);
  return parseQueue(file, readFileSync(file, 'utf8'));
}

/** `readQueue` with async fs, for a server. */
export async function readQueueAsync(project: string, id: string): Promise<Queue> {
  const file = join(queueDir(project, id), 'queue.json');
  let text: string;
  try { text = await readFile(file, 'utf8'); } catch { throw noQueue(project, id); }
  return parseQueue(file, text);
}

/** Create the queue directory with an empty log and `queue.json`; refuses an id that exists. Written last, after the child sessions. */
export function writeQueue(project: string, queue: Omit<Queue, 'schema'>): Queue {
  const parsed = QueueSchema.safeParse({ schema: 'prose/queue@1', ...queue });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProseError('E_SCHEMA', `Invalid queue: ${issue.message}`, { pointer: '/' + issue.path.join('/') });
  }
  const dir = queueDir(project, queue.id);
  if (existsSync(dir)) throw new ProseError('E_CONFLICT', `Queue ${queue.id} already exists`);
  mkdirSync(queuesDir(project), { recursive: true });
  mkdirSync(dir);
  writeFileAtomic(join(dir, 'events.jsonl'), '');
  writeFileAtomic(join(dir, 'queue.json'), JSON.stringify(parsed.data, null, 2) + '\n');
  return parsed.data;
}

const readText = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const readTextAsync = (file: string): Promise<string> => readFile(file, 'utf8').catch(e => { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw e; });

/** The stored events in file order; a line that is not valid JSON, not a known event, or lacks `at` and `seq` is skipped and counted. */
export function parseQueueEvents(text: string): { events: StoredQueueEvent[]; skipped: number } {
  const events: StoredQueueEvent[] = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const { at, seq, ...raw } = JSON.parse(line);
      const body = QueueEventSchema.safeParse(raw);
      if (body.success && typeof at === 'string' && Number.isInteger(seq) && seq >= 1) events.push({ ...body.data, at, seq });
      else skipped++;
    } catch { skipped++; }
  }
  return { events, skipped };
}

export const readQueueEventsDetailed = (project: string, id: string) => parseQueueEvents(readText(join(queueDir(project, id), 'events.jsonl')));
export const readQueueEvents = (project: string, id: string): StoredQueueEvent[] => readQueueEventsDetailed(project, id).events;

function validEvent(raw: unknown): QueueEvent {
  const parsed = QueueEventSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProseError('E_SCHEMA', `Invalid queue event: ${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`.slice(0, 200), { pointer: '/' + issue.path.join('/') });
  }
  return parsed.data;
}

const full = () => Object.assign(new ProseError('E_SERVER', 'queue is full', { hint: 'Send what is chosen and finish, or open a new queue' }), { status: 429 });

export interface Appended { stored: StoredQueueEvent; duplicate: boolean }

/** The line to append for `input` given the log as read: a retry (same type and event id, or the same send id) is a duplicate and appends nothing. */
function planAppend(text: string, input: QueueEvent): { stored: StoredQueueEvent; chunk: string; duplicate: boolean } {
  const { events } = parseQueueEvents(text);
  const same = (e: StoredQueueEvent) => e.type === input.type && (
    input.type === 'send' ? (e as { sendId?: string }).sendId === input.sendId
      : input.eventId !== undefined && e.eventId === input.eventId);
  const prior = events.find(same);
  if (prior) return { stored: prior, chunk: '', duplicate: true };
  if (COUNTED.has(input.type) && events.length >= MAX_QUEUE_EVENTS) throw full();
  const stored = { ...input, at: new Date().toISOString(), seq: events.reduce((m, x) => Math.max(m, x.seq), 0) + 1 } as StoredQueueEvent;
  return { stored, chunk: (text && !text.endsWith('\n') ? '\n' : '') + JSON.stringify(stored) + '\n', duplicate: false };
}

const lockWhat = (project: string, id: string) => ({ noun: 'queue', id, project });

/** Append one event under the queue's lock (the CLI and the server are different processes); a torn last line is terminated first. Synchronous: for the command line. */
export function appendQueueEvent(project: string, id: string, raw: unknown): Appended {
  const input = validEvent(raw);
  const dir = queueDir(project, id);
  if (!existsSync(join(dir, 'queue.json'))) throw noQueue(project, id);
  return withDirLock(dir, lockWhat(project, id), () => {
    const file = join(dir, 'events.jsonl');
    const { stored, chunk, duplicate } = planAppend(readText(file), input);
    if (chunk) appendFileSync(file, chunk);
    return { stored, duplicate };
  });
}

/** `appendQueueEvent` for a server: an async lock wait and async fs. */
export async function appendQueueEventAsync(project: string, id: string, raw: unknown): Promise<Appended> {
  const input = validEvent(raw);
  const dir = queueDir(project, id);
  if (!existsSync(join(dir, 'queue.json'))) throw noQueue(project, id);
  return withDirLockAsync(dir, lockWhat(project, id), async () => {
    const file = join(dir, 'events.jsonl');
    const { stored, chunk, duplicate } = planAppend(await readTextAsync(file), input);
    if (chunk) await appendFile(file, chunk);
    return { stored, duplicate };
  });
}
