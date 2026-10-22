import { resolve } from 'node:path';
import type { Command } from 'commander';
import { createAssessmentBatch, readAssessmentBatch, dispositionAssessment } from '../assessment.ts';
import type { Io } from '../io.ts';
import { needProject } from '../project.ts';
import { assessmentUrl, registerProject } from '../reading/server.ts';
import { ensureServer } from './reading.ts';

export function registerAssessmentCommands(program: Command, io: Io): void {
  const assessment = program.command('assessment').description('Browse supplied passage-suitability reports as an independent batch');
  assessment.command('create <input>').description('Validate and snapshot one to fifty passages and supplied reports from UTF-8 JSON')
    .option('--dir <path>', 'project directory', '.')
    .action((input: string, opts: { dir: string }) => io.emit(createAssessmentBatch(needProject(opts.dir), resolve(input))));
  assessment.command('show <id>').description('Read all passage snapshots, supplied ratings, evidence and proposals')
    .option('--dir <path>', 'project directory', '.')
    .action((id: string, opts: { dir: string }) => io.emit(readAssessmentBatch(needProject(opts.dir), id)));
  assessment.command('open <id>').description('Get a local link to the shared batch assessment workbench')
    .option('--dir <path>', 'project directory', '.')
    .action(async (id: string, opts: { dir: string }) => {
      const root = needProject(opts.dir); readAssessmentBatch(root, id);
      const { info, started } = await ensureServer({ local: true }); registerProject(root);
      io.emit({ id, url: assessmentUrl(info, id), started, notice: 'Local assessment review: anyone with this link on this machine can read the supplied snapshots and record suggestion dispositions and notes. Accepting a suggestion does not apply an edit.' });
    });
  assessment.command('disposition <id> <passage> <suggestion> <status>').description('Save accepted, rejected, deferred or pending intent for a suggestion without applying edits')
    .option('--dir <path>', 'project directory', '.').requiredOption('--revision <hash>', 'current assessment revision').option('--note <text>', 'review note; omit to retain the saved note, or use an empty string to clear')
    .action(async (id: string, passage: string, suggestion: string, status: string, opts: { dir: string; revision: string; note?: string }) => {
      io.emit(await dispositionAssessment(needProject(opts.dir), id, { passage, suggestion, status, expectedRevision: opts.revision, ...(opts.note === undefined ? {} : { note: opts.note }) }));
    });
}
