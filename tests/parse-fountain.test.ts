import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFountain } from '../src/parse/fountain.ts';
import { fixture } from './helpers.ts';

describe('parseFountain', () => {
  const { meta, blocks } = parseFountain(readFileSync(fixture('pilot.fountain'), 'utf8'));

  it('reads the title page', () => {
    expect(meta).toEqual({ title: 'Night Shift', credit: 'Written by', author: 'A. Writer', form: 'tv-drama' });
  });

  it('classifies every element with its source line', () => {
    expect(blocks.map(b => [b.kind, b.line, b.speaker ?? null])).toEqual([
      ['scene', 6, null],
      ['action', 8, null],
      ['parenthetical', 11, 'MAYA'],
      ['line', 12, 'MAYA'],
      ['line', 15, 'DR. OKAFOR'],
      ['action', 17, null],
      ['transition', 19, null],
      ['scene', 21, null],
      ['note', 23, null],
      ['synopsis', 28, null],
      ['lyric', 30, null],
      ['centered', 31, null],
    ]);
  });

  it('keeps extensions, strips forcing marks and drops the boneyard', () => {
    expect(blocks[4]).toEqual({ kind: 'line', text: 'Maya! Room four.', line: 15, speaker: 'DR. OKAFOR', meta: { speech: 1, extension: 'O.S.' } });
    expect(blocks[5].text).toBe('CRASH FROM ROOM FOUR.');
    expect(blocks[7].text).toBe('FLASHBACK - THE ER');
    expect(blocks.some(b => b.text.includes('Old line'))).toBe(false);
  });

  it('does not read multi-cam ALL CAPS action as a character cue', () => {
    const { blocks: b } = parseFountain('\nMAYA ENTERS. SHE DROPS THE TRAY.\nEVERYONE TURNS.\n');
    expect(b).toEqual([{ kind: 'action', text: 'MAYA ENTERS. SHE DROPS THE TRAY. EVERYONE TURNS.', line: 2 }]);
  });

  it('reads scene numbers and dual dialogue', () => {
    const { blocks: b } = parseFountain('\nEXT. ROOF - DAY #12A#\n\nA ^\nNow!\n');
    expect(b[0]).toEqual({ kind: 'scene', text: 'EXT. ROOF - DAY', line: 2, meta: { number: '12A' } });
    expect(b[1]).toEqual({ kind: 'line', text: 'Now!', line: 5, speaker: 'A', meta: { speech: 0, dual: true } });
  });

  it('stamps a running speech index on every line and parenthetical of one cue', () => {
    const { blocks: b } = parseFountain('\nBOB\n(quietly)\nHi.\n(beat)\nBye.\n\nBOB\nAgain.\n');
    expect(b.map(x => [x.kind, x.meta?.speech])).toEqual([['parenthetical', 0], ['line', 0], ['parenthetical', 0], ['line', 0], ['line', 1]]);
  });
});

describe('parseFountain real-script robustness', () => {
  it('splits CR-only line endings', () => {
    const { blocks: b } = parseFountain('\rINT. ROOM - DAY\r\rShe waits.\r');
    expect(b.map(x => [x.kind, x.line])).toEqual([['scene', 2], ['action', 4]]);
  });

  it('reads a scene heading followed directly by action, never as a cue', () => {
    const { blocks: b } = parseFountain('\nINT. X - DAY\nShe waits.\n');
    expect(b).toEqual([
      { kind: 'scene', text: 'INT. X - DAY', line: 2 },
      { kind: 'action', text: 'She waits.', line: 3 },
    ]);
  });

  it("strips every extension from the speaker and drops CONT'D", () => {
    const { blocks: b } = parseFountain("\nMAYA (V.O.) (CONT'D)\nStill here.\n");
    expect(b).toEqual([{ kind: 'line', text: 'Still here.', line: 3, speaker: 'MAYA', meta: { speech: 0, extension: 'V.O.' } }]);
  });

  it('removes emphasis from the speaker name', () => {
    const { blocks: b } = parseFountain('\n**BOB**\nHi.\n');
    expect(b).toEqual([{ kind: 'line', text: 'Hi.', line: 3, speaker: 'BOB', meta: { speech: 0 } }]);
  });

  it('removes multi-line notes, including two-space lines, and emits them at their first line', () => {
    // Fountain 1.1: a blank line inside a note is written as a line of exactly two spaces.
    const { blocks: b } = parseFountain('\nShe waits. [[a note\n  \nspanning lines]]\n\nHe leaves.\n');
    expect(b.map(x => [x.kind, x.line, x.text])).toEqual([
      ['action', 2, 'She waits.'],
      ['note', 2, 'a note\n\nspanning lines'],
      ['action', 6, 'He leaves.'],
    ]);
  });
});

