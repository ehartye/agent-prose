export type SourceProfile = 'markdown' | 'html' | 'structured';
export interface ProjectionRun { text: string; start: number; end: number; marks?: Array<'strong' | 'em'>; href?: string }
export interface ProjectionBlock { id: string; kind: string; start: number; end: number; text: string; runs: ProjectionRun[]; headingPath: string[]; level?: number; listDepth?: number; listType?: 'ordered' | 'unordered'; listStart?: number; listItem?: string }
export interface SourceMapEntry { start: number; end: number; sourceStart: number; sourceEnd: number; utf16Start: number; utf16End: number; byteStart: number; byteEnd: number; field?: string }
export interface Projection {
  schema: 'prose/projection@1'; profile: SourceProfile; documentId: string; sourceDigest: string; digest: string; text: string;
  language: string; direction?: 'ltr' | 'rtl' | 'auto';
  blocks: ProjectionBlock[]; fragments: Record<string, { start: number; end: number }>;
  diagnostics: Array<{ code: string; message: string; [key: string]: unknown }>;
  projectionVersion?: 'prose/annotation-text@1';
  adapter?: { id: string; version: string; sourceSchema?: string; inlineDialect?: string };
  barriers?: Array<{ start: number; end: number; reason: string }>;
  sourceMap?: SourceMapEntry[];
}
