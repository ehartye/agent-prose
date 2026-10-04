import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { loadDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import { FORMATS } from '../kinds.ts';
import { assertDirections } from './directions.ts';
import { MAX_ORIGINAL_TEXT, OriginalSchema, SourcePath, draftHash, snapshotOriginal } from './original.ts';
import { currentStrikes } from '../strike/current.ts';
import { writeFileAtomic } from './fsutil.ts';
import { ID_RE, newId, setDir, setsDir, validId } from './paths.ts';

export const MIN_VARIANTS = 2;
export const MAX_VARIANTS = 6;
export const DEFAULT_VARIANTS = 3;

const EXT = { fountain: '.fountain', markdown: '.md', dialog: '.dialog.yaml' } as const;

/**
 * A file name inside a set directory: one plain component, no separator, no `..`, no drive or stream colon, no NUL, no
 * leading dot, no trailing dot, and not a Windows device name. set.json is data from disk, so this is the first guard;
 * `inSet` below is the second, applied wherever a name is joined to the set directory.
 */
export const SET_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const SetFileName = z.string().min(1).max(100)
  .regex(SET_FILE_RE, 'must be a plain file name (letters, digits, dot, dash, underscore; no folders)')
  .refine(n => !n.includes('..') && !n.endsWith('.') && !WINDOWS_DEVICE.test(n.split('.')[0]), 'must be a plain file name (no "..", no trailing dot, no device name)');
export const VariantSchema = z.strictObject({
  index: z.number().int().min(1),
  file: SetFileName,
  direction: z.string().nullable(),
  /** The angle or mechanism this variant takes (e.g. "understatement"); two variants with one label are flagged. */
  label: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});

/** Free text for the brief: line endings folded, trimmed, then bounded; control characters (other than tab and newline) are refused. */
const BriefText = (max: number) => z.string()
  .transform(s => s.replace(/\r\n?/g, '\n').trim())
  .pipe(z.string().min(1).max(max).refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s), 'no control characters'));

/** Who speaks and where the line lands, so a rewrite is judged with its brief in view. Not a taste signal. */
export const BriefSchema = z.strictObject({
  /** Personality summary (inline text). */
  character: BriefText(600).optional(),
  /** RESERVED for a later voice-bible link: parsed and shown, never written or acted on yet. */
  characterRef: z.string().regex(ID_RE).max(64).optional(),
  /** Where and how the lines are delivered. */
  context: BriefText(400).optional(),
  /** The owner confirmed this brief (ISO time). A tool cannot verify it; it is recorded and warned about. */
  confirmedAt: z.string().optional(),
}).refine(b => b.character !== undefined || b.context !== undefined || b.characterRef !== undefined, 'a brief needs a character or a context');

/** A line struck when the set was made: kept out of the rewrite (a variant that edits it is rejected by set check). */
export const ExcludedSchema = z.strictObject({
  ref: z.string().regex(/^\d+(-\d+)?$/),
  text: z.string().min(1).max(MAX_ORIGINAL_TEXT),
});
export const MAX_EXCLUDED = 200;

export const SetSchema = z.strictObject({
  schema: z.literal('prose/set@1'),
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Random at creation, so a set id reused after deletion is still a different set in the logs. */
  uid: z.string().min(8),
  createdAt: z.string(),
  form: z.string().min(1),
  format: z.enum(FORMATS),
  /** The draft the set was made from, relative to the project when inside it. */
  source: SourcePath,
  base: SetFileName,
  directions: z.array(z.string()),
  variants: z.array(VariantSchema).min(MIN_VARIANTS).max(MAX_VARIANTS),
  picked: z.number().int().optional(),
  pickedAt: z.string().optional(),
  brief: BriefSchema.optional(),
  /** The line(s) this set revises, snapshotted when the set was made. Context only: never a candidate, never scored. */
  original: OriginalSchema.optional(),
  /** Lines with a pending strike when the set was made. Variants are still full copies; these are not to be edited. */
  excluded: z.array(ExcludedSchema).min(1).max(MAX_EXCLUDED).optional(),
});

export type Variant = z.infer<typeof VariantSchema>;
export type PromptSet = z.infer<typeof SetSchema>;
export type Brief = z.infer<typeof BriefSchema>;

/** What a caller may say about a brief; `confirmed` stamps `confirmedAt` with the current time. */
export interface BriefInput { character?: string; context?: string; confirmed?: boolean }

/** The brief as `set show`, `set new` and `set brief` print it: every field present, `confirmed` a boolean. */
export const briefView = (b: Brief) => ({ character: b.character ?? null, characterRef: b.characterRef ?? null, context: b.context ?? null, confirmed: b.confirmedAt !== undefined });

