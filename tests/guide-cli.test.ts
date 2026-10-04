import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { run } from './helpers.ts';
import { SECTIONS } from '../src/craft/guides.ts';
import { FORMS } from '../src/forms.ts';

const cli = join(import.meta.dirname, '..', 'scripts', 'prose.mjs');
const prose = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

describe('prose guide', () => {
  it('lists the families with their forms, descriptions and whether the guide is written', async () => {
    const out = await run('guide');
    expect(out.families.map((f: any) => f.id)).toEqual(['game-dialogue', 'instruction-docs', 'formal-prose', 'screen-stage', 'youtube', 'speeches', 'verse', 'song']);
    expect(out.families.flatMap((f: any) => f.forms).sort()).toEqual(FORMS.map(f => f.id).sort());
    const game = out.families.find((f: any) => f.id === 'game-dialogue');
    expect(game.forms).toEqual(['quest-dialog', 'barks', 'conversation']);
    expect(game.description).toMatch(/barks/);
    expect(game.written).toBe(true);
    expect(out.families.find((f: any) => f.id === 'song').written).toBe(false);
  });

  it('prints one guide by family id, and by form id (resolved to its family)', async () => {
    const byFamily = await run('guide', 'game-dialogue');
    const byForm = await run('guide', 'barks');
    expect(byForm).toEqual(byFamily);
    expect(byFamily.family).toBe('game-dialogue');
    expect(byFamily.forms).toEqual(['quest-dialog', 'barks', 'conversation']);
    expect(byFamily.sections.map((s: any) => s.key)).toEqual(SECTIONS.map(s => s.key));
    expect(byFamily.sections.map((s: any) => s.title)).toEqual(SECTIONS.map(s => s.title));
    expect(byFamily.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('prints one section, by key, by the start of its title, or by a unique word', async () => {
    const a = await run('guide', 'game-dialogue', '--section', 'anatomy');
    expect(a.section.key).toBe('anatomy');
    expect(a.section.text).toMatch(/critical path/);
    expect(a.sections).toBeUndefined();
    expect((await run('guide', 'quest-dialog', '--section', 'Common failures')).section.key).toBe('failures');
    expect((await run('guide', 'game-dialogue', '--section', 'revise')).section.key).toBe('revise');
    expect((await run('guide', 'game-dialogue', '--section', 'timing')).section.key).toBe('length');
  });

  it('prints the reader view with --text: Markdown, no generated-block comments', () => {
    const r = prose('guide', 'game-dialogue', '--text');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^# Game dialogue\n/);
    expect(r.stdout).toContain('## Rules that apply');
    expect(r.stdout).not.toContain('<!-- generated');
    const one = prose('guide', 'barks', '--section', 'rules', '--text');
    expect(one.stdout).toMatch(/^# Game dialogue: Rules that apply\n/);
    expect(one.stdout).toContain('| `dialog.barks.variety` |');
    expect(one.stdout).not.toContain('## What it is');
    expect(prose('guide', '--text').stdout).toContain('game-dialogue: Game dialogue');
  });

  it('gives a usage error that lists the valid names for an unknown guide, form or section', () => {
    const unknown = prose('guide', 'limerik');
    expect(unknown.status).toBe(2);
    const e = JSON.parse(unknown.stderr.trim()).error;
    expect(e.code).toBe('E_USAGE');
    expect(e.hint).toContain('game-dialogue');
    expect(e.hint).toContain('sestina');
    const section = prose('guide', 'game-dialogue', '--section', 'poetry');
    expect(section.status).toBe(2);
    expect(JSON.parse(section.stderr.trim()).error.hint).toContain('anatomy');
    expect(prose('guide', '--section', 'rules').status).toBe(2);
  });

  it('says plainly when a family has no guide yet', () => {
    const r = prose('guide', 'song');
    expect(r.status).toBe(1);
    const e = JSON.parse(r.stderr.trim()).error;
    expect(e.code).toBe('E_NOT_FOUND');
    expect(e.message).toMatch(/song guide is not written yet/);
    expect(e.hint).toContain('game-dialogue');
  });

  it('is listed in capabilities', async () => {
    expect((await run('capabilities')).commands).toContain('guide');
  });
});
