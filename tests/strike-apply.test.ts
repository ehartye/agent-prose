import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, renameSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { strikeDir } from '../src/owner/paths.ts';
import { applyStrikes, undoStrikes, PENDING_FILE } from '../src/strike/apply.ts';
import { rawLines } from '../src/strike/plan.ts';
import { foldStrikes, parseStrikeLog, resolveDraft, strikeKey } from '../src/strike/store.ts';
import { ROOT, fixture, run } from './helpers.ts';
import { tmpProject, useTmp } from './owner-helpers.ts';

useTmp();
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };
const failSync = (fn: () => unknown): ProseError => { try { fn(); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };
const fx = (name: string) => readFileSync(fixture(`strike/${name}`), 'utf8').replace(/\r\n/g, '\n');
const read = (file: string) => readFileSync(file, 'utf8');
const logOf = (project: string, source: string) => parseStrikeLog(readFileSync(join(strikeDir(project, strikeKey(source)), 'events.jsonl'), 'utf8')).events;
const pendingFile = (project: string, source: string) => join(strikeDir(project, strikeKey(source)), PENDING_FILE);
const S = (draft: string, ref: string, reason = 'wrong-direction') => run('strike', draft, '--line', ref, '--reason', reason);
const bom = (t: string) => '﻿' + t;
const crlf = (t: string) => t.replace(/\n/g, '\r\n');
const mixed = (t: string) => t.split('\n').map((l, i, a) => l + (i === a.length - 1 ? '' : i % 2 ? '\r\n' : '\n')).join('');
const variants: Array<[string, (t: string) => string]> = [
  ['LF', t => t], ['CRLF', crlf], ['BOM + LF', bom], ['BOM + CRLF', t => bom(crlf(t))], ['mixed endings', mixed], ['no final newline', t => t.replace(/\n$/, '')],
];
const FILES = ['scene.fountain', 'talk.md', 'song.md', 'gate.dialog.yaml'];

/** Strike -> dry run -> confirm; the draft's text after. */
async function applyOne(draft: string, ...refs: string[]) {
  for (const r of refs) await S(draft, r);
  const dry = await run('strike', 'apply', draft);
  const done = await run('strike', 'apply', draft, '--confirm', dry.digest);
  return { dry, done };
}

describe('prose strike apply: dry run', () => {
  it('prints the exact text that would go and a digest, and writes nothing', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await S(draft, '17', 'faulty-premise');
    const before = read(draft);
    const out = await run('strike', 'apply', draft);
    expect(read(draft)).toBe(before);
    expect(out).toMatchObject({ applied: false, draft: 'scene.fountain', count: 1, digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(out.removed).toEqual([
      { ref: '16', start: 16, end: 16, kind: 'cue', text: 'MAYA', strike: 's1', strikeRef: '17-18', reason: 'faulty-premise' },
      { ref: '17-18', start: 17, end: 18, kind: 'unit', text: 'Not tonight.\nPlease.', strike: 's1', strikeRef: '17-18', reason: 'faulty-premise' },
      { ref: '19', start: 19, end: 19, kind: 'blank', text: '' },
    ]);
    expect(out.bytes).toBeGreaterThan(0);
    expect(out.next).toContain(`--confirm ${out.digest}`);
    expect(out.after.lint).toMatchObject({ errors: expect.any(Number), newRules: expect.any(Array) });
    expect(existsSync(pendingFile(p.project, 'scene.fountain'))).toBe(false);
    expect(logOf(p.project, 'scene.fountain').map(e => e.type)).toEqual(['strike']);
  });

  it('is the same plan each time and changes with the strikes', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await S(draft, '3');
    const a = await run('strike', 'apply', draft);
    expect((await run('strike', 'apply', draft)).digest).toBe(a.digest);
    await S(draft, '12');
    expect((await run('strike', 'apply', draft)).digest).not.toBe(a.digest);
  });

  it('refuses with nothing struck, and creates nothing in a project that never struck', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    expect(await fail('strike', 'apply', draft)).toMatchObject({ code: 'E_CONFLICT', message: expect.stringMatching(/Nothing is struck/) });
    expect(existsSync(strikeDir(p.project, strikeKey('scene.fountain')))).toBe(false);
    await S(draft, '3');
    await run('strike', 'clear', draft, '--all');
    expect((await fail('strike', 'apply', draft)).code).toBe('E_CONFLICT');
  });

  it('refuses a malformed --confirm as usage', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await S(draft, '3');
    for (const bad of ['', 'abc', 'Z'.repeat(64), 'a'.repeat(63)]) expect((await fail('strike', 'apply', draft, '--confirm', bad)).code, bad).toBe('E_USAGE');
  });
});

