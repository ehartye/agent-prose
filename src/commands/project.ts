import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { Command } from 'commander';
import { Document, isSeq } from 'yaml';
import type { Io } from '../io.ts';
import { ProseError } from '../errors.ts';
import { loadDocument } from '../document.ts';
import { measure } from '../measure/index.ts';
import { PROSE_KINDS } from '../kinds.ts';
import { initProject, needProject } from '../project.ts';
import { loadVoices, voiceFor, TARGET_KEYS, VOICE_MIN_WORDS, voicesDir, VoiceSchema, speakerKey, type TargetKey, type Voice } from '../voice.ts';
import { round1 } from '../text.ts';

const MAX_SAMPLES = 5;

/** Upper bounds for a rate measured at 0, so one contraction, hedge or exclamation does not break a fitted voice. */
const ZERO_CEILING: Partial<Record<TargetKey, number>> = { contractionsPer1000: 20, hedgesPer1000: 10, exclaimPer100: 10 };

/** ±25% around the measurement; a measured 0 gets [0, ceiling] instead of [0, 0]. */
function fitRange(key: TargetKey, v: number): [number, number] {
  const ceiling = ZERO_CEILING[key];
  if (v === 0 && ceiling !== undefined) return [0, ceiling];
  return [round1(v * 0.75), round1(v * 1.25)];
}

/** The bible as YAML, with each target range on one line as [low, high]. */
function toYaml(bible: Voice): string {
  const doc = new Document(bible);
  for (const k of TARGET_KEYS) { const range = doc.getIn(['targets', k], true); if (isSeq(range)) range.flow = true; }
  return doc.toString({ lineWidth: 0 });
}

