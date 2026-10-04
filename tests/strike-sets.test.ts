import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { checkSet } from '../src/owner/check.ts';
import { SetSchema, readSet, variantPath } from '../src/owner/sets.ts';
import { fixture, run } from './helpers.ts';
import { tmpProject, useTmp } from './owner-helpers.ts';

useTmp();
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };
const SCENE = readFileSync(fixture('strike/scene.fountain'), 'utf8').replace(/\r\n/g, '\n');
const BAD = 'wrong-direction';

describe('struck lines and sets', () => {
  it('a set made after a strike records the struck lines as excluded, and the next step says to leave them alone', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', SCENE);
    await run('strike', draft, '--line', '14', '--reason', BAD);
    await run('strike', draft, '--line', '18', '--reason', 'faulty-premise');
    const out = await run('set', 'new', draft, '--id', 'demo');
    expect(out.excluded).toEqual([{ ref: '14', text: 'CRASH FROM ROOM FOUR.' }, { ref: '17-18', text: 'Not tonight. Please.' }]);
    expect(out.next).toMatch(/2 struck lines are excluded: leave them exactly as they are/);
    expect(readSet(p.project, 'demo').excluded).toHaveLength(2);
    expect((await run('set', 'show', 'demo', '--dir', p.project)).excluded).toEqual(out.excluded);
  });

  it('a set with no pending strike has no excluded field, and set show says null', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', SCENE);
    const out = await run('set', 'new', draft, '--id', 'plain');
    expect(out.excluded).toBeNull();
    expect(JSON.parse(readFileSync(join(p.project, '.agent-prose', 'sets', 'plain', 'set.json'), 'utf8'))).not.toHaveProperty('excluded');
    expect((await run('set', 'show', 'plain', '--dir', p.project)).excluded).toBeNull();
  });

  it('a cleared strike is no longer excluded, and a stale one is not either', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', SCENE);
    await run('strike', draft, '--line', '14', '--reason', BAD);
    await run('strike', 'clear', draft, 's1');
    expect((await run('set', 'new', draft, '--id', 'a')).excluded).toBeNull();
    await run('strike', draft, '--line', '14', '--reason', BAD);
    writeFileSync(draft, `${SCENE}\nAn extra beat.\n`);
    expect((await run('set', 'new', draft, '--id', 'b')).excluded).toBeNull();
  });

  it('--lines refuses a struck line as E_CONFLICT naming the strike, including a line inside its span', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', SCENE);
    await run('strike', draft, '--line', '17', '--reason', 'faulty-premise');
    const e = await fail('set', 'new', draft, '--lines', '18', '--id', 'rev');
    expect(e).toMatchObject({ code: 'E_CONFLICT', message: 'Line 17-18 is struck (s1, faulty-premise), so it cannot be the line this set revises', hint: expect.stringContaining('prose strike clear scene.fountain s1') });
    expect((await run('set', 'new', draft, '--lines', '14', '--id', 'ok')).original.lines[0].ref).toBe('14');
  });

  it('--lines of a line that was struck and cleared is allowed', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', SCENE);
    await run('strike', draft, '--line', '14', '--reason', BAD);
    await run('strike', 'clear', draft, 's1');
    expect((await run('set', 'new', draft, '--lines', '14', '--id', 'rev')).original.lines[0].ref).toBe('14');
  });

  it('set check rejects a variant that edits an excluded line and accepts one that leaves it alone', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', SCENE);
    await run('strike', draft, '--line', '14', '--reason', BAD);
    await run('set', 'new', draft, '--id', 'demo', '--count', '3');
    const set = readSet(p.project, 'demo');
    const v = (i: number) => variantPath(p.project, set, set.variants[i]);
    writeFileSync(v(0), SCENE.replace('Fluorescent lights hum.', 'The lights buzz and flicker.').replace('Nobody told me', 'Nobody warned me'));
    writeFileSync(v(1), SCENE.replace('CRASH FROM ROOM FOUR.', 'A CRASH FROM ROOM FOUR.').replace('Nobody told me', 'Nobody ever told me'));
    writeFileSync(v(2), SCENE.replace('CRASH FROM ROOM FOUR.\n\n', '').replace('Fluorescent lights hum.', 'Neon hums.'));
    const out = checkSet(p.project, readSet(p.project, 'demo'));
    expect(out.variants[0].status).toBe('ok');
    expect(out.variants[0].reasons).toEqual([]);
    expect(out.variants[1].status).toBe('rejected');
    expect(out.variants[1].reasons[0]).toMatch(/^struck-line-edited: line 14 was struck and must stay as written, but it was edited or removed \(first: "CRASH FROM ROOM FOUR\."\)/);
    expect(out.variants[2].reasons.join('|')).toMatch(/struck-line-edited: line 14/);
    expect(out.rejected.map(r => r.index)).toEqual([2, 3]);
  });

  it('an unedited variant is rejected for being unchanged, never for the struck line', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', SCENE);
    await run('strike', draft, '--line', '14', '--reason', BAD);
    await run('set', 'new', draft, '--id', 'demo');
    const out = checkSet(p.project, readSet(p.project, 'demo'));
    for (const v of out.variants) expect(v.reasons.join('|')).not.toMatch(/struck-line-edited/);
  });

  it('works for a Markdown paragraph, a lyric line and a dialog variant', async () => {
    const p = tmpProject();
    const md = p.write('talk.md', readFileSync(fixture('strike/talk.md'), 'utf8').replace(/\r\n/g, '\n'));
    await run('strike', md, '--line', '10', '--reason', BAD);
    await run('set', 'new', md, '--id', 'md');
    const set = readSet(p.project, 'md');
    writeFileSync(variantPath(p.project, set, set.variants[0]), readFileSync(variantPath(p.project, set, set.variants[0]), 'utf8').replace('A quoted line.', 'A different line.'));
    expect(checkSet(p.project, set).variants[0].reasons.join('|')).toMatch(/struck-line-edited: line 10 /);

    const dlg = p.write('gate.dialog.yaml', readFileSync(fixture('strike/gate.dialog.yaml'), 'utf8').replace(/\r\n/g, '\n'));
    await run('strike', dlg, '--line', '8', '--reason', BAD);
    const out = await run('set', 'new', dlg, '--id', 'dlg');
    expect(out.excluded).toEqual([{ ref: '8', text: 'Stop right there.' }]);
  });

  it('the set schema stays strict about excluded: bad ref, empty text, empty list, extra keys', () => {
    const base = { schema: 'prose/set@1', id: 'x', uid: '12345678', createdAt: 't', form: 'speech-small', format: 'markdown', source: 'a.md', base: 'base.md', directions: [], variants: [{ index: 1, file: 'v1.md', direction: null }, { index: 2, file: 'v2.md', direction: null }] };
    expect(SetSchema.safeParse({ ...base, excluded: [{ ref: '5', text: 'x' }] }).success).toBe(true);
    expect(SetSchema.safeParse(base).success).toBe(true);
    expect(SetSchema.safeParse({ ...base, excluded: [] }).success).toBe(false);
    expect(SetSchema.safeParse({ ...base, excluded: [{ ref: '5-', text: 'x' }] }).success).toBe(false);
    expect(SetSchema.safeParse({ ...base, excluded: [{ ref: '5', text: '' }] }).success).toBe(false);
    expect(SetSchema.safeParse({ ...base, excluded: [{ ref: '5', text: 'x', extra: 1 }] }).success).toBe(false);
  });

  it('a set made before strikes existed reads unchanged', () => {
    const old = { schema: 'prose/set@1', id: 'old', uid: 'abcdef12', createdAt: 't', form: 'speech-small', format: 'markdown', source: 'a.md', base: 'base.md', directions: ['shorter'], variants: [{ index: 1, file: 'v1.md', direction: 'shorter' }, { index: 2, file: 'v2.md', direction: null }] };
    expect(SetSchema.parse(old).excluded).toBeUndefined();
  });
});
