// The owner's side: a LAN reading server. The page is static (runtime/reading, a fixed allow-list read once at start);
// the JSON API is token-guarded, reads only files the CLI already wrote, and never serves the sealed prediction before
// the owner ships. Judgement writes (a duel, the ship) shell out to the CLI with the async execFile, so the set locks,
// atomicity, dedupe and the sealed-prediction rules stay in one place. A request handler never waits synchronously on
// a lock, a child process or a timer: the session lock is taken with withDirLockAsync (an awaited timer) and the log
// and reveal are written with async fs. What it does still do synchronously is small local reads (session.json, the
// event log, set files, server.json), kept cheap by stat-keyed caches; they are not locked, and a large or slow disk
// would show up as latency, not as a stall behind another process.
// Pattern source: agent-beeps' audition server, adapted for text.
import { execFile } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { hostname, networkInterfaces } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { ProseError, type ErrorCode } from '../errors.ts';
import { writeFileAtomic } from '../owner/fsutil.ts';
import { EVENT_ID_RE, ID_RE, projectKey, proseHome, queueDir, sessionDir, sessionsDir, setDir, strikeDir, validId } from '../owner/paths.ts';
import { KNOWN_DIRECTIONS } from '../owner/directions.ts';
import { readPrediction, textHash } from '../owner/prediction.ts';
import { draftHash, originalLines, type Original } from '../owner/original.ts';
import { basePath, briefView, readSet, variantPath, type PromptSet } from '../owner/sets.ts';
import { NONE_REASON_LABELS, newFeedback, type NoneReason } from '../owner/feedback.ts';
import {
  CLIENT_EVENTS, EventSchema, appendEventAsync, checkTransition, foldSession, nextPair, readEvents, readReveal, readSession, variantOf, writeRevealAsync,
  type PairChooser, type Session, type SessionCandidate, type SessionEvent, type SessionState, type StoredEvent,
} from './session.ts';
import { TasteDuels, type DuelCandidateSource } from './taste.ts';
import { layoutOf, type Layout, type UnitLayout } from './units.ts';
import { buildCompare, unitCells, type Compare } from './compare.ts';
import {
  QueueSchema, appendQueueEventAsync, childInfoOf, currentItem, foldQueue, parseQueueEvents, rankedOutcomes, sentBackOfSet,
  type ChildInfo, type Queue, type QueueItem, type QueueState, type StoredQueueEvent,
} from './queue.ts';
import { parseDocument } from '../document.ts';
import { strikeLines, type StrikeLine } from '../strike/lines.ts';
import { removedView } from '../strike/apply.ts';
import { planRemoval, verifiedLines } from '../strike/plan.ts';
import { MAX_NOTE, STRIKE_REASONS, foldStrikes, parseStrikeLog, strikeKey, undoableApply, type StrikeEvent } from '../strike/store.ts';

export const DEFAULT_PORT = 47311;
/** Bump when routes change: a running server of another API level is replaced, not reused. */
export const SERVER_API = 5;
const PROBE_MS = 1500;
/** Connections the HTTP server accepts at once, and how long a client may take to send headers, a whole request, or sit idle. */
const MAX_CONNECTIONS = 200;
const HEADERS_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;
const KEEP_ALIVE_MS = 5_000;
/**
 * Stored events after which engagement events (play, peek, note) are refused with 429 "session is full". Judgements
 * (lineup, duel, refine, ship, abandon) are bounded by the transition table and always accepted, so a full session can
 * still be finished.
 */
export const MAX_EVENTS_PER_SESSION = 2000;
/** Notes one variant can take. */
export const MAX_NOTES_PER_VARIANT = 100;
const ENGAGEMENT = new Set(['play', 'peek', 'note']);
/** What a batch item's own event route accepts: nothing that judges. A pick only goes through Send. */
const BATCH_EVENTS: ReadonlySet<string> = new Set(['play', 'peek']);
/** What the page sends to stage a choice, skip an item, send the picks and finish the review: strict, every number bounded. */
const ItemNo = z.number().int().min(1).max(50);
const ChooseBody = z.strictObject({ item: ItemNo, variant: z.number().int().min(1).nullable(), passes: z.array(z.number().int().min(1)).max(6), eventId: z.string().regex(EVENT_ID_RE) });
const SkipBody = z.strictObject({ item: ItemNo, eventId: z.string().regex(EVENT_ID_RE) });
/** A send id: short enough that `<sendId>-<n>-l` is still a valid event id. */
const SendBody = z.strictObject({ sendId: z.string().regex(EVENT_ID_RE).max(80), eventId: z.string().regex(EVENT_ID_RE).optional() });
const FinishBody = z.strictObject({ eventId: z.string().regex(EVENT_ID_RE) });
/** "None of these" for a batch item: staged like a choice. The reasons are checked against the fixed list, the note trimmed and capped (feedback.ts), before anything is written. */
const SendbackBody = z.strictObject({ item: ItemNo, closest: z.number().int().min(1).nullable(), reasons: z.array(z.string().max(40)).max(20), note: z.string().max(4000).optional(), eventId: z.string().regex(EVENT_ID_RE) });
/** The request body cap for POST /event. */
const MAX_BODY = 64 * 1024;
/** What the page sends to strike a line, and to take a strike back: strict, every field checked before the CLI is asked. */
const StrikeBody = z.strictObject({
  ref: z.string().regex(/^\d+(-\d+)?$/).max(20), reason: z.enum(STRIKE_REASONS), note: z.string().min(1).max(MAX_NOTE).optional(),
  draftHash: z.string().regex(/^[0-9a-f]{64}$/), eventId: z.string().regex(EVENT_ID_RE),
});
const ClearBody = z.strictObject({ strike: z.string().regex(/^s\d+$/).max(12), eventId: z.string().regex(EVENT_ID_RE) });
/** Apply carries the digest of the plan the owner saw; undo names the removal the page shows (the CLI refuses any other). */
const ApplyBody = z.strictObject({ digest: z.string().regex(/^[0-9a-f]{64}$/), eventId: z.string().regex(EVENT_ID_RE) });
const UndoBody = z.strictObject({ apply: z.string().regex(/^a\d+$/).max(12), eventId: z.string().regex(EVENT_ID_RE) });
/** A CLI write that has not finished by then is given up on (a held set lock alone is given up on after 5 s). */
const CLI_TIMEOUT_MS = 15_000;
/** The CLI entry, next to the code: the managed runtime copy finds its own. */
const PROSE_CLI = join(import.meta.dirname, '..', '..', 'scripts', 'prose.mjs');

// ---- the error log ----

/** What an error answer tells the page to do. The log is a file in the prose home; the path is not sent to the page. */
export const SERVER_LOG_HINT = 'See server.log in the prose home folder (prose serve --status shows its path)';
export const serverLogFile = () => join(proseHome(), 'server.log');
/** A log over this size is emptied when a server starts. */
const LOG_CAP_BYTES = 1024 * 1024;

/** Set while a server that was given a `logFile` is listening: where error lines go, and the token to keep out of them. */
let logSink: { file: string; token: string } | null = null;

function openLog(file: string, token: string): void {
  try {
    mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 });
    if (existsSync(file) && statSync(file).size > LOG_CAP_BYTES) truncateSync(file, 0);
    else if (!existsSync(file)) writeFileSync(file, '', { mode: 0o600 });
    logSink = { file, token };
  } catch { logSink = null; /* a log that cannot be opened never stops the server */ }
}

/** One JSON error line on stderr and, when a log file is open, appended to it with a time. The token never appears in either. */
function logError(message: string, code = 'E_SERVER'): void {
  const token = logSink?.token;
  const text = token ? message.split(token).join('<token>') : message;
  const line = JSON.stringify({ error: { code, message: text } });
  console.error(line);
  if (!logSink) return;
  try { appendFileSync(logSink.file, JSON.stringify({ at: new Date().toISOString(), ...JSON.parse(line) }) + '\n'); } catch { /* best effort */ }
}

// ---- running the CLI ----

/** Runs `prose <args>` and resolves with its JSON output; a failure rejects with a ProseError (see runProse). */
export type RunProse = (args: string[], opts: { cwd: string; timeoutMs?: number }) => Promise<unknown>;

/** Error codes the CLI can report that the page is told about as they are; any other failure is E_SERVER. */
const PASS_CODES = new Set<ErrorCode>(['E_CONFLICT', 'E_USAGE', 'E_SCHEMA', 'E_NOT_FOUND', 'E_PREDICTION_REQUIRED']);

/** The CLI's one-line JSON error (stderr, or stdout), or null. */
function cliError(...streams: string[]): { code: string; message: string; hint?: string } | null {
  for (const text of streams) {
    for (const line of text.trim().split('\n').reverse()) {
      try {
        const e = JSON.parse(line)?.error;
        if (e && typeof e.code === 'string' && typeof e.message === 'string') return { code: e.code, message: e.message, ...(typeof e.hint === 'string' ? { hint: e.hint } : {}) };
      } catch { /* not a JSON line */ }
    }
  }
  return null;
}

/**
 * Run the CLI with the async `execFile` (never a sync variant: a waiting lock or a slow write must not stall the
 * server). Same node, this repo's scripts/prose.mjs, the environment passed through (AGENT_PROSE_HOME), the project as
 * the working directory. Success: the parsed JSON on stdout. Failure: a ProseError with the CLI's own code, message
 * and hint when it is one the page should see (conflict, usage, schema, not found, prediction required); a timeout,
 * an oversize output, unparseable output or any other code is E_SERVER.
 */
export const runProse: RunProse = (args, opts) => new Promise((ok, fail) => {
  const server = (message: string) => new ProseError('E_SERVER', message, { hint: SERVER_LOG_HINT });
  execFile(process.execPath, [PROSE_CLI, ...args], {
    cwd: opts.cwd, env: process.env, timeout: opts.timeoutMs ?? CLI_TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true, encoding: 'utf8',
  }, (err, stdout, stderr) => {
    if (!err) {
      try { return ok(JSON.parse(stdout)); }
      catch { return fail(server('the prose command printed something that is not JSON')); }
    }
    if ((err as { killed?: boolean }).killed) return fail(server(`the prose command did not finish in ${(opts.timeoutMs ?? CLI_TIMEOUT_MS) / 1000} s`));
    const e = cliError(stderr, stdout);
    if (e && PASS_CODES.has(e.code as ErrorCode)) return fail(new ProseError(e.code as ErrorCode, e.message, e.hint !== undefined ? { hint: e.hint } : {}));
    const why = e ? `${e.code} ${e.message}` : (err.message ?? '').split('\n')[0];
    logError(`prose ${args.slice(0, 2).join(' ')} failed: ${why}`);
    fail(server('the prose command failed'));
  });
});

/** Where the page files live: next to the code, so the managed runtime copy finds its own. */
export const RUNTIME_DIR = join(import.meta.dirname, '..', '..', 'runtime', 'reading');

// ---- server.json, token, projects ----

export interface ServerInfo { pid: number; port: number; host: string; token: string; projects: string[]; startedAt: string; url: string; api: number }

const InfoSchema = z.object({
  pid: z.number().int(), port: z.number().int(), host: z.string(), token: z.string().min(1),
  projects: z.array(z.string()), startedAt: z.string(), url: z.string(), api: z.number().int().optional(),
});

export const serverInfoFile = () => join(proseHome(), 'server.json');

/**
 * Stopping a server forgets the process, not the owner's setup: the token and the registered projects stay, so a
 * bookmarked link works again after the next start. A record with pid 0 is "no server running".
 */
export const stoppedInfo = (info: ServerInfo): ServerInfo => ({ ...info, pid: 0, port: 0, host: '', url: '' });
export const isStopped = (info: ServerInfo): boolean => info.pid === 0;

/** Mark the recorded server stopped (token and projects kept), when there is a record. */
export function recordStopped(): void {
  const info = readServerInfo();
  if (info && !isStopped(info)) writeServerInfo(stoppedInfo(info));
}

