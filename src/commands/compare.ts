import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { createComparison, readComparison, editComparison, chooseComparison } from '../comparison.ts';
import { ProseError } from '../errors.ts';
import type { Io } from '../io.ts';
import { needProject } from '../project.ts';
import { comparisonUrl, registerProject } from '../reading/server.ts';
import { ensureServer } from './reading.ts';

export function registerCompareCommands(program: Command, io: Io): void {
  const compare = program.command('compare').description('Read, edit and choose supplied reading-level adaptations beside their source');
  const project = (dir: string) => needProject(dir);
  compare.command('create <source> <variants...>').description('Compare an immutable Markdown source with one to three adaptations; document paths are project-relative')
    .option('--dir <path>', 'project directory containing the supplied document paths', '.').option('--title <text>', 'comparison title')
    .action((source: string, variants: string[], opts: { dir: string; title?: string }) => io.emit(createComparison(project(opts.dir), source, variants, { title: opts.title })));
  compare.command('show <id>').description('Read the current text, reader targets, diagnostics and saved choice')
    .option('--dir <path>', 'project directory', '.')
    .action((id: string, opts: { dir: string }) => io.emit(readComparison(project(opts.dir), id)));
  compare.command('open <id>').description('Open the shared comparison page on the local reading server')
    .option('--dir <path>', 'project directory', '.')
    .action(async (id: string, opts: { dir: string }) => {
      const root = project(opts.dir); readComparison(root, id);
      const { info, started } = await ensureServer({ local: true }); registerProject(root);
      io.emit({ id, url: comparisonUrl(info, id), started, notice: 'Local reading comparison: anyone with this link on this machine can read, edit and choose the supplied adaptations. The source stays read-only.' });
    });
  compare.command('edit <id> <variant>').description('Save only an adaptation body against a current compound revision')
    .option('--dir <path>', 'project directory', '.').requiredOption('--text-file <path>', 'UTF-8 body file resolved from the current working directory').requiredOption('--revision <hash>', 'current comparison revision')
    .action(async (id: string, variant: string, opts: { dir: string; textFile: string; revision: string }) => {
      let body: string;
      try { body = readFileSync(resolve(opts.textFile), 'utf8'); } catch { throw new ProseError('E_NOT_FOUND', 'The replacement body file is unavailable'); }
      io.emit(await editComparison(project(opts.dir), id, variant, body, opts.revision));
    });
  compare.command('choose <id> <variant>').description('Record a hash-bound adaptation choice without overwriting the source')
    .option('--dir <path>', 'project directory', '.').requiredOption('--revision <hash>', 'current comparison revision')
    .action(async (id: string, variant: string, opts: { dir: string; revision: string }) => io.emit(await chooseComparison(project(opts.dir), id, variant, opts.revision)));
}
