import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Format } from '../src/kinds.ts';
import { strikeLines } from '../src/strike/lines.ts';
import { VERIFY_BUDGET, planRemoval, rawLines, simulateRemoval, verifiedLines, withoutRows } from '../src/strike/plan.ts';
import { fixture } from './helpers.ts';

const read = (name: string) => readFileSync(fixture(`strike/${name}`), 'utf8').replace(/\r\n/g, '\n');
const lineAt = (text: string, format: Format, form: string | undefined, ref: string) => {
  const l = strikeLines(text, format, form).find(x => x.ref === ref);
  if (!l) throw new Error(`no line ${ref}`);
  return l;
};
const strike = (text: string, format: Format, form: string | undefined, ...refs: string[]) =>
  simulateRemoval(text, format, form, refs.map((r, k) => ({ line: lineAt(text, format, form, r), strike: `s${k + 1}` })));
const kinds = (s: ReturnType<typeof strike>) => (s.ok ? s.removed.map(r => `${r.start}-${r.end}:${r.kind}`) : s.why);

describe('strike lines', () => {
  it('lists one line per ref with the speaker apart, break flags, and the removal range', () => {
    const l = strikeLines(read('scene.fountain'), 'fountain');
    expect(l.map(x => [x.ref, x.speaker ?? '', x.break])).toEqual([
      ['3', '', false], ['5', '', true], ['8', '', true], ['9', 'MAYA', false], ['12', 'DR. OKAFOR', true], ['14', '', true], ['17-18', 'MAYA', true], ['20', '', true],
    ]);
    expect(l.every(x => x.strikable)).toBe(true);
  });

  it('a Markdown paragraph is one line over its block, whatever its sentences', () => {
    const l = strikeLines(read('talk.md'), 'markdown', 'speech-small');
    expect(l.find(x => x.ref === '7-8')).toMatchObject({ text: 'We built it in the rain. It took four years! Did anyone believe us?', units: [1, 2, 3] });
  });

  it('a dialog choice removes its whole entry, not just the text line', () => {
    const l = strikeLines(read('gate.dialog.yaml'), 'dialog');
    expect(l.find(x => x.ref === '11')).toMatchObject({ removal: [11, 12], strikable: true });
    expect(l.find(x => x.ref === '13')).toMatchObject({ removal: [13, 15] });
  });

  it('refuses what the rules say cannot be struck, with a reason an owner can read', () => {
    const l = strikeLines(read('gate.dialog.yaml'), 'dialog');
    expect(l.find(x => x.ref === '6')).toMatchObject({ strikable: false, why: expect.stringMatching(/node needs its text/) });
    expect(l.find(x => x.ref === '23')).toMatchObject({ strikable: false, why: expect.stringMatching(/flow style/) });
    expect(l.find(x => x.ref === '36')).toMatchObject({ strikable: false, why: expect.stringMatching(/bark pool needs at least one line/) });
  });

  it('a unit too long to record is not strikable', () => {
    const l = strikeLines(`${'word '.repeat(500)}.\n`, 'markdown');
    expect(l[0]).toMatchObject({ strikable: false, why: expect.stringMatching(/too long/) });
  });

  it('has no lines for an empty draft', () => {
    expect(strikeLines('', 'markdown')).toEqual([]);
  });
});

