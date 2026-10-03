// Reading sessions: the variants an owner reads on the LAN page, and an append-only event log folded into state.
// Only explicit judgements (duels, the ship) become taste verdicts, and that happens through the CLI; keeps, duds,
// plays, notes and peeks are engagement. Pattern source: agent-beeps' audition session, adapted for text.
//
// Files, under `<project>/.agent-prose/sessions/<id>/`:
//   session.json  the frozen session (what was shown, the hashes sealed at predict time); written once, atomically
//   events.jsonl  one JSON event per line, appended under a lock after folding the log and checking the transition
//   reveal.json   written atomically at ship; the page serves it only once the session has shipped
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { access, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ProseError } from '../errors.ts';
import { KNOWN_DIRECTIONS } from '../owner/directions.ts';
import { withDirLock, withDirLockAsync, writeFileAtomic, writeFileAtomicAsync } from '../owner/fsutil.ts';
import { EVENT_ID_RE, newId, sessionDir, sessionsDir, validId } from '../owner/paths.ts';

const Index = z.number().int().min(1);
/** A lineup names at most this many variants in each list (a set has at most 6; later rounds add more, never near this). */
const MAX_LINEUP = 50;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const SessionCandidateSchema = z.strictObject({
  /** The index the session and the page use; unique across rounds. */
  index: Index,
  /** The variant number inside the candidate's own set when it differs from `index` (a later round's set numbers 1..n). */
  variant: Index.optional(),
  name: z.string().min(1),
  direction: z.string().nullable(),
  round: z.number().int().min(0),
});
export type SessionCandidate = z.infer<typeof SessionCandidateSchema>;
/** A round's candidate carries the sha256 of its text, frozen by the CLI when it appended the round. */
export const RoundCandidateSchema = SessionCandidateSchema.extend({ hash: Sha256 });

/** The variant number of a candidate inside its own set. */
export const variantOf = (c: SessionCandidate): number => c.variant ?? c.index;

export const SessionSchema = z.strictObject({
  schema: z.literal('prose/session@1'),
  id: z.string(),
  setId: z.string(),
  project: z.string(),
  form: z.string(),
  register: z.string().nullable(),
  prompt: z.string(),
  createdAt: z.string(),
  /** The set's frozen shown indexes (from the sealed prediction, or the check's keep list for a no-predict session). */
  shown: z.array(Index),
  /** variant index -> sha256 of the file, frozen at predict time; a variant that no longer matches cannot be chosen. */
  hashes: z.record(z.string(), Sha256),
  /** The draft's declared target, or null. */
  target: z.strictObject({ minutes: z.number().positive().optional(), words: z.number().positive().optional() }).nullable(),
  /** Words per minute as measured by the CLI, or null when the form has none. */
  wpm: z.number().positive().nullable(),
  candidates: z.array(SessionCandidateSchema).min(1),
  /** False for a session opened with --no-predict (the agent sealed no guess); absent in a session older than the flag. */
  predicted: z.boolean().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

const Direction = z.enum(KNOWN_DIRECTIONS as [string, ...string[]]);
/** The page's own id for an event, so a retried POST is recognised. */
const EventId = z.string().regex(EVENT_ID_RE, 'must be 1-100 letters, digits, dot, underscore, colon or hyphen');

export const EventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('play'), index: Index, mode: z.string().max(20), eventId: EventId.optional() }),
  /** `order` is the randomised display order; `kept` empty means every lineup member not marked dud. */
  z.strictObject({ type: z.literal('lineup'), kept: z.array(z.number().int()).max(MAX_LINEUP), duds: z.array(z.number().int()).max(MAX_LINEUP), order: z.array(z.number().int()).max(MAX_LINEUP), eventId: EventId.optional() }),
  z.strictObject({ type: z.literal('duel'), a: Index, b: Index, outcome: z.enum(['a', 'b', 'tie', 'bothBad']), position: z.enum(['ab', 'ba']), eventId: EventId }),
  z.strictObject({ type: z.literal('note'), index: Index, unit: z.number().int().min(0), text: z.string().min(1).max(500), eventId: EventId.optional() }),
  /** The owner opened "what changed?" for a variant. */
  z.strictObject({ type: z.literal('peek'), index: Index, eventId: EventId.optional() }),
  z.strictObject({ type: z.literal('refine'), champion: Index, directions: z.array(Direction).max(4), like: Index.nullable(), eventId: EventId.optional() }),
  /** Agent only. */
  z.strictObject({ type: z.literal('round'), n: z.number().int().min(1), setId: z.string().min(1), candidates: z.array(RoundCandidateSchema).min(1) }),
  z.strictObject({ type: z.literal('ship'), champion: Index, eventId: EventId.optional() }),
  z.strictObject({ type: z.literal('abandon'), eventId: EventId.optional() }),
]);
export type SessionEvent = z.infer<typeof EventSchema>;
/** A round event stored before candidates carried a hash: still read, never written. */
const LegacyRoundSchema = z.strictObject({
  type: z.literal('round'), n: z.number().int().min(1), setId: z.string().min(1),
  candidates: z.array(SessionCandidateSchema.extend({ hash: Sha256.optional() })).min(1),
});
/** Events the owner's page may send; rounds come only from the agent's CLI. */
export const CLIENT_EVENTS: ReadonlySet<string> = new Set(['play', 'lineup', 'duel', 'note', 'peek', 'refine', 'ship', 'abandon']);
export type StoredEvent = SessionEvent & { at: string; seq: number };

