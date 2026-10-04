import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ProseError } from '../src/errors.ts';
import { strikeDir } from '../src/owner/paths.ts';
import { strikeKey } from '../src/strike/store.ts';
import { ROOT, fixture, run } from './helpers.ts';
import { tmpProject, useTmp } from './owner-helpers.ts';

useTmp();
const exec = promisify(execFile);
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };
const fx = (name: string) => readFileSync(fixture(`strike/${name}`), 'utf8').replace(/\r\n/g, '\n');
const logOf = (p: { project: string }, source: string) => readFileSync(join(strikeDir(p.project, strikeKey(source)), 'events.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));

describe('prose strike add', () => {
  it('strikes a Fountain speech by any line inside it, and says the draft is not edited', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    const before = readFileSync(draft, 'utf8');
    const out = await run('strike', draft, '--line', '18', '--reason', 'wrong-direction', '--note', 'she would never say please');
    expect(out).toMatchObject({ draft: 'scene.fountain', strike: { id: 's1', ref: '17-18', speaker: 'MAYA', text: 'Not tonight. Please.', reason: 'wrong-direction', note: 'she would never say please' }, pending: 1 });
    expect(out.next).toMatch(/not edited/);
    expect(readFileSync(draft, 'utf8')).toBe(before);
    const rows = logOf(p, 'scene.fountain');
    expect(rows).toEqual([expect.objectContaining({ schema: 'prose/strike-event@1', type: 'strike', id: 's1', seq: 1, start: 17, end: 18, draftHash: expect.stringMatching(/^[0-9a-f]{64}$/) })]);
  });

  it('strikes a Markdown paragraph, a lyric line and a dialog variant and choice, each with its own canonical ref', async () => {
    const p = tmpProject();
    const md = p.write('talk.md', fx('talk.md'));
    const song = p.write('song.md', fx('song.md'));
    const dlg = p.write('gate.dialog.yaml', fx('gate.dialog.yaml'));
    expect((await run('strike', md, '--line', '8', '--reason', 'faulty-premise')).strike).toMatchObject({ ref: '7-8', reason: 'faulty-premise' });
    expect((await run('strike', song, '--line', '7', '--reason', 'not-worth-rewrite')).strike).toMatchObject({ ref: '7', text: 'I carried my shoes through the sleeping town' });
    expect((await run('strike', dlg, '--line', '8', '--reason', 'wrong-direction')).strike).toMatchObject({ ref: '8', speaker: 'GUARD', text: 'Stop right there.' });
    expect((await run('strike', dlg, '--line', '12', '--reason', 'wrong-direction')).strike).toMatchObject({ ref: '11', text: "I'm here to trade." });
  });

  it('works from a CRLF draft with a BOM and keeps the file byte for byte', async () => {
    const p = tmpProject();
    const raw = '﻿' + fx('scene.fountain').replace(/\n/g, '\r\n');
    const draft = p.write('crlf.fountain', raw);
    expect((await run('strike', draft, '--line', '14', '--reason', 'wrong-direction')).strike).toMatchObject({ ref: '14', text: 'CRASH FROM ROOM FOUR.' });
    expect(readFileSync(draft, 'utf8')).toBe(raw);
  });

  it('refuses a bad ref, several refs, a line that holds no text, and names the refs that exist', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    for (const bad of ['', 'x', '0', '3-2', '12-', '1,2']) {
      const e = await fail('strike', draft, '--line', bad, '--reason', 'wrong-direction');
      expect(e.code, bad).toBe('E_USAGE');
    }
    const none = await fail('strike', draft, '--line', '4', '--reason', 'wrong-direction');
    expect(none).toMatchObject({ code: 'E_USAGE', message: expect.stringMatching(/4 is not a line of the draft that holds text/), hint: 'Units: 3, 5, 8, 9, 12, 14, 17-18, 20' });
    const many = await fail('strike', draft, '--line', '3-9', '--reason', 'wrong-direction');
    expect(many).toMatchObject({ code: 'E_USAGE', message: expect.stringMatching(/covers 4 lines/) });
  });

  it('refuses a reason that is not one of the three, with the allowed ones, and a missing reason', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    const e = await fail('strike', draft, '--line', '3', '--reason', 'boring');
    expect(e).toMatchObject({ code: 'E_USAGE', hint: 'Allowed: wrong-direction, faulty-premise, not-worth-rewrite' });
    expect((await fail('strike', draft, '--line', '3')).message).toMatch(/--reason/);
    expect(logOfExists(p, 'scene.fountain')).toBe(false);
  });

  it('refuses an oversized or control-character note, and an empty one', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    const base = ['strike', draft, '--line', '3', '--reason', 'wrong-direction'];
    expect((await fail(...base, '--note', 'x'.repeat(501))).code).toBe('E_USAGE');
    expect((await fail(...base, '--note', 'bell\u0007')).code).toBe('E_USAGE');
    expect((await fail(...base, '--note', '   ')).code).toBe('E_USAGE');
    expect((await run(...base, '--note', 'x'.repeat(500))).strike.note).toHaveLength(500);
  });

  it('refuses a line that cannot be struck, with the reason and the nearest strikable lines', async () => {
    const p = tmpProject();
    const draft = p.write('gate.dialog.yaml', fx('gate.dialog.yaml'));
    const text = await fail('strike', draft, '--line', '6', '--reason', 'wrong-direction');
    expect(text).toMatchObject({ code: 'E_USAGE', message: expect.stringMatching(/6 cannot be struck: a node needs its text/), hint: expect.stringMatching(/^Nearest strikable lines: 8, 9/) });
    expect((await fail('strike', draft, '--line', '23', '--reason', 'wrong-direction')).message).toMatch(/flow style/);
    expect((await fail('strike', draft, '--line', '36', '--reason', 'wrong-direction')).message).toMatch(/bark pool needs at least one line/);
  });

  it('refuses to strike what is already struck, and a combination that would leave a bark pool empty', async () => {
    const p = tmpProject();
    const draft = p.write('gate.dialog.yaml', fx('gate.dialog.yaml'));
    await run('strike', draft, '--line', '30', '--reason', 'wrong-direction');
    const again = await fail('strike', draft, '--line', '30', '--reason', 'faulty-premise');
    expect(again).toMatchObject({ code: 'E_CONFLICT', message: '30 is already struck as s1; clear it first' });
    const last = await fail('strike', draft, '--line', '31', '--reason', 'wrong-direction');
    expect(last).toMatchObject({ code: 'E_USAGE', message: expect.stringMatching(/bark pool needs at least one line/) });
  });

  it('refuses a stale draft hash (E_CONFLICT) and accepts the current one', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    const first = await run('strike', draft, '--line', '3', '--reason', 'wrong-direction');
    const hash = logOf(p, 'scene.fountain')[0].draftHash;
    expect(first.strike.id).toBe('s1');
    expect((await run('strike', draft, '--line', '5', '--reason', 'wrong-direction', '--draft-hash', hash)).strike.id).toBe('s2');
    expect((await fail('strike', draft, '--line', '8', '--reason', 'wrong-direction', '--draft-hash', 'f'.repeat(64))).code).toBe('E_CONFLICT');
    expect((await fail('strike', draft, '--line', '8', '--reason', 'wrong-direction', '--draft-hash', 'nothex')).code).toBe('E_USAGE');
    expect(logOf(p, 'scene.fountain')).toHaveLength(2);
  });

  it('a retry with the same event id is a no-op that answers duplicate and the same strike', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    const a = await run('strike', draft, '--line', '3', '--reason', 'wrong-direction', '--event-id', 'e-1');
    const b = await run('strike', draft, '--line', '3', '--reason', 'wrong-direction', '--event-id', 'e-1');
    expect(a.duplicate).toBeUndefined();
    expect(b).toMatchObject({ duplicate: true, strike: { id: 's1' }, pending: 1 });
    expect(logOf(p, 'scene.fountain')).toHaveLength(1);
    expect((await fail('strike', draft, '--line', '5', '--reason', 'wrong-direction', '--event-id', 'bad id')).code).toBe('E_USAGE');
  });

  it('refuses a draft that is outside the project, inside .agent-prose, missing, of another type or a symbolic link', async () => {
    const p = tmpProject();
    const q = tmpProject();
    const args = ['--line', '1', '--reason', 'wrong-direction'];
    p.write('x.md', 'Hello there.\n');
    expect((await fail('strike', join(q.project, 'nope.md'), ...args, '--dir', p.project)).code).toBe('E_NOT_FOUND');
    expect((await fail('strike', q.write('other.md', 'Hi.\n'), ...args, '--dir', p.project)).code).toBe('E_USAGE');
    expect((await fail('strike', p.write('.agent-prose/sets/s/base.md', 'Hi.\n'), ...args)).message).toMatch(/inside \.agent-prose/);
    expect((await fail('strike', p.write('notes.txt', 'Hi.\n'), ...args)).code).toBe('E_USAGE');
    expect((await fail('strike', join(p.project, '..', '..', 'etc', 'passwd'), ...args, '--dir', p.project)).code).toMatch(/E_NOT_FOUND|E_USAGE/);
    const real = p.write('real.md', 'Hello there.\n');
    try { symlinkSync(real, join(p.project, 'link.md')); } catch { return; }
    expect((await fail('strike', join(p.project, 'link.md'), ...args)).message).toMatch(/symbolic link/);
  });

  it('keeps a hostile draft name out of the strike folder name', async () => {
    const p = tmpProject();
    const draft = p.write('sub dir/..weird name$(x).md', 'Hello there.\n');
    const out = await run('strike', draft, '--line', '1', '--reason', 'wrong-direction');
    expect(out.draft).toBe('sub dir/..weird name$(x).md');
    expect(strikeKey(out.draft)).toMatch(/^weird-name-x-md-[0-9a-f]{8}$/);
    expect(logOf(p, out.draft)).toHaveLength(1);
  });

  it('needs a project', async () => {
    const e = await fail('strike', fixture('strike/scene.fountain'), '--line', '3', '--reason', 'wrong-direction', '--dir', fixture('strike'));
    expect(e.code).toBe('E_PROJECT');
  });

  it('takes the 201st strike on a draft with an E_CONFLICT', async () => {
    const p = tmpProject();
    const draft = p.write('many.md', Array.from({ length: 202 }, (_, k) => `Line number ${k + 1}.`).join('\n\n') + '\n');
    for (let k = 0; k < 200; k++) await run('strike', draft, '--line', String(1 + 2 * k), '--reason', 'wrong-direction');
    expect(await fail('strike', draft, '--line', '401', '--reason', 'wrong-direction')).toMatchObject({ code: 'E_CONFLICT', message: expect.stringMatching(/200 strikes are pending/) });
  }, 60_000);
});

