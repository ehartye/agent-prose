import { afterEach, describe, expect, it, vi } from 'vitest';
import { dirname } from 'node:path';
import { appendFileSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURES } from '../src/owner/features.ts';
import { projectTasteDir } from '../src/owner/paths.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { createSet, variantPath } from '../src/owner/sets.ts';
import { appendJsonlRows, type Verdict } from '../src/owner/verdicts.ts';
import { openSession } from '../src/reading/session.ts';
import type { ReadingServer } from '../src/reading/server.ts';
import { TasteDuels } from '../src/reading/taste.ts';
import { readSet } from '../src/owner/sets.ts';
import { tmpProject, useTempHome, useTmp } from './owner-helpers.ts';
import { TOKEN, http, post, startServer } from './reading-helpers.ts';

useTmp();
useTempHome();

const servers: ReadingServer[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map(s => s.close()));
});

const DIM = FEATURES.length;
const LENGTH = FEATURES.indexOf('length');
const unit = (i: number, v: number) => Array.from({ length: DIM }, (_, k) => (k === i ? v : 0));
const header = '---\nform: speech-small\n---\n\n';
const PLAIN = ['The river rose slowly through the spring.', 'Farmers watched the water and waited for news.', 'Engineers arrived with maps and heavy boots.', 'Nobody slept much during those long weeks.', 'Children carried sandbags down the muddy lane.', 'By June the crest had finally passed us.'];
const OTHER = ['A narrow road climbed the northern hill.', 'Merchants hauled their goods across the ford.', 'Rain fell on the roofs for nine days.', 'The mayor promised stone arches and iron rails.', 'Carpenters measured twice and cut once again.', 'Autumn brought the first crossing at dawn.'];
/** Variant 1 is one sentence; 2 and 3 are six different sentences of nearly equal length: 2 and 3 are nearly tied on length, 1 is far from both. */
const TEXTS = [`${header}${PLAIN[0]}\n`, `${header}${PLAIN.join(' ')}\n`, `${header}${OTHER.join(' ')}\n`];
const BASE = `${header}A short note about the town and its old bridge.\n`;

/** A project whose three variants have the texts above, sealed, with a session over all three. */
function seedLengths() {
  const p = tmpProject();
  const set = createSet(p.project, p.write('t.md', BASE), { id: 'demo', count: 3, directions: ['shorter', 'warmer', 'punchier'] });
  TEXTS.forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  const prediction = writePrediction(p.project, set, { pick: 2, shortlist: [3], why: 'sealed' });
  openSession(p.project, {
    id: 'read-1', setId: 'demo', form: 'speech-small', register: null, prompt: 'the bridge speech', shown: prediction.shown, hashes: prediction.hashes, target: null, wpm: null,
    candidates: set.variants.map(v => ({ index: v.index, name: `v${v.index}`, direction: v.direction, round: 0 })),
  });
  return p;
}

/** One judgement by this project's owner, won by the variant that is longer on the `length` feature. */
function row(project: string, i: number): Verdict {
  return {
    schema: 'prose/verdict@2', features: 'v1', at: '2026-01-01T00:00:00.000Z', project, set: `s${i}`, setUid: `uid-${String(i).padStart(8, '0')}`, kind: 'duel', form: 'speech-small',
    register: null, voices: [], winner: { index: 1, x: unit(LENGTH, 1.5) }, loser: { index: 2, x: unit(LENGTH, -1.5) }, weight: 1, tags: [], shown: [1, 2], n: 2,
  } as Verdict;
}
const seedVerdicts = (project: string, n: number, from = 0) => {
  mkdirSync(projectTasteDir(project), { recursive: true });
  appendJsonlRows(join(projectTasteDir(project), 'verdicts.jsonl'), Array.from({ length: n }, (_, i) => row(project, from + i)));
};

/** n rows in blocks of 1000: a 100,000-row log is written in well under a second. */
const seedBig = (project: string, n: number) => {
  mkdirSync(projectTasteDir(project), { recursive: true });
  const file = join(projectTasteDir(project), 'verdicts.jsonl');
  writeFileSync(file, '');
  const block = Array.from({ length: 1000 }, (_, i) => JSON.stringify(row(project, i))).join('\n') + '\n';
  for (let k = 0; k < n / 1000; k++) appendFileSync(file, block);
  return file;
};

const lineup = { type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3], eventId: 'l' };
async function pairOf(info: Parameters<typeof http>[0]): Promise<unknown> {
  const r = await http(info, '/api/session/read-1');
  expect(r.status).toBe(200);
  return r.body.pair;
}

