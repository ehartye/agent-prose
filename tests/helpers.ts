import { join, resolve, sep } from 'node:path';
import { buildProgram } from '../src/cli.ts';

/** Run one CLI command in-process and return the JSON value it emitted. */
export async function run(...args: string[]): Promise<any> {
  const out: unknown[] = [];
  const program = buildProgram({ emit: value => out.push(value) });
  await program.parseAsync(['node', 'prose', ...args]);
  return out[0];
}

export const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name);

export const ROOT = resolve(import.meta.dirname, '..');

/**
 * Output that reads the same on every machine: paths under the repo become repo-relative with forward slashes, and
 * voices.project (an absolute path, or whatever project happens to enclose the checkout) is dropped.
 */
export function stable(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    const prefix = ROOT + sep;
    const lower = (s: string) => (process.platform === 'win32' ? s.toLowerCase() : s);
    return lower(value).startsWith(lower(prefix)) ? value.slice(prefix.length).split(sep).join('/') : value;
  }
  if (Array.isArray(value)) return value.map(v => stable(v));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([k]) => !(key === 'voices' && k === 'project'))
      .map(([k, v]) => [k, stable(v, k)]));
  }
  return value;
}
