// server.json holds the access token: it is created owner-only (0600) in an owner-only directory (0700), through a temp
// file created with that mode before the rename. Windows has no POSIX mode bits, so the 0600/0700 checks are skipped
// there; the write-bit check below is the one mode bit Windows does honour (a file without it is read-only).
import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { writeFileAtomic, writeFileAtomicAsync } from '../src/owner/fsutil.ts';
import { serverInfoFile, writeServerInfo, type ServerInfo } from '../src/reading/server.ts';
import { tmp, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
const home = useTempHome();
const posix = process.platform !== 'win32';
const info: ServerInfo = { pid: 1, port: 2, host: '127.0.0.1', token: 'a'.repeat(32), projects: [], startedAt: 'now', url: 'http://127.0.0.1:2', api: 1 };

describe('writeFileAtomic mode', () => {
  it('creates the file with the given mode (observed through the write bit, which Windows honours too)', async () => {
    const d = tmp();
    writeFileAtomic(join(d, 'ro.txt'), 'x', { mode: 0o400 });
    await writeFileAtomicAsync(join(d, 'ro-async.txt'), 'y', { mode: 0o400 });
    for (const f of ['ro.txt', 'ro-async.txt']) expect(statSync(join(d, f)).mode & 0o200, f).toBe(0);
    writeFileAtomic(join(d, 'rw.txt'), 'x');
    expect(statSync(join(d, 'rw.txt')).mode & 0o200).not.toBe(0); // no mode asked for: the default is kept
    expect(readFileSync(join(d, 'ro.txt'), 'utf8')).toBe('x');
  });

  it.skipIf(!posix)('writes 0600 exactly, sync and async, whatever the umask', async () => {
    const d = tmp();
    writeFileAtomic(join(d, 'a'), 'x', { mode: 0o600 });
    await writeFileAtomicAsync(join(d, 'b'), 'x', { mode: 0o600 });
    expect([statSync(join(d, 'a')).mode & 0o777, statSync(join(d, 'b')).mode & 0o777]).toEqual([0o600, 0o600]);
  });
});

describe('server.json permissions', () => {
  it.skipIf(!posix)('is 0600 in a 0700 directory it created', () => {
    const fresh = join(tmp('prose-perm-'), 'home');
    process.env.AGENT_PROSE_HOME = fresh;
    writeServerInfo(info);
    expect(statSync(serverInfoFile()).mode & 0o777).toBe(0o600);
    expect(statSync(fresh).mode & 0o777).toBe(0o700);
    writeServerInfo({ ...info, port: 3 }); // a rewrite keeps the mode
    expect(statSync(serverInfoFile()).mode & 0o777).toBe(0o600);
  });

  it('is still written and read back (every platform)', () => {
    writeServerInfo(info);
    expect(JSON.parse(readFileSync(join(home.home(), 'server.json'), 'utf8')).token).toBe(info.token);
  });
});
