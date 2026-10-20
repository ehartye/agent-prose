import { z } from 'zod';
import type { Annotation, ConceptRegistry, Proposal, Sidecar } from './types.ts';
import { ProseError } from '../errors.ts';
import { identity, privateReference, publicIdentity } from './files.ts';

const id = z.string().trim().min(1).max(256).refine(v=>!privateReference(v),'Identities and handles cannot be filesystem paths');
const publicId=z.string().refine(publicIdentity,'Use a UUID URN or publisher HTTP(S) IRI');
const strings = z.array(z.string());
const kinds = z.enum(['highlight', 'vocabulary', 'concept', 'definition', 'explanation', 'link']);
const range = z.number().int().nonnegative();
export const targetSchema = z.object({
  quote: z.string().min(1).optional(), prefix: z.string().optional(), suffix: z.string().optional(),
  fragment: id.optional(), block: id.optional(), blocks: z.array(id).min(1).optional(), start: range.optional(), end: range.optional(),
  binding: z.object({ sourceDigest: z.string(), projectionDigest: z.string() }).strict().optional(),
}).strict().refine(v => !!(v.quote || v.fragment || v.block || v.start !== undefined && v.end !== undefined), 'A target needs a quote, fragment, block or complete range');
const destination = z.union([
  z.object({ url: z.string().min(1) }).strict(),
  z.object({ document: id, target: id.optional(), fragment: id.optional() }).strict().refine(v=>!(v.target&&v.fragment),'Supply a target or fragment, not both'),
]);
const origin = z.object({ type: z.enum(['supplied', 'assistant', 'deterministic']), agent: z.string().optional(), model: z.string().optional(), sources: strings.optional() }).strict();
const fields = { kind: kinds, concept: id.optional(), lists: strings.optional(), body: z.string().min(1).optional(), destination: destination.optional(), sources: strings.optional(), origin: origin.optional() };
export const annotationSchema = z.object({ id, uid: publicId.optional(), target: targetSchema, ...fields, review: z.object({ state: z.enum(['draft', 'accepted', 'rejected', 'deferred']), dependency: z.string().optional(), snapshot: z.record(z.string(),z.unknown()).optional() }).strict().default({state:'draft'}) }).strict();
export const proposalSchema = z.object({ id: id.optional(), candidate: z.string().optional(), target: targetSchema.optional(), ...fields }).strict().refine(v => !!v.candidate !== !!v.target, 'Supply exactly one candidate ID or target');
const concept = z.object({ id, uid: publicId.optional(), label: z.string().min(1), aliases: strings.optional(), definition: z.string().min(1), sources: strings.optional(), definitionSource: z.string().optional(), cedRef: z.string().optional(), related: strings.optional(), retired: z.boolean().optional(), replacement: id.optional() }).passthrough();
const registry = z.object({ schema: z.literal('prose/concepts@1'), project: id, uid: publicId.optional(), language: z.string().optional(), authority: z.object({ mode: z.literal('external'), source: z.string().min(1) }).strict().optional(), concepts: z.array(concept), lists: z.record(z.string(), strings).default({}) }).strict();
const history = z.object({ id, at: z.string(), annotation: z.string(), action: z.string(), reason: z.string().optional(), before: annotationSchema.optional(), after: z.string().optional(), undoOf: z.string().optional(), annotationIds: strings.optional(), beforeRevision: z.string(), request: z.string() }).strict();
const sidecar = z.object({
  schema: z.literal('prose/annotations@1'),
  document: z.object({ id:publicId, handle: id, source: z.string().min(1), profile: z.enum(['markdown', 'html', 'structured']), sourceDocument: id.optional(), contentRoot: z.string().optional() }).strict(),
  root: z.string().optional(), concepts: z.string().optional(), references: z.record(z.string(), z.string()).optional(),
  annotations: z.array(annotationSchema).default([]), targets: z.array(z.object({ id, target: targetSchema }).strict()).default([]), history: z.array(history).default([]),
}).strict();

export function checked<T>(schema: z.ZodType, value: unknown, noun: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ProseError('E_SCHEMA', `Invalid ${noun}`, { details: { problems: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) } });
  return result.data as T;
}
export const parseSidecar = (value: unknown): Sidecar => {
  const result = checked<Sidecar>(sidecar, value, 'annotation sidecar');
  for (const annotation of result.annotations) annotation.uid ??= identity(result.document.id, annotation.id);
  return result;
};
export const parseRegistry = (value: unknown): ConceptRegistry => checked<ConceptRegistry>(registry, value, 'concept registry');
export const parseProposal = (value: unknown): Proposal => checked<Proposal>(proposalSchema, value, 'annotation proposal');
export const parseAnnotation = (value: unknown): Annotation => checked<Annotation>(annotationSchema, value, 'annotation');
