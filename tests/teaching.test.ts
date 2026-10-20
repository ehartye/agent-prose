import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getForm } from '../src/forms.ts';
import { rulesFor } from '../src/craft/rules.ts';
import { loadGuide, resolveFamily } from '../src/craft/guides.ts';
import { parseDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { measure } from '../src/measure/index.ts';
import { describeSource } from '../scripts/managed-runtime.js';

const root = join(import.meta.dirname, '..');

describe('textbook teaching workflow', () => {
  it('is a read Markdown form with a discoverable teaching guide', () => {
    expect(getForm('textbook')).toMatchObject({ format: 'markdown', spoken: false });
    expect(getForm('textbook').wpm).toBeUndefined();
    expect(resolveFamily('textbook').id).toBe('teaching-prose');
    expect(loadGuide('teaching-prose').forms).toEqual(['textbook']);
  });

  it('retains factual and teaching judgement without procedure or research-result structure', () => {
    const ids = rulesFor('textbook').map(r => r.id);
    expect(ids).toContain('formal.supported-claims');
    expect(ids).toContain('teaching.goal-alignment');
    expect(ids).toContain('teaching.prerequisites');
    expect(ids).toContain('teaching.reasoning');
    expect(ids).toContain('teaching.practice');
    expect(ids).not.toContain('formal.bluf');
    expect(ids).not.toContain('style.echo');
    expect(ids.some(id => id.startsWith('procedure.'))).toBe(false);
    expect(rulesFor('professional').some(r => r.id.startsWith('teaching.'))).toBe(false);
  });

  it('ships the authoring instructions and their directly linked reference material', () => {
    const files = describeSource(root).files as string[];
    for (const file of [
      'skills/prose-teach/SKILL.md', 'skills/prose-teach/references/examples.md',
      'skills/prose-reading-level/SKILL.md', 'skills/prose-reading-level/references/reading-level.md',
      'craft/guides/teaching-prose.md',
    ]) expect(files).toContain(file);
  });

  it('runs the documented teaching example while leaving teaching judgments unverified', () => {
    const guide = readFileSync(join(root, 'craft/guides/teaching-prose.md'), 'utf8');
    const examples = [...guide.matchAll(/```md\r?\n([\s\S]*?)\r?\n```/g)];
    expect(examples.length).toBeGreaterThan(0);
    for (const [i, example] of examples.entries()) {
      const doc = parseDocument(join(root, `example-${i}.md`), example[1]!);
      const result = lint(doc);
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.judgement.map(j => j.rule)).toContain('teaching.reasoning');
      expect(measure(doc).readability?.reader.schoolGrade).toBe(9);
      expect(measure(doc).readability?.target).toBeNull();
    }
  });
});
