// Voice bibles (prose/voice@1): who a voice covers, samples, banned words and measured target ranges.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ProseError } from './errors.ts';
import { PROJECT_DIR } from './project.ts';
import { splitSpeaker } from './text.ts';

const Range = z.tuple([z.number(), z.number()]).refine(([low, high]) => low <= high, 'range must be [low, high]');
export const TARGET_KEYS = ['sentenceMean', 'contractionsPer1000', 'hedgesPer1000', 'exclaimPer100'] as const;
export type TargetKey = typeof TARGET_KEYS[number];
/** Below this many words a speaker's rates are too noisy to hold against a voice bible's ranges. */
export const VOICE_MIN_WORDS = 40;

export const VoiceSchema = z.strictObject({
  schema: z.literal('prose/voice@1'),
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  speakers: z.array(z.string().min(1)).min(1),
  register: z.string().optional(),
  description: z.string().min(1),
  samples: z.array(z.string().min(1)).min(1),
  banned: z.array(z.string().min(1)).default([]),
  catchphrases: z.array(z.string().min(1)).default([]),
  targets: z.strictObject({
    sentenceMean: Range.optional(), contractionsPer1000: Range.optional(),
    hedgesPer1000: Range.optional(), exclaimPer100: Range.optional(),
  }).default({}),
});
export type Voice = z.infer<typeof VoiceSchema>;

export const voicesDir = (projectDir: string) => join(projectDir, PROJECT_DIR, 'voices');

const speakerKey = (s: string) => splitSpeaker(s).name.toUpperCase();

/**
 * Every voice bible in the project, by file name. A bad file is E_SCHEMA naming the file and the field; so is a
 * bible whose id is not its file name, an id used twice, or a speaker two bibles claim.
 */
export function loadVoices(projectDir: string): Voice[] {
  const dir = voicesDir(projectDir);
  let files: string[];
  try { files = readdirSync(dir).filter(f => /\.ya?ml$/i.test(f)).sort(); } catch { return []; }
  const ids = new Map<string, string>();
  const claimed = new Map<string, string>();
  return files.map(f => {
    const voice = readVoice(dir, f);
    const fail = (message: string, pointer: string, hint: string) =>
      new ProseError('E_SCHEMA', `${f}: ${message}`, { pointer, details: { file: join(dir, f) }, hint });
    if (voice.id !== f.replace(/\.ya?ml$/i, '')) {
      throw fail(`id "${voice.id}" must match the file name`, '/id', `Rename the file to ${voice.id}.yaml, or set id to the file name`);
    }
    if (ids.has(voice.id)) throw fail(`duplicate voice id "${voice.id}" (also in ${ids.get(voice.id)})`, '/id', 'Keep one bible per voice id');
    ids.set(voice.id, f);
    voice.speakers.forEach((s, k) => {
      const owner = claimed.get(speakerKey(s));
      if (owner) throw fail(`speaker ${s} is already claimed by voice ${owner}`, `/speakers/${k}`, 'Each speaker belongs to one voice bible; remove it from one of them');
      claimed.set(speakerKey(s), voice.id);
    });
    return voice;
  });
}

function readVoice(dir: string, f: string): Voice {
  let data: unknown;
  try {
    data = parseYaml(readFileSync(join(dir, f), 'utf8'));
  } catch (e) {
    throw new ProseError('E_SCHEMA', `${f}: ${(e as Error).message}`, { details: { file: join(dir, f) }, hint: 'Fix the YAML syntax in the voice bible' });
  }
  const r = VoiceSchema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new ProseError('E_SCHEMA', `${f}: ${issue.message}`, {
      pointer: issue.path.length ? '/' + issue.path.join('/') : '', details: { file: join(dir, f) },
      hint: 'A prose/voice@1 bible needs schema, id, name, speakers, description and samples; targets are [low, high] ranges',
    });
  }
  return r.data;
}

/** The bible that claims `speaker`, matched case-insensitively and ignoring extensions such as (O.S.). */
export const voiceFor = (voices: Voice[], speaker: string) =>
  voices.find(v => v.speakers.some(s => speakerKey(s) === speakerKey(speaker))) ?? null;
