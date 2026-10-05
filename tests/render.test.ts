import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, linkSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { createServer } from 'node:http';
import { fixture } from './helpers.ts';

const made: string[] = [];
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'prose-render-')); made.push(d); return d; };
const dialog = () => { const file = join(temp(), 'clean.dialog.yaml'); writeFileSync(file, 'form: quest-dialog\nstart: gate\nnodes:\n  - id: gate\n    speaker: GUARD\n    text: Welcome.\n    end: true\n'); return file; };
afterEach(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });
async function render(file: string, opts: Record<string, unknown>, deps?: Record<string, unknown>): Promise<any> {
  const m = await import('../src/render/index.ts');
  return m.renderDocument(file, opts as any, deps as any);
}

describe('offline render exports', () => {
  it('produces a standalone safe reading copy with emphasis, local fonts and per-page timing', async () => {
    const dir = temp(), source = join(dir, 'speech.md'), out = join(dir, 'speech.html');
    writeFileSync(source, '---\nform: speech-large\nwpm: 100\n---\n\n# Welcome\n\n**Keep your courage**, and *come home*.\n<script>alert(1)</script>\n![tracker](https://example.invalid/pixel.png)\n');
    const r = await render(source, { to: 'html', out });
    const html = readFileSync(out, 'utf8');
    expect(html).toContain('<strong>Keep your courage</strong>');
    expect(html).toContain('<em>come home</em>');
    expect(html).toContain('data:font/ttf;base64,');
    expect(html).not.toMatch(/<script|<img|<link[^>]+stylesheet/i);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('100 wpm');
    expect(r.pages[0]).toMatchObject({ page: 1, wpm: 100 });
    expect(r.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('renders stage, multicamera and dual screenplay layouts with explicit breaks and speaker groups', async () => {
    const dir = temp(), source = join(dir, 'script.fountain');
    writeFileSync(source, 'Title: Small World\nAuthor: Someone\n\nINT. ROOM - DAY\n\nALICE\nHello.\n\nBOB ^\n(quietly)\nHi.\n\n===\n\nEXT. ROAD - DAY\n\nThey leave.\n');
    for (const form of ['tv-drama', 'stage-play', 'sitcom-multicam']) {
      const out = join(dir, `${form}.html`);
      const r = await render(source, { to: 'html', out, form });
      const html = readFileSync(out, 'utf8');
      expect(html).toContain('class="dual"');
      expect(html).toContain('class="page-break"');
      expect(html).toContain('class="cue"');
      expect(html).toContain('ALICE');
      expect(html).toContain(`data-form="${form}"`);
      expect(r.warnings.some((w: string) => /provisional/.test(w))).toBe(form === 'stage-play');
    }
  });

  it('copies Markdown byte for byte and exports validated dialog data plus manifest without parser tables', async () => {
    const dir = temp(), source = join(dir, 'original.md'), out = join(dir, 'copy.md');
    const bytes = Buffer.from('\uFEFF---\r\nform: professional\r\n---\r\n\r\nSome **words**.\r\n');
    writeFileSync(source, bytes);
    await render(source, { to: 'md', out });
    expect(readFileSync(out)).toEqual(bytes);
    const json = join(dir, 'gate.json');
    const r = await render(dialog(), { to: 'json', out: json });
    const data = JSON.parse(readFileSync(json, 'utf8'));
    expect(data.nodes.length).toBeGreaterThan(0);
    expect(data).not.toHaveProperty('nodeLines');
    expect(data).not.toHaveProperty('nodeLineByIndex');
    expect(data).not.toHaveProperty('barkLines');
    expect(JSON.parse(readFileSync(`${json}.manifest.json`, 'utf8'))).toMatchObject({ schema: 'prose/render-manifest@1', form: 'quest-dialog', sourceHash: r.sourceHash });
  });

  it('refuses existing artifacts, aliases, unsupported targets and audio flags without opt-in before work', async () => {
    const dir = temp(), out = join(dir, 'existing.html');
    writeFileSync(out, 'owner text');
    await expect(render(fixture('keynote.md'), { to: 'html', out })).rejects.toMatchObject({ code: 'E_CONFLICT' });
    expect(readFileSync(out, 'utf8')).toBe('owner text');
    const alias = join(dir, 'alias.md'); linkSync(fixture('keynote.md'), alias);
    await expect(render(fixture('keynote.md'), { to: 'md', out: alias })).rejects.toMatchObject({ code: 'E_CONFLICT' });
    await expect(render(fixture('pilot.fountain'), { to: 'json', out: join(dir, 'bad.json') })).rejects.toMatchObject({ code: 'E_USAGE' });
    await expect(render(fixture('keynote.md'), { to: 'html', out: join(dir, 'ok.html'), audioOut: join(dir, 'speech.wav') })).rejects.toMatchObject({ code: 'E_USAGE' });
    expect(readdirSync(dir).filter(n => /render|ok\.html|bad\.json/.test(n))).toEqual([]);
  });

  it('reports the paired missing browser and leaves no completed artifact', async () => {
    const dir = temp(), out = join(dir, 'speech.pdf');
    await expect(render(fixture('keynote.md'), { to: 'pdf', out }, { browserHome: join(dir, 'no-browser') })).rejects.toMatchObject({ code: 'E_BROWSER_MISSING', hint: expect.stringContaining('--pdf') });
    expect(existsSync(out)).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('rolls back all published files after a publication failure, preserving a concurrent owner file', async () => {
    const dir = temp(), out = join(dir, 'dialog.json');
    await expect(render(dialog(), { to: 'json', out }, { beforePublish: (index: number, target: string) => { if (index === 1) writeFileSync(target, 'owner text'); } })).rejects.toMatchObject({ code: 'E_CONFLICT' });
    expect(existsSync(out)).toBe(false);
    expect(readFileSync(`${out}.manifest.json`, 'utf8')).toBe('owner text');
    expect(readdirSync(dir)).toEqual(['dialog.json.manifest.json']);
  });

  it('registers a CLI command for each target and reports external audio in help', async () => {
    const { registerRenderCommands } = await import('../src/commands/render.ts');
    const output: unknown[] = [], program = new Command();
    registerRenderCommands(program, { emit: value => output.push(value) });
    const dir = temp();
    await program.parseAsync(['node', 'prose', 'render', fixture('keynote.md'), '--to', 'html', '--out', join(dir, 'keynote.html')]);
    expect(output[0]).toMatchObject({ form: 'speech-large', to: 'html' });
    expect(program.commands[0].helpInformation()).toContain('sends text to OpenAI');
  });

  it('checks the optional PDF browser without downloading on --check', async () => {
    const { inspectPdfBrowser } = await import('../scripts/managed-runtime.js');
    expect(inspectPdfBrowser(join(import.meta.dirname, '..'), { home: temp() })).toMatchObject({ installed: false, repair: expect.stringContaining('--pdf') });
  });

  it('recovers an interrupted publication across output directories without overwriting files', async () => {
    const first = temp(), second = temp(), out = join(first, 'copy.html'), wav = join(second, 'copy.wav');
    const module = pathToFileURL(join(import.meta.dirname, '..', 'src', 'render', 'publish.ts')).href;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', `import {publish} from ${JSON.stringify(module)}; const paths=JSON.parse(process.argv[1]); publish(paths.map(path=>({path,bytes:Buffer.from('staged')})), i=>{if(i===2)process.exit(3)});`, JSON.stringify([out, wav, `${wav}.manifest.json`])], { encoding: 'utf8' });
    expect(run.status).toBe(3); expect(existsSync(out)).toBe(true); expect(existsSync(wav)).toBe(true);
    const { recoverPublications } = await import('../src/render/publish.ts');
    recoverPublications([out]);
    expect(readdirSync(first)).toEqual([]); expect(readdirSync(second)).toEqual([]);
  });

  it('refuses recovery when an interrupted output was edited, preserving the owners bytes', async () => {
    const dir = temp(), out = join(dir, 'copy.html'), other = join(dir, 'other.html');
    const module = pathToFileURL(join(import.meta.dirname, '..', 'src', 'render', 'publish.ts')).href;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', `import {publish} from ${JSON.stringify(module)}; publish(JSON.parse(process.argv[1]).map(path=>({path,bytes:Buffer.from('staged')})), i=>{if(i===1)process.exit(3)});`, JSON.stringify([out, other])], { encoding: 'utf8' });
    expect(run.status).toBe(3); writeFileSync(out, 'owner edit');
    const { recoverPublications } = await import('../src/render/publish.ts');
    expect(() => recoverPublications([out])).toThrow(expect.objectContaining({ code: 'E_CONFLICT' }));
    expect(readFileSync(out, 'utf8')).toBe('owner edit');
  });

  it('reports the selected WPM and counts words across source line boundaries', async () => {
    const dir = temp(), source = join(dir, 'speech.md');
    writeFileSync(source, `---\nform: speech-large\nwpm: 111\n---\n\nHello\nworld\n${'a'.repeat(90)}\n`);
    const r = await render(source, { to: 'html', out: join(dir, 'speech.html') });
    expect(r.pages.reduce((n: number, p: any) => n + p.words, 0)).toBe(r.estimates.spoken.words);
  });

  it('rejects structurally broken dialog graphs before JSON publication', async () => {
    const dir = temp(), out = join(dir, 'broken.json');
    await expect(render(fixture('gate.dialog.yaml'), { to: 'json', out })).rejects.toMatchObject({ code: 'E_SCHEMA', details: { issues: expect.arrayContaining([expect.objectContaining({ kind: 'dangling' })]) } });
    expect(readdirSync(dir)).toEqual([]);
  });

  it('preserves cue extensions before parentheticals and every line of a speech quotation', async () => {
    const dir = temp(), script = join(dir, 'script.fountain'), out = join(dir, 'script.html');
    writeFileSync(script, 'INT. ROOM - DAY\n\nALICE (O.S.)\n(quietly)\nHello.\n');
    await render(script, { to: 'html', out }); expect(readFileSync(out, 'utf8').includes('ALICE (O.S.)')).toBe(true);
    const speech = join(dir, 'speech.md'), copy = join(dir, 'speech.html');
    writeFileSync(speech, '---\nform: speech-large\n---\n\n> Keep **your courage**.\n> And come home.\n');
    await render(speech, { to: 'html', out: copy });
    expect(readFileSync(copy, 'utf8').includes('And come home.')).toBe(true);
    expect(readFileSync(copy, 'utf8').includes('<strong>your courage</strong>')).toBe(true);
  });
});

describe('explicit cloud audio with a local fake provider', () => {
  async function fake(responder: (body: any, index: number) => { status?: number; bytes: Buffer }) {
    const requests: any[] = [];
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push(body);
      const r = responder(body, requests.length); res.writeHead(r.status ?? 200, { 'Content-Type': 'application/octet-stream' }); res.end(r.bytes);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const addr = server.address() as { port: number };
    return { requests, endpoint: `http://127.0.0.1:${addr.port}/v1/audio/speech`, close: () => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
  }

  it('splits Unicode within character/token bounds, preserves chunk order and writes valid disclosed WAV', async () => {
    const f = await fake((_body, index) => ({ bytes: Buffer.from([index, 0, index, 0]) }));
    try {
      const dir = temp(), source = join(dir, 'speech.md'), out = join(dir, 'speech.html'), audioOut = join(dir, 'speech.wav');
      const text = ('Brave 🌞 people, welcome home!\n').repeat(160);
      writeFileSync(source, `---\nform: speech-large\n---\n\n${text}`);
      const r = await render(source, { to: 'html', out, tts: 'openai', audioOut, voice: 'marin' }, { tts: { endpoint: f.endpoint, apiKey: 'fake-test-key' } });
      expect(f.requests.length).toBeGreaterThan(1);
      expect(f.requests.every(b => b.input.length <= 4096 && Buffer.byteLength(b.input) <= 1800 && !/[\uD800-\uDBFF]$/.test(b.input))).toBe(true);
      expect(f.requests.every(b => b.response_format === 'pcm' && b.voice === 'marin')).toBe(true);
      expect(f.requests.map(b => b.input).join('')).toBe(text.trim());
      const wav = readFileSync(audioOut);
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF'); expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
      expect(wav.readUInt32LE(24)).toBe(24000); expect(wav.readUInt16LE(22)).toBe(1); expect(wav.readUInt16LE(34)).toBe(16);
      expect([...wav.subarray(44)].filter((_, i) => i % 4 === 0)).toEqual(f.requests.map((_, i) => i + 1));
      expect(readFileSync(out, 'utf8')).toContain('AI-generated voice');
      expect(JSON.parse(readFileSync(`${audioOut}.manifest.json`, 'utf8'))).toMatchObject({ disclosure: 'AI-generated voice', chunkCount: f.requests.length, sourceHash: r.sourceHash });
    } finally { await f.close(); }
  });

  it('never contacts a provider without opt-in and cleans all artifacts on malformed PCM/provider failure', async () => {
    const f = await fake(() => ({ bytes: Buffer.from([1]) }));
    try {
      const dir = temp(), out = join(dir, 'speech.html');
      await render(fixture('keynote.md'), { to: 'html', out }, { tts: { endpoint: f.endpoint, apiKey: 'fake' } });
      expect(f.requests).toEqual([]);
      const failed = join(dir, 'failed.html');
      await expect(render(fixture('keynote.md'), { to: 'html', out: failed, tts: 'openai', audioOut: join(dir, 'failed.wav') }, { tts: { endpoint: f.endpoint, apiKey: 'fake' } })).rejects.toMatchObject({ code: 'E_TTS' });
      expect(readdirSync(dir)).toEqual(['speech.html']);
    } finally { await f.close(); }
  });

  it('returns E_TTS on provider HTTP failure and leaves no companion artifacts', async () => {
    const f = await fake(() => ({ status: 500, bytes: Buffer.from('secret error details') }));
    try {
      const dir = temp();
      await expect(render(fixture('keynote.md'), { to: 'html', out: join(dir, 'copy.html'), tts: 'openai', audioOut: join(dir, 'voice.wav') }, { tts: { endpoint: f.endpoint, apiKey: 'secret-key' } })).rejects.toMatchObject({ code: 'E_TTS', message: 'Speech provider returned HTTP 500' });
      expect(readdirSync(dir)).toEqual([]);
    } finally { await f.close(); }
  });
});
