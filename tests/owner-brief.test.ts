import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { checkSet } from '../src/owner/check.ts';
import { setDir } from '../src/owner/paths.ts';
import { BriefSchema, SetSchema, createSet, readSet, writeSet } from '../src/owner/sets.ts';
import { BASE, tmpProject, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

describe('BriefSchema', () => {
  it('trims, folds CRLF to LF, and needs a character, a context or a characterRef', () => {
    expect(BriefSchema.parse({ character: '  Dry\r\nand tired ', context: ' A bark. ' })).toEqual({ character: 'Dry\nand tired', context: 'A bark.' });
    expect(BriefSchema.safeParse({}).success).toBe(false);
    expect(BriefSchema.safeParse({ confirmedAt: '2026-10-04T00:00:00.000Z' }).success).toBe(false);
    expect(BriefSchema.safeParse({ characterRef: 'jane' }).success).toBe(true);
  });

  it('limits character to 600 and context to 400 characters, and refuses blank text', () => {
    expect(BriefSchema.safeParse({ character: 'x'.repeat(600) }).success).toBe(true);
    expect(BriefSchema.safeParse({ character: 'x'.repeat(601) }).success).toBe(false);
    expect(BriefSchema.safeParse({ context: 'x'.repeat(400) }).success).toBe(true);
    expect(BriefSchema.safeParse({ context: 'x'.repeat(401) }).success).toBe(false);
    expect(BriefSchema.safeParse({ character: '   ' }).success).toBe(false);
  });

  it('refuses control characters but keeps newlines and tabs', () => {
    expect(BriefSchema.safeParse({ character: 'a\u0000b' }).success).toBe(false);
    expect(BriefSchema.safeParse({ context: 'a\u001bb' }).success).toBe(false);
    expect(BriefSchema.safeParse({ character: 'a\nb\tc' }).success).toBe(true);
  });

  it('is strict, and the reserved characterRef must look like an id', () => {
    expect(BriefSchema.safeParse({ character: 'x', mood: 'sad' }).success).toBe(false);
    expect(BriefSchema.safeParse({ character: 'x', characterRef: '../jane' }).success).toBe(false);
    expect(BriefSchema.safeParse({ character: 'x', characterRef: 'a'.repeat(65) }).success).toBe(false);
    expect(BriefSchema.safeParse({ character: 'x', characterRef: 'jane' }).success).toBe(true);
  });
});

describe('a set with a brief', () => {
  it('a set made before the brief existed still reads, and has no brief', () => {
    const p = tmpProject();
    createSet(p.project, p.write('t.md', BASE), { id: 'old' });
    const file = join(setDir(p.project, 'old'), 'set.json');
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    expect('brief' in raw).toBe(false);
    expect(readSet(p.project, 'old').brief).toBeUndefined();
    expect(SetSchema.safeParse({ ...raw, brief: { character: 'x' } }).success).toBe(true);
    expect(SetSchema.safeParse({ ...raw, brief: { nope: 1 } }).success).toBe(false);
  });

  it('createSet records the brief and confirmedAt only when confirmed', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    const now = new Date(Date.UTC(2026, 9, 4, 8));
    const open = createSet(p.project, draft, { id: 'a', brief: { character: 'A tired guard', context: 'Heard at the gate' }, now });
    expect(open.brief).toEqual({ character: 'A tired guard', context: 'Heard at the gate' });
    const sealed = createSet(p.project, draft, { id: 'b', brief: { character: 'A tired guard', confirmed: true }, now });
    expect(sealed.brief).toEqual({ character: 'A tired guard', confirmedAt: now.toISOString() });
    expect(readSet(p.project, 'b').brief?.confirmedAt).toBe(now.toISOString());
  });

  it('createSet refuses a brief with nothing in it, with E_USAGE', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    expect(code(() => createSet(p.project, draft, { brief: { confirmed: true } }))).toBe('E_USAGE');
    expect(code(() => createSet(p.project, draft, { brief: { character: '  ' } }))).toBe('E_USAGE');
    expect(code(() => createSet(p.project, draft, { brief: { context: 'x'.repeat(401) } }))).toBe('E_USAGE');
  });

  it('a hand-edited set.json with a bad brief reads as E_SCHEMA at /brief', () => {
    const p = tmpProject();
    createSet(p.project, p.write('t.md', BASE), { id: 'bad' });
    const file = join(setDir(p.project, 'bad'), 'set.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), brief: { character: '' } }));
    try { readSet(p.project, 'bad'); throw new Error('expected an error'); } catch (e) {
      expect((e as ProseError).code).toBe('E_SCHEMA');
      expect((e as ProseError).pointer).toMatch(/^\/brief/);
    }
  });

  it('keeps a reserved characterRef through a write and a read', () => {
    const p = tmpProject();
    const s = createSet(p.project, p.write('t.md', BASE), { id: 'ref' });
    writeSet(p.project, { ...s, brief: { characterRef: 'jane', character: 'Jane, a pilot' } });
    expect(readSet(p.project, 'ref').brief).toEqual({ characterRef: 'jane', character: 'Jane, a pilot' });
  });
});

