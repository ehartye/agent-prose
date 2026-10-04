import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from 'node:http';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadingServer, readServerInfo, SERVER_API, SERVER_LOG_HINT, writeServerInfo, type ServerInfo } from '../src/reading/server.ts';
import { ProseError } from '../src/errors.ts';
import { KNOWN_DIRECTIONS } from '../src/owner/directions.ts';
import { setDir, sessionDir } from '../src/owner/paths.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { createSet, variantPath, writeSet, type PromptSet } from '../src/owner/sets.ts';
import { appendEvent, openSession, writeReveal } from '../src/reading/session.ts';
import { PUNCHY, SHORT, WARM, tmp, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
useTempHome();

const TOKEN = 'f'.repeat(32);
const servers: ReadingServer[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(servers.splice(0).map(s => s.close())); });

async function start(opts: ConstructorParameters<typeof ReadingServer>[0] = {}): Promise<{ server: ReadingServer; info: ServerInfo }> {
  const server = new ReadingServer({ host: '127.0.0.1', port: 0, token: TOKEN, persist: false, ...opts });
  servers.push(server);
  return { server, info: await server.listen() };
}

/** A raw request: Node's http client sends the path exactly as given, where fetch would normalise `..` away. */
function raw(info: ServerInfo, path: string, method = 'GET', headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, any>; text: string }> {
  return new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port: info.port, path, method, headers, agent: false }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => ok({ status: res.statusCode!, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', fail);
    req.end();
  });
}
const api = async (info: ServerInfo, path: string, over: { method?: string; token?: string | null; header?: boolean } = {}) => {
  const token = over.token === undefined ? TOKEN : over.token;
  const sep = path.includes('?') ? '&' : '?';
  const r = over.header && token ? await raw(info, path, over.method, { 'x-prose-token': token }) : await raw(info, token ? `${path}${sep}t=${token}` : path, over.method);
  let body: any = null;
  try { body = JSON.parse(r.text); } catch { /* not JSON */ }
  return { ...r, body };
};

/** A project with a real three-variant set, a sealed prediction and a reading session over it. */
function seed(over: { id?: string; now?: Date } = {}) {
  const p = tmpProject();
  const draft = p.write('t.md', SHORT);
  const set = createSet(p.project, draft, { id: 'demo', count: 3, directions: ['shorter', 'warmer', 'punchier'] });
  [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  writeFileSync(variantPath(p.project, set, set.variants[0]), SHORT.replace('We built', 'We raised'));
  const labelled: PromptSet = { ...set, variants: set.variants.map(v => ({ ...v, label: `ANGLE-${v.index}`, note: `NOTE-${v.index}` })) };
  writeSet(p.project, labelled);
  const prediction = writePrediction(p.project, labelled, { pick: 2, shortlist: [3], why: 'SEALED-REASON' });
  const session = openSession(p.project, {
    id: over.id ?? 'read-1', now: over.now, setId: 'demo', form: 'speech-small', register: 'plain', prompt: 'the bridge speech',
    shown: prediction.shown, hashes: prediction.hashes, target: { minutes: 3 }, wpm: 150,
    candidates: labelled.variants.map(v => ({ index: v.index, name: `v${v.index}`, direction: v.direction, round: 0 })),
  });
  return { ...p, set: labelled, prediction, session };
}
const variantFile = (s: ReturnType<typeof seed>, i: number) => variantPath(s.project, s.set, s.set.variants[i - 1]);
/** The payload text without the direction vocabulary the refine screen is offered, which names every direction by design. */
const withoutVocabulary = (body: object): string => JSON.stringify({ ...body, directions: undefined });

const SECURITY = {
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'cache-control': 'no-store',
};

describe('token and health', () => {
  it('answers health without a token and says whether the caller is authed', async () => {
    const { info } = await start();
    const open = await api(info, '/api/health', { token: null });
    expect(open.status).toBe(200);
    expect(open.body).toEqual({ ok: true, authed: false, pid: process.pid, api: SERVER_API });
    expect((await api(info, '/api/health')).body.authed).toBe(true);
    expect((await api(info, '/api/health', { token: 'wrong' })).body.authed).toBe(false);
    expect((await api(info, '/api/health', { header: true })).body.authed).toBe(true);
  });

  it('refuses every other API route without the right token, whether or not the route exists', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    for (const path of ['/api/sessions', '/api/session/read-1', '/api/session/read-1/reveal', '/api/session/nope', '/api/whatever']) {
      for (const token of [null, 'wrong', TOKEN.slice(1), TOKEN + 'x']) {
        const r = await api(info, path, { token });
        expect(r.status, `${path} ${token}`).toBe(401);
        expect(r.body).toEqual({ error: { code: 'E_SERVER', message: 'missing or wrong token (the link carries ?t=...)' } });
      }
    }
    expect((await api(info, '/api/sessions', { header: true })).status).toBe(200);
    expect((await api(info, '/api/sessions')).status).toBe(200);
  });

  it('keeps a persisted token across two server lifetimes, and writes server.json only when asked', async () => {
    const first = new ReadingServer({ host: '127.0.0.1', port: 0, persist: false });
    servers.push(first);
    await first.listen();
    expect(readServerInfo()).toBeNull();
    const a = new ReadingServer({ host: '127.0.0.1', port: 0 });
    servers.push(a);
    const infoA = await a.listen();
    expect(infoA.token).toMatch(/^[0-9a-f]{32}$/);
    expect(readServerInfo()).toMatchObject({ token: infoA.token, port: infoA.port, pid: process.pid, api: SERVER_API });
    await a.close();
    const b = new ReadingServer({ host: '127.0.0.1', port: 0 });
    servers.push(b);
    const infoB = await b.listen();
    expect(infoB.token).toBe(infoA.token);
    expect(infoB.url).toBe(`http://127.0.0.1:${infoB.port}`);
  });
});

