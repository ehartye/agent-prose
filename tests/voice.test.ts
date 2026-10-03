import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { findProject, initProject } from '../src/project.ts';
import { loadVoices } from '../src/voice.ts';
import { loadDocument } from '../src/document.ts';
import { measure } from '../src/measure/index.ts';
import { measureSpeakers } from '../src/measure/speakers.ts';
import { lint } from '../src/lint/lint.ts';
import { run } from './helpers.ts';

const bare = () => mkdtempSync(join(tmpdir(), 'prose-proj-'));
const proj = () => { const d = bare(); initProject(d); return d; };
const voiceFile = (dir: string, name: string, body: string) => writeFileSync(join(dir, '.agent-prose', 'voices', name), body);
const GRIMBLE = [
  'schema: prose/voice@1', 'id: grimble', 'name: Grimble', 'speakers: [GRIMBLE]',
  'description: A curt goblin shopkeeper.', 'samples: ["Buy or leave."]', 'banned: [friend, cheap deal]',
  'targets:', '  sentenceMean: [2, 6]',
].join('\n') + '\n';
const LINES = [
  'Hello there, my good friend, welcome to the finest shop in all the land.',
  'Every lamp on these shelves was carried over the mountains by my own two hands.',
  'Take your time and look around, because nothing here is cheap and nothing here is fake.',
];
const scene = (dir: string, lines: string[], extra = '') => {
  const f = join(dir, 'scene.fountain');
  writeFileSync(f, 'Title: T\n\nINT. SHOP - DAY\n\n' + lines.map(l => `GRIMBLE\n${l}\n\n`).join('') + extra);
  return f;
};
const rules = (r: ReturnType<typeof lint>, rule: string) => [...r.errors, ...r.warnings, ...r.info].filter(f => f.rule === rule);

describe('projects', () => {
  it('initializes idempotently', () => {
    const d = bare();
    expect(initProject(d)).toEqual({ dir: d, created: true });
    expect(initProject(d)).toEqual({ dir: d, created: false });
    expect(JSON.parse(readFileSync(join(d, '.agent-prose', 'project.json'), 'utf8'))).toEqual({ schema: 'prose/project@1' });
    expect(existsSync(join(d, '.agent-prose', 'voices'))).toBe(true);
  });
  it('finds the project from a nested directory, and nothing outside one', () => {
    const d = proj();
    const nested = join(d, 'act1', 'scenes');
    mkdirSync(nested, { recursive: true });
    expect(findProject(nested)).toBe(d);
    expect(findProject(bare())).toBeNull();
  });
  it('stops at the home directory and never treats home as a project', () => {
    // an injected home: nothing here touches the real home directory
    const home = bare();
    mkdirSync(join(home, '.agent-prose'), { recursive: true });
    writeFileSync(join(home, '.agent-prose', 'project.json'), '{"schema":"prose/project@1"}\n');
    const work = join(home, 'work', 'drafts');
    mkdirSync(work, { recursive: true });
    expect(findProject(work, { home })).toBeNull();
    expect(findProject(home, { home })).toBeNull();
    initProject(join(home, 'work'));
    expect(findProject(work, { home })).toBe(join(home, 'work'));
  });
  it('reports the parent project a nested project shadows', () => {
    const outer = proj();
    const inner = join(outer, 'season2');
    expect(initProject(inner)).toEqual({ dir: inner, created: true, shadows: outer });
    expect(initProject(inner)).toEqual({ dir: inner, created: false, shadows: outer });
  });
});

