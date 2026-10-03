import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { checkSet } from '../src/owner/check.ts';
import { createSet, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { BASE, PUNCHY, SHORT, WARM, WARM_DUP, tmpProject, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();

function setWith(texts: string[], directions: string[] = []) {
  const p = tmpProject();
  const set = createSet(p.project, p.write('toast.md', BASE), { id: 'demo', count: texts.length, directions });
  set.variants.forEach((v, k) => writeFileSync(variantPath(p.project, set, v), texts[k]));
  return { ...p, set };
}

describe('checkSet', () => {
  it('rejects an untouched variant and keeps real rewrites that moved as claimed', () => {
    const { project, set } = setWith([BASE, WARM, SHORT], ['shorter', 'warmer', 'shorter']);
    const r = checkSet(project, set);
    expect(r.variants[0]).toMatchObject({ index: 1, status: 'rejected', reasons: ['unchanged'] });
    expect(r.variants[1]).toMatchObject({ index: 2, status: 'ok' });
    expect(r.variants[1].movement).toMatchObject({ direction: 'warmer', moved: true });
    expect(r.variants[2].movement).toMatchObject({ direction: 'shorter', moved: true });
    expect(r.keep).toEqual([2, 3]);
    expect(r.ok).toBe(true);
  });

  it('rejects a near-duplicate of an earlier variant and names it', () => {
    const { project, set } = setWith([WARM, WARM_DUP, PUNCHY]);
    const r = checkSet(project, set);
    expect(r.variants[1]).toMatchObject({ status: 'rejected', reasons: ['duplicate-of #1'] });
    expect(r.keep).toEqual([1, 3]);
  });

  it('warns, but keeps, a variant that did not move the way it claimed', () => {
    const { project, set } = setWith([WARM, SHORT], ['longer', 'longer']);
    const r = checkSet(project, set);
    expect(r.variants[1]).toMatchObject({ status: 'ok' });
    expect(r.variants[1].warnings.some(w => w.startsWith('weak-direction'))).toBe(true);
    expect(r.variants[1].movement).toMatchObject({ direction: 'longer', moved: false });
  });

  it('rejects a variant that introduces a lint error, but not one the base already had', () => {
    const bad = `${PUNCHY.trim()} :contentReference[oaicite:1]{index=1}\n`;
    const { project, set } = setWith([WARM, bad]);
    const r = checkSet(project, set);
    expect(r.variants[1].status).toBe('rejected');
    expect(r.variants[1].reasons[0]).toMatch(/^lint-error: ai\.artifact/);
  });

  it('flags two variants that claim the same angle', () => {
    const { project, set } = setWith([WARM, SHORT, PUNCHY]);
    set.variants[0].label = 'Understatement';
    set.variants[2].label = ' understatement ';
    writeSet(project, set);
    const r = checkSet(project, readSet(project, set.id));
    expect(r.variants[2].warnings).toContain('same-angle-as #1 ("understatement")');
  });

  it('reports a variant that no longer parses, and says when too few variants are left', () => {
    const { project, set } = setWith([WARM, '---\nform: [unclosed\n']);
    const r = checkSet(project, set);
    expect(r.variants[1].status).toBe('rejected');
    expect(r.variants[1].reasons[0]).toMatch(/^parse-error:/);
    expect(r.ok).toBe(false);
    expect(r.next).toMatch(/at least 2/);
  });
});

describe('prose set check', () => {
  it('runs the check from the CLI', async () => {
    const { project, set } = setWith([BASE, WARM, PUNCHY]);
    const out = await run('set', 'check', set.id, '--dir', project);
    expect(out.keep).toEqual([2, 3]);
    expect(out.rejected).toEqual([{ index: 1, reasons: ['unchanged'] }]);
  });
});
