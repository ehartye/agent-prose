import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { loadDocument } from '../document.ts';
import { buildReport, renderText } from '../audit/report.ts';

export function registerAuditCommand(program: Command, io: Io): void {
  program.command('audit')
    .description('Hard artifacts, phrasing and structure hallmarks and measured context in a draft; findings only, never a verdict on who wrote it')
    .argument('<file>', '.md, .fountain or .dialog.yaml draft')
    .option('--form <id>', 'override the form declared in the draft')
    .option('--text', 'print a readable list grouped by family instead of JSON')
    .action((file: string, opts: { form?: string; text?: boolean }) => {
      const doc = loadDocument(file, opts);
      const report = buildReport(doc, doc.format === 'markdown' ? readFileSync(file, 'utf8') : undefined);
      if (opts.text) console.log(renderText(report));
      else io.emit(report);
    });
}
