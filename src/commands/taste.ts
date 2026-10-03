import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { needProject } from '../project.ts';
import { join } from 'node:path';
import { globalTasteDir, projectTasteDir } from '../owner/paths.ts';
import { duelCounts, predictionStats } from '../owner/stats.ts';
import { verdictCounts } from '../owner/verdicts.ts';
import { loadTaste } from '../taste/load.ts';
import { summarize } from '../taste/summary.ts';

export function registerTasteCommands(program: Command, io: Io): void {
  const taste = program.command('taste').description("What the owner's picks say, and how well the agent has predicted them");

  taste.command('stats')
    .description("How often the agent's and the model's sealed predictions matched the owner's pick, and how many verdict rows the logs hold. Shortlist hits are meaningful only for sets of four or more variants (shortlistEligible counts them); the agent-versus-model comparison uses the pick only. The model's recent window is its last N predicted rows, the agent's its last N rows")
    .option('--all-projects', 'count every project, not only the current one')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { allProjects?: boolean; dir?: string }) => {
      const project = opts.allProjects ? undefined : needProject(opts.dir ?? process.cwd());
      const verdicts = {
        ...(project ? { project: verdictCounts(join(projectTasteDir(project), 'verdicts.jsonl')) } : {}),
        global: verdictCounts(join(globalTasteDir(), 'verdicts.jsonl')),
      };
      const duels = {
        ...(project ? { project: duelCounts(join(projectTasteDir(project), 'verdicts.jsonl')) } : {}),
        global: duelCounts(join(globalTasteDir(), 'verdicts.jsonl')),
      };
      io.emit({ project: project ?? null, ...predictionStats(project ? { project } : {}), verdicts, duels });
    });
  taste.command('show')
    .description("The owner's style tendencies learned from their picks and duels, in plain words (inside a project: project and global layers; --all-projects or --voice adjust the layers)")
    .option('--voice <id>', 'also fit the voice layer for this voice bible id, when enough judgements name it')
    .option('--all-projects', 'global layer only, from every project; needs no project')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { voice?: string; allProjects?: boolean; dir?: string }) => {
      const project = opts.allProjects ? null : needProject(opts.dir ?? process.cwd());
      const voice = opts.voice ?? null;
      const { model, layers, counts } = loadTaste({ project, voice: project ? voice : null });
      const { preferences, markdown, enough } = summarize(model, counts);
      const note = project ? '' : '\nThis is the global layer only, fitted from every project; there is no project or voice layer here.\n';
      io.emit({ project, voice, layers, counts, enough, preferences, markdown: markdown + note });
    });
}
