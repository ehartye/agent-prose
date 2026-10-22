import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ProseError } from './errors.ts';
import { withDirLockAsync, writeFileAtomic } from './owner/fsutil.ts';

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
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Disposition = z.enum(['pending', 'accepted', 'rejected', 'deferred']);
export const AssessmentDispositionSchema = z.strictObject({
  passage: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/), suggestion: Hash, status: Disposition,
  note: z.string().max(4000).optional(), expectedRevision: Hash,
});
const Decision = AssessmentDispositionSchema.omit({ expectedRevision: true }).extend({ note: z.string().max(4000), at: z.iso.datetime() });
const Review = z.strictObject({ schema: z.literal('prose/assessment-review@1'), id: z.string().regex(UUID), snapshotHash: Hash, decisions: z.array(Decision).max(1500) });
type ReviewState = z.infer<typeof Review>;
type DecisionStatus = z.infer<typeof Disposition>;
const emptyCounts = () => ({ total: 0, pending: 0, accepted: 0, rejected: 0, deferred: 0 });
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
function fileFor(project: string, id: string, review = false): string {
  if (!UUID.test(id)) throw new ProseError('E_USAGE', 'Assessment id must be a UUID');
  const file = join(directory(rootOf(project)), id + (review ? '.review.json' : '.json'));
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
function loadAssessment(project: string, id: string) {
  const raw = readBounded(fileFor(project, id)), batch = parse(raw, Batch), snapshotHash = hash(raw);
  if (batch.id !== id) throw new ProseError('E_SCHEMA', 'Assessment id does not match its file');
  validateBindings(batch);
  const reviewFile = fileFor(project, id, true);
  const hasReview = existsSync(reviewFile), reviewRaw = hasReview ? readBounded(reviewFile) : '';
  const review: ReviewState = hasReview ? parse(reviewRaw, Review) : { schema: 'prose/assessment-review@1', id, snapshotHash, decisions: [] };
  if (review.id !== id || review.snapshotHash !== snapshotHash) throw new ProseError('E_CONFLICT', 'The assessment snapshot changed after decisions were recorded', { hint: 'Create a fresh batch for changed passages or reports' });
  const known = new Set<string>(), decisions = new Map<string, z.infer<typeof Decision>>();
  for (const d of review.decisions) {
    const key = d.passage + '/' + d.suggestion;
    if (decisions.has(key)) throw new ProseError('E_SCHEMA', 'Assessment review contains duplicate decisions');
    decisions.set(key, d);
  }
  const reviewCounts = emptyCounts();
  const passages = batch.passages.map(p => {
    const counts = emptyCounts();
    const proposals = p.report?.proposals.map((proposal, index) => {
      const proposalId = hash(JSON.stringify([batch.id, p.id, index, proposal])), key = p.id + '/' + proposalId;
      known.add(key);
      const saved = decisions.get(key);
      const decision = { status: saved?.status ?? 'pending' as DecisionStatus, note: saved?.note ?? '', at: saved?.at ?? null };
      counts.total++; counts[decision.status]++; reviewCounts.total++; reviewCounts[decision.status]++;
      return { ...proposal, id: proposalId, decision };
    });
    return { ...p, report: p.report ? { ...p.report, proposals: proposals! } : null, reviewCounts: counts };
  });
  for (const key of decisions.keys()) if (!known.has(key)) throw new ProseError('E_SCHEMA', 'Assessment review references an unknown passage suggestion');
  const state = { ...batch, passages, revision: hash(JSON.stringify([snapshotHash, hash(reviewRaw)])), reviewCounts,
    counts: { passages: batch.passages.length, assessed: batch.passages.filter(p => p.report !== null).length },
    rubric: ASSESSMENT_CRITERIA, supportLevels: ASSESSMENT_SUPPORT, recommendations: ASSESSMENT_RECOMMENDATIONS };
  return { state, review, reviewFile };
}
export function readAssessmentBatch(project: string, id: string) { return loadAssessment(project, id).state; }
/** Record review intent without rewriting source passages, reports or proposal wording. */
export async function dispositionAssessment(project: string, id: string, input: unknown) {
  const parsed = AssessmentDispositionSchema.safeParse(input);
  if (!parsed.success) throw new ProseError('E_SCHEMA', 'Supply a passage, suggestion id, current expectedRevision, valid disposition and optional note of at most 4000 characters');
  const change = parsed.data, root = rootOf(project); fileFor(root, id);
  return withDirLockAsync(directory(root), { noun: 'assessment review', id, project: root }, () => {
    const loaded = loadAssessment(root, id), state = loaded.state;
    if (change.expectedRevision !== state.revision) throw new ProseError('E_CONFLICT', 'This assessment review changed elsewhere', { hint: 'Reload saved decisions, review the current state and retry explicitly' });
    const proposal = state.passages.find(p => p.id === change.passage)?.report?.proposals.find(p => p.id === change.suggestion);
    if (!proposal) throw new ProseError('E_NOT_FOUND', 'No such suggestion in the named passage');
    const note = change.note ?? proposal.decision.note;
    if (proposal.decision.status === change.status && proposal.decision.note === note) return state;
    const decision = { passage: change.passage, suggestion: change.suggestion, status: change.status, note, at: new Date().toISOString() };
    const next: ReviewState = { ...loaded.review, decisions: [...loaded.review.decisions.filter(d => d.passage !== change.passage || d.suggestion !== change.suggestion), decision] };
    const json = JSON.stringify(next) + '\n';
    if (Buffer.byteLength(json) > MAX_ASSESSMENT_BYTES) throw new ProseError('E_SCHEMA', 'Assessment review exceeds the 4 MiB limit');
    writeFileAtomic(loaded.reviewFile, json, { mode: 0o600 });
    return readAssessmentBatch(root, id);
  });
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
