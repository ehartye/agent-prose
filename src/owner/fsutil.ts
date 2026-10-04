import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { chmod as chmodAsync, rename as renameAsync, rm as rmAsync, writeFile as writeFileAsync } from 'node:fs/promises';
import { join } from 'node:path';
import { ProseError } from '../errors.ts';
import { setDir } from './paths.ts';

const sleepSync = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const sleepAsync = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

/** Windows refuses to delete a directory while another process reads a file in it; retry briefly. */
const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 10 } as const;
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 10;

export interface AtomicWriteOptions {
  rename?: (from: string, to: string) => void;
  /** File mode for the new file (e.g. 0o600 for a secret): set when the temp file is created, so it is never visible with another mode. Windows has no effect beyond the read-only bit. */
  mode?: number;
}

/**
 * Write a temp file next to `path`, then rename it over `path`, so a reader never sees a half-written file. On
 * Windows a rename can fail for a moment while another process (a virus scanner, an indexer, a reader) has the file
 * open, so EPERM/EBUSY/EACCES are retried (10 attempts, 10-50 ms apart). Any final failure removes the temp file and
 * throws E_INTERNAL naming the path.
 */
export function writeFileAtomic(path: string, text: string, { rename = renameSync, mode }: AtomicWriteOptions = {}): void {
  const tmp = tmpNameFor(path);
  try {
    writeFileSync(tmp, text, mode === undefined ? undefined : { mode });
    if (mode !== undefined) chmodSync(tmp, mode); // the umask only ever removes bits at creation; this makes the mode exact
    for (let attempt = 1; ; attempt++) {
      try { rename(tmp, path); return; }
      catch (e) {
        if (!retryable(e, attempt)) throw e;
        sleepSync(backoffMs(attempt));
      }
    }
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw atomicFailure(path, e);
  }
}

/** writeFileAtomic for a server: the same temp file, rename and retry rules, with async fs and a timer between retries. */
export async function writeFileAtomicAsync(path: string, text: string, { rename = renameAsync, mode }: { rename?: (from: string, to: string) => Promise<void>; mode?: number } = {}): Promise<void> {
  const tmp = tmpNameFor(path);
  try {
    await writeFileAsync(tmp, text, mode === undefined ? undefined : { mode });
    if (mode !== undefined) await chmodAsync(tmp, mode);
    for (let attempt = 1; ; attempt++) {
      try { await rename(tmp, path); return; }
      catch (e) {
        if (!retryable(e, attempt)) throw e;
        await sleepAsync(backoffMs(attempt));
      }
    }
  } catch (e) {
    try { await rmAsync(tmp, { force: true }); } catch { /* best effort */ }
    throw atomicFailure(path, e);
  }
}