describe('favicon', () => {
  it('answers 204 with no body so a browser tab logs no 404 error, and carries the security headers', async () => {
    const { info } = await start({ projects: [] });
    const r = await api(info, '/favicon.ico', { method: 'GET', token: null });
    expect([r.status, r.text]).toEqual([204, '']);
    for (const [k, v] of Object.entries(SECURITY)) expect(r.headers[k], k).toBe(v);
  });
});

describe('security headers', () => {
  it('are on every response: pages, API, errors, refusals', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    const cases: Array<[string, string, string | null]> = [
      ['/', 'GET', null], ['/s/read-1', 'GET', null], ['/app.js', 'GET', null], ['/style.css', 'GET', null], ['/nope', 'GET', null],
      ['/%zz', 'GET', null], ['/', 'POST', null],
      ['/api/health', 'GET', null], ['/api/sessions', 'GET', null], ['/api/sessions', 'GET', TOKEN], ['/api/sessions', 'POST', TOKEN],
      ['/api/session/read-1', 'GET', TOKEN], ['/api/session/read-1/reveal', 'GET', TOKEN], ['/api/session/nope', 'GET', TOKEN],
      ['/api/session/%zz', 'GET', TOKEN], ['/api/nothing', 'GET', TOKEN],
    ];
    for (const [path, method, token] of cases) {
      const r = await api(info, path, { method, token });
      for (const [k, v] of Object.entries(SECURITY)) expect(r.headers[k], `${method} ${path} ${k}`).toBe(v);
    }
  });
});