describe('removal: Fountain', () => {
  const text = read('scene.fountain');
  it('takes the speaker cue with a speech that was all its cue had, and one blank line', () => {
    const s = strike(text, 'fountain', undefined, '17-18');
    expect(kinds(s)).toEqual(['16-16:cue', '17-18:unit', '19-19:blank']);
    expect(s.ok && s.after).not.toMatch(/Please|Not tonight/);
    expect(s.ok && s.after.split('\n').slice(-3)).toEqual(['', 'CUT TO:', '']);
  });

  it('keeps the cue while a parenthetical is left under it, and drops it once both go', () => {
    expect(kinds(strike(text, 'fountain', undefined, '9'))).toEqual(['9-9:unit']);
    expect(kinds(strike(text, 'fountain', undefined, '8', '9'))).toEqual(['7-7:cue', '8-8:unit', '9-9:unit', '10-10:blank']);
  });

  it('removes an action line and one adjacent blank, leaving single-blank separation', () => {
    const s = strike(text, 'fountain', undefined, '14');
    expect(kinds(s)).toEqual(['14-14:unit', '15-15:blank']);
    expect(s.ok && s.after).not.toMatch(/\n\n\n/);
  });

  it('keeps each remaining line ending in a CRLF draft with a BOM, and the removed raw lines say so', () => {
    const crlf = '﻿' + text.replace(/\n/g, '\r\n');
    const s = strike(crlf, 'fountain', undefined, '17-18');
    expect(s.ok && s.after.startsWith('﻿Title')).toBe(true);
    expect(s.ok && s.after.includes('\n') && !/[^\r]\n/.test(s.after)).toBe(true);
    expect(s.ok && s.removed.map(r => r.raw)).toEqual(['MAYA\r\n', 'Not tonight.\r\nPlease.\r\n', '\r\n']);
  });

  it('a first line takes its BOM with it, and a lone CR draft is split like any other', () => {
    const s = strike('﻿INT. ROOM - DAY\r\rMara walks.\r', 'fountain', undefined, '1');
    expect(s.ok && s.removed[0].raw).toBe('﻿INT. ROOM - DAY\r');
    expect(s.ok && s.after).toBe('Mara walks.\r');
  });
});

describe('removal: Markdown', () => {
  const text = read('talk.md');
  it('removes a paragraph and one blank line', () => {
    const s = strike(text, 'markdown', 'speech-small', '7-8');
    expect(kinds(s)).toEqual(['7-8:unit', '9-9:blank']);
  });

  it('removes a paragraph that ends at a fence without touching the fence', () => {
    const s = strike(text, 'markdown', 'speech-small', '12');
    expect(s.ok && s.after).toContain('```\ncode stays\n```');
  });

  it('removes one line of a lyric, and a verse line between others needs no blank', () => {
    const song = read('song.md');
    const s = strike(song, 'markdown', 'song', '7');
    expect(kinds(s)).toEqual(['7-7:unit']);
    expect(s.ok && s.after).toContain('[Verse 1]\nThe road was long and the night came down\n\n[Chorus]');
  });

  it('refuses a removal that would change another unit, with the reason', () => {
    // A removal range that swallows a fence (as a hand-made, wrong span would) is caught by the invariant.
    const s = simulateRemoval('Alpha.\n```\ncode\n```\n', 'markdown', undefined, [{ line: { ...lineAt('Alpha.\n```\ncode\n```\n', 'markdown', undefined, '1'), removal: [1, 2] } }]);
    expect(s).toEqual({ ok: false, why: 'removing it would change other lines of the draft' });
  });
});

describe('removal: dialog YAML', () => {
  const text = read('gate.dialog.yaml');
  it('removes a variant entry and nothing else', () => {
    const s = strike(text, 'dialog', undefined, '8');
    expect(kinds(s)).toEqual(['8-8:unit']);
    expect(s.ok && s.after).not.toContain('Stop right there');
    expect(s.ok && s.after).toContain('Hold it, traveller.');
  });

  it('removes a choice with its `to:` and `condition:`', () => {
    const s = strike(text, 'dialog', undefined, '13');
    expect(kinds(s)).toEqual(['13-15:unit']);
    expect(s.ok && s.after).not.toContain('has_pass');
  });

  it('removing every variant also removes the `variants:` key, and every choice the `choices:` key', () => {
    expect(kinds(strike(text, 'dialog', undefined, '8', '9'))).toEqual(['7-7:key', '8-8:unit', '9-9:unit']);
    expect(kinds(strike(text, 'dialog', undefined, '11', '13'))).toEqual(['10-10:key', '11-12:unit', '13-15:unit']);
    const s = strike(text, 'dialog', undefined, '11', '13');
    expect(s.ok && s.after).toContain('Hold it, traveller.\n  - id: trade');
  });

  it('striking all but one bark line is fine; the last is refused', () => {
    expect(strike(text, 'dialog', undefined, '30').ok).toBe(true);
    expect(strike(text, 'dialog', undefined, '31').ok).toBe(true);
    expect(strike(text, 'dialog', undefined, '30', '31')).toEqual({ ok: false, why: 'a bark pool needs at least one line; rewrite it instead' });
    expect(strike(text, 'dialog', undefined, '36')).toEqual({ ok: false, why: expect.stringMatching(/bark pool/) });
  });

  it('refuses a node text and a flow-style list with the static reason', () => {
    expect(strike(text, 'dialog', undefined, '6')).toEqual({ ok: false, why: expect.stringMatching(/node needs its text/) });
    expect(strike(text, 'dialog', undefined, '23')).toEqual({ ok: false, why: expect.stringMatching(/flow style/) });
  });

  it('a CRLF dialog draft keeps its endings', () => {
    const s = strike(text.replace(/\n/g, '\r\n'), 'dialog', undefined, '8');
    expect(s.ok && s.after.split('\r\n').length).toBe(text.split('\n').length - 1);
  });
});

