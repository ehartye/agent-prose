import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { run } from './helpers.ts';
import { VERSION } from '../src/version.ts';

const cli = join(import.meta.dirname, '..', 'scripts', 'prose.mjs');

describe('cli', () => {
  it('reports capabilities', async () => {
    const caps = await run('capabilities');
    expect(caps.name).toBe('prose');
    expect(caps.version).toBe(VERSION);
    expect(caps.errorCodes).toContain('E_PARSE');
    expect(caps.commands).toContain('capabilities');
  });

  it('prints usage errors as JSON on stderr with exit code 2', () => {
    const r = spawnSync(process.execPath, [cli, 'no-such-command'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stderr.trim()).error.code).toBe('E_USAGE');
  });

  it('prints a usage error for a bare call, but not for --version', () => {
    const r = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stderr.trim())).toEqual({ error: { code: 'E_USAGE', message: 'No command given', hint: 'Run prose capabilities' } });
    expect(spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).status).toBe(0);
  });

  it('exits 2 for a usage error raised by a command, such as an unknown form', () => {
    const r = spawnSync(process.execPath, [cli, 'lint', join(import.meta.dirname, 'fixtures', 'keynote.md'), '--form', 'no-such-form'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stderr.trim()).error.code).toBe('E_USAGE');
  });

  it('reports a missing draft as E_NOT_FOUND with exit code 1', () => {
    const r = spawnSync(process.execPath, [cli, 'parse', 'no-such-file.md'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stderr.trim()).error.code).toBe('E_NOT_FOUND');
  });
});

describe('capabilities error codes', () => {
  it('advertises rendering and source dialogue commands with their active errors', async () => {
    const caps = await run('capabilities');
    expect(caps.errorCodes).toEqual(expect.arrayContaining(['E_TTS', 'E_RENDER', 'E_BROWSER_MISSING']));
    expect(caps.errorCodes).toContain('E_SERVER');
    expect(caps.reservedErrorCodes).toEqual([]);
    expect(caps.commands).toEqual(expect.arrayContaining(['render', 'dialog import', 'dialog review', 'dialog apply', 'dialog undo', 'dialog recover', 'dialog repetition']));
  });
});
