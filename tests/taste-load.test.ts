import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURES } from '../src/owner/features.ts';
import { globalTasteDir, projectTasteDir } from '../src/owner/paths.ts';
import { createSet } from '../src/owner/sets.ts';
import { appendJsonlRows, type Verdict } from '../src/owner/verdicts.ts';
import { loadTaste, loadTasteAsync, resolveVoice, resolveVoiceAsync } from '../src/taste/load.ts';
import { tmpProject, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
const { home } = useTempHome();
void home;

const DIM = FEATURES.length;
const unit = (i: number, v = 1) => Array.from({ length: DIM }, (_, k) => (k === i ? v : 0));
const SENTENCE = FEATURES.indexOf('sentence');

/** A judgement where the shorter-sentence side (negative on `sentence`) wins: the owner "prefers shorter sentences". */
function shorter(project: string, i: number, extra: Record<string, unknown> = {}): Verdict {
  const s = (i % 3) + 1;
  return {
    schema: 'prose/verdict@2', features: 'v1', at: '2026-01-01T00:00:00.000Z', project, set: `s${i}`, setUid: `uid-${String(i).padStart(8, '0')}`, kind: 'duel', form: 'speech-small',
    register: null, voices: [], winner: { index: 1, x: unit(SENTENCE, -s) }, loser: { index: 2, x: unit(SENTENCE, s) }, weight: 1, tags: [], shown: [1, 2], n: 2, ...extra,
  } as Verdict;
}
const rows = (project: string, n: number, extra: Record<string, unknown> = {}) => Array.from({ length: n }, (_, i) => shorter(project, i, extra));
const projectLog = (p: string) => join(projectTasteDir(p), 'verdicts.jsonl');
const globalLog = () => join(globalTasteDir(), 'verdicts.jsonl');

describe('loadTaste', () => {
  it('is unusable and counts nothing with no logs', () => {
    const { project } = tmpProject();
    const t = loadTaste({ project });
    expect(t.model.usable).toBe(false);
    expect(t.counts).toEqual({ skippedVersion: 0, malformed: 0, unknownVersion: 0, rows: 0 });
    expect(t.layers).toEqual([{ name: 'global', pairs: 0 }]);
  });

  it('fits the global log and learns the shorter-sentence direction', () => {
    const { project } = tmpProject();
    appendJsonlRows(globalLog(), rows('/some/other/project', 30));
    const t = loadTaste({ project });
    expect(t.model.usable).toBe(true);
    expect(t.model.w[SENTENCE]).toBeLessThan(0);
    expect(t.counts.rows).toBe(30);
  });

  it("excludes the current project's rows from the global fit (they are written to both logs)", () => {
    const { project } = tmpProject();
    const mine = rows(project, 10);
    appendJsonlRows(projectLog(project), mine);
    appendJsonlRows(globalLog(), mine); // the same rows, as recordPick writes them
    const t = loadTaste({ project });
    // 10 project pairs are below the project threshold, and not double counted in global: the global layer holds none.
    expect(t.layers).toEqual([{ name: 'global', pairs: 0 }]);
    expect(t.model.usable).toBe(false);
    // other projects' rows still count
    appendJsonlRows(globalLog(), rows('/elsewhere', 7));
    expect(loadTaste({ project }).layers).toEqual([{ name: 'global', pairs: 7 }]);
  });

  it('compares projects by their normalised key (case and separators on Windows)', () => {
    const { project } = tmpProject();
    const alt = process.platform === 'win32' ? project.toUpperCase().replaceAll('\\', '/') : project + '/.';
    appendJsonlRows(globalLog(), rows(alt, 5));
    expect(loadTaste({ project }).layers).toEqual([{ name: 'global', pairs: 0 }]);
  });

  it('engages the project layer from the project log at 15 pairs, not 14', () => {
    const a = tmpProject(), b = tmpProject();
    appendJsonlRows(projectLog(a.project), rows(a.project, 14));
    appendJsonlRows(projectLog(b.project), rows(b.project, 15));
    expect(loadTaste({ project: a.project }).layers.map(l => l.name)).toEqual(['global']);
    expect(loadTaste({ project: b.project }).layers).toEqual([{ name: 'global', pairs: 0 }, { name: 'project', pairs: 15 }]);
  });

  it('selects voice rows by voice id and engages the voice layer at 15 pairs', () => {
    const { project } = tmpProject();
    appendJsonlRows(projectLog(project), [...rows(project, 20, { voices: ['grimble'] }), ...rows(project, 20, { voices: ['other'] }).map(r => ({ ...r, set: r.set + 'o', setUid: 'o' + r.setUid }))]);
    const t = loadTaste({ project, voice: 'grimble' });
    expect(t.layers.map(l => [l.name, l.pairs])).toEqual([['global', 0], ['project', 40], ['voice', 20]]);
    const few = tmpProject();
    appendJsonlRows(projectLog(few.project), [...rows(few.project, 30, { voices: ['other'] }), ...rows(few.project, 14, { voices: ['grimble'] }).map(r => ({ ...r, set: r.set + 'g', setUid: 'g' + r.setUid }))]);
    expect(loadTaste({ project: few.project, voice: 'grimble' }).layers.map(l => l.name)).toEqual(['global', 'project']);
    // no voice asked: no voice layer
    expect(loadTaste({ project }).layers.map(l => l.name)).toEqual(['global', 'project']);
  });

  it('skips rows of another feature version and counts them', () => {
    const { project } = tmpProject();
    const v2 = rows('/elsewhere', 6).map(r => ({ ...r, features: 'v2' }));
    appendJsonlRows(globalLog(), [...rows('/elsewhere', 4), ...v2]);
    const t = loadTaste({ project });
    expect(t.counts).toEqual({ skippedVersion: 6, malformed: 0, unknownVersion: 0, rows: 4 });
    expect(t.layers).toEqual([{ name: 'global', pairs: 4 }]);
  });

  it('counts rows of an unknown schema version, and tolerates torn and garbage lines', () => {
    const { project } = tmpProject();
    appendJsonlRows(globalLog(), rows('/elsewhere', 12));
    appendFileSync(globalLog(), 'not json at all\n{"schema":"prose/verdict@3","x":1}\n{"schema":"prose/verdict@2","kind":"duel"}\n{"schema":"prose/verdict@2","fea');
    const t = loadTaste({ project });
    expect(t.counts).toMatchObject({ unknownVersion: 1, malformed: 3, rows: 12 });
    expect(t.model.usable).toBe(true);
    expect(t.model.w.every(Number.isFinite)).toBe(true);
  });

  it('adds the counts of both logs', () => {
    const { project } = tmpProject();
    appendJsonlRows(globalLog(), rows('/elsewhere', 3));
    appendJsonlRows(projectLog(project), rows(project, 2));
    appendFileSync(projectLog(project), 'garbage\n');
    expect(loadTaste({ project }).counts).toEqual({ skippedVersion: 0, malformed: 1, unknownVersion: 0, rows: 5 });
  });

  it('counts the current project once: every pick is written to both logs, so the mirrored rows and lines are not doubled', async () => {
    const { project } = tmpProject();
    const body = [JSON.stringify(shorter(project, 1)), JSON.stringify({ ...shorter(project, 2), features: 'v2' }), JSON.stringify({ schema: 'prose/verdict@3', project }), 'garbage line'].join('\n') + '\n';
    for (const log of [projectLog(project), globalLog()]) { mkdirSync(dirname(log), { recursive: true }); writeFileSync(log, body); }
    const want = { rows: 1, skippedVersion: 1, unknownVersion: 1, malformed: 1 };
    expect(loadTaste({ project }).counts).toEqual(want);
    expect((await loadTasteAsync({ project })).counts).toEqual(want);
    // another project's rows in the global log still count, once
    appendFileSync(globalLog(), JSON.stringify({ ...shorter('/elsewhere', 3), features: 'v2' }) + '\n');
    expect(loadTaste({ project }).counts.skippedVersion).toBe(2);
  });

  it('survives an unreadable log (a directory where the file should be)', () => {
    const { project } = tmpProject();
    mkdirSync(projectLog(project), { recursive: true });
    const t = loadTaste({ project });
    expect(t.model.usable).toBe(false);
    expect(t.model.w.every(Number.isFinite)).toBe(true);
  });
});

describe('resolveVoice', () => {
  const GRIMBLE = ['schema: prose/voice@1', 'id: grimble', 'name: Grimble', 'speakers: [GRIMBLE]', 'description: A curt goblin.', 'samples: ["Buy or leave."]'].join('\n') + '\n';
  const MARA = ['schema: prose/voice@1', 'id: mara', 'name: Mara', 'speakers: [MARA]', 'description: A warm guide.', 'samples: ["Come in."]'].join('\n') + '\n';
  const scene = (speakers: string[]) => 'Title: T\n\nINT. SHOP - DAY\n\n' + speakers.map(s => `${s}\nWelcome to the shop, friend.\n\n`).join('');
  const make = (voices: string[], speakers: string[]) => {
    const p = tmpProject();
    for (const [i, v] of voices.entries()) { const f = join(p.project, '.agent-prose', 'voices', `${i ? 'mara' : 'grimble'}.yaml`); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, v); }
    const set = createSet(p.project, p.write('scene.fountain', scene(speakers)), { count: 2, directions: ['shorter', 'warmer'] });
    return { project: p.project, set };
  };

  it('returns the single voice of the base draft', () => {
    const { project, set } = make([GRIMBLE], ['GRIMBLE']);
    expect(resolveVoice(project, set)).toBe('grimble');
  });
  it('resolveVoiceAsync gives the same answer as resolveVoice in each case, and null for a bad bible', async () => {
    const one = make([GRIMBLE], ['GRIMBLE']);
    expect(await resolveVoiceAsync(one.project, one.set)).toBe(resolveVoice(one.project, one.set));
    expect(await resolveVoiceAsync(one.project, one.set)).toBe('grimble');
    const two = make([GRIMBLE, MARA], ['GRIMBLE', 'MARA']);
    expect(await resolveVoiceAsync(two.project, two.set)).toBeNull();
    const none = make([GRIMBLE], ['STRANGER']);
    expect(await resolveVoiceAsync(none.project, none.set)).toBeNull();
    const bad = make(['schema: [unterminated'], ['GRIMBLE']);
    expect(await resolveVoiceAsync(bad.project, bad.set)).toBeNull();
  });
  it('returns null for several voices', () => {
    const { project, set } = make([GRIMBLE, MARA], ['GRIMBLE', 'MARA']);
    expect(resolveVoice(project, set)).toBeNull();
  });
  it('returns null for none (no bible claims the speaker) and for plain prose', () => {
    const a = make([GRIMBLE], ['STRANGER']);
    expect(resolveVoice(a.project, a.set)).toBeNull();
    const p = tmpProject();
    const set = createSet(p.project, p.write('t.md', '---\nform: speech-small\n---\n\nShort text here.\n'), { count: 2, directions: ['shorter', 'warmer'] });
    expect(resolveVoice(p.project, set)).toBeNull();
  });
});