export function registerProjectCommands(program: Command, io: Io): void {
  program.command('init')
    .description('Create .agent-prose/ (project.json and voices/) in a directory; safe to rerun')
    .option('--dir <dir>', 'project root (default: the current directory)')
    .action((opts: { dir?: string }) => {
      const { dir, created, shadows } = initProject(opts.dir ?? process.cwd());
      io.emit({
        project: dir, created,
        ...(shadows ? { shadows, hint: `Drafts under ${dir} now use this project's voices, not those of ${shadows}; copy any bibles they need into ${voicesDir(dir)}` } : {}),
      });
    });

  const voice = program.command('voice').description('Voice bibles: list or show them, create one without a draft, or fit one from a draft');

  voice.command('list')
    .description('The voice bibles of the project found from a directory upward')
    .option('--dir <dir>', 'where to start looking (default: the current directory)')
    .action((opts: { dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      io.emit({ project, voices: loadVoices(project) });
    });

  voice.command('show')
    .description('One voice bible, with its bio, samples, banned words and target ranges')
    .argument('<id>', 'voice id')
    .option('--dir <dir>', 'where to start looking (default: the current directory)')
    .action((id: string, opts: { dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const found = loadVoices(project).find(v => v.id === id);
      if (!found) throw new ProseError('E_USAGE', `No voice bible ${id}`, { hint: `Voices: ${loadVoices(project).map(v => v.id).join(', ') || '(none)'}` });
      io.emit({ project, voice: found });
    });

  voice.command('new')
    .description('Create a voice bible without a draft: who a character is (bio) and which speakers it covers; samples and targets start empty')
    .requiredOption('--id <id>', 'voice id: lower-case letters, digits and hyphens')
    .requiredOption('--name <name>', 'display name')
    .requiredOption('--speaker <name>', 'a speaker this bible covers (repeat for more)', (v: string, all: string[] = []) => [...all, v])
    .option('--bio <text>', 'personality and background, at most 600 characters; set new --character <id> snapshots it into a brief')
    .option('--description <text>', 'register and signature words (default: the name and a prompt to fill it in)')
    .option('--register <text>', 'e.g. gruff transactional')
    .option('--dir <dir>', 'project root, or any directory inside it (default: the current directory)')
    .action((opts: { id: string; name: string; speaker: string[]; bio?: string; description?: string; register?: string; dir?: string }) => {
      if (!/^[a-z0-9-]+$/.test(opts.id)) throw new ProseError('E_USAGE', `Voice id "${opts.id}" must be lower-case letters, digits and hyphens`);
      const project = needProject(opts.dir ?? process.cwd());
      const path = join(voicesDir(project), `${opts.id}.yaml`);
      if (existsSync(path)) throw new ProseError('E_CONFLICT', `Voice bible ${opts.id} already exists`, { details: { path }, hint: 'Edit the file, or choose another id' });
      const bibles = loadVoices(project);
      for (const sp of opts.speaker) {
        const owner = voiceFor(bibles, sp);
        if (owner) throw new ProseError('E_CONFLICT', `${sp} already belongs to voice ${owner.id}`, { hint: `Edit ${owner.id}.yaml, or remove ${sp} from its speakers first` });
      }
      const keys = opts.speaker.map(speakerKey);
      if (new Set(keys).size !== keys.length) throw new ProseError('E_USAGE', 'A speaker is listed twice', { hint: `Speakers: ${opts.speaker.join(', ')}` });
      const parsed = VoiceSchema.safeParse({
        schema: 'prose/voice@1', id: opts.id, name: opts.name, speakers: opts.speaker,
        ...(opts.register ? { register: opts.register } : {}),
        description: opts.description ?? `${opts.name}. Describe register and signature words here.`,
        ...(opts.bio !== undefined ? { bio: opts.bio } : {}),
      });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new ProseError('E_USAGE', `The voice bible is not usable (${issue.path.join('.') || 'bible'}): ${issue.message}`, { hint: 'A bio is at most 600 characters; name, speakers and description are not empty' });
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, toYaml(parsed.data));
      io.emit({ path, voice: parsed.data, next: `No samples or target ranges yet, so voice.targets has nothing to check. Add samples by hand, or use set new --character ${opts.id} to put the bio in a review brief` });
    });

  voice.command('fit')
    .description('Measure one speaker in a draft and write .agent-prose/voices/<id>.yaml with ranges around the measurements')
    .argument('<file>', '.fountain, .md or .dialog.yaml draft inside a prose project')
    .requiredOption('--speaker <name>', 'the speaker to measure (case-insensitive)')
    .requiredOption('--id <id>', 'voice id: lower-case letters, digits and hyphens')
    .option('--name <name>', 'display name (default: the speaker)')
    .option('--form <id>', 'override the form declared in the draft')
    .action((file: string, opts: { speaker: string; id: string; name?: string; form?: string }) => {
      if (!/^[a-z0-9-]+$/.test(opts.id)) throw new ProseError('E_USAGE', `Voice id "${opts.id}" must be lower-case letters, digits and hyphens`);
      const project = needProject(dirname(resolve(file)));
      const path = join(voicesDir(project), `${opts.id}.yaml`);
      if (existsSync(path)) throw new ProseError('E_CONFLICT', `Voice bible ${opts.id} already exists`, { details: { path }, hint: 'Edit the file, or delete it and fit again' });
      const doc = loadDocument(file, opts.form ? { form: opts.form } : {});
      const m = measure(doc);
      const speaker = Object.keys(m.speakers).find(s => s.toUpperCase() === opts.speaker.toUpperCase());
      if (!speaker) {
        throw new ProseError('E_USAGE', `${opts.speaker} has no lines in ${file}`, { hint: `Speakers: ${Object.keys(m.speakers).join(', ') || '(none)'}` });
      }
      const owner = voiceFor(loadVoices(project), speaker);
      if (owner) throw new ProseError('E_CONFLICT', `${speaker} already belongs to voice ${owner.id}`, { hint: `Edit ${owner.id}.yaml, or remove ${speaker} from its speakers and fit again` });
      const stats = m.speakers[speaker];
      const samples = [...new Set(doc.blocks.filter(b => b.speaker === speaker && PROSE_KINDS.has(b.kind)).map(b => b.text))].slice(0, MAX_SAMPLES);
      const bible: Voice = VoiceSchema.parse({
        schema: 'prose/voice@1', id: opts.id, name: opts.name ?? speaker, speakers: [speaker],
        ...(doc.register ? { register: doc.register } : {}),
        description: `Measured from ${basename(file)} (${stats.words} words). Describe register, signature words, sentence shape and motive here.`,
        samples, banned: [], catchphrases: [],
        targets: Object.fromEntries(TARGET_KEYS.map(k => [k, fitRange(k, stats[k])])),
      });
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, toYaml(bible));
      io.emit({
        path, voice: bible,
        ...(stats.words < VOICE_MIN_WORDS ? { warning: `Only ${stats.words} words measured; voice.targets skips speakers under ${VOICE_MIN_WORDS} words, and ranges from so small a sample are noisy` } : {}),
      });
    });
}
