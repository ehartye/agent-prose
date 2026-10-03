import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { RULES, rulesFor } from '../craft/rules.ts';
import { getForm } from '../forms.ts';

export function registerRuleCommands(program: Command, io: Io): void {
  program.command('rules')
    .description('The cited craft rules, optionally for one form')
    .option('--form <id>', 'only rules that apply to this form')
    .action((opts: { form?: string }) => {
      const rules = opts.form ? rulesFor(getForm(opts.form).id) : RULES;
      io.emit({ rules: rules.map(r => ({ id: r.id, topic: r.topic, forms: r.forms, registers: r.registers, severity: r.severity, check: r.check, statement: r.statement, value: r.value, unit: r.unit, derived: r.derived, sources: r.sources, rationale: r.rationale, conflicts: r.conflicts })) });
    });
}