describe('static pages', () => {
  it('serves the three allow-listed files with fixed types, and the page for /s/<id>', async () => {
    const { info } = await start();
    const real = (f: string) => readFileSync(join(import.meta.dirname, '..', 'runtime', 'reading', f), 'utf8');
    const html = await raw(info, '/');
    expect(html.status).toBe(200);
    expect(html.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(html.text).toBe(real('index.html'));
    expect((await raw(info, '/s/read-1')).text).toBe(real('index.html'));
    expect((await raw(info, '/s/read-1?t=abc')).text).toBe(real('index.html'));
    const js = await raw(info, '/app.js');
    expect([js.status, js.headers['content-type'], js.text]).toEqual([200, 'text/javascript; charset=utf-8', real('app.js')]);
    const css = await raw(info, '/style.css');
    expect([css.status, css.headers['content-type'], css.text]).toEqual([200, 'text/css; charset=utf-8', real('style.css')]);
  });

  it('ships a page that is already CSP-clean: no inline script, no inline style, only /app.js and /style.css', () => {
    const html = readFileSync(join(import.meta.dirname, '..', 'runtime', 'reading', 'index.html'), 'utf8');
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(m => m[0]);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(/src="\/app\.js"/);
    expect(html.match(/(?:src|href)="[^"]*"/g)!.sort()).toEqual(['href="/style.css"', 'src="/app.js"']);
  });

  it('never reads anything outside the allow-list: traversal, encodings, near-misses and the runtime path all fail', async () => {
    const dir = tmp('prose-rt-');
    const run = join(dir, 'reading');
    mkdirSync(run);
    for (const f of ['index.html', 'app.js', 'style.css']) writeFileSync(join(run, f), `served ${f}`);
    writeFileSync(join(run, 'secret.txt'), 'CANARY-INSIDE');
    writeFileSync(join(dir, 'secret.txt'), 'CANARY-OUTSIDE');
    const { info } = await start({ runtimeDir: run });
    const paths = [
      '/../../etc/passwd', '/../secret.txt', '/%2e%2e/%2e%2e/secrets', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/..%2f..%2fsecret.txt', '/..%5csecret.txt', '/..\\secret.txt',
      '/app.js/../x', '/app.js/..', '/app.js/', '/app.js%00', '/app.js%00.html', '/%00', '/api/session/../x', '/api/session/%2e%2e/x', '/api/session/%00',
      '/runtime/reading/app.js', '/runtime/reading/secret.txt', '/reading/app.js', '/secret.txt', '/index.html', '/s/', '/s/READ', '/s/a/b', '/s/..', '/s/%2e%2e', '/APP.JS', '//app.js/x', '/app.js;x',
      '/C:/Windows/win.ini', '/%252e%252e/secret.txt',
    ];
    for (const path of paths) {
      // API paths are tried with a valid token, so the 404 comes from the route table and not from the token check.
      const r = path.startsWith('/api/') ? await api(info, path) : await raw(info, path);
      expect([400, 404], `${path} -> ${r.status}`).toContain(r.status);
      expect(r.text, path).not.toContain('CANARY');
      expect(r.text, path).not.toContain('served ');
    }
    // The pages come from memory: with the files gone, the allow-list still answers and nothing else starts to.
    rmSync(run, { recursive: true, force: true });
    expect((await raw(info, '/app.js')).text).toBe('served app.js');
    expect((await raw(info, '/secret.txt')).status).toBe(404);
  });

  it('fails to start when the page files are missing, as E_SERVER', async () => {
    const server = new ReadingServer({ host: '127.0.0.1', port: 0, persist: false, runtimeDir: join(tmp('prose-rt-'), 'nope') });
    const err = await server.listen().catch(e => e);
    expect(err).toBeInstanceOf(ProseError);
    expect(err.code).toBe('E_SERVER');
  });

  it('answers a malformed URL with 400 E_USAGE', async () => {
    const { info } = await start();
    for (const path of ['/%zz', '/app.js%', '/api/session/%e0%a4%a']) {
      const r = await api(info, path, { token: TOKEN });
      expect(r.status, path).toBe(400);
      expect(r.body.error.code).toBe('E_USAGE');
    }
  });
});

describe('GET /api/sessions', () => {
  it('lists seeded sessions, newest first, with the project folder name only', async () => {
    const s = seed({ id: 'read-1', now: new Date(Date.UTC(2026, 9, 1)) });
    openSession(s.project, { id: 'read-2', now: new Date(Date.UTC(2026, 9, 2)), setId: 'demo', form: 'speech-small', register: null, prompt: 'p', shown: [1, 2, 3], hashes: s.prediction.hashes, target: null, wpm: null, candidates: s.session.candidates });
    const { info } = await start({ projects: [s.project] });
    const r = await api(info, '/api/sessions');
    expect(r.status).toBe(200);
    expect(r.body.sessions.map((x: any) => x.id)).toEqual(['read-2', 'read-1']);
    expect(r.body.sessions[1]).toEqual({ id: 'read-1', setId: 'demo', form: 'speech-small', stage: 'lineup', createdAt: '2026-10-01T00:00:00.000Z', project: s.project.split(/[\\/]/).pop() });
    expect(r.text).not.toContain(s.project);
  });

  it('is empty with no registered projects, and sees projects registered after start through server.json', async () => {
    const s = seed();
    const { info } = await start();
    expect((await api(info, '/api/sessions')).body).toEqual({ sessions: [] });
    writeServerInfo({ ...info, projects: [s.project] });
    expect((await api(info, '/api/sessions')).body.sessions).toHaveLength(1);
  });

  it('skips a session whose files are unreadable instead of failing the list', async () => {
    const s = seed();
    mkdirSync(sessionDir(s.project, 'read-bad'), { recursive: true });
    writeFileSync(join(sessionDir(s.project, 'read-bad'), 'session.json'), '{');
    const { info } = await start({ projects: [s.project] });
    expect((await api(info, '/api/sessions')).body.sessions.map((x: any) => x.id)).toEqual(['read-1']);
  });
});

/** A project whose set is the given draft text under the given form; every variant is that text. */
function seedForm(ext: string, text: string) {
  const p = tmpProject();
  // variant 1 is the text as given; the others are unrelated so the set check passes
  const head = /^---\n[\s\S]*?\n---\n\n/.exec(text)?.[0] ?? '';
  const other = (word: string) => `${head}Entirely different words about ${word}, tides and gulls, turn up in this one.\n`;
  const set = createSet(p.project, p.write(`d.${ext}`, other('trains')), { id: 'demo', count: 3, directions: ['shorter', 'warmer', 'punchier'] });
  set.variants.forEach(v => writeFileSync(variantPath(p.project, set, v), v.index === 1 ? text : other(v.index === 2 ? 'boats' : 'cliffs')));
  const prediction = writePrediction(p.project, set, { pick: 1, shortlist: [2], why: 'x' });
  openSession(p.project, { id: 'read-1', setId: 'demo', form: set.form, register: null, prompt: 'p', shown: prediction.shown, hashes: prediction.hashes, target: null, wpm: null,
    candidates: set.variants.map(v => ({ index: v.index, name: `v${v.index}`, direction: v.direction, round: 0 })) });
  return p;
}

describe('payload layout', () => {
  const layoutOf = async (ext: string, text: string) => {
    const p = seedForm(ext, text);
    const { info } = await start({ projects: [p.project] });
    return (await api(info, '/api/session/read-1')).body.candidates[0];
  };
  it('sends Markdown prose as paragraphs', async () => {
    const c = await layoutOf('md', `---
form: speech-small
---

We built it. It held.

Then the rain came. We stayed.
`);
    expect(c).toMatchObject({ layout: 'prose', units: ['We built it.', 'It held.', 'Then the rain came.', 'We stayed.'], breaks: [2] });
  });
  it('sends a sonnet as lines with its stanza break', async () => {
    const c = await layoutOf('md', `---
form: sonnet-shakespearean
---

Line one of the poem
Line two of the poem

Line three of the poem
Line four of the poem
`);
    expect(c).toMatchObject({ layout: 'lines', units: ['Line one of the poem', 'Line two of the poem', 'Line three of the poem', 'Line four of the poem'], breaks: [2] });
  });
  it('sends Fountain as lines with a break at each block', async () => {
    const c = await layoutOf('fountain', `INT. KITCHEN - NIGHT

Rain on the window.

MARA
Not tonight.
`);
    expect(c).toMatchObject({ layout: 'lines', units: ['INT. KITCHEN - NIGHT', 'Rain on the window.', 'MARA: Not tonight.'], breaks: [1, 2] });
  });
});

describe('GET /api/session/<id>', () => {
  it('returns units and state, and nothing of the prediction, the pick, or any direction word', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    const r = await api(info, '/api/session/read-1');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['candidates', 'directions', 'order', 'pair', 'reveal', 'session', 'state']);
    expect(r.body.session).toEqual({ id: 'read-1', setId: 'demo', form: 'speech-small', register: 'plain', prompt: 'the bridge speech', target: { minutes: 3 }, wpm: 150, brief: null, original: null });
    expect(r.body.reveal).toEqual({ shipped: false });
    expect(r.body.state).toMatchObject({ stage: 'lineup', round: 0, lineup: [1, 2, 3], peeked: [] });
    expect(r.body.state.candidates).toBeUndefined();
    expect(r.body.candidates).toHaveLength(3);
    expect([...r.body.order].sort()).toEqual([1, 2, 3]);
    expect(r.body.candidates.map((c: any) => c.index)).toEqual(r.body.order);
    expect(r.body.candidates.map((c: any) => c.label)).toEqual(['A', 'B', 'C']);
    for (const c of r.body.candidates) {
      expect(Object.keys(c).sort()).toEqual(['breaks', 'changed', 'hashOk', 'index', 'label', 'layout', 'units']);
      expect(c.changed).toBe(false);
      expect(c.hashOk).toBe(true);
    }
    const byIndex = new Map<number, any>(r.body.candidates.map((c: any) => [c.index, c]));
    expect(byIndex.get(2).units.join(' ')).toContain("We didn't just build a bridge");
    expect(byIndex.get(1).units.length).toBeGreaterThan(1);
    for (const word of ['SEALED-REASON', 'ANGLE-', 'NOTE-', 'shorter', 'warmer', 'punchier', 'prediction', 'pick', 'direction', 'seal', '"v1"', '"v2"']) {
      expect(withoutVocabulary(r.body), word).not.toContain(word);
    }
    expect(r.text).not.toContain(s.project);
  });

  it('orders the lineup deterministically before a lineup event, and by the event after it', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    const a = (await api(info, '/api/session/read-1')).body.order;
    expect((await api(info, '/api/session/read-1')).body.order).toEqual(a);
    appendEvent(s.project, 'read-1', { type: 'lineup', kept: [1, 3], duds: [2], order: [3, 1, 2] });
    const r = (await api(info, '/api/session/read-1')).body;
    expect(r.order).toEqual([3, 1, 2]);
    expect(r.candidates.map((c: any) => [c.label, c.index])).toEqual([['A', 3], ['B', 1], ['C', 2]]);
    expect(r.state).toMatchObject({ stage: 'duel', kept: [1, 3], duds: [2] });
  });

  it('shows the direction words of a candidate only after a peek at that candidate', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    appendEvent(s.project, 'read-1', { type: 'peek', index: 3 });
    const r = await api(info, '/api/session/read-1');
    const [three, one] = [3, 1].map(i => r.body.candidates.find((c: any) => c.index === i));
    expect(three).toMatchObject({ name: 'v3', direction: 'punchier', angle: 'ANGLE-3', note: 'NOTE-3' });
    expect(Object.keys(one).sort()).toEqual(['breaks', 'changed', 'hashOk', 'index', 'label', 'layout', 'units']);
    for (const word of ['shorter', 'warmer', 'ANGLE-1', 'ANGLE-2', 'NOTE-1', 'SEALED-REASON', 'prediction']) expect(withoutVocabulary(r.body), word).not.toContain(word);
    expect(r.body.state.peeked).toEqual([3]);
  });

  it('marks a variant edited after sealing as changed with no units, but ignores a line-ending-only edit', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    writeFileSync(variantFile(s, 2), readFileSync(variantFile(s, 2), 'utf8').replace(/\n/g, '\r\n'));
    writeFileSync(variantFile(s, 3), readFileSync(variantFile(s, 3), 'utf8') + 'One more thing.\n');
    const r = (await api(info, '/api/session/read-1')).body;
    const c = (i: number) => r.candidates.find((x: any) => x.index === i);
    expect(c(2)).toMatchObject({ changed: false, hashOk: true });
    expect(c(2).units.length).toBeGreaterThan(0);
    expect(c(3)).toMatchObject({ changed: true, hashOk: false });
    expect('units' in c(3)).toBe(false);
    expect(c(1).changed).toBe(false);
  });

  it('treats a variant file that has gone missing as changed', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    rmSync(variantFile(s, 1));
    const c = (await api(info, '/api/session/read-1')).body.candidates.find((x: any) => x.index === 1);
    expect(c).toMatchObject({ changed: true, hashOk: false });
    expect('units' in c).toBe(false);
  });

  it('reads variants by set and index only: a session cannot point the server at another file', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    const file = join(sessionDir(s.project, 'read-1'), 'session.json');
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ ...doc, setId: '../../../etc' }));
    const r = await api(info, '/api/session/read-1');
    expect(r.status).toBe(200);
    expect(r.body.candidates.every((c: any) => c.changed && !('units' in c))).toBe(true);
  });
});

