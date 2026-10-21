import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { parseDocument } from './document.ts';
import { ProseError } from './errors.ts';
import type { Block } from './ir.ts';
import { measureReadability, type ReadabilityReport } from './measure/readability.ts';
import { withDirLockAsync, writeFileAtomic } from './owner/fsutil.ts';
import { readReader, type Reader } from './reader.ts';
import { words } from './text.ts';

export interface ComparisonDocument {
  id: string; path: string; label: string; body: string; hash: string;
  reader: Reader | null; readability: ReadabilityReport | null; blocks: Block[]; words: number;
}
export interface ComparisonState {
  id: string; title: string; revision: string; sourceChanged: boolean;
  source: ComparisonDocument; variants: ComparisonDocument[];
  choice: { variant: string; hash: string; at: string } | null; choiceCurrent: boolean;
}
/** Match the reading server's bounded edit payload for direct CLI/store edits too. */
const MAX_EDIT_BYTES = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const ManifestSchema = z.strictObject({
  schema: z.literal('prose/comparison@1'), id: z.string().regex(UUID), title: z.string().min(1).max(200),
  source: z.string().min(1), sourceHash: Hash, variants: z.array(z.string().min(1)).min(1).max(3),
  choice: z.strictObject({ variant: z.enum(['1', '2', '3']), hash: Hash, at: z.iso.datetime() }).nullable(),
});
type Manifest = z.infer<typeof ManifestSchema>;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const equalPath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

function rootOf(project: string): string {
  try { const root = realpathSync(project); if (statSync(root).isDirectory()) return root; } catch { /* stable error below */ }
  throw new ProseError('E_PROJECT', 'The comparison project directory is unavailable');
}

/** Every stored path is rooted here, and no symbolic link is followed (including state directories). */
function contained(root: string, input: string): string {
  if (!input || input.includes('\0') || input.split(/[\\/]/).includes('..')) throw new ProseError('E_USAGE', 'Comparison paths must stay inside the project without parent traversal');
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel)) throw new ProseError('E_USAGE', 'Comparison paths must stay inside the project');
  let cursor = root;
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw new ProseError('E_USAGE', 'Comparison paths cannot contain symbolic links');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return absolute;
}
function comparisonDirectory(root: string, create = false): string {
  const dir = contained(root, join('.agent-prose', 'comparisons'));
  if (create) mkdirSync(dir, { recursive: true });
  return dir;
}
export function comparisonFile(project: string, id: string): string {
  if (!UUID.test(id)) throw new ProseError('E_USAGE', 'Comparison id must be a UUID');
  const root = rootOf(project);
  return contained(root, join('.agent-prose', 'comparisons', id + '.json'));
}
export function comparisonExists(project: string, id: string): boolean {
  try { return existsSync(comparisonFile(project, id)); } catch { return false; }
}

/** Keep the original BOM and frontmatter bytes; expose only the body to the editor. */
function bodyParts(raw: string): { prefix: string; body: string; eol: string } {
  const eol = raw.match(/\r\n|\r|\n/)?.[0] ?? '\n';
  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  const text = raw.slice(bom.length);
  const lines = [...text.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)];
  if (lines[0]?.[0].trim() !== '---') return { prefix: bom, body: text, eol };
  const closing = lines.find((line, index) => index > 0 && line[0].trim() === '---');
  if (!closing) throw new ProseError('E_PARSE', 'Frontmatter opened on line 1 is never closed with ---');
  const end = closing.index + closing[0].length;
  return { prefix: bom + text.slice(0, end), body: text.slice(end), eol };
}
interface LoadedDocument { document: ComparisonDocument; absolute: string; raw: string; prefix: string; eol: string; meta: Record<string, unknown>; identity: string }
function loadDocument(root: string, path: string, id: string): LoadedDocument {
  const absolute = contained(root, path);
  if (extname(absolute).toLowerCase() !== '.md') throw new ProseError('E_USAGE', 'Comparison documents must be Markdown .md files');
  let raw: string; let identity: string; let rawHash: string;
  try {
    // Windows file ids can exceed Number.MAX_SAFE_INTEGER; compare exact inode values for hard-link aliases.
    const stat = statSync(absolute, { bigint: true });
    if (!stat.isFile()) throw new Error('not a file');
    const bytes = readFileSync(absolute); rawHash = hash(bytes); raw = bytes.toString('utf8'); identity = `${stat.dev}:${stat.ino}`;
  } catch { throw new ProseError('E_NOT_FOUND', 'A comparison document is unavailable', { hint: 'Restore the supplied source and adaptation files' }); }
  const parsed = parseDocument(absolute, raw); const reader = readReader(parsed.meta); const parts = bodyParts(raw);
  const range = reader?.readingLevel?.range;
  const label = range ? range[0] === range[1] ? `Grade ${range[0]}` : `Grades ${range[0]}–${range[1]}`
    : reader?.schoolGrade ? `Grade ${reader.schoolGrade}` : basename(absolute, extname(absolute));
  const document: ComparisonDocument = {
    id, path: relative(root, absolute).split(sep).join('/'), label, body: parts.body, hash: rawHash, reader,
    readability: measureReadability(parsed), blocks: parsed.blocks, words: parsed.blocks.reduce((sum, block) => sum + words(block.text).length, 0),
  };
  return { document, absolute, raw, prefix: parts.prefix, eol: parts.eol, meta: parsed.meta, identity };
}
function distinct(documents: LoadedDocument[]): void {
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    if (equalPath(documents[i].absolute, documents[j].absolute) || documents[i].identity === documents[j].identity) throw new ProseError('E_USAGE', 'The source and every adaptation must be distinct files');
  }
}
interface Loaded { root: string; file: string; manifest: Manifest; documents: LoadedDocument[]; state: ComparisonState }
function load(project: string, id: string): Loaded {
  const root = rootOf(project); const file = comparisonFile(root, id);
  let raw: string;
  try { raw = readFileSync(file, 'utf8'); } catch { throw new ProseError('E_NOT_FOUND', 'No such reading comparison'); }
  let manifest: Manifest;
  try { manifest = ManifestSchema.parse(JSON.parse(raw)); } catch { throw new ProseError('E_SCHEMA', 'The comparison manifest is invalid'); }
  if (manifest.id !== id) throw new ProseError('E_SCHEMA', 'Comparison manifest id does not match its file');
  // Manifests only hold project-relative paths, including when their caller supplied absolute paths at creation.
  if ([manifest.source, ...manifest.variants].some(path => isAbsolute(path))) throw new ProseError('E_SCHEMA', 'Comparison manifest paths must be project-relative');
  const documents = [loadDocument(root, manifest.source, 'source'), ...manifest.variants.map((path, index) => loadDocument(root, path, String(index + 1)))];
  distinct(documents);
  if (manifest.choice && !documents.slice(1).some(d => d.document.id === manifest.choice!.variant)) throw new ProseError('E_SCHEMA', 'The chosen comparison adaptation does not exist');
  const [source, ...variants] = documents.map(d => d.document);
  const sourceChanged = source.hash !== manifest.sourceHash;
  const revision = hash(JSON.stringify([hash(raw), ...documents.map(d => d.document.hash)]));
  const choiceCurrent = !!manifest.choice && !sourceChanged && variants.some(v => v.id === manifest.choice!.variant && v.hash === manifest.choice!.hash);
  return { root, file, manifest, documents, state: { id, title: manifest.title, revision, sourceChanged, source, variants, choice: manifest.choice, choiceCurrent } };
}

