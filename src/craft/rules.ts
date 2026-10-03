import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const DIR = join(import.meta.dirname, '..', '..', 'craft');

export const RuleSchema = z.strictObject({
  id: z.string().regex(/^[a-z]+(?:\.[a-z0-9-]+)+$/),
  topic: z.string().min(1),
  statement: z.string().min(1),
  value: z.number().nullable(),
  unit: z.string().nullable(),
  forms: z.union([z.literal('all'), z.array(z.string()).min(1)]),
  registers: z.union([z.literal('all'), z.array(z.string()).min(1)]).default('all'),
  check: z.enum(['auto', 'judgement']),
  severity: z.enum(['error', 'warn', 'info']),
  sources: z.array(z.string()).min(1),
  derived: z.boolean(),
  rationale: z.string().min(1),
  conflicts: z.array(z.strictObject({ rule: z.string(), note: z.string().min(1) })).default([]),
});
const RulesFile = z.strictObject({ schema: z.literal('prose/rules@1'), rules: z.array(RuleSchema).min(1) });

export const ReferenceSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  authors: z.string().min(1),
  year: z.number().int().nullable(),
  title: z.string().min(1),
  url: z.url(),
  kind: z.enum(['standard', 'peer-reviewed', 'review', 'platform-doc', 'style-guide', 'practitioner', 'book']),
  note: z.string().optional(),
});
const ReferencesFile = z.strictObject({ schema: z.literal('prose/references@1'), references: z.array(ReferenceSchema).min(1) });

export type Rule = z.infer<typeof RuleSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;

export const RULES: Rule[] = RulesFile.parse(JSON.parse(readFileSync(join(DIR, 'rules.json'), 'utf8'))).rules;
export const REFERENCES: Reference[] = ReferencesFile.parse(JSON.parse(readFileSync(join(DIR, 'references.json'), 'utf8'))).references;

export function rulesFor(form: string, register?: string): Rule[] {
  return RULES.filter(r =>
    (r.forms === 'all' || r.forms.includes(form)) &&
    (r.registers === 'all' || register === undefined || r.registers.includes(register)));
}
