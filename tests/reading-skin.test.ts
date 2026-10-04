import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', 'runtime', 'reading');
const css = readFileSync(join(DIR, 'style.css'), 'utf8');

/** The body of the first `{ ... }` after `start` in the stylesheet (nesting counted). */
function blockAfter(start: string): string {
  const at = css.indexOf(start);
  if (at < 0) throw new Error(`not found: ${start}`);
  let depth = 0;
  const open = css.indexOf('{', at);
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed: ${start}`);
}
const props = (body: string): Record<string, string> =>
  Object.fromEntries([...body.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map(m => [m[1]!, m[2]!.trim()]));

const light = props(blockAfter(':root {'));
const dark = { ...light, ...props(blockAfter('@media (prefers-color-scheme: dark) {')) };

const LIGHT = { '--paper': '#edefea', '--sheet': '#fafbf8', '--ink': '#17202a', '--graphite': '#59636c', '--rule': '#c9cfc8', '--blue': '#1f4fd8', '--red': '#c8341f', '--mark': '#f3e58a' };
const DARK = { '--paper': '#12161b', '--sheet': '#1a2027', '--ink': '#e9ece6', '--graphite': '#9aa4ad', '--rule': '#2b333b', '--blue': '#86a7ff', '--red': '#ff8f7a', '--mark': '#5b5217' };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('proof desk tokens', () => {
  it('defines the approved palette, light and dark', () => {
    for (const [k, v] of Object.entries(LIGHT)) expect(light[k], `light ${k}`).toBe(v);
    for (const [k, v] of Object.entries(DARK)) expect(dark[k], `dark ${k}`).toBe(v);
  });

  it('names the two type roles and puts the vendored faces first', () => {
    expect(light['--script']).toBe("'Courier Prime', 'Courier New', ui-monospace, monospace");
    expect(light['--ui']).toBe("'Atkinson Hyperlegible', system-ui, 'Segoe UI', sans-serif");
  });

  it('follows the colour scheme only (no manual theme switch) and drops the old role names', () => {
    expect(css).not.toContain('data-theme');
    expect(css).toContain('color-scheme: light dark');
    for (const old of ['--bg', '--surface', '--accent', '--accent-text', '--soft', '--text', '--muted', '--line', '--good', '--warn', '--highlight', '--focus', '--serif', '--sans'])
      expect(css, old).not.toMatch(new RegExp(`${old}(?![a-z-])`));
  });

  it('uses only variables it defines', () => {
    const used = new Set([...css.matchAll(/var\((--[a-z-]+)/g)].map(m => m[1]!));
    // --fill and --at are set per element from the page (CSSOM, never a style attribute)
    for (const u of used) expect(Object.hasOwn(light, u) || ['--fill', '--at'].includes(u), u).toBe(true);
  });
});

describe('contrast (AA) of the real tokens', () => {
  for (const [name, t] of [['light', light], ['dark', dark]] as const) {
    it(`${name}: text on both papers, muted, red and blue pencils, ink on mark, buttons and borders`, () => {
      const pairs: Array<[string, string, number]> = [
        ['--ink', '--paper', 4.5], ['--ink', '--sheet', 4.5], ['--graphite', '--paper', 4.5], ['--graphite', '--sheet', 4.5],
        ['--red', '--paper', 4.5], ['--red', '--sheet', 4.5], ['--blue', '--paper', 4.5], ['--blue', '--sheet', 4.5],
        ['--ink', '--mark', 4.5],
        // buttons: the filled primary (paper on ink) and the filled kept (sheet on blue)
        ['--paper', '--ink', 4.5], ['--sheet', '--blue', 4.5],
        // a control's boundary (graphite and ink borders) against both papers
        ['--graphite', '--paper', 3], ['--graphite', '--sheet', 3], ['--ink', '--paper', 3],
      ];
      for (const [fg, bg, min] of pairs) expect(ratio(t[fg]!, t[bg]!), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
    });
  }

  it('keeps the rule colour for dividers only: it never colours text or a control border', () => {
    expect(css).not.toMatch(/[^-]color:\s*var\(--rule\)/);
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (/(^|\s|,)(button|select|textarea|input)\b/.test(m[1]!)) expect(m[2], m[1]).not.toMatch(/border[^;]*var\(--rule\)/);
    }
  });
});

describe('fonts in the stylesheet', () => {
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1]!);

  it('declares exactly four faces from same-origin /fonts files that exist, swapping, with no external or data URL', () => {
    expect(faces).toHaveLength(4);
    const seen: string[] = [];
    for (const f of faces) {
      const family = /font-family:\s*'([^']+)'/.exec(f)![1];
      const weight = /font-weight:\s*(\d+)/.exec(f)![1];
      const url = /url\('(\/fonts\/[a-z0-9-]+\.ttf)'\)/.exec(f)![1]!;
      expect(f).toMatch(/format\('truetype'\)/);
      expect(f).toMatch(/font-display:\s*swap/);
      expect(existsSync(join(DIR, url.slice(1))), url).toBe(true);
      seen.push(`${family} ${weight} ${url}`);
    }
    expect(seen.sort()).toEqual([
      'Atkinson Hyperlegible 400 /fonts/atkinson-400.ttf', 'Atkinson Hyperlegible 700 /fonts/atkinson-700.ttf',
      'Courier Prime 400 /fonts/courier-prime-400.ttf', 'Courier Prime 700 /fonts/courier-prime-700.ttf',
    ]);
    expect(css).not.toMatch(/url\(\s*(?!['"]?\/fonts\/)/);
    expect(css).not.toMatch(/data:|https?:|@import/);
  });

  it('ships the licence texts beside the fonts, with the upstream copyright lines', () => {
    const read = (f: string) => readFileSync(join(DIR, 'fonts', f), 'utf8');
    expect(read('OFL-CourierPrime.txt')).toMatch(/^Copyright 2015 The Courier Prime Project Authors/);
    expect(read('OFL-Atkinson.txt')).toMatch(/^Copyright 2020 Braille Institute of America/);
    for (const f of ['OFL-CourierPrime.txt', 'OFL-Atkinson.txt']) expect(read(f)).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });
});

describe('proof desk behaviour in CSS', () => {
  it('sets the root size to 17 px, 18 px below 900 px', () => {
    expect(css).toMatch(/html \{[^}]*font-size: 17px/);
    expect(css).toMatch(/@media \(max-width: 899px\) \{\s*html \{ font-size: 18px; \}/);
  });

  it('shows keyboard focus as a 3 px blue outline, offset 2 px, and never removes an outline', () => {
    expect(css).toMatch(/:focus-visible \{[^}]*outline: 3px solid var\(--blue\);[^}]*outline-offset: 2px/);
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });

  it('keeps every control at 44 px', () => {
    expect(css).toMatch(/button \{[^}]*min-height: 44px;[^}]*min-width: 44px/);
    expect(css).toMatch(/select \{[^}]*min-height: 44px/);
  });

  it('marks a passed draft with a colour change and a word, never with opacity', () => {
    const rule = /\.card\.passed[^{]*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/color: var\(--graphite\)/);
    expect(css).not.toMatch(/\.(passed|off)\b[^{]*\{[^}]*opacity/);
  });

  it('respects reduced motion, forced colours and the phone safe area', () => {
    const rm = blockAfter('@media (prefers-reduced-motion: reduce) {');
    expect(rm).toMatch(/animation: none/);
    expect(rm).toMatch(/transition: none/);
    expect(blockAfter('@media (forced-colors: active) {')).toMatch(/CanvasText|ButtonText/);
    expect(css).toMatch(/safe-area-inset-bottom/);
  });
});