const logOfExists = (p: { project: string }, source: string): boolean => {
  try { readFileSync(join(strikeDir(p.project, strikeKey(source)), 'events.jsonl')); return true; } catch { return false; }
};

describe('prose strike clear', () => {
  it('withdraws one strike, or all of them, and says what is left', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    for (const l of ['3', '5', '8']) await run('strike', draft, '--line', l, '--reason', 'wrong-direction');
    expect(await run('strike', 'clear', draft, 's2')).toMatchObject({ cleared: ['s2'], pending: 2 });
    expect((await run('strike', 'list', draft)).rows.map((r: { id: string }) => r.id)).toEqual(['s1', 's3']);
    expect(await run('strike', 'clear', draft, '--all')).toMatchObject({ cleared: ['s1', 's3'], pending: 0 });
    expect((await run('strike', 'list', draft)).rows).toEqual([]);
  });

  it('never reuses a cleared strike id, and lets the line be struck again', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await run('strike', draft, '--line', '3', '--reason', 'wrong-direction');
    await run('strike', 'clear', draft, 's1');
    expect((await run('strike', draft, '--line', '3', '--reason', 'faulty-premise')).strike.id).toBe('s2');
  });

  it('refuses an unknown or already cleared strike, a bad id, and neither or both of an id and --all', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await run('strike', draft, '--line', '3', '--reason', 'wrong-direction');
    await run('strike', 'clear', draft, 's1');
    expect((await fail('strike', 'clear', draft, 's1')).code).toBe('E_NOT_FOUND');
    expect((await fail('strike', 'clear', draft, 's9')).code).toBe('E_NOT_FOUND');
    expect((await fail('strike', 'clear', draft, '../s1')).code).toBe('E_USAGE');
    expect((await fail('strike', 'clear', draft)).code).toBe('E_USAGE');
    expect((await fail('strike', 'clear', draft, 's1', '--all')).code).toBe('E_USAGE');
  });

  it('a retry with the same event id is a no-op', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await run('strike', draft, '--line', '3', '--reason', 'wrong-direction');
    await run('strike', draft, '--line', '5', '--reason', 'wrong-direction');
    expect(await run('strike', 'clear', draft, 's1', '--event-id', 'c-1')).toMatchObject({ cleared: ['s1'], pending: 1 });
    expect(await run('strike', 'clear', draft, 's1', '--event-id', 'c-1')).toMatchObject({ duplicate: true, pending: 1 });
    expect(logOf(p, 'scene.fountain').filter(r => r.type === 'clear')).toHaveLength(1);
  });
});