const tmpNameFor = (path: string) => `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
const retryable = (e: unknown, attempt: number) => TRANSIENT.has((e as NodeJS.ErrnoException).code ?? '') && attempt < RENAME_ATTEMPTS;
const backoffMs = (attempt: number) => Math.min(50, 10 * attempt);
const atomicFailure = (path: string, e: unknown): ProseError => (e instanceof ProseError ? e
  : new ProseError('E_INTERNAL', `Could not write ${path}: ${(e as Error)?.message ?? String(e)}`, {
    hint: 'Another program may have the file open; try again', details: { cause: (e as NodeJS.ErrnoException)?.code ?? null },
  }));

export interface LockOptions {
  /** Give up waiting after this long (E_CONFLICT). */
  timeoutMs?: number;
  /** A lock whose owner process is dead (or unknown) is taken over once it is older than this. */
  deadGraceMs?: number;
  /** A lock not refreshed by a heartbeat for this long is taken over even if its owner seems alive. */
  hardStaleMs?: number;
  /** How often a waiter looks again. */
  pollMs?: number;
}

/** Given to the function run under the lock. */
export interface LockContext {
  /** Refresh the lock (its mtime) between steps; throws E_CONFLICT if the lock is no longer ours. */
  heartbeat(): void;
}

interface Owner { pid: number; token: string; at: string }

const ownerOf = (lock: string): Owner | null => {
  try {
    const o = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8'));
    return Number.isInteger(o?.pid) && o.pid > 0 && typeof o?.token === 'string' ? o : null;
  } catch { return null; }
};

/** True unless the process is known to be gone. EPERM means it exists but belongs to someone else. */
const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; }
  catch (e) { return (e as NodeJS.ErrnoException).code !== 'ESRCH'; }
};

type Judgement = { stale: boolean; token: string | null; mtimeMs: number };

/** Whether the lock directory at `dir` may be taken over, by its owner's liveness and its last heartbeat. */
function judge(dir: string, deadGraceMs: number, hardStaleMs: number): Judgement | null {
  let mtimeMs: number;
  try { mtimeMs = statSync(dir).mtimeMs; } catch { return null; /* gone */ }
  const owner = ownerOf(dir);
  const age = Date.now() - mtimeMs;
  const dead = owner === null || !alive(owner.pid); // no readable owner.json: the holder crashed before writing it
  return { stale: (age > deadGraceMs && dead) || age > hardStaleMs, token: owner?.token ?? null, mtimeMs };
}

/** The command that lists what a lock guards, for the not-found hint. */
const LISTING: Record<string, string> = { set: 'prose set list', session: 'prose reading list', strikes: 'prose strike list --all' };

/** What a lock guards, for messages: `Set demo` or `Session read-1`. */
const named = (noun: string, id: string) => `${noun[0].toUpperCase()}${noun.slice(1)} ${id}`;

const conflict = (noun: string, id: string, lock: string) =>
  new ProseError('E_CONFLICT', `${named(noun, id)} is being changed by another command; try again`, {
    hint: `If no other prose command is running, wait a few seconds and retry; it is recovered automatically (or delete ${lock})`,
  });

/**
 * Take a stale lock without a check-then-act race: move it aside under a unique name (of several takers, one rename
 * wins), then judge the moved directory again. If it is not the lock we judged stale (another owner's, or it was
 * heartbeated meanwhile), put it back; if a new lock already took its place, leave it moved and fail rather than
 * destroy anything. Returns true when the stale lock is gone and acquiring can be retried at once.
 */
function takeOver(lock: string, judged: Judgement, deadGraceMs: number, hardStaleMs: number, noun: string, id: string): boolean {
  const moved = `${lock}.stale-${randomUUID()}`;
  try { renameSync(lock, moved); } catch { return false; /* another taker moved it, or its holder released it */ }
  const again = judge(moved, deadGraceMs, hardStaleMs);
  if (again && (!again.stale || again.token !== judged.token)) {
    if (existsSync(lock)) throw conflict(noun, id, lock);
    try { renameSync(moved, lock); return false; }
    catch { throw conflict(noun, id, lock); }
  }
  try { rmSync(moved, RM); } catch { /* best effort; swept later */ }
  return true;
}

/** Remove moved-aside locks that are themselves stale (their takers crashed). Never touches a live one. */
function sweep(dir: string, deadGraceMs: number, hardStaleMs: number): void {
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith('.lock.stale-')) continue;
      const p = join(dir, name);
      if (judge(p, deadGraceMs, hardStaleMs)?.stale) rmSync(p, RM);
    }
  } catch { /* best effort */ }
}

/**
 * Run `fn` holding an exclusive lock on one set (see withDirLock).
 */
export function withSetLock<T>(project: string, id: string, fn: (ctx: LockContext) => T, opts: LockOptions = {}): T {
  return withDirLock(setDir(project, id), { noun: 'set', id, project }, fn, opts);
}

/**
 * Run `fn` holding the locks of several sets at once. DEADLOCK RULE: the locks are always taken in ascending set-id
 * order (ids de-duplicated), whatever order the caller names them in, so two commands that need the same pair of sets
 * (A then B, B then A) queue instead of each holding one and waiting for the other. Never take a set lock while
 * holding a lock of a LATER id. The context's heartbeat refreshes every lock held.
 */
export function withSetLocks<T>(project: string, ids: string[], fn: (ctx: LockContext) => T, opts: LockOptions = {}): T {
  const sorted = [...new Set(ids)].sort();
  const held: LockContext[] = [];
  const ctx: LockContext = { heartbeat() { for (const h of held) h.heartbeat(); } };
  const take = (k: number): T => k === sorted.length ? fn(ctx) : withSetLock(project, sorted[k], c => { held.push(c); return take(k + 1); }, opts);
  return take(0);
}

/** Everything one lock acquisition needs, resolved once: shared by the sync and the async path. */
interface Plan { lock: string; dir: string; noun: string; id: string; project: string; timeoutMs: number; deadGraceMs: number; hardStaleMs: number; pollMs: number }

function planOf(dir: string, what: { noun: string; id: string; project: string }, opts: LockOptions): Plan {
  const { timeoutMs = 5000, deadGraceMs = 2000, hardStaleMs = 120_000, pollMs = 25 } = opts;
  return { ...what, dir, lock: join(dir, '.lock'), timeoutMs, deadGraceMs, hardStaleMs, pollMs };
}

/**
 * One try at taking the lock, with every rule in one place (mkdir is the atomic claim, owner.json names the owner, a
 * stale lock is taken over by `takeOver`). Returns 'held' when the lock is ours, 'now' when a stale lock was just
 * removed and another try should follow at once, or the milliseconds to wait before the next try. It never waits itself:
 * the sync caller sleeps with Atomics.wait and the async caller awaits a timer, which is the only difference between
 * `withDirLock` and `withDirLockAsync`.
 */
function attempt(p: Plan, token: string): 'held' | 'now' | number {
  const { lock, noun, id, project } = p;
  let made = false;
  try { mkdirSync(lock); made = true; }
  catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') throw new ProseError('E_NOT_FOUND', `No ${noun} ${id} in ${project}`, { hint: `${LISTING[noun] ?? `the ${noun} folder is missing`} shows the ${noun.endsWith('s') ? noun : `${noun}s`}` });
    if (err.code !== 'EEXIST' && err.code !== 'EPERM') throw e; // EPERM: Windows, a lock that is being deleted
  }
  if (made) {
    try {
      writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, token, at: new Date().toISOString() } satisfies Owner));
      return 'held';
    } catch (e) {
      // ENOENT: a taker that had judged an older lock moved our fresh one aside; it puts it back or fails. The
      // path is no longer certainly ours, so it is never deleted here: wait and try again. (Any other failure
      // leaves an owner-less lock, which the next command recovers after deadGraceMs.)
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  const j = judge(lock, p.deadGraceMs, p.hardStaleMs);
  if (j?.stale && takeOver(lock, j, p.deadGraceMs, p.hardStaleMs, noun, id)) return 'now';
  return j === null ? 1 : p.pollMs; // null: released between our mkdir and stat
}

/** After acquiring: sweep abandoned moved-aside locks and hand out the heartbeat context and the release. */
function held(p: Plan, token: string): { ctx: LockContext; release: () => void } {
  sweep(p.dir, p.deadGraceMs, p.hardStaleMs);
  const { lock, noun, id } = p;
  const ours = () => ownerOf(lock)?.token === token;
  const ctx: LockContext = {
    heartbeat() {
      if (!ours()) throw new ProseError('E_CONFLICT', `Lost the lock on ${noun} ${id} (another command took it over); nothing more was written`, { hint: 'Run the command again' });
      const now = new Date();
      try { utimesSync(lock, now, now); }
      catch { throw new ProseError('E_CONFLICT', `Lost the lock on ${noun} ${id}; nothing more was written`, { hint: 'Run the command again' }); }
    },
  };
  return { ctx, release: () => { try { if (ours()) rmSync(lock, RM); } catch { /* never fail on release */ } } };
}

/**
 * Run `fn` holding an exclusive lock on one directory (a set, a reading session): a `.lock` directory inside it (mkdir is atomic) with an
 * `owner.json` of `{ pid, token, at }`. `fn` should call `ctx.heartbeat()` between steps. A waiter takes the lock
 * over only when its owner is dead (or unknown) and it is older than `deadGraceMs`, or when it has not been
 * heartbeated for `hardStaleMs`; a live, fresh lock is never taken however long it is held. Waiting longer than
 * `timeoutMs` throws E_CONFLICT. Release removes the lock only if it is still ours. Waiting is a synchronous sleep:
 * for a command line, never for a server (use `withDirLockAsync`).
 */
export function withDirLock<T>(dir: string, what: { noun: string; id: string; project: string }, fn: (ctx: LockContext) => T, opts: LockOptions = {}): T {
  const plan = planOf(dir, what, opts);
  const token = randomUUID();
  const deadline = Date.now() + plan.timeoutMs;
  for (;;) {
    const r = attempt(plan, token);
    if (r === 'held') break;
    if (r === 'now') continue;
    if (Date.now() >= deadline) throw conflict(plan.noun, plan.id, plan.lock);
    sleepSync(r);
  }
  const { ctx, release } = held(plan, token);
  try { return fn(ctx); } finally { release(); }
}

/**
 * The same lock as `withDirLock` (one `attempt`, one `held`, the same owner token, heartbeat, dead-pid and hard-stale
 * rules, interoperable with the sync version in other processes), but a waiter awaits a timer instead of sleeping
 * synchronously, so a server's event loop keeps serving other requests while it waits. `fn` may be async.
 */
export async function withDirLockAsync<T>(dir: string, what: { noun: string; id: string; project: string }, fn: (ctx: LockContext) => Promise<T> | T, opts: LockOptions = {}): Promise<T> {
  const plan = planOf(dir, what, opts);
  const token = randomUUID();
  const deadline = Date.now() + plan.timeoutMs;
  for (;;) {
    const r = attempt(plan, token);
    if (r === 'held') break;
    if (r === 'now') continue;
    if (Date.now() >= deadline) throw conflict(plan.noun, plan.id, plan.lock);
    await sleepAsync(r);
  }
  const { ctx, release } = held(plan, token);
  try { return await fn(ctx); } finally { release(); }
}
