import { describe, expect, it } from 'vitest';
import { loadDocument } from '../src/document.ts';
import { measure } from '../src/measure/index.ts';
import { fixture, run } from './helpers.ts';

describe('measure', () => {
  it('measures a Fountain script with per-speaker stats', () => {
    const m = measure(loadDocument(fixture('pilot.fountain')));
    expect(m.format).toBe('fountain');
    expect(m.script?.layout).toBe('screenplay');
    expect(m.spoken).toBeNull();
    expect(m.dialog).toBeNull();
    expect(Object.keys(m.speakers).sort()).toEqual(['DR. OKAFOR', 'MAYA']);
    expect(m.speakers.MAYA.words).toBe(10);
  });

  it('measures a speech', () => {
    const m = measure(loadDocument(fixture('keynote.md')));
    expect(m.spoken?.minutes).toBe(0.35);
    expect(m.script).toBeNull();
    expect(m.register).toBe('professional');
  });

  it('measures a dialog graph and its lexicon hits', () => {
    const m = measure(loadDocument(fixture('gate.dialog.yaml')));
    expect(m.dialog?.nodes).toBe(5);
    expect(m.lexicon.aiTells).toEqual([]);
  });

  it('is exposed as prose measure', async () => {
    const out = await run('measure', fixture('setup-guide.md'));
    expect(out.form).toBe('instructions');
    expect(out.lexicon.filler.map((h: { id: string }) => h.id).sort()).toEqual(['please', 'simply']);
  });
});
