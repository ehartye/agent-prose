import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../runtime/reading/style.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../runtime/reading/app.js', import.meta.url), 'utf8');

describe('cut words in the compare view stay readable', () => {
  it('marks words every draft cut with a wash and a dotted underline, never a line through the text', () => {
    const rule = /\.cell del \{([^}]*)\}/.exec(css)![1];
    expect(rule).toContain('underline dotted');
    expect(rule).toContain('background');
    expect(rule).not.toContain('line-through');
    expect(rule).toContain('color: var(--ink)');
  });
  it('leaves words only some drafts cut plain', () => {
    expect(css).toMatch(/\.cell del\.some \{[^}]*text-decoration: none;[^}]*background: none/);
  });
  it('has a Mark cuts toggle that is remembered and switches the marking off', () => {
    expect(css).toMatch(/\.sheet\.plaincuts \.cell del \{[^}]*text-decoration: none;[^}]*background: none/);
    expect(app).toContain("'Mark cuts'");
    expect(app).toContain("'prose-cuts'");
    expect(app).toContain("' plaincuts'");
  });
});
