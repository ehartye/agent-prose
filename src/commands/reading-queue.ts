// The agent's side of a batch: create the queue and its child sessions, wait for picks, report, list and close.
// A queue is read from its log and its children every time (the log is the truth); nothing here keeps state.
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../errors.ts';
import { newId, queueDir, queuesDir, sessionDir, setDir } from '../owner/paths.ts';
import { variantPath } from '../owner/sets.ts';
import { MAX_QUEUE_ITEMS, appendQueueEvent, childrenMap, foldQueue, loadChildren, rankedPicks, readQueue, readQueueEvents, writeQueue, type LoadedChild, type Queue, type QueueState } from '../reading/queue.ts';
import { railLabels, type OpenPlan } from '../reading/open.ts';
import { displayPlan, labelOf } from '../reading/server.ts';
import { appendEvent, openSession, readReveal } from '../reading/session.ts';

/** Create the child sessions (one per set, `queue` set) and then `queue.json`, last. On any failure the children made so far are removed. */
export function createQueue(project: string, plans: OpenPlan[], prompt: string): Queue {
  if (plans.length === 0 || plans.length > MAX_QUEUE_ITEMS) throw new ProseError('E_USAGE', `A batch holds 1 to ${MAX_QUEUE_ITEMS} sets`);
  const id = newId('queue');
  const made: string[] = [];
  try {
    const items = plans.map((plan, k) => {
      const { set } = plan;
      const session = openSession(project, {
        id: newId(set.id.slice(0, 40).replace(/-+$/, '')),
        setId: set.id, form: set.form, register: plan.register, prompt, shown: plan.shown, hashes: plan.hashes, target: plan.target, wpm: plan.wpm,
        predicted: plan.prediction !== null, queue: id,
        candidates: plan.shown.map(i => ({ index: i, name: `v${i}`, direction: set.variants.find(v => v.index === i)?.direction ?? null, round: 0 })),
      });
      made.push(session.id);
      return { n: k + 1, setId: set.id, sessionId: session.id, form: set.form, ...railLabels(set), predicted: plan.prediction !== null };
    });
    return writeQueue(project, { id, project, createdAt: new Date().toISOString(), prompt, items });
  } catch (e) {
    for (const s of made) { try { rmSync(sessionDir(project, s), { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }); } catch { /* best effort */ } }
    try { rmSync(queueDir(project, id), { recursive: true, force: true }); } catch { /* best effort */ }
    throw e;
  }
}

export interface Snapshot { queue: Queue; state: QueueState; loaded: LoadedChild[]; tornLines: number }

/** The queue as it is on disk now: log, children and sets, folded. */
export function snapshotOf(project: string, id: string): Snapshot {
  const queue = readQueue(project, id);
  const events = readQueueEvents(project, id);
  const loaded = loadChildren(project, queue);
  return { queue, state: foldQueue(queue, events, childrenMap(loaded)), loaded, tornLines: 0 };
}

/** What the agent is told of the counts: a staged choice is not a pick (the owner may still change it), so it counts as waiting. */
export function agentCounts(state: QueueState) {
  const c = state.counts;
  return { waiting: c.waiting + c.picked, skipped: c.skipped, sent: c.sent, blocked: c.blocked, ended: c.ended };
}

const labelIn = (l: LoadedChild, index: number): string | null => {
  if (!l.session || !l.state) return null;
  const { sequence } = displayPlan(l.session, l.state, l.events);
  const at = sequence.indexOf(index);
  return at < 0 ? null : labelOf(at);
};

/** The reveal for a sent item: the session's own (a pick made on the page), or the set's (a pick made in the CLI), in one shape. Never called for an unsent item. */
function revealOf(project: string, l: LoadedChild, variant: number, via: 'page' | 'cli'): unknown {
  if (via === 'page') return readReveal(project, l.item.sessionId);
  const file = join(setDir(project, l.item.setId), 'reveal.json');
  let raw: { agent?: { hit?: boolean } | null; model?: unknown } | null = null;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { raw = null; }
  const agent = raw?.agent ?? null;
  return {
    schema: 'prose/session-reveal@1', setId: l.item.setId, picked: variant, variant, matched: agent?.hit ?? false, prediction: agent, ...(raw?.model ? { model: raw.model } : {}),
    ...(agent ? {} : { note: 'No prediction was sealed for this set, so there is nothing to reveal' }), via: 'cli',
  };
}

