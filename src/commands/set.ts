import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { ProseError } from '../errors.ts';
import { needProject } from '../project.ts';
import { recordPick } from '../owner/pick.ts';
import { recordNone } from '../owner/none.ts';
import { NONE_REASONS, reasonWords } from '../owner/feedback.ts';
import { DUEL_OUTCOMES, duelKind, recordDuel, type DuelOutcome } from '../owner/duel.ts';
import { checkSet } from '../owner/check.ts';
import { assertDirections } from '../owner/directions.ts';
import { EVENT_ID_RE, setDir } from '../owner/paths.ts';
import { withSetLock } from '../owner/fsutil.ts';
import { predictWithModel, repairModelPrediction } from '../taste/prediction.ts';
import { isStale, originalLines } from '../owner/original.ts';
import { resolveBySpeaker, resolveCharacterText } from '../owner/character.ts';
import type { Feedback } from '../owner/feedback.ts';
import { briefView, createSet, newBrief, editedBrief, listSetsDetailed, readSet, variantPath, writeSet, type Brief, type BriefInput, type PromptSet } from '../owner/sets.ts';

const whole = (text: string, what: string): number => {
  if (!/^\d+$/.test(text.trim())) throw new ProseError('E_USAGE', `${what} must be a whole number`, { hint: `Got "${text}"` });
  return Number(text);
};

const csv = (s: string | undefined) => (s ? s.split(',').map(x => x.trim()).filter(Boolean) : []);

/** The owner's feedback as the agent reads it: the reasons as ids and as words, the closest variant with its direction, the note. */
const feedbackView = (project: string, setId: string, f: Feedback) => {
  let closestDirection: string | null = null;
  if (f.closest !== null) { try { closestDirection = readSet(project, setId).variants.find(v => v.index === f.closest)?.direction ?? null; } catch { closestDirection = null; } }
  return { closest: f.closest, closestDirection, reasons: f.reasons, reasonWords: reasonWords(f.reasons), note: f.note ?? null };
};

const presentNext = (keep: number[], checkNext: string) =>
  keep.length >= 2 ? `Present only the kept variants (${keep.join(', ')})` : checkNext;

