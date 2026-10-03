import { describe, expect, it } from 'vitest';
import { loadDocument } from '../src/document.ts';
import { getForm } from '../src/forms.ts';
import { measureSpoken } from '../src/measure/spoken.ts';
import { measureScript, scriptLines } from '../src/measure/script.ts';
import type { Block } from '../src/ir.ts';
import { fixture } from './helpers.ts';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFountain } from '../src/parse/fountain.ts';

describe('measureSpoken', () => {
  it('times spoken blocks and finds the longest breath unit', () => {
    const doc = loadDocument(fixture('keynote.md'));
    expect(measureSpoken(doc, getForm(doc.form))).toEqual({
      wpm: 130, words: 45, minutes: 0.35, longestBreathUnit: { words: 9, line: 10 },
    });
  });

  it('ends a breath unit at each line break in a speech', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-breath-'));
    const f = join(dir, 'talk.md');
    writeFileSync(f, '---\nform: speech-small\n---\n\nWe came here tonight\nwith nothing but a question\nand we leave with an answer\n');
    expect(measureSpoken(loadDocument(f), getForm('speech-small'))!.longestBreathUnit).toEqual({ words: 6, line: 7 });
  });

  it('pauses at line breaks only in forms flagged for it', () => {
    expect(['speech-small', 'speech-large', 'speech-recorded'].map(id => getForm(id).lineBreakPauses)).toEqual([true, true, true]);
    expect(getForm('youtube').lineBreakPauses).toBeUndefined();
  });

  it('is null for read forms', () => {
    const doc = loadDocument(fixture('setup-guide.md'));
    expect(measureSpoken(doc, getForm(doc.form))).toBeNull();
  });
});

describe('script estimate', () => {
  const twelve = 'word '.repeat(12).trim(); // 59 characters: two dialogue lines at width 35
  const blocks: Block[] = [
    { kind: 'scene', text: 'INT. ROOM - DAY', line: 1 },
    ...Array.from({ length: 20 }, (_, k): Block => ({ kind: 'line', text: twelve, line: k + 3, speaker: k % 2 ? 'A' : 'B' })),
  ];

  it('counts layout lines', () => {
    expect(scriptLines(blocks, 'screenplay')).toBe(82);
    expect(scriptLines(blocks, 'multicam')).toBe(123);
  });

  it('converts pages to minutes with a ±20% band', () => {
    expect(measureScript(blocks, getForm('tv-drama'))).toEqual({
      layout: 'screenplay', lines: 82, pages: 1.49, minutes: 1.37, band: [1.1, 1.64],
      scenes: 1, dialogueWords: 240, actionWords: 0, dialogueShare: 1,
      scenesDetail: [{ line: 1, heading: 'INT. ROOM - DAY', lines: 82, pages: 1.49 }],
      speeches: { count: 20, longestWords: 12, longestLine: 3 },
    });
  });

  it('measures the pilot fixture', () => {
    const doc = loadDocument(fixture('pilot.fountain'));
    const s = measureScript(doc.blocks, getForm(doc.form))!;
    expect(s.scenes).toBe(2);
    expect(s.pages).toBeGreaterThan(0);
    // scene 1: heading 2, action 3, MAYA 2+1+2, OKAFOR 2+1, action 2, transition 2; scene 2: heading 2, lyric 2, centered 2
    expect(s.scenesDetail).toEqual([
      { line: 6, heading: 'INT. HOSPITAL CORRIDOR - NIGHT', lines: 17, pages: 0.31 },
      { line: 21, heading: 'FLASHBACK - THE ER', lines: 6, pages: 0.11 },
    ]);
    expect(s.lines).toBe(23);
    // MAYA's speech has the most spoken words; parentheticals are not counted, and its line is the first dialogue line (12)
    expect(s.speeches).toEqual({ count: 2, longestWords: 10, longestLine: 12 });
  });

  it('places the longest speech at its first dialogue line, not a leading parenthetical', () => {
    const { blocks: b } = parseFountain('\nBOB\n(quietly)\nThis is the long one.\n');
    expect(measureScript(b, getForm('tv-drama'))!.speeches).toEqual({ count: 1, longestWords: 5, longestLine: 4 });
  });

  it('counts a cue for each speech, even when one character speaks twice in a row', () => {
    const { blocks: b } = parseFountain('\nBOB\nHi.\n\nBOB\nAgain.\n');
    expect(scriptLines(b, 'screenplay')).toBe(2 * (2 + 1));
    expect(measureScript(b, getForm('tv-drama'))!.speeches.count).toBe(2);
  });

  it('adds no cue for a note, section or synopsis inside or between speech blocks', () => {
    const { blocks: b } = parseFountain('\nBOB\n(quietly)\n[[a note]]\nHi.\n');
    expect(b.map(x => x.kind)).toEqual(['parenthetical', 'note', 'line']);
    expect(scriptLines(b, 'screenplay')).toBe(2 + 1 + 1);
    const manual: Block[] = [
      { kind: 'line', text: 'Hi.', line: 2, speaker: 'BOB', meta: { speech: 0 } },
      { kind: 'synopsis', text: 'x', line: 3 },
      { kind: 'section', text: 'y', line: 4 },
      { kind: 'line', text: 'More.', line: 5, speaker: 'BOB', meta: { speech: 0 } },
    ];
    expect(scriptLines(manual, 'screenplay')).toBe(2 + 1 + 1);
  });

  it('reports multi-cam scene lengths without the page padding', () => {
    expect(measureScript(scenes, getForm('sitcom-multicam'))!.scenesDetail.map(s => s.lines)).toEqual([5, 5, 5]);
  });

  const scenes: Block[] = [1, 2, 3].flatMap((k): Block[] => [
    { kind: 'scene', text: `INT. ROOM ${k} - DAY`, line: k * 4 },
    { kind: 'action', text: 'She waits.', line: k * 4 + 2 },
  ]);

  it('starts every multi-cam scene after the first on a new page', () => {
    // each scene is 3 (heading) + 2 (action) = 5 lines; scenes 2 and 3 start at lines 55 and 110
    expect(scriptLines(scenes, 'multicam')).toBe(2 * 55 + 5);
  });

  it('does not round screenplay scenes to pages', () => {
    expect(scriptLines(scenes, 'screenplay')).toBe(3 * (2 + 2));
  });
});