describe('GET /api/session/<id>/reveal', () => {
  it('is 404 E_NOT_FOUND until the session ships, then the reveal object', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    let r = await api(info, '/api/session/read-1/reveal');
    expect([r.status, r.body.error.code]).toEqual([404, 'E_NOT_FOUND']);
    // A reveal file on disk is not enough on its own: the folded state must show the ship.
    writeReveal(s.project, 'read-1', { prediction: { pick: 2, why: 'SEALED-REASON' }, matched: false });
    r = await api(info, '/api/session/read-1/reveal');
    expect(r.status).toBe(404);
    expect(r.text).not.toContain('SEALED-REASON');
    appendEvent(s.project, 'read-1', { type: 'lineup', kept: [1, 2], duds: [3], order: [2, 1, 3] });
    appendEvent(s.project, 'read-1', { type: 'ship', champion: 1 });
    r = await api(info, '/api/session/read-1/reveal');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ prediction: { pick: 2, why: 'SEALED-REASON' }, matched: false });
    expect((await api(info, '/api/session/read-1')).body.reveal).toEqual({ shipped: true });
  });

  it('is 404 when the session shipped but the reveal is not written yet', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    appendEvent(s.project, 'read-1', { type: 'lineup', kept: [1, 2], duds: [3], order: [2, 1, 3] });
    appendEvent(s.project, 'read-1', { type: 'ship', champion: 2 });
    expect((await api(info, '/api/session/read-1/reveal')).status).toBe(404);
  });
});

