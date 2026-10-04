import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { recordPick } from '../src/owner/pick.ts';
import { createSet, variantPath } from '../src/owner/sets.ts';
import { run } from './helpers.ts';
import { BASE, PUNCHY, SHORT, WARM, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
useTempHome();

function readySet() {
  const p = tmpProject();
  const draft = p.write('t.md', BASE);
  const set = createSet(p.project, draft, { id: 'demo', count: 3, directions: ['shorter', 'warmer', 'shorter'] });
  [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  return { ...p, set, draft };
}

describe('set pick warns when the draft moved on', () => {
  it('says nothing while the draft is what the set was made from', () => {
    const { project, set } = readySet();
    const r = recordPick(project, set, 2, { noPredict: true });
    expect(r.warnings).toBeUndefined();
    expect(r.next).not.toMatch(/Warning/);
  });

  it('warns, in the result and the next hint, once the draft changed (an applied strike, an edit)', () => {
    const { project, set, draft } = readySet();
    writeFileSync(draft, BASE.replace('Today it carries', 'Now it carries'));
    const r = recordPick(project, set, 2, { noPredict: true });
    expect(r.warnings).toEqual([expect.stringMatching(/draft has changed since this set was made.*including any applied strikes/)]);
    expect(r.next).toMatch(/Warning: The draft has changed since this set was made/);
  });

  it('a line-ending-only change is not a change', () => {
    const { project, set, draft } = readySet();
    writeFileSync(draft, BASE.replace(/\n/g, '\r\n'));
    expect(recordPick(project, set, 2, { noPredict: true }).warnings).toBeUndefined();
  });

  it('an applied strike makes the pick warn', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', '---\nform: speech-small\n---\n\nWe built it in the rain.\n\nA second paragraph here.\n');
    const set = createSet(p.project, draft, { id: 'after', count: 3, directions: ['shorter', 'warmer', 'shorter'] });
    [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
    await run('strike', draft, '--line', '7', '--reason', 'wrong-direction');
    const dry = await run('strike', 'apply', draft);
    await run('strike', 'apply', draft, '--confirm', dry.digest);
    expect(recordPick(p.project, set, 2, { noPredict: true }).warnings).toHaveLength(1);
  });
});