export interface SessionNote { index: number; unit: number; text: string; round: number }

export interface SessionState {
  stage: 'lineup' | 'duel' | 'refine' | 'waiting' | 'shipped' | 'abandoned';
  round: number;
  candidates: SessionCandidate[];
  /** Variants on offer in the current round's lineup (the champion is pinned after round 0). */
  lineup: number[];
  kept: number[];
  duds: number[];
  /** The pinned champion after round 0, then the kept variants. */
  shortlist: number[];
  duels: Array<{ a: number; b: number; outcome: 'a' | 'b' | 'tie' | 'bothBad' }>;
  champion: number | null;
  pendingRefine: { champion: number; directions: string[]; like: number | null } | null;
  shipped: number | null;
  notes: SessionNote[];
  /** Variants whose "what changed?" the owner opened. */
  peeked: number[];
  events: number;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const unique = (xs: number[]) => [...new Set(xs)];

/** Lineup marks reduced to what is on offer: outside indexes dropped, duplicates removed, a dud never also kept. */
function marks(lineup: number[], e: { kept: number[]; duds: number[] }, pinned: number[]): { kept: number[]; duds: number[] } {
  const duds = unique(e.duds).filter(i => lineup.includes(i));
  const explicit = unique(e.kept).filter(i => lineup.includes(i) && !duds.includes(i));
  return { duds, kept: explicit.length ? explicit : lineup.filter(i => !duds.includes(i) && !pinned.includes(i)) };
}

const pinnedOf = (s: Pick<SessionState, 'round' | 'champion'>): number[] => (s.round > 0 && s.champion !== null ? [s.champion] : []);

/** The pure fold of an event log into the current state. Events after a ship or an abandon are ignored. */
export function foldSession(session: Session, events: StoredEvent[]): SessionState {
  const s: SessionState = {
    stage: 'lineup', round: 0, candidates: [...session.candidates], lineup: session.candidates.map(c => c.index),
    kept: [], duds: [], shortlist: [], duels: [], champion: null, pendingRefine: null, shipped: null,
    notes: [], peeked: [], events: events.length,
  };
  const score = new Map<number, number>();
  const bump = (i: number, by: number) => score.set(i, (score.get(i) ?? 0) + by);
  const championOf = () => [...s.shortlist].sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || s.shortlist.indexOf(a) - s.shortlist.indexOf(b))[0] ?? null;
  for (const e of events) {
    if (s.stage === 'shipped' || s.stage === 'abandoned') break;
    switch (e.type) {
      case 'lineup': {
        const pinned = pinnedOf(s);
        Object.assign(s, marks(s.lineup, e, pinned));
        s.shortlist = unique([...pinned, ...s.kept]);
        s.duels = [];
        score.clear();
        s.champion = championOf();
        s.stage = nextPair({ ...s, stage: 'duel' }) ? 'duel' : 'refine';
        break;
      }
      case 'duel':
        s.duels.push({ a: e.a, b: e.b, outcome: e.outcome });
        // tie scores nothing; bothBad scores both down by one
        if (e.outcome === 'a') { bump(e.a, 1); bump(e.b, -1); }
        else if (e.outcome === 'b') { bump(e.b, 1); bump(e.a, -1); }
        else if (e.outcome === 'bothBad') { bump(e.a, -1); bump(e.b, -1); }
        s.champion = championOf();
        if (!nextPair({ ...s, stage: 'duel' })) s.stage = 'refine';
        break;
      case 'note': s.notes.push({ index: e.index, unit: e.unit, text: e.text, round: s.round }); break;
      case 'peek': if (!s.peeked.includes(e.index)) s.peeked.push(e.index); break;
      case 'refine':
        s.pendingRefine = { champion: e.champion, directions: e.directions, like: e.like };
        s.champion = e.champion;
        s.stage = 'waiting';
        break;
      case 'round':
        s.round = e.n;
        s.candidates.push(...e.candidates);
        s.lineup = [...(s.champion !== null ? [s.champion] : []), ...e.candidates.map(c => c.index)];
        s.kept = []; s.duds = []; s.shortlist = []; s.duels = [];
        s.pendingRefine = null;
        s.stage = 'lineup';
        break;
      case 'ship': s.shipped = e.champion; s.champion = e.champion; s.stage = 'shipped'; break;
      case 'abandon': s.stage = 'abandoned'; break;
      case 'play': break; // engagement only
    }
  }
  return s;
}

