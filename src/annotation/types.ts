import type { Projection, SourceProfile } from './source.ts';
import type { Candidate, TargetSelector, Resolution } from './locate.ts';

export type AnnotationKind = 'highlight' | 'vocabulary' | 'concept' | 'definition' | 'explanation' | 'link';
export type ReviewState = 'draft' | 'accepted' | 'rejected' | 'deferred';
export interface Concept {
  id: string; uid?: string; label: string; aliases?: string[]; definition: string;
  sources?: string[]; definitionSource?: string; cedRef?: string; related?: string[]; retired?: boolean; replacement?: string;
  [metadata: string]: unknown;
}
export interface ConceptRegistry {
  schema: 'prose/concepts@1'; project: string; uid?: string; language?: string;
  authority?: { mode: 'external'; source: string };
  concepts: Concept[]; lists: Record<string, string[]>;
}
export type Destination = { url: string } | { document: string; target?: string; fragment?: string };
export interface Origin { type: 'supplied' | 'assistant' | 'deterministic'; agent?: string; model?: string; sources?: string[] }
export interface Annotation {
  id: string; uid: string; kind: AnnotationKind; target: TargetSelector;
  concept?: string; lists?: string[]; body?: string; destination?: Destination;
  sources?: string[]; origin?: Origin; review: { state: ReviewState; dependency?: string; snapshot?: Record<string, unknown> };
}
export interface Proposal {
  id?: string; kind: AnnotationKind; candidate?: string; target?: TargetSelector;
  concept?: string; lists?: string[]; body?: string; destination?: Destination; sources?: string[]; origin?: Origin;
}
export interface FeedbackEvent {
  id: string; at: string; annotation: string; action: string; reason?: string;
  before?: Annotation; after?: string; undoOf?: string; annotationIds?: string[]; beforeRevision: string; request: string;
}
export interface Sidecar {
  schema: 'prose/annotations@1';
  document: { id: string; handle: string; source: string; profile: SourceProfile; sourceDocument?: string; contentRoot?: string };
  root?: string; concepts?: string; references?: Record<string, string>;
  annotations: Annotation[]; targets: Array<{ id: string; target: TargetSelector }>;
  history: FeedbackEvent[];
}
export interface InspectedAnnotation extends Annotation {
  resolution: Resolution; state: ReviewState | 'stale'; dependency: string; snapshot: Record<string,unknown>; changes: string[]; problems: string[];
}
export interface Inspection {
  file: string; revision: string; sidecar: Sidecar; projection: Projection;
  concepts: ConceptRegistry | null; annotations: InspectedAnnotation[]; problems: string[];
}
export interface Decision {
  id: string; action: 'accept' | 'reject' | 'defer' | 'edit' | 'retarget' | 'undo';
  expectedRevision?: string; eventId?: string; body?: string; target?: TargetSelector; candidate?: string; reason?: string;
}
export interface MutationOptions { expectedRevision?: string; eventId?: string }
export interface PublishedAnnotation {
  id: string; handle: string; document: string; kind: AnnotationKind;
  target: { start: number; end: number; quote: string; block?: string };
  concept?: string; lists?: string[]; body?: string; destination?: Destination; sources?: string[]; origin?: Origin;
}
export interface PublishedDocument {
  id: string; handle: string; resource: string; profile: SourceProfile; sourceDigest: string; projectionDigest: string;
  projectionVersion?: string; adapter?: Projection['adapter']; language: string; direction?: 'ltr'|'rtl'|'auto';
  text: string; blocks: Projection['blocks']; fragments: Record<string, { start: number; end: number }>;
  targets: Record<string, { id: string; start: number; end: number; quote: string }>;
}
export interface PublicationBundle {
  schema: 'prose/annotation-bundle@1'; projection: 'prose/annotation-text@1';
  documents: PublishedDocument[]; annotations: PublishedAnnotation[]; concepts: Concept[];
  lists: Record<string, string[]>; listLabels?: Record<string,string>;
}
export type { Projection, SourceProfile, Candidate, TargetSelector, Resolution };