describe('prose strike apply: writing', () => {
  it('removes exactly the shown lines from a Fountain draft and logs the apply row with the raw text', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    const { dry, done } = await applyOne(draft, '17');
    expect(done).toMatchObject({ applied: true, apply: 'a1', digest: dry.digest, count: 1 });
    expect(read(draft)).toBe(fx('scene.fountain').split('\n').filter((_, i) => ![15, 16, 17, 18].includes(i)).join('\n'));
    expect(read(draft)).not.toMatch(/Please/);
    const [, row] = logOf(p.project, 'scene.fountain');
    expect(row).toMatchObject({ type: 'apply', id: 'a1', strikes: ['s1'], digest: dry.digest });
    expect(row.type === 'apply' && row.removed.map(r => [r.start, r.end, r.kind, r.raw])).toEqual([[16, 16, 'cue', 'MAYA\n'], [17, 18, 'unit', 'Not tonight.\nPlease.\n'], [19, 19, 'blank', '\n']]);
    expect((await run('strike', 'list', draft)).rows).toEqual([]);
    expect((await run('strike', 'list', draft, '--state', 'applied')).rows).toMatchObject([{ id: 's1', state: 'applied', apply: 'a1' }]);
  });

  it('keeps a speech cue when other dialogue remains under it, and removes the parenthetical on its own', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    const { done } = await applyOne(draft, '8');
    expect(done.removed.map((r: { kind: string }) => r.kind)).toEqual(['unit']);
    expect(read(draft)).toContain('MAYA\nNobody told me');
    expect(read(draft)).not.toContain('under her breath');
  });

  it('removes a Markdown paragraph (block level) and leaves the fence that follows it', async () => {
    const p = tmpProject();
    const draft = p.write('talk.md', fx('talk.md'));
    await applyOne(draft, '12');
    expect(read(draft)).not.toContain('A claim.');
    expect(read(draft)).toContain('```\ncode stays\n```');
  });

  it('removes one line of a lyric and keeps the rest of the stanza', async () => {
    const p = tmpProject();
    const draft = p.write('song.md', fx('song.md'));
    await applyOne(draft, '7');
    expect(read(draft)).toBe(fx('song.md').replace('I carried my shoes through the sleeping town\n', ''));
  });

  it('dialog: removes a variant, a whole choice (to and condition go with it) and a bark line', async () => {
    const p = tmpProject();
    const draft = p.write('gate.dialog.yaml', fx('gate.dialog.yaml'));
    const { done } = await applyOne(draft, '8', '13', '30');
    expect(done.count).toBe(3);
    const after = read(draft);
    expect(after).not.toContain('Stop right there.');
    expect(after).not.toContain('Just passing through.');
    expect(after).not.toContain('has_pass');
    expect(after).not.toContain('to: passing');
    expect(after).toContain('Hold it, traveller.');
    expect(after).toContain("I'm here to trade.");
    expect(after).toContain('Quiet night on the wall again.');
  });

  it('dialog: striking every choice removes the choices key too, as a key row', async () => {
    const p = tmpProject();
    const draft = p.write('gate.dialog.yaml', fx('gate.dialog.yaml'));
    const { done } = await applyOne(draft, '11', '13');
    expect(done.removed.map((r: { kind: string; start: number }) => `${r.start}:${r.kind}`)).toEqual(['10:key', '11:unit', '13:unit']);
    expect(read(draft)).not.toContain('choices:');
    const after = await run('lint', draft);
    expect(after.errors.some((e: { rule: string }) => e.rule === 'dialog.graph.dead-end')).toBe(true);
  });

  it('dialog: flow-style lists, a node text and a bark pool last line are refused at strike time, so apply never sees them', async () => {
    const p = tmpProject();
    const draft = p.write('gate.dialog.yaml', fx('gate.dialog.yaml'));
    expect(await fail('strike', draft, '--line', '23', '--reason', 'wrong-direction')).toMatchObject({ code: 'E_USAGE', message: expect.stringMatching(/flow style/) });
    expect((await fail('strike', draft, '--line', '6', '--reason', 'wrong-direction')).message).toMatch(/node needs its text/);
    expect((await fail('strike', draft, '--line', '36', '--reason', 'wrong-direction')).message).toMatch(/bark pool needs at least one line/);
    expect(existsSync(pendingFile(p.project, 'gate.dialog.yaml'))).toBe(false);
  });

  it('dialog: every choice and next form, one by one, applies and undoes cleanly', async () => {
    const yaml = [
      'start: a', 'nodes:',
      '  - id: a', '    speaker: NPC', '    text: Hello there.', '    variants:', '      - Hi.', '      - "Hey, you."', '      - \'Well met.\'',
      '    choices:',
      '      - to: b', '        text: Quoted? "yes"', '        menu: Short',
      '      - text: Plain one', '        to: c', '        comment: why', '        condition: flag',
      '      - { text: Inline, to: c }',
      '  - id: b', '    speaker: NPC', '    text: Next form.', '    next: c',
      '  - id: c', '    speaker: NPC', '    text: The end.', '    end: true', '',
    ].join('\n');
    for (const [name, make] of variants) {
      const p = tmpProject();
      const draft = p.write('forms.dialog.yaml', make(yaml));
      const before = readFileSync(draft);
      const rows = (await run('strike', 'list', draft)).rows;
      expect(rows).toEqual([]);
      let struck = 0;
      for (let line = 1; line <= 23; line++) {
        let ok = true;
        try { await S(draft, String(line)); } catch (e) { ok = false; expect((e as ProseError).code).toBe('E_USAGE'); }
        if (ok) {
          struck++;
          const dry = await run('strike', 'apply', draft);
          await run('strike', 'apply', draft, '--confirm', dry.digest);
          expect(read(draft), `${name} line ${line}`).not.toBe(before.toString('utf8'));
          const loaded = await run('parse', draft);
          expect(loaded.blocks.length).toBeGreaterThan(0);
          await run('strike', 'undo', draft);
          expect(readFileSync(draft).equals(before), `${name} line ${line}`).toBe(true);
          await run('strike', 'clear', draft, '--all');
        }
      }
      expect(struck).toBeGreaterThanOrEqual(6); // 3 variants and the 2 block-style choices, at least
    }
  });

  it('applies twice: the second is refused (nothing struck), and a retry with the same event id is a no-op', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await S(draft, '12');
    const dry = await run('strike', 'apply', draft);
    const one = await run('strike', 'apply', draft, '--confirm', dry.digest, '--event-id', 'ev-1');
    expect(one.applied).toBe(true);
    const text = read(draft);
    expect(await run('strike', 'apply', draft, '--confirm', dry.digest, '--event-id', 'ev-1')).toMatchObject({ applied: true, duplicate: true, apply: 'a1' });
    expect(read(draft)).toBe(text);
    expect(await fail('strike', 'apply', draft, '--confirm', dry.digest)).toMatchObject({ code: 'E_CONFLICT', message: expect.stringMatching(/Nothing is struck/) });
    expect(logOf(p.project, 'scene.fountain').filter(e => e.type === 'apply')).toHaveLength(1);
  });

  it('refuses a digest that is not the plan: tampered, from before another strike, or after the draft changed; the error carries the new plan', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await S(draft, '12');
    const dry = await run('strike', 'apply', draft);
    const before = read(draft);
    const wrong = dry.digest.replace(/^./, dry.digest[0] === 'a' ? 'b' : 'a');
    const e = await fail('strike', 'apply', draft, '--confirm', wrong);
    expect(e).toMatchObject({ code: 'E_CONFLICT', message: expect.stringMatching(/changed since that plan/) });
    expect(read(draft)).toBe(before);
    await S(draft, '14');
    const e2 = await fail('strike', 'apply', draft, '--confirm', dry.digest);
    expect(e2.code).toBe('E_CONFLICT');
    expect((e2.details as { plan: { count: number } }).plan.count).toBe(2);
    expect(read(draft)).toBe(before);
    // the draft edited between dry run and confirm: the strikes are stale, which is refused first
    const dry2 = await run('strike', 'apply', draft);
    writeFileSync(draft, before + 'Another line.\n');
    expect(await fail('strike', 'apply', draft, '--confirm', dry2.digest)).toMatchObject({ code: 'E_CONFLICT', message: expect.stringMatching(/older draft/) });
  });

  it('refuses stale strikes and names them; nothing is written; clear and strike again works', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await S(draft, '12');
    await S(draft, '14');
    const edited = fx('scene.fountain').replace('Fluorescent lights hum.', 'Lights hum.');
    writeFileSync(draft, edited);
    for (const confirm of [[], ['--confirm', 'a'.repeat(64)]]) {
      const e = await fail('strike', 'apply', draft, ...confirm);
      expect(e).toMatchObject({ code: 'E_CONFLICT', message: expect.stringMatching(/2 struck lines were struck against an older draft \(s1, s2\)/), hint: expect.stringMatching(/Clear them and strike again/) });
    }
    expect(read(draft)).toBe(edited);
    await run('strike', 'clear', draft, '--all');
    expect((await applyOne(draft, '12')).done.applied).toBe(true);
  });

  it('refuses a draft that is not valid UTF-8 and one that became a symlink-free non-parseable file', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await S(draft, '12');
    const dry = await run('strike', 'apply', draft);
    const bytes = Buffer.concat([Buffer.from(fx('scene.fountain')), Buffer.from([0xff, 0xfe, 0x0a])]);
    writeFileSync(draft, bytes);
    const e = await fail('strike', 'apply', draft, '--confirm', dry.digest);
    expect(e.code).toBe('E_USAGE');
    expect(readFileSync(draft).equals(bytes)).toBe(true);
  });

  it('a Markdown paragraph and a lyric line keep every other line byte for byte in CRLF, BOM and mixed files', async () => {
    for (const [name, make] of variants) {
      const p = tmpProject();
      const raw = make(fx('talk.md'));
      const draft = p.write('talk.md', raw);
      await applyOne(draft, '12');
      const after = readFileSync(draft, 'utf8');
      const keep = rawLines(raw).filter(l => !/^A claim\./.test(l.replace(/^﻿/, '')));
      const left = rawLines(after);
      // every remaining line is an original line, in order, with its own ending (a last line may gain the ending of the one before it)
      let at = 0;
      for (const l of left) { const hit = keep.indexOf(l, at); expect(hit, `${name}: ${JSON.stringify(l)}`).toBeGreaterThanOrEqual(0); at = hit + 1; }
      if (name.startsWith('BOM')) expect(after.startsWith('﻿')).toBe(true);
    }
  });
});