/**
 * The next head-to-head: among the shortlist, the pair not yet asked whose members have been compared least (sum of
 * their comparison counts), the earliest in shortlist order on a tie. Deterministic given the state; never a repeat;
 * null outside the duel stage or when every pair has been asked. (M3c replaces this with uncertainty sampling.)
 */
export function nextPair(state: SessionState): [number, number] | null {
  if (state.stage !== 'duel') return null;
  const asked = new Set(state.duels.map(d => pairKey(d.a, d.b)));
  const seen = new Map<number, number>();
  for (const d of state.duels) for (const i of [d.a, d.b]) seen.set(i, (seen.get(i) ?? 0) + 1);
  let best: [number, number] | null = null;
  let bestCost = Infinity;
  for (let i = 0; i < state.shortlist.length; i++) {
    for (let j = i + 1; j < state.shortlist.length; j++) {
      const [a, b] = [state.shortlist[i], state.shortlist[j]];
      if (asked.has(pairKey(a, b))) continue;
      const cost = (seen.get(a) ?? 0) + (seen.get(b) ?? 0);
      if (cost < bestCost) { best = [a, b]; bestCost = cost; }
    }
  }
  return best;
}

const conflict = (message: string, hint: string) => new ProseError('E_CONFLICT', message, { hint });

/**
 * Which event is accepted in which stage. Returns the event to store: lineup marks are normalised (indexes outside
 * the lineup dropped, duplicates removed, the display order completed). Unknown variant indexes are E_SCHEMA; an
 * event the stage does not accept, or a variant that is not on the shortlist, is E_CONFLICT with a hint.
 */
