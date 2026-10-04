// "None of these": the owner rejects every variant of a set and says why. The vocabulary and the validation live here, in a
// leaf module (no I/O), so the set file, the verdict log, the CLI and the reading server all agree on one definition.
import { z } from 'zod';
import { ProseError } from '../errors.ts';

/** The fixed reasons, as ids (what is stored and what `--reason` takes) with the words the owner reads on the page. */
export const NONE_REASONS = ['wrong-direction', 'not-their-voice', 'too-similar', 'misses-the-point', 'too-long', 'too-short', 'premise-wrong', 'other'] as const;
export type NoneReason = (typeof NONE_REASONS)[number];
export const NONE_REASON_LABELS: Record<NoneReason, string> = {
  'wrong-direction': 'Wrong direction',
  'not-their-voice': "Doesn't sound like them",
  'too-similar': 'Too similar to each other',
  'misses-the-point': 'Misses the point of the scene',
  'too-long': 'Too long',
  'too-short': 'Too short',
  'premise-wrong': 'The premise is wrong',
  other: 'Other',
};
/** The longest note, in characters, after trimming. */
export const MAX_NONE_NOTE = 1000;

/** Free text from the owner: line endings folded, trimmed; control characters other than tab and newline are refused. Plain text only, never markup. */
export const NoneNote = z.string()
  .transform(s => s.replace(/\r\n?/g, '\n').trim())
  .pipe(z.string().max(MAX_NONE_NOTE, `a note is at most ${MAX_NONE_NOTE} characters`).refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s), 'no control characters'));

/** What the owner said when they sent a set back: the variant that came closest (null: none did), the reasons, a note. */
export const FeedbackSchema = z.strictObject({
  closest: z.number().int().min(1).nullable(),
  reasons: z.array(z.enum(NONE_REASONS)).max(NONE_REASONS.length),
  note: z.string().min(1).max(MAX_NONE_NOTE).optional(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export interface FeedbackInput { closest?: number | null; reasons?: readonly string[]; note?: string | null }

/**
 * Validated feedback from what a caller said (a CLI flag or the page): reasons from the fixed list (a repeat is dropped, an
 * unknown one is E_USAGE), the note trimmed and bounded (an empty one is absent), at least one reason or a note. `closest`
 * is only checked to be a positive whole number here; whether the set shows it is the recorder's check.
 */
export function newFeedback(input: FeedbackInput): Feedback {
  const bad = (message: string, hint?: string) => new ProseError('E_USAGE', message, hint ? { hint } : {});
  const reasons: NoneReason[] = [];
  for (const r of input.reasons ?? []) {
    if (!(NONE_REASONS as readonly string[]).includes(r)) throw bad(`"${String(r).slice(0, 40)}" is not a reason`, `Allowed: ${NONE_REASONS.join(', ')}`);
    if (!reasons.includes(r as NoneReason)) reasons.push(r as NoneReason);
  }
  let note: string | undefined;
  if (input.note !== undefined && input.note !== null) {
    const parsed = NoneNote.safeParse(input.note);
    if (!parsed.success) throw bad(`The note is not usable: ${parsed.error.issues[0].message}`, `A note is plain text, at most ${MAX_NONE_NOTE} characters, without control characters`);
    if (parsed.data) note = parsed.data;
  }
  if (reasons.length === 0 && note === undefined) throw bad('Say why: give at least one reason or a note', `Reasons: ${NONE_REASONS.join(', ')}; or --note "..."`);
  const closest = input.closest ?? null;
  if (closest !== null && (!Number.isInteger(closest) || closest < 1)) throw bad('--closest must be a whole number from 1', 'Omit it when no variant came close');
  return { closest, reasons, ...(note !== undefined ? { note } : {}) };
}

/** The reasons as the owner reads them, in the order given. */
export const reasonWords = (reasons: readonly string[]): string[] => reasons.map(r => NONE_REASON_LABELS[r as NoneReason] ?? r);
