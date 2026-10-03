import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { BASE, tmpProject, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };

describe('prose set new', () => {
  it('scaffolds a set next to the project of the draft and says what to do next', async () => {
    const p = tmpProject();
    const draft = p.write('talks/toast.md', BASE);
    const out = await run('set', 'new', draft, '--directions', 'shorter,warmer', '--count', '3', '--id', 'demo');
    expect(out).toMatchObject({ set: 'demo', form: 'speech-small', base: 'base.md' });
    expect(out.variants).toEqual([
      { index: 1, file: 'v1.md', direction: 'shorter' }, { index: 2, file: 'v2.md', direction: 'warmer' }, { index: 3, file: 'v3.md', direction: 'shorter' },
    ]);
    expect(out.dir).toBe(join(p.project, '.agent-prose', 'sets', 'demo'));
    expect(out.next).toMatch(/prose set check demo/);
  });

  it('needs a project and names the unknown direction', async () => {
    const p = tmpProject();
    expect((await fail('set', 'new', p.write('t.md', BASE), '--directions', 'spicier')).code).toBe('E_USAGE');
  });
});

describe('prose set list, show, annotate', () => {
  it('lists sets, shows variant text, and records a label and note', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    await run('set', 'new', draft, '--id', 'one');
    const list = await run('set', 'list', '--dir', p.project);
    expect(list.sets).toEqual([expect.objectContaining({ id: 'one', form: 'speech-small', variants: 3, picked: null })]);

    const shown = await run('set', 'show', 'one', '--dir', p.project);
    expect(shown.variants).toHaveLength(3);
    expect(shown.variants[0]).toMatchObject({ index: 1, text: BASE, direction: null });
    expect(shown.prediction).toBe(false);

    const noted = await run('set', 'annotate', 'one', '2', '--label', 'understatement', '--note', 'dry', '--dir', p.project);
    expect(noted.variant).toMatchObject({ index: 2, label: 'understatement', note: 'dry' });
    expect((await run('set', 'show', 'one', '--dir', p.project)).variants[1].label).toBe('understatement');
  });

  it('annotate needs something to change and an existing variant', async () => {
    const p = tmpProject();
    await run('set', 'new', p.write('t.md', BASE), '--id', 'one');
    expect((await fail('set', 'annotate', 'one', '1', '--dir', p.project)).code).toBe('E_USAGE');
    expect((await fail('set', 'annotate', 'one', '9', '--label', 'x', '--dir', p.project)).code).toBe('E_USAGE');
    expect((await fail('set', 'show', 'nope', '--dir', p.project)).code).toBe('E_NOT_FOUND');
  });
});
