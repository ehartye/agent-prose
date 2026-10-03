import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ProseError } from './errors.ts';
import { FORMATS } from './kinds.ts';

const SCHEME = /^[a-zA-Z]+$/;
const count = z.number().int().positive();

/**
 * Verse structure. `scheme` is end-rhyme letters, one per line; where a form allows alternatives (ballad, Petrarchan
 * sestet) `schemes` lists them instead (never both). An uppercase letter marks a refrain line (villanelle), and
 * `refrains` names each refrain and gives its 1-based line numbers: A1 and A2 are the two refrains, both rhyming "a".
 * `endWordRotation` (sestina) has one row per six-line stanza; each entry is the 0-based index (A=0 .. F=5) of the end
 * word that ends that line, and `envoiLines` is the closing stanza, which holds all six end words.
 */
const VerseSchema = z.strictObject({
  kind: z.enum(['poem', 'lyric']),
  lines: count.optional(),
  scheme: z.string().regex(SCHEME).optional(),
  schemes: z.array(z.string().regex(SCHEME)).min(2).optional(),
  syllables: z.array(count).optional(),
  /** Syllable counts are conventional, not required (haiku): findings say so and stay informational. */
  soft: z.boolean().optional(),
  meter: z.strictObject({ foot: z.enum(['iamb', 'trochee', 'anapest', 'dactyl', 'common']), feet: count }).optional(),
  /** Feet per line where lines differ (limerick); `meter.feet` is then the longest line. */
  feetPerLine: z.array(count).optional(),
  stanzaSizes: z.array(count).optional(),
  refrains: z.record(z.string().regex(/^[A-Z]\d+$/), z.array(count).min(2)).optional(),
  endWordRotation: z.array(z.array(z.number().int().min(0).max(5)).length(6)).optional(),
  envoiLines: count.optional(),
}).refine(v => !(v.scheme && v.schemes), { message: 'scheme and schemes are alternatives' });

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
  verse: VerseSchema.optional(),
  basis: z.string().min(1),
});
const FormsFile = z.strictObject({
  schema: z.literal('prose/forms@1'),
  defaults: z.record(z.enum(FORMATS), z.string()),
  forms: z.array(FormSchema).min(1),
});

export type Form = z.infer<typeof FormSchema>;
export const FORMS_PATH = join(import.meta.dirname, '..', 'craft', 'forms.json');
/** Validates a parsed forms file; exported so tests can check what the schema rejects. */
export const parseFormsFile = (raw: unknown) => FormsFile.parse(raw);
const file = parseFormsFile(JSON.parse(readFileSync(FORMS_PATH, 'utf8')));
export const FORMS: Form[] = file.forms;
export const DEFAULT_FORM = file.defaults;

export function getForm(id: string): Form {
  const form = FORMS.find(f => f.id === id);
  if (!form) throw new ProseError('E_USAGE', `Unknown form "${id}"`, { hint: `Known forms: ${FORMS.map(f => f.id).join(', ')}` });
  return form;
}
