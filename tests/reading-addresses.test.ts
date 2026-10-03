import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_PORT, lanAddress, probe, publicHost, rankAddresses, readServerInfo, registerProject, sameToken, SERVER_API,
  serverAction, serverInfoFile, serverToken, writeServerInfo, type ServerInfo,
} from '../src/reading/server.ts';
import { ProseError } from '../src/errors.ts';
import { tmp, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
const home = useTempHome();
const writeServerInfoRaw = (text: string) => { mkdirSync(home.home(), { recursive: true }); writeFileSync(serverInfoFile(), text); };
const v4 = (address: string, internal = false) => ({ family: 'IPv4', address, internal });

describe('LAN addresses', () => {
  it('puts the physical LAN first, Tailscale after, and drops virtual adapters', () => {
    const ranked = rankAddresses({
      Tailscale: [v4('100.121.49.34')],
      'Local Area Connection* 12': [v4('192.168.137.1')],
      'Wi-Fi': [v4('192.168.1.93')],
      'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
      'vEthernet (WSL (Hyper-V firewall))': [v4('172.22.112.1')],
    } as any);
    expect(ranked.map(r => r.address)).toEqual(['192.168.1.93', '192.168.137.1', '100.121.49.34']);
    expect(ranked.map(r => r.label)).toEqual(['lan', 'lan', 'tailscale']);
  });

  it('orders physical, other private, Tailscale, then public, and drops link-local, IPv6 and Docker/VMware/VirtualBox', () => {
    const ranked = rankAddresses({
      'Public': [v4('8.8.4.4')],
      'Tailscale': [v4('100.64.0.1')],
      'Docker Desktop': [v4('172.17.0.1')],
      'VMware Network Adapter VMnet8': [v4('192.168.40.1')],
      'VirtualBox Host-Only Network': [v4('192.168.56.1')],
      'Ethernet 2': [{ family: 'IPv6', address: 'fe80::1', internal: false }, v4('169.254.10.10'), v4('10.0.0.7')],
      'Office VPN': [v4('172.16.5.5')],
    } as any);
    expect(ranked).toEqual([
      { address: '10.0.0.7', label: 'lan' }, { address: '172.16.5.5', label: 'lan' },
      { address: '100.64.0.1', label: 'tailscale' }, { address: '8.8.4.4', label: 'other' },
    ]);
  });

  it('does not treat 100.x outside the Tailscale range or 172.x outside 16-31 as private', () => {
    const ranked = rankAddresses({ a: [v4('100.200.0.1')], b: [v4('172.32.0.1')], c: [v4('172.31.9.9')] } as any);
    expect(ranked.map(r => [r.address, r.label])).toEqual([['172.31.9.9', 'lan'], ['100.200.0.1', 'other'], ['172.32.0.1', 'other']]);
  });

  it('gives nothing to share when there is no usable interface', () => {
    expect(rankAddresses({ lo: [v4('127.0.0.1', true)] } as any)).toEqual([]);
    expect(typeof lanAddress() === 'string' || lanAddress() === null).toBe(true);
    expect(publicHost()).toBe(publicHost().toLowerCase());
  });
});

describe('sameToken', () => {
  it('compares in constant time and refuses unequal lengths without throwing', () => {
    expect(sameToken('abcd', 'abcd')).toBe(true);
    expect(sameToken('abcd', 'abce')).toBe(false);
    expect(sameToken('abc', 'abcd')).toBe(false);
    expect(sameToken('', 'abcd')).toBe(false);
  });
});

const info = (over: Partial<ServerInfo> = {}): ServerInfo => ({
  pid: 1, port: 1, host: '127.0.0.1', token: 'a'.repeat(32), projects: [], startedAt: 'x', url: 'http://h:1', api: SERVER_API, ...over,
});

describe('server.json', () => {
  it('lives under the prose home, round-trips, and reads as null when absent or garbage', () => {
    expect(serverInfoFile()).toBe(join(home.home(), 'server.json'));
    expect(readServerInfo()).toBeNull();
    writeServerInfo(info({ port: 4242 }));
    expect(existsSync(serverInfoFile())).toBe(true);
    expect(readServerInfo()).toMatchObject({ port: 4242, api: SERVER_API });
    writeServerInfo(info({ port: 1 }));
    expect(readFileSync(serverInfoFile(), 'utf8').endsWith('\n')).toBe(true);
    writeServerInfoRaw('{"port": "no"}');
    expect(readServerInfo()).toBeNull();
  });

  it('uses a 128-bit hex token and reuses the stored one', () => {
    const fresh = serverToken();
    expect(fresh).toMatch(/^[0-9a-f]{32}$/);
    expect(serverToken()).not.toBe(fresh); // nothing stored yet, so each call is new
    writeServerInfo(info({ token: fresh }));
    expect(serverToken()).toBe(fresh);
  });

  it('registers only absolute paths, once each, and ignores case on Windows', () => {
    writeServerInfo(info());
    const p = tmp('prose-reg-');
    expect(registerProject(p)).toBe(true);
    registerProject(p);
    registerProject(process.platform === 'win32' ? p.toUpperCase() : p);
    expect(readServerInfo()!.projects).toHaveLength(1);
    expect(() => registerProject('relative/dir')).toThrow(ProseError);
    expect(readServerInfo()!.projects).toHaveLength(1);
  });

  it('registers nothing while no server has been started', () => {
    expect(registerProject(tmp('prose-reg-'))).toBe(false);
    expect(readServerInfo()).toBeNull();
  });
});

describe('serverAction', () => {
  it('starts when there is no server.json or the recorded server does not answer', () => {
    expect(serverAction(null, SERVER_API, false)).toBe('start');
    expect(serverAction(info(), SERVER_API, false)).toBe('start');
    expect(serverAction(info({ api: SERVER_API - 1 }), SERVER_API, false)).toBe('start'); // a dead old server is just gone
  });
  it('treats a stopped record (pid 0) as no server, even if a probe were to say yes', async () => {
    expect(serverAction(info({ pid: 0 }), SERVER_API, true)).toBe('start');
    expect(await probe(info({ pid: 0 }))).toBe(false);
  });
  it('reuses a live server of the wanted API level', () => {
    expect(serverAction(info(), SERVER_API, true)).toBe('reuse');
  });
  it('replaces a live server of another API level, including one recorded before api existed', () => {
    expect(serverAction(info({ api: SERVER_API - 1 }), SERVER_API, true)).toBe('replace');
    expect(serverAction(info({ api: SERVER_API + 1 }), SERVER_API, true)).toBe('replace');
    expect(serverAction(info({ api: undefined as any }), SERVER_API, true)).toBe('replace');
  });
});

describe('probe', () => {
  it('is false for no info and for a port nobody listens on', async () => {
    expect(await probe(null)).toBe(false);
    expect(await probe(info({ port: 1 }))).toBe(false);
  });
  it('has the documented defaults', () => {
    expect(SERVER_API).toBe(1);
    expect(DEFAULT_PORT).toBe(47311);
  });
});