describe('voice bibles', () => {
  it('loads voices with defaults', () => {
    const d = proj();
    voiceFile(d, 'grimble.yaml', GRIMBLE);
    const [v] = loadVoices(d);
    expect(v).toMatchObject({ id: 'grimble', speakers: ['GRIMBLE'], banned: ['friend', 'cheap deal'], catchphrases: [], targets: { sentenceMean: [2, 6] } });
  });
  it('reports a bad voice file as E_SCHEMA with the file name and pointer', () => {
    const d = proj();
    voiceFile(d, 'bad.yaml', GRIMBLE.replace('speakers: [GRIMBLE]', 'speakers: []'));
    expect(() => loadVoices(d)).toThrow(expect.objectContaining({ code: 'E_SCHEMA', pointer: '/speakers', message: expect.stringContaining('bad.yaml') }));
  });
  it('reports unparseable YAML as E_SCHEMA with the file name', () => {
    const d = proj();
    voiceFile(d, 'broken.yaml', 'id: [unclosed\n');
    expect(() => loadVoices(d)).toThrow(expect.objectContaining({ code: 'E_SCHEMA', message: expect.stringContaining('broken.yaml') }));
  });
  it('refuses a speaker claimed by two bibles, duplicate ids, an id that is not the file name, and inverted ranges', () => {
    const cases: Array<[Record<string, string>, RegExp, string]> = [
      [{ 'grimble.yaml': GRIMBLE, 'other.yaml': GRIMBLE.replace('id: grimble', 'id: other').replace('[GRIMBLE]', '[Grimble]') }, /GRIMBLE.*grimble/i, '/speakers/0'],
      [{ 'grimble.yaml': GRIMBLE, 'grimble.yml': GRIMBLE.replace('[GRIMBLE]', '[BOB]') }, /duplicate.*grimble/i, '/id'],
      [{ 'goblin.yaml': GRIMBLE }, /file name/i, '/id'],
      [{ 'grimble.yaml': GRIMBLE.replace('[2, 6]', '[6, 2]') }, /range must be \[low, high\]/, '/targets/sentenceMean'],
    ];
    for (const [files, message, pointer] of cases) {
      const d = proj();
      for (const [name, body] of Object.entries(files)) voiceFile(d, name, body);
      expect(() => loadVoices(d), String(message)).toThrow(expect.objectContaining({ code: 'E_SCHEMA', pointer, message: expect.stringMatching(message) }));
    }
  });
  it('keeps the loaded bibles on the measurement, and records a broken bible instead of throwing', () => {
    const d = proj();
    voiceFile(d, 'grimble.yaml', GRIMBLE);
    expect(measure(loadDocument(scene(d, LINES))).voices.bibles.map(v => v.id)).toEqual(['grimble']);
    voiceFile(d, 'bad.yaml', 'id: [unclosed\n');
    const m = measure(loadDocument(scene(d, LINES)));
    expect(m.voices.bibles).toEqual([]);
    expect(m.voices.error).toMatchObject({ code: 'E_SCHEMA', message: expect.stringContaining('bad.yaml'), file: join(d, '.agent-prose', 'voices', 'bad.yaml') });
  });
  it('matches a dialog speaker with an extension such as (O.S.) to the bible, and merges the stats', () => {
    const d = proj();
    voiceFile(d, 'grimble.yaml', GRIMBLE);
    const f = join(d, 'shop.dialog.yaml');
    writeFileSync(f, [
      'nodes:',
      '  - { id: a, speaker: GRIMBLE, text: "Buy or leave.", next: b }',
      '  - { id: b, speaker: GRIMBLE (O.S.), text: "Still here, friend?", end: true }',
    ].join('\n') + '\n');
    const doc = loadDocument(f);
    const m = measure(doc);
    expect(Object.keys(m.speakers)).toEqual(['GRIMBLE']);
    expect(m.speakers.GRIMBLE.blocks).toBe(2);
    expect(m.voices.matches).toEqual({ GRIMBLE: 'grimble' });
    expect(rules(lint(doc, m), 'voice.banned').map(x => x.at.speaker)).toEqual(['GRIMBLE']);
  });
  it('measures exclamations per 100 sentences', () => {
    const s = measureSpeakers([{ kind: 'line', text: 'Run! Now! Please.', line: 1, speaker: 'A' }, { kind: 'line', text: 'Go.', line: 2, speaker: 'A' }]);
    expect(s.A.exclaimPer100).toBe(50);
  });
  it('records the project and each speaker\'s matched voice', () => {
    const d = proj();
    voiceFile(d, 'grimble.yaml', GRIMBLE);
    const m = measure(loadDocument(scene(d, LINES, 'BOB\nHi.\n')));
    expect(m.voices).toMatchObject({ project: d, matches: { BOB: null, GRIMBLE: 'grimble' } });
    expect(m.voices.error).toBeUndefined();
  });
});