describe('verified lines and the plan', () => {
  it('settles strikable by simulation for every format fixture', () => {
    for (const [file, format, form] of [['scene.fountain', 'fountain', undefined], ['talk.md', 'markdown', 'speech-small'], ['song.md', 'markdown', 'song'], ['gate.dialog.yaml', 'dialog', undefined]] as const) {
      const t = read(file);
      const lines = verifiedLines(t, format, form, strikeLines(t, format, form));
      expect(lines.length, file).toBeGreaterThan(0);
      for (const l of lines.filter(x => x.strikable)) expect(simulateRemoval(t, format, form, [{ line: l }]).ok, `${file} ${l.ref}`).toBe(true);
    }
  });

  it('a line past the verification budget keeps the static answer', () => {
    const many = Array.from({ length: VERIFY_BUDGET + 5 }, (_, k) => `Line number ${k + 1}.`).join('\n\n');
    const lines = verifiedLines(many, 'markdown', undefined, strikeLines(many, 'markdown'));
    expect(lines.every(l => l.strikable)).toBe(true);
  });

  it('the digest names exactly the plan: another draft hash, strike or reason changes it', () => {
    const t = read('scene.fountain');
    const a = lineAt(t, 'fountain', undefined, '14');
    const b = lineAt(t, 'fountain', undefined, '20');
    const plan = (hash: string, reason = 'wrong-direction', ref = '14', line = a) => planRemoval(t, 'fountain', undefined, hash, [{ id: 's1', ref, reason, line }]).digest;
    expect(plan('h')).toMatch(/^[0-9a-f]{64}$/);
    expect(plan('h')).toBe(plan('h'));
    expect(plan('h2')).not.toBe(plan('h'));
    expect(plan('h', 'faulty-premise')).not.toBe(plan('h'));
    expect(plan('h', 'wrong-direction', '20', b)).not.toBe(plan('h'));
  });

  it('a plan that breaks the invariant is E_CONFLICT with the reason', () => {
    const t = read('gate.dialog.yaml');
    const l = lineAt(t, 'dialog', undefined, '30');
    const l2 = lineAt(t, 'dialog', undefined, '31');
    expect(() => planRemoval(t, 'dialog', undefined, 'h', [{ id: 's1', ref: '30', reason: 'x', line: l }, { id: 's2', ref: '31', reason: 'x', line: l2 }])).toThrow(/bark pool/);
  });

  it('withoutRows then the raw rows put back is the original text', () => {
    const t = '﻿' + read('scene.fountain').replace(/\n/g, '\r\n');
    const s = strike(t, 'fountain', undefined, '17-18', '14');
    if (!s.ok) throw new Error(s.why);
    const lines = rawLines(s.after);
    const all = rawLines(t);
    const rebuilt: string[] = [];
    let k = 0;
    for (let n = 1; n <= all.length; n++) {
      const row = s.removed.find(r => r.start <= n && n <= r.end);
      if (row) { rebuilt.push(rawLines(row.raw)[n - row.start]); } else rebuilt.push(lines[k++]);
    }
    expect(rebuilt.join('')).toBe(t);
    expect(withoutRows(t, s.removed)).toBe(s.after);
  });
});
