import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { basePath, createSet, listSets, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { setDir } from '../src/owner/paths.ts';
import { BASE, tmpProject, useTmp } from './owner-helpers.ts';

useTmp();
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

describe('createSet', () => {
  it('copies the draft into a base file and one file per variant, assigning directions round-robin', () => {
    const p = tmpProject();
    const draft = p.write('toast.md', BASE);
    const set = createSet(p.project, draft, { directions: ['punchier', 'drier'], count: 4, id: 'demo', now: new Date(Date.UTC(2026, 9, 3, 12, 0)) });
    expect(set).toMatchObject({ schema: 'prose/set@1', id: 'demo', form: 'speech-small', format: 'markdown', source: 'toast.md', base: 'base.md', directions: ['punchier', 'drier'] });
    expect(set.variants.map(v => [v.index, v.file, v.direction])).toEqual([[1, 'v1.md', 'punchier'], [2, 'v2.md', 'drier'], [3, 'v3.md', 'punchier'], [4, 'v4.md', 'drier']]);
    expect(readFileSync(basePath(p.project, set), 'utf8')).toBe(BASE);
    expect(readFileSync(variantPath(p.project, set, set.variants[3]), 'utf8')).toBe(BASE);
    expect(existsSync(join(setDir(p.project, 'demo'), 'set.json'))).toBe(true);
  });

  it('defaults to three variants, or one per direction up to six, with no direction when none is named', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    expect(createSet(p.project, draft, { id: 'a' }).variants.map(v => v.direction)).toEqual([null, null, null]);
    expect(createSet(p.project, draft, { id: 'b', directions: ['warmer', 'drier', 'plainer', 'shorter'] }).variants).toHaveLength(4);
  });

  it('uses the format of the draft for file names', () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', 'Title: T\nForm: tv-drama\n\nINT. ROOM - DAY\n\nShe waits.\n');
    expect(createSet(p.project, draft, { id: 'f' }).variants[0].file).toBe('v1.fountain');
  });

  it('refuses bad input with usable errors', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    expect(code(() => createSet(p.project, draft, { count: 1 }))).toBe('E_USAGE');
    expect(code(() => createSet(p.project, draft, { count: 7 }))).toBe('E_USAGE');
    expect(code(() => createSet(p.project, draft, { directions: ['spicier'] }))).toBe('E_USAGE');
    expect(code(() => createSet(p.project, draft, { count: 2, directions: ['warmer', 'drier', 'plainer'] }))).toBe('E_USAGE');
    expect(code(() => createSet(p.project, draft, { id: '../x' }))).toBe('E_USAGE');
    createSet(p.project, draft, { id: 'dup' });
    expect(code(() => createSet(p.project, draft, { id: 'dup' }))).toBe('E_CONFLICT');
  });

  it('records a draft outside the project by file name only', () => {
    const p = tmpProject();
    const outside = join(tmpProject().project, 'x.md');
    writeFileSync(outside, BASE);
    expect(createSet(p.project, outside, { id: 'o' }).source).toBe('x.md');
  });
});

describe('readSet, writeSet, listSets', () => {
  it('round-trips a set, lists newest first, and explains missing or damaged sets', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    createSet(p.project, draft, { id: 'older', now: new Date(Date.UTC(2026, 9, 1)) });
    const newer = createSet(p.project, draft, { id: 'newer', now: new Date(Date.UTC(2026, 9, 2)) });
    expect(listSets(p.project).map(s => s.id)).toEqual(['newer', 'older']);
    writeSet(p.project, { ...newer, picked: 2 });
    expect(readSet(p.project, 'newer').picked).toBe(2);
    expect(code(() => readSet(p.project, 'missing'))).toBe('E_NOT_FOUND');
    writeFileSync(join(setDir(p.project, 'older'), 'set.json'), '{"schema":"nope"}');
    expect(code(() => readSet(p.project, 'older'))).toBe('E_SCHEMA');
  });
});
