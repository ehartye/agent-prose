import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { needProject } from '../project.ts';
import { join } from 'node:path';
import { globalTasteDir, projectTasteDir } from '../owner/paths.ts';
import { duelCounts, predictionStats } from '../owner/stats.ts';
import { verdictCounts } from '../owner/verdicts.ts';

export function registerTasteCommands(program: Command, io: Io): void {
  const taste = program.command('taste').description("What the owner's picks say, and how well the agent has predicted them");

  taste.command('stats')
    .description("How often the agent's sealed predictions matched the owner's pick, and how many verdict rows the logs hold")
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
}