/** The recorded server, or null when the file is absent or not a server record. `api` is 0 for a record without one. */
export function readServerInfo(): ServerInfo | null {
  try {
    const parsed = InfoSchema.safeParse(JSON.parse(readFileSync(serverInfoFile(), 'utf8')));
    return parsed.success ? { ...parsed.data, api: parsed.data.api ?? 0 } : null;
  } catch { return null; }
}

/**
 * readServerInfo for the polling path: one stat decides whether the file changed (another process, such as
 * `prose reading open`, registers projects by rewriting it), so the parse happens only after a change. A write from
 * this process drops the entry at once.
 */
let infoCache: { file: string; key: string; info: ServerInfo | null } | null = null;
export function readServerInfoCached(): ServerInfo | null {
  const file = serverInfoFile();
  let key = 'absent';
  try { const s = statSync(file); key = `${s.mtimeMs}:${s.size}`; } catch { /* absent */ }
  if (infoCache && infoCache.file === file && infoCache.key === key) return infoCache.info;
  const info = readServerInfo();
  infoCache = { file, key, info };
  return info;
}

export function writeServerInfo(info: ServerInfo): void {
  // The file holds the access token: owner-only, in an owner-only directory when this call creates it.
  mkdirSync(proseHome(), { recursive: true, mode: 0o700 });
  writeFileAtomic(serverInfoFile(), JSON.stringify(info, null, 2) + '\n', { mode: 0o600 });
  infoCache = null;
}

/** Persistent token: reused across restarts so a link the owner bookmarked keeps working. */
export const serverToken = (): string => readServerInfo()?.token ?? randomBytes(16).toString('hex');

const uniqueProjects = (roots: string[]): string[] => {
  const seen = new Set<string>();
  return roots.filter(r => { const k = projectKey(r); if (seen.has(k)) return false; seen.add(k); return true; });
};

/**
 * Record a project root so a running server serves its sessions. Only absolute paths are accepted (resolved, deduped
 * by projectKey, so case does not matter on Windows). Returns false when no server has been started yet: a server
 * started later is given its projects by whoever starts it.
 */
export function registerProject(root: string): boolean {
  if (!isAbsolute(root)) throw new ProseError('E_USAGE', 'A project root must be an absolute path');
  const info = readServerInfo();
  if (!info) return false;
  const projects = uniqueProjects([...info.projects, resolve(root)]);
  if (projects.length !== info.projects.length) writeServerInfo({ ...info, projects });
  return true;
}

export const publicHost = () => hostname().toLowerCase();

// ---- addresses ----

const VIRTUAL = /vethernet|wsl|hyper-v|docker|vbox|virtualbox|vmware|vmnet|loopback|utun|bridge/i;
const PHYSICAL = /wi-?fi|wlan|ethernet|^en\d|^eth\d|^wl/i;
const isPrivate = (a: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
const isTailscale = (a: string) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a);

/**
 * IPv4 addresses other devices can reach, best first: the physical LAN (Wi-Fi/Ethernet), other private networks, then
 * Tailscale, then anything else. Virtual adapters (WSL, Hyper-V, Docker, VMware, VirtualBox), loopback and link-local
 * addresses are unreachable from other machines and are left out.
 */
export function rankAddresses(ifaces: ReturnType<typeof networkInterfaces> = networkInterfaces()): { address: string; label: string }[] {
  const out: { address: string; label: string; score: number }[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.') || VIRTUAL.test(name)) continue;
      if (isTailscale(a.address)) out.push({ address: a.address, label: 'tailscale', score: 2 });
      else if (isPrivate(a.address)) out.push({ address: a.address, label: 'lan', score: PHYSICAL.test(name) ? 0 : 1 });
      else out.push({ address: a.address, label: 'other', score: 3 });
    }
  }
  return out.sort((a, b) => a.score - b.score).map(({ address, label }) => ({ address, label }));
}

/** Best address for devices (phones) that cannot resolve the machine name. */
export const lanAddress = (): string | null => rankAddresses()[0]?.address ?? null;

// ---- probing and the start decision ----

/** True when the recorded server answers /api/health as that process, with the recorded token accepted. A stopped record never does. */
export async function probe(info: ServerInfo | null): Promise<boolean> {
  if (!info || isStopped(info)) return false;
  try {
    const host = info.host === '0.0.0.0' || info.host === '::' ? '127.0.0.1' : info.host;
    const r = await fetch(`http://${host}:${info.port}/api/health?t=${info.token}`, { signal: AbortSignal.timeout(PROBE_MS) });
    const body = await r.json() as { ok?: boolean; authed?: boolean; pid?: number };
    return !!(body.ok && body.authed && body.pid === info.pid);
  } catch { return false; }
}

/** What a caller asked of the server: `local` true for 127.0.0.1 only, false for the network, absent for "whatever runs"; `port` an explicit port (0 means any). */
export interface WantedServer { local?: boolean; port?: number }

/**
 * What `prose serve` should do given the recorded server and whether it answered its probe: start one (none, or the
 * recorded one is gone), reuse the live one, or replace a live one that is not what was asked for: another API level
 * (it would serve other routes), the other bind (--local against a network server, and `serve` without --local against
 * a local one, so the link and the notice always match the real bind), or another explicit port.
 */
export function serverAction(info: ServerInfo | null, wantedApi: number, probeOk: boolean, want: WantedServer = {}): 'start' | 'reuse' | 'replace' {
  if (!info || isStopped(info) || !probeOk) return 'start';
  if ((info.api ?? 0) !== wantedApi) return 'replace';
  const isLocalBind = info.host === '127.0.0.1';
  if (want.local !== undefined && want.local !== isLocalBind) return 'replace';
  if (want.port !== undefined && want.port !== 0 && want.port !== info.port) return 'replace';
  return 'reuse';
}

/**
 * DNS-rebinding defence. A server bound to 127.0.0.1 answers only to the names that reach it directly
 * (`127.0.0.1:<port>`, `localhost:<port>`): a page on another site whose name resolves to 127.0.0.1 sends its own name
 * in Host and is refused. A network bind skips the check, because the names a phone may use (machine name, LAN
 * address, Tailscale name) vary and are not knowable here; the token is what guards it.
 */
export function hostAllowed(bindHost: string, port: number, host: string | undefined): boolean {
  if (bindHost !== '127.0.0.1') return true;
  const h = host?.toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}

/** Cross-site defence for a POST: an Origin, when the browser sends one, must be the page's own origin (the Host it was served from). */
export function originAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' && !!host && u.host.toLowerCase() === host.toLowerCase();
  } catch { return false; }
}

export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---- the page payload ----

