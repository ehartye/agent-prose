import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { renderDocument, type RenderOptions } from '../render/index.ts';

export function registerRenderCommands(program: Command, io: Io): void {
  program.command('render').description('Export offline print/reading artifacts; --tts openai sends text to OpenAI')
    .argument('<file>', 'native draft')
    .requiredOption('--to <target>', 'pdf, html, md or json')
    .requiredOption('--out <path>', 'new artifact path (never overwrites)')
    .option('--form <id>', 'override draft form')
    .option('--tts <provider>', 'explicit cloud audio opt-in: openai; produces AI-generated voice')
    .option('--audio-out <path.wav>', 'new WAV artifact path; requires --tts openai')
    .option('--voice <id>', 'OpenAI voice (default: marin)')
    .action(async (file: string, opts: RenderOptions) => io.emit(await renderDocument(file, opts)));
}