/** One sent item as the agent reads it. */
export function pickOf(project: string, l: LoadedChild, state: QueueState) {
  const s = state.items[l.item.n - 1];
  const variant = s.sentVariant!;
  const v = l.set?.variants.find(x => x.index === variant);
  return {
    item: l.item.n, set: l.item.setId, session: l.item.sessionId, who: l.item.who, where: l.item.where, form: l.item.form,
    variant, label: labelIn(l, variant), via: s.via, file: l.set && v ? variantPath(project, l.set, v) : null, at: s.sentAt,
    reveal: revealOf(project, l, variant, s.via!),
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface WaitOptions { since: number; timeoutMs: number; settleMs: number; stepMs?: number }

/**
 * Block until the owner's picks settle, or the queue ends, or the time is up. A pick is delivered once, by its rank in the
 * order of recording; `since` is how many were already delivered, so the call keeps no state and a lost reply is recovered
 * by asking again with the old cursor. Picks come back together once no further pick has been recorded for `settleMs` (one
 * click of Send records several, a moment apart). The queue ending (every item sent or ended, Finish, or `close`) answers at
 * once with `done`. An unpicked item's prediction is never read.
 */
export async function waitForQueue(project: string, id: string, o: WaitOptions): Promise<Record<string, unknown>> {
  const end = Date.now() + o.timeoutMs;
  const nextHint = (cursor: number) => `prose reading wait --id ${id} --since ${cursor}`;
  let snap = snapshotOf(project, id);
  let stamp = queueStamp(project, snap.queue);
  for (;;) {
    const { state, loaded } = snap;
    const ranked = rankedPicks(state);
    if (o.since > ranked.length) throw new ProseError('E_USAGE', `--since ${o.since} is past the ${ranked.length} pick${ranked.length === 1 ? '' : 's'} recorded so far`, { hint: `Pass the cursor the last wait printed (or 0): ${nextHint(ranked.length)}` });
    const fresh = ranked.slice(o.since);
    const picks = () => fresh.map(p => pickOf(project, loaded[p.n - 1], state));
    if (state.stage !== 'open') {
      const reason = state.stage === 'done' ? 'all-picked' : state.stage;
      return {
        event: 'done', reason, picks: picks(), unpicked: state.items.filter(i => i.status !== 'sent').map(i => ({ item: i.n, set: snap.queue.items[i.n - 1].setId })),
        cursor: ranked.length, counts: agentCounts(state),
        next: reason === 'all-picked' ? 'every set has a pick: tell the owner what they chose' : reason === 'finished' ? 'the owner pressed Finish; sets left unpicked are still sealed: prose reading open --pending offers them again' : 'the queue was closed',
      };
    }
    if (fresh.length) {
      const lastAt = Date.parse(ranked[ranked.length - 1].at);
      if (Date.now() - lastAt >= o.settleMs || Date.now() >= end) {
        return { event: 'picks', picks: picks(), cursor: ranked.length, counts: agentCounts(state), done: false, next: nextHint(ranked.length) };
      }
    } else if (Date.now() >= end) {
      return { timeout: true, cursor: ranked.length, counts: agentCounts(state), next: `no picks yet; run ${nextHint(ranked.length)} again` };
    }
    await sleep(Math.min(o.stepMs ?? 200, Math.max(10, end - Date.now())));
    // a look at the files' sizes and times decides whether it is worth reading and folding everything again
    const now = queueStamp(project, snap.queue);
    if (now !== stamp) { stamp = now; snap = snapshotOf(project, id); }
  }
}

/** `reading status` for a queue: stage, counts and, for sent items only, the pick and its reveal. */
export function queueStatus(project: string, id: string) {
  const { queue, state, loaded } = snapshotOf(project, id);
  const ranked = rankedPicks(state);
  return {
    id, kind: 'queue', stage: state.stage, total: queue.items.length, counts: agentCounts(state), cursor: ranked.length,
    items: state.items.map(s => {
      const l = loaded[s.n - 1];
      const sent = s.status === 'sent';
      const p = sent ? pickOf(project, l, state) : null;
      return {
        n: s.n, set: l.item.setId, session: l.item.sessionId, who: l.item.who, where: l.item.where,
        // a staged choice is not a pick: it is reported as waiting until Send
        status: s.status === 'picked' ? 'waiting' : s.status, picked: sent, variant: p ? p.variant : null, label: p ? p.label : null, reveal: p ? p.reveal : null,
      };
    }),
    order: state.order,
  };
}

/** Every queue of the project, newest first. */
export function listQueues(project: string) {
  const out: Array<{ id: string; stage: string; total: number; sent: number; createdAt: string }> = [];
  const problems: Array<{ id: string; error: string }> = [];
  if (existsSync(queuesDir(project))) {
    for (const id of readdirSync(queuesDir(project))) {
      try {
        const { queue, state } = snapshotOf(project, id);
        out.push({ id, stage: state.stage, total: queue.items.length, sent: state.counts.sent, createdAt: queue.createdAt });
      } catch (e) { problems.push({ id, error: e instanceof ProseError ? e.message : String(e) }); }
    }
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { queues: out, problems };
}

/** Abandon every child that has not shipped (idempotent: a child already shipped or abandoned is left alone). Returns how many were abandoned. */
export function abandonUnshipped(project: string, loaded: LoadedChild[]): number {
  let n = 0;
  for (const l of loaded) {
    if (!l.state || l.state.stage === 'shipped' || l.state.stage === 'abandoned') continue;
    try { appendEvent(project, l.item.sessionId, { type: 'abandon' }); n++; } catch { /* a child that cannot take it is already finished with */ }
  }
  return n;
}

/** `reading close` for a queue: record the close, then abandon the unshipped children. Picks already sent stay. */
export function closeQueue(project: string, id: string) {
  const before = snapshotOf(project, id);
  if (before.state.stage === 'finished' || before.state.stage === 'closed') return { id, kind: 'queue', closed: false, stage: before.state.stage };
  appendQueueEvent(project, id, { type: 'close' });
  const snap = snapshotOf(project, id);
  const abandoned = abandonUnshipped(project, snap.loaded);
  return { id, kind: 'queue', closed: true, stage: 'closed', sent: snap.state.counts.sent, abandoned };
}

/** The stat stamp of everything a queue's state depends on, so a waiter parses again only after a change. */
export function queueStamp(project: string, queue: Queue): string {
  const stat = (f: string) => { try { const s = statSync(f); return `${s.mtimeMs}:${s.size}`; } catch { return '-'; } };
  return [stat(join(queueDir(project, queue.id), 'events.jsonl')), ...queue.items.map(i => [stat(join(sessionDir(project, i.sessionId), 'events.jsonl')), stat(join(setDir(project, i.setId), 'set.json'))].join(','))].join('|');
}
