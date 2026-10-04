import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { lint } from '../src/lint/lint.ts';
import { loadDocument } from '../src/document.ts';
import { readSet } from '../src/owner/sets.ts';
import { loadVoices, VoiceSchema } from '../src/voice.ts';
import { tmpProject, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };
const BASE = { schema: 'prose/voice@1', id: 'jane', name: 'Jane', speakers: ['JANE'], description: 'Dry.' };
const SCENE = 'Title: T\n\nINT. SHOP - DAY\n\nJANE\nBuy it or leave.\n\nBOB\nLet me think.\n';
const bible = (p: { write: (n: string, t: string) => string }, id: string, speakers: string[], extra = '') =>
  p.write(`.agent-prose/voices/${id}.yaml`, `schema: prose/voice@1\nid: ${id}\nname: ${id.toUpperCase()}\nspeakers: [${speakers.join(', ')}]\ndescription: Terse and dry.\n${extra}`);

describe('voice bible schema', () => {
  it('bio is optional, at most 600 characters, and not blank', () => {
    expect(VoiceSchema.safeParse(BASE).success).toBe(true);
    expect(VoiceSchema.safeParse({ ...BASE, bio: 'x'.repeat(600) }).success).toBe(true);
    expect(VoiceSchema.safeParse({ ...BASE, bio: 'x'.repeat(601) }).success).toBe(false);
    expect(VoiceSchema.safeParse({ ...BASE, bio: '  ' }).success).toBe(false);
  });
  it('stays strict and samples are optional', () => {
    expect(VoiceSchema.safeParse({ ...BASE, mood: 'sad' }).success).toBe(false);
    expect(VoiceSchema.parse(BASE).samples).toEqual([]);
    expect(VoiceSchema.parse({ ...BASE, samples: [] }).samples).toEqual([]);
  });
  it('an old bible with samples and no bio loads unchanged', () => {
    const p = tmpProject();
    bible(p, 'old', ['OLD'], 'samples: ["Buy or leave."]\ntargets:\n  sentenceMean: [2, 6]\n');
    const [v] = loadVoices(p.project);
    expect(v.samples).toEqual(['Buy or leave.']);
    expect(v.bio).toBeUndefined();
  });
  it('the loader hint no longer demands samples', () => {
    const p = tmpProject();
    p.write('.agent-prose/voices/bad.yaml', 'schema: prose/voice@1\nid: bad\n');
    let err: ProseError | undefined;
    try { loadVoices(p.project); } catch (e) { err = e as ProseError; }
    expect(err?.hint).toContain('samples');
    expect(err?.hint).toContain('optional');
  });
  it('lint with a bible that has no samples or targets finds nothing to flag and no error', () => {
    const p = tmpProject();
    bible(p, 'jane', ['JANE']);
    const r = lint(loadDocument(p.write('s.fountain', SCENE)));
    expect([...r.errors, ...r.warnings].filter(f => f.rule.startsWith('voice.') && f.rule !== 'voice.unvoiced')).toEqual([]);
  });
});

