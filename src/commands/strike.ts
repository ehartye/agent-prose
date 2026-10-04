import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { ProseError } from '../errors.ts';
import { parseDocument } from '../document.ts';
import type { Format } from '../kinds.ts';
import { needProject } from '../project.ts';
import { EVENT_ID_RE } from '../owner/paths.ts';
import { currentDraftHash, draftHash } from '../owner/original.ts';
import { strikeLines, type StrikeLine } from '../strike/lines.ts';
import { simulateRemoval } from '../strike/plan.ts';
import { parseRefs, refOf } from '../strike/spans.ts';
import {
  MAX_NOTE, MAX_PENDING, NoteText, STRIKE_REASONS, foldStrikes, listStrikeDirs, readStrikeLog, resolveDraft, storedByEventId, withStrikes,
  type DraftRef, type PendingStrike, type StrikeReason,
} from '../strike/store.ts';

/** The draft as read now: its text, hash, format and form. Parse errors are the parser's own (E_PARSE, E_SCHEMA). */
function readDraft(draft: DraftRef): { text: string; hash: string; format: Format; form: string } {
  const text = readFileSync(draft.file, 'utf8');
  const doc = parseDocument(draft.file, text);
  return { text, hash: draftHash(text), format: doc.format, form: doc.form };
}

const refsHint = (lines: StrikeLine[], cap = 20): string => {
  const refs = lines.map(l => l.ref);
  return `Units: ${refs.slice(0, cap).join(', ')}${refs.length > cap ? ', ...' : ''}`;
};

/** The nearest strikable refs to a line (by distance in lines), for the hint when a line cannot be struck. */
const nearestStrikable = (lines: StrikeLine[], to: StrikeLine, count = 3): string => {
  const near = lines.filter(l => l.strikable).sort((a, b) => Math.abs(a.start - to.start) - Math.abs(b.start - to.start)).slice(0, count);
  return near.length ? `Nearest strikable lines: ${near.map(l => l.ref).join(', ')}` : 'Nothing in this draft can be struck';
};

const eventIdOf = (v: string | undefined): string | undefined => {
  if (v !== undefined && !EVENT_ID_RE.test(v)) throw new ProseError('E_USAGE', '--event-id must be 1-100 letters, digits, dot, underscore, colon or hyphen', { hint: 'Omit it for a strike that is not a retry' });
  return v;
};

const reasonOf = (v: string): StrikeReason => {
  if (!(STRIKE_REASONS as readonly string[]).includes(v)) throw new ProseError('E_USAGE', `--reason "${v.slice(0, 40)}" is not a reason`, { hint: `Allowed: ${STRIKE_REASONS.join(', ')}` });
  return v as StrikeReason;
};

const noteOf = (v: string | undefined): string | undefined => {
  if (v === undefined) return undefined;
  const parsed = NoteText.safeParse(v);
  if (!parsed.success) throw new ProseError('E_USAGE', `--note is not usable: ${parsed.error.issues[0].message}`, { hint: `A note is 1-${MAX_NOTE} characters of plain text without control characters` });
  return parsed.data;
};

const hashOf = (v: string | undefined): string | undefined => {
  if (v !== undefined && !/^[0-9a-f]{64}$/.test(v)) throw new ProseError('E_USAGE', '--draft-hash must be a 64-character lower-case hex hash', { hint: 'Use the hash prose strike list prints, or omit it' });
  return v;
};

const view = (s: PendingStrike) => ({ id: s.id, ref: s.ref, ...(s.speaker ? { speaker: s.speaker } : {}), text: s.text, reason: s.reason, ...(s.note ? { note: s.note } : {}), stale: s.stale, at: s.at });

const projectOf = (draft: string | undefined, dir: string | undefined): string => needProject(dir ?? (draft ? dirname(resolve(draft)) : process.cwd()));

