// `prose serve` and `prose reading ...`: the agent's side of the LAN reading page. The server is a detached process the
// CLI starts and finds again through ~/.agent-prose/server.json; a session is a folder in the project. Pattern source:
// agent-beeps' audition commands, adapted for text (no modes, albums or patches: the agent writes the rewrites).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { ProseError } from '../errors.ts';
import type { Io } from '../io.ts';
import { needProject } from '../project.ts';
import { checkSet } from '../owner/check.ts';
import { withDirLockAsync } from '../owner/fsutil.ts';
import { newId, proseHome, sessionDir, sessionsDir } from '../owner/paths.ts';
import { textHash, variantHash } from '../owner/prediction.ts';
import { isStale, originalLines } from '../owner/original.ts';
import { readSet, variantPath } from '../owner/sets.ts';
import {
  ReadingServer, SERVER_API, displayPlan, frozenHash, labelOf, probe, rankAddresses, isStopped, readServerInfo, recordStopped, registerProject, roundMaps,
  queueUrl, serverAction, serverLogFile, sessionUrl, stoppedInfo, writeServerInfo, type ServerInfo,
} from '../reading/server.ts';
import { MAX_QUEUE_ITEMS, queueExists } from '../reading/queue.ts';
import { batchError, parseSetList, pendingSets, planBatch, planOpen, type OpenPlan } from '../reading/open.ts';
import { closeQueue, createQueue, listQueues, queueStatus, waitForQueue } from './reading-queue.ts';
import {
  appendEvent, foldSession, openSession, readEvents, readReveal, readSession, variantOf,
  type Session, type SessionState, type StoredEvent,
} from '../reading/session.ts';
import { layoutOf } from '../reading/units.ts';
import { reasonWords } from '../owner/feedback.ts';

/** The entry the detached server runs: the same script this process was started from, next to the code. */
const PROSE_CLI = join(import.meta.dirname, '..', '..', 'scripts', 'prose.mjs');
const START_MS = 15_000;
const WAIT_STEP_MS = 200;
const ACTIONABLE = new Set(['refine', 'ship', 'none', 'abandon']);

/** Said on every serve and every open: what the link exposes. */
export const LOCAL_NOTICE = 'This server listens on this machine only (127.0.0.1): nothing else on the network can reach the link. Whoever opens the link can also delete lines from those drafts (strike them, then apply; the page asks you to confirm the exact text, and an undo puts them back), and can record picks for the sets it names (a pick cannot be changed afterwards).';
export const NOTICE = 'Anyone on this network who has the link can read the drafts in the projects registered with this server, and delete lines from them (strike them, then apply; the page asks to confirm the exact text, and an undo puts them back), and can record picks for the sets it names (a pick cannot be changed afterwards). Use --local to keep it on this machine.';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | undefined>, ms: number, step: number): Promise<T | undefined> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() >= end) return undefined;
    await sleep(step);
  }
}

// ---- the server ----

const isLocal = (info: Pick<ServerInfo, 'host'>) => info.host === '127.0.0.1';
/** The notice that matches the real bind: a local server is not readable from the network, so it must not say so. */
const noticeOf = (info: Pick<ServerInfo, 'host'>) => (isLocal(info) ? LOCAL_NOTICE : NOTICE);
/** A link to the server's own page: the token only ever appears as `?t=` inside one of these. */
const linkTo = (base: string, token: string, path = '/') => `${base}${path}?t=${token}`;

/** Every address a link can use, best first: the machine name, then the ranked LAN addresses. Local-only: loopback alone. */
function addressesOf(info: ServerInfo): Array<{ base: string; via: string }> {
  if (isLocal(info)) return [{ base: `http://127.0.0.1:${info.port}`, via: 'local' }];
  return [{ base: info.url, via: 'hostname' }, ...rankAddresses().map(a => ({ base: `http://${a.address}:${info.port}`, via: a.label }))];
}