describe('voice lint', () => {
  it('flags a voiced speaker outside the target range and a banned word, with speaker and line', () => {
    const d = proj();
    voiceFile(d, 'grimble.yaml', GRIMBLE);
    const r = lint(loadDocument(scene(d, LINES)));
    const t = rules(r, 'voice.targets');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ severity: 'warn', at: { line: 6, speaker: 'GRIMBLE' } });
    expect(t[0].message).toMatch(/sentence mean 15 .*outside \[2, 6\]/);
    expect(t[0].message).not.toMatch(/not checked/);
    expect(t[0].measured).toMatchObject({ words: expect.any(Number) });
    const b = rules(r, 'voice.banned');
    expect(b.map(f => [f.at.speaker, f.at.line])).toEqual([['GRIMBLE', 6]]);
    expect(b[0].message).toContain('"friend"');
  });
  it('matches banned words as whole words and phrases, case-insensitively', () => {
    const d = proj();
    voiceFile(d, 'grimble.yaml', GRIMBLE);
    const r = lint(loadDocument(scene(d, ['A friendly face.', 'No CHEAP   DEAL here.', 'Friend!'])));
    expect(rules(r, 'voice.banned').map(f => [f.at.line, (f.measured as { term: string }).term])).toEqual([[9, 'cheap deal'], [12, 'friend']]);
  });
  it('does not check targets for a speaker with fewer than 40 words', () => {
    const d = proj();
    voiceFile(d, 'grimble.yaml', GRIMBLE);
    const r = lint(loadDocument(scene(d, LINES.slice(0, 1))));
    expect(rules(r, 'voice.targets')).toEqual([]);
    expect(rules(r, 'voice.banned')).toHaveLength(1);
  });
  it('reports unvoiced speakers only once the project has a voice', () => {
    const d = proj();
    const f = scene(d, LINES, 'BOB\nHi.\n');
    expect(rules(lint(loadDocument(f)), 'voice.unvoiced')).toEqual([]);
    voiceFile(d, 'grimble.yaml', GRIMBLE);
    const u = rules(lint(loadDocument(f)), 'voice.unvoiced');
    expect(u.map(x => [x.severity, x.at.speaker, x.at.line])).toEqual([['info', 'BOB', 15]]);
  });
  it('reports a broken bible as a voice.bible-valid error and still runs the other rules', () => {
    const d = proj();
    voiceFile(d, 'grimble.yaml', GRIMBLE);
    voiceFile(d, 'zz.yaml', GRIMBLE.replace('id: grimble', 'id: zz'));
    const r = lint(loadDocument(scene(d, LINES)));
    const v = rules(r, 'voice.bible-valid');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ severity: 'error', at: { line: null }, message: expect.stringContaining('zz.yaml') });
    expect(r.ok).toBe(false);
    expect(rules(r, 'style.sentence.max').length + rules(r, 'readability.grade.report').length).toBeGreaterThan(0);
    expect(rules(r, 'voice.unvoiced')).toEqual([]);
  });
  it('is silent outside a project and lists the swap-test judgement', () => {
    const r = lint(loadDocument(scene(bare(), LINES)));
    expect(rules(r, 'voice.targets').concat(rules(r, 'voice.banned'), rules(r, 'voice.unvoiced'))).toEqual([]);
    expect(r.judgement.map(j => j.rule)).toContain('voice.distinct');
  });
});

describe('project commands', () => {
  it('init creates the project and reports whether it was new', async () => {
    const d = bare();
    expect(await run('init', '--dir', d)).toEqual({ project: d, created: true });
    expect(await run('init', '--dir', d)).toEqual({ project: d, created: false });
  });
  it('init inside a project says which project it shadows', async () => {
    const outer = proj();
    const inner = join(outer, 'pilot');
    const out = await run('init', '--dir', inner);
    expect(out).toMatchObject({ project: inner, created: true, shadows: outer, hint: expect.stringContaining('voices') });
  });
  it('init refuses the home directory', async () => {
    await expect(run('init', '--dir', homedir())).rejects.toMatchObject({ code: 'E_PROJECT', hint: expect.stringContaining('run it in your project folder') });
  });
  it('voice fit writes a bible that loadVoices reads back, and voice list shows it', async () => {
    const d = proj();
    const f = scene(d, LINES);
    const out = await run('voice', 'fit', f, '--speaker', 'grimble', '--id', 'grimble', '--name', 'Grimble');
    expect(out.path).toBe(join(d, '.agent-prose', 'voices', 'grimble.yaml'));
    const [v] = loadVoices(d);
    expect(v).toMatchObject({ schema: 'prose/voice@1', id: 'grimble', name: 'Grimble', speakers: ['GRIMBLE'], samples: LINES });
    expect(v.targets.sentenceMean).toEqual([11.3, 18.8]);
    // a measured 0 gets [0, ceiling] so a single contraction or hedge does not break the voice
    expect(v.targets.exclaimPer100).toEqual([0, 10]);
    expect(v.targets.contractionsPer1000).toEqual([0, 20]);
    expect(v.targets.hedgesPer1000).toEqual([0, 10]);
    expect((await run('voice', 'list', '--dir', d)).voices.map((x: { id: string }) => x.id)).toEqual(['grimble']);
    // the fitted bible accepts the draft it was fitted from
    expect(rules(lint(loadDocument(f)), 'voice.targets')).toEqual([]);
  });
  it('voice fit refuses to overwrite a bible and needs a project', async () => {
    const d = proj();
    const f = scene(d, LINES);
    await run('voice', 'fit', f, '--speaker', 'GRIMBLE', '--id', 'grimble');
    await expect(run('voice', 'fit', f, '--speaker', 'GRIMBLE', '--id', 'grimble')).rejects.toMatchObject({ code: 'E_CONFLICT' });
    // a second bible may not claim a speaker the first already has
    await expect(run('voice', 'fit', f, '--speaker', 'GRIMBLE', '--id', 'grimble-two')).rejects.toMatchObject({ code: 'E_CONFLICT', message: expect.stringContaining('voice grimble') });
    await expect(run('voice', 'fit', scene(bare(), LINES), '--speaker', 'GRIMBLE', '--id', 'grimble')).rejects.toMatchObject({ code: 'E_PROJECT' });
  });
  it('capabilities lists the project commands', async () => {
    const caps = await run('capabilities');
    expect(caps.commands).toEqual(expect.arrayContaining(['init', 'voice fit', 'voice list']));
  });
});
