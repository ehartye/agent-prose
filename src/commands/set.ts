import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { ProseError } from '../errors.ts';
import { needProject } from '../project.ts';
import { recordPick } from '../owner/pick.ts';
import { DUEL_OUTCOMES, duelKind, recordDuel, type DuelOutcome } from '../owner/duel.ts';
import { checkSet } from '../owner/check.ts';
import { assertDirections } from '../owner/directions.ts';
import { EVENT_ID_RE, setDir } from '../owner/paths.ts';
import { withSetLock } from '../owner/fsutil.ts';
import { predictWithModel, repairModelPrediction } from '../taste/prediction.ts';
import { isStale, originalLines } from '../owner/original.ts';
import { briefView, createSet, editedBrief, listSetsDetailed, readSet, variantPath, writeSet, type Brief, type BriefInput } from '../owner/sets.ts';

const whole = (text: string, what: string): number => {
  if (!/^\d+$/.test(text.trim())) throw new ProseError('E_USAGE', `${what} must be a whole number`, { hint: `Got "${text}"` });
  return Number(text);
};

const csv = (s: string | undefined) => (s ? s.split(',').map(x => x.trim()).filter(Boolean) : []);

const presentNext = (keep: number[], checkNext: string) =>
  keep.length >= 2 ? `Present only the kept variants (${keep.join(', ')})` : checkNext;

export function registerSetCommands(program: Command, io: Io): void {
  const set = program.command('set').description('Variant sets: several rewrites of one draft, checked for diversity and direction');

  set.command('new')
    .description('Start a set from a draft: copies it into a base and one file per variant for you to rewrite')
    .argument('<draft>', '.fountain, .md or .dialog.yaml draft inside a prose project')
    .option('--directions <list>', 'comma-separated directions, assigned to variants in turn (e.g. punchier,drier)')
    .option('--count <n>', 'number of variants, 2-6 (default: one per direction, at least 3)')
    .option('--id <id>', 'set id (default: generated)')
    .option('--character <text>', 'the brief: who speaks and how they talk (at most 600 characters), shown to the owner above the variants')
    .option('--context <text>', 'the brief: where and how the lines are heard (at most 400 characters)')
    .option('--brief-confirmed', 'the owner agreed to this brief; without it the set records the brief as unconfirmed and set check warns')
    .option('--brief-from <set-id>', "copy another set's brief, confirmation included (a refine round); not with --character or --context")
    .option('--lines <refs>', 'the existing line(s) this set revises: source line numbers or ranges of the draft, e.g. 12 or 12-13,20; shown to the owner beside the variants (omit for a new line)')
    .action((draft: string, opts: { directions?: string; count?: string; id?: string; character?: string; context?: string; briefConfirmed?: boolean; briefFrom?: string; lines?: string }) => {
      const project = needProject(dirname(resolve(draft)));
      let brief: BriefInput | Brief | undefined;
      if (opts.briefFrom !== undefined) {
        if (opts.character !== undefined || opts.context !== undefined) throw new ProseError('E_USAGE', '--brief-from copies a brief, so it cannot be mixed with --character or --context', { hint: 'Edit afterwards with prose set brief <id>' });
        const from = readSet(project, opts.briefFrom).brief;
        if (!from) throw new ProseError('E_USAGE', `Set ${opts.briefFrom} has no brief to copy`, { hint: 'Pass --character and --context instead' });
        brief = opts.briefConfirmed ? { ...from, confirmedAt: new Date().toISOString() } : from;
      } else if (opts.character !== undefined || opts.context !== undefined || opts.briefConfirmed) {
        brief = { character: opts.character, context: opts.context, confirmed: opts.briefConfirmed };
      }
      const s = createSet(project, draft, {
        ...(brief ? { brief } : {}),
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
        next: `${s.brief && !s.brief.confirmedAt ? `The brief is not confirmed: show it to the owner and, once they agree, run prose set brief ${s.id} --confirmed. ` : ''}${s.excluded ? `${s.excluded.length} struck line${s.excluded.length === 1 ? ' is' : 's are'} excluded: leave ${s.excluded.length === 1 ? 'it' : 'them'} exactly as ${s.excluded.length === 1 ? 'it is' : 'they are'} in every variant (set check rejects an edit). ` : ''}Rewrite each variant file in place (keep the format and header), then run: prose set check ${s.id}`,
      });
    });

  set.command('brief')
    .description('Edit the brief of a set (character and context). New text clears the confirmation unless --confirmed is passed again; a picked set is refused')
    .argument('<id>', 'set id')
    .option('--character <text>', 'who speaks and how they talk (at most 600 characters)')
    .option('--context <text>', 'where and how the lines are heard (at most 400 characters)')
    .option('--clear-character', 'remove the character')
    .option('--clear-context', 'remove the context')
    .option('--confirmed', 'the owner agreed to the brief as it now stands')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, opts: { character?: string; context?: string; clearCharacter?: boolean; clearContext?: boolean; confirmed?: boolean; dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const brief = withSetLock(project, id, ctx => {
        const s = readSet(project, id);
        if (s.picked !== undefined) throw new ProseError('E_CONFLICT', `Set ${id} is already picked, so its brief cannot change`, { hint: 'The owner chose with the old brief on screen; start a new set for new words' });
        const next = editedBrief(s.brief, opts, new Date());
        const { brief: _old, ...rest } = s;
        ctx.heartbeat();
        writeSet(project, next ? { ...rest, brief: next } : rest);
        return next;
      });
      io.emit({ set: id, brief: brief ? briefView(brief) : null });
    });

  set.command('list')
    .description('The sets of a project, newest first')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const { sets, problems } = listSetsDetailed(project);
      io.emit({
        project,
        sets: sets.map(s => ({ id: s.id, form: s.form, createdAt: s.createdAt, variants: s.variants.length, picked: s.picked ?? null, brief: s.brief !== undefined })),
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
