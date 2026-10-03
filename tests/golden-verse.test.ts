import { describe, it } from 'vitest';
import { expect } from 'vitest';
import { join } from 'node:path';
import { ROOT, run, stable } from './helpers.ts';

const VERSE = join(ROOT, 'tests', 'fixtures', 'verse');

/** Golden outputs for the verse surface, compared the same way as golden.test.ts: any change in output fails. */
describe('verse golden outputs', () => {
  const cases: Array<[command: 'scan' | 'measure' | 'lint', file: string]> = [
    ['scan', 'sonnet18.md'],
    ['measure', 'sonnet18.md'],
    ['lint', 'sonnet-broken.md'],
    ['lint', 'sonnet-wrong-rhyme.md'],
    ['scan', 'limerick.md'],
    ['lint', 'ballad-5-line-stanza.md'],
    ['lint', 'petrarchan-clean.md'],
    ['lint', 'sestina.md'],
    ['scan', 'song-brackets.md'],
    ['lint', 'song-brackets.md'],
  ];
  for (const [command, name] of cases) {
    it(`${command} verse/${name}`, async () => {
      const out = stable(await run(command, join(VERSE, name)));
      await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot(join('golden', `verse-${name}.${command}.json`));
    });
  }
});