export function registerSetCommands(program: Command, io: Io): void {
  const set = program.command('set').description('Variant sets: several rewrites of one draft, checked for diversity and direction');

  set.command('new')
    .description('Start a set from a draft: copies it into a base and one file per variant for you to rewrite')
    .argument('[draft]', '.fountain, .md or .dialog.yaml draft inside a prose project (with --redo: defaults to the draft the sent-back set was made from)')
    .option('--directions <list>', 'comma-separated directions, assigned to variants in turn (e.g. punchier,drier)')
    .option('--count <n>', 'number of variants, 2-6 (default: one per direction, at least 3)')
    .option('--id <id>', 'set id (default: generated)')
    .option('--character <text|voice-id>', 'the brief: who speaks and how they talk (at most 600 characters), shown to the owner above the variants; a voice id (a bible in .agent-prose/voices) snapshots its bio. Without it, the bible of a speaker of the reviewed lines picks the bible when exactly one matches')
    .option('--context <text>', 'the brief: where and how the lines are heard (at most 400 characters)')
    .option('--brief-confirmed', 'the owner agreed to this brief; without it the set records the brief as unconfirmed and set check warns')
    .option('--brief-from <set-id>', "copy another set's brief, confirmation included (a refine round); not with --character or --context")
    .option('--redo <set-id>', "start again after the owner sent a set back (none of these): copies that set's brief and the line it revises, records which set it redoes and carries the owner's feedback along; refuses a set that was not sent back; not with --character, --context, --brief-from or --lines")
    .option('--lines <refs>', 'the existing line(s) this set revises: source line numbers or ranges of the draft, e.g. 12 or 12-13,20; shown to the owner beside the variants (omit for a new line)')
    .option('--dir <dir>', 'with --redo and no draft: where to start looking for the project (default: the current directory)')
    .action((draftArg: string | undefined, opts: { directions?: string; count?: string; id?: string; character?: string; context?: string; briefConfirmed?: boolean; briefFrom?: string; lines?: string; redo?: string; dir?: string }) => {
      if (draftArg === undefined && opts.redo === undefined) throw new ProseError('E_USAGE', "error: missing required argument 'draft'", { hint: 'prose set new <draft>, or prose set new --redo <set-id>' });
      const project = needProject(draftArg !== undefined ? dirname(resolve(draftArg)) : (opts.dir ?? process.cwd()));
      let brief: BriefInput | Brief | undefined;
      let redo: { of: string; original?: PromptSet['original']; feedback: Feedback } | undefined;
      let draft = draftArg as string;
      const notes: string[] = [];
      if (opts.redo !== undefined) {
        for (const [flag, on] of [['--character', opts.character !== undefined], ['--context', opts.context !== undefined], ['--brief-from', opts.briefFrom !== undefined], ['--brief-confirmed', opts.briefConfirmed === true], ['--lines', opts.lines !== undefined]] as const) {
          if (on) throw new ProseError('E_USAGE', `--redo copies the brief and the line from the sent-back set, so it cannot be mixed with ${flag}`, { hint: 'Edit afterwards with prose set brief <id>' });
        }
        const old = readSet(project, opts.redo);
        if (old.sentBack === undefined) {
          throw new ProseError('E_CONFLICT', `Set ${old.id} was not sent back, so there is nothing to redo`, {
            hint: old.picked !== undefined ? 'It was picked; start a new set from the draft with prose set new <draft>' : `The owner has not sent it back; present it: prose reading open --set ${old.id}`,
          });
        }
        redo = { of: old.id, ...(old.original ? { original: old.original } : {}), feedback: { closest: old.sentBack.closest, reasons: old.sentBack.reasons, ...(old.sentBack.note !== undefined ? { note: old.sentBack.note } : {}) } };
        brief = old.brief;
        draft ??= resolve(project, old.source);
        if (!existsSync(draft)) throw new ProseError('E_NOT_FOUND', `The draft ${old.source} that set ${old.id} was made from is not there`, { hint: 'Pass the draft: prose set new <draft> --redo <set-id>' });
      } else if (opts.briefFrom !== undefined) {
        if (opts.character !== undefined || opts.context !== undefined) throw new ProseError('E_USAGE', '--brief-from copies a brief, so it cannot be mixed with --character or --context', { hint: 'Edit afterwards with prose set brief <id>' });
        const from = readSet(project, opts.briefFrom).brief;
        if (!from) throw new ProseError('E_USAGE', `Set ${opts.briefFrom} has no brief to copy`, { hint: 'Pass --character and --context instead' });
        brief = opts.briefConfirmed ? { ...from, confirmedAt: new Date().toISOString() } : from;
      } else {
        // An id match wins: --character <voice-id> snapshots the bible; other text stays inline. Without --character the speaker of the lines decides.
        const picked = opts.character !== undefined
          ? resolveCharacterText(project, opts.character)
          : resolveBySpeaker(project, draft, readFileSync(draft, 'utf8'), opts.lines);
        notes.push(...picked.notes);
        if (picked.character !== undefined || opts.context !== undefined || opts.briefConfirmed) {
          brief = newBrief({ character: picked.character, characterRef: picked.characterRef, context: opts.context, confirmed: opts.briefConfirmed }, new Date());
        }
      }
      const s = createSet(project, draft, {
        ...(brief ? { brief } : {}),
        ...(redo ? { redo } : {}),
        ...(opts.lines !== undefined ? { lines: opts.lines } : {}),
        directions: csv(opts.directions),
        ...(opts.count !== undefined ? { count: Number(opts.count) } : {}),
        ...(opts.id ? { id: opts.id } : {}),
      });
      io.emit({
        set: s.id, dir: setDir(project, s.id), form: s.form, base: s.base,
        variants: s.variants.map(v => ({ index: v.index, file: v.file, direction: v.direction })),
        brief: s.brief ? briefView(s.brief) : null,
        original: s.original ? { source: s.original.source, lines: originalLines(s.original), stale: false } : null,
        excluded: s.excluded ?? null,
        ...(redo ? { redoOf: redo.of, feedback: feedbackView(project, redo.of, redo.feedback) } : {}),
        ...(notes.length ? { notes } : {}),
        next: `${redo ? `This redoes ${redo.of}: do not repeat the directions the owner rejected (see feedback). ` : ''}${s.brief && !s.brief.confirmedAt ? `The brief is not confirmed: show it to the owner and, once they agree, run prose set brief ${s.id} --confirmed. ` : ''}${s.excluded ? `${s.excluded.length} struck line${s.excluded.length === 1 ? ' is' : 's are'} excluded: leave ${s.excluded.length === 1 ? 'it' : 'them'} exactly as ${s.excluded.length === 1 ? 'it is' : 'they are'} in every variant (set check rejects an edit). ` : ''}Rewrite each variant file in place (keep the format and header), then run: prose set check ${s.id}`,
      });
    });

  set.command('brief')
    .description('Edit the brief of a set (character and context). New text clears the confirmation unless --confirmed is passed again; a picked set is refused')
    .argument('<id>', 'set id')
    .option('--character <text|voice-id>', 'who speaks and how they talk (at most 600 characters); a voice id takes a fresh snapshot of that bible')
    .option('--context <text>', 'where and how the lines are heard (at most 400 characters)')
    .option('--clear-character', 'remove the character')
    .option('--clear-context', 'remove the context')
    .option('--confirmed', 'the owner agreed to the brief as it now stands')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, opts: { character?: string; context?: string; clearCharacter?: boolean; clearContext?: boolean; confirmed?: boolean; dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const notes: string[] = [];
      const brief = withSetLock(project, id, ctx => {
        const s = readSet(project, id);
        if (s.picked !== undefined) throw new ProseError('E_CONFLICT', `Set ${id} is already picked, so its brief cannot change`, { hint: 'The owner chose with the old brief on screen; start a new set for new words' });
        if (s.sentBack !== undefined) throw new ProseError('E_CONFLICT', `Set ${id} was sent back, so its brief cannot change`, { hint: `The owner judged it with that brief on screen; make a new set with prose set new --redo ${id}` });
        const picked = opts.character !== undefined ? resolveCharacterText(project, opts.character) : undefined;
        if (picked) notes.push(...picked.notes);
        const next = editedBrief(s.brief, picked ? { ...opts, character: picked.character, characterRef: picked.characterRef } : opts, new Date());
        const { brief: _old, ...rest } = s;
        ctx.heartbeat();
        writeSet(project, next ? { ...rest, brief: next } : rest);
        return next;
      });
      io.emit({ set: id, brief: brief ? briefView(brief) : null, ...(notes.length ? { notes } : {}) });
    });

  set.command('list')
    .description('The sets of a project, newest first')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const { sets, problems } = listSetsDetailed(project);
      io.emit({
        project,
        sets: sets.map(s => ({ id: s.id, form: s.form, createdAt: s.createdAt, variants: s.variants.length, picked: s.picked ?? null, status: s.picked !== undefined ? 'picked' : s.sentBack !== undefined ? 'sent back' : 'open', ...(s.redoOf ? { redoOf: s.redoOf } : {}), brief: s.brief !== undefined })),
        ...(problems.length ? { problems } : {}),
      });
    });

  set.command('show')
    .description('A set with the text of every variant, ready to present')
    .argument('<id>', 'set id')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, opts: { dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const s = readSet(project, id);
      const check = checkSet(project, s);
      io.emit({
        set: s.id, project, form: s.form, directions: s.directions, picked: s.picked ?? null,
        status: s.picked !== undefined ? 'picked' : s.sentBack !== undefined ? 'sent back' : 'open',
        sentBack: s.sentBack ? { at: s.sentBack.at, ...feedbackView(project, s.id, s.sentBack) } : null,
        ...(s.redoOf ? { redoOf: s.redoOf, feedback: s.feedback ? feedbackView(project, s.redoOf, s.feedback) : null } : {}),
        brief: s.brief ? briefView(s.brief) : null,
        original: s.original ? { source: s.original.source, lines: originalLines(s.original), stale: isStale(project, s.original) } : null,
        excluded: s.excluded ?? null,
        prediction: existsSync(`${setDir(project, id)}/prediction.json`),
        keep: check.keep, next: presentNext(check.keep, check.next),
        variants: s.variants.map(v => {
          const path = variantPath(project, s, v);
          const c = check.variants.find(x => x.index === v.index)!;
          const missing = !existsSync(path);
          return {
            index: v.index, direction: v.direction, label: v.label ?? null, note: v.note ?? null, file: v.file,
            status: missing ? 'missing' : c.status, reasons: missing ? ['file is missing'] : c.reasons,
            text: missing ? null : readFileSync(path, 'utf8'),
          };
        }),
      });
    });

  set.command('annotate')
    .description("Record a variant's angle (label) or a note; two variants with one label are flagged by set check")
    .argument('<id>', 'set id')
    .argument('<index>', 'variant number')
    .option('--label <text>', 'the angle or mechanism, e.g. understatement')
    .option('--note <text>', 'a short note for the owner')
    .option('--direction <name>', 'change the direction this variant aims at')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, index: string, opts: { label?: string; note?: string; direction?: string; dir?: string }) => {
      if (opts.label === undefined && opts.note === undefined && opts.direction === undefined) {
        throw new ProseError('E_USAGE', 'Nothing to change', { hint: 'Pass --label, --note or --direction' });
      }
      const project = needProject(opts.dir ?? process.cwd());
      const v = withSetLock(project, id, ctx => {
        const s = readSet(project, id);
        const target = s.variants.find(x => x.index === Number(index));
        if (!target) throw new ProseError('E_USAGE', `Set ${id} has no variant ${index}`, { hint: `Variants: ${s.variants.map(x => x.index).join(', ')}` });
        if (opts.direction !== undefined) target.direction = assertDirections([opts.direction])[0];
        if (opts.label !== undefined) target.label = opts.label;
        if (opts.note !== undefined) target.note = opts.note;
        ctx.heartbeat();
        writeSet(project, s);
        return target;
      });
      io.emit({ set: id, variant: v });
    });

  set.command('check')
    .description('Reject unchanged, duplicate and lint-failing variants and verify each moved in its direction')
    .argument('<id>', 'set id')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, opts: { dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      io.emit(checkSet(project, readSet(project, id)));
    });

  set.command('pick')
    .description("Record the owner's choice: appends taste verdicts and reveals whether your sealed prediction hit")
    .argument('<id>', 'set id')
    .requiredOption('--pick <n>', "the variant the owner chose")
    .option('--tags <list>', 'why they chose it, comma-separated (e.g. drier,shorter)')
    .option('--no-predict', 'record the pick even though no prediction was sealed (the flag only lifts the requirement: a valid sealed prediction is still revealed and logged; a tampered one is ignored)')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, opts: { pick: string; tags?: string; predict: boolean; dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      io.emit(recordPick(project, readSet(project, id), whole(opts.pick, '--pick'), { tags: csv(opts.tags), noPredict: opts.predict === false }));
    });

  set.command('none')
    .description('Record that the owner rejected every variant and why ("none of these", from the reading page): closes the set, reveals your sealed prediction unscored, and is never a pick, a duel or taste data. A closed set takes no pick: make a new one with set new --redo')
    .argument('<id>', 'set id')
    .option('--reason <list>', `why, comma-separated, from: ${NONE_REASONS.join(', ')}`)
    .option('--note <text>', "what is wrong, in the owner's words (plain text, at most 1000 characters)")
    .option('--closest <n>', 'the variant that came closest (omit when none did); must be one the owner was shown')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, opts: { reason?: string; note?: string; closest?: string; dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const r = recordNone(project, id, { reasons: csv(opts.reason), ...(opts.note !== undefined ? { note: opts.note } : {}), ...(opts.closest !== undefined ? { closest: whole(opts.closest, '--closest') } : {}) });
      io.emit({ ...r, reasonWords: reasonWords(r.reasons) });
    });

  set.command('duel')
    .description('Record a head-to-head between two variants (from the reading page): one taste verdict; never ships the set')
    .argument('<id>', 'set id')
    .requiredOption('--a <n>', 'the first variant')
    .requiredOption('--b <n>', 'the second variant')
    .option('--a-set <id>', 'the set variant a is in (default: <id>); a refine round duels the pinned champion of an earlier set')
    .option('--b-set <id>', 'the set variant b is in (default: <id>); the duel is recorded in <id>, which must hold one of the two')
    .requiredOption('--outcome <outcome>', DUEL_OUTCOMES.join(' | '))
    .option('--position <order>', 'which side variant a was shown on: ab or ba (presentation only)')
    .option('--event-id <id>', 'names this judgement: a retry with the same id is skipped (default: random, so a repeat is a new judgement)')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, opts: { a: string; b: string; aSet?: string; bSet?: string; outcome: string; position?: string; eventId?: string; dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const a = whole(opts.a, '--a');
      const b = whole(opts.b, '--b');
      const aSet = opts.aSet ?? id;
      const bSet = opts.bSet ?? id;
      if (a === b && aSet === bSet) throw new ProseError('E_USAGE', '--a and --b must be different variants', { hint: `Got ${a} twice` });
      for (const other of new Set([aSet, bSet])) {
        if (other === id) continue;
        try { readSet(project, other); } catch (e) {
          if (e instanceof ProseError && e.code === 'E_NOT_FOUND') throw new ProseError('E_USAGE', `Set ${other} does not exist`, { hint: 'prose set list shows the sets' });
          throw e;
        }
      }
      if (!(DUEL_OUTCOMES as readonly string[]).includes(opts.outcome)) throw new ProseError('E_USAGE', `--outcome "${opts.outcome}" is not an outcome`, { hint: `Allowed: ${DUEL_OUTCOMES.join(', ')}` });
      if (opts.position !== undefined && opts.position !== 'ab' && opts.position !== 'ba') throw new ProseError('E_USAGE', '--position must be ab or ba', { hint: `Got "${opts.position}"` });
      if (opts.eventId !== undefined && !EVENT_ID_RE.test(opts.eventId)) throw new ProseError('E_USAGE', '--event-id must be 1-100 letters, digits, dot, underscore, colon or hyphen', { hint: 'Omit it for a random id' });
      const eventId = opts.eventId ?? randomBytes(6).toString('hex');
      const outcome = opts.outcome as DuelOutcome;
      const r = recordDuel(project, id, { a: { set: aSet, index: a }, b: { set: bSet, index: b }, outcome, eventId, ...(opts.position ? { position: opts.position as 'ab' | 'ba' } : {}) });
      io.emit({
        set: id, eventId, appended: r.appended, skipped: r.skipped,
        rows: [{ kind: duelKind(outcome), winner: outcome === 'b' ? b : a, loser: outcome === 'b' ? a : b, weight: 1 }],
        ...(!r.appended ? { note: 'This judgement (same event id) was already logged; nothing was appended' } : {}),
      });
    });

  program.command('predict')
    .description("Seal your guess of the owner's pick before they see the set (revealed when the pick is recorded). The taste model's own guess is sealed beside it and never printed")
    .requiredOption('--set <id>', 'set id')
    .option('--pick <n>', 'the variant you expect the owner to choose')
    .option('--shortlist <list>', 'other variants you expect them to like, comma-separated')
    .option('--why <text>', 'why you expect that')
    .option('--model-only', "repair: seal only the model's guess for an already-sealed prediction (after a crash between the two writes); needs no --pick or --why, refused once the set is picked")
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { set: string; pick?: string; shortlist?: string; why?: string; modelOnly?: boolean; dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const s = readSet(project, opts.set);
      if (opts.modelOnly) {
        if (opts.pick !== undefined || opts.shortlist !== undefined || opts.why !== undefined) throw new ProseError('E_USAGE', '--model-only seals only the model guess; drop --pick, --shortlist and --why', { hint: 'The agent prediction is already sealed' });
        const model = repairModelPrediction(project, s.id);
        io.emit({ set: s.id, model: model.abstained === null ? 'sealed' : `abstained (${model.abstained})`, next: `Present the set to the owner, then record their choice: prose set pick ${s.id} --pick <n>` });
        return;
      }
      if (opts.pick === undefined) throw new ProseError('E_USAGE', 'required option --pick <n> not specified', { hint: 'Or use --model-only to repair the model guess of an already-sealed prediction' });
      if (opts.why === undefined) throw new ProseError('E_USAGE', 'required option --why <text> not specified', { hint: "The reason is what lets the guess be checked against the owner's pick" });
      const { prediction: p, model } = predictWithModel(project, s, { pick: whole(opts.pick, '--pick'), shortlist: csv(opts.shortlist).map(x => whole(x, '--shortlist entries')), why: opts.why });
      io.emit({ set: s.id, pick: p.pick, shortlist: p.shortlist, shown: p.shown, why: p.why, at: p.at, seal: p.seal, model: model.abstained === null ? 'sealed' : `abstained (${model.abstained})`, next: `Present the set to the owner, then record their choice: prose set pick ${s.id} --pick <n>` });
    });
}