/** Register supplied files. No adaptation is generated and no source file is written. */
export function createComparison(project: string, source: string, variants: string[], opts: { title?: string } = {}): ComparisonState {
  if (variants.length < 1 || variants.length > 3) throw new ProseError('E_USAGE', 'A comparison needs one to three adaptation files');
  const root = rootOf(project); const documents = [loadDocument(root, source, 'source'), ...variants.map((path, index) => loadDocument(root, path, String(index + 1)))];
  distinct(documents);
  const title = opts.title?.trim() ?? `${documents[0].document.label}: reading levels`;
  if (!title || title.length > 200) throw new ProseError('E_USAGE', 'Comparison title must contain 1 to 200 characters');
  comparisonDirectory(root, true);
  const id = randomUUID(); const file = comparisonFile(root, id);
  const manifest: Manifest = { schema: 'prose/comparison@1', id, title, source: documents[0].document.path, sourceHash: documents[0].document.hash, variants: documents.slice(1).map(d => d.document.path), choice: null };
  writeFileAtomic(file, JSON.stringify(manifest, null, 2) + '\n');
  return readComparison(root, id);
}
export function readComparison(project: string, id: string): ComparisonState { return load(project, id).state; }

async function mutate(project: string, id: string, variant: string, expectedRevision: string, change: (loaded: Loaded, document: LoadedDocument) => void): Promise<ComparisonState> {
  const root = rootOf(project); comparisonFile(root, id);
  if (!/^[1-3]$/.test(variant) || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new ProseError('E_USAGE', 'Name an adaptation 1–3 and the current comparison revision');
  return withDirLockAsync(comparisonDirectory(root), { noun: 'comparison', id, project: root }, () => {
    const loaded = load(root, id);
    if (loaded.state.sourceChanged) throw new ProseError('E_CONFLICT', 'The source changed after this comparison was created', { hint: 'Create a fresh comparison against the current source' });
    if (loaded.state.revision !== expectedRevision) throw new ProseError('E_CONFLICT', 'This comparison changed elsewhere', { hint: 'Reload the comparison and review the current text before saving or choosing' });
    const document = loaded.documents.find(d => d.document.id === variant);
    if (!document) throw new ProseError('E_NOT_FOUND', 'No such comparison adaptation');
    change(loaded, document);
    return readComparison(root, id);
  });
}
export async function editComparison(project: string, id: string, variant: string, body: string, expectedRevision: string): Promise<ComparisonState> {
  if (typeof body !== 'string') throw new ProseError('E_USAGE', 'The adaptation body must be text');
  if (Buffer.byteLength(body, 'utf8') > MAX_EDIT_BYTES) throw new ProseError('E_USAGE', 'An adaptation edit must not exceed 1 MiB of UTF-8 text');
  return mutate(project, id, variant, expectedRevision, (loaded, document) => {
    const normalizedBody = body.replace(/\r\n?|\n/g, document.eol);
    const separator = document.prefix && !/[\r\n]$/.test(document.prefix) && document.prefix !== '\uFEFF' && normalizedBody ? document.eol : '';
    const text = document.prefix + separator + normalizedBody;
    const parsed = parseDocument(document.absolute, text);
    if (JSON.stringify(parsed.meta) !== JSON.stringify(document.meta)) throw new ProseError('E_SCHEMA', 'Body editing cannot add or change document frontmatter', { hint: 'Change reader metadata in the Markdown file, then reload the comparison' });
    writeFileAtomic(document.absolute, text);
  });
}
export async function chooseComparison(project: string, id: string, variant: string, expectedRevision: string): Promise<ComparisonState> {
  return mutate(project, id, variant, expectedRevision, (loaded, document) => {
    const next: Manifest = { ...loaded.manifest, choice: { variant: variant as '1' | '2' | '3', hash: document.document.hash, at: new Date().toISOString() } };
    writeFileAtomic(loaded.file, JSON.stringify(next, null, 2) + '\n');
  });
}
