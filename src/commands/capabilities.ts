import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { ERROR_CODES, RESERVED_ERROR_CODES } from '../errors.ts';
import { FORMS } from '../forms.ts';
import { FORMATS } from '../kinds.ts';
import { RULES } from '../craft/rules.ts';
import { VERSION } from '../version.ts';

export function registerCapabilities(program: Command, io: Io): void {
  program.command('capabilities')
    .description('Formats, forms, rules, commands and error codes')
    .action(() => {
      io.emit({
        name: 'prose', version: VERSION,
        formats: [...FORMATS],
        forms: FORMS.map(f => f.id),
        verseForms: FORMS.filter(f => f.verse).map(f => f.id),
        rules: RULES.length,
        commands: program.commands.flatMap(c => c.commands.length ? c.commands.map(s => `${c.name()} ${s.name()}`) : [c.name()]).sort(),
        errorCodes: ERROR_CODES,
        reservedErrorCodes: RESERVED_ERROR_CODES,
      });
    });
}
