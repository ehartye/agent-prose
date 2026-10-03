import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';

const doc = (body: string) => { const d = mkdtempSync(join(tmpdir(), 'prose-proc-')); const f = join(d, 'p.md'); writeFileSync(f, `---\nform: instructions\n---\n\n${body}\n`); return loadDocument(f); };

describe('procedure steps', () => {
  it('flags steps that do not start with an imperative', () => {
    const r = lint(doc('1. You open the app.\n2. On the thermostat, press and hold the button.\n3. The light blinks blue.\n4. Optional: Tap Done.'));
    expect(r.warnings.filter(w => w.rule === 'procedure.step.imperative').map(w => w.at.line)).toEqual([5, 7]);
  });
  it('flags a numbered list with a single step', () => {
    const r = lint(doc('Do this:\n\n1. Tap Reset.'));
    expect(r.info.map(i => i.rule)).toContain('procedure.single-step');
  });
  it('treats a list split by an explanatory paragraph as one list', () => {
    const r = lint(doc('1. Open Settings.\n\nThat opens the panel.\n\n2. Tap Reset.'));
    expect(r.info.map(i => i.rule)).not.toContain('procedure.single-step');
    expect(lint(doc('1. Tap Reset.')).info.map(i => i.rule)).toContain('procedure.single-step');
    expect(lint(doc('1. Open Settings.\n1. Tap Reset.')).info.map(i => i.rule)).not.toContain('procedure.single-step');
  });
  it('suggests an unnumbered sentence for a step that reads like a result', () => {
    const r = lint(doc('1. Tap Reset.\n2. The thermostat restarts.\n3. You open the app.'));
    const fixes = r.warnings.filter(w => w.rule === 'procedure.step.imperative').map(w => w.fix);
    expect(fixes[0]).toMatch(/^This reads like a result: make it an unnumbered sentence under the previous step/);
    expect(fixes[1]).toMatch(/^Lead with the action/);
  });
  it('lists the recovery judgement rule', () => {
    expect(lint(doc('1. Tap Reset.\n2. Tap Done.')).judgement.map(j => j.rule)).toContain('procedure.recovery');
  });
});