describe('ids, unknown things and methods', () => {
  it('answers 404 (never 400) for ids that fail the pattern, unknown sessions and unregistered projects', async () => {
    const s = seed();
    const other = seed();
    const { info } = await start({ projects: [s.project] });
    const long = 'a'.repeat(100);
    for (const id of ['nope', 'READ-1', 'read_1', 'read.1', '-x', 'con', long, '%20', 'read-1%2f..', 'a%2fb']) {
      const r = await api(info, `/api/session/${id}`);
      expect(r.status, id).toBe(404);
      expect(r.body.error.code).toBe('E_NOT_FOUND');
      expect((await api(info, `/api/session/${id}/reveal`)).status, id).toBe(404);
    }
    mkdirSync(sessionDir(other.project, 'read-9'), { recursive: true });
    expect((await api(info, '/api/session/read-9')).status).toBe(404);
    expect((await api(info, '/api/session/read-1/other')).status).toBe(404);
    expect((await api(info, '/api/session/read-1/reveal/x')).status).toBe(404);
  });

  it('answers 405 to anything but GET on API routes', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    for (const path of ['/api/health', '/api/sessions', '/api/session/read-1', '/api/session/read-1/reveal']) {
      for (const method of ['PUT', 'DELETE', 'POST', 'PATCH']) {
        const r = await api(info, path, { method });
        expect([r.status, r.body.error.code], `${method} ${path}`).toEqual([405, 'E_SERVER']);
      }
    }
  });
});

