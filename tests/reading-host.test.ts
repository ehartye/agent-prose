// DNS-rebinding and cross-site defence: a --local server (127.0.0.1) answers only to its own host names, and a POST
// that carries an Origin must come from the page's own origin. A LAN bind skips the Host check (the names vary).
import { afterEach, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { ReadingServer, hostAllowed, originAllowed, type ServerInfo } from '../src/reading/server.ts';
import { useTempHome, useTmp } from './owner-helpers.ts';
import { TOKEN, seed, startServer } from './reading-helpers.ts';

useTmp();
useTempHome();
const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });

/** A request with exactly these headers (Node sends the Host we give it). */
function send(info: ServerInfo, path: string, headers: Record<string, string | undefined>, method = 'GET', body?: string): Promise<{ status: number; body: any }> {
  return new Promise((ok, fail) => {
    const h: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) if (v !== undefined) h[k] = v;
    if (body !== undefined) { h['content-type'] = 'application/json'; h['content-length'] = String(Buffer.byteLength(body)); }
    const req = request({ host: '127.0.0.1', port: info.port, path: `${path}${path.includes('?') ? '&' : '?'}t=${TOKEN}`, method, headers: h, agent: false, setHost: false }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { const t = Buffer.concat(chunks).toString('utf8'); let b: any = null; try { b = JSON.parse(t); } catch { /* not JSON */ } ok({ status: res.statusCode!, body: b }); });
    });
    req.on('error', fail);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe('hostAllowed (pure)', () => {
  it('on a 127.0.0.1 bind accepts only 127.0.0.1:<port> and localhost:<port>, any case', () => {
    expect(hostAllowed('127.0.0.1', 4000, '127.0.0.1:4000')).toBe(true);
    expect(hostAllowed('127.0.0.1', 4000, 'localhost:4000')).toBe(true);
    expect(hostAllowed('127.0.0.1', 4000, 'LOCALHOST:4000')).toBe(true);
    for (const bad of [undefined, '', 'evil.example:4000', 'evil.example', '127.0.0.1', 'localhost', '127.0.0.1:4001', 'localhost:4000.evil.example', '127.0.0.1.evil.example:4000', '[::1]:4000']) {
      expect(hostAllowed('127.0.0.1', 4000, bad), String(bad)).toBe(false);
    }
  });
  it('on a network bind accepts any Host (names vary: machine name, LAN address, tailscale)', () => {
    for (const bind of ['0.0.0.0', '::']) for (const h of ['bridge-pc:4000', '192.168.1.20:4000', 'pc.tail1234.ts.net:4000', undefined]) expect(hostAllowed(bind, 4000, h)).toBe(true);
  });
});

describe('originAllowed (pure)', () => {
  it('accepts no Origin and the same origin as Host, refuses anything else', () => {
    expect(originAllowed(undefined, 'a:1')).toBe(true);
    expect(originAllowed('http://a:1', 'a:1')).toBe(true);
    expect(originAllowed('http://A:1', 'a:1')).toBe(true);
    for (const bad of ['http://evil.example', 'http://a:2', 'https://a:1', 'null', 'not a url', '']) expect(originAllowed(bad, 'a:1'), bad).toBe(false);
    expect(originAllowed('http://a:1', undefined)).toBe(false);
  });
});

describe('a --local server', () => {
  it('answers 421 to a Host that is not 127.0.0.1:<port> or localhost:<port>, on every route, and serves the right ones', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    for (const path of ['/api/health', '/api/sessions', '/api/session/read-1', '/', '/app.js']) {
      for (const host of ['evil.example', `evil.example:${info.port}`, `127.0.0.1.evil.example:${info.port}`, '127.0.0.1']) {
        const r = await send(info, path, { host });
        expect([r.status, r.body?.error?.code], `${path} with Host ${host}`).toEqual([421, 'E_SERVER']);
      }
      for (const host of [`127.0.0.1:${info.port}`, `localhost:${info.port}`]) expect((await send(info, path, { host })).status, `${path} ${host}`).toBe(200);
    }
  });

  it('refuses a POST whose Origin is another site with 403, and accepts the same origin or none', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    const host = `127.0.0.1:${info.port}`;
    const event = JSON.stringify({ type: 'play', index: 1, mode: 'read', eventId: 'p' });
    const path = '/api/session/read-1/event';
    for (const origin of ['http://evil.example', `http://localhost:${info.port}`, 'null']) {
      const r = await send(info, path, { host, origin }, 'POST', event);
      expect([r.status, r.body.error.code], origin).toEqual([403, 'E_SERVER']);
    }
    expect((await send(info, path, { host, origin: `http://127.0.0.1:${info.port}` }, 'POST', event)).status).toBe(200);
    expect((await send(info, path, { host, origin: undefined }, 'POST', JSON.stringify({ type: 'play', index: 1, mode: 'read', eventId: 'q' }))).status).toBe(200);
  });

  it('the health probe and the CLI still work (they use 127.0.0.1:<port>)', async () => {
    const { info } = await startServer(servers, { projects: [] });
    const r = await fetch(`http://127.0.0.1:${info.port}/api/health?t=${TOKEN}`);
    expect((await r.json() as any).authed).toBe(true);
  });
});