/** What `prose serve` prints. The token is in the links and nowhere else. `firewall` only when this call started a LAN server. */
export function serveReport(info: ServerInfo, opts: { started?: boolean; running?: boolean } = {}) {
  const urls = addressesOf(info).map(a => ({ url: linkTo(a.base, info.token), via: a.via }));
  return {
    running: opts.running ?? true,
    url: urls[0].url, urls, pid: info.pid, port: info.port, host: info.host, api: info.api, log: serverLogFile(),
    ...(opts.started !== undefined ? { started: opts.started } : {}),
    ...(opts.started && !isLocal(info) ? {
      firewall: `Listening on port ${info.port} for the whole network. Windows Firewall may block the first connection from a phone: allow node.exe on private networks when Windows asks, or add an inbound rule for TCP port ${info.port}. "prose serve --local" keeps the server on this machine.`,
    } : {}),
    notice: noticeOf(info),
  };
}

/** Stop the recorded server by pid, but only after /api/health says that pid is our server (a stale pid may be anything by now). */
async function killServer(info: ServerInfo): Promise<boolean> {
  if (!(await probe(info))) return false;
  try { process.kill(info.pid); } catch { /* already gone */ }
  const gone = await waitFor(async () => ((await probe(info)) ? undefined : true), 5000, 100);
  if (!gone) throw new ProseError('E_SERVER', `The reading server (pid ${info.pid}) did not stop`, { hint: `End process ${info.pid} yourself, then run prose serve again` });
  return true;
}

/** `local: true` for 127.0.0.1 only, `false` for the network (a running server of the other bind is replaced), absent to keep whatever runs. */
export interface EnsureOptions { local?: boolean; port?: number }

/**
 * A healthy server, started detached when none runs. A running server of this API level is reused as it is, unless the
 * caller asked for something it is not (--local on a server bound to the network, no --local on a local one, or another
 * explicit port); one of another API level is replaced, keeping its token and registered projects so bookmarked links survive.
 */
export async function ensureServer(opts: EnsureOptions = {}, spawnImpl: typeof spawn = spawn): Promise<{ info: ServerInfo; started: boolean }> {
  // Serialised across processes: two callers at once would each find no server and each start one (the second
  // overwrites server.json and the first is orphaned). The waiter re-reads and re-probes once it holds the lock, so it
  // reuses what the first started. The lock lives in the prose home (a `.lock` directory), with the same owner,
  // heartbeat and takeover rules as every other lock; a generous wait covers a start that takes its full START_MS.
  mkdirSync(proseHome(), { recursive: true, mode: 0o700 });
  return withDirLockAsync(proseHome(), { noun: 'server', id: 'start', project: proseHome() }, () => ensureServerLocked(opts, spawnImpl), { timeoutMs: START_LOCK_MS });
}

const START_LOCK_MS = 20_000;

async function ensureServerLocked(opts: EnsureOptions, spawnImpl: typeof spawn): Promise<{ info: ServerInfo; started: boolean }> {
  const existing = readServerInfo();
  const action = serverAction(existing, SERVER_API, await probe(existing), { local: opts.local, port: opts.port });
  if (action === 'reuse') return { info: existing!, started: false };
  let local = opts.local;
  if (action === 'replace') {
    local ??= isLocal(existing!);
    // Clearing the pid first keeps server.json (token, projects) for the replacement: the old process, as it exits,
    // only removes the file when it is its own.
    writeServerInfo(stoppedInfo(existing!));
    if (!(await killServer(existing!))) throw new ProseError('E_SERVER', 'The older reading server did not stop');
  }
  const args = [PROSE_CLI, 'serve', '--foreground', ...(local ? ['--local'] : []), ...(opts.port !== undefined ? ['--port', String(opts.port)] : [])];
  const child = spawnImpl(process.execPath, args, { detached: true, stdio: 'ignore', windowsHide: true, env: process.env });
  let exited = false;
  child.on('exit', () => { exited = true; });
  child.on('error', () => { exited = true; });
  child.unref();
  const up = await waitFor(async () => {
    if (exited) return null;
    const i = readServerInfo();
    return i && i.pid === child.pid && (await probe(i)) ? i : undefined;
  }, START_MS, 150);
  if (!up) throw new ProseError('E_SERVER', `The reading server did not start within ${START_MS / 1000} s`, { hint: 'run "prose serve --foreground" to see why' });
  return { info: up, started: true };
}

const port = (text: string): number => {
  const n = Number(text);
  if (!/^\d+$/.test(text.trim()) || n > 65535) throw new ProseError('E_USAGE', '--port must be a whole number from 0 to 65535', { hint: `Got "${text}"` });
  return n;
};

