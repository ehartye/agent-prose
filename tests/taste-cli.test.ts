import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProseError } from '../src/errors.ts';
import { FEATURES } from '../src/owner/features.ts';
import { globalTasteDir, projectTasteDir } from '../src/owner/paths.ts';
import { appendJsonlRows, type Verdict } from '../src/owner/verdicts.ts';
import { ROOT, run } from './helpers.ts';
import { tmp, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
useTempHome();

const DIM = FEATURES.length;
const unit = (i: number, v = 1) => Array.from({ length: DIM }, (_, k) => (k === i ? v : 0));
const SENTENCE = FEATURES.indexOf('sentence');
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };

/** A judgement where the shorter-sentence side wins: an owner who "prefers shorter sentences". */
const shorter = (project: string, i: number, extra: Record<string, unknown> = {}): Verdict => {
  const s = (i % 3) + 1;
  return {
    schema: 'prose/verdict@2', features: 'v1', at: '2026-01-01T00:00:00.000Z', project, set: `s${i}`, setUid: `uid-${String(i).padStart(8, '0')}`, kind: 'duel', form: 'speech-small',
    register: null, voices: [], winner: { index: 1, x: unit(SENTENCE, -s) }, loser: { index: 2, x: unit(SENTENCE, s) }, weight: 1, tags: [], shown: [1, 2], n: 2, ...extra,
  } as Verdict;
};
const rows = (project: string, n: number, extra: Record<string, unknown> = {}) => Array.from({ length: n }, (_, i) => shorter(project, i, extra));
const projectLog = (p: string) => join(projectTasteDir(p), 'verdicts.jsonl');
const globalLog = () => join(globalTasteDir(), 'verdicts.jsonl');
const names = (out: any) => out.layers.map((l: any) => l.name);

describe('prose taste show', () => {
  it('with no judgements at all exits 0 with enough: false and the honest text', async () => {
    const { project } = tmpProject();
    const out = await run('taste', 'show', '--dir', project);
    expect(out).toMatchObject({ project, voice: null, enough: false, layers: [{ name: 'global', pairs: 0 }], counts: { rows: 0, skippedVersion: 0 } });
    expect(out.markdown).toContain('Not enough judgements yet');
    expect(Object.keys(out)).toEqual(['project', 'voice', 'layers', 'counts', 'enough', 'preferences', 'markdown']);
  });

  it('gives a seeded owner who prefers shorter sentences that preference first, as strong', async () => {
    const { project } = tmpProject();
    appendJsonlRows(globalLog(), rows('/elsewhere', 30));
    const out = await run('taste', 'show', '--dir', project);
    expect(out.enough).toBe(true);
    expect(out.preferences[0]).toMatchObject({ feature: 'sentence', words: 'shorter sentences', confidence: 'strong' });
    expect(out.markdown).toContain('**shorter sentences**');
  });

  it('says in markdown that these are tendencies, not rules or quality', async () => {
    const { project } = tmpProject();
    const out = await run('taste', 'show', '--dir', project);
    expect(out.markdown).toMatch(/tendencies/);
    expect(out.markdown).toMatch(/not rules/);
    expect(out.markdown).toMatch(/nothing about quality/);
  });

  it('reports no project layer below 15 pairs, and one at 15', async () => {
    const a = tmpProject(), b = tmpProject();
    appendJsonlRows(projectLog(a.project), rows(a.project, 14));
    appendJsonlRows(projectLog(b.project), rows(b.project, 15));
    expect(names(await run('taste', 'show', '--dir', a.project))).toEqual(['global']);
    expect(names(await run('taste', 'show', '--dir', b.project))).toEqual(['global', 'project']);
  });

  it('claims a voice layer only with 15 pairs naming the voice, and prints the voice id either way', async () => {
    const few = tmpProject(), enough = tmpProject();
    appendJsonlRows(projectLog(few.project), [...rows(few.project, 30, { voices: ['other'] }), ...rows(few.project, 14, { voices: ['grimble'] }).map(r => ({ ...r, set: r.set + 'g', setUid: 'g' + r.setUid }))]);
    appendJsonlRows(projectLog(enough.project), rows(enough.project, 20, { voices: ['grimble'] }));
    const a = await run('taste', 'show', '--voice', 'grimble', '--dir', few.project);
    expect(a.voice).toBe('grimble');
    expect(names(a)).toEqual(['global', 'project']);
    const b = await run('taste', 'show', '--voice', 'grimble', '--dir', enough.project);
    expect(b.voice).toBe('grimble');
    expect(names(b)).toEqual(['global', 'project', 'voice']);
    expect(b.markdown).toContain('voice (20 pairs)');
    // an id with no bible and no rows is accepted, and claims nothing
    const c = await run('taste', 'show', '--voice', 'nobody', '--dir', enough.project);
    expect(c.voice).toBe('nobody');
    expect(names(c)).toEqual(['global', 'project']);
  });

  it('reports rows of another feature version in counts.skippedVersion', async () => {
    const { project } = tmpProject();
    appendJsonlRows(globalLog(), [...rows('/elsewhere', 4), ...rows('/elsewhere', 6).map(r => ({ ...r, features: 'v2', setUid: 'z' + r.setUid }))]);
    const out = await run('taste', 'show', '--dir', project);
    expect(out.counts.skippedVersion).toBe(6);
    expect(out.markdown).toMatch(/6 judgements made with another feature version were left out/);
  });

  it('outside a project is E_PROJECT with the usual hint, like taste stats', async () => {
    const e = await fail('taste', 'show', '--dir', tmp());
    expect(e.code).toBe('E_PROJECT');
    expect(e.hint).toMatch(/prose init/);
  });

  it('with --all-projects reports the global layer only, from every project, and says so', async () => {
    const { project } = tmpProject();
    appendJsonlRows(projectLog(project), rows(project, 20));
    appendJsonlRows(globalLog(), [...rows(project, 20), ...rows('/elsewhere', 10)]);
    const out = await run('taste', 'show', '--all-projects', '--dir', tmp());
    expect(out.project).toBeNull();
    expect(out.layers).toEqual([{ name: 'global', pairs: 30 }]);
    expect(out.markdown).toMatch(/global layer only/);
    expect((await run('taste', 'show', '--all-projects', '--dir', project)).layers).toEqual([{ name: 'global', pairs: 30 }]);
  });
});

describe('prose taste stats', () => {
  it('prints the same bytes for a fixed fixture (the agent fields as before, plus model and comparison)', async () => {
    const { project } = tmpProject();
    appendJsonlRows(projectLog(project), rows(project, 3));
    appendJsonlRows(globalLog(), [...rows(project, 3), ...rows('/elsewhere', 2)]);
    const out = await run('taste', 'stats', '--dir', project);
    const text = JSON.stringify(out, null, 2).replaceAll(JSON.stringify(project).slice(1, -1), '<project>') + '\n';
    expect(text).toBe(readFileSync(join(ROOT, 'tests', 'fixtures', 'taste-stats.golden.json'), 'utf8'));
  });
});