describe('the duel the page asks', () => {
  it('uses the old rule with no taste data', async () => {
    const p = seedLengths();
    const { info } = await startServer(servers, { projects: [p.project] });
    expect((await post(info, 'read-1', lineup)).status).toBe(200);
    expect(await pairOf(info)).toEqual([1, 2]);
  });

  it('asks the pair the model is least sure of for a seeded owner', async () => {
    const p = seedLengths();
    seedVerdicts(p.project, 40); // this owner always prefers the longer variant
    const { info, server } = await startServer(servers, { projects: [p.project] });
    expect((await post(info, 'read-1', lineup)).status).toBe(200);
    // Variants 1 and 3 (and 1 and 2) differ by about 2.6 log2-words on a learned, strong preference: the model is near-certain which
    // wins, so asking tells it little. Variants 2 and 3 are nearly tied on length, so the model is closest to a coin flip there
    // and the answer teaches it most. The old rule would ask [1, 2] (the first listed pair).
    expect(await pairOf(info)).toEqual([2, 3]);
    expect(server.loads.models).toBe(1);
  });

  it('keeps asking uncertain pairs after the first answer, never a repeat, and ends with null', async () => {
    const p = seedLengths();
    seedVerdicts(p.project, 40);
    const { info } = await startServer(servers, { projects: [p.project] });
    await post(info, 'read-1', lineup);
    const seen: string[] = [];
    for (let n = 0; n < 3; n++) {
      const pair = (await pairOf(info)) as [number, number];
      seen.push(pair.join('-'));
      await post(info, 'read-1', { type: 'duel', a: pair[0], b: pair[1], outcome: 'a', position: 'ab', eventId: `d${n}` });
    }
    expect(new Set(seen).size).toBe(3);
    expect(seen[0]).toBe('2-3');
    expect(await pairOf(info)).toBeNull();
  });

  it('uses the old rule when the taste log cannot be read, and says so once on stderr without paths or the token', async () => {
    const p = seedLengths();
    mkdirSync(join(projectTasteDir(p.project), 'verdicts.jsonl'), { recursive: true }); // a directory where the log should be: a read fails
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { info } = await startServer(servers, { projects: [p.project] });
    await post(info, 'read-1', lineup);
    expect(await pairOf(info)).toEqual([1, 2]);
    expect(await pairOf(info)).toEqual([1, 2]);
    const lines = err.mock.calls.map(c => String(c[0])).filter(l => /taste/i.test(l));
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
    expect(lines[0]).not.toContain(TOKEN);
    expect(lines[0]).not.toContain(p.project);
    expect(lines[0]).not.toContain('verdicts');
  });

  it('uses the old rule for a log of garbage', async () => {
    const p = seedLengths();
    mkdirSync(projectTasteDir(p.project), { recursive: true });
    writeFileSync(join(projectTasteDir(p.project), 'verdicts.jsonl'), 'not json\n{"schema":"prose/verdict@2"}\n\u0000\u0000\n');
    const { info } = await startServer(servers, { projects: [p.project] });
    await post(info, 'read-1', lineup);
    expect(await pairOf(info)).toEqual([1, 2]);
  });
});

describe('the taste model cache', () => {
  it('is reused while the logs are unchanged and refreshed when a verdict is appended', async () => {
    const p = seedLengths();
    seedVerdicts(p.project, 20);
    const { info, server } = await startServer(servers, { projects: [p.project] });
    await post(info, 'read-1', lineup);
    await pairOf(info); await pairOf(info); await pairOf(info);
    expect(server.loads.models).toBe(1);
    const vectors = server.loads.vectors;
    expect(vectors).toBe(3); // one per candidate, cached by variant hash
    seedVerdicts(p.project, 1, 100);
    await pairOf(info);
    expect(server.loads.models).toBe(2);
    expect(server.loads.vectors).toBe(vectors);
    await pairOf(info);
    expect(server.loads.models).toBe(2);
  });

  it('refreshes when the log only changes size', async () => {
    const p = seedLengths();
    seedVerdicts(p.project, 20);
    const { info, server } = await startServer(servers, { projects: [p.project] });
    await post(info, 'read-1', lineup);
    await pairOf(info);
    appendFileSync(join(projectTasteDir(p.project), 'verdicts.jsonl'), '\n');
    await pairOf(info);
    expect(server.loads.models).toBe(2);
  });
});

describe('the taste model cache and mtime', () => {
  it('an mtime-only touch of the log does not refit the model', async () => {
    const p = seedLengths();
    seedVerdicts(p.project, 20);
    const { info, server } = await startServer(servers, { projects: [p.project] });
    await post(info, 'read-1', lineup);
    await pairOf(info);
    expect(server.loads.models).toBe(1);
    const file = join(projectTasteDir(p.project), 'verdicts.jsonl');
    const t = new Date(Date.now() + 5000);
    utimesSync(file, t, t);
    await pairOf(info); await pairOf(info);
    expect(server.loads.models).toBe(1);
  });
});

