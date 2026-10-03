import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { ProseError } from '../errors.ts';
import { needProject } from '../project.ts';
import { recordPick } from '../owner/pick.ts';
import { writePrediction } from '../owner/prediction.ts';
import { checkSet } from '../owner/check.ts';
import { assertDirections } from '../owner/directions.ts';
import { setDir } from '../owner/paths.ts';
import { withSetLock } from '../owner/fsutil.ts';
import { createSet, listSetsDetailed, readSet, variantPath, writeSet } from '../owner/sets.ts';

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
    .action((draft: string, opts: { directions?: string; count?: string; id?: string }) => {
      const project = needProject(dirname(resolve(draft)));
      const s = createSet(project, draft, {
        directions: csv(opts.directions),
        ...(opts.count !== undefined ? { count: Number(opts.count) } : {}),
        ...(opts.id ? { id: opts.id } : {}),
      });
      io.emit({
        set: s.id, dir: setDir(project, s.id), form: s.form, base: s.base,
        variants: s.variants.map(v => ({ index: v.index, file: v.file, direction: v.direction })),
        next: `Rewrite each variant file in place (keep the format and header), then run: prose set check ${s.id}`,
      });
    });

  set.command('list')
    .description('The sets of a project, newest first')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const { sets, problems } = listSetsDetailed(project);
      io.emit({
        project,
        sets: sets.map(s => ({ id: s.id, form: s.form, createdAt: s.createdAt, variants: s.variants.length, picked: s.picked ?? null })),
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

  program.command('predict')
    .description("Seal your guess of the owner's pick before they see the set (revealed when the pick is recorded)")
    .requiredOption('--set <id>', 'set id')
    .requiredOption('--pick <n>', 'the variant you expect the owner to choose')
    .option('--shortlist <list>', 'other variants you expect them to like, comma-separated')
    .requiredOption('--why <text>', 'why you expect that')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { set: string; pick: string; shortlist?: string; why: string; dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const s = readSet(project, opts.set);
      const p = writePrediction(project, s, { pick: whole(opts.pick, '--pick'), shortlist: csv(opts.shortlist).map(x => whole(x, '--shortlist entries')), why: opts.why });
      io.emit({ set: s.id, pick: p.pick, shortlist: p.shortlist, shown: p.shown, why: p.why, at: p.at, seal: p.seal, next: `Present the set to the owner, then record their choice: prose set pick ${s.id} --pick <n>` });
    });
}