describe('loadTasteAsync on the server path reads a tail, the CLI path reads everything', () => {
  /** n rows appended in blocks of 1000, so a 100,000-row log is written in well under a second. */
  const bigLog = (path: string, project: string, n: number) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '');
    const block = rows(project, 1000).map(r => JSON.stringify(r)).join('\n') + '\n';
    for (let k = 0; k < n / 1000; k++) appendFileSync(path, block);
  };

  it('a 100,000-row log loads quickly, reading only its last 4 MB and fitting at most maxRows rows per log', async () => {
    const { project } = tmpProject();
    bigLog(projectLog(project), project, 100_000);
    expect(statSync(projectLog(project)).size).toBeGreaterThan(20 * 1024 * 1024);
    const t0 = Date.now();
    const t = await loadTasteAsync({ project, maxRows: 3000 });
    const took = Date.now() - t0;
    expect(t.counts.rows).toBe(3000);
    expect(t.counts.malformed).toBe(0); // the leading partial line was dropped, not parsed
    expect(t.bytesRead).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(t.layers.find(l => l.name === 'project')?.pairs).toBe(3000);
    expect(t.model.usable).toBe(true);
    expect(took).toBeLessThan(3000); // loose: measured well under a second; the full log took several
  });

  it('without maxRows (the CLI) every row is read and fitted, and a small log is read whole', async () => {
    const { project } = tmpProject();
    bigLog(projectLog(project), project, 4000);
    const all = await loadTasteAsync({ project });
    expect(all.counts.rows).toBe(4000);
    expect(all.layers.find(l => l.name === 'project')?.pairs).toBe(4000);
    expect(loadTaste({ project }).counts.rows).toBe(4000);
    expect((await loadTasteAsync({ project, maxRows: 100 })).counts.rows).toBe(100);
    expect((await loadTasteAsync({ project, maxRows: 100_000 })).counts.rows).toBe(4000); // fewer rows than the cap: all of them
  });

  it('applies the cap to the global log as well, and still excludes this project from it', async () => {
    const { project } = tmpProject();
    bigLog(globalLog(), '/elsewhere', 10_000);
    appendFileSync(globalLog(), JSON.stringify(shorter(project, 1)) + '\n');
    const t = await loadTasteAsync({ project, maxRows: 500 });
    expect(t.counts.rows).toBe(499); // the last 500 lines, one of which is this project's
    expect(t.layers).toEqual([{ name: 'global', pairs: 499 }]);
  });
});
