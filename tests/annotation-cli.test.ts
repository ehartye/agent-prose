import { afterEach, describe, expect, it } from 'vitest';
import { linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './helpers.ts';
import { spawnSync } from 'node:child_process';

const cli = join(import.meta.dirname, '..', 'scripts', 'prose.mjs');

const dirs: string[] = [];
function project() {
  const dir = mkdtempSync(join(tmpdir(), 'prose-annotations-cli-'));
  dirs.push(dir);
  const source = join(dir, 'chapter.md');
  const file = join(dir, 'chapter.annotations.yaml');
  writeFileSync(source, '# A chapter\n\nFederalism divides power.\n');
  return { dir, source, file };
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('annotation CLI discovery and persisted workflow', () => {
  it('advertises implemented annotation profiles, kinds, schemas and commands', async () => {
    const caps = await run('capabilities');
    expect(caps.commands).toEqual(expect.arrayContaining(['concepts init', 'concepts check', 'annotation init', 'annotation locate', 'annotation propose', 'annotation review', 'annotation preview', 'annotation export']));
    expect(caps.annotations).toMatchObject({
      profiles: ['markdown', 'html', 'structured'],
      schemas: { sidecar: 'prose/annotations@1', concepts: 'prose/concepts@1' },
      kinds: expect.arrayContaining(['highlight', 'vocabulary', 'concept', 'definition', 'explanation', 'link']),
    });
  });

  it('creates and checks ordinary concept and annotation files without changing source bytes', async () => {
    const { source, file, dir } = project();
    const concepts = join(dir, 'concepts.yaml');
    const original = readFileSync(source, 'utf8');
    await run('concepts', 'init', '--file', concepts, '--project', 'sample-course');
    expect((await run('concepts', 'check', '--file', concepts)).problems).toEqual([]);
    const created = await run('annotation', 'init', source, '--out', file, '--concepts', concepts);
    expect(created.sidecar.schema).toBe('prose/annotations@1');
    expect(created.revision).toEqual(expect.any(String));
    expect((await run('annotation', 'check', file)).revision).toBe(created.revision);
    expect(readFileSync(source, 'utf8')).toBe(original);
    const found = await run('annotation', 'locate', file, '--quote', 'Federalism');
    expect(found.candidates).toHaveLength(1);
    expect(found.revision).toBe(created.revision);
    await expect(run('annotation', 'locate', file, '--list', 'constructor')).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
    await expect(run('concepts', 'show', '--file', concepts, '--list', 'constructor')).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
  });

  it('refuses invalid profiles and ambiguous locator requests as usage errors', async () => {
    const { source, file } = project();
    await expect(run('annotation', 'init', source, '--out', file, '--profile', 'javascript')).rejects.toMatchObject({ code: 'E_USAGE' });
    await run('annotation', 'init', source, '--out', file);
    await expect(run('annotation', 'locate', file)).rejects.toMatchObject({ code: 'E_USAGE' });
    await expect(run('annotation', 'locate', file, '--quote', 'Federalism', '--list', 'terms')).rejects.toMatchObject({ code: 'E_USAGE' });
    await expect(run('annotation', 'review', file, 'a-1', '--action', 'publish')).rejects.toMatchObject({ code: 'E_USAGE' });
    await expect(run('annotation', 'review', file, 'a-1', '--action', 'edit', '--body', 'Replacement', '--body-file', source)).rejects.toMatchObject({ code: 'E_USAGE' });
    await expect(run('annotation', 'review', file, 'a-1', '--action', 'retarget', '--candidate', 'candidate', '--target', source)).rejects.toMatchObject({ code: 'E_USAGE' });
    await expect(run('annotation', 'export', file, '--to', 'executable', '--out', join(file, '..', 'export.js'))).rejects.toMatchObject({ code: 'E_USAGE' });
    await expect(run('annotation', 'check', file, '--expect', 'unused')).rejects.toMatchObject({ code: 'E_USAGE' });
    await expect(run('annotation', 'feedback', 'session', '--since', '-1')).rejects.toMatchObject({ code: 'E_USAGE' });
    await expect(run('annotation', 'preview', file, '--port', '1.5')).rejects.toMatchObject({ code: 'E_USAGE' });
    await expect(run('concepts', 'show', '--file', join(file, '..', 'no-registry.yaml'), '--list', 'constructor')).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
  });

  it('rejects malformed proposal input and never overwrites an export destination', async () => {
    const { source, file, dir } = project();
    await run('annotation', 'init', source, '--out', file);
    const proposals = join(dir, 'proposals.yaml');
    writeFileSync(proposals, 'id: wrong-shape\n');
    await expect(run('annotation', 'propose', file, '--in', proposals)).rejects.toMatchObject({ code: 'E_SCHEMA' });
    writeFileSync(proposals, 'a: [broken\n');
    await expect(run('annotation', 'propose', file, '--in', proposals)).rejects.toMatchObject({ code: 'E_PARSE' });
    writeFileSync(proposals, '- &reuse {id: a-1}\n- *reuse\n');
    await expect(run('annotation', 'propose', file, '--in', proposals)).rejects.toMatchObject({ code: 'E_PARSE' });
    const output = join(dir, 'publication.json');
    const result = await run('annotation', 'export', file, '--to', 'json', '--out', output);
    expect(result.file).toBe(output);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(expect.any(Object));
    const original = readFileSync(source, 'utf8');
    const sidecarOriginal = readFileSync(file, 'utf8');
    const alias = join(dir, 'chapter-alias.md');
    linkSync(source, alias);
    await expect(run('annotation', 'export', file, '--to', 'html', '--out', source)).rejects.toMatchObject({ code: 'E_CONFLICT' });
    await expect(run('annotation', 'export', file, '--to', 'html', '--out', alias)).rejects.toMatchObject({ code: 'E_CONFLICT' });
    await expect(run('annotation', 'export', file, '--to', 'json', '--out', file)).rejects.toMatchObject({ code: 'E_CONFLICT' });
    await expect(run('annotation', 'export', file, '--to', 'json', '--out', output)).rejects.toMatchObject({ code: 'E_CONFLICT' });
    expect(readFileSync(source, 'utf8')).toBe(original);
    expect(readFileSync(alias, 'utf8')).toBe(original);
    expect(readFileSync(file, 'utf8')).toBe(sidecarOriginal);
  });

  it('persists candidate-bound proposals and accepts only revision-matched decisions for export', async () => {
    const { source, file, dir } = project();
    const created = await run('annotation', 'init', source, '--out', file);
    const found = await run('annotation', 'locate', file, '--quote', 'Federalism');
    const proposals = join(dir, 'proposals.json');
    writeFileSync(proposals, JSON.stringify([{ id: 'a-federalism', kind: 'definition', candidate: found.candidates[0].id, body: 'Power is divided between national and regional governments.', origin: { type: 'supplied' } }]));
    const proposed = await run('annotation', 'propose', file, '--in', proposals, '--expect', created.revision, '--event', 'propose-1');
    expect(proposed.annotations).toHaveLength(1);
    const badTarget = join(dir, 'bad-target.json');
    writeFileSync(badTarget, '[1, 2]');
    await expect(run('annotation', 'review', file, 'a-federalism', '--action', 'retarget', '--target', badTarget)).rejects.toMatchObject({ code: 'E_SCHEMA' });
    await expect(run('annotation', 'review', file, 'a-federalism', '--action', 'edit', '--body', '')).rejects.toMatchObject({ code: 'E_SCHEMA' });
    await expect(run('annotation', 'review', file, 'a-federalism', '--action', 'accept', '--expect', created.revision)).rejects.toMatchObject({ code: 'E_CONFLICT' });
    const accepted = await run('annotation', 'review', file, 'a-federalism', '--action', 'accept', '--expect', proposed.revision, '--event', 'accept-1');
    expect(accepted.annotations[0].state).toBe('accepted');
    const output = join(dir, 'accepted.json');
    const native = await run('annotation', 'export', file, '--to', 'json', '--out', output);
    expect(native.report.warnings).not.toContain('Representation UUID URNs identify included text snapshots; they are not fetchable URLs');
    const html = await run('annotation', 'export', file, '--to', 'html', '--out', join(dir, 'accepted.html'));
    expect(html.report).toEqual(native.report);
    const web = await run('annotation', 'export', file, '--to', 'web-annotation', '--out', join(dir, 'accepted.web.json'));
    expect(web.report.warnings).toContain('Representation UUID URNs identify included text snapshots; they are not fetchable URLs');
    expect(JSON.parse(readFileSync(join(dir, 'accepted.web.json'), 'utf8')).report).toEqual(web.report);
    expect(JSON.parse(readFileSync(output, 'utf8')).annotations.map((a: { handle: string }) => a.handle)).toEqual(['a-federalism']);
    const rejected = await run('annotation', 'review', file, 'a-federalism', '--action', 'reject', '--reason', 'Too broad', '--expect', accepted.revision);
    expect(rejected.annotations[0].state).toBe('rejected');
    await run('annotation', 'export', file, '--to', 'json', '--out', join(dir, 'rejected.json'));
    expect(JSON.parse(readFileSync(join(dir, 'rejected.json'), 'utf8')).annotations).toEqual([]);
  });

  it('accepts inert structured snapshots with explicit document and block identities', async () => {
    const { dir, file } = project();
    const source = join(dir, 'snapshot.json');
    writeFileSync(source, JSON.stringify({
      schema: 'prose/structured-source@1', adapter: { id: 'course-content', version: '1' },
      documents: [{ id: 'transport', language: 'en-US', blocks: [{ id: 'transport-intro', kind: 'paragraph', runs: [{ text: 'The process is called ' }, { text: 'diffusion', marks: ['strong'] }, { text: '.' }] }] }],
    }));
    const original = readFileSync(source, 'utf8');
    const created = await run('annotation', 'init', source, '--out', file, '--profile', 'structured', '--document', 'transport');
    expect(created.sidecar.document.profile).toBe('structured');
    const found = await run('annotation', 'locate', file, '--quote', 'diffusion');
    expect(found.candidates).toHaveLength(1);
    expect(readFileSync(source, 'utf8')).toBe(original);
  });

  it('prints stable JSON errors and nonzero exit status through the real CLI', () => {
    const missing = join(project().dir, 'missing.annotations.yaml');
    const absent = spawnSync(process.execPath, [cli, 'annotation', 'check', missing], { encoding: 'utf8' });
    expect(absent.status).toBe(1);
    expect(absent.stdout).toBe('');
    expect(JSON.parse(absent.stderr).error.code).toBe('E_NOT_FOUND');
    const invalid = spawnSync(process.execPath, [cli, 'annotation', 'preview', missing, '--port', '65536'], { encoding: 'utf8' });
    expect(invalid.status).toBe(2);
    expect(JSON.parse(invalid.stderr).error.code).toBe('E_USAGE');
  });

  it('opens, checks, polls and closes a detached preview through real CLI commands', async () => {
    const { source, file, dir } = project();
    await run('annotation', 'init', source, '--out', file);
    const env = { ...process.env, AGENT_PROSE_HOME: join(dir, 'home') };
    const invoke = (...args: string[]) => {
      const result = spawnSync(process.execPath, [cli, 'annotation', ...args], { encoding: 'utf8', env, timeout: 20_000 });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      return JSON.parse(result.stdout);
    };
    const preview = invoke('preview', file, '--local', '--port', '0');
    try {
      expect(preview.localUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);
      expect(invoke('status', preview.session)).toMatchObject({ session: preview.session, running: true, state: 'open' });
      expect(invoke('feedback', preview.session, '--since', '0')).toMatchObject({ session: preview.session, cursor: 0, events: [] });
    } finally { invoke('close', preview.session); }
    expect(invoke('status', preview.session)).toMatchObject({ session: preview.session, running: false, state: 'closed' });
  }, 30_000);
});
