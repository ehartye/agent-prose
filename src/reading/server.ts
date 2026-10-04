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
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { hostname, networkInterfaces } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { ProseError, type ErrorCode } from '../errors.ts';
import { writeFileAtomic } from '../owner/fsutil.ts';
import { ID_RE, projectKey, proseHome, sessionDir, sessionsDir, setDir, validId } from '../owner/paths.ts';
import { KNOWN_DIRECTIONS } from '../owner/directions.ts';
import { readPrediction, textHash } from '../owner/prediction.ts';
import { draftHash, originalLines, type Original } from '../owner/original.ts';
import { briefView, readSet, variantPath, type PromptSet } from '../owner/sets.ts';
import {
  CLIENT_EVENTS, EventSchema, appendEventAsync, checkTransition, foldSession, nextPair, readEvents, readReveal, readSession, variantOf, writeRevealAsync,
  type PairChooser, type Session, type SessionCandidate, type SessionEvent, type SessionState, type StoredEvent,
} from './session.ts';
import { TasteDuels, type DuelCandidateSource } from './taste.ts';
import { layoutOf, type Layout, type UnitLayout } from './units.ts';

export const DEFAULT_PORT = 47311;
/** Bump when routes change: a running server of another API level is replaced, not reused. */
export const SERVER_API = 1;
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
/** The request body cap for POST /event. */
const MAX_BODY = 64 * 1024;
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