const seconds = (text: string, flag = '--timeout'): number => {
  const n = Number(text);
  if (!text.trim() || !Number.isFinite(n) || n < 0) throw new ProseError('E_USAGE', `${flag} must be a number of seconds, 0 or more`, { hint: `Got "${text}"` });
  return n;
};

// ---- sessions ----

interface Loaded { project: string; session: Session; events: StoredEvent[]; state: SessionState }

function load(project: string, id: string): Loaded {
  const session = readSession(project, id);
  const events = readEvents(project, id);
  return { project, session, events, state: foldSession(session, events) };
}

/** The display label (A, B, ...) the page gives each candidate. */
function labeler(l: Loaded): (index: number) => string {
  const { sequence } = displayPlan(l.session, l.state, l.events);
  return index => labelOf(sequence.indexOf(index));
}

/** Where a candidate's text lives and, when it still matches the hash frozen for it, the text. */
function locate(l: Loaded, index: number): { file: string | null; text: string | null; format: string } {
  const c = l.state.candidates.find(x => x.index === index);
  const maps = roundMaps(l.session, l.events);
  try {
    if (!c) throw new Error('unknown');
    const set = readSet(l.project, maps.roundSet.get(c.round) ?? l.session.setId);
    const v = set.variants.find(x => x.index === variantOf(c));
    if (!v) throw new Error('unknown');
    const file = variantPath(l.project, set, v);
    const text = readFileSync(file, 'utf8');
    const frozen = frozenHash(l.project, l.session, maps, c);
    return { file, text: frozen !== undefined && textHash(text) === frozen ? text : null, format: set.format };
  } catch { return { file: null, text: null, format: 'markdown' }; }
}

function briefCandidates(l: Loaded) {
  const label = labeler(l);
  return l.state.candidates.map(c => ({ index: c.index, label: label(c.index), name: c.name, direction: c.direction, round: c.round, ...(c.variant !== undefined ? { variant: c.variant } : {}) }));
}

/** The request or verdict a `wait` hands the agent. */
function describe(l: Loaded, event: StoredEvent) {
  const id = l.session.id;
  const label = labeler(l);
  if (event.type === 'ship') {
    return { event: 'ship', champion: event.champion, championLabel: label(event.champion), next: `read the reveal with prose reading status --id ${id}; it shows whether your sealed prediction matched. Then tell the owner what they chose` };
  }
  if (event.type === 'abandon') return { event: 'abandon', next: 'the owner abandoned this session' };
  if (event.type === 'none') {
    const maps = roundMaps(l.session, l.events);
    const setId = maps.roundSet.get(l.state.round) ?? l.session.setId;
    return {
      event: 'none', outcome: 'none', set: setId, closest: event.closest === null ? null : (l.state.candidates.find(c => c.index === event.closest) ? variantOf(l.state.candidates.find(c => c.index === event.closest)!) : event.closest),
      closestLabel: event.closest === null ? null : label(event.closest), reasons: event.reasons, reasonWords: reasonWords(event.reasons), note: event.note ?? null,
      reveal: readReveal(l.project, id),
      next: `the owner rejected every draft; the reveal of your sealed guess is unscored. Read the reasons and note, tell the owner what you will change, then make a new set: prose set new --redo ${setId}; then prose reading open --set <new-set>`,
    };
  }
  if (event.type !== 'refine') throw new ProseError('E_INTERNAL', `Cannot describe a ${event.type} event`);
  const notes = l.state.notes.filter(n => n.round === l.state.round).map(n => {
    const { text, format } = locate(l, n.index);
    return { candidate: n.index, label: label(n.index), unit: n.unit, unitText: text === null ? null : (layoutOf(text, format as never, l.session.form).units[n.unit] ?? null), note: n.text };
  });
  const champion = locate(l, event.champion).file;
  const like = event.like === null ? null : locate(l, event.like).file;
  // The line the owner is revising (context for the next round; never a candidate). Null for a new line or an unreadable set.
  let original: { source: string; lines: ReturnType<typeof originalLines>; stale: boolean } | null = null;
  try {
    const o = readSet(l.project, l.session.setId).original;
    if (o) original = { source: o.source, lines: originalLines(o), stale: isStale(l.project, o) };
  } catch { /* the session still reads without it */ }
  const directions = event.directions.length ? ` toward ${event.directions.join(', ')}` : '';
  return {
    event: 'refine', champion: event.champion, championLabel: label(event.champion), championFile: champion,
    directions: event.directions, like: event.like, ...(like ? { likeFile: like } : {}), notes, original,
    next: `write a new set from the champion${directions}${notes.length ? ' using the notes' : ''}: prose set new ${champion ?? '<champion draft>'}${event.directions.length ? ` --directions ${event.directions.join(',')}` : ''}; then prose reading round --id ${id} --set <new-set>`,
  };
}

