// A set.json is data from disk (a shared project, a downloaded folder): its file names must never reach outside the set.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { checkSet } from '../src/owner/check.ts';
import { setDir } from '../src/owner/paths.ts';
import { textHash } from '../src/owner/prediction.ts';
import { basePath, createSet, listSetsDetailed, readSet, variantPath } from '../src/owner/sets.ts';
import { ReadingServer } from '../src/reading/server.ts';
import { openSession } from '../src/reading/session.ts';
import { BASE, SHORT, WARM, tmp, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';
import { http, startServer } from './reading-helpers.ts';

useTmp();
useTempHome();
const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };
const failSync = (fn: () => unknown) => { try { fn(); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };

const SECRET = '---\nform: speech-small\n---\n\nSECRET-OUTSIDE-TEXT that must never be shown.\n';

/** A project with a two-variant set `evil` whose set.json is then edited, and a secret file outside the project. */
function hostile(edit: (json: any, secret: string, dir: string) => void) {
  const p = tmpProject();
  const outside = tmp('prose-outside-');
  const secret = join(outside, 'secret.md');
  writeFileSync(secret, SECRET);
  createSet(p.project, p.write('t.md', BASE), { id: 'evil', count: 2 });
  const dir = setDir(p.project, 'evil');
  const file = join(dir, 'set.json');
  const json = JSON.parse(readFileSync(file, 'utf8'));
  edit(json, secret, dir);
  writeFileSync(file, JSON.stringify(json));
  return { ...p, secret, dir };
}

const BAD: Array<[string, (secret: string, dir: string) => string]> = [
  ['a relative ../ path', (secret, dir) => relative(dir, secret).split('\\').join('/')],
  ['an absolute path', secret => secret],
  ['a Windows-style ..\\ path', (secret, dir) => relative(dir, secret).split('/').join('\\')],
  ['a name with a NUL', () => 'v1.md\0.txt'],
  ['a name with a colon', () => 'C:secret.md'],
  ['an alternate data stream', () => 'v1.md:stream'],
  ['a name with a slash', () => 'sub/v1.md'],
  ['dot-dot alone', () => '..'],
  ['a leading dot', () => '.hidden.md'],
  ['a Windows device name', () => 'nul.md'],
];

describe('set.json file names', () => {
  for (const [what, name] of BAD) {
    it(`readSet refuses ${what} as a variant file, naming the pointer`, () => {
      const h = hostile((j, s, d) => { j.variants[0].file = name(s, d); });
      const e = failSync(() => readSet(h.project, 'evil'));
      expect(e.code).toBe('E_SCHEMA');
      expect(e.pointer).toBe('/variants/0/file');
    });

    it(`readSet refuses ${what} as the base`, () => {
      const h = hostile((j, s, d) => { j.base = name(s, d); });
      expect(failSync(() => readSet(h.project, 'evil')).code).toBe('E_SCHEMA');
    });
  }

  it('readSet refuses a source that climbs out of the project or is absolute', () => {
    for (const source of ['../../secret.md', '..\\secret.md', 'a/../../b.md', 'C:\\secret.md', 'bad\0name.md']) {
      const h = hostile(j => { j.source = source; });
      expect([source, failSync(() => readSet(h.project, 'evil')).code]).toEqual([source, 'E_SCHEMA']);
    }
  });

  it('is reported by listSetsDetailed as a problem, not a crash, while good sets still list', () => {
    const h = hostile((j, s, d) => { j.variants[0].file = relative(d, s); });
    createSet(h.project, join(h.project, 't.md'), { id: 'fine', count: 2 });
    const { sets, problems } = listSetsDetailed(h.project);
    expect(sets.map(s => s.id)).toEqual(['fine']);
    expect(problems).toEqual([{ id: 'evil', error: expect.stringContaining('set.json') }]);
  });

  it('is refused by set show and set check (the secret is never read)', async () => {
    const h = hostile((j, s, d) => { j.variants[0].file = relative(d, s); });
    for (const cmd of ['show', 'check']) {
      const e = await fail('set', cmd, 'evil', '--dir', h.project);
      expect(e.code).toBe('E_SCHEMA');
      expect(e.message).not.toContain('SECRET-OUTSIDE');
    }
  });

  it('is refused by reading open --no-predict, before any server is touched', async () => {
    const h = hostile((j, s, d) => { j.variants[0].file = relative(d, s); });
    // A recorded in-process server stands in, so a failing run could never start a detached one on the default port.
    await startServer(servers, { projects: [], persist: true });
    const e = await fail('reading', 'open', '--set', 'evil', '--no-predict', '--dir', h.project);
    expect(e.code).toBe('E_SCHEMA');
  });

  it('is never served by the page payload (the outside file is not shown even when its hash was frozen)', async () => {
    const h = hostile((j, s, d) => { j.variants[0].file = relative(d, s); });
    const hashes = { '1': textHash(SECRET), '2': textHash(BASE) };
    openSession(h.project, {
      id: 'read-1', setId: 'evil', form: 'speech-small', register: null, prompt: '', shown: [1, 2], hashes, target: null, wpm: null,
      candidates: [1, 2].map(i => ({ index: i, name: `v${i}`, direction: null, round: 0 })),
    });
    const { info } = await startServer(servers, { projects: [h.project] });
    const r = await http(info, '/api/session/read-1');
    expect(r.status).toBe(200);
    expect(r.text).not.toContain('SECRET-OUTSIDE');
    expect(r.body.candidates.every((c: any) => c.hashOk === false)).toBe(true);
  });

  it('variantPath and basePath assert containment even for a set object built in code', () => {
    const p = tmpProject();
    const set = createSet(p.project, p.write('t.md', BASE), { id: 'x', count: 2 });
    const bad = { ...set, variants: [{ ...set.variants[0], file: '../../../../outside/secret.md' }, set.variants[1]] };
    const e = failSync(() => variantPath(p.project, bad, bad.variants[0]));
    expect([e.code, e.hint]).toEqual(['E_SCHEMA', expect.stringMatching(/set\.json/)]);
    expect(failSync(() => basePath(p.project, { ...set, base: '../base.md' })).code).toBe('E_SCHEMA');
    expect(failSync(() => checkSet(p.project, { ...bad, base: '../base.md' })).code).toBe('E_SCHEMA');
  });

  it('keeps ordinary names working, including 0.2.0-shaped sets', () => {
    const p = tmpProject();
    const dir = join(setDir(p.project, 'old'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'base.fountain'), 'Title: T\n\nINT. ROOM - DAY\n\nShe waits.\n');
    for (const f of ['v1.md', 'variant-2.dialog.yaml']) writeFileSync(join(dir, f), 'x\n');
    const json = {
      schema: 'prose/set@1', id: 'old', uid: 'abcdef012345', createdAt: '2026-05-01T00:00:00.000Z', form: 'tv-drama', format: 'fountain',
      source: 'drafts/pilot.fountain', base: 'base.fountain', directions: [],
      variants: [{ index: 1, file: 'v1.md', direction: null }, { index: 2, file: 'variant-2.dialog.yaml', direction: 'shorter', label: 'dry' }],
    };
    writeFileSync(join(dir, 'set.json'), JSON.stringify(json));
    const set = readSet(p.project, 'old');
    expect(variantPath(p.project, set, set.variants[1])).toBe(join(dir, 'variant-2.dialog.yaml'));
    expect(basePath(p.project, set)).toBe(join(dir, 'base.fountain'));
    // and a freshly made set round-trips
    const fresh = createSet(p.project, p.write('t.md', SHORT), { id: 'new', count: 2 });
    writeFileSync(variantPath(p.project, fresh, fresh.variants[0]), WARM);
    expect(readSet(p.project, 'new').variants[0].file).toBe('v1.md');
  });
});