const CSP = "default-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
/** The only files the server ever serves as pages, by request path; the content type is fixed per entry. */
const PAGES = {
  index: { file: 'index.html', type: 'text/html; charset=utf-8' },
  app: { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  style: { file: 'style.css', type: 'text/css; charset=utf-8' },
} as const;
type PageKey = keyof typeof PAGES;
/** The vendored fonts and their licences, by exact request path (a font fetch cannot carry the token header, so these are served without one).
 *  The files are read once at start from runtime/reading/fonts; nothing in a request is ever joined to a disk path. */
const ASSETS = {
  '/fonts/courier-prime-400.ttf': { file: 'fonts/courier-prime-400.ttf', type: 'font/ttf' },
  '/fonts/courier-prime-700.ttf': { file: 'fonts/courier-prime-700.ttf', type: 'font/ttf' },
  '/fonts/atkinson-400.ttf': { file: 'fonts/atkinson-400.ttf', type: 'font/ttf' },
  '/fonts/atkinson-700.ttf': { file: 'fonts/atkinson-700.ttf', type: 'font/ttf' },
  '/fonts/OFL-CourierPrime.txt': { file: 'fonts/OFL-CourierPrime.txt', type: 'text/plain; charset=utf-8' },
  '/fonts/OFL-Atkinson.txt': { file: 'fonts/OFL-Atkinson.txt', type: 'text/plain; charset=utf-8' },
} as const;
type AssetPath = keyof typeof ASSETS;
const isAsset = (path: string): path is AssetPath => Object.hasOwn(ASSETS, path);

/** A small deterministic generator (mulberry32) seeded from a string, so a shuffle is the same on every load. */
function seeded(seed: string): () => number {
  let a = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  };
}
export function shuffled<T>(items: T[], seed: string): T[] {
  const out = [...items];
  const rand = seeded(seed);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** A, B, ... Z, AA, AB, ... */
export const labelOf = (n: number): string => (n >= 26 ? labelOf(Math.floor(n / 26) - 1) : '') + String.fromCharCode(65 + (n % 26));

/** The agent's sealed prediction as the CLI reveals it at pick time. */
interface PickAgent { pick: number; shortlist: number[]; why: string; hit: boolean; shortlistHit: boolean; sealValid: boolean }
/** What `set none` prints of the reveal: the sealed guess, never scored. */
interface NoneRevealOut { agent: { pick: number; shortlist: number[]; why: string; sealValid: boolean; unscored: true } | null; model?: unknown; note?: string }

/** Where a candidate lives: the set holding it and its variant number inside that set. */
interface Where { setId: string; variant: number; round: number }

interface Candidate { index: number; label: string; units?: string[]; layout?: Layout; breaks?: number[]; /** Unit indexes that are lines struck before this set was made (shown struck, text only). */ struck?: number[]; changed: boolean; hashOk: boolean; name?: string; direction?: string | null; angle?: string; note?: string }

/** An item's child session as the rail and the queue routes read it. `session` is null for a child that is gone or is not an item of the queue. */
interface ChildEntry { info: ChildInfo; session: Session | null; state: SessionState | null; /** The child's labelling order (A is the first). */ sequence: number[] }

interface SessionRow { id: string; setId: string; form: string; stage: string; createdAt: string; project: string }

/** The line(s) the set revises, as the owner sees them, and whether the draft has changed since. */
/** What the owner said about the set this one redoes (`set new --redo`): the reasons in words and the note, for the page to show above the new variants. Display only. */
export interface FeedbackView { reasons: string[]; note: string | null }

export interface OriginalView { source: string; lines: ReturnType<typeof originalLines>; stale: boolean }

/** The draft behind the session, for the Draft view: its lines as a strike names them, and the strikes against it. */
export interface DraftView {
  source: string;
  /** Hash of the normalised text now: what a strike is made against. */
  hash: string;
  /** Changes when the draft, its strikes, the brief or the original change: the page re-renders on it. */
  rev: string;
  /** False once the session is shipped or abandoned: the view is read only. */
  editable: boolean;
  lines: Array<{ ref: string; start: number; end: number; text: string; speaker?: string; strikable: boolean; why?: string; break?: boolean }>;
  truncated?: boolean;
  strikes: Array<{ id: string; ref: string; text: string; speaker?: string; reason: string; note?: string; at: string; stale: boolean }>;
  applied: null | { id: string; count: number; at: string };
}

/** Lines the Draft view lists at most. */
export const MAX_DRAFT_LINES = 2000;
/** Draft extensions the strike routes will name (the CLI checks again). */
const DRAFT_FILE = /\.(?:fountain|md|markdown|dialog\.ya?ml|ya?ml)$/i;
const normText = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

export interface SessionPayload {
  session: { id: string; setId: string; form: string; register: string | null; prompt: string; target: Session['target']; wpm: number | null; brief: ReturnType<typeof briefView> | null; original: OriginalView | null; lastFeedback: FeedbackView | null };
  state: Omit<SessionState, 'candidates'>;
  candidates: Candidate[];
  order: number[];
  /** The next head-to-head in canonical order (null outside the duel stage). */
  pair: [number, number] | null;
  /** The direction vocabulary the refine screen offers. */
  directions: string[];
  reveal: { shipped: boolean; sentBack: boolean };
  /** The round-0 set's draft with its strikes, or null when it cannot be shown (missing, outside the project, unreadable). */
  draft: DraftView | null;
  /** The lineup as aligned rows (the base text against each shown variant, keyed by candidate index), or null outside the lineup stage or when the variants cannot be compared (the page then shows cards). */
  compare: Compare | null;
}

/**
 * Display order and labels. Each round's candidates are ordered by that round's lineup event (completed by a seeded
 * shuffle for any the event did not name; wholly shuffled before the event exists) and labelled A, B, ... in one run
 * across rounds, so a variant keeps its label for the life of the session. `order` is the current lineup in display
 * order (the pinned champion first before the lineup event).
 */
export function displayPlan(session: Session, state: SessionState, events: StoredEvent[]): { sequence: number[]; order: number[] } {
  const lineupOrder = new Map<number, number[]>();
  const roundSet = new Map<number, string>([[0, session.setId]]);
  let round = 0;
  for (const e of events) {
    if (e.type === 'round') { round = e.n; roundSet.set(e.n, e.setId); }
    else if (e.type === 'lineup' && !lineupOrder.has(round)) lineupOrder.set(round, e.order);
  }
  const rounds = [...new Set(state.candidates.map(c => c.round))].sort((a, b) => a - b);
  const sequence: number[] = [];
  const inGroup = new Map<number, number[]>();
  for (const r of rounds) {
    const members = state.candidates.filter(c => c.round === r).map(c => c.index);
    const named = (lineupOrder.get(r) ?? []).filter(i => members.includes(i));
    const group = [...named, ...shuffled(members.filter(i => !named.includes(i)), `${session.id}:${r}`)];
    inGroup.set(r, group);
    sequence.push(...group);
  }
  const named = (lineupOrder.get(state.round) ?? []).filter(i => state.lineup.includes(i));
  const rest = state.lineup.filter(i => !named.includes(i));
  const pinned = rest.filter(i => state.candidates.find(c => c.index === i)!.round < state.round);
  const fresh = (inGroup.get(state.round) ?? []).filter(i => rest.includes(i) && !pinned.includes(i));
  return { sequence, order: [...named, ...pinned, ...fresh] };
}

/** The set of each round and the hash each later round froze for its candidates (round 0 is frozen in session.json). */
export function roundMaps(session: Session, events: StoredEvent[]): { roundSet: Map<number, string>; roundHash: Map<number, string> } {
  const roundSet = new Map<number, string>([[0, session.setId]]);
  const roundHash = new Map<number, string>();
  for (const e of events) {
    if (e.type !== 'round') continue;
    roundSet.set(e.n, e.setId);
    for (const c of e.candidates) { const h = (c as { hash?: string }).hash; if (h) roundHash.set(c.index, h); }
  }
  return { roundSet, roundHash };
}

/**
 * The sha256 frozen for a candidate's text: its round's own hash (round 0 is frozen in session.json); only a session
 * written before hashes existed falls back to the sealed prediction on that round's set. Undefined means unverifiable,
 * which callers treat as "changed". The one lookup the page payload, the note check and the CLI's `locate` all use.
 */
export function frozenHash(root: string, session: Session, maps: ReturnType<typeof roundMaps>, c: SessionCandidate): string | undefined {
  const frozen = c.round > 0 ? maps.roundHash.get(c.index) : session.hashes[String(c.index)];
  if (frozen) return frozen;
  try { return readPrediction(root, maps.roundSet.get(c.round) ?? session.setId)?.hashes[String(variantOf(c))]; } catch { return undefined; }
}

const statKey = (file: string): string => { const s = statSync(file); return `${s.mtimeMs}:${s.size}`; };
/** A bounded memo: past `max` entries the oldest go. */
function remember<K, V>(map: Map<K, V>, key: K, value: V, max = 500): void {
  map.set(key, value);
  if (map.size > max) map.delete(map.keys().next().value as K);
}

// ---- the server ----

export interface ReadingServerOptions {
  host?: string; port?: number; token?: string; projects?: string[];
  /** Simultaneous connections accepted (default 200); tests lower it. */
  maxConnections?: number;
  /** Directory holding index.html, app.js and style.css; the code's own runtime/reading when omitted. */
  runtimeDir?: string;
  /** Write server.json when listening (default true). Tests turn it off to leave the home alone. */
  persist?: boolean;
  /** How writes reach the CLI; tests stub it. Defaults to `runProse` (the real CLI). */
  runProse?: RunProse;
  /** Append the server's error lines here (emptied at start when over 1 MB). `prose serve` passes <prose home>/server.log. */
  logFile?: string;
}

type Handler = (ctx: Ctx) => Promise<void> | void;
interface Ctx { req: IncomingMessage; res: ServerResponse; match: RegExpExecArray; path: string; /** A queue route names the project its item lives in: the session is looked up there and nowhere else. */ within?: string }
/** The API route table: a path that matches no row is 404, a wrong method 405. */
interface Route { method: 'GET' | 'POST'; re: RegExp; handler: Handler }

const STATUS: Partial<Record<ErrorCode, number>> = { E_NOT_FOUND: 404, E_SCHEMA: 400, E_USAGE: 400, E_CONFLICT: 409, E_PREDICTION_REQUIRED: 409 };
const NOT_FOUND = () => new ProseError('E_NOT_FOUND', 'not found');
const methodNotAllowed = () => Object.assign(new ProseError('E_SERVER', 'method not allowed'), { status: 405 });
const withStatus = (e: ProseError, status: number) => Object.assign(e, { status });

/** The request body as text, at most `max` bytes: a larger one (declared or streamed) is 413. Drains, bounded, so the reply gets through. */
function readBody(req: IncomingMessage, max: number): Promise<string> {
  const tooLarge = () => withStatus(new ProseError('E_SERVER', `the request body is larger than ${max / 1024} KB`), 413);
  if (Number(req.headers['content-length']) > max) { req.resume(); return Promise.reject(tooLarge()); }
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= max) chunks.push(c);
      else if (size > 16 * max) req.destroy(); // a client that keeps streaming is dropped
    });
    req.on('end', () => (size > max ? fail(tooLarge()) : ok(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', () => fail(tooLarge()));
  });
}

export class ReadingServer {
  server!: Server;
  info!: ServerInfo;
  private projects: string[];
  private opts: ReadingServerOptions;
  /** Page files, read once at listen(): a request never touches the disk for a page, whatever its path. */
  private pages = new Map<PageKey, Buffer>();
  private assets = new Map<AssetPath, Buffer>();
  private routes: Route[];
  /** One write at a time per session: the read-check-CLI-append of two events never interleaves. */
  private queues = new Map<string, Promise<unknown>>();
  /** Parsed sets by set.json path, valid while its (mtime, size) is unchanged. */
  private draftCache = new Map<string, { key: string; hash: string | null }>();
  private setCache = new Map<string, { key: string; set: PromptSet }>();
  /** A draft's text, hash and verified strike lines by file path, valid while (mtime, size, format, form) are unchanged. */
  private strikeDrafts = new Map<string, { key: string; text: string; hash: string; lines: StrikeLine[]; format: PromptSet['format']; form: string }>();
  /** A strike log's rows by directory, valid while events.jsonl is unchanged. */
  private strikeLogs = new Map<string, { key: string; events: StrikeEvent[] }>();
  /** A variant's checked text by file path, valid while the file's (mtime, size) and the frozen hash are unchanged. */
  private textCache = new Map<string, { key: string; text: string | null; hashOk: boolean; layout?: ReturnType<typeof layoutOf>; struck?: number[] }>();
  /** The aligned compare rows by (set, base file, shown variants and their frozen hashes), valid while the key is unchanged; null is remembered too. */
  private compareCache = new Map<string, Compare | null>();
  /** The base text of a set by file path, valid while the file's (mtime, size) are unchanged. */
  private baseCache = new Map<string, { key: string; text: string }>();
  /** A queue's queue.json by path, valid while the file is unchanged; null for one that is not a valid queue. */
  private queueCache = new Map<string, { key: string; queue: Queue | null }>();
  /** A queue's log by directory, valid while events.jsonl is unchanged. */
  private queueLogs = new Map<string, { key: string; events: StoredQueueEvent[] }>();
  /** A queue item's child session, log and set by session directory, valid while session.json, events.jsonl and set.json are unchanged. */
  private childCache = new Map<string, { key: string; entry: ChildEntry }>();
  /** One /api/sessions row per session, valid while session.json and events.jsonl are unchanged. */
  private rowCache = new Map<string, { key: string; row: SessionRow | null }>();
  /** How many variant files were read and hashed, drafts hashed for the existing line, strike logs parsed, and draft files parsed for the Draft view (a poll that finds nothing changed adds none); for tests. */
  readonly reads = { variants: 0, drafts: 0, strikes: 0, lines: 0, queues: 0 };
  /** The taste model and candidate vectors behind the duel the page asks (cached; loaded with async fs). */
  private taste = new TasteDuels(() => logError('taste model unavailable; using the default pairing', 'E_TASTE'));
  /** Taste loads so far (models fitted, candidate vectors computed); for tests. */
  get loads() { return this.taste.loads; }
  private projectsMemo: { from: ServerInfo | null; result: string[] } | null = null;
  private scrubMemo: { roots: string; re: RegExp } | null = null;

  constructor(opts: ReadingServerOptions = {}) {
    this.opts = opts;
    this.projects = (opts.projects ?? []).map(p => resolve(p));
    this.routes = [
      { method: 'GET', re: /^\/api\/sessions$/, handler: c => this.json(c.res, 200, { sessions: this.listSessions() }) },
      { method: 'GET', re: /^\/api\/session\/([a-z0-9-]+)$/, handler: async c => this.json(c.res, 200, await this.payloadAsync(c.match[1])) },
      { method: 'GET', re: /^\/api\/session\/([a-z0-9-]+)\/reveal$/, handler: c => this.json(c.res, 200, this.reveal(c.match[1])) },
      { method: 'GET', re: /^\/api\/session\/([a-z0-9-]+)\/strike\/preview$/, handler: c => this.json(c.res, 200, this.strikePreview(c.match[1])) },
      { method: 'POST', re: /^\/api\/session\/([a-z0-9-]+)\/event$/, handler: c => this.postEvent(c) },
      { method: 'POST', re: /^\/api\/session\/([a-z0-9-]+)\/strike$/, handler: c => this.postStrike(c, 'add') },
      { method: 'POST', re: /^\/api\/session\/([a-z0-9-]+)\/strike\/clear$/, handler: c => this.postStrike(c, 'clear') },
      { method: 'POST', re: /^\/api\/session\/([a-z0-9-]+)\/strike\/apply$/, handler: c => this.postStrike(c, 'apply') },
      { method: 'POST', re: /^\/api\/session\/([a-z0-9-]+)\/strike\/undo$/, handler: c => this.postStrike(c, 'undo') },
      // A batch: the rail, an item (resolved through queue.json, never a session id or a path from the request), and the queue's own writes.
      { method: 'GET', re: /^\/api\/queue\/([a-z0-9-]+)$/, handler: c => this.queueRail(c) },
      { method: 'GET', re: /^\/api\/queue\/([a-z0-9-]+)\/item\/(\d{1,2})$/, handler: async c => this.queueItem(c) },
      { method: 'GET', re: /^\/api\/queue\/([a-z0-9-]+)\/item\/(\d{1,2})\/reveal$/, handler: c => this.itemRoute(c, t => this.json(c.res, 200, this.reveal(t.id, t.root))) },
      { method: 'GET', re: /^\/api\/queue\/([a-z0-9-]+)\/item\/(\d{1,2})\/strike\/preview$/, handler: c => this.itemRoute(c, t => this.json(c.res, 200, this.strikePreview(t.id, t.root))) },
      { method: 'POST', re: /^\/api\/queue\/([a-z0-9-]+)\/item\/(\d{1,2})\/event$/, handler: c => this.itemRoute(c, t => this.postEvent(t.ctx, BATCH_EVENTS)) },
      { method: 'POST', re: /^\/api\/queue\/([a-z0-9-]+)\/item\/(\d{1,2})\/strike$/, handler: c => this.itemRoute(c, t => this.postStrike(t.ctx, 'add')) },
      { method: 'POST', re: /^\/api\/queue\/([a-z0-9-]+)\/item\/(\d{1,2})\/strike\/clear$/, handler: c => this.itemRoute(c, t => this.postStrike(t.ctx, 'clear')) },
      { method: 'POST', re: /^\/api\/queue\/([a-z0-9-]+)\/item\/(\d{1,2})\/strike\/apply$/, handler: c => this.itemRoute(c, t => this.postStrike(t.ctx, 'apply')) },
      { method: 'POST', re: /^\/api\/queue\/([a-z0-9-]+)\/item\/(\d{1,2})\/strike\/undo$/, handler: c => this.itemRoute(c, t => this.postStrike(t.ctx, 'undo')) },
      { method: 'POST', re: /^\/api\/queue\/([a-z0-9-]+)\/choose$/, handler: c => this.postChoose(c) },
      { method: 'POST', re: /^\/api\/queue\/([a-z0-9-]+)\/skip$/, handler: c => this.postSkip(c) },
      { method: 'POST', re: /^\/api\/queue\/([a-z0-9-]+)\/sendback$/, handler: c => this.postSendback(c) },
      { method: 'POST', re: /^\/api\/queue\/([a-z0-9-]+)\/send$/, handler: c => this.postSend(c) },
      { method: 'POST', re: /^\/api\/queue\/([a-z0-9-]+)\/finish$/, handler: c => this.postFinish(c) },
    ];
  }