export function checkTransition(state: SessionState, e: SessionEvent): SessionEvent {
  const { stage } = state;
  if (stage === 'shipped' || stage === 'abandoned') throw conflict(`${e.type} is not accepted: the session is ${stage}`, 'Open a new reading session');
  const known = new Set(state.candidates.map(c => c.index));
  const exists = (i: number) => { if (!known.has(i)) throw new ProseError('E_SCHEMA', `variant ${i} is not in this session`, { hint: `Variants are ${[...known].join(', ')}` }); };
  const need = (ok: boolean, hint: string) => { if (!ok) throw conflict(`${e.type} is not accepted in the ${stage} stage`, hint); };
  const onShortlist = (i: number) => { if (!state.shortlist.includes(i)) throw conflict(`variant ${i} is not on the shortlist`, `The shortlist is ${state.shortlist.join(', ') || 'empty until the lineup is submitted'}`); };
  switch (e.type) {
    case 'play': case 'peek': case 'note': exists(e.index); return e;
    case 'abandon': case 'round': break;
    case 'lineup': break;
    case 'duel': exists(e.a); exists(e.b); break;
    case 'refine': case 'ship': exists(e.champion); break;
  }
  switch (e.type) {
    case 'lineup': {
      need(stage === 'lineup', 'The lineup comes first, once per round');
      const m = marks(state.lineup, e, pinnedOf(state));
      if (e.kept.some(i => e.duds.includes(i))) throw conflict('a variant cannot be both kept and a dud', 'Mark each variant keep or dud, not both');
      if (!pinnedOf(state).length && m.kept.length === 0) throw conflict('every variant is marked a dud; keep at least one', 'Keep one variant, or abandon the session if none work');
      const order = unique(e.order).filter(i => state.lineup.includes(i));
      return { type: 'lineup', ...(e.eventId !== undefined ? { eventId: e.eventId } : {}), kept: unique(e.kept).filter(i => state.lineup.includes(i)), duds: m.duds, order: [...order, ...state.lineup.filter(i => !order.includes(i))] };
    }
    case 'duel': {
      need(stage === 'duel', 'Submit the lineup first; duels run among the kept variants');
      if (e.a === e.b) throw conflict('a variant cannot duel itself', 'Pick two different variants');
      onShortlist(e.a); onShortlist(e.b);
      if (state.duels.some(d => pairKey(d.a, d.b) === pairKey(e.a, e.b))) throw conflict(`${e.a} and ${e.b} have already been compared`, 'Ask the next pair');
      return e;
    }
    case 'refine':
      need(stage === 'refine', 'Refining starts once every pair has been compared');
      onShortlist(e.champion);
      if (e.like !== null) exists(e.like);
      return e;
    case 'round':
      need(stage === 'waiting', 'A round only answers a refine request');
      if (e.n !== state.round + 1) throw conflict(`round ${e.n} does not follow round ${state.round}`, `The next round is ${state.round + 1}`);
      for (const c of e.candidates) if (known.has(c.index)) throw conflict(`variant index ${c.index} already exists in the session`, 'Give the new variants unused indexes');
      return e;
    case 'ship':
      need(stage === 'duel' || stage === 'refine', 'Shipping needs a champion: submit the lineup first');
      onShortlist(e.champion);
      return e;
    default: return e;
  }
}

// ---- files ----

const readText = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const readTextAsync = (file: string): Promise<string> => readFile(file, 'utf8').catch(e => { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw e; });

export interface OpenSessionInput extends Omit<Session, 'schema' | 'id' | 'project' | 'createdAt'> { id?: string; now?: Date }

/** Create a session directory with `session.json` and an empty event log. The id is generated unless given. */
export function openSession(project: string, input: OpenSessionInput): Session {
  const { id: given, now, ...rest } = input;
  const id = given ? validId(given, 'Session id') : newId('session', now);
  const dir = sessionDir(project, id);
  if (existsSync(dir)) throw new ProseError('E_CONFLICT', `Session ${id} already exists`);
  const parsed = SessionSchema.safeParse({ schema: 'prose/session@1', id, project, createdAt: (now ?? new Date()).toISOString(), ...rest });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProseError('E_SCHEMA', `Invalid session: ${issue.message}`, { pointer: '/' + issue.path.join('/') });
  }
  mkdirSync(sessionsDir(project), { recursive: true });
  mkdirSync(dir);
  writeFileAtomic(join(dir, 'events.jsonl'), '');
  writeFileAtomic(join(dir, 'session.json'), JSON.stringify(parsed.data, null, 2) + '\n');
  return parsed.data;
}

const noSession = (project: string, id: string) => new ProseError('E_NOT_FOUND', `No session ${id} in ${project}`, { hint: 'prose reading list shows the sessions' });

export function readSession(project: string, id: string): Session {
  const file = join(sessionDir(project, id), 'session.json');
  if (!existsSync(file)) throw noSession(project, id);
  return parseSession(file, readFileSync(file, 'utf8'));
}

function parseSession(file: string, text: string): Session {
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch (e) { throw new ProseError('E_SCHEMA', `${file} is not valid JSON: ${(e as Error).message}`); }
  const parsed = SessionSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProseError('E_SCHEMA', `${file}: ${issue.message}`, { pointer: '/' + issue.path.join('/') });
  }
  return parsed.data;
}

/** The stored events, in file order. A line that is not valid JSON, not a known event, or lacks `at` and `seq` is skipped and counted. */
export function readEventsDetailed(project: string, id: string): { events: StoredEvent[]; skipped: number } {
  return parseEvents(readText(join(sessionDir(project, id), 'events.jsonl')));
}