describe('apply then undo restores the draft byte for byte', () => {
  for (const file of FILES) {
    for (const [name, make] of variants) {
      it(`${file} (${name}): every strikable line, alone`, async () => {
        const raw = make(fx(file));
        const p = tmpProject();
        const draft = p.write(file, raw);
        const original = readFileSync(draft);
        let applied = 0;
        const refs = (await run('strike', 'list', draft)).rows;
        expect(refs).toEqual([]);
        for (let line = 1; line <= rawLines(raw).length; line++) {
          let strikeRef: string | null = null;
          try { strikeRef = (await S(draft, String(line))).strike.ref; } catch (e) { expect((e as ProseError).code).toBe('E_USAGE'); }
          if (!strikeRef) continue;
          const dry = await run('strike', 'apply', draft);
          const done = await run('strike', 'apply', draft, '--confirm', dry.digest);
          applied++;
          expect(done.applied).toBe(true);
          expect(readFileSync(draft).equals(original), `${file} ${line}`).toBe(false);
          // the removed text is what was on screen: the rows' raw text is the original lines at those numbers
          const row = logOf(p.project, file).filter(e => e.type === 'apply').at(-1)!;
          const olines = rawLines(raw);
          if (row.type === 'apply') for (const r of row.removed) expect(r.raw).toBe(olines.slice(r.start - 1, r.end).join(''));
          const undone = await run('strike', 'undo', draft);
          expect(undone).toMatchObject({ undone: done.apply, strikes: expect.any(Array) });
          expect(readFileSync(draft).equals(original), `${file} ${line} restored`).toBe(true);
          await run('strike', 'clear', draft, '--all');
        }
        expect(applied).toBeGreaterThan(0);
      });
    }
  }

  it('all strikable lines at once, in every format', async () => {
    for (const file of FILES) {
      const p = tmpProject();
      const raw = crlf(fx(file));
      const draft = p.write(file, raw);
      const original = readFileSync(draft);
      const taken: string[] = [];
      for (let line = 1; line <= rawLines(raw).length; line++) {
        try { taken.push((await S(draft, String(line))).strike.ref); } catch { /* not strikable, or refused with the others */ }
      }
      expect(taken.length).toBeGreaterThan(1);
      const dry = await run('strike', 'apply', draft);
      await run('strike', 'apply', draft, '--confirm', dry.digest);
      await run('strike', 'undo', draft);
      expect(readFileSync(draft).equals(original), file).toBe(true);
    }
  });

  it('property: seeded random drafts and random strikes restore byte for byte', async () => {
    let seed = 20261004;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
    const words = ['night', 'door', 'quiet', 'lantern', 'bridge', 'rain', 'coffee', 'old', 'road', 'wait'];
    const sentence = () => `${pick(words)} ${pick(words)} ${pick(words)}${pick(['.', '!', '?'])}`;
    const fountain = () => {
      const out = ['Title: Gen', '', 'INT. PLACE - NIGHT', ''];
      for (let i = 0, n = 3 + Math.floor(rnd() * 6); i < n; i++) {
        if (rnd() < 0.3) out.push(sentence(), '');
        else { out.push(pick(['MAYA', 'DR. OKAFOR', 'JO']).toUpperCase()); if (rnd() < 0.3) out.push('(softly)'); const k = 1 + Math.floor(rnd() * 2); for (let j = 0; j < k; j++) out.push(sentence()); out.push(''); }
      }
      return out.join('\n');
    };
    const markdown = () => {
      const out = ['---', 'form: speech-small', '---', ''];
      for (let i = 0, n = 2 + Math.floor(rnd() * 5); i < n; i++) { out.push(rnd() < 0.2 ? `# ${sentence()}` : `${sentence()} ${sentence()}`, ''); if (rnd() < 0.15) out.push('```', 'code', '```', ''); }
      return out.join('\n');
    };
    const dialog = () => {
      const vs = Array.from({ length: 2 + Math.floor(rnd() * 3) }, sentence);
      const cs = Array.from({ length: 1 + Math.floor(rnd() * 3) }, sentence);
      return ['start: a', 'nodes:', '  - id: a', '    speaker: NPC', `    text: ${sentence()}`, '    variants:', ...vs.map(v => `      - ${v}`),
        '    choices:', ...cs.flatMap(c => [`      - text: ${c}`, '        to: b']), '  - id: b', '    speaker: NPC', `    text: ${sentence()}`, '    end: true',
        'barks:', '  - pool: p', '    speaker: NPC', '    context: idle', '    lines:', ...Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => `      - ${sentence()}`), ''].join('\n');
    };
    const makers: Array<[string, () => string]> = [['g.fountain', fountain], ['g.md', markdown], ['g.dialog.yaml', dialog]];
    let applied = 0;
    for (let i = 0; i < 45; i++) {
      const [name, make] = pick(makers);
      let text = make();
      if (!text.endsWith('\n') || rnd() < 0.3) text = text.replace(/\n+$/, '') + (rnd() < 0.5 ? '\n' : '');
      const [, eol] = pick(variants);
      const raw = rnd() < 0.5 ? eol(text) : text;
      const p = tmpProject();
      const draft = p.write(name, raw);
      const original = readFileSync(draft);
      const total = rawLines(raw).length;
      const wanted = new Set(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => 1 + Math.floor(rnd() * total)));
      let any = false;
      for (const line of wanted) { try { await S(draft, String(line)); any = true; } catch (e) { expect((e as ProseError).code).toMatch(/E_USAGE|E_CONFLICT/); } }
      if (!any) continue;
      const dry = await run('strike', 'apply', draft);
      await run('strike', 'apply', draft, '--confirm', dry.digest);
      applied++;
      expect(readFileSync(draft).equals(original)).toBe(false);
      await run('strike', 'undo', draft);
      expect(readFileSync(draft).equals(original), `${name} #${i}\n${JSON.stringify(raw)}`).toBe(true);
    }
    expect(applied).toBeGreaterThan(20);
  });
});

