import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parse, stringify } from 'yaml';
import { ProseError } from '../errors.ts';

export const digest = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
export function stable(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b, 'en')).map(([k,v]) => JSON.stringify(k)+':'+stable(v)).join(',') + '}';
}
/** Deterministic UUIDv8 for an authored handle within a persistent namespace. */
export function identity(namespace: string, handle: string): string {
  const raw = digest(namespace + '\0' + handle).slice(0,32).split(''); raw[12] = '8'; raw[16] = ((parseInt(raw[16],16)&3)|8).toString(16);
  const hex = raw.join(''); return `urn:uuid:${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function readText(file: string): string {
  try { return readFileSync(file, 'utf8'); }
  catch (e) { throw new ProseError('E_NOT_FOUND', `Cannot read ${file}`, { details: { cause: (e as NodeJS.ErrnoException).code } }); }
}
export function readData(file: string): unknown {
  try { return parse(readText(file), { maxAliasCount: 0 }); }
  catch (e) { if (e instanceof ProseError) throw e; throw new ProseError('E_PARSE', `Cannot parse ${file}: ${(e as Error).message}`); }
}
export function serialize(file: string, value: unknown): string { return file.toLowerCase().endsWith('.json') ? JSON.stringify(value,null,2)+'\n' : stringify(value,{aliasDuplicateObjects:false}); }
function inside(root: string, file: string): boolean { const rel = relative(root,file); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..'+sep); }
export function contained(root: string, reference: string): string {
  if (isAbsolute(reference)) throw new ProseError('E_SCHEMA', 'Content references must be root-relative');
  const file = resolve(root,reference);
  if (!inside(resolve(root),file) || existsSync(file) && !inside(realpathSync(root),realpathSync(file))) throw new ProseError('E_SCHEMA', 'Content reference escapes its declared root');
  return file;
}
export function relativeReference(root: string, file: string): string {
  const rel = relative(resolve(root),resolve(file)).split(sep).join('/'); contained(root,rel); return rel;
}
export function safeUrl(value: string): boolean { try { return ['http:','https:'].includes(new URL(value).protocol); } catch { return false; } }
export const portableSources = (sources?: string[]): string[] => (sources ?? []).filter(safeUrl);
export const privateReference = (value: string): boolean => /^(?:[a-z]:[\\/]|[\\/]|file:|\.{1,2}[\\/])|(?:^|[\\/])(?:Users|home|private|tmp|raw|clippings)(?:[\\/]|$)|\.(?:md|json|ya?ml|[cm]?[jt]s|html?)$/i.test(value);
export const publicIdentity = (value: string): boolean => /^urn:uuid:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)||safeUrl(value);