describe('prose voice new', () => {
  it('creates a bible without a draft: empty samples, no targets, the bio kept', async () => {
    const p = tmpProject();
    const out = await run('voice', 'new', '--dir', p.project, '--id', 'jane', '--name', 'Jane', '--speaker', 'JANE', '--speaker', 'JANE-TWO', '--bio', 'A dry ferry captain.', '--register', 'dry');
    expect(existsSync(out.path)).toBe(true);
    const [v] = loadVoices(p.project);
    expect(v).toMatchObject({ id: 'jane', bio: 'A dry ferry captain.', samples: [], register: 'dry', speakers: ['JANE', 'JANE-TWO'] });
    expect(v.targets).toEqual({});
    expect(v.description).toBe('Jane. Describe register and signature words here.');
  });
  it('bio is optional and a description replaces the default', async () => {
    const p = tmpProject();
    await run('voice', 'new', '--dir', p.project, '--id', 'bob', '--name', 'Bob', '--speaker', 'BOB', '--description', 'Wordy.');
    const [v] = loadVoices(p.project);
    expect(v.bio).toBeUndefined();
    expect(v.description).toBe('Wordy.');
  });
  it('refuses a bad id (E_USAGE), an existing id and a claimed speaker (E_CONFLICT)', async () => {
    const p = tmpProject();
    const base = ['voice', 'new', '--dir', p.project, '--name', 'N'];
    expect((await fail(...base, '--id', 'Bad_Id', '--speaker', 'A')).code).toBe('E_USAGE');
    await run(...base, '--id', 'jane', '--speaker', 'JANE');
    expect((await fail(...base, '--id', 'jane', '--speaker', 'OTHER')).code).toBe('E_CONFLICT');
    expect((await fail(...base, '--id', 'jane2', '--speaker', 'jane')).code).toBe('E_CONFLICT');
    expect((await fail(...base, '--id', 'x', '--speaker', 'A', '--bio', 'y'.repeat(601))).code).toBe('E_USAGE');
    expect(existsSync(join(p.project, '.agent-prose/voices/x.yaml'))).toBe(false);
  });
  it('list and show print the bio', async () => {
    const p = tmpProject();
    await run('voice', 'new', '--dir', p.project, '--id', 'jane', '--name', 'Jane', '--speaker', 'JANE', '--bio', 'A dry ferry captain.');
    expect((await run('voice', 'list', '--dir', p.project)).voices[0].bio).toBe('A dry ferry captain.');
    expect((await run('voice', 'show', 'jane', '--dir', p.project)).voice.bio).toBe('A dry ferry captain.');
    expect((await fail('voice', 'show', 'nope', '--dir', p.project)).code).toBe('E_USAGE');
  });
  it('voice fit still refuses an id made by voice new', async () => {
    const p = tmpProject();
    await run('voice', 'new', '--dir', p.project, '--id', 'jane', '--name', 'Jane', '--speaker', 'JANE');
    expect((await fail('voice', 'fit', p.write('s.fountain', SCENE), '--speaker', 'BOB', '--id', 'jane')).code).toBe('E_CONFLICT');
  });
});

