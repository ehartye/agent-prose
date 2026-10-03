import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../errors.ts';
import { setDir } from './paths.ts';

const sleepSync = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** Windows refuses to delete a directory while another process reads a file in it; retry briefly. */
const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 10 } as const;
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 10;

export interface AtomicWriteOptions { rename?: (from: string, to: string) => void }

/**
 * Write a temp file next to `path`, then rename it over `path`, so a reader never sees a half-written file. On
 * Windows a rename can fail for a moment while another process (a virus scanner, an indexer, a reader) has the file
 * open, so EPERM/EBUSY/EACCES are retried (10 attempts, 10-50 ms apart). Any final failure removes the temp file and
 * throws E_INTERNAL naming the path.
 */
export function writeFileAtomic(path: string, text: string, { rename = renameSync }: AtomicWriteOptions = {}): void {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(tmp, text);
    for (let attempt = 1; ; attempt++) {
      try { rename(tmp, path); return; }
      catch (e) {
        if (!TRANSIENT.has((e as NodeJS.ErrnoException).code ?? '') || attempt >= RENAME_ATTEMPTS) throw e;
        sleepSync(Math.min(50, 10 * attempt));
      }
    }
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* best effort */ }
    if (e instanceof ProseError) throw e;
    throw new ProseError('E_INTERNAL', `Could not write ${path}: ${(e as Error)?.message ?? String(e)}`, {
      hint: 'Another program may have the file open; try again', details: { cause: (e as NodeJS.ErrnoException)?.code ?? null },
    });
  }
}

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

const conflict = (id: string, lock: string) =>
  new ProseError('E_CONFLICT', `Set ${id} is being changed by another command; try again`, {
    hint: `If no other prose command is running, wait a few seconds and retry; it is recovered automatically (or delete ${lock})`,
  });

/**
 * Take a stale lock without a check-then-act race: move it aside under a unique name (of several takers, one rename
 * wins), then judge the moved directory again. If it is not the lock we judged stale (another owner's, or it was
 * heartbeated meanwhile), put it back; if a new lock already took its place, leave it moved and fail rather than
 * destroy anything. Returns true when the stale lock is gone and acquiring can be retried at once.
 */
function takeOver(lock: string, judged: Judgement, deadGraceMs: number, hardStaleMs: number, id: string): boolean {
  const moved = `${lock}.stale-${randomUUID()}`;
  try { renameSync(lock, moved); } catch { return false; /* another taker moved it, or its holder released it */ }
  const again = judge(moved, deadGraceMs, hardStaleMs);
  if (again && (!again.stale || again.token !== judged.token)) {
    if (existsSync(lock)) throw conflict(id, lock);
    try { renameSync(moved, lock); return false; }
    catch { throw conflict(id, lock); }
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
 * Run `fn` holding an exclusive lock on one set: a `.lock` directory inside it (mkdir is atomic) with an
 * `owner.json` of `{ pid, token, at }`. `fn` should call `ctx.heartbeat()` between steps. A waiter takes the lock
 * over only when its owner is dead (or unknown) and it is older than `deadGraceMs`, or when it has not been
 * heartbeated for `hardStaleMs`; a live, fresh lock is never taken however long it is held. Waiting longer than
 * `timeoutMs` throws E_CONFLICT. Release removes the lock only if it is still ours.
 */
export function withSetLock<T>(project: string, id: string, fn: (ctx: LockContext) => T, opts: LockOptions = {}): T {
  const { timeoutMs = 5000, deadGraceMs = 2000, hardStaleMs = 120_000, pollMs = 25 } = opts;
  const dir = setDir(project, id);
  const lock = join(dir, '.lock');
  const token = randomUUID();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let made = false;
    try { mkdirSync(lock); made = true; }
    catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') throw new ProseError('E_NOT_FOUND', `No set ${id} in ${project}`, { hint: 'prose set list shows the sets' });
      if (err.code !== 'EEXIST' && err.code !== 'EPERM') throw e; // EPERM: Windows, a lock that is being deleted
    }
    if (made) {
      try {
        writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, token, at: new Date().toISOString() } satisfies Owner));
        break;
      } catch (e) {
        // ENOENT: a taker that had judged an older lock moved our fresh one aside; it puts it back or fails. The
        // path is no longer certainly ours, so it is never deleted here: wait and try again. (Any other failure
        // leaves an owner-less lock, which the next command recovers after deadGraceMs.)
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
    const j = judge(lock, deadGraceMs, hardStaleMs);
    if (j?.stale && takeOver(lock, j, deadGraceMs, hardStaleMs, id)) continue;
    if (Date.now() >= deadline) throw conflict(id, lock);
    sleepSync(j === null ? 1 : pollMs); // null: released between our mkdir and stat
  }
  sweep(dir, deadGraceMs, hardStaleMs);
  const ours = () => ownerOf(lock)?.token === token;
  const ctx: LockContext = {
    heartbeat() {
      if (!ours()) throw new ProseError('E_CONFLICT', `Lost the lock on set ${id} (another command took it over); nothing more was written`, { hint: 'Run the command again' });
      const now = new Date();
      try { utimesSync(lock, now, now); }
      catch { throw new ProseError('E_CONFLICT', `Lost the lock on set ${id}; nothing more was written`, { hint: 'Run the command again' }); }
    },
  };
  try { return fn(ctx); }
  finally {
    try { if (ours()) rmSync(lock, RM); } catch { /* never fail on release */ }
  }
}