describe('prose set new with a brief', () => {
  it('takes --character and --context, echoes them, and says it is not confirmed', async () => {
    const p = tmpProject();
    const out = await run('set', 'new', p.write('t.md', BASE), '--id', 'demo', '--character', 'Dry, tired', '--context', 'A 3 second bark');
    expect(out.brief).toEqual({ character: 'Dry, tired', characterRef: null, context: 'A 3 second bark', confirmed: false });
    expect(out.next).toMatch(/prose set brief demo --confirmed/);
    expect(readSet(p.project, 'demo').brief).toEqual({ character: 'Dry, tired', context: 'A 3 second bark' });
  });

  it('--brief-confirmed records the confirmation and drops the confirm hint', async () => {
    const p = tmpProject();
    const out = await run('set', 'new', p.write('t.md', BASE), '--id', 'demo', '--character', 'Dry', '--brief-confirmed');
    expect(out.brief).toMatchObject({ character: 'Dry', context: null, confirmed: true });
    expect(out.next).not.toMatch(/--confirmed/);
    expect(out.next).toMatch(/prose set check demo/);
  });

  it('without a brief the output says brief: null and the next step is unchanged', async () => {
    const p = tmpProject();
    const out = await run('set', 'new', p.write('t.md', BASE), '--id', 'demo');
    expect(out.brief).toBeNull();
    expect(out.next).toMatch(/^Rewrite each variant/);
  });

  it('--brief-confirmed needs something to confirm', async () => {
    const p = tmpProject();
    expect((await fail('set', 'new', p.write('t.md', BASE), '--brief-confirmed')).code).toBe('E_USAGE');
  });

  it('--brief-from copies the brief and its confirmation, and refuses to mix with --character or --context', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    await run('set', 'new', draft, '--id', 'one', '--character', 'Dry', '--context', 'Gate', '--brief-confirmed');
    const two = await run('set', 'new', draft, '--id', 'two', '--brief-from', 'one');
    expect(two.brief).toEqual({ character: 'Dry', characterRef: null, context: 'Gate', confirmed: true });
    expect(readSet(p.project, 'two').brief).toEqual(readSet(p.project, 'one').brief);
    expect((await fail('set', 'new', draft, '--brief-from', 'one', '--character', 'x')).code).toBe('E_USAGE');
    expect((await fail('set', 'new', draft, '--brief-from', 'one', '--context', 'x')).code).toBe('E_USAGE');
  });

  it('--brief-from names a missing set or a set without a brief', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    await run('set', 'new', draft, '--id', 'plain');
    expect((await fail('set', 'new', draft, '--brief-from', 'nope')).code).toBe('E_NOT_FOUND');
    const e = await fail('set', 'new', draft, '--brief-from', 'plain');
    expect(e.code).toBe('E_USAGE');
    expect(e.message).toMatch(/no brief/);
  });

  it('a too-long character is E_USAGE and leaves no set behind', async () => {
    const p = tmpProject();
    const e = await fail('set', 'new', p.write('t.md', BASE), '--id', 'long', '--character', 'x'.repeat(601));
    expect(e.code).toBe('E_USAGE');
    expect((await run('set', 'list', '--dir', p.project)).sets).toEqual([]);
  });
});

