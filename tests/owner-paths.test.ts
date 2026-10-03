import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { globalTasteDir, newId, projectTasteDir, proseHome, setDir, setsDir, validId } from '../src/owner/paths.ts';
import { managedHome } from '../scripts/managed-runtime.js';
import { initProject, needProject } from '../src/project.ts';
import { tmp, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
const { home } = useTempHome();

describe('ids', () => {
  it('builds sortable ids from the UTC time and a random suffix', () => {
    expect(newId('set', new Date(Date.UTC(2026, 9, 3, 15, 30)), () => 'ab12')).toBe('set-20261003-1530-ab12');
  });
  it('rejects ids that could escape a directory', () => {
    expect(() => validId('../x')).toThrow(ProseError);
    expect(() => validId('Has Caps')).toThrow(/lower-case/);
    expect(validId('set-1')).toBe('set-1');
  });
  it('rejects a leading hyphen, Windows device names and over-long ids', () => {
    expect(() => validId('-x')).toThrow(ProseError);
    expect(() => validId('con')).toThrow(ProseError);
    expect(() => validId('nul')).toThrow(ProseError);
    expect(() => validId('com1')).toThrow(ProseError);
    expect(() => validId('x'.repeat(65))).toThrow(ProseError);
    expect(validId('x'.repeat(64))).toHaveLength(64);
    expect(validId('console')).toBe('console');
  });
});

describe('directories', () => {
  it('keeps sets and taste data under .agent-prose', () => {
    expect(setsDir('/p')).toBe(join('/p', '.agent-prose', 'sets'));
    expect(setDir('/p', 'a-1')).toBe(join('/p', '.agent-prose', 'sets', 'a-1'));
    expect(projectTasteDir('/p')).toBe(join('/p', '.agent-prose', 'taste'));
    expect(() => setDir('/p', '../../etc')).toThrow(ProseError);
  });
  it('uses AGENT_PROSE_HOME for per-user data', () => {
    expect(proseHome()).toBe(home());
    expect(globalTasteDir()).toBe(join(home(), 'taste'));
  });
  it('shares its home with the managed runtime', () => {
    expect(proseHome).toBe(managedHome);
  });
});

describe('project ignore file', () => {
  it('init ignores sets and taste data but never overwrites an edited file', () => {
    const dir = tmp('prose-ign-');
    initProject(dir, { home: tmp('prose-home-') });
    const file = join(dir, '.agent-prose', '.gitignore');
    expect(readFileSync(file, 'utf8')).toBe('sets/\ntaste/\n');
    writeFileSync(file, 'sets/\n');
    initProject(dir, { home: tmp('prose-home-') });
    expect(readFileSync(file, 'utf8')).toBe('sets/\n');
  });
  it('needProject finds the project or says how to make one', () => {
    const dir = tmp('prose-need-');
    expect(() => needProject(dir)).toThrow(expect.objectContaining({ code: 'E_PROJECT', hint: expect.stringMatching(/prose init/) }));
    initProject(dir, { home: tmp('prose-home-') });
    expect(existsSync(needProject(dir))).toBe(true);
  });
});
