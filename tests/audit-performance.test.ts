import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/document.ts';
import { buildReport } from '../src/audit/report.ts';

/**
 * Linear-time guards. Each case builds a large pathological draft and must finish inside a loose 1-second bound.
 * Measured before the fix (Node 24, this machine): a 200,000-letter token 15.9 s (9.5 s in an earlier run), the hyphen,
 * apostrophe and comma runs 22 s together, 20,000 findings 3.4 s; the 45,000-word draft was already fast.
 * Measured after: token 19 ms, 200,000 hyphens 1 ms, "a-" run 25 ms, comma run 24 ms, 20,000 findings 103 ms,
 * 45,000-word draft 40 ms.
 */
const report = (text: string) => buildReport(parseDocument('draft.md', text, {}), text);

function timed<T>(fn: () => T): { ms: number; value: T } {
  const t = performance.now();
  const value = fn();
  return { ms: performance.now() - t, value };
}

describe('audit stays linear on large input', () => {
  it('reads a single 200,000-letter token', () => {
    const { ms } = timed(() => report(`${'a'.repeat(200_000)}\n`));
    expect(ms).toBeLessThan(1000);
  });

  it('reads long hyphen and apostrophe runs, and a chain of hyphenated words', () => {
    for (const text of ['-'.repeat(200_000), `${'a-'.repeat(100_000)}b`, `${"a'".repeat(100_000)}b`, `${'ab, '.repeat(50_000)}`]) {
      const { ms } = timed(() => report(`${text}\n`));
      expect(ms).toBeLessThan(1000);
    }
  });

  it('reports 20,000 findings', () => {
    const text = `${'We delve into it.\n'.repeat(20_000)}`;
    const { ms, value } = timed(() => report(text));
    expect(value.tiers.soft.length).toBe(20_000);
    expect(ms).toBeLessThan(1000);
  });

  it('reads a 45,000-word draft', () => {
    const para = `${'The committee reviewed the budget and approved it on Tuesday, and the notes, the vote, and the minutes were filed. '.repeat(5)}We delve into it.`;
    const text = Array.from({ length: 450 }, () => para).join('\n\n');
    const { ms, value } = timed(() => report(text));
    expect(value.words).toBeGreaterThan(45_000);
    expect(ms).toBeLessThan(1000);
  });

  it('reads 5,000 "Whether you’re" sentences in one paragraph', () => {
    const text = `${'Whether you’re a cat or a dog. '.repeat(5000)}\n`;
    const { ms } = timed(() => report(text));
    expect(ms).toBeLessThan(1000);
  });

  it('reads closing-style paragraphs in time that grows with their number', () => {
    const run = (n: number) => timed(() => report(Array.from({ length: n }, () => 'Ultimately, x.').join('\n\n'))).ms;
    run(2_000); // warm up
    const small = run(10_000);
    const large = run(40_000);
    // 4x the paragraphs: linear is about 4x, quadratic about 16x. Absolute budgets vary too much across CI runners.
    expect(large).toBeLessThan(small * 9);
  });
});