describe('prose strike list', () => {
  it('lists pending strikes with reasons and counts, filtered by reason, across drafts with --all', async () => {
    const p = tmpProject();
    const a = p.write('scene.fountain', fx('scene.fountain'));
    const b = p.write('talk.md', fx('talk.md'));
    await run('strike', a, '--line', '3', '--reason', 'wrong-direction');
    await run('strike', a, '--line', '5', '--reason', 'faulty-premise', '--note', 'who says so');
    await run('strike', b, '--line', '10', '--reason', 'faulty-premise');
    const one = await run('strike', 'list', a);
    expect(one).toMatchObject({ draft: 'scene.fountain', counts: { total: 2, stale: 0, byReason: { 'wrong-direction': 1, 'faulty-premise': 1, 'not-worth-rewrite': 0 } } });
    expect(one.rows[1]).toMatchObject({ id: 's2', ref: '5', reason: 'faulty-premise', note: 'who says so', state: 'pending', stale: false, draft: 'scene.fountain' });
    const all = await run('strike', 'list', '--all', '--dir', p.project, '--reason', 'faulty-premise');
    expect(all.draft).toBeNull();
    expect(all.rows.map((r: { draft: string; id: string }) => `${r.draft}:${r.id}`).sort()).toEqual(['scene.fountain:s2', 'talk.md:s1']);
    expect(all.counts.total).toBe(2);
  });

  it('says every strike is stale once the draft changes, even by an edit elsewhere, and stale strikes can be cleared', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await run('strike', draft, '--line', '3', '--reason', 'wrong-direction');
    await run('strike', draft, '--line', '14', '--reason', 'wrong-direction');
    writeFileSync(draft, readFileSync(draft, 'utf8').replace('CUT TO:', 'SMASH CUT TO:'));
    const after = await run('strike', 'list', draft);
    expect(after.rows.map((r: { stale: boolean }) => r.stale)).toEqual([true, true]);
    expect(after.counts.stale).toBe(2);
    // A line ending change alone is not an edit.
    writeFileSync(draft, readFileSync(draft, 'utf8').replace('SMASH CUT TO:', 'CUT TO:'));
    expect((await run('strike', 'list', draft)).counts.stale).toBe(0);
    writeFileSync(draft, readFileSync(draft, 'utf8').replace(/\n/g, '\r\n'));
    expect((await run('strike', 'list', draft)).counts.stale).toBe(0);
    writeFileSync(draft, readFileSync(draft, 'utf8') + 'One more.\n');
    expect(await run('strike', 'clear', draft, 's1')).toMatchObject({ cleared: ['s1'] });
  });

  it('applied is empty in this version, and all shows the pending ones', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await run('strike', draft, '--line', '3', '--reason', 'wrong-direction');
    expect((await run('strike', 'list', draft, '--state', 'applied')).rows).toEqual([]);
    expect((await run('strike', 'list', draft, '--state', 'all')).rows).toHaveLength(1);
  });

  it('refuses a bad reason, a bad state, no draft and no --all, and both', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    expect((await fail('strike', 'list', draft, '--reason', 'meh')).code).toBe('E_USAGE');
    expect((await fail('strike', 'list', draft, '--state', 'gone')).code).toBe('E_USAGE');
    expect((await fail('strike', 'list', '--dir', p.project)).code).toBe('E_USAGE');
    expect((await fail('strike', 'list', draft, '--all')).code).toBe('E_USAGE');
  });

  it('reports a log line it had to skip, and lists nothing for a draft with no strikes', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    expect(await run('strike', 'list', draft)).toMatchObject({ rows: [], counts: { total: 0 } });
    await run('strike', draft, '--line', '3', '--reason', 'wrong-direction');
    const log = join(strikeDir(p.project, strikeKey('scene.fountain')), 'events.jsonl');
    writeFileSync(log, readFileSync(log, 'utf8') + '{"torn":\n');
    expect((await run('strike', 'list', draft)).problems).toEqual(['scene.fountain: 1 unreadable log line skipped']);
  });
});

