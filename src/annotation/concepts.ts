import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ProseError } from '../errors.ts';
import { parseRegistry } from './schema.ts';
import { digest, identity, readData, readText, serialize } from './files.ts';
import type { ConceptRegistry } from './types.ts';

export function createConceptRegistry(file: string, options: { project?: string; language?: string } = {}): ConceptRegistry {
  const path = resolve(file);
  if (existsSync(path)) throw new ProseError('E_CONFLICT','Concept registry already exists');
  const registry: ConceptRegistry = { schema: 'prose/concepts@1', project: options.project ?? 'untitled', uid: `urn:uuid:${randomUUID()}`, language: options.language ?? 'en-US', concepts: [], lists: {} };
  mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,serialize(path,registry),{flag:'wx'}); return registry;
}
export function inspectConceptRegistry(file: string): { registry: ConceptRegistry; revision: string; problems: string[] } {
  const registry = parseRegistry(readData(file)); const problems: string[] = []; const ids = new Set<string>(); const uids = new Set<string>();
  registry.uid ??= identity('prose/concepts@1',registry.project);
  for (const concept of registry.concepts) {
    if (ids.has(concept.id)) problems.push(`Duplicate concept ${concept.id}`); ids.add(concept.id);
    concept.uid ??= identity(registry.uid,concept.id);
    if (uids.has(concept.uid)) problems.push(`Duplicate concept identity ${concept.uid}`); uids.add(concept.uid);
  }
  for (const [list,members] of Object.entries(registry.lists)) {
    if (new Set(members).size !== members.length) problems.push(`Duplicate list membership ${list}`);
    for (const member of members) if (!ids.has(member)) problems.push(`Unknown concept ${member} in ${list}`);
  }
  for (const concept of registry.concepts) for (const other of concept.related ?? []) if (!ids.has(other)) problems.push(`Unknown related concept ${other}`);
  for (const concept of registry.concepts) if(concept.replacement&&(!ids.has(concept.replacement)||concept.replacement===concept.id))problems.push(`Invalid replacement concept ${concept.replacement}`);
  return {registry,revision:digest(readText(file)),problems};
}
