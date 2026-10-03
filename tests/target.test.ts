import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTarget } from '../src/target.ts';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { measure } from '../src/measure/index.ts';
import { ProseError } from '../src/errors.ts';
import { EVALUATORS } from '../src/lint/evaluators.ts';

const tmp = (name: string, text: string) => { const d = mkdtempSync(join(tmpdir(), 'prose-target-')); const f = join(d, name); writeFileSync(f, text); return f; };

describe('readTarget', () => {
  it('parses strings and mappings', () => {
    expect(readTarget('5 minutes')).toEqual({ minutes: 5 });
    expect(readTarget('90 seconds')).toEqual({ minutes: 1.5 });
    expect(readTarget('200 words')).toEqual({ words: 200 });
    expect(readTarget('4 pages')).toEqual({ pages: 4 });
    expect(readTarget({ seconds: 60 })).toEqual({ minutes: 1 });
    expect(readTarget(undefined)).toBeNull();
  });
  it('rejects nonsense with E_SCHEMA', () => {
    expect(() => readTarget('soon')).toThrow(ProseError);
  });
});

describe('length.target', () => {
  const speech = (words: number) => tmp('toast.md', `---\nform: speech-small\ntarget: 1 minute\n---\n\n${'word '.repeat(words).trim()}.\n`);

  it('measures against the target', () => {
    const m = measure(loadDocument(speech(156)));
    expect(m.target).toEqual({ checks: [{ unit: 'minutes', target: 1, measured: 1.2, ratio: 1.2 }] });
  });

  it('warns outside ±10% with how much to cut', () => {
    const r = lint(loadDocument(speech(156)));
    const f = r.warnings.find(w => w.rule === 'length.target')!;
    expect(f.message).toBe('Runs 1.2 minutes against a 1-minute target (+20%); cut about 26 words at 130 wpm');
  });

  it('is quiet inside ±10%', () => {
    expect(lint(loadDocument(speech(130))).warnings.map(w => w.rule)).not.toContain('length.target');
  });

  it('reports a unit the form cannot measure', () => {
    const f = tmp('memo.md', '---\nform: professional\ntarget: 2 minutes\n---\n\nShort memo.\n');
    expect(lint(loadDocument(f)).warnings.find(w => w.rule === 'length.target')!.message).toMatch(/cannot measure minutes/);
  });
});

describe('length.target wording', () => {
  const rule = { value: 0.1 } as any;
  const run = (check: object, spoken: object | null, form = 'speech-small') =>
    EVALUATORS['length.target']({ doc: { form } as any, rule, m: { target: { checks: [check] }, spoken } as any })[0].message;

  it('hyphenates the target and pluralises the measure', () => {
    expect(run({ unit: 'minutes', target: 5, measured: 6, ratio: 1.2 }, { wpm: 130, words: 780 }))
      .toBe('Runs 6 minutes against a 5-minute target (+20%); cut about 130 words at 130 wpm');
    expect(run({ unit: 'words', target: 200, measured: 320, ratio: 1.6 }, null, 'professional'))
      .toBe('Runs 320 words against a 200-word target (+60%); cut about 120 words');
    expect(run({ unit: 'pages', target: 1, measured: 3.67, ratio: 3.67 }, null, 'tv-drama'))
      .toBe('Runs 3.67 pages against a 1-page target (+267%)');
  });

  it('uses singular units and exact words for the hint', () => {
    expect(run({ unit: 'words', target: 2, measured: 1, ratio: 0.5 }, null, 'professional'))
      .toBe('Runs 1 word against a 2-word target (-50%); add about 1 word');
    // 778 words at 130 wpm rounds to 5.98 minutes; the hint uses the exact 778 - 650 = 128
    expect(run({ unit: 'minutes', target: 5, measured: 5.98, ratio: 1.2 }, { wpm: 130, words: 778 }))
      .toBe('Runs 5.98 minutes against a 5-minute target (+20%); cut about 128 words at 130 wpm');
  });
});