describe('prose capabilities and the real CLI', () => {
  it('lists the strike commands', async () => {
    const out = await run('capabilities');
    expect(out.commands).toEqual(expect.arrayContaining(['strike add', 'strike clear', 'strike list', 'strike apply', 'strike undo']));
  });

  it('two processes striking different lines at once both land, with unique ids and contiguous seq (the lock)', async () => {
    const p = tmpProject();
    const draft = p.write('many.md', Array.from({ length: 12 }, (_, k) => `Line number ${k + 1}.`).join('\n\n') + '\n');
    const cli = join(ROOT, 'scripts', 'prose.mjs');
    const results = await Promise.all(Array.from({ length: 8 }, (_, k) => exec(process.execPath, [cli, 'strike', draft, '--line', String(1 + 2 * k), '--reason', 'wrong-direction'], { cwd: p.project })));
    const ids = results.map(r => JSON.parse(r.stdout).strike.id).sort();
    expect(new Set(ids).size).toBe(8);
    const rows = logOf(p, 'many.md');
    expect(rows.map(r => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.map(r => r.id).sort()).toEqual(ids);
  }, 60_000);

  it('two processes striking the same line at once: one wins, the other is an E_CONFLICT, never two rows', async () => {
    const p = tmpProject();
    const draft = p.write('two.md', 'Alpha line.\n\nBeta line.\n');
    const cli = join(ROOT, 'scripts', 'prose.mjs');
    const go = () => exec(process.execPath, [cli, 'strike', draft, '--line', '1', '--reason', 'wrong-direction'], { cwd: p.project }).then(r => ({ ok: true, out: r.stdout }), e => ({ ok: false, out: String(e.stderr) }));
    const [a, b] = await Promise.all([go(), go()]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((a.ok ? b : a).out).toMatch(/E_CONFLICT.*already struck as s1/);
    expect(logOf(p, 'two.md')).toHaveLength(1);
  }, 60_000);
});