describe('errors never crash the server or leak', () => {
  it('maps a corrupt session file to its code without the absolute path', async () => {
    const s = seed();
    writeFileSync(join(sessionDir(s.project, 'read-1'), 'session.json'), '{');
    const { info } = await start({ projects: [s.project] });
    const r = await api(info, '/api/session/read-1');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('E_SCHEMA');
    expect(r.text).not.toContain(s.project);
    expect(r.text).not.toContain(s.project.replaceAll('\\', '/'));
    expect((await api(info, '/api/health')).status).toBe(200);
  });

  it('turns an unexpected failure into a generic 500 E_SERVER, logs the detail without the token, and keeps serving', async () => {
    const s = seed();
    rmSync(join(sessionDir(s.project, 'read-1'), 'events.jsonl'));
    mkdirSync(join(sessionDir(s.project, 'read-1'), 'events.jsonl')); // a directory where the log should be: EISDIR
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { info } = await start({ projects: [s.project] });
    const r = await api(info, '/api/session/read-1');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: { code: 'E_SERVER', message: 'internal error', hint: SERVER_LOG_HINT } });
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(JSON.parse(line).error.code).toBe('E_SERVER');
    expect(line).not.toContain(TOKEN);
    expect((await api(info, '/api/sessions')).status).toBe(200);
  });
});