  /** Registered project roots: the ones given at construction plus whatever `registerProject` has recorded since. */
  private knownProjects(): string[] {
    const info = readServerInfoCached();
    if (this.projectsMemo?.from !== info || this.projectsMemo === null) this.projectsMemo = { from: info, result: uniqueProjects([...this.projects, ...(info?.projects ?? [])]) };
    return this.projectsMemo.result;
  }

  /** The project holding session `id`. An id that is not a valid id is "not found", like an unknown one. */
  private findSession(id: string, within?: string): string {
    let valid = false;
    try { validId(id, 'Session id'); valid = ID_RE.test(id); } catch { /* not a session id */ }
    if (valid) {
      for (const root of within !== undefined ? [within] : this.knownProjects()) {
        if (existsSync(join(sessionDir(root, id), 'session.json'))) return root;
      }
    }
    throw new ProseError('E_NOT_FOUND', 'no such session', { hint: 'The link may be for a session that was closed' });
  }

  private listSessions(): SessionRow[] {
    const out: SessionRow[] = [];
    for (const root of this.knownProjects()) {
      const dir = sessionsDir(root);
      if (!existsSync(dir)) continue;
      for (const id of readdirSync(dir)) {
        const row = this.sessionRow(root, id);
        if (row) out.push(row);
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private sessionRow(root: string, id: string): SessionRow | null {
    const cacheKey = `${root}\0${id}`;
    let key: string;
    try {
      const dir = sessionDir(root, id);
      let events = 'none';
      try { events = statKey(join(dir, 'events.jsonl')); } catch { /* no log yet */ }
      key = `${statKey(join(dir, 'session.json'))}|${events}`;
    } catch { return null; }
    const hit = this.rowCache.get(cacheKey);
    if (hit && hit.key === key) return hit.row;
    let row: SessionRow | null = null;
    try {
      const s = readSession(root, id);
      row = { id: s.id, setId: s.setId, form: s.form, stage: foldSession(s, readEvents(root, id)).stage, createdAt: s.createdAt, project: basename(root) };
    } catch { /* skip an unreadable session */ }
    remember(this.rowCache, cacheKey, { key, row });
    return row;
  }

  /** The set, parsed again only when its set.json changed (`fresh` always reads it). Null when unreadable. */
  private setOf(root: string, setId: string, fresh: boolean): PromptSet | null {
    try {
      const file = join(setDir(root, setId), 'set.json');
      const key = statKey(file);
      const hit = this.setCache.get(file);
      if (!fresh && hit?.key === key) return hit.set;
      const set = readSet(root, setId);
      remember(this.setCache, file, { key, set });
      return set;
    } catch { return null; }
  }

  /** The brief the owner sees: that of the latest round's set that has one, else null. Read live (stat-keyed), so an edit shows on the next poll. */
  private briefOf(root: string, maps: ReturnType<typeof roundMaps>): ReturnType<typeof briefView> | null {
    for (const n of [...maps.roundSet.keys()].sort((a, b) => b - a)) {
      const brief = this.setOf(root, maps.roundSet.get(n)!, false)?.brief;
      if (brief) return briefView(brief);
    }
    return null;
  }

  /** What the owner said about the set the round-0 set redoes, or null (a set that redoes nothing). Read live (stat-keyed). */
  private feedbackOf(root: string, setId: string): FeedbackView | null {
    const f = this.setOf(root, setId, false)?.feedback;
    return f ? { reasons: f.reasons.map(r => NONE_REASON_LABELS[r as NoneReason] ?? r), note: f.note ?? null } : null;
  }

  /**
   * The existing line: the round-0 set's snapshot (a refine round's set records none, and the question does not change
   * between rounds), with `stale` from the draft's hash now. The hash is remembered per (file, mtime, size), so a poll that
   * finds the draft unchanged stats it instead of reading it. A missing or unreadable draft is stale.
   */
  private originalOf(root: string, setId: string): OriginalView | null {
    const o: Original | undefined = this.setOf(root, setId, false)?.original;
    if (!o) return null;
    let hash: string | null = null;
    try {
      const file = join(root, o.source);
      const key = statKey(file);
      const hit = this.draftCache.get(file);
      if (hit?.key === key) hash = hit.hash;
      else {
        this.reads.drafts++;
        hash = draftHash(readFileSync(file, 'utf8'));
        remember(this.draftCache, file, { key, hash });
      }
    } catch { hash = null; }
    return { source: o.source, lines: originalLines(o), stale: hash !== o.draftHash };
  }

  /**
   * One candidate's text, checked against the hash frozen when the prediction was sealed. Never throws. The check is
   * remembered per (file, mtime, size, frozen hash), so a poll stats the file instead of reading and hashing it again;
   * `fresh` (the note check, before a write) skips the memory and looks at the file itself.
   */
  private variantText(root: string, setId: string, index: number, frozen: string | undefined, fresh = false): { set: PromptSet | null; text: string | null; hashOk: boolean; layout: UnitLayout | null; struck: number[] } {
    const set = this.setOf(root, setId, fresh);
    const none = { set, text: null, hashOk: false, layout: null, struck: [] };
    try {
      const v = set?.variants.find(x => x.index === index);
      if (!set || !v || !frozen) return none;
      const file = variantPath(root, set, v);
      const key = `${statKey(file)}|${frozen}|${set.format}|${set.form}`;
      let entry = this.textCache.get(file);
      if (fresh || entry?.key !== key) {
        this.reads.variants++;
        const text = readFileSync(file, 'utf8').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
        entry = textHash(text) === frozen ? { key, text, hashOk: true } : { key, text: null, hashOk: false };
        remember(this.textCache, file, entry);
      }
      if (entry.text === null) return none;
      entry.layout ??= layoutOf(entry.text, set.format, set.form);
      entry.struck ??= this.struckUnits(entry.text, set);
      return { set, text: entry.text, hashOk: true, layout: entry.layout, struck: entry.struck };
    } catch { return none; }
  }

  /** The units of a variant that are lines struck before the set was made, left exactly as written (shown struck, never edited). */
  private struckUnits(text: string, set: PromptSet): number[] {
    if (!set.excluded) return [];
    try {
      const gone = new Set(set.excluded.map(e => normText(e.text)));
      return strikeLines(text, set.format, set.form).filter(l => gone.has(normText(l.text))).flatMap(l => l.units);
    } catch { return []; }
  }

  /**
   * The page payload with the duel chosen by the taste model when it is usable. The model and the shortlisted candidates'
   * vectors are awaited here (async fs, cached), then the synchronous payload is built; any failure leaves the old rule.
   */
  private async payloadAsync(id: string, within?: string): Promise<SessionPayload> {
    let choose: PairChooser | null = null;
    try {
      const root = this.findSession(id, within);
      const session = readSession(root, id);
      const events = readEvents(root, id);
      const state = foldSession(session, events);
      if (state.stage === 'duel' && state.shortlist.length >= 2) {
        const maps = roundMaps(session, events);
        const sources: DuelCandidateSource[] = [];
        for (const index of state.shortlist) {
          const c = state.candidates.find(x => x.index === index)!;
          const set = this.setOf(root, maps.roundSet.get(c.round) ?? session.setId, false);
          const v = set?.variants.find(x => x.index === variantOf(c));
          if (set && v) sources.push({ index, file: variantPath(root, set, v), form: set.form, hash: frozenHash(root, session, maps, c) });
        }
        if (sources.length === state.shortlist.length) choose = await this.taste.chooser(root, this.setOf(root, session.setId, false), sources);
      }
    } catch { /* the payload below reports a missing session; anything else leaves the old rule */ }
    return this.payload(id, choose ?? undefined, within);
  }

  private payload(id: string, choose?: PairChooser, within?: string): SessionPayload {
    const root = this.findSession(id, within);
    const session = readSession(root, id);
    const events = readEvents(root, id);
    const state = foldSession(session, events);
    const plan = displayPlan(session, state, events);
    const maps = roundMaps(session, events);
    const byIndex = new Map(state.candidates.map(c => [c.index, c]));
    const make = (index: number): Candidate => {
      const c = byIndex.get(index)!;
      const setId = maps.roundSet.get(c.round) ?? session.setId;
      const { set, hashOk, layout, struck } = this.variantText(root, setId, variantOf(c), frozenHash(root, session, maps, c));
      const out: Candidate = { index, label: labelOf(plan.sequence.indexOf(index)), changed: !hashOk, hashOk };
      if (layout !== null) Object.assign(out, layout);
      if (struck.length) out.struck = struck;
      if (state.peeked.includes(index)) {
        // The owner opened "what changed?" for this one: the direction and the agent's own description of the angle.
        const v = set?.variants.find(x => x.index === variantOf(c));
        Object.assign(out, { name: c.name, direction: c.direction }, v?.label ? { angle: v.label } : {}, v?.note ? { note: v.note } : {});
      }
      return out;
    };
    const shown = [...plan.order, ...plan.sequence.filter(i => !plan.order.includes(i))];
    const { candidates: _hidden, ...publicState } = state;
    return {
      session: { id: session.id, setId: session.setId, form: session.form, register: session.register, prompt: session.prompt, target: session.target, wpm: session.wpm, brief: this.briefOf(root, maps), original: this.originalOf(root, session.setId), lastFeedback: this.feedbackOf(root, session.setId) },
      state: publicState,
      candidates: shown.map(make),
      order: plan.order,
      pair: nextPair(state, choose),
      directions: KNOWN_DIRECTIONS,
      reveal: { shipped: state.shipped !== null, sentBack: state.sentBack !== null },
      draft: this.draftView(root, session, state, maps),
      compare: state.stage === 'lineup' ? this.compareOf(root, session, state, plan.order, maps) : null,
    };
  }

  /**
   * The lineup as rows: the round-0 set's base text (the draft as the set froze it) against each shown variant, aligned by
   * unit with a word diff in every changed cell (see compare.ts). Null when the base cannot be read or any shown variant
   * changed after sealing (the page shows cards, where that rule has its words), and when the texts are too big to align.
   * Remembered by the files' stat keys and the frozen hashes, so a poll that finds nothing changed does no alignment.
   */
  private compareOf(root: string, session: Session, state: SessionState, order: number[], maps: ReturnType<typeof roundMaps>): Compare | null {
    try {
      const set = this.setOf(root, session.setId, false);
      if (!set || order.length === 0) return null;
      const file = basePath(root, set);
      const baseKey = statKey(file);
      const parts: string[] = [];
      const shown: Array<{ key: string; text: string; set: PromptSet; struck: number[] }> = [];
      for (const index of order) {
        const c = state.candidates.find(x => x.index === index);
        if (!c) return null;
        const frozen = frozenHash(root, session, maps, c);
        const v = this.variantText(root, maps.roundSet.get(c.round) ?? session.setId, variantOf(c), frozen);
        if (!v.hashOk || v.text === null || !v.set) return null;
        parts.push(`${index}:${frozen}`);
        shown.push({ key: String(index), text: v.text, set: v.set, struck: v.struck });
      }
      const key = `${file}|${baseKey}|${set.format}|${set.form}|${set.original ? 1 : 0}|${parts.join(',')}`;
      if (this.compareCache.has(key)) return this.compareCache.get(key) ?? null;
      let baseText = this.baseCache.get(file);
      if (baseText?.key !== baseKey) {
        baseText = { key: baseKey, text: readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n') };
        remember(this.baseCache, file, baseText);
      }
      const compare = buildCompare(
        unitCells(baseText.text, set.format, set.form),
        shown.map(x => ({ key: x.key, cells: unitCells(x.text, x.set.format, x.set.form), struck: x.struck })),
        set.original !== undefined, this.struckUnits(baseText.text, set),
      );
      remember(this.compareCache, key, compare, 100);
      return compare;
    } catch { return null; }
  }

  // ---- the draft and its strikes ----

  /**
   * The draft file behind a set, or null: the source comes from set.json (never from the client), must stay inside the
   * registered project once symbolic links are resolved, must be a regular file (not a link: the CLI refuses those) and
   * must have a draft extension.
   */
  private draftFile(root: string, source: string): string | null {
    try {
      if (!DRAFT_FILE.test(source)) return null;
      const file = resolve(root, source);
      const rel = relative(root, file);
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep)[0] === '.agent-prose') return null;
      if (!lstatSync(file).isFile()) return null;
      const real = relative(realpathSync(root), realpathSync(file));
      return real.startsWith('..') || isAbsolute(real) ? null : file;
    } catch { return null; }
  }

  /** The draft as the strike routes see it, parsed again only when the file or its set's format changed. Null when it cannot be read. */
  private strikeDraft(file: string, set: PromptSet) {
    let key: string;
    try { key = `${statKey(file)}|${set.format}|${set.form}`; } catch { return null; }
    const hit = this.strikeDrafts.get(file);
    if (hit?.key === key) return hit;
    this.reads.lines++;
    try {
      const text = readFileSync(file, 'utf8');
      const doc = parseDocument(file, text, { form: set.form });
      const entry = { key, text, hash: draftHash(text), lines: verifiedLines(text, set.format, set.form, strikeLines(text, set.format, set.form)), format: doc.format, form: doc.form };
      remember(this.strikeDrafts, file, entry);
      return entry;
    } catch { this.strikeDrafts.delete(file); return null; }
  }

  /** The strike log of a draft, parsed again only when events.jsonl changed (one stat per poll). */
  private strikeEvents(root: string, source: string): StrikeEvent[] {
    const dir = strikeDir(root, strikeKey(source));
    const log = join(dir, 'events.jsonl');
    let key = 'none';
    try { key = statKey(log); } catch { /* no log yet */ }
    const hit = this.strikeLogs.get(dir);
    if (hit?.key === key) return hit.events;
    this.reads.strikes++;
    let events: StrikeEvent[] = [];
    try { events = parseStrikeLog(readFileSync(log, 'utf8')).events; } catch { /* absent or unreadable: no strikes */ }
    remember(this.strikeLogs, dir, { key, events });
    return events;
  }

  private draftView(root: string, session: Session, state: SessionState, maps: ReturnType<typeof roundMaps>): DraftView | null {
    const set = this.setOf(root, session.setId, false);
    if (!set) return null;
    const file = this.draftFile(root, set.source);
    const draft = file ? this.strikeDraft(file, set) : null;
    if (!draft) return null;
    const fold = foldStrikes(this.strikeEvents(root, set.source), draft.hash);
    const last = undoableApply(fold, draft.hash);
    const strikes = fold.pending.map(p => ({ id: p.id, ref: p.ref, text: p.text, ...(p.speaker ? { speaker: p.speaker } : {}), reason: p.reason, ...(p.note ? { note: p.note } : {}), at: p.at, stale: p.stale }));
    const editable = state.stage !== 'shipped' && state.stage !== 'abandoned' && state.stage !== 'sentBack';
    const applied = last ? { id: last.id, count: last.strikes.length, at: last.at } : null;
    const rev = createHash('sha256').update(JSON.stringify([draft.hash, editable, strikes.map(s => [s.id, s.reason, s.note ?? null, s.stale]), applied, this.briefOf(root, maps), set.original?.lines ?? null])).digest('hex').slice(0, 16);
    const lines = draft.lines.slice(0, MAX_DRAFT_LINES).map(l => ({
      ref: l.ref, start: l.start, end: l.end, text: l.text, ...(l.speaker ? { speaker: l.speaker } : {}),
      strikable: l.strikable, ...(l.why ? { why: l.why } : {}), ...(l.break ? { break: true } : {}),
    }));
    return { source: set.source, hash: draft.hash, rev, editable, lines, ...(draft.lines.length > MAX_DRAFT_LINES ? { truncated: true } : {}), strikes, applied };
  }

  /** The removal the pending strikes would make, computed here and read only (no lock, nothing written). The page's apply review will use it in a later version. */
  private strikePreview(id: string, within?: string): unknown {
    const root = this.findSession(id, within);
    const session = readSession(root, id);
    const set = this.setOf(root, session.setId, false);
    const file = set ? this.draftFile(root, set.source) : null;
    const draft = set && file ? this.strikeDraft(file, set) : null;
    if (!set || !draft) throw new ProseError('E_NOT_FOUND', 'the draft is not available', { hint: 'The draft may have moved or been deleted' });
    const fold = foldStrikes(this.strikeEvents(root, set.source), draft.hash);
    if (fold.pending.length === 0) throw new ProseError('E_CONFLICT', 'nothing is struck', { hint: 'Strike a line first' });
    const stale = fold.pending.filter(p => p.stale);
    if (stale.length) throw new ProseError('E_CONFLICT', `${stale.length} of the struck lines were struck against an older draft`, { hint: 'Undo them and strike again' });
    const strikes = fold.pending.map(p => ({ id: p.id, ref: p.ref, reason: p.reason, note: p.note, line: draft.lines.find(l => l.ref === p.ref) }));
    const missing = strikes.find(s => !s.line);
    if (missing) throw new ProseError('E_CONFLICT', `${missing.id} no longer names a line of the draft`, { hint: 'Undo it and strike again' });
    const plan = planRemoval(draft.text, draft.format, draft.form, draft.hash, strikes.map(s => ({ id: s.id, ref: s.ref, reason: s.reason, line: s.line! })));
    return { digest: plan.digest, count: plan.count, bytes: plan.bytes, removed: removedView(plan.removed, strikes.map(x => ({ id: x.id, ref: x.ref, reason: x.reason, ...(x.note ? { note: x.note } : {}) }))) };
  }

  /** Record or clear a strike, apply the strikes or undo the last apply: validated here, then the CLI does the write (locks, dedupe, stale, digest and hash rules live there; this server never edits a draft). */
  private async postStrike(c: Ctx, kind: 'add' | 'clear' | 'apply' | 'undo'): Promise<void> {
    const id = c.match[1];
    const root = this.findSession(id, c.within);
    const text = await readBody(c.req, MAX_BODY);
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new ProseError('E_USAGE', 'the request body is not valid JSON', { hint: 'Send one JSON object' }); }
    const parsed = { add: StrikeBody, clear: ClearBody, apply: ApplyBody, undo: UndoBody }[kind].safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ProseError('E_SCHEMA', `Invalid strike request: ${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`.slice(0, 200), { hint: 'See the strike request shapes the page sends' });
    }
    const body = parsed.data;
    const out = await this.serial(id, async () => {
      const session = readSession(root, id);
      const stage = foldSession(session, readEvents(root, id)).stage;
      if (stage === 'shipped' || stage === 'abandoned' || stage === 'sentBack') throw new ProseError('E_CONFLICT', `the session is ${stage === 'sentBack' ? 'sent back' : stage}, so strikes can no longer change`, { hint: 'Open a new reading session' });
      const set = this.setOf(root, session.setId, true);
      const file = set ? this.draftFile(root, set.source) : null;
      if (!set || !file) throw new ProseError('E_NOT_FOUND', 'the draft is not available', { hint: 'The draft may have moved or been deleted' });
      const run = this.opts.runProse ?? runProse;
      const form = ['--form', set.form];
      const argv = 'ref' in body
        ? ['strike', 'add', file, '--line', body.ref, '--reason', body.reason, ...(body.note !== undefined ? [`--note=${body.note}`] : []), '--draft-hash', body.draftHash, `--event-id=${body.eventId}`, ...form, '--dir', root]
        : 'digest' in body ? ['strike', 'apply', file, '--confirm', body.digest, `--event-id=${body.eventId}`, ...form, '--dir', root]
        : 'apply' in body ? ['strike', 'undo', file, '--apply', body.apply, `--event-id=${body.eventId}`, ...form, '--dir', root]
        : ['strike', 'clear', file, body.strike, `--event-id=${body.eventId}`, '--dir', root];
      const result = await run(argv, { cwd: root }) as { duplicate?: boolean };
      return { ok: true, ...(result?.duplicate ? { duplicate: true } : {}), state: await this.payloadAsync(id, root) };
    });
    this.json(c.res, 200, out);
  }