describe('prose set brief', () => {
  const made = async (confirmed = true) => {
    const p = tmpProject();
    await run('set', 'new', p.write('t.md', BASE), '--id', 'demo', '--character', 'Dry', '--context', 'Gate', ...(confirmed ? ['--brief-confirmed'] : []));
    return p;
  };

  it('editing text clears the confirmation unless --confirmed is passed again', async () => {
    const p = await made();
    const out = await run('set', 'brief', 'demo', '--character', 'Warm', '--dir', p.project);
    expect(out).toMatchObject({ set: 'demo', brief: { character: 'Warm', context: 'Gate', confirmed: false } });
    expect(readSet(p.project, 'demo').brief?.confirmedAt).toBeUndefined();
    const again = await run('set', 'brief', 'demo', '--context', 'Door', '--confirmed', '--dir', p.project);
    expect(again.brief).toMatchObject({ character: 'Warm', context: 'Door', confirmed: true });
  });

  it('--confirmed alone confirms the brief as it stands', async () => {
    const p = await made(false);
    expect((await run('set', 'brief', 'demo', '--confirmed', '--dir', p.project)).brief.confirmed).toBe(true);
  });

  it('clears one field, and emptying both removes the brief', async () => {
    const p = await made();
    expect((await run('set', 'brief', 'demo', '--clear-context', '--dir', p.project)).brief).toMatchObject({ character: 'Dry', context: null });
    const gone = await run('set', 'brief', 'demo', '--clear-character', '--dir', p.project);
    expect(gone.brief).toBeNull();
    expect(readSet(p.project, 'demo').brief).toBeUndefined();
    expect((await run('set', 'show', 'demo', '--dir', p.project)).brief).toBeNull();
  });

  it('adds a brief to a set that had none', async () => {
    const p = tmpProject();
    await run('set', 'new', p.write('t.md', BASE), '--id', 'plain');
    expect((await run('set', 'brief', 'plain', '--context', 'A toast', '--dir', p.project)).brief).toMatchObject({ character: null, context: 'A toast', confirmed: false });
  });

  it('refuses nothing-to-change, a contradiction, --confirmed with no brief, and bad text', async () => {
    const p = await made();
    expect((await fail('set', 'brief', 'demo', '--dir', p.project)).code).toBe('E_USAGE');
    expect((await fail('set', 'brief', 'demo', '--character', 'x', '--clear-character', '--dir', p.project)).code).toBe('E_USAGE');
    expect((await fail('set', 'brief', 'demo', '--context', 'x'.repeat(401), '--dir', p.project)).code).toBe('E_USAGE');
    await run('set', 'new', p.write('u.md', BASE), '--id', 'plain');
    expect((await fail('set', 'brief', 'plain', '--confirmed', '--dir', p.project)).code).toBe('E_USAGE');
    expect((await fail('set', 'brief', 'nope', '--confirmed', '--dir', p.project)).code).toBe('E_NOT_FOUND');
  });

  it('refuses a picked set: the owner chose with the old brief on screen', async () => {
    const p = await made();
    writeSet(p.project, { ...readSet(p.project, 'demo'), picked: 1, pickedAt: new Date().toISOString() });
    const e = await fail('set', 'brief', 'demo', '--character', 'x', '--dir', p.project);
    expect(e.code).toBe('E_CONFLICT');
    expect(readSet(p.project, 'demo').brief?.character).toBe('Dry');
  });

  it('editing the character drops a stale characterRef; editing only the context keeps it', async () => {
    const p = await made();
    writeSet(p.project, { ...readSet(p.project, 'demo'), brief: { characterRef: 'jane', character: 'Jane', context: 'Gate' } });
    await run('set', 'brief', 'demo', '--context', 'Door', '--dir', p.project);
    expect(readSet(p.project, 'demo').brief?.characterRef).toBe('jane');
    await run('set', 'brief', 'demo', '--character', 'Someone else', '--dir', p.project);
    expect(readSet(p.project, 'demo').brief?.characterRef).toBeUndefined();
  });
});

describe('prose set show and list, set check', () => {
  it('show carries the brief (or null) and list a boolean', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    await run('set', 'new', draft, '--id', 'with', '--character', 'Dry', '--brief-confirmed');
    await run('set', 'new', draft, '--id', 'without');
    expect((await run('set', 'show', 'with', '--dir', p.project)).brief).toEqual({ character: 'Dry', characterRef: null, context: null, confirmed: true });
    expect((await run('set', 'show', 'without', '--dir', p.project)).brief).toBeNull();
    const rows = (await run('set', 'list', '--dir', p.project)).sets;
    expect(rows.find((r: { id: string }) => r.id === 'with').brief).toBe(true);
    expect(rows.find((r: { id: string }) => r.id === 'without').brief).toBe(false);
  });

  it('check warns brief-unconfirmed at the set level, only for an unconfirmed brief, and never rejects for it', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    await run('set', 'new', draft, '--id', 'open', '--character', 'Dry');
    await run('set', 'new', draft, '--id', 'sealed', '--character', 'Dry', '--brief-confirmed');
    await run('set', 'new', draft, '--id', 'none');
    const open = checkSet(p.project, readSet(p.project, 'open'));
    expect(open.warnings).toEqual([expect.stringMatching(/^brief-unconfirmed: /)]);
    expect(open.variants.every(v => v.reasons.every(r => !/brief/.test(r)))).toBe(true);
    expect(checkSet(p.project, readSet(p.project, 'sealed')).warnings).toEqual([]);
    expect(checkSet(p.project, readSet(p.project, 'none')).warnings).toEqual([]);
    await run('set', 'brief', 'open', '--confirmed', '--dir', p.project);
    expect(checkSet(p.project, readSet(p.project, 'open')).warnings).toEqual([]);
  });

  it('the check warning also shows through the CLI', async () => {
    const p = tmpProject();
    await run('set', 'new', p.write('t.md', BASE), '--id', 'open', '--context', 'A bark');
    expect((await run('set', 'check', 'open', '--dir', p.project)).warnings[0]).toMatch(/brief-unconfirmed/);
  });
});
