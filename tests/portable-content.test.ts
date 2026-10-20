import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';
import { personalPath } from './portable-content.ts';

const root = join(import.meta.dirname, '..');
const files = (path: string): string[] => statSync(path).isDirectory()
  ? readdirSync(path).flatMap(name => files(join(path, name)))
  : /\.(?:md|json|[cm]?js|ts|ya?ml|txt)$/.test(path) ? [path] : [];

it('recognizes personal paths in raw, slash-normalized and JSON-escaped records', () => {
  const win = ['C:', 'Users', 'sample-user', 'checkout', 'draft.md'].join('\\');
  for (const value of [win, win.replaceAll('\\', '/'), JSON.stringify({ path: win }), '/Users/sample-user/checkout/draft.md', '/home/sample-user/checkout/draft.md', '/c/Users/sample-user/checkout/draft.md', '/mnt/c/Users/sample-user/checkout/draft.md']) {
    expect(value).toMatch(personalPath);
  }
  for (const value of ['docs/research/draft.md', 'C:/example/manifest.json', '~/project', 'https://example.org/research']) {
    expect(value).not.toMatch(personalPath);
  }
});

it('publishes no personal working-directory paths', () => {
  const findings = ['docs', 'skills', 'craft', 'src', 'scripts', 'runtime', 'evals', 'tests/fixtures', 'README.md', 'REFERENCES.md']
    .flatMap(name => files(join(root, name)))
    .filter(path => personalPath.test(readFileSync(path, 'utf8')))
    .map(path => relative(root, path));
  expect(findings).toEqual([]);
});
