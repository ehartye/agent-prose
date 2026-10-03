// What `prose serve` does with a server that is already running, as a pure decision (a LAN-bound server is never
// started by a test). `serve` without --local states that it wants the network; a running local server does not match.
import { describe, expect, it } from 'vitest';
import { SERVER_API, serverAction, type ServerInfo } from '../src/reading/server.ts';

const info = (over: Partial<ServerInfo> = {}): ServerInfo => ({
  pid: 42, port: 4000, host: '0.0.0.0', token: 't'.repeat(32), projects: [], startedAt: 'now', url: 'http://pc:4000', api: SERVER_API, ...over,
});
const local = info({ host: '127.0.0.1', url: 'http://127.0.0.1:4000' });

describe('serverAction with what the caller asked for', () => {
  it('replaces a running LOCAL server when the caller asked for the network (serve without --local)', () => {
    expect(serverAction(local, SERVER_API, true, { local: false })).toBe('replace');
  });
  it('replaces a running network server when --local was asked for', () => {
    expect(serverAction(info(), SERVER_API, true, { local: true })).toBe('replace');
  });
  it('reuses a server that already is what was asked for, and one when the caller does not care (reading open)', () => {
    expect(serverAction(local, SERVER_API, true, { local: true })).toBe('reuse');
    expect(serverAction(info(), SERVER_API, true, { local: false })).toBe('reuse');
    expect(serverAction(local, SERVER_API, true, {})).toBe('reuse');
    expect(serverAction(info(), SERVER_API, true)).toBe('reuse');
  });
  it('replaces for another explicit port, but not for port 0 ("any")', () => {
    expect(serverAction(info(), SERVER_API, true, { port: 4001 })).toBe('replace');
    expect(serverAction(info(), SERVER_API, true, { port: 4000 })).toBe('reuse');
    expect(serverAction(info(), SERVER_API, true, { port: 0 })).toBe('reuse');
  });
  it('still starts when nothing answers and still replaces another API level', () => {
    expect(serverAction(local, SERVER_API, false, { local: false })).toBe('start');
    expect(serverAction(null, SERVER_API, false, { local: false })).toBe('start');
    expect(serverAction(info({ api: SERVER_API - 1 }), SERVER_API, true, { local: false })).toBe('replace');
  });
});
