import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { getForm } from '../src/forms.ts';
import { measureSpoken } from '../src/measure/spoken.ts';
import { lint } from '../src/lint/lint.ts';
import { describeSource } from '../scripts/managed-runtime.js';

const root = join(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'prose-event-examples-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('professional event skills', () => {
  const cases = [
    { skill: 'prose-presentation', reference: 'presentation-craft', form: 'speech-small', words: 26, minutes: 0.2 },
    { skill: 'prose-webinar', reference: 'webinar-production', form: 'speech-recorded', words: 27, minutes: 0.21 },
  ];

  for (const c of cases) {
    const dir = join(root, 'skills', c.skill);
    const refPath = join(dir, 'references', `${c.reference}.md`);
    it(`${c.skill} installs its entrypoint and linked references`, () => {
      const files = describeSource(root).files as string[];
      expect(files).toContain(`skills/${c.skill}/SKILL.md`);
      expect(files).toContain(`skills/${c.skill}/references/${c.reference}.md`);
      const links = [...readFileSync(join(dir, 'SKILL.md'), 'utf8').matchAll(/\]\((references\/[^)]+)\)/g)];
      expect(links).toHaveLength(1);
      for (const link of links) expect(existsSync(resolve(dir, link[1]!))).toBe(true);
    });

    it(`${c.skill}'s documented narration measures only spoken text and lints cleanly`, () => {
      const reference = readFileSync(refPath, 'utf8').replaceAll('\r\n', '\n');
      const examples = [...reference.matchAll(/```md\n([\s\S]*?)\n```/g)];
      expect(examples).toHaveLength(1);
      const file = join(scratch, `${c.skill}.md`);
      writeFileSync(file, `${examples[0]![1]}\n`);
      const doc = loadDocument(file);
      expect(doc.form).toBe(c.form);
      const spoken = measureSpoken(doc, getForm(doc.form));
      expect(spoken).toMatchObject({ wpm: 130, words: c.words, minutes: c.minutes });
      const report = lint(doc);
      expect(report.errors).toEqual([]);
      expect(report.warnings).toEqual([]);
    });
  }
});