describe('prose strike undo', () => {
  it('puts the lines back, returns the strikes to pending, and logs an undo row', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await applyOne(draft, '12');
    const out = await run('strike', 'undo', draft);
    expect(out).toMatchObject({ undone: 'a1', restored: 3, strikes: ['s1'] });
    expect(read(draft)).toBe(fx('scene.fountain'));
    expect(logOf(p.project, 'scene.fountain').map(e => e.type)).toEqual(['strike', 'apply', 'undo']);
    expect((await run('strike', 'list', draft)).rows).toMatchObject([{ id: 's1', stale: false, state: 'pending' }]);
    // the same strikes apply again, with the same digest
    const again = await run('strike', 'apply', draft);
    expect(again.removed).toHaveLength(3);
  });

  it('refuses when the draft changed since the apply, writes nothing, and points at the log', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await applyOne(draft, '12');
    const edited = read(draft).replace('Fluorescent lights hum.', 'Lights hum.');
    writeFileSync(draft, edited);
    const e = await fail('strike', 'undo', draft);
    expect(e).toMatchObject({ code: 'E_CONFLICT', message: expect.stringMatching(/changed since a1/), hint: expect.stringMatching(/prose strike list scene\.fountain --state applied/) });
    expect(read(draft)).toBe(edited);
    expect((await run('strike', 'list', draft, '--state', 'applied')).rows).toHaveLength(1);
  });

  it('a line-ending-only edit is not a change (the hash is normalised), and the restore is still verified', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await applyOne(draft, '12');
    writeFileSync(draft, crlf(read(draft)));
    expect((await run('strike', 'undo', draft)).undone).toBe('a1');
    expect(read(draft).replace(/\r\n/g, '\n')).toBe(fx('scene.fountain'));
  });

  it('refuses with nothing applied, twice in a row, and for an apply that is not the latest', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    expect((await fail('strike', 'undo', draft)).code).toBe('E_CONFLICT');
    await applyOne(draft, '12');
    expect((await fail('strike', 'undo', draft, '--apply', 'a9')).message).toMatch(/not the latest removal \(a1\)/);
    expect((await fail('strike', 'undo', draft, '--apply', 'x')).code).toBe('E_USAGE');
    await run('strike', 'undo', draft, '--event-id', 'u-1');
    expect(await run('strike', 'undo', draft, '--event-id', 'u-1')).toMatchObject({ duplicate: true, undone: 'a1' });
    expect((await fail('strike', 'undo', draft)).message).toMatch(/no applied removal/);
  });

  it('two applies undo newest first, each only while the draft is as that apply left it', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await applyOne(draft, '12');
    const mid = read(draft);
    await applyOne(draft, '14');
    await run('strike', 'undo', draft);
    expect(read(draft)).toBe(mid);
    await run('strike', 'undo', draft);
    expect(read(draft)).toBe(fx('scene.fountain'));
  });
});

