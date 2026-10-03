import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';

const script = (body: string) => { const d = mkdtempSync(join(tmpdir(), 'prose-mc-')); const f = join(d, 's.fountain'); writeFileSync(f, body); return f; };

describe('multi-cam format', () => {
  const f = script('Title: T\nForm: sitcom-multicam\n\n# COLD OPEN\n\nINT. ESCAPE ROOM - NIGHT\n\nTheo paces.\n\nDANA ENTERS, SOAKED.\n\nDANA\nHi.\n');
  const r = lint(loadDocument(f));
  it('flags mixed-case action in multi-cam', () => {
    expect(r.warnings.filter(w => w.rule === 'script.multicam.caps-action').map(w => w.at.line)).toEqual([8]);
  });
  it('flags act markers written as sections, which do not print', () => {
    expect(r.info.find(i => i.rule === 'script.unprinted-marker')!.at.line).toBe(4);
  });
  it('does not apply caps-action to single-cam', () => {
    const g = script('Title: T\nForm: sitcom-singlecam\n\nINT. ROOM - DAY\n\nTheo paces.\n');
    expect(lint(loadDocument(g)).warnings.map(w => w.rule)).not.toContain('script.multicam.caps-action');
  });
  it('allows name prefixes, possessives and ordinals in ALL-CAPS action', () => {
    const g = script("Title: T\nForm: sitcom-multicam\n\nINT. ROOM - DAY\n\nDANA TAKES THE MOP. McDONALD'S SIGN FLICKERS ON THE 2nd FLOOR.\n\nTheo paces.\n");
    expect(lint(loadDocument(g)).warnings.filter(w => w.rule === 'script.multicam.caps-action').map(w => w.at.line)).toEqual([8]);
  });
});
