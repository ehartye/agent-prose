// prose: JSON on stdout, one-line JSON error on stderr with a stable code, non-zero exit on failure.
import { Command, CommanderError } from 'commander';
import { ProseError } from './errors.ts';
import type { Io } from './io.ts';
import { VERSION } from './version.ts';
import { registerCapabilities } from './commands/capabilities.ts';
import { registerDocumentCommands } from './commands/document.ts';
import { registerProjectCommands } from './commands/project.ts';
import { registerReadingCommands } from './commands/reading.ts';
import { registerRuleCommands } from './commands/rules.ts';
import { registerSetCommands } from './commands/set.ts';
import { registerTasteCommands } from './commands/taste.ts';
import { registerVerseCommands } from './commands/verse.ts';

export function buildProgram(io: Io): Command {
  const program = new Command('prose')
    .description('Writing-craft toolkit for coding agents')
    .version(VERSION)
    .option('--pretty', 'indent JSON output')
    .exitOverride()
    .configureOutput({ writeErr: () => {}, writeOut: s => process.stdout.write(s) });
  registerCapabilities(program, io);
  registerDocumentCommands(program, io);
  registerProjectCommands(program, io);
  registerReadingCommands(program, io);
  registerRuleCommands(program, io);
  registerSetCommands(program, io);
  registerTasteCommands(program, io);
  registerVerseCommands(program, io);
  return program;
}

export async function main(argv: string[]): Promise<void> {
  const pretty = argv.includes('--pretty');
  const io: Io = { emit: value => console.log(JSON.stringify(value, null, pretty ? 2 : undefined)) };
  const program = buildProgram(io);
  const rest = argv.slice(2);
  if (rest.length === 0 || rest.every(a => a.startsWith('-')) && !rest.some(a => ['-h', '--help', '-V', '--version'].includes(a))) {
    console.error(JSON.stringify({ error: { code: 'E_USAGE', message: 'No command given', hint: 'Run prose capabilities' } }));
    process.exitCode = 2;
    return;
  }
  try {
    await program.parseAsync(argv);
  } catch (e) {
    if (e instanceof CommanderError) {
      if (e.code === 'commander.helpDisplayed' || e.code === 'commander.version' || e.code === 'commander.help') return;
      console.error(JSON.stringify({ error: { code: 'E_USAGE', message: e.message.replace(/^error: /, '') } }));
      process.exitCode = 2;
      return;
    }
    const err = e instanceof ProseError ? e : new ProseError('E_INTERNAL', (e as Error)?.message ?? String(e));
    console.error(JSON.stringify({ error: err.toJson() }));
    process.exitCode = err.code === 'E_USAGE' ? 2 : 1;
  }
}
