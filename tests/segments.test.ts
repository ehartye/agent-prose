import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { measure } from '../src/measure/index.ts';
import { lint } from '../src/lint/lint.ts';
import { spokenText } from '../src/measure/spoken.ts';
import { fixture } from './helpers.ts';

const tmp = (name: string, text: string) => { const d = mkdtempSync(join(tmpdir(), 'prose-seg-')); const f = join(d, name); writeFileSync(f, text); return f; };
const doc = (form: string, body: string) => loadDocument(tmp('draft.md', `---\nform: ${form}\n---\n\n${body}\n`));

describe('spokenText', () => {
  const yt = { directions: true };
  it('drops direction lines and speaker labels', () => {
    expect(spokenText('VISUAL: a fork sparks', yt)).toBe('');
    expect(spokenText('B-ROLL: lab footage', yt)).toBe('');
    expect(spokenText('CUT TO: the lab', yt)).toBe('');
    expect(spokenText('Cut to: the chase, we are late.', yt)).toBe('Cut to: the chase, we are late.');
    expect(spokenText('VO: You have been told.', yt)).toBe('You have been told.');
    expect(spokenText('Plain words.', yt)).toBe('Plain words.');
  });
  it('works line by line and accepts bold labels', () => {
    expect(spokenText('VISUAL: fork\nVO: four words here now', yt)).toBe('four words here now');
    expect(spokenText('**VISUAL:** x', yt)).toBe('');
    expect(spokenText('**VO:** hello there', yt)).toBe('hello there');
  });
  it('keeps directions outside youtube and mixed-case lookalikes everywhere', () => {
    expect(spokenText('VISUAL: a fork sparks', { directions: false })).toBe('VISUAL: a fork sparks');
    expect(spokenText('Text: the first rule of toasts is brevity.', yt)).toBe('Text: the first rule of toasts is brevity.');
    expect(spokenText('Host: welcome', yt)).toBe('Host: welcome');
  });
});

describe('direction or speaker label right after a timestamp', () => {
  const SCRIPT = '**[0:00–0:05] — VISUAL: Slow-motion shot of the fork. Sparks crackle off the tines.**\n\nNARRATOR:\nYou\'ve seen this. Maybe you\'ve done this.';
  it('drops the direction and the lone speaker label, counting only spoken words', () => {
    const segs = measure(doc('youtube', SCRIPT)).segments;
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ start: '0:00', end: '0:05', words: 7 });
  });
  it('strips a speaker label right after the timestamp', () => {
    expect(measure(doc('youtube', '[0:05-0:10] NARRATOR: Four words right here.')).segments[0].words).toBe(4);
    expect(measure(doc('youtube', '[0:05-0:10] — NARRATOR: Four words right here.')).segments[0].words).toBe(4);
  });
  it('a label-only line has no words', () => {
    expect(spokenText('NARRATOR:', { directions: true })).toBe('');
  });
});

describe('spoken-text cues in documents', () => {
  it('counts a "Text:" sentence in a speech', () => {
    expect(measure(doc('speech-small', 'Text: the first rule of toasts is brevity.')).spoken?.words).toBe(8);
  });
  it('drops a direction line inside a multi-line youtube paragraph', () => {
    expect(measure(doc('youtube', 'VISUAL: fork\nVO: four words here now')).spoken?.words).toBe(4);
  });
  it('drops a bold direction line in youtube', () => {
    expect(measure(doc('youtube', '**VISUAL:** x\n\nVO: one two three')).spoken?.words).toBe(3);
  });
});

describe('youtube segments', () => {
  const m = measure(loadDocument(fixture('microwave.md')));
  it('times each timestamped segment', () => {
    expect(m.segments).toEqual([
      { start: '0:00', end: '0:08', seconds: 8, words: 16, wpm: 120, line: 6 },
      { start: '0:08', end: '0:18', seconds: 10, words: 41, wpm: 246, line: 12 },
    ]);
  });
  it('excludes direction lines from spoken words', () => {
    expect(m.spoken?.words).toBe(57);
  });
  it('warns on segments faster than 180 wpm', () => {
    const r = lint(loadDocument(fixture('microwave.md')));
    expect(r.warnings.filter(w => w.rule === 'youtube.segment.pace').map(w => w.at.line)).toEqual([12]);
  });
  it('opens a segment from a timestamp-only paragraph (parsed as a note)', () => {
    const s = measure(doc('youtube', '[0:08-0:20]\n\nVO: one two three four five')).segments;
    expect(s).toEqual([{ start: '0:08', end: '0:20', seconds: 12, words: 5, wpm: 25, line: 5 }]);
  });
  it('flags a segment with no duration', () => {
    const r = lint(doc('youtube', '## 0:20-0:10\n\nVO: one two three'));
    expect(r.warnings.filter(w => w.rule === 'youtube.segment.pace').map(w => w.message)).toEqual(['Segment 0:20–0:10 has no duration']);
  });
});
