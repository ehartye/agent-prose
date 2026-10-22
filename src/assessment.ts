import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ProseError } from './errors.ts';
import { writeFileAtomic } from './owner/fsutil.ts';

/** Editorial anchors, not a numerical grade-placement scale. */
export const ASSESSMENT_CRITERIA = [
  { id: 'vocabulary', label: 'Vocabulary and terms' },
  { id: 'syntax', label: 'Syntax and referents' },
  { id: 'organization', label: 'Organization and coherence' },
  { id: 'knowledge', label: 'Assumed knowledge' },
  { id: 'reasoning', label: 'Meaning and reasoning' },
  { id: 'task', label: 'Task and voice fit' },
] as const;
export const ASSESSMENT_SUPPORT = {
  ready: { label: 'Ready', anchor: 'No material access barrier identified for this reader and task.' },
  light: { label: 'Light support', anchor: 'A localized obstacle needs a brief gloss, cue, local edit or prompt without changing the task.' },
  substantial: { label: 'Substantial support', anchor: 'Recurring or connected obstacles require explicit explanation, coordinated edits or planned instruction.' },
  major: { label: 'Major barrier', anchor: 'Missing prerequisites, inaccessible essential material or a mismatch prevents the task without groundwork or redesign.' },
  'not-assessed': { label: 'Not assessed', anchor: 'Missing material or context prevents this criterion from being judged. This is not a low score.' },
} as const;
export const ASSESSMENT_RECOMMENDATIONS = {
  ready: 'Ready for the stated use', supported: 'Suitable with named supports', revise: 'Revise before use',
  'insufficient-context': 'Insufficient context',
} as const;
export const MAX_ASSESSMENT_BYTES = 4 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const text = (max = 6000) => z.string().min(1).max(max).refine(value => value.trim().length > 0, 'Text cannot be blank');
const Criterion = z.enum(['vocabulary', 'syntax', 'organization', 'knowledge', 'reasoning', 'task']);
const Rating = z.enum(['ready', 'light', 'substantial', 'major', 'not-assessed']);
const Reader = z.strictObject({
  language: z.literal('en-US'), schoolGrade: z.number().int().min(4).max(12), profile: text(1000),
  priorKnowledge: text(), task: text(), supports: z.array(text()).max(30),
});
const Row = z.strictObject({
  criterion: Criterion, rating: Rating, evidence: z.array(text(3000)).max(10), reason: text(), action: text(),
}).refine(row => row.rating === 'not-assessed' || row.evidence.length > 0, 'Assessed criteria need passage evidence');
const Proposal = z.strictObject({
  kind: z.enum(['text-edit', 'support', 'content-request']), criterion: Criterion.optional(),
  location: text(1000), description: text(), before: text(12000).optional(), after: text(12000).optional(),
}).refine(p => (p.before === undefined) === (p.after === undefined), 'Before and after text must be supplied together')
  .refine(p => p.kind !== 'text-edit' || p.before !== undefined, 'A text edit needs before and after text');
