import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION } from '../src/version.ts';

const root = join(import.meta.dirname, '..');
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

describe('version', () => {
  it('matches package.json, plugin.json, marketplace.json and the lockfile', () => {
    expect(VERSION).toBe(json('package.json').version);
    expect(json('.claude-plugin/plugin.json').version).toBe(VERSION);
    expect(json('.claude-plugin/marketplace.json').plugins[0].version).toBe(VERSION);
    expect(json('package-lock.json').version).toBe(VERSION);
    expect(json('package-lock.json').packages[''].version).toBe(VERSION);
  });
});
