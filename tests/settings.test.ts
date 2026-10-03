import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initProject } from '../src/project.ts';
import { loadDocument } from '../src/document.ts';
import { measure } from '../src/measure/index.ts';
import { resolveSettings } from '../src/settings.ts';

const bare = () => mkdtempSync(join(tmpdir(), 'prose-settings-'));
const proj = (settings?: Record<string, unknown>) => {
  const d = bare();
  initProject(d);
  if (settings) writeFileSync(join(d, '.agent-prose', 'project.json'), JSON.stringify({ schema: 'prose/project@1', ...settings }));
  return d;
};
const md = (dir: string, front: string, body = 'Hello there. This is a short script read aloud.') => {
  const f = join(dir, 'script.md');
  writeFileSync(f, `---\nform: youtube\n${front}---\n\n${body}\n`);
  return f;
};
const LONG = 'This line of dialog is long enough that it wraps past two lines in a forty character box.';
const dialog = (dir: string, extra = '') => {
  const f = join(dir, 'talk.dialog.yaml');
  writeFileSync(f, `form: quest-dialog\n${extra}nodes:\n  - { id: a, speaker: GRIMBLE, text: "${LONG}", end: true }\n`);
  return f;
};

describe('settings resolution', () => {
  it('starts from the form defaults', () => {
    const d = bare();
    expect(resolveSettings(loadDocument(md(d, '')), null)).toEqual({ wpm: 160, boxChars: null, boxLines: null, target: null });
    expect(resolveSettings(loadDocument(dialog(d)), null)).toMatchObject({ wpm: 150, boxChars: 40, boxLines: 2 });
  });
  it('applies project wpm, then the project form entry, then the document', () => {
    const d = proj({ wpm: 140 });
    expect(resolveSettings(loadDocument(md(d, '')), d).wpm).toBe(140);
    const e = proj({ wpm: 140, forms: { youtube: { wpm: 150 }, 'quest-dialog': { boxChars: 60, boxLines: 3 } } });
    expect(resolveSettings(loadDocument(md(e, '')), e).wpm).toBe(150);
    expect(resolveSettings(loadDocument(dialog(e)), e)).toMatchObject({ wpm: 140, boxChars: 60, boxLines: 3 });
    expect(resolveSettings(loadDocument(md(e, 'wpm: 120\ntarget: 2 minutes\n')), e)).toEqual({ wpm: 120, boxChars: null, boxLines: null, target: { minutes: 2 } });
    expect(resolveSettings(loadDocument(dialog(e, 'wpm: 100\n')), e).wpm).toBe(100);
  });
  it('leaves forms timed by pages alone', () => {
    const d = proj({ wpm: 140 });
    const f = join(d, 'scene.fountain');
    writeFileSync(f, 'Title: T\n\nINT. ROOM - DAY\n\nA chair.\n');
    expect(resolveSettings(loadDocument(f), d).wpm).toBeNull();
  });
  it('measures with the resolved values', () => {
    const d = proj({ forms: { youtube: { wpm: 100 }, 'quest-dialog': { boxChars: 100 } } });
    const m = measure(loadDocument(md(d, '', Array(50).fill('word').join(' ') + '.')));
    expect(m.spoken).toMatchObject({ wpm: 100, words: 50, minutes: 0.5 });
    const dm = measure(loadDocument(dialog(d)));
    expect(dm.dialog).toMatchObject({ boxChars: 100, boxLines: 2, overflow: [] });
    expect(measure(loadDocument(dialog(bare()))).dialog!.overflow).toHaveLength(1);
  });
  it('rejects a bad project.json with E_SCHEMA and a pointer', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ wpm: 'fast' }, '/wpm'],
      [{ forms: { novel: { wpm: 200 } } }, '/forms/novel'],
      [{ forms: { youtube: { boxChars: 1.5 } } }, '/forms/youtube/boxChars'],
      [{ forms: { 'tv-drama': { wpm: 150 } } }, '/forms/tv-drama/wpm'],
      [{ voices: 'x' }, ''],
    ];
    for (const [settings, pointer] of cases) {
      const d = proj(settings);
      expect(() => resolveSettings(loadDocument(md(d, '')), d), JSON.stringify(settings))
        .toThrow(expect.objectContaining({ code: 'E_SCHEMA', pointer, details: expect.objectContaining({ file: join(d, '.agent-prose', 'project.json') }) }));
    }
  });
  it('rejects a bad document wpm', () => {
    const d = bare();
    expect(() => resolveSettings(loadDocument(md(d, 'wpm: -5\n')), null)).toThrow(expect.objectContaining({ code: 'E_SCHEMA', pointer: '/wpm' }));
    const f = join(d, 'scene.fountain');
    writeFileSync(f, 'Title: T\nWpm: 150\n\nINT. ROOM - DAY\n\nA chair.\n');
    expect(() => resolveSettings(loadDocument(f), null)).toThrow(expect.objectContaining({ code: 'E_SCHEMA', pointer: '/wpm' }));
  });
  it('accepts wpm written as a numeric string, as title pages write values', () => {
    const d = bare();
    expect(resolveSettings(loadDocument(md(d, 'wpm: "145"\n')), null).wpm).toBe(145);
  });
});