const Report = z.strictObject({
  origin: z.enum(['agent', 'provided']), recommendation: z.enum(['ready', 'supported', 'revise', 'insufficient-context']),
  summary: text(), criteria: z.array(Row).length(6).refine(rows => new Set(rows.map(r => r.criterion)).size === 6, 'Use each criterion once'),
  proposals: z.array(Proposal).max(30), checks: z.array(text()).max(30), limits: z.array(text()).min(1).max(30),
});
const Passage = z.strictObject({ id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/), title: text(200), text: text(1_000_000), report: Report.nullable() });
const Input = z.strictObject({ schema: z.literal('prose/assessment-input@1'), title: text(200), reader: Reader, passages: z.array(Passage).min(1).max(50) });
const Batch = Input.omit({ schema: true, passages: true }).extend({
  schema: z.literal('prose/assessment-batch@1'), id: z.string().regex(UUID), createdAt: z.iso.datetime(),
  passages: z.array(Passage.extend({ sourceHash: z.string().regex(/^[a-f0-9]{64}$/) })).min(1).max(50),
});
export type AssessmentInput = z.infer<typeof Input>;
export type AssessmentBatch = z.infer<typeof Batch>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function validateBindings(input: AssessmentInput | AssessmentBatch): void {
  if (new Set(input.passages.map(p => p.id)).size !== input.passages.length) throw new ProseError('E_SCHEMA', 'Passage ids must be unique within a batch');
  for (const passage of input.passages) {
    for (const row of passage.report?.criteria ?? []) for (const quote of row.evidence) {
      if (!passage.text.includes(quote)) throw new ProseError('E_SCHEMA', `Evidence must quote the assessed passage exactly (${passage.id}, ${row.criterion})`);
    }
    for (const proposal of passage.report?.proposals ?? []) {
      if (proposal.before !== undefined && !passage.text.includes(proposal.before)) throw new ProseError('E_SCHEMA', `Proposed before-text must occur in the assessed passage (${passage.id})`);
    }
    if ('sourceHash' in passage && passage.sourceHash !== hash(passage.text)) throw new ProseError('E_SCHEMA', 'A stored passage no longer matches its source snapshot hash');
  }
}
function parse<T>(raw: string, schema: z.ZodType<T>): T {
  if (Buffer.byteLength(raw) > MAX_ASSESSMENT_BYTES) throw new ProseError('E_SCHEMA', 'Assessment JSON exceeds the 4 MiB limit');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new ProseError('E_SCHEMA', 'Assessment input must be valid UTF-8 JSON'); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProseError('E_SCHEMA', `Invalid assessment: ${issue.message}`, { pointer: '/' + issue.path.join('/') });
  }
  return parsed.data;
}
function rootOf(project: string): string {
  try { const root = realpathSync(project); if (statSync(root).isDirectory()) return root; } catch { /* stable error below */ }
  throw new ProseError('E_PROJECT', 'The assessment project directory is unavailable');
}
function directory(root: string, create = false): string {
  let cursor = root;
  for (const part of ['.agent-prose', 'assessments']) {
    cursor = join(cursor, part);
    try {
      const info = lstatSync(cursor);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new ProseError('E_USAGE', 'Assessment state directories must be real project directories');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (create) mkdirSync(cursor);
    }
  }
  return cursor;
}
function fileFor(project: string, id: string): string {
  if (!UUID.test(id)) throw new ProseError('E_USAGE', 'Assessment id must be a UUID');
  const file = join(directory(rootOf(project)), id + '.json');
  try {
    const info = lstatSync(file);
    if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) throw new ProseError('E_USAGE', 'Assessment snapshots cannot be symbolic links or hardlink aliases');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return file;
}
function readBounded(file: string): string {
  try {
    const info = statSync(file);
    if (!info.isFile()) throw new Error('not a file');
    if (info.size > MAX_ASSESSMENT_BYTES) throw new ProseError('E_SCHEMA', 'Assessment JSON exceeds the 4 MiB limit');
    const bytes = readFileSync(file);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new ProseError('E_SCHEMA', 'Assessment input must be valid UTF-8 JSON'); }
  } catch (error) {
    if (error instanceof ProseError) throw error;
    throw new ProseError('E_NOT_FOUND', 'The assessment JSON file is unavailable');
  }
}
export function assessmentExists(project: string, id: string): boolean {
  try { return existsSync(fileFor(project, id)); } catch { return false; }
}
export function readAssessmentBatch(project: string, id: string) {
  const batch = parse(readBounded(fileFor(project, id)), Batch);
  if (batch.id !== id) throw new ProseError('E_SCHEMA', 'Assessment id does not match its file');
  validateBindings(batch);
  return { ...batch, counts: { passages: batch.passages.length, assessed: batch.passages.filter(p => p.report !== null).length },
    rubric: ASSESSMENT_CRITERIA, supportLevels: ASSESSMENT_SUPPORT, recommendations: ASSESSMENT_RECOMMENDATIONS };
}
/** Persist supplied judgments and exact text snapshots; this does not assess or rewrite prose. */
export function createAssessmentBatch(project: string, inputFile: string) {
  const input = parse(readBounded(inputFile), Input); validateBindings(input);
  const root = rootOf(project); directory(root, true);
  const id = randomUUID(); const file = fileFor(root, id);
  const batch: AssessmentBatch = { ...input, schema: 'prose/assessment-batch@1', id, createdAt: new Date().toISOString(),
    passages: input.passages.map(p => ({ ...p, sourceHash: hash(p.text) })) };
  const json = JSON.stringify(batch) + '\n';
  if (Buffer.byteLength(json) > MAX_ASSESSMENT_BYTES) throw new ProseError('E_SCHEMA', 'Stored assessment JSON exceeds the 4 MiB limit');
  writeFileAtomic(file, json, { mode: 0o600 });
  return readAssessmentBatch(root, id);
}