export function registerStrikeCommands(program: Command, io: Io): void {
  const strike = program.command('strike').description('Strike lines you want gone: a record with a reason, bound to the draft as it is now (the draft itself is not edited)');

  strike.command('add', { isDefault: true })
    .description('Record one strike: a line of the draft and why it should not exist. `prose strike <draft> --line ...` is the same command')
    .argument('<draft>', '.fountain, .md or .dialog.yaml draft inside a prose project')
    .requiredOption('--line <ref>', 'the source line, or inclusive range, of the line to strike (any line inside a span names the span): 12 or 12-13')
    .requiredOption('--reason <tag>', STRIKE_REASONS.join(' | '))
    .option('--note <text>', `why, in a few words (at most ${MAX_NOTE} characters)`)
    .option('--draft-hash <sha>', 'the draft hash you looked at; a changed draft is E_CONFLICT (the reading page always sends it)')
    .option('--event-id <id>', 'names this strike: a retry with the same id is skipped (default: none)')
    .option('--dir <dir>', 'where to start looking for the project (default: the draft\'s folder)')
    .action((draftArg: string, opts: { line: string; reason: string; note?: string; draftHash?: string; eventId?: string; dir?: string }) => {
      const reason = reasonOf(opts.reason);
      const note = noteOf(opts.note);
      const wantHash = hashOf(opts.draftHash);
      const eventId = eventIdOf(opts.eventId);
      const refs = parseRefs(opts.line);
      if (refs.length !== 1) throw new ProseError('E_USAGE', '--line takes one line or range', { hint: 'Strike one line at a time: --line 12 or --line 12-13' });
      const project = projectOf(draftArg, opts.dir);
      const draft = resolveDraft(project, draftArg);
      const out = withStrikes(project, draft, w => {
        const { text, hash, format, form } = readDraft(draft);
        if (wantHash !== undefined && wantHash !== hash) {
          throw new ProseError('E_CONFLICT', 'The draft changed since you looked at it, so nothing was struck', { hint: 'Reload the draft and strike again' });
        }
        const again = storedByEventId(w.events, 'strike', eventId);
        const fold = foldStrikes(w.events, hash);
        if (again?.type === 'strike') {
          const kept = fold.pending.find(p => p.id === again.id);
          return { duplicate: true, strike: kept ? view(kept) : { id: again.id, ref: again.ref, text: again.text, reason: again.reason }, pending: fold.pending.length };
        }
        const r = refs[0];
        const lines = strikeLines(text, format, form);
        const hits = lines.filter(l => (l.start <= r.end && l.end >= r.start) || (l.removal[0] <= r.end && l.removal[1] >= r.start));
        if (hits.length === 0) throw new ProseError('E_USAGE', `${refOf(r.start, r.end)} is not a line of the draft that holds text`, { hint: lines.length ? refsHint(lines) : 'The draft has no lines to strike' });
        if (hits.length > 1) throw new ProseError('E_USAGE', `${refOf(r.start, r.end)} covers ${hits.length} lines; strike one at a time`, { hint: refsHint(hits) });
        const line = hits[0];
        if (!line.strikable) throw new ProseError('E_USAGE', `${line.ref} cannot be struck: ${line.why}`, { hint: nearestStrikable(lines, line) });
        const overlap = fold.pending.find(p => p.start <= line.end && p.end >= line.start);
        if (overlap) throw new ProseError('E_CONFLICT', `${line.ref} is already struck as ${overlap.id}; clear it first`, { hint: `prose strike clear <draft> ${overlap.id}` });
        if (fold.pending.length >= MAX_PENDING) throw new ProseError('E_CONFLICT', `${fold.pending.length} strikes are pending; the most one draft takes is ${MAX_PENDING}`, { hint: 'Clear some, or finish with the owner first' });
        // The removal must provably take only what was shown, now and together with every strike that still holds.
        const live = fold.pending.filter(p => !p.stale).map(p => ({ id: p.id, line: lines.find(l => l.ref === p.ref) })).filter((x): x is { id: string; line: StrikeLine } => x.line !== undefined);
        const sim = simulateRemoval(text, format, form, [...live.map(x => ({ line: x.line, strike: x.id })), { line, strike: `s${fold.nextStrike}` }]);
        if (!sim.ok) throw new ProseError('E_USAGE', `${line.ref} cannot be struck: ${sim.why}`, { hint: nearestStrikable(lines, line) });
        const stored = w.append({
          type: 'strike', id: `s${fold.nextStrike}`, ref: line.ref, start: line.start, end: line.end, text: line.text,
          ...(line.speaker ? { speaker: line.speaker } : {}), reason, ...(note ? { note } : {}), draftHash: hash, ...(eventId ? { eventId } : {}),
        });
        if (stored.type !== 'strike') throw new ProseError('E_INTERNAL', 'the strike was not stored');
        return {
          strike: { id: stored.id, ref: stored.ref, ...(stored.speaker ? { speaker: stored.speaker } : {}), text: stored.text, reason: stored.reason, ...(stored.note ? { note: stored.note } : {}) },
          pending: fold.pending.length + 1,
        };
      });
      io.emit({
        draft: draft.source, ...out,
        next: 'The draft is not edited: the line stays until the owner applies the strikes. Leave the draft as it is (any change to it makes every pending strike stale), and do not rewrite this line',
      });
    });

  strike.command('clear')
    .description('Withdraw a pending strike (the page\'s per-line Undo), or all of them with --all')
    .argument('<draft>', 'the draft the strike was made on')
    .argument('[strike-id]', 'the strike to withdraw, e.g. s3')
    .option('--all', 'withdraw every pending strike of the draft')
    .option('--event-id <id>', 'names this clear: a retry with the same id is skipped')
    .option('--dir <dir>', 'where to start looking for the project (default: the draft\'s folder)')
    .action((draftArg: string, id: string | undefined, opts: { all?: boolean; eventId?: string; dir?: string }) => {
      if (opts.all ? id !== undefined : id === undefined) throw new ProseError('E_USAGE', 'Name one strike or pass --all', { hint: 'prose strike clear <draft> s3, or prose strike clear <draft> --all' });
      if (id !== undefined && !/^s\d+$/.test(id)) throw new ProseError('E_USAGE', `"${id.slice(0, 40)}" is not a strike id`, { hint: 'Strike ids look like s3; prose strike list shows them' });
      const eventId = eventIdOf(opts.eventId);
      const project = projectOf(draftArg, opts.dir);
      const draft = resolveDraft(project, draftArg);
      const out = withStrikes(project, draft, w => {
        const hash = currentDraftHash(project, draft.source);
        const before = foldStrikes(w.events, hash);
        if (id !== undefined && storedByEventId(w.events, 'clear', eventId)) return { duplicate: true, cleared: [id], pending: before.pending.length };
        const targets = id === undefined ? before.pending.map(p => p.id) : [id];
        if (id !== undefined && !before.pending.some(p => p.id === id)) {
          throw new ProseError('E_NOT_FOUND', `${id} is not a pending strike of ${draft.source}`, { hint: 'prose strike list <draft> shows the pending strikes' });
        }
        for (const t of targets) w.append({ type: 'clear', strike: t, ...(id !== undefined && eventId ? { eventId } : {}) });
        return { cleared: targets, pending: before.pending.length - targets.length };
      });
      io.emit({ draft: draft.source, ...out });
    });

  strike.command('list')
    .description('Pending (and applied) strikes with their reasons; --all spans every draft of the project')
    .argument('[draft]', 'the draft to list (omit with --all)')
    .option('--all', 'every draft of the project')
    .option('--reason <tag>', `only strikes made for this reason: ${STRIKE_REASONS.join(' | ')}`)
    .option('--state <state>', 'pending (default), applied or all')
    .option('--dir <dir>', 'where to start looking for the project (default: the draft\'s folder, or the current directory)')
    .action((draftArg: string | undefined, opts: { all?: boolean; reason?: string; state?: string; dir?: string }) => {
      if (!draftArg && !opts.all) throw new ProseError('E_USAGE', 'Name a draft or pass --all', { hint: 'prose strike list <draft>, or prose strike list --all' });
      if (draftArg && opts.all) throw new ProseError('E_USAGE', 'Name a draft or pass --all, not both');
      const reason = opts.reason === undefined ? undefined : reasonOf(opts.reason);
      const state = opts.state ?? 'pending';
      if (state !== 'pending' && state !== 'applied' && state !== 'all') throw new ProseError('E_USAGE', `--state "${state.slice(0, 20)}" is not a state`, { hint: 'Allowed: pending, applied, all' });
      const project = projectOf(draftArg, opts.dir);
      const drafts = draftArg
        ? [(() => { const d = resolveDraft(project, draftArg); return { source: d.source, dir: listStrikeDirs(project).find(x => x.key === d.key)?.dir ?? null, key: d.key }; })()]
        : listStrikeDirs(project).map(d => ({ source: d.source, dir: d.dir, key: d.key }));
      const rows: Array<Record<string, unknown>> = [];
      const problems: string[] = [];
      for (const d of drafts) {
        if (!d.dir) continue;
        const { events, skipped } = readStrikeLog(d.dir);
        if (skipped) problems.push(`${d.source}: ${skipped} unreadable log line${skipped === 1 ? '' : 's'} skipped`);
        const fold = foldStrikes(events, currentDraftHash(project, d.source));
        problems.push(...fold.problems.map(p => `${d.source}: ${p}`));
        const push = (s: PendingStrike, st: 'pending' | 'applied', apply?: string) => {
          if (reason && s.reason !== reason) return;
          rows.push({ draft: d.source, ...view(s), start: s.start, end: s.end, state: st, ...(apply ? { apply } : {}) });
        };
        if (state !== 'applied') fold.pending.forEach(s => push(s, 'pending'));
        if (state !== 'pending') fold.applied.filter(a => !a.undone).forEach(a => a.strikes.forEach(s => push({ ...s, stale: false }, 'applied', a.id)));
      }
      const byReason: Record<string, number> = Object.fromEntries(STRIKE_REASONS.map(r => [r, 0]));
      for (const r of rows) byReason[r.reason as string]++;
      io.emit({
        project, draft: draftArg ? drafts[0].source : null, rows,
        counts: { total: rows.length, stale: rows.filter(r => r.stale).length, byReason },
        ...(problems.length ? { problems } : {}),
      });
    });
}