/** A validated brief from the caller's words; a bad one is E_USAGE (it came from the command line, not from disk). */
function newBrief(input: BriefInput, now: Date): Brief {
  const { character, context, confirmed } = input;
  const parsed = BriefSchema.safeParse({
    ...(character !== undefined ? { character } : {}), ...(context !== undefined ? { context } : {}),
    ...(confirmed ? { confirmedAt: now.toISOString() } : {}),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.join('.');
    throw new ProseError('E_USAGE', `The brief is not usable${where ? ` (${where})` : ''}: ${issue.message}`, {
      hint: 'A brief needs a character (at most 600 characters) or a context (at most 400); both are plain text without control characters',
    });
  }
  return parsed.data;
}

export interface BriefEdit { character?: string; context?: string; clearCharacter?: boolean; clearContext?: boolean; confirmed?: boolean }

/**
 * The brief after an edit: new text clears the confirmation (the owner confirmed other words) unless `confirmed` is passed
 * again, and emptying both fields removes the brief. Text for the character drops `characterRef`, which names where the old
 * text came from. Returns undefined when nothing is left.
 */
export function editedBrief(current: Brief | undefined, edit: BriefEdit, now: Date): Brief | undefined {
  const textEdited = edit.character !== undefined || edit.context !== undefined || edit.clearCharacter || edit.clearContext;
  if (!textEdited && !edit.confirmed) throw new ProseError('E_USAGE', 'Nothing to change', { hint: 'Pass --character, --context, --clear-character, --clear-context or --confirmed' });
  if ((edit.character !== undefined && edit.clearCharacter) || (edit.context !== undefined && edit.clearContext)) {
    throw new ProseError('E_USAGE', 'A field cannot be set and cleared in one command', { hint: 'Drop --clear-character or --clear-context, or the text it contradicts' });
  }
  if (!current && !textEdited) throw new ProseError('E_USAGE', 'This set has no brief to confirm', { hint: 'Give it one: prose set brief <id> --character <text> --context <text>' });
  const characterChanged = edit.character !== undefined || edit.clearCharacter;
  const character = edit.clearCharacter ? undefined : (edit.character ?? current?.character);
  const context = edit.clearContext ? undefined : (edit.context ?? current?.context);
  const characterRef = characterChanged ? undefined : current?.characterRef;
  if (character === undefined && context === undefined && characterRef === undefined) return undefined;
  const confirmedAt = edit.confirmed ? now.toISOString() : (textEdited ? undefined : current?.confirmedAt);
  const parsed = BriefSchema.safeParse({
    ...(character !== undefined ? { character } : {}), ...(characterRef !== undefined ? { characterRef } : {}),
    ...(context !== undefined ? { context } : {}), ...(confirmedAt !== undefined ? { confirmedAt } : {}),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProseError('E_USAGE', `The brief is not usable (${issue.path.join('.') || 'brief'}): ${issue.message}`, {
      hint: 'A character is at most 600 characters and a context at most 400, as plain text without control characters',
    });
  }
  return parsed.data;
}

const setFile = (project: string, id: string) => join(setDir(project, id), 'set.json');

/**
 * `name` joined to the set directory, asserted to stay inside it (lexically, and through symlinks when the file exists).
 * Anything else is E_SCHEMA with a hint to restore set.json: the name came from a file on disk, not from the CLI.
 */
function inSet(project: string, set: PromptSet, name: string): string {
  const dir = setDir(project, set.id);
  const bad = () => new ProseError('E_SCHEMA', `Set ${set.id} names a file outside its own folder (${JSON.stringify(name.slice(0, 80))})`, {
    pointer: '/variants', hint: `Restore ${join(dir, 'set.json')} (file names must be plain names inside the set folder), or make the set again with prose set new`,
  });
  if (!SET_FILE_RE.test(name) || name.includes('..') || name.endsWith('.')) throw bad();
  const full = resolve(dir, name);
  const rel = relative(dir, full);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.includes(sep)) throw bad();
  if (existsSync(full)) {
    // A symlink inside the set that points outside it is the same escape by another route.
    const real = relative(realpathSync(dir), realpathSync(full));
    if (real === '' || real.startsWith('..') || isAbsolute(real)) throw bad();
  }
  return full;
}
export const basePath = (project: string, set: PromptSet) => inSet(project, set, set.base);
export const variantPath = (project: string, set: PromptSet, v: Variant) => inSet(project, set, v.file);

function relSource(project: string, draft: string): string {
  const rel = relative(project, resolve(draft));
  return (rel.startsWith('..') || isAbsolute(rel) ? basename(draft) : rel).split(sep).join('/');
}

export interface CreateOptions {
  directions?: string[]; count?: number; now?: Date; id?: string;
  /** The brief to record: new words, or (a refine round) another set's brief taken whole, confirmation included. */
  brief?: BriefInput | Brief;
  /** Line refs ("12", "12-13", comma list) of the draft this set revises: snapshotted as `original`. */
  lines?: string;
}

const isBrief = (b: BriefInput | Brief): b is Brief => 'confirmedAt' in b || 'characterRef' in b;

/** Copy `draft` into a new set: a base file and one identical variant file per slot for the agent to rewrite. */
export function createSet(project: string, draft: string, opts: CreateOptions = {}): PromptSet {
  const directions = assertDirections(opts.directions ?? []);
  const doc = loadDocument(draft);
  const count = opts.count ?? Math.min(MAX_VARIANTS, Math.max(DEFAULT_VARIANTS, directions.length));
  if (!Number.isInteger(count) || count < MIN_VARIANTS || count > MAX_VARIANTS) {
    throw new ProseError('E_USAGE', `--count must be a whole number from ${MIN_VARIANTS} to ${MAX_VARIANTS}`);
  }
  if (directions.length > count) {
    throw new ProseError('E_USAGE', `${directions.length} directions but only ${count} variants`, { hint: `Raise --count (at most ${MAX_VARIANTS}) or name fewer directions` });
  }
  const now = opts.now ?? new Date();
  const brief = opts.brief === undefined ? undefined : isBrief(opts.brief) ? opts.brief : newBrief(opts.brief, now);
  const id = opts.id ? validId(opts.id, 'Set id') : newId('set', opts.now);
  const dir = setDir(project, id);
  if (existsSync(dir)) throw new ProseError('E_CONFLICT', `Set ${id} already exists`);
  const ext = EXT[doc.format];
  const text = readFileSync(draft, 'utf8');
  const source = relSource(project, draft);
  const original = opts.lines === undefined ? undefined : snapshotOriginal(source, text, doc.format, doc.form, opts.lines);
  // Struck lines are not rewritten: refused as the line to revise, and recorded so a variant cannot edit them.
  const live = currentStrikes(project, source, text, draftHash(text), doc.format, doc.form).live;
  for (const l of original?.lines ?? []) {
    const [start, end] = l.ref.split('-').map(Number);
    const hit = live.find(p => p.start <= (end ?? start) && p.end >= start);
    if (hit) throw new ProseError('E_CONFLICT', `Line ${l.ref} is struck (${hit.id}, ${hit.reason}), so it cannot be the line this set revises`, { hint: `prose strike clear ${source} ${hit.id} withdraws the strike, or choose another line` });
  }
  const excluded = live.slice(0, MAX_EXCLUDED).map(p => ({ ref: p.ref, text: p.text }));
  // Build in a temp directory and rename when complete, so a failure never leaves a half-built set.
  const tmp = join(setsDir(project), `.tmp-${id}`);
  rmSync(tmp, { recursive: true, force: true });
  try {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, `base${ext}`), text);
    const variants: Variant[] = Array.from({ length: count }, (_, k) => {
      writeFileSync(join(tmp, `v${k + 1}${ext}`), text);
      return { index: k + 1, file: `v${k + 1}${ext}`, direction: directions.length ? directions[k % directions.length] : null };
    });
    const set = SetSchema.parse({
      schema: 'prose/set@1', id, uid: randomBytes(6).toString('hex'), createdAt: now.toISOString(), form: doc.form, format: doc.format,
      source: relSource(project, draft), base: `base${ext}`, directions, variants, ...(brief ? { brief } : {}), ...(original ? { original } : {}), ...(excluded.length ? { excluded } : {}),
    });
    writeFileAtomic(join(tmp, 'set.json'), JSON.stringify(set, null, 2) + '\n');
    renameSync(tmp, dir);
    return set;
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

export function readSet(project: string, id: string): PromptSet {
  const file = setFile(project, id);
  if (!existsSync(file)) throw new ProseError('E_NOT_FOUND', `No set ${id} in ${project}`, { hint: 'prose set list shows the sets' });
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { throw new ProseError('E_SCHEMA', `${file} is not valid JSON: ${(e as Error).message}`); }
  const parsed = SetSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProseError('E_SCHEMA', `${file}: ${issue.message}`, { pointer: '/' + issue.path.join('/') });
  }
  return parsed.data;
}

export function writeSet(project: string, set: PromptSet): void {
  writeFileAtomic(setFile(project, set.id), JSON.stringify(SetSchema.parse(set), null, 2) + '\n');
}

/** Every readable set, newest first, plus the sets that could not be read (corrupt or half-built). */
export function listSetsDetailed(project: string): { sets: PromptSet[]; problems: Array<{ id: string; error: string }> } {
  const root = setsDir(project);
  const sets: PromptSet[] = [];
  const problems: Array<{ id: string; error: string }> = [];
  if (existsSync(root)) {
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      try { sets.push(readSet(project, e.name)); }
      catch (err) { problems.push({ id: e.name, error: err instanceof ProseError ? err.message : String(err) }); }
    }
  }
  sets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { sets, problems };
}

/** Every readable set, newest first. */
export const listSets = (project: string): PromptSet[] => listSetsDetailed(project).sets;
