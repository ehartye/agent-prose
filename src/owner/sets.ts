import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { loadDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import { FORMATS } from '../kinds.ts';
import { assertDirections } from './directions.ts';
import { writeFileAtomic } from './fsutil.ts';
import { newId, setDir, setsDir, validId } from './paths.ts';

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
/** The draft a set was made from: a project-relative path (folders allowed), but never absolute, never with `..`, never a NUL. */
const SourcePath = z.string().min(1).refine(
  v => !v.includes('\u0000') && !isAbsolute(v) && !/^[A-Za-z]:/.test(v) && !v.split(/[\\/]/).includes('..'),
  'must be a relative path inside the project',
);

export const VariantSchema = z.strictObject({
  index: z.number().int().min(1),
  file: SetFileName,
  direction: z.string().nullable(),
  /** The angle or mechanism this variant takes (e.g. "understatement"); two variants with one label are flagged. */
  label: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});

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
});

export type Variant = z.infer<typeof VariantSchema>;
export type PromptSet = z.infer<typeof SetSchema>;

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

export interface CreateOptions { directions?: string[]; count?: number; now?: Date; id?: string }

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
  const id = opts.id ? validId(opts.id, 'Set id') : newId('set', opts.now);
  const dir = setDir(project, id);
  if (existsSync(dir)) throw new ProseError('E_CONFLICT', `Set ${id} already exists`);
  const ext = EXT[doc.format];
  const text = readFileSync(draft, 'utf8');
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
      schema: 'prose/set@1', id, uid: randomBytes(6).toString('hex'), createdAt: (opts.now ?? new Date()).toISOString(), form: doc.form, format: doc.format,
      source: relSource(project, draft), base: `base${ext}`, directions, variants,
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
