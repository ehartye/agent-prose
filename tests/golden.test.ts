import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { run } from './helpers.ts';

const ROOT = resolve(import.meta.dirname, '..');
const FIXTURES = join(ROOT, 'tests', 'fixtures');

/**
 * Output that reads the same on every machine: paths under the repo become repo-relative with forward slashes, and
 * voices.project (an absolute path, or whatever project happens to enclose the checkout) is dropped.
 */
function stable(value: unknown, key?: string): unknown {
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

const fixtures = readdirSync(FIXTURES).filter(f => /\.(?:md|fountain|dialog\.yaml)$/.test(f)).sort();

describe('golden outputs', () => {
  it('normalizes absolute paths and drops the enclosing project', () => {
    expect(stable({ path: join(ROOT, 'tests', 'fixtures', 'a.md'), voices: { project: ROOT, matches: {} } }))
      .toEqual({ path: 'tests/fixtures/a.md', voices: { matches: {} } });
  });

  for (const name of fixtures) {
    for (const command of ['parse', 'measure', 'lint'] as const) {
      it(`${command} ${name}`, async () => {
        const out = stable(await run(command, join(FIXTURES, name)));
        await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot(join('golden', `${name}.${command}.json`));
      });
    }
  }
});
