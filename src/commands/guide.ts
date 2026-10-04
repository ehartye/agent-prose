import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { ProseError } from '../errors.ts';
import { FAMILIES, SECTIONS, guideWritten, loadGuide, pickSection, renderGuideText, resolveFamily } from '../craft/guides.ts';

export function registerGuideCommands(program: Command, io: Io): void {
  program.command('guide [name]')
    .description('Craft reference guides: list the families, or print the guide for a family or form')
    .option('--section <name>', `only one section: ${SECTIONS.map(s => s.key).join(', ')}`)
    .option('--text', 'print the guide as readable Markdown instead of JSON')
    .action((name: string | undefined, opts: { section?: string; text?: boolean }) => {
      if (!name) {
        if (opts.section) throw new ProseError('E_USAGE', '--section needs a family or form name', { hint: 'Run prose guide to list the families' });
        if (opts.text) {
          console.log(FAMILIES.map(f => `${f.id}: ${f.title}\n  forms: ${f.forms.join(', ')}\n  ${f.description}`).join('\n\n'));
        } else {
          io.emit({ families: FAMILIES.map(f => ({ id: f.id, title: f.title, forms: f.forms, description: f.description, written: guideWritten(f.id) })) });
        }
        return;
      }
      const family = resolveFamily(name);
      const guide = loadGuide(family.id);
      const section = opts.section === undefined ? undefined : pickSection(guide, opts.section);
      if (opts.text) { process.stdout.write(renderGuideText(guide, section)); return; }
      io.emit(section
        ? { family: guide.family, title: guide.title, forms: guide.forms, reviewed: guide.reviewed, section }
        : { family: guide.family, title: guide.title, forms: guide.forms, reviewed: guide.reviewed, sections: guide.sections });
    });
}
