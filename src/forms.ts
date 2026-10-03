import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ProseError } from './errors.ts';
import { FORMATS } from './kinds.ts';

const FormSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z-]*$/),
  format: z.enum(FORMATS),
  spoken: z.boolean(),
  wpm: z.number().positive().optional(),
  minutesPerPage: z.number().positive().optional(),
  layout: z.enum(['screenplay', 'multicam']).optional(),
  boxChars: z.number().int().positive().optional(),
  boxLines: z.number().int().positive().optional(),
  /** Speeches set one phrase per line: a line break is a pause, so it ends a breath unit. */
  lineBreakPauses: z.boolean().optional(),
  basis: z.string().min(1),
});
const FormsFile = z.strictObject({
  schema: z.literal('prose/forms@1'),
  defaults: z.record(z.enum(FORMATS), z.string()),
  forms: z.array(FormSchema).min(1),
});

export type Form = z.infer<typeof FormSchema>;
export const FORMS_PATH = join(import.meta.dirname, '..', 'craft', 'forms.json');
const file = FormsFile.parse(JSON.parse(readFileSync(FORMS_PATH, 'utf8')));
export const FORMS: Form[] = file.forms;
export const DEFAULT_FORM = file.defaults;

export function getForm(id: string): Form {
  const form = FORMS.find(f => f.id === id);
  if (!form) throw new ProseError('E_USAGE', `Unknown form "${id}"`, { hint: `Known forms: ${FORMS.map(f => f.id).join(', ')}` });
  return form;
}