describe('set new --character resolution', () => {
  const setup = () => {
    const p = tmpProject();
    bible(p, 'jane', ['JANE'], 'bio: A dry ferry captain who prices everything.\n');
    return { p, draft: p.write('s.fountain', SCENE) };
  };
  it('a voice id snapshots the bio and records characterRef', async () => {
    const { p, draft } = setup();
    const out = await run('set', 'new', draft, '--id', 's1', '--character', 'jane');
    expect(out.brief).toMatchObject({ character: 'A dry ferry captain who prices everything.', characterRef: 'jane', confirmed: false });
    expect(out.notes.join(' ')).toContain('voice bible jane');
    expect(readSet(p.project, 's1').brief?.characterRef).toBe('jane');
  });
  it('a bible without a bio snapshots "Name. Description"', async () => {
    const p = tmpProject();
    bible(p, 'bob', ['BOB']);
    const out = await run('set', 'new', p.write('s.fountain', SCENE), '--id', 's1', '--character', 'bob');
    expect(out.brief.character).toBe('BOB. Terse and dry.');
    expect(out.notes.join(' ')).toContain('no bio');
  });
  it('a long name and description is cut to 600 characters', async () => {
    const p = tmpProject();
    p.write('.agent-prose/voices/bob.yaml', `schema: prose/voice@1\nid: bob\nname: Bob\nspeakers: [BOB]\ndescription: ${'word '.repeat(200)}\n`);
    const out = await run('set', 'new', p.write('s.fountain', SCENE), '--id', 's1', '--character', 'bob');
    expect(out.brief.character.length).toBe(600);
  });
  it('text that is not a voice id stays inline, with no characterRef', async () => {
    const { draft } = setup();
    const out = await run('set', 'new', draft, '--id', 's1', '--character', 'A dry ferry captain.');
    expect(out.brief).toMatchObject({ character: 'A dry ferry captain.', characterRef: null });
    expect(out.notes).toBeUndefined();
  });
  it('an id-shaped value with no bible stays inline and says so', async () => {
    const { draft } = setup();
    const out = await run('set', 'new', draft, '--id', 's1', '--character', 'janet');
    expect(out.brief).toMatchObject({ character: 'janet', characterRef: null });
    expect(out.notes).toEqual(['no voice named janet; stored as inline text']);
  });
  it('without --character the one bible for the reviewed lines is used, and the output says so', async () => {
    const { p, draft } = setup();
    const out = await run('set', 'new', draft, '--id', 's1', '--lines', '6', '--context', 'a bark');
    expect(out.brief).toMatchObject({ characterRef: 'jane', context: 'a bark', confirmed: false });
    expect(out.notes[0]).toContain('speaker of these lines');
    expect(out.next).toContain('not confirmed');
    expect(readSet(p.project, 's1').brief?.confirmedAt).toBeUndefined();
  });
  it('the speakers of the lines decide, not of the whole draft', async () => {
    const { draft } = setup();
    const out = await run('set', 'new', draft, '--id', 's1', '--lines', '9');
    expect(out.brief).toBeNull();
  });
  it('without --lines the speakers of the whole draft decide: two matching bibles are refused with a hint', async () => {
    const { p, draft } = setup();
    expect((await run('set', 'new', draft, '--id', 's1')).brief.characterRef).toBe('jane');
    bible(p, 'bob', ['BOB']);
    const out = await run('set', 'new', draft, '--id', 's2');
    expect(out.brief).toBeNull();
    expect(out.notes[0]).toMatch(/2 voice bibles match.*jane, bob.*--character/);
  });
  it('a bible matching no speaker resolves nothing, silently', async () => {
    const p = tmpProject();
    bible(p, 'zed', ['ZED']);
    const out = await run('set', 'new', p.write('s.fountain', SCENE), '--id', 's1');
    expect(out.brief).toBeNull();
    expect(out.notes).toBeUndefined();
  });
  it('--brief-from copies the brief as it is, and an explicit --character beats the speaker', async () => {
    const { draft } = setup();
    await run('set', 'new', draft, '--id', 'a', '--character', 'Someone else.');
    expect((await run('set', 'new', draft, '--id', 'b', '--brief-from', 'a')).brief).toMatchObject({ character: 'Someone else.', characterRef: null });
    expect((await run('set', 'new', draft, '--id', 'c', '--character', 'Someone else.')).brief.characterRef).toBeNull();
  });
});

describe('snapshots and set brief', () => {
  it('a later bible edit never changes the set; set brief --character <id> takes a fresh snapshot and clears confirmation', async () => {
    const p = tmpProject();
    const file = bible(p, 'jane', ['JANE'], 'bio: First bio.\n');
    const draft = p.write('s.fountain', SCENE);
    await run('set', 'new', draft, '--id', 's1', '--character', 'jane', '--brief-confirmed');
    writeFileSync(file, readFileSync(file, 'utf8').replace('First bio.', 'Second bio.'));
    expect(readSet(p.project, 's1').brief?.character).toBe('First bio.');
    const out = await run('set', 'brief', 's1', '--character', 'jane', '--dir', p.project);
    expect(out.brief).toMatchObject({ character: 'Second bio.', characterRef: 'jane', confirmed: false });
  });
  it('editing the character with text drops characterRef; editing only the context keeps it', async () => {
    const p = tmpProject();
    bible(p, 'jane', ['JANE'], 'bio: A bio.\n');
    await run('set', 'new', p.write('s.fountain', SCENE), '--id', 's1', '--character', 'jane');
    expect((await run('set', 'brief', 's1', '--context', 'a bark', '--dir', p.project)).brief.characterRef).toBe('jane');
    expect((await run('set', 'brief', 's1', '--character', 'Plain words here.', '--dir', p.project)).brief).toMatchObject({ character: 'Plain words here.', characterRef: null });
  });
  it('a milestone 1 set with inline text is unchanged', async () => {
    const p = tmpProject();
    await run('set', 'new', p.write('s.fountain', SCENE), '--id', 's1', '--character', 'Dry and tired.', '--context', 'a bark');
    expect(readSet(p.project, 's1').brief).toEqual({ character: 'Dry and tired.', context: 'a bark' });
  });
});
