import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, run, stable } from './helpers.ts';

const FIXTURES = join(ROOT, 'tests', 'fixtures');

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