const lastRoundSeq = (events: StoredEvent[]) => events.reduce((m, e) => (e.type === 'round' ? Math.max(m, e.seq) : m), 0);

const projectOf = (opts: { dir?: string }) => needProject(opts.dir ?? process.cwd());

export function registerReadingCommands(program: Command, io: Io): void {
  program.command('serve')
    .description('Start (or reuse) the LAN reading server and print its link; the link carries the access token')
    .option('--local', 'bind 127.0.0.1 only: nothing else on the network can reach it')
    .option('--port <n>', 'port (default: 47311, or the next free one); 0 picks any free port')
    .option('--foreground', 'run the server in this process until it is interrupted')
    .option('--stop', 'stop the running server')
    .option('--status', 'show the recorded server and whether it answers')
    .action(async (opts: { local?: boolean; port?: string; foreground?: boolean; stop?: boolean; status?: boolean }) => {
      const wantPort = opts.port !== undefined ? port(opts.port) : undefined;
      if (opts.stop) {
        const info = readServerInfo();
        const stopped = info && !isStopped(info) ? await killServer(info) : false;
        // The record stays, with the process fields cleared: the next start reuses its token and projects.
        const stale = !!info && !isStopped(info) && !stopped;
        recordStopped();
        io.emit({
          running: false, stopped, pid: stopped ? info!.pid : null,
          ...(stale ? { note: 'The recorded server was not running; cleared it and kept the token and projects' } : {}),
        });
        return;
      }
      if (opts.status) {
        const info = readServerInfo();
        if (!info || isStopped(info)) { io.emit({ running: false, recorded: null, notice: NOTICE }); return; }
        const running = await probe(info);
        io.emit(running ? serveReport(info) : { running: false, recorded: { pid: info.pid, port: info.port, host: info.host, api: info.api }, notice: NOTICE });
        return;
      }
      if (opts.foreground) {
        const existing = readServerInfo();
        if (existing && existing.pid !== process.pid && await probe(existing)) {
          throw new ProseError('E_SERVER', `A reading server is already running (pid ${existing.pid}, port ${existing.port})`, { hint: 'prose serve --stop first, or just run prose serve' });
        }
        const server = new ReadingServer({ host: opts.local ? '127.0.0.1' : '0.0.0.0', logFile: serverLogFile(), ...(wantPort !== undefined ? { port: wantPort } : {}) });
        const info = await server.listen();
        io.emit(serveReport(info, { started: true }));
        const stop = () => {
          server.close().finally(() => {
            try { if (readServerInfo()?.pid === process.pid) recordStopped(); } finally { process.exit(0); }
          });
        };
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
        await new Promise(() => {}); // serve until stopped
        return;
      }
      const { info, started } = await ensureServer({ local: opts.local === true, ...(wantPort !== undefined ? { port: wantPort } : {}) });
      io.emit(serveReport(info, { started }));
    });

  const reading = program.command('reading').description('The reading page: open a session for the owner, wait for their request, answer with a new round');

  reading.command('open')
    .description("Open a set (--set), several (--sets a,b,c) or every set waiting for a pick (--pending) on the reading page: freezes what the owner will be shown, registers the project, prints the link")
    .option('--set <id>', 'set id: one session, as ever')
    .option('--sets <ids>', `comma-separated set ids (at most ${MAX_QUEUE_ITEMS}): one batch, one page, a queue over ordinary sessions; the owner chooses a variant per set and sends the picks together`)
    .option('--pending', 'a batch of every set with a sealed prediction and no pick (oldest first, not already open on the page)')
    .option('--limit <n>', `with --pending: at most this many sets (1-${MAX_QUEUE_ITEMS}, default ${MAX_QUEUE_ITEMS})`)
    .option('--local', 'bind 127.0.0.1 only: nothing else on the network can reach it (without it a running server is reused as it is)')
    .option('--no-predict', 'open without a sealed prediction (recorded in the session)')
    .option('--prompt <text>', 'what the owner is reading for, shown on the page')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action(async (opts: { set?: string; sets?: string; pending?: boolean; limit?: string; predict: boolean; local?: boolean; prompt?: string; dir?: string }) => {
      const modes = [opts.set !== undefined, opts.sets !== undefined, opts.pending === true].filter(Boolean).length;
      if (modes !== 1) throw new ProseError('E_USAGE', 'Say which sets to open: exactly one of --set <id>, --sets a,b,c or --pending', { hint: 'prose reading open --set <id>' });
      if (opts.limit !== undefined && !opts.pending) throw new ProseError('E_USAGE', '--limit goes with --pending', { hint: 'prose reading open --pending --limit 20' });
      if (opts.pending && !opts.predict) throw new ProseError('E_USAGE', '--pending opens sets that have a sealed prediction; --no-predict is for --sets', { hint: 'Seal predictions first, or name the sets: prose reading open --sets a,b --no-predict' });
      const project = projectOf(opts);

      if (opts.set !== undefined) {
        const plan = planOpen(project, readSet(project, opts.set), opts.predict);
        const { info } = await ensureServer(opts.local ? { local: true } : {});
        registerProject(project);
        const session = openSession(project, {
          id: newId(plan.set.id.slice(0, 40).replace(/-+$/, '')),
          setId: plan.set.id, form: plan.set.form, register: plan.register, prompt: opts.prompt ?? '',
          shown: plan.shown, hashes: plan.hashes, target: plan.target, wpm: plan.wpm, predicted: plan.prediction !== null,
          candidates: plan.shown.map(i => ({ index: i, name: `v${i}`, direction: plan.set.variants.find(v => v.index === i)?.direction ?? null, round: 0 })),
        });
        io.emit({
          id: session.id, url: sessionUrl(info, session.id),
          ipUrls: isLocal(info) ? [] : rankAddresses().map(a => ({ url: sessionUrl({ url: `http://${a.address}:${info.port}`, token: info.token }, session.id), via: a.label })),
          wait: `prose reading wait --id ${session.id}`, predicted: session.predicted, notice: noticeOf(info),
        });
        return;
      }

      // A batch: every set is checked first and nothing is created unless all pass (--sets), or the ready ones are taken (--pending).
      let plans: OpenPlan[];
      let skipped: Array<{ set: string; reason: string }> = [];
      let remaining = 0;
      if (opts.sets !== undefined) {
        const ids = parseSetList(opts.sets);
        const r = planBatch(project, ids, opts.predict);
        if (r.failures.length) throw batchError(r.failures, ids.length);
        plans = r.plans;
      } else {
        const limit = opts.limit === undefined ? MAX_QUEUE_ITEMS : Number(opts.limit);
        if (opts.limit !== undefined && (!/^\d+$/.test(opts.limit.trim()) || limit < 1 || limit > MAX_QUEUE_ITEMS)) {
          throw new ProseError('E_USAGE', `--limit must be a whole number from 1 to ${MAX_QUEUE_ITEMS}`, { hint: `Got "${opts.limit}"` });
        }
        const r = pendingSets(project, limit);
        if (r.plans.length === 0) {
          throw new ProseError('E_USAGE', 'Nothing is waiting for a pick', {
            hint: 'A set waits once it has a sealed prediction and no pick: prose predict --set <id> --pick <n> --why "..."',
            ...(r.skipped.length ? { details: { skipped: r.skipped } } : {}),
          });
        }
        plans = r.plans; skipped = r.skipped; remaining = r.remaining;
      }
      const { info } = await ensureServer(opts.local ? { local: true } : {});
      registerProject(project);
      const queue = createQueue(project, plans, opts.prompt ?? '');
      io.emit({
        id: queue.id, kind: 'queue', url: queueUrl(info, queue.id),
        ipUrls: isLocal(info) ? [] : rankAddresses().map(a => ({ url: queueUrl({ url: `http://${a.address}:${info.port}`, token: info.token }, queue.id), via: a.label })),
        items: queue.items.map(i => ({ n: i.n, set: i.setId, session: i.sessionId, who: i.who, where: i.where, predicted: i.predicted })),
        skipped, remaining,
        wait: `prose reading wait --id ${queue.id} --since 0`, predicted: queue.items.every(i => i.predicted), notice: noticeOf(info),
      });
    });

  reading.command('wait')
    .description('Block until the owner asks to refine, ships or abandons (a session), or until their picks arrive (a batch: --id <queue id>, then --since <cursor> from the last answer); prints the request or the picks and what to do next')
    .requiredOption('--id <id>', 'session id, or queue id for a batch')
    .option('--since <n>', 'a batch: picks already delivered (the cursor the last wait printed; default 0)')
    .option('--settle <seconds>', "a batch: wait this long after the last pick so one Send's picks come back together", '1.5')
    .option('--timeout <seconds>', 'give up after this long (exit 0 with timeout: true)', '600')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action(async (opts: { id: string; since?: string; settle: string; timeout: string; dir?: string }) => {
      const project = projectOf(opts);
      const limit = seconds(opts.timeout) * 1000;
      if (queueExists(project, opts.id)) {
        const since = opts.since === undefined ? 0 : Number(opts.since);
        if (opts.since !== undefined && (!/^\d+$/.test(opts.since.trim()) || !Number.isSafeInteger(since))) throw new ProseError('E_USAGE', '--since must be a whole number (the cursor of the last wait)', { hint: `Got "${opts.since}"` });
        const settleMs = seconds(opts.settle, '--settle') * 1000;
        io.emit(await waitForQueue(project, opts.id, { since, timeoutMs: limit, settleMs }));
        return;
      }
      if (opts.since !== undefined) throw new ProseError('E_USAGE', '--since goes with a queue id (a batch); a session has no cursor', { hint: 'prose reading wait --id <session id>' });
      try { readSession(project, opts.id); }
      catch (e) {
        if (e instanceof ProseError && e.code === 'E_NOT_FOUND') throw new ProseError('E_NOT_FOUND', `No session or queue ${opts.id} in ${project}`, { hint: 'prose reading list shows the sessions and queues' });
        throw e;
      }
      const file = join(sessionDir(project, opts.id), 'events.jsonl');
      const end = Date.now() + limit;
      let seen = '';
      for (;;) {
        // a cheap look at the log (size and mtime) decides whether it is worth parsing again
        const stamp = existsSync(file) ? `${statSync(file).size}:${statSync(file).mtimeMs}` : '';
        if (stamp !== seen) {
          seen = stamp;
          const l = load(project, opts.id);
          // any request, ship or abandon since the last round (a pending refine stays pending until a round answers it)
          const after = lastRoundSeq(l.events);
          const hit = l.events.filter(e => e.seq > after && ACTIONABLE.has(e.type)).at(-1);
          if (hit) { io.emit(describe(l, hit)); return; }
        }
        if (Date.now() >= end) break;
        await sleep(Math.min(WAIT_STEP_MS, Math.max(0, end - Date.now())));
      }
      io.emit({ timeout: true, next: `no request yet; run prose reading wait --id ${opts.id} again` });
    });

  reading.command('round')
    .description("Answer a refine request with a new set: its surviving variants join the session against the pinned champion")
    .requiredOption('--id <id>', 'session id')
    .requiredOption('--set <id>', 'the new set, made from the champion')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { id: string; set: string; dir?: string }) => {
      const project = projectOf(opts);
      const l = load(project, opts.id);
      if (l.session.queue !== undefined) {
        throw new ProseError('E_USAGE', `Session ${opts.id} is an item of batch ${l.session.queue}, and a batch item has no rounds`, { hint: `Open the set as its own session: prose reading open --set ${l.session.setId}` });
      }
      if (l.state.stage !== 'waiting') {
        throw new ProseError('E_CONFLICT', `Session ${opts.id} is in the ${l.state.stage} stage, not waiting for a round`, {
          hint: l.state.stage === 'shipped' || l.state.stage === 'sentBack' || l.state.stage === 'abandoned' ? 'Open a new session with prose reading open' : `A round answers a refine request: prose reading wait --id ${opts.id}`,
        });
      }
      const set = readSet(project, opts.set);
      if (set.sentBack !== undefined) throw new ProseError('E_CONFLICT', `Set ${set.id} was sent back, so it is closed and cannot be a round`, { hint: `Make a new set: prose set new --redo ${set.id}` });
      const used = new Set([l.session.setId, ...roundMaps(l.session, l.events).roundSet.values()]);
      if (used.has(set.id)) throw new ProseError('E_USAGE', `Set ${set.id} is already part of this session`, { hint: 'Make a new set from the champion: prose set new <champion draft> --directions ...' });
      if (set.form !== l.session.form) throw new ProseError('E_USAGE', `Set ${set.id} is a ${set.form} set; this session is ${l.session.form}`, { hint: 'Make the new set from the champion\'s draft' });
      const check = checkSet(project, set);
      if (!check.ok) throw new ProseError('E_USAGE', `Set ${set.id} has fewer than two surviving variants, so there is no round to offer`, { hint: check.next });
      // Session indexes are unique across rounds; the variant number inside the new set is kept beside each.
      const top = Math.max(...l.state.candidates.map(c => c.index));
      const n = l.state.round + 1;
      const candidates = check.keep.map(i => ({
        index: top + i, variant: i, name: `r${n}v${i}`, direction: set.variants.find(v => v.index === i)?.direction ?? null,
        round: n, hash: variantHash(project, set, i),
      }));
      appendEvent(project, opts.id, { type: 'round', n, setId: set.id, candidates });
      const after = load(project, opts.id);
      const label = labeler(after);
      io.emit({
        id: opts.id, round: n, set: set.id,
        candidates: candidates.map(c => ({ index: c.index, label: label(c.index), variant: c.variant, name: c.name, direction: c.direction, hash: c.hash })),
        next: `the page picks it up; run prose reading wait --id ${opts.id} again`,
      });
    });

  reading.command('status')
    .description('A session: stage, round, candidates, duels, notes, the champion and, once shipped, the reveal of your sealed prediction; for a batch (--id <queue id>): each set and, for sent ones only, the pick and its reveal')
    .requiredOption('--id <id>', 'session id, or queue id for a batch')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { id: string; dir?: string }) => {
      const project = projectOf(opts);
      if (queueExists(project, opts.id)) { io.emit(queueStatus(project, opts.id)); return; }
      const l = load(project, opts.id);
      const { state, session } = l;
      io.emit({
        id: session.id, setId: session.setId, ...(session.queue !== undefined ? { queue: session.queue } : {}), stage: state.stage, round: state.round, predicted: session.predicted ?? true,
        champion: state.champion, candidates: briefCandidates(l), duels: state.duels, notes: state.notes.length,
        pendingRefine: state.pendingRefine, shipped: state.shipped,
        reveal: state.shipped !== null || state.sentBack !== null ? readReveal(l.project, session.id) : null,
        ...(state.sentBack !== null ? { sentBack: { ...state.sentBack, reasonWords: reasonWords(state.sentBack.reasons) } } : {}),
      });
    });

  reading.command('list')
    .description('The reading sessions of a project, newest first, and its batch queues (a queue\'s items are listed under it, not as sessions)')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { dir?: string }) => {
      const project = projectOf(opts);
      const sessions: Array<{ id: string; setId: string; stage: string; round: number; createdAt: string }> = [];
      const problems: Array<{ id: string; error: string }> = [];
      if (existsSync(sessionsDir(project))) {
        for (const id of readdirSync(sessionsDir(project))) {
          try {
            const l = load(project, id);
            if (l.session.queue !== undefined) continue;
            sessions.push({ id, setId: l.session.setId, stage: l.state.stage, round: l.state.round, createdAt: l.session.createdAt });
          } catch (e) { problems.push({ id, error: e instanceof ProseError ? e.message : String(e) }); }
        }
      }
      sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const batches = listQueues(project);
      io.emit({ project, sessions, queues: batches.queues, ...(problems.length || batches.problems.length ? { problems: [...problems, ...batches.problems] } : {}) });
    });

  reading.command('close')
    .description('Abandon a session that is still open (does nothing to one already shipped or abandoned); for a batch (--id <queue id>) abandon every item not yet sent and close the queue: picks already sent stay')
    .requiredOption('--id <id>', 'session id, or queue id for a batch')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { id: string; dir?: string }) => {
      const project = projectOf(opts);
      if (queueExists(project, opts.id)) { io.emit(closeQueue(project, opts.id)); return; }
      const l = load(project, opts.id);
      if (l.state.stage === 'shipped' || l.state.stage === 'sentBack' || l.state.stage === 'abandoned') { io.emit({ id: opts.id, closed: false, stage: l.state.stage }); return; }
      appendEvent(l.project, opts.id, { type: 'abandon' });
      io.emit({ id: opts.id, closed: true, stage: 'abandoned' });
    });
}
