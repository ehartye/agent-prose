import { join } from 'node:path';
import { buildProgram } from '../src/cli.ts';

/** Run one CLI command in-process and return the JSON value it emitted. */
export async function run(...args: string[]): Promise<any> {
  const out: unknown[] = [];
  const program = buildProgram({ emit: value => out.push(value) });
  await program.parseAsync(['node', 'prose', ...args]);
  return out[0];
}

export const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name);