describe('parseFountain notes and heading edge cases', () => {
  const kinds = (src: string) => parseFountain(src).blocks.map(x => [x.kind, x.speaker ?? null, x.text]);

  it('does not let a note-only line end dialogue', () => {
    const b = parseFountain('\nMAYA\nHello.\n[[a note]]\nGoodbye.').blocks;
    expect(b.some(x => x.kind === 'action')).toBe(false);
    expect(b.filter(x => x.kind === 'line').every(x => x.speaker === 'MAYA')).toBe(true);
    expect(b.filter(x => x.kind === 'line').map(x => x.text).join(' ')).toBe('Hello. Goodbye.');
    expect(b.filter(x => x.kind === 'note').map(x => x.text)).toEqual(['a note']);
  });

  it('does not let a note-only line between cue and dialogue break the cue', () => {
    expect(kinds('\nMAYA\n[[beat]]\nHello.\n')).toEqual([
      ['note', null, 'beat'],
      ['line', 'MAYA', 'Hello.'],
    ]);
  });

  it('does not let a note-only line end the title page', () => {
    const { meta } = parseFountain('Title: X\n[[n]]\nAuthor: Y\n\nINT. ROOM - DAY\n');
    expect(meta).toEqual({ title: 'X', author: 'Y' });
  });

  it('keeps an unclosed note as literal text and does not swallow the script', () => {
    expect(kinds('She [[oops\n\nINT. ROOM - DAY\n\nMAYA\nHi.\n\n[[real]]\n')).toEqual([
      ['action', null, 'She [[oops'],
      ['scene', null, 'INT. ROOM - DAY'],
      ['line', 'MAYA', 'Hi.'],
      ['note', null, 'real'],
    ]);
  });

  it('ends a note at a truly empty line even with no later [[ in the file', () => {
    // Guards the empty-line lookahead in NOTE: without it, [[x\n\ny]] would match as one note.
    const b = parseFountain('\nA [[x\n\ny]] b.\n').blocks;
    expect(b.some(x => x.kind === 'note')).toBe(false);
    expect(b.map(x => x.kind)).toEqual(['action', 'action']);
    expect(b[0].text.startsWith('A')).toBe(true);
    expect(b[1].text.startsWith('y')).toBe(true);
  });

  it('continues dialogue across a line of exactly two spaces', () => {
    // Fountain 1.1: inside dialogue, a two-space line is part of the speech, not a blank line.
    const b = parseFountain('\nMAYA\nHi.\n  \nBye.\n').blocks;
    expect(b.some(x => x.kind === 'action')).toBe(false);
    const said = b.filter(x => x.kind === 'line');
    expect(said.every(x => x.speaker === 'MAYA')).toBe(true);
    const text = said.map(x => x.text).join(' ');
    expect(text).toContain('Hi.');
    expect(text).toContain('Bye.');
  });

  it('does not nest notes', () => {
    expect(kinds('\nA [[x [[y]] b.\n')).toEqual([
      ['action', null, 'A [[x b.'],
      ['note', null, 'y'],
    ]);
  });

  it('reads a mixed-case line starting with a heading prefix as action unless a blank line follows', () => {
    expect(kinds('\nEst. 1990 the plaque reads.\nMore.\n')).toEqual([['action', null, 'Est. 1990 the plaque reads. More.']]);
  });
});