describe('the server stays responsive while the model loads', () => {
  it('a 100,000-row log: /api/health stays fast during the load, which reads only the tail', async () => {
    const p = seedLengths();
    seedBig(p.project, 100_000);
    const { info, server } = await startServer(servers, { projects: [p.project] });
    const t0 = Date.now();
    const loading = post(info, 'read-1', lineup); // the lineup answer is the first payload that asks for the model
    let done = false;
    void loading.then(() => { done = true; });
    const slowest: number[] = [];
    do {
      const t = Date.now();
      expect((await http(info, '/api/health')).status).toBe(200);
      slowest.push(Date.now() - t);
    } while (!done && slowest.length < 200);
    const took = Date.now() - t0;
    expect(Math.max(...slowest)).toBeLessThan(300);
    expect((await loading).status).toBe(200);
    expect(server.loads.models).toBe(1);
    expect(await pairOf(info)).toEqual([2, 3]);
    expect(took).toBeLessThan(3000);
    expect(server.loads.bytes).toBeLessThanOrEqual(4 * 1024 * 1024); // the project log's tail; the global log is empty here
  }, 30_000);

  it('answers /api/health quickly during a fit over a large seeded log', async () => {
    const p = seedLengths();
    seedVerdicts(p.project, 4000);
    const { info } = await startServer(servers, { projects: [p.project] });
    await post(info, 'read-1', lineup);
    const loading = http(info, '/api/session/read-1');
    let done = false;
    void loading.then(() => { done = true; });
    const slowest: number[] = [];
    do {
      const t = Date.now();
      expect((await http(info, '/api/health')).status).toBe(200);
      slowest.push(Date.now() - t);
    } while (!done && slowest.length < 200);
    expect(Math.max(...slowest)).toBeLessThan(300); // loose bound for a slow CI
    expect((await loading).body.pair).toEqual([2, 3]);
  }, 30_000);
});

describe('the voice and vector caches expire a failure instead of keeping it', () => {
  const GRIMBLE = ['schema: prose/voice@1', 'id: grimble', 'name: Grimble', 'speakers: [GRIMBLE]', 'description: A curt goblin.', 'samples: ["Buy or leave."]'].join('\n') + '\n';
  const scene = 'Title: T\n\nINT. SHOP - DAY\n\nGRIMBLE\nWelcome to the shop, friend.\n\n';
  const voiceFile = (project: string) => join(project, '.agent-prose', 'voices', 'grimble.yaml');

  it('resolves the voice with async fs, caches it, and retries a failed lookup after 30 seconds', async () => {
    const p = tmpProject();
    const created = createSet(p.project, p.write('scene.fountain', scene), { id: 'v', count: 2, directions: ['shorter', 'warmer'] });
    const set = readSet(p.project, created.id);
    mkdirSync(dirname(voiceFile(p.project)), { recursive: true });
    writeFileSync(voiceFile(p.project), 'schema: [unterminated'); // a transient failure: the bible does not parse yet
    const duels = new TasteDuels(() => undefined);
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    expect(await duels.voice(p.project, set)).toBeNull();
    writeFileSync(voiceFile(p.project), GRIMBLE);
    now += 10_000;
    expect(await duels.voice(p.project, set)).toBeNull(); // within 30 s the failure is remembered
    now += 25_000;
    expect(await duels.voice(p.project, set)).toBe('grimble'); // after 30 s it is looked up again
    rmSync(voiceFile(p.project));
    now += 5_000;
    expect(await duels.voice(p.project, set)).toBe('grimble'); // a found voice stays cached
  });

  it('keys the candidate vector by form as well as hash, and retries a failed read after 30 seconds', async () => {
    const p = seedLengths();
    const file = variantPath(p.project, readSet(p.project, 'demo'), readSet(p.project, 'demo').variants[0]);
    const text = (await import('node:fs')).readFileSync(file, 'utf8');
    const { textHash } = await import('../src/owner/prediction.ts');
    const hash = textHash(text);
    const duels = new TasteDuels(() => undefined);
    seedVerdicts(p.project, 20);
    await duels.chooser(p.project, null, [{ index: 1, file, form: 'speech-small', hash }, { index: 2, file, form: 'verse', hash }]);
    expect(duels.loads.vectors).toBe(2); // same text, two forms: two vectors

    const gone = join(dirname(file), 'gone.md');
    const calls: string[] = [];
    const quiet = new TasteDuels(() => calls.push('warn'));
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await quiet.chooser(p.project, null, [{ index: 1, file: gone, form: 'speech-small', hash }]);
    writeFileSync(gone, text);
    now += 10_000;
    await quiet.chooser(p.project, null, [{ index: 1, file: gone, form: 'speech-small', hash }]);
    expect(quiet.loads.vectors).toBe(0); // still the remembered failure
    now += 25_000;
    await quiet.chooser(p.project, null, [{ index: 1, file: gone, form: 'speech-small', hash }]);
    expect(quiet.loads.vectors).toBe(1);
  });
});