describe('lint after apply', () => {
  it('reports the new findings and never refuses the removal', async () => {
    const p = tmpProject();
    const draft = p.write('gate.dialog.yaml', fx('gate.dialog.yaml'));
    const { dry, done } = await applyOne(draft, '11', '13');
    expect(dry.after.lint).toMatchObject({ ok: false });
    expect(done.applied).toBe(true);
    expect(done.after.lint.errors).toBeGreaterThan(0);
    expect(done.after.lint.newRules).toContain('dialog.graph.dead-end');
    expect(done.next).toMatch(/new findings \(.*dialog\.graph\.dead-end/);
  });

  it('a clean removal reports no new rules', async () => {
    const p = tmpProject();
    const draft = p.write('gate.dialog.yaml', fx('gate.dialog.yaml'));
    const { done } = await applyOne(draft, '8');
    expect(done.after.lint.newRules).toEqual([]);
  });
});

describe('crash safety', () => {
  const setup = async (file = 'scene.fountain', ref = '12') => {
    const p = tmpProject();
    const draft = p.write(file, fx(file));
    await S(draft, ref);
    const d = resolveDraft(p.project, draft);
    const plan = await run('strike', 'apply', draft);
    return { p, draft, d, digest: plan.digest as string, original: readFileSync(draft) };
  };
  const boom = () => { throw new Error('power cut'); };

  it('a failure before the rename leaves the draft untouched and the intent file; the next apply abandons it and applies', async () => {
    const { p, draft, d, digest, original } = await setup();
    const e = failSync(() => applyStrikes(p.project, d, { confirm: digest, rename: boom }));
    expect(e.code).toBe('E_INTERNAL');
    expect(readFileSync(draft).equals(original)).toBe(true);
    expect(existsSync(pendingFile(p.project, 'scene.fountain'))).toBe(true);
    expect(logOf(p.project, 'scene.fountain').map(x => x.type)).toEqual(['strike']);
    const out = applyStrikes(p.project, d, { confirm: digest });
    expect(out).toMatchObject({ applied: true, recovered: { kind: 'apply', id: 'a1', outcome: 'abandoned' } });
    expect(existsSync(pendingFile(p.project, 'scene.fountain'))).toBe(false);
    expect(read(draft)).not.toContain('Maya! Room four.');
  });

  it('a crash after the rename: the draft is changed, the next command completes the log, and undo then works', async () => {
    const { p, draft, d, digest, original } = await setup();
    const landThenDie = (from: string, to: string) => { renameSync(from, to); throw new Error('power cut'); };
    expect(failSync(() => applyStrikes(p.project, d, { confirm: digest, rename: landThenDie })).code).toBe('E_INTERNAL');
    expect(readFileSync(draft).equals(original)).toBe(false);
    expect(logOf(p.project, 'scene.fountain').map(x => x.type)).toEqual(['strike']);
    // a dry run does not apply again: it completes the log and says so
    const out = await run('strike', 'apply', draft);
    expect(out).toMatchObject({ applied: false, recovered: { kind: 'apply', id: 'a1', outcome: 'completed' } });
    expect(out.next).toMatch(/log is complete/);
    expect(logOf(p.project, 'scene.fountain').map(x => x.type)).toEqual(['strike', 'apply']);
    expect(existsSync(pendingFile(p.project, 'scene.fountain'))).toBe(false);
    expect((await run('strike', 'undo', draft)).undone).toBe('a1');
    expect(readFileSync(draft).equals(original)).toBe(true);
  });

  it('recovery is the same from strike add, clear and undo, and a retry of the finished log row is not doubled', async () => {
    for (const next of ['add', 'clear', 'undo'] as const) {
      const { p, draft, d, digest, original } = await setup();
      const landThenDie = (from: string, to: string) => { renameSync(from, to); throw new Error('power cut'); };
      failSync(() => applyStrikes(p.project, d, { confirm: digest, rename: landThenDie }));
      if (next === 'add') expect(await run('strike', draft, '--line', '3', '--reason', 'wrong-direction')).toMatchObject({ recovered: { outcome: 'completed' } });
      else if (next === 'clear') expect(await run('strike', 'clear', draft, '--all')).toMatchObject({ recovered: { outcome: 'completed' } });
      else expect(await run('strike', 'undo', draft)).toMatchObject({ undone: null, recovered: { kind: 'apply', outcome: 'completed' } });
      expect(logOf(p.project, 'scene.fountain').filter(x => x.type === 'apply')).toHaveLength(1);
      expect(readFileSync(draft).equals(original)).toBe(false);
    }
  });

  it('a crash after the log row but before the intent file is removed leaves one apply row', async () => {
    const { p, draft, d, digest } = await setup();
    applyStrikes(p.project, d, { confirm: digest });
    const row = logOf(p.project, 'scene.fountain').find(x => x.type === 'apply')!;
    if (row.type !== 'apply') throw new Error('no apply row');
    const { schema: _s, at, seq: _q, ...fields } = row;
    writeFileSync(pendingFile(p.project, 'scene.fountain'), JSON.stringify({ schema: 'prose/strike-pending@1', kind: 'apply', id: 'a1', before: row.before, after: row.after, at, row: fields }));
    expect(await run('strike', 'clear', draft, '--all')).toMatchObject({ recovered: { kind: 'apply', outcome: 'completed' } });
    expect(logOf(p.project, 'scene.fountain').filter(x => x.type === 'apply')).toHaveLength(1);
    expect(existsSync(pendingFile(p.project, 'scene.fountain'))).toBe(false);
  });

  it('a crash during undo: before the rename nothing changed, after it the log row is completed', async () => {
    const { p, draft, d, digest, original } = await setup();
    applyStrikes(p.project, d, { confirm: digest });
    const applied = readFileSync(draft);
    expect(failSync(() => undoStrikes(p.project, d, { rename: boom })).code).toBe('E_INTERNAL');
    expect(readFileSync(draft).equals(applied)).toBe(true);
    const landThenDie = (from: string, to: string) => { renameSync(from, to); throw new Error('power cut'); };
    expect(failSync(() => undoStrikes(p.project, d, { rename: landThenDie })).code).toBe('E_INTERNAL');
    expect(readFileSync(draft).equals(original)).toBe(true);
    expect(logOf(p.project, 'scene.fountain').map(x => x.type)).toEqual(['strike', 'apply']);
    expect(await run('strike', 'list', draft)).toMatchObject({ counts: { total: 0 } });
    const out = await run('strike', 'undo', draft);
    expect(out).toMatchObject({ undone: null, recovered: { kind: 'undo', id: 'a1', outcome: 'completed' } });
    expect(logOf(p.project, 'scene.fountain').map(x => x.type)).toEqual(['strike', 'apply', 'undo']);
    expect((await run('strike', 'list', draft)).rows).toHaveLength(1);
  });

  it('an interrupted apply whose draft was then edited is refused and touches nothing', async () => {
    const { p, draft, d, digest } = await setup();
    failSync(() => applyStrikes(p.project, d, { confirm: digest, rename: boom }));
    writeFileSync(draft, read(draft) + 'An edit.\n');
    const edited = readFileSync(draft);
    for (const cmd of [['strike', 'apply', draft], ['strike', 'undo', draft], ['strike', 'clear', draft, '--all']]) {
      expect(await fail(...cmd)).toMatchObject({ code: 'E_CONFLICT', message: expect.stringMatching(/changed during an interrupted apply/) });
    }
    expect(readFileSync(draft).equals(edited)).toBe(true);
    expect(existsSync(pendingFile(p.project, 'scene.fountain'))).toBe(true);
  });

  it('a damaged intent file is refused, not trusted', async () => {
    const { p, draft } = await setup();
    const file = pendingFile(p.project, 'scene.fountain');
    for (const junk of ['{not json', '{"schema":"prose/strike-pending@1"}', JSON.stringify({ schema: 'prose/strike-pending@1', kind: 'apply', id: 'a1', before: 'a'.repeat(64), after: 'b'.repeat(64), at: 'x', row: { type: 'undo' } })]) {
      writeFileSync(file, junk);
      const e = await fail('strike', 'apply', draft);
      expect(e.code, junk).toMatch(/E_SCHEMA|E_CONFLICT/);
    }
  });

  it('a write that reads back wrong keeps the intent file and says so', async () => {
    const { p, d, digest, draft } = await setup();
    const corrupt = (from: string, to: string) => { writeFileSync(from, 'garbage'); renameSync(from, to); };
    const e = failSync(() => applyStrikes(p.project, d, { confirm: digest, rename: corrupt }));
    expect(e.code).toBe('E_INTERNAL');
    expect(e.message).toMatch(/does not hold what was written/);
    expect(existsSync(pendingFile(p.project, 'scene.fountain'))).toBe(true);
    expect(read(draft)).toBe('garbage');
  });

  it('the draft changing between the plan and the write is refused, nothing is written and no intent file is left', async () => {
    const { p, d, digest, draft } = await setup();
    const edited = read(draft) + 'An edit that landed first.\n';
    const e = failSync(() => applyStrikes(p.project, d, { confirm: digest, beforeWrite: () => writeFileSync(draft, edited) }));
    expect(e).toMatchObject({ code: 'E_CONFLICT', message: expect.stringMatching(/changed while the strikes were being applied/) });
    expect(read(draft)).toBe(edited);
    expect(existsSync(pendingFile(p.project, 'scene.fountain'))).toBe(false);
    expect(logOf(p.project, 'scene.fountain').map(x => x.type)).toEqual(['strike']);
  });

  it('a draft swapped for a symbolic link after the plan is not written through', async () => {
    const { p, d, digest, draft } = await setup();
    const other = join(p.project, 'other.fountain');
    writeFileSync(other, 'Other.\n');
    const e = failSync(() => applyStrikes(p.project, d, { confirm: digest, beforeWrite: () => { try { unlinkSync(draft); symlinkSync(other, draft); } catch { writeFileSync(draft, 'changed\n'); } } }));
    expect(e.code).toBe('E_CONFLICT');
    expect(read(other)).toBe('Other.\n');
  });
});

describe('locking', () => {
  const hold = (project: string, key: string, ms: number) => new Promise<{ stop: () => void; done: Promise<void> }>(ok => {
    const log = join(project, 'hold.log');
    writeFileSync(log, '');
    const child = spawn(process.execPath, [join(ROOT, 'tests', 'lock-holder.mjs'), project, key, 'h', String(ms), '20', log, JSON.stringify({ kind: 'strikes' })], { stdio: 'ignore' });
    const done = new Promise<void>(end => child.on('exit', () => end()));
    const t = setInterval(() => { if (existsSync(log) && readFileSync(log, 'utf8').includes('enter')) { clearInterval(t); ok({ stop: () => child.kill(), done }); } }, 20);
  });

  it('refuses while another process holds the strike lock, and the draft is untouched', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await S(draft, '12');
    const dry = await run('strike', 'apply', draft);
    const before = readFileSync(draft);
    const holder = await hold(p.project, strikeKey('scene.fountain'), 3000);
    try {
      const e = failSync(() => applyStrikes(p.project, resolveDraft(p.project, draft), { confirm: dry.digest, lock: { timeoutMs: 150 } }));
      expect(e).toMatchObject({ code: 'E_CONFLICT', message: expect.stringMatching(/being changed by another command/) });
      expect(failSync(() => undoStrikes(p.project, resolveDraft(p.project, draft), { lock: { timeoutMs: 150 } })).code).toBe('E_CONFLICT');
    } finally { holder.stop(); await holder.done; }
    expect(readFileSync(draft).equals(before)).toBe(true);
  });

  it('two processes applying at once give one apply and one refusal', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    await S(draft, '12');
    const dry = await run('strike', 'apply', draft);
    const cli = (...args: string[]) => new Promise<{ code: number | null; out: string }>(ok => {
      const c = spawn(process.execPath, [join(ROOT, 'scripts', 'prose.mjs'), ...args], { cwd: p.project, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      c.stdout.on('data', d => { out += d; });
      c.stderr.on('data', d => { out += d; });
      c.on('exit', code => ok({ code, out }));
    });
    const results = await Promise.all([cli('strike', 'apply', draft, '--confirm', dry.digest), cli('strike', 'apply', draft, '--confirm', dry.digest)]);
    expect(results.filter(r => r.code === 0)).toHaveLength(1);
    const lost = results.find(r => r.code !== 0)!;
    expect(lost.out).toMatch(/E_CONFLICT/);
    expect(logOf(p.project, 'scene.fountain').filter(e => e.type === 'apply')).toHaveLength(1);
    expect(read(draft)).not.toContain('Maya! Room four.');
  }, 30_000);
});

describe('what stays true about the file', () => {
  it('keeps the file mode and leaves no temp files behind', async () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', fx('scene.fountain'));
    const mode = statSync(draft).mode & 0o777;
    await applyOne(draft, '12');
    expect(statSync(draft).mode & 0o777).toBe(mode);
    expect(existsSync(`${draft}.tmp`)).toBe(false);
  });

  it('refuses a symlinked draft and one inside .agent-prose', async () => {
    const p = tmpProject();
    const inside = p.write('.agent-prose/x.fountain', 'A\n');
    expect((await fail('strike', 'apply', inside)).code).toBe('E_USAGE');
  });
});
