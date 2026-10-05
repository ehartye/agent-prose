import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import { measure } from '../measure/index.ts';
import { spokenText } from '../measure/spoken.ts';
import { SPOKEN_KINDS } from '../kinds.ts';
import { renderHtml } from './html.ts';
import { printPdf } from './pdf.ts';
import { hash, preflight, publish, recoverPublications, type Artifact } from './publish.ts';
import { synthesize, TTS_MODEL, TTS_VOICES, type SpeechProvider } from './tts.ts';

export interface RenderOptions { to: string; out: string; form?: string; tts?: string; audioOut?: string; voice?: string }
export interface RenderDependencies { browserHome?: string; tts?: SpeechProvider; beforePublish?: (index: number, target: string) => void }

export async function renderDocument(file: string, opts: RenderOptions, deps: RenderDependencies = {}) {
  if (!['pdf', 'html', 'md', 'json'].includes(opts.to) || !opts.out) throw new ProseError('E_USAGE', 'Render requires --to pdf|html|md|json and --out');
  if ((opts.audioOut || opts.voice) && !opts.tts || opts.tts && (opts.tts !== 'openai' || !opts.audioOut)) throw new ProseError('E_USAGE', 'Audio requires --tts openai --audio-out <path.wav>');
  if (opts.audioOut && !/\.wav$/i.test(opts.audioOut)) throw new ProseError('E_USAGE', 'Audio output must use .wav');
  if (opts.voice && !TTS_VOICES.includes(opts.voice)) throw new ProseError('E_USAGE', `Unsupported OpenAI voice ${opts.voice}`);
  const source = resolve(file); let bytes: Buffer;
  try { bytes = readFileSync(source); } catch { throw new ProseError('E_NOT_FOUND', `Cannot read draft ${file}`); }
  if (bytes.length > 20 * 1024 * 1024) throw new ProseError('E_USAGE', 'Draft exceeds the 20 MiB export limit');
  const doc = parseDocument(source, bytes.toString('utf8'), { form: opts.form });
  const allowed = doc.format === 'dialog' ? ['json'] : doc.format === 'fountain' ? ['html', 'pdf'] : ['html', 'pdf', 'md'];
  if (!allowed.includes(opts.to)) throw new ProseError('E_USAGE', `${doc.format} does not support ${opts.to} export`);
  if (opts.tts && !['html', 'pdf'].includes(opts.to)) throw new ProseError('E_USAGE', 'Audio requires a companion HTML/PDF reading copy');
  const out = resolve(opts.out), manifestOut = opts.to === 'json' ? `${out}.manifest.json` : undefined;
  const audioOut = opts.audioOut ? resolve(opts.audioOut) : undefined;
  const targets = [out, ...(manifestOut ? [manifestOut] : []), ...(audioOut ? [audioOut, `${audioOut}.manifest.json`] : [])];
  recoverPublications(targets); preflight(source, targets);
  const measured = measure(doc), sourceHash = hash(bytes), warnings: string[] = [];
  if (doc.format === 'dialog') {
    const issues = measured.dialog!.issues;
    const invalid = issues.filter(i => ['dangling', 'duplicate-id', 'dead-end'].includes(i.kind));
    if (invalid.length) throw new ProseError('E_SCHEMA', 'Dialog graph has invalid targets, duplicate identities or unmarked endings', { details: { issues: invalid }, hint: 'Run prose lint and repair graph errors before exporting' });
    warnings.push(...issues.map(i => `Dialog ${i.kind} at source line ${i.line}`));
  }
  if (doc.form === 'stage-play') warnings.push('Stage-play page timing is provisional; confirm with a measured rehearsal.');
  const artifacts: Artifact[] = [], wpm = measured.spoken?.wpm ?? 130;
  let pages: ReturnType<typeof renderHtml>['pages'] = [];
  if (opts.to === 'md') artifacts.push({ path: out, bytes });
  else if (opts.to === 'json') {
    const { nodeLines: _n, nodeLineByIndex: _i, barkLines: _b, ...data } = doc.graph!;
    artifacts.push({ path: out, bytes: Buffer.from(JSON.stringify(data, null, 2) + '\n') });
    artifacts.push({ path: manifestOut!, bytes: Buffer.from(JSON.stringify({ schema: 'prose/render-manifest@1', form: doc.form, source, sourceHash, artifact: out }, null, 2) + '\n') });
  } else {
    const rendered = renderHtml(doc, bytes.toString('utf8'), wpm, !!opts.tts); pages = rendered.pages;
    artifacts.push({ path: out, bytes: opts.to === 'html' ? Buffer.from(rendered.html) : await printPdf(rendered.html, deps.browserHome) });
  }
  let audio: { model: string; voice: string; chunkCount: number; disclosure: string; textSentTo: string } | undefined;
  if (opts.tts) {
    const spoken = doc.blocks.filter(b => SPOKEN_KINDS[doc.format].includes(b.kind)).map(b => {
      const text = spokenText(b.text, { directions: doc.form === 'youtube' });
      return b.speaker ? `${b.speaker}: ${text}` : text;
    }).filter(Boolean).join('\n\n');
    const result = await synthesize(spoken, opts.voice, deps.tts);
    audio = { model: result.model, voice: result.voice, chunkCount: result.chunkCount, disclosure: 'AI-generated voice', textSentTo: 'OpenAI speech API' };
    warnings.push(`${TTS_MODEL} is pinned; OpenAI has announced speech-model deprecation on 2027-01-06.`, 'Chunked audio may have audible prosody seams.');
    artifacts.push({ path: audioOut!, bytes: result.bytes }, { path: `${audioOut}.manifest.json`, bytes: Buffer.from(JSON.stringify({ schema: 'prose/audio-manifest@1', sourceHash, ...audio }, null, 2) + '\n') });
  }
  publish(artifacts, deps.beforePublish);
  return { to: opts.to, form: doc.form, sourceHash, artifacts: artifacts.map(a => a.path), pages, estimates: { spoken: measured.spoken, script: measured.script }, warnings, ...(audio ? { audio } : {}) };
}