describe('no route leaks the token or a project path', () => {
  it('holds across every GET route, in every stage, with and without a token', async () => {
    const s = seed();
    const bad = seed();
    writeFileSync(join(sessionDir(bad.project, 'read-1'), 'session.json'), '{');
    const { info } = await start({ projects: [s.project, bad.project] });
    const leaks = (text: string) => {
      const needles = [TOKEN, s.project, bad.project, setDir(s.project, 'demo')].flatMap(n => [n, n.replaceAll('\\', '/'), JSON.stringify(n).slice(1, -1), n.toLowerCase()]);
      return needles.filter(n => text.includes(n));
    };
    const paths = ['/', '/s/read-1', '/app.js', '/style.css', '/api/health', '/api/sessions', '/api/session/read-1', '/api/session/read-1/reveal', '/api/session/nope', '/api/session/read-1/x', '/api/x', '/nope', '/%zz', '/api/session/%zz'];
    const stages: Array<() => void> = [
      () => {},
      () => { appendEvent(s.project, 'read-1', { type: 'peek', index: 1 }); },
      () => { appendEvent(s.project, 'read-1', { type: 'lineup', kept: [1, 2], duds: [3], order: [1, 2, 3] }); writeReveal(s.project, 'read-1', { shipped: 'yes' }); appendEvent(s.project, 'read-1', { type: 'ship', champion: 1 }); },
    ];
    for (const advance of stages) {
      advance();
      for (const path of paths) {
        for (const token of [null, TOKEN]) {
          const r = await api(info, path, { token });
          expect(leaks(r.text), `${path} ${token ? 'authed' : 'open'}`).toEqual([]);
          expect(JSON.stringify(r.headers)).not.toContain(TOKEN);
        }
      }
    }
  });
});

describe('payload for the duel and refine screens', () => {
  it('offers the direction vocabulary and the next pair only in the duel stage', async () => {
    const s = seed();
    const { info } = await start({ projects: [s.project] });
    const before = (await api(info, '/api/session/read-1')).body;
    expect(before.pair).toBeNull();
    expect(before.directions).toEqual(KNOWN_DIRECTIONS);
    appendEvent(s.project, 'read-1', { type: 'lineup', kept: [1, 2], duds: [3], order: [1, 2, 3] });
    const duel = (await api(info, '/api/session/read-1')).body;
    expect(duel.state.stage).toBe('duel');
    expect(duel.pair).toEqual([1, 2]);
    appendEvent(s.project, 'read-1', { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab', eventId: 'e1' });
    expect((await api(info, '/api/session/read-1')).body.pair).toBeNull();
  });
});