function parseEvents(text: string): { events: StoredEvent[]; skipped: number } {
  const events: StoredEvent[] = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const { at, seq, ...raw } = JSON.parse(line);
      let body = EventSchema.safeParse(raw) as { success: boolean; data?: SessionEvent };
      if (!body.success && raw?.type === 'round') body = LegacyRoundSchema.safeParse(raw) as typeof body;
      if (body.success && typeof at === 'string' && Number.isInteger(seq) && seq >= 1) events.push({ ...body.data!, at, seq });
      else skipped++;
    } catch { skipped++; }
  }
  return { events, skipped };
}

export const readEvents = (project: string, id: string): StoredEvent[] => readEventsDetailed(project, id).events;

/** The event as the schema accepts it, or E_SCHEMA. */
function validEvent(raw: unknown): SessionEvent {
  const parsed = EventSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProseError('E_SCHEMA', `Invalid event: ${issue.message}`, { pointer: '/' + issue.path.join('/') });
  }
  return parsed.data;
}

/** The stored form of an event and the text to append for it, given the log as read. A torn last line is terminated first. */
function planAppend(session: Session, text: string, input: SessionEvent): { stored: StoredEvent; chunk: string } {
  const { events } = parseEvents(text);
  const event = checkTransition(foldSession(session, events), input);
  const stored = { ...event, at: new Date().toISOString(), seq: events.reduce((m, x) => Math.max(m, x.seq), 0) + 1 } as StoredEvent;
  return { stored, chunk: (text && !text.endsWith('\n') ? '\n' : '') + JSON.stringify(stored) + '\n' };
}

/**
 * Check the event against the folded log, then append it as one line with one appendFileSync. The read-fold-append runs
 * under a per-session lock (the CLI and the server are different processes), so two appenders never lose or duplicate
 * an event or reuse a seq. A torn last line left by a crash is terminated first, so it stays one skipped line.
 * Synchronous (it waits for the lock with a sleep): for the command line. A server uses `appendEventAsync`.
 */
export function appendEvent(project: string, id: string, raw: unknown): StoredEvent {
  const dir = sessionDir(project, id);
  const input = validEvent(raw);
  return withDirLock(dir, { noun: 'session', id, project }, () => {
    const file = join(dir, 'events.jsonl');
    const { stored, chunk } = planAppend(readSession(project, id), readText(file), input);
    appendFileSync(file, chunk);
    return stored;
  });
}

/** `appendEvent` for a server: the same check, lock rules and file format, with an async lock wait and async fs, so a held lock never stalls other requests. */
export async function appendEventAsync(project: string, id: string, raw: unknown): Promise<StoredEvent> {
  const dir = sessionDir(project, id);
  const input = validEvent(raw);
  return withDirLockAsync(dir, { noun: 'session', id, project }, async () => {
    const file = join(dir, 'events.jsonl');
    const sessionFile = join(dir, 'session.json');
    let sessionText: string;
    try { sessionText = await readFile(sessionFile, 'utf8'); } catch { throw noSession(project, id); }
    const { stored, chunk } = planAppend(parseSession(sessionFile, sessionText), await readTextAsync(file), input);
    await appendFile(file, chunk);
    return stored;
  });
}

/** The reveal written at ship, or null before it. */
export function readReveal(project: string, id: string): unknown | null {
  const file = join(sessionDir(project, id), 'reveal.json');
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

export function writeReveal(project: string, id: string, reveal: object): void {
  const dir = sessionDir(project, id);
  if (!existsSync(join(dir, 'session.json'))) throw noSession(project, id);
  writeFileAtomic(join(dir, 'reveal.json'), JSON.stringify(reveal, null, 2) + '\n');
}

/** `writeReveal` for a server: async fs, so the write never stalls other requests. */
export async function writeRevealAsync(project: string, id: string, reveal: object): Promise<void> {
  const dir = sessionDir(project, id);
  try { await access(join(dir, 'session.json')); } catch { throw noSession(project, id); }
  await writeFileAtomicAsync(join(dir, 'reveal.json'), JSON.stringify(reveal, null, 2) + '\n');
}