const CSP = "default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
/** The only files the server ever serves as pages, by request path; the content type is fixed per entry. */
const PAGES = {
  index: { file: 'index.html', type: 'text/html; charset=utf-8' },
  app: { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  style: { file: 'style.css', type: 'text/css; charset=utf-8' },
} as const;
type PageKey = keyof typeof PAGES;

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

/** Where a candidate lives: the set holding it and its variant number inside that set. */
interface Where { setId: string; variant: number; round: number }

interface Candidate { index: number; label: string; units?: string[]; layout?: Layout; breaks?: number[]; changed: boolean; hashOk: boolean; name?: string; direction?: string | null; angle?: string; note?: string }

interface SessionRow { id: string; setId: string; form: string; stage: string; createdAt: string; project: string }

/** The line(s) the set revises, as the owner sees them, and whether the draft has changed since. */
export interface OriginalView { source: string; lines: ReturnType<typeof originalLines>; stale: boolean }

export interface SessionPayload {
  session: { id: string; setId: string; form: string; register: string | null; prompt: string; target: Session['target']; wpm: number | null; brief: ReturnType<typeof briefView> | null; original: OriginalView | null };
  state: Omit<SessionState, 'candidates'>;
  candidates: Candidate[];
  order: number[];
  /** The next head-to-head in canonical order (null outside the duel stage). */
  pair: [number, number] | null;
  /** The direction vocabulary the refine screen offers. */
  directions: string[];
  reveal: { shipped: boolean };
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
interface Ctx { req: IncomingMessage; res: ServerResponse; match: RegExpExecArray; path: string }
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
  private routes: Route[];
  /** One write at a time per session: the read-check-CLI-append of two events never interleaves. */
  private queues = new Map<string, Promise<unknown>>();
  /** Parsed sets by set.json path, valid while its (mtime, size) is unchanged. */
  private draftCache = new Map<string, { key: string; hash: string | null }>();
  private setCache = new Map<string, { key: string; set: PromptSet }>();
  /** A variant's checked text by file path, valid while the file's (mtime, size) and the frozen hash are unchanged. */
  private textCache = new Map<string, { key: string; text: string | null; hashOk: boolean; layout?: ReturnType<typeof layoutOf> }>();
  /** One /api/sessions row per session, valid while session.json and events.jsonl are unchanged. */
  private rowCache = new Map<string, { key: string; row: SessionRow | null }>();
  /** How many variant files were read and hashed (a poll that finds nothing changed adds none); for tests. */
  readonly reads = { variants: 0, drafts: 0 };
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
      { method: 'POST', re: /^\/api\/session\/([a-z0-9-]+)\/event$/, handler: c => this.postEvent(c) },
    ];
  }

  /** Registered project roots: the ones given at construction plus whatever `registerProject` has recorded since. */
  private knownProjects(): string[] {
    const info = readServerInfoCached();
    if (this.projectsMemo?.from !== info || this.projectsMemo === null) this.projectsMemo = { from: info, result: uniqueProjects([...this.projects, ...(info?.projects ?? [])]) };
    return this.projectsMemo.result;
  }

  /** The project holding session `id`. An id that is not a valid id is "not found", like an unknown one. */
  private findSession(id: string): string {
    let valid = false;
    try { validId(id, 'Session id'); valid = ID_RE.test(id); } catch { /* not a session id */ }
    if (valid) {
      for (const root of this.knownProjects()) {
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
  private variantText(root: string, setId: string, index: number, frozen: string | undefined, fresh = false): { set: PromptSet | null; text: string | null; hashOk: boolean; layout: UnitLayout | null } {
    const set = this.setOf(root, setId, fresh);
    const none = { set, text: null, hashOk: false, layout: null };
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
      return { set, text: entry.text, hashOk: true, layout: entry.layout };
    } catch { return none; }
  }

  /**
   * The page payload with the duel chosen by the taste model when it is usable. The model and the shortlisted candidates'
   * vectors are awaited here (async fs, cached), then the synchronous payload is built; any failure leaves the old rule.
   */
  private async payloadAsync(id: string): Promise<SessionPayload> {
    let choose: PairChooser | null = null;
    try {
      const root = this.findSession(id);
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
    return this.payload(id, choose ?? undefined);
  }

  private payload(id: string, choose?: PairChooser): SessionPayload {
    const root = this.findSession(id);
    const session = readSession(root, id);
    const events = readEvents(root, id);
    const state = foldSession(session, events);
    const plan = displayPlan(session, state, events);
    const maps = roundMaps(session, events);
    const byIndex = new Map(state.candidates.map(c => [c.index, c]));
    const make = (index: number): Candidate => {
      const c = byIndex.get(index)!;
      const setId = maps.roundSet.get(c.round) ?? session.setId;
      const { set, hashOk, layout } = this.variantText(root, setId, variantOf(c), frozenHash(root, session, maps, c));
      const out: Candidate = { index, label: labelOf(plan.sequence.indexOf(index)), changed: !hashOk, hashOk };
      if (layout !== null) Object.assign(out, layout);
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
      session: { id: session.id, setId: session.setId, form: session.form, register: session.register, prompt: session.prompt, target: session.target, wpm: session.wpm, brief: this.briefOf(root, maps), original: this.originalOf(root, session.setId) },
      state: publicState,
      candidates: shown.map(make),
      order: plan.order,
      pair: nextPair(state, choose),
      directions: KNOWN_DIRECTIONS,
      reveal: { shipped: state.shipped !== null },
    };
  }

  private reveal(id: string): unknown {
    const root = this.findSession(id);
    const state = foldSession(readSession(root, id), readEvents(root, id));
    const reveal = state.shipped !== null ? readReveal(root, id) : null;
    if (reveal === null) throw new ProseError('E_NOT_FOUND', 'not shipped yet', { hint: 'The reveal appears once the session is shipped' });
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

  private async postEvent(c: Ctx): Promise<void> {
    const id = c.match[1];
    const root = this.findSession(id);
    const text = await readBody(c.req, MAX_BODY);
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new ProseError('E_USAGE', 'the request body is not valid JSON', { hint: 'Send one JSON event object' }); }
    const type = (raw as { type?: unknown } | null)?.type;
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
    if (eventId !== undefined && events.some(e => e.type === event.type && (e as { eventId?: string }).eventId === eventId)) return { ok: true, duplicate: true, state: await this.payloadAsync(id) };
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
      default: break;
    }
    await appendEventAsync(root, id, checked);
    return { ok: true, state: await this.payloadAsync(id) };
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

  // ---- HTTP ----

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  }

  private page(res: ServerResponse, key: PageKey): void {
    res.writeHead(200, { 'content-type': PAGES[key].type });
    res.end(this.pages.get(key));
  }

  /** An error as the page gets it: the code, message and hint, with project and home paths scrubbed out. */
  private errorBody(e: ProseError): { error: { code: ErrorCode; message: string; hint?: string } } {
    const roots = [...this.knownProjects(), proseHome()].flatMap(r => [r, r.replaceAll('\\', '/')]);
    const joined = roots.join('\0');
    if (this.scrubMemo?.roots !== joined) {
      const escape = (r: string) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      this.scrubMemo = { roots: joined, re: new RegExp(roots.map(escape).join('|'), process.platform === 'win32' ? 'gi' : 'g') };
    }
    const re = this.scrubMemo.re;
    const scrub = (text: string) => text.replace(re, '<path>');
    return { error: { code: e.code, message: scrub(e.message), ...(e.hint !== undefined ? { hint: scrub(e.hint) } : {}) } };
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
    if (!path.startsWith('/api/')) {
      const key: PageKey | null = path === '/' || /^\/s\/[a-z0-9-]+$/.test(path) ? 'index' : path === '/app.js' ? 'app' : path === '/style.css' ? 'style' : null;
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