  private reveal(id: string, within?: string): unknown {
    const root = this.findSession(id, within);
    const state = foldSession(readSession(root, id), readEvents(root, id));
    const reveal = state.shipped !== null || state.sentBack !== null ? readReveal(root, id) : null;
    if (reveal === null) throw new ProseError('E_NOT_FOUND', 'not shipped yet', { hint: 'The reveal appears once the session is shipped or sent back' });
    return reveal;
  }

  // ---- events ----

  /** Run `fn` after every earlier write for the same session has finished. */
  private serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(fn);
    this.queues.set(id, run);
    run.finally(() => { if (this.queues.get(id) === run) this.queues.delete(id); }).catch(() => undefined);
    return run;
  }

  private async postEvent(c: Ctx, only?: ReadonlySet<string>): Promise<void> {
    const id = c.match[1];
    const root = this.findSession(id, c.within);
    const text = await readBody(c.req, MAX_BODY);
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new ProseError('E_USAGE', 'the request body is not valid JSON', { hint: 'Send one JSON event object' }); }
    const type = (raw as { type?: unknown } | null)?.type;
    // A batch item takes engagement only: a pick goes through Send, never through the item's own event route.
    if (only && !(typeof type === 'string' && only.has(type)) && typeof type === 'string' && EventSchema.options.some(o => o.shape.type.value === type)) {
      throw withStatus(new ProseError('E_SERVER', `a batch item takes only ${[...only].join(' and ')} here: choose a draft and press Send picks`, { hint: 'To judge the set in full, open it as its own session' }), 403);
    }
    if (type === 'round' || (typeof type === 'string' && !CLIENT_EVENTS.has(type) && EventSchema.options.some(o => o.shape.type.value === type))) {
      throw withStatus(new ProseError('E_SERVER', 'the reading page may only send play, lineup, duel, note, peek, refine, ship and abandon'), 403);
    }
    const parsed = EventSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
      throw new ProseError('E_SCHEMA', `Invalid event: ${where}${issue.message}`.slice(0, 200), { hint: 'See the event shapes the page sends' });
    }
    const out = await this.serial(id, () => this.applyEvent(root, id, parsed.data));
    this.json(c.res, 200, out);
  }

  /**
   * One accepted event. Order: read and fold the log; a stored event of the same type with the same eventId makes this a retry (answered
   * as a duplicate before anything else, because the transition table would rightly refuse the second copy of a duel);
   * check the transition; for judgements run the CLI write FIRST and append only if it succeeds; append; answer with
   * the page payload.
   */
  private async applyEvent(root: string, id: string, event: SessionEvent): Promise<Record<string, unknown>> {
    const session = readSession(root, id);
    const events = readEvents(root, id);
    const eventId = (event as { eventId?: string }).eventId;
    if (eventId !== undefined && events.some(e => e.type === event.type && (e as { eventId?: string }).eventId === eventId)) return { ok: true, duplicate: true, state: await this.payloadAsync(id, root) };
    const state = foldSession(session, events);
    if (ENGAGEMENT.has(event.type) && events.length >= MAX_EVENTS_PER_SESSION) throw withStatus(new ProseError('E_SERVER', 'session is full', { hint: 'Ship, refine or open a new session' }), 429);
    if (event.type === 'note' && state.notes.filter(n => n.index === event.index).length >= MAX_NOTES_PER_VARIANT) {
      throw withStatus(new ProseError('E_SERVER', 'too many notes on this variant', { hint: `A variant takes at most ${MAX_NOTES_PER_VARIANT} notes` }), 429);
    }
    const checked = checkTransition(state, event);
    const maps = roundMaps(session, events);
    const where = (index: number): Where => {
      const c = state.candidates.find(x => x.index === index)!;
      return { setId: maps.roundSet.get(c.round) ?? session.setId, variant: variantOf(c), round: c.round };
    };
    const run = this.opts.runProse ?? runProse;
    switch (checked.type) {
      case 'note': this.checkUnit(root, session, maps, state, checked.index, checked.unit); break;
      case 'duel': {
        const [a, b] = [where(checked.a), where(checked.b)];
        // The row goes in the CHALLENGER's set (the later round; the one set when both are in one round). A side from
        // another set is named with --a-set / --b-set, so a pinned champion against a new variant is recorded too.
        const home = b.round > a.round ? b.setId : a.setId;
        const sets = (w: Where, flag: string) => (w.setId === home ? [] : [flag, w.setId]);
        await run(['set', 'duel', home, '--a', String(a.variant), '--b', String(b.variant), ...sets(a, '--a-set'), ...sets(b, '--b-set'), '--outcome', checked.outcome, '--position', checked.position, `--event-id=${checked.eventId}`, '--dir', root], { cwd: root });
        break;
      }
      case 'ship': {
        // Only the champion's own set can be picked: a later round's champion is picked in that round's set, and the
        // pinned round-0 champion in the round-0 set. A set with no sealed prediction is picked with --no-predict.
        const w = where(checked.champion);
        const sealed = existsSync(join(setDir(root, w.setId), 'prediction.json'));
        const picked = await run(['set', 'pick', w.setId, '--pick', String(w.variant), ...(sealed ? [] : ['--no-predict']), '--dir', root], { cwd: root }) as { reveal?: { agent: PickAgent } | null; voided?: string };
        await writeRevealAsync(root, id, this.revealOf(w, checked.champion, picked));
        break;
      }
      case 'none': {
        // The set sent back is the current round's: a pinned champion of an earlier round lives in another set and is not one of "these".
        const setId = maps.roundSet.get(state.round) ?? session.setId;
        let closest: number | null = null;
        if (checked.closest !== null) {
          const w = where(checked.closest);
          if (w.setId !== setId) throw new ProseError('E_USAGE', 'The draft that came closest must be one of the new drafts of this round', { hint: 'Pick one of the drafts the writer just made, or say none came close' });
          closest = w.variant;
        }
        const out = await run(['set', 'none', setId, ...(checked.reasons.length ? ['--reason', checked.reasons.join(',')] : []), ...(checked.note !== undefined ? [`--note=${checked.note}`] : []), ...(closest !== null ? ['--closest', String(closest)] : []), '--dir', root], { cwd: root }) as { reveal?: NoneRevealOut };
        await writeRevealAsync(root, id, { schema: 'prose/session-reveal@1', outcome: 'none', at: new Date().toISOString(), setId, picked: null, variant: null, matched: null, prediction: out.reveal?.agent ?? null, ...(out.reveal?.model ? { model: out.reveal.model } : {}), ...(out.reveal?.agent ? {} : { note: out.reveal?.note ?? 'No prediction was sealed for this set, so there is nothing to reveal' }) });
        break;
      }
      default: break;
    }
    await appendEventAsync(root, id, checked);
    return { ok: true, state: await this.payloadAsync(id, root) };
  }

  /** The reveal the page gets after the ship: the CLI's own reveal for the champion's set, or the plain statement that there was none. */
  private revealOf(w: Where, champion: number, picked: { reveal?: { agent: PickAgent } | null; voided?: string }) {
    const agent = picked.reveal?.agent ?? null;
    return {
      schema: 'prose/session-reveal@1', at: new Date().toISOString(), setId: w.setId, picked: champion, variant: w.variant,
      matched: agent?.hit ?? false, prediction: agent,
      ...(agent ? {} : { note: picked.voided ? `The sealed prediction for this set was discarded (${picked.voided}), so nothing is revealed` : 'No prediction was sealed for this set, so there is nothing to reveal' }),
    };
  }

  /** A note must name a unit the page was shown: the variant must still match its frozen hash and the unit must exist. */
  private checkUnit(root: string, session: Session, maps: ReturnType<typeof roundMaps>, state: SessionState, index: number, unit: number): void {
    const c = state.candidates.find(x => x.index === index)!;
    const setId = maps.roundSet.get(c.round) ?? session.setId;
    // Before a write the file is looked at itself, not the poll path's memory.
    const { layout } = this.variantText(root, setId, variantOf(c), frozenHash(root, session, maps, c), true);
    if (layout === null) throw new ProseError('E_CONFLICT', `variant ${index} changed after it was sealed, so it cannot take notes`, { hint: 'Ask the agent to restore it or start a new round' });
    const count = layout.units.length;
    if (unit >= count) throw new ProseError('E_SCHEMA', `unit ${unit} is not in variant ${index}`, { hint: `It has ${count} units, numbered from 0` });
  }

  // ---- batch review: a queue over ordinary child sessions ----

  /**
   * The queue `id` and the project holding it. An id that is not a valid id, or a queue.json that is not a valid queue of that
   * id, is "not found". Only registered projects are looked in.
   */
  private findQueue(id: string): { root: string; queue: Queue } {
    let valid = false;
    try { validId(id, 'Queue id'); valid = ID_RE.test(id); } catch { /* not a queue id */ }
    if (valid) {
      for (const root of this.knownProjects()) {
        const queue = this.queueOf(root, id);
        if (queue) return { root, queue };
      }
    }
    throw new ProseError('E_NOT_FOUND', 'no such queue', { hint: 'The link may be for a queue that was closed' });
  }

  private queueOf(root: string, id: string): Queue | null {
    const file = join(queueDir(root, id), 'queue.json');
    let key: string;
    try { key = statKey(file); } catch { return null; }
    const hit = this.queueCache.get(file);
    if (hit?.key === key) return hit.queue;
    let queue: Queue | null = null;
    try {
      const parsed = QueueSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      queue = parsed.success && parsed.data.id === id ? parsed.data : null;
    } catch { queue = null; }
    remember(this.queueCache, file, { key, queue }, 200);
    return queue;
  }

  private queueEvents(root: string, id: string): StoredQueueEvent[] {
    const dir = queueDir(root, id);
    const log = join(dir, 'events.jsonl');
    let key = 'none';
    try { key = statKey(log); } catch { /* no log yet */ }
    const hit = this.queueLogs.get(dir);
    if (hit?.key === key) return hit.events;
    let events: StoredQueueEvent[] = [];
    try { events = parseQueueEvents(readFileSync(log, 'utf8')).events; } catch { /* absent or unreadable: nothing staged */ }
    remember(this.queueLogs, dir, { key, events }, 200);
    return events;
  }

  /** One item's child session and set, read again only when one of their files changed. A child that is not an item of this queue is missing. */
  private childEntry(root: string, queueId: string, item: QueueItem): ChildEntry {
    const stat = (f: string) => { try { return statKey(f); } catch { return '-'; } };
    let key: string;
    try {
      const dir = sessionDir(root, item.sessionId);
      key = [stat(join(dir, 'session.json')), stat(join(dir, 'events.jsonl')), stat(join(setDir(root, item.setId), 'set.json'))].join('|');
    } catch { return this.missingChild(null); }
    const cacheKey = `${root}\0${item.sessionId}`;
    const hit = this.childCache.get(cacheKey);
    if (hit?.key === key) return hit.entry;
    this.reads.queues++;
    let entry: ChildEntry;
    const set = this.setOf(root, item.setId, false);
    try {
      const session = readSession(root, item.sessionId);
      if (session.queue !== queueId || session.setId !== item.setId) entry = this.missingChild(set);
      else {
        const events = readEvents(root, item.sessionId);
        const { info, state } = childInfoOf(session, events, set);
        entry = { info, session, state, sequence: displayPlan(session, state, events).sequence };
      }
    } catch { entry = this.missingChild(set); }
    remember(this.childCache, cacheKey, { key, entry }, 400);
    return entry;
  }

  private missingChild(set: PromptSet | null): ChildEntry {
    return { info: { stage: 'abandoned', sentBack: sentBackOfSet(set), shipped: null, shippedAt: null, pickedElsewhere: set?.picked ?? null, pickedAt: set?.pickedAt ?? null, missing: true }, session: null, state: null, sequence: [] };
  }

  /** The queue folded with its children as they are now. */
  private railState(root: string, queue: Queue): { state: QueueState; entries: ChildEntry[] } {
    const entries = queue.items.map(i => this.childEntry(root, queue.id, i));
    const children: Record<number, ChildInfo> = {};
    queue.items.forEach((i, k) => { children[i.n] = entries[k].info; });
    return { state: foldQueue(queue, this.queueEvents(root, queue.id), children), entries };
  }

  /** The rail: one small row per item and the counts. No draft text and nothing sealed (a prediction is never read here). */
  private railPayload(root: string, queue: Queue) {
    const { state, entries } = this.railState(root, queue);
    const label = (k: number, v: number | null): string | null => {
      if (v === null) return null;
      const at = entries[k].sequence.indexOf(v);
      return at < 0 ? null : labelOf(at);
    };
    return {
      queue: { id: queue.id, prompt: queue.prompt, total: queue.items.length, counts: state.counts, stage: state.stage, cursor: rankedOutcomes(state).length },
      items: queue.items.map((q, k) => {
        const s = state.items[k];
        return {
          n: q.n, who: q.who, where: q.where, form: q.form, status: s.status,
          picked: s.status === 'sent' ? label(k, s.sentVariant) : s.status === 'picked' ? label(k, s.choice.variant) : null,
          ...(s.via === 'cli' ? { via: 'cli' } : {}), ...(s.message ? { message: s.message } : {}),
          ...(s.status === 'back' || s.status === 'sentBack' ? { reasons: (s.status === 'back' ? s.back! : s.sentBack!).reasons.map(r => NONE_REASON_LABELS[r as NoneReason] ?? r) } : {}),
        };
      }),
      order: state.order,
      current: currentItem(state),
    };
  }

  private queueRail(c: Ctx): void {
    const { root, queue } = this.findQueue(c.match[1]);
    this.json(c.res, 200, this.railPayload(root, queue));
  }

  /** An item of a queue by its number: a plain 1 or 2 digit number that the queue holds. Never a session id from the request. */
  private resolveItem(c: Ctx): { root: string; queue: Queue; item: QueueItem; entry: ChildEntry } {
    const { root, queue } = this.findQueue(c.match[1]);
    const n = Number(c.match[2]);
    const item = String(n) === c.match[2] ? queue.items.find(i => i.n === n) : undefined;
    if (!item) throw new ProseError('E_NOT_FOUND', 'no such item', { hint: 'The queue has no item with that number' });
    const entry = this.childEntry(root, queue.id, item);
    if (!entry.session) throw new ProseError('E_NOT_FOUND', 'this item is not available', { hint: 'The set or its session may have been deleted' });
    return { root, queue, item, entry };
  }

  /** Run a session handler for an item's child, looked up in the queue's own project only. */
  private itemRoute(c: Ctx, fn: (t: { id: string; root: string; ctx: Ctx }) => Promise<void> | void): Promise<void> | void {
    const t = this.resolveItem(c);
    const match = Object.assign([c.match[0], t.item.sessionId], { index: 0, input: c.match[0] }) as unknown as RegExpExecArray;
    return fn({ id: t.item.sessionId, root: t.root, ctx: { ...c, match, within: t.root } });
  }

  /** The item as the page reads it: the session payload of its child, and where the queue stands on it. */
  private async itemPayload(root: string, queue: Queue, n: number): Promise<SessionPayload & { queue: Record<string, unknown> }> {
    const item = queue.items.find(i => i.n === n)!;
    const payload = await this.payloadAsync(item.sessionId, root);
    const { state } = this.railState(root, queue);
    const s = state.items[n - 1];
    return {
      ...payload,
      queue: { n, stage: state.stage, status: s.status, choice: s.choice, back: s.back, sentBack: s.sentBack, sentVariant: s.sentVariant, ...(s.via ? { via: s.via } : {}), ...(s.message ? { message: s.message } : {}) },
    };
  }

  private async queueItem(c: Ctx): Promise<void> {
    const t = this.resolveItem(c);
    this.json(c.res, 200, await this.itemPayload(t.root, t.queue, t.item.n));
  }

  /** The body of a queue POST: valid JSON, then the strict schema. */
  private async queueBody<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> {
    const text = await readBody(c.req, MAX_BODY);
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new ProseError('E_USAGE', 'the request body is not valid JSON', { hint: 'Send one JSON object' }); }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ProseError('E_SCHEMA', `Invalid request: ${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`.slice(0, 200), { hint: 'See the request shapes the page sends' });
    }
    return parsed.data;
  }

  private needOpen(state: QueueState): void {
    if (state.stage === 'open') return;
    throw new ProseError('E_CONFLICT', state.stage === 'done' ? 'every item is already sent' : `the review is ${state.stage}, so nothing more can be chosen or sent`, { hint: 'Ask your writer to open the sets that are left: prose reading open --pending' });
  }

  /** Staged choices and skips apply to an item that is still undecided; a sent or ended one is settled. */
  private needUndecided(state: QueueState, n: number): void {
    const status = state.items[n - 1].status;
    if (status === 'sent') throw new ProseError('E_CONFLICT', 'this item is already sent', { hint: 'A pick cannot be changed once sent' });
    if (status === 'sentBack') throw new ProseError('E_CONFLICT', 'this item is already sent back', { hint: 'A send-back cannot be changed once sent; your writer can make a new set with prose set new --redo' });
    if (status === 'ended') throw new ProseError('E_CONFLICT', 'this item is closed', { hint: 'Ask your writer to open it again: prose reading open --pending' });
  }

  /** The reply to a queue write: the item as the page shows it, and the rail. */
  private async queueReply(root: string, queue: Queue, n: number, extra: Record<string, unknown> = {}) {
    return { ok: true, ...extra, state: await this.itemPayload(root, queue, n), rail: this.railPayload(root, queue) };
  }

  private async postChoose(c: Ctx): Promise<void> {
    const { root, queue } = this.findQueue(c.match[1]);
    const body = await this.queueBody(c, ChooseBody);
    if (!queue.items.some(i => i.n === body.item)) throw new ProseError('E_SCHEMA', `item ${body.item} is not in this queue`, { hint: `The queue has items 1 to ${queue.items.length}` });
    const out = await this.serial(queue.id, async () => {
      const { state, entries } = this.railState(root, queue);
      this.needOpen(state);
      this.needUndecided(state, body.item);
      const entry = entries[body.item - 1];
      if (!entry.session || !entry.state || entry.state.stage !== 'lineup') throw new ProseError('E_CONFLICT', 'this item can no longer take a choice', { hint: 'Open the set as its own session, or ask your writer to open it again' });
      const shown = new Set(entry.state.candidates.map(x => x.index));
      const passes = [...new Set(body.passes)].filter(p => p !== body.variant);
      for (const v of [...(body.variant !== null ? [body.variant] : []), ...passes]) {
        if (!shown.has(v)) throw new ProseError('E_SCHEMA', `variant ${v} is not in this set`, { hint: `The drafts are ${[...shown].join(', ')}` });
      }
      if (body.variant !== null) {
        // Before it is staged, the file is looked at itself: a draft that changed after sealing cannot be chosen (the CLI would refuse the pick).
        const cand = entry.state.candidates.find(x => x.index === body.variant)!;
        const frozen = frozenHash(root, entry.session, roundMaps(entry.session, []), cand);
        if (!this.variantText(root, entry.session.setId, variantOf(cand), frozen, true).hashOk) {
          throw new ProseError('E_CONFLICT', `draft ${body.variant} changed after it was sealed, so it cannot be chosen`, { hint: 'Ask your writer to restore it' });
        }
      }
      const { duplicate } = await appendQueueEventAsync(root, queue.id, { type: 'choose', item: body.item, variant: body.variant, passes, eventId: body.eventId });
      return this.queueReply(root, queue, body.item, duplicate ? { duplicate: true } : {});
    });
    this.json(c.res, 200, out);
  }

  private async postSkip(c: Ctx): Promise<void> {
    const { root, queue } = this.findQueue(c.match[1]);
    const body = await this.queueBody(c, SkipBody);
    if (!queue.items.some(i => i.n === body.item)) throw new ProseError('E_SCHEMA', `item ${body.item} is not in this queue`, { hint: `The queue has items 1 to ${queue.items.length}` });
    const out = await this.serial(queue.id, async () => {
      const { state } = this.railState(root, queue);
      this.needOpen(state);
      this.needUndecided(state, body.item);
      const { duplicate } = await appendQueueEventAsync(root, queue.id, { type: 'skip', item: body.item, eventId: body.eventId });
      return this.queueReply(root, queue, body.item, duplicate ? { duplicate: true } : {});
    });
    this.json(c.res, 200, out);
  }

  /** Stage "none of these" for an item: validated like the CLI validates it (the fixed reasons, the trimmed and capped note), then kept in the queue log until Send. */
  private async postSendback(c: Ctx): Promise<void> {
    const { root, queue } = this.findQueue(c.match[1]);
    const body = await this.queueBody(c, SendbackBody);
    if (!queue.items.some(i => i.n === body.item)) throw new ProseError('E_SCHEMA', `item ${body.item} is not in this queue`, { hint: `The queue has items 1 to ${queue.items.length}` });
    const feedback = newFeedback({ reasons: body.reasons, closest: body.closest, ...(body.note !== undefined ? { note: body.note } : {}) });
    const out = await this.serial(queue.id, async () => {
      const { state, entries } = this.railState(root, queue);
      this.needOpen(state);
      this.needUndecided(state, body.item);
      const entry = entries[body.item - 1];
      if (!entry.session || !entry.state || entry.state.stage !== 'lineup') throw new ProseError('E_CONFLICT', 'this item can no longer be sent back', { hint: 'Open the set as its own session, or ask your writer to open it again' });
      if (feedback.closest !== null && !entry.state.candidates.some(x => x.index === feedback.closest)) {
        throw new ProseError('E_SCHEMA', `variant ${feedback.closest} is not in this set`, { hint: `The drafts are ${entry.state.candidates.map(x => x.index).join(', ')}` });
      }
      const { duplicate } = await appendQueueEventAsync(root, queue.id, { type: 'sendback', item: body.item, closest: feedback.closest, reasons: feedback.reasons, ...(feedback.note !== undefined ? { note: feedback.note } : {}), eventId: body.eventId });
      return this.queueReply(root, queue, body.item, duplicate ? { duplicate: true } : {});
    });
    this.json(c.res, 200, out);
  }

  /** What the owner reads for an item that could not be sent: the CLI's own words, paths taken out, short enough for the log. */
  private blockedMessage(e: unknown): string {
    if (e instanceof ProseError) return this.scrubPaths(`${e.message}${e.hint ? `. ${e.hint}` : ''}`).slice(0, 300);
    logError((e as Error)?.message ?? String(e));
    return 'Something went wrong sending this one; the server log has the detail';
  }

  /**
   * Send one chosen item: the lineup event (the kept draft and the passes) and then the ship, which runs `set pick` first, so
   * the pick rows, the reveal and the taste model get exactly what a single-set ship gives them. Every step is idempotent by event id and by
   * the child's state, so a retry (or a crash halfway) finishes the job. A failure blocks only this item, with its message.
   */
  private async sendItem(root: string, queue: Queue, n: number, variant: number, passes: number[], sendId: string): Promise<{ n: number; status: 'sent' | 'blocked'; message?: string }> {
    const item = queue.items.find(i => i.n === n)!;
    const id = item.sessionId;
    const blocked = async (message: string) => {
      try { await appendQueueEventAsync(root, queue.id, { type: 'blocked', item: n, message: message.slice(0, 300) }); } catch (e) { logError(`could not record a blocked item: ${(e as Error)?.message}`); }
      return { n, status: 'blocked' as const, message };
    };
    try {
      const session = readSession(root, id);
      if (session.queue !== queue.id) return await blocked('This item is not part of this queue');
      const events = readEvents(root, id);
      const state = foldSession(session, events);
      if (state.shipped !== null) return state.shipped === variant ? { n, status: 'sent' } : await blocked('This set was picked elsewhere, with another draft');
      const set = this.setOf(root, item.setId, true);
      if (!set) return await blocked('This set is no longer available');
      if (set.picked !== undefined) return await blocked(`This set was already picked outside this page (draft ${set.picked})`);
      const cand = state.candidates.find(x => x.index === variant);
      if (!cand) return await blocked('That draft is not in this set');
      const maps = roundMaps(session, events);
      if (!this.variantText(root, item.setId, variantOf(cand), frozenHash(root, session, maps, cand), true).hashOk) {
        return await blocked(`Draft ${variant} changed after it was sealed, so it cannot be picked. Ask your writer to restore it`);
      }
      if (state.stage === 'lineup') {
        const plan = displayPlan(session, state, events);
        await this.serial(id, () => this.applyEvent(root, id, { type: 'lineup', kept: [variant], duds: passes.filter(p => p !== variant), order: plan.order, eventId: `${sendId}-${n}-l` }));
      } else if (!(state.stage === 'refine' || state.stage === 'duel') || !state.shortlist.includes(variant)) {
        return await blocked('This item was partly sent for another draft. Open the set as its own session to finish it');
      }
      await this.serial(id, () => this.applyEvent(root, id, { type: 'ship', champion: variant, eventId: `${sendId}-${n}-s` }));
      return { n, status: 'sent' };
    } catch (e) {
      return await blocked(this.blockedMessage(e));
    }
  }

  /**
   * Send one item back: the session's `none` event, which runs `set none` first (the verdict row, the unscored reveal and the closed set)
   * and appends only if that succeeded. Idempotent by event id and by the child's state; a failure blocks only this item.
   */
  private async sendBackItem(root: string, queue: Queue, n: number, back: { closest: number | null; reasons: string[]; note?: string }, sendId: string): Promise<{ n: number; status: 'sent' | 'blocked'; message?: string }> {
    const item = queue.items.find(i => i.n === n)!;
    const id = item.sessionId;
    const blocked = async (message: string) => {
      try { await appendQueueEventAsync(root, queue.id, { type: 'blocked', item: n, message: message.slice(0, 300) }); } catch (e) { logError(`could not record a blocked item: ${(e as Error)?.message}`); }
      return { n, status: 'blocked' as const, message };
    };
    try {
      const session = readSession(root, id);
      if (session.queue !== queue.id) return await blocked('This item is not part of this queue');
      const state = foldSession(session, readEvents(root, id));
      if (state.sentBack) return { n, status: 'sent' };
      if (state.shipped !== null) return await blocked('This set was picked elsewhere');
      const set = this.setOf(root, item.setId, true);
      if (!set) return await blocked('This set is no longer available');
      if (set.picked !== undefined) return await blocked(`This set was already picked outside this page (draft ${set.picked})`);
      if (state.stage !== 'lineup') return await blocked('This item was partly judged in its own session. Open the set as its own session to finish it');
      await this.serial(id, () => this.applyEvent(root, id, { type: 'none', closest: back.closest, reasons: back.reasons as never, ...(back.note !== undefined ? { note: back.note } : {}), eventId: `${sendId}-${n}-n` }));
      return { n, status: 'sent' };
    } catch (e) {
      return await blocked(this.blockedMessage(e));
    }
  }

  private async postSend(c: Ctx): Promise<void> {
    const { root, queue } = this.findQueue(c.match[1]);
    const body = await this.queueBody(c, SendBody);
    const out = await this.serial(queue.id, async () => {
      const { state } = this.railState(root, queue);
      const todo = state.order.filter(n => { const s = state.items[n - 1]; return s.status === 'picked' || s.status === 'back' || (s.status === 'blocked' && (s.choice.variant !== null || s.back !== null)); });
      const earlier = this.queueEvents(root, queue.id).find(e => e.type === 'send' && e.sendId === body.sendId);
      if (todo.length === 0 && earlier && earlier.type === 'send') {
        // a retry of a send that already finished: nothing to redo, the same answer
        const results = earlier.items.map(n => ({ n, status: state.items[n - 1]?.status === 'sent' || state.items[n - 1]?.status === 'sentBack' ? 'sent' : 'blocked', ...(state.items[n - 1]?.message ? { message: state.items[n - 1].message } : {}) }));
        return this.queueReply(root, queue, earlier.items[0] ?? 1, { duplicate: true, results });
      }
      this.needOpen(state);
      if (todo.length === 0) throw new ProseError('E_CONFLICT', 'nothing is chosen to send', { hint: 'Keep a draft in an item, or send one back, then press Send' });
      await appendQueueEventAsync(root, queue.id, { type: 'send', sendId: body.sendId, items: todo });
      const results: Array<{ n: number; status: 'sent' | 'blocked'; message?: string }> = [];
      for (const n of todo) {
        const it = state.items[n - 1];
        results.push(it.choice.variant === null && it.back ? await this.sendBackItem(root, queue, n, it.back, body.sendId) : await this.sendItem(root, queue, n, it.choice.variant!, it.choice.passes, body.sendId));
      }
      return this.queueReply(root, queue, todo[0], { results });
    });
    this.json(c.res, 200, out);
  }

  /** Finish the review: record it, then abandon every child that was not sent (idempotent; a retry sweeps again). Staged choices that were never sent are dropped; the sets stay unpicked and sealed. */
  private async postFinish(c: Ctx): Promise<void> {
    const { root, queue } = this.findQueue(c.match[1]);
    const body = await this.queueBody(c, FinishBody);
    const out = await this.serial(queue.id, async () => {
      const before = this.railState(root, queue).state;
      if (before.stage !== 'finished' && before.stage !== 'closed') await appendQueueEventAsync(root, queue.id, { type: 'finish', eventId: body.eventId });
      const { entries } = this.railState(root, queue);
      for (const [k, entry] of entries.entries()) {
        if (!entry.state || entry.state.stage === 'shipped' || entry.state.stage === 'sentBack' || entry.state.stage === 'abandoned') continue;
        const id = queue.items[k].sessionId;
        try { await this.serial(id, () => appendEventAsync(root, id, { type: 'abandon' })); } catch { /* it finished meanwhile */ }
      }
      return { ok: true, rail: this.railPayload(root, queue) };
    });
    this.json(c.res, 200, out);
  }

  // ---- HTTP ----

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  }

  private page(res: ServerResponse, key: PageKey): void {
    res.writeHead(200, { 'content-type': PAGES[key].type });
    res.end(this.pages.get(key));
  }

  /** A font or licence: not secret, named per plugin version, so it may be cached (every other response is no-store). */
  private asset(res: ServerResponse, path: AssetPath): void {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.writeHead(200, { 'content-type': ASSETS[path].type });
    res.end(this.assets.get(path));
  }

  /** An error as the page gets it: the code, message and hint, with project and home paths scrubbed out. */
  private errorBody(e: ProseError): { error: { code: ErrorCode; message: string; hint?: string } } {
    const scrub = (text: string) => this.scrubPaths(text);
    return { error: { code: e.code, message: scrub(e.message), ...(e.hint !== undefined ? { hint: scrub(e.hint) } : {}) } };
  }

  /** Text with the project and home paths taken out. */
  private scrubPaths(text: string): string {
    const roots = [...this.knownProjects(), proseHome()].flatMap(r => [r, r.replaceAll('\\', '/')]);
    const joined = roots.join('\0');
    if (this.scrubMemo?.roots !== joined) {
      const escape = (r: string) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      this.scrubMemo = { roots: joined, re: new RegExp(roots.map(escape).join('|'), process.platform === 'win32' ? 'gi' : 'g') };
    }
    return text.replace(this.scrubMemo.re, '<path>');
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // The path is taken from the request line as sent: nothing normalises it, and nothing below joins it to the disk.
    const target = req.url ?? '/';
    const q = target.indexOf('?');
    let path: string;
    try { path = decodeURIComponent(q < 0 ? target : target.slice(0, q)); }
    catch { throw new ProseError('E_USAGE', 'malformed URL'); }
    const query = new URLSearchParams(q < 0 ? '' : target.slice(q + 1));
    const method = req.method ?? 'GET';

    if (!hostAllowed(this.info.host, this.info.port, req.headers.host)) {
      throw withStatus(new ProseError('E_SERVER', 'unexpected Host header', { hint: 'Open the link exactly as prose serve printed it' }), 421);
    }
    if (method === 'POST' && !originAllowed(req.headers.origin, req.headers.host)) {
      throw withStatus(new ProseError('E_SERVER', 'cross-origin request refused', { hint: 'The page may only post to the server it was loaded from' }), 403);
    }

    if (path === '/favicon.ico' && method === 'GET') { res.writeHead(204); res.end(); return; } // no icon, and no 404 in the console
    if (isAsset(path)) {
      if (method !== 'GET') throw methodNotAllowed();
      return this.asset(res, path);
    }
    if (!path.startsWith('/api/')) {
      const key: PageKey | null = path === '/' || /^\/(?:s|q)\/[a-z0-9-]+$/.test(path) ? 'index' : path === '/app.js' ? 'app' : path === '/style.css' ? 'style' : null;
      if (!key) throw NOT_FOUND();
      if (method !== 'GET') throw methodNotAllowed();
      return this.page(res, key);
    }

    const token = query.get('t') ?? (req.headers['x-prose-token'] as string | undefined) ?? '';
    const authed = sameToken(token, this.info.token);
    if (path === '/api/health') {
      if (method !== 'GET') throw methodNotAllowed();
      return this.json(res, 200, { ok: true, authed, pid: process.pid, api: SERVER_API });
    }
    if (!authed) return this.json(res, 401, { error: { code: 'E_SERVER', message: 'missing or wrong token (the link carries ?t=...)' } });

    let pathMatched = false;
    for (const r of this.routes) {
      const match = r.re.exec(path);
      if (!match) continue;
      pathMatched = true;
      if (r.method === method) return r.handler({ req, res, match, path });
    }
    if (pathMatched) throw methodNotAllowed();
    throw new ProseError('E_NOT_FOUND', 'unknown endpoint');
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    // Every response, whatever its status, carries these.
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Cache-Control', 'no-store');
    this.route(req, res).catch(e => {
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof ProseError) {
        const status = (e as { status?: number }).status ?? STATUS[e.code] ?? 500;
        return this.json(res, status, this.errorBody(e));
      }
      // Detail goes to the log (never the token or the request URL); the page gets nothing it could leak.
      logError((e as Error)?.message ?? String(e));
      this.json(res, 500, { error: { code: 'E_SERVER', message: 'internal error', hint: SERVER_LOG_HINT } });
    });
  }

  private loadPages(): void {
    const dir = this.opts.runtimeDir ?? RUNTIME_DIR;
    for (const [key, { file }] of Object.entries(PAGES) as Array<[PageKey, { file: string }]>) {
      try { this.pages.set(key, readFileSync(join(dir, file))); }
      catch { throw new ProseError('E_SERVER', `The page file ${file} is missing from the runtime`, { hint: 'Run the prose-setup skill again to repair the managed runtime' }); }
    }
    for (const [path, { file }] of Object.entries(ASSETS) as Array<[AssetPath, { file: string }]>) {
      try { this.assets.set(path, readFileSync(join(dir, file))); }
      catch { throw new ProseError('E_SERVER', `The page file ${file} is missing from the runtime`, { hint: 'Run the prose-setup skill again to repair the managed runtime' }); }
    }
  }

  async listen(): Promise<ServerInfo> {
    this.loadPages();
    const host = this.opts.host ?? '0.0.0.0';
    const token = this.opts.token ?? serverToken();
    let port = this.opts.port ?? DEFAULT_PORT;
    this.server = createServer((req, res) => this.handle(req, res));
    this.server.maxConnections = this.opts.maxConnections ?? MAX_CONNECTIONS;
    this.server.headersTimeout = HEADERS_TIMEOUT_MS;
    this.server.requestTimeout = REQUEST_TIMEOUT_MS;
    this.server.keepAliveTimeout = KEEP_ALIVE_MS;
    for (let attempt = 0; ; attempt++) {
      try {
        await new Promise<void>((ok, fail) => { this.server.once('error', fail); this.server.listen(port, host, () => { this.server.off('error', fail); ok(); }); });
        break;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === 'EADDRINUSE' && this.opts.port === undefined && attempt < 20) { port++; continue; }
        throw new ProseError('E_SERVER', `Could not listen on ${host}:${port} (${code ?? (e as Error).message})`, { hint: code === 'EADDRINUSE' ? 'Pick another port' : undefined });
      }
    }
    const actual = (this.server.address() as AddressInfo).port;
    this.info = {
      pid: process.pid, port: actual, host, token, projects: this.knownProjects(), startedAt: new Date().toISOString(),
      url: `http://${host === '127.0.0.1' ? '127.0.0.1' : publicHost()}:${actual}`, api: SERVER_API,
    };
    if (this.opts.logFile) openLog(this.opts.logFile, token);
    if (this.opts.persist !== false) writeServerInfo(this.info);
    return this.info;
  }

  close(): Promise<void> {
    if (logSink && logSink.file === this.opts.logFile) logSink = null;
    return new Promise(done => {
      if (!this.server?.listening) return done();
      this.server.close(() => done());
      this.server.closeAllConnections();
    });
  }
}

export const sessionUrl = (info: Pick<ServerInfo, 'url' | 'token'>, id: string) => `${info.url}/s/${id}?t=${info.token}`;
export const queueUrl = (info: Pick<ServerInfo, 'url' | 'token'>, id: string) => `${info.url}/q/${id}?t=${info.token}`;
