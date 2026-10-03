import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { loadDocument } from '../document.ts';
import { measure } from '../measure/index.ts';
import { lint } from '../lint/lint.ts';

export function registerDocumentCommands(program: Command, io: Io): void {
  program.command('parse')
    .description('Parse a draft into the block IR with source line numbers')
    .argument('<file>', '.fountain, .md or .dialog.yaml draft')
    .option('--form <id>', 'override the form declared in the draft')
    .action((file: string, opts: { form?: string }) => {
      const doc = loadDocument(file, opts);
      io.emit({ path: doc.path, format: doc.format, form: doc.form, register: doc.register ?? null, meta: doc.meta, blocks: doc.blocks });
    });

  program.command('measure')
    .description('Style, lexicon, spoken, script, dialog and per-speaker features')
    .argument('<file>', '.fountain, .md or .dialog.yaml draft')
    .option('--form <id>', 'override the form declared in the draft')
    .action((file: string, opts: { form?: string }) => io.emit(measure(loadDocument(file, opts))));

  program.command('lint')
    .description('Errors, warnings, info and judgement rules for the draft\'s form')
    .argument('<file>', '.fountain, .md or .dialog.yaml draft')
    .option('--form <id>', 'override the form declared in the draft')
    .action((file: string, opts: { form?: string }) => io.emit(lint(loadDocument(file, opts))));
}
