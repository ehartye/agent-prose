import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { ProseError } from '../errors.ts';
import { proseHome } from '../owner/paths.ts';
import { writeFileAtomic } from '../owner/fsutil.ts';
import { compileAnnotations, decideAnnotation, findCandidates, inspectAnnotationFile, setAnnotationAppearance } from './store.ts';
import { reviewPage, reviewAssets } from '../reading/assets.ts';
import { resolveHighlightColor } from './render.ts';
import type { AnnotationAppearance, Inspection } from './types.ts';

function withColors(inspection:Inspection) {
  return {...inspection,annotations:inspection.annotations.map(a=>({...a,presentationColor:resolveHighlightColor(a,inspection.concepts?.concepts.find(c=>c.id===a.concept),inspection.sidecar.appearance)}))};
}

interface SessionRecord {
  schema: 'prose/annotation-preview-session@1';
  id: string;
  file: string;
  token: string;
  pid: number;
  port: number;
  state: 'starting' | 'open' | 'closed';
  startedAt: string;
  closedAt?: string;
  error?: string;
}

export interface AnnotationPreviewOptions {
  /** v1 always binds loopback. An explicit false is refused rather than widening access. */
  local?: boolean;
  port?: number;
  /** Session metadata directory override, for isolated callers and tests. */
  from?: string;
  /** @internal A detached worker reuses its preallocated lifecycle record. */
  session?: string;
}

export interface AnnotationPreviewStatus {
  session: string;
  id: string;
  localUrl: string;
  pid: number;
  port: number;
  state: 'open' | 'closed' | 'stopped';
  running: boolean;
  cursor: number;
  revision: string;
  counts: Record<string, number>;
}

const MAX_BODY = 256 * 1024;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const sessionRoot = (from?: string) => resolve(from ?? join(proseHome(), 'annotation-previews'));
const sessionPath = (id: string, from?: string) => {
  if (!ID.test(id)) throw new ProseError('E_USAGE', 'Invalid annotation preview session ID');
  return join(sessionRoot(from), `${id}.json`);
};

function readSession(id: string, from?: string): SessionRecord {
  const file = sessionPath(id, from);
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const r = value as SessionRecord;
    if (!r || r.schema !== 'prose/annotation-preview-session@1' || r.id !== id || typeof r.file !== 'string' || !/^[a-f0-9]{64}$/.test(r.token) || !Number.isInteger(r.pid) || !Number.isInteger(r.port) || r.port < 0 || r.port > 65535 || !['starting', 'open', 'closed'].includes(r.state)) throw Error('Invalid record');
    return r;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new ProseError('E_NOT_FOUND', `Annotation preview ${id} was not found`);
    throw new ProseError('E_SCHEMA', `Annotation preview ${id} has an unreadable lifecycle record`);
  }
}

function writeSession(record: SessionRecord, from?: string): void {
  mkdirSync(sessionRoot(from), { recursive: true, mode: 0o700 });
  writeFileAtomic(sessionPath(record.id, from), JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
}

function allocate(file: string, options: AnnotationPreviewOptions): SessionRecord {
  if (options.local === false) throw new ProseError('E_USAGE', 'Annotation previews support local access only');
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535)) throw new ProseError('E_USAGE', 'Preview port must be an integer from 0 to 65535');
  inspectAnnotationFile(file); // invalid inputs leave no orphan lifecycle record
  const record: SessionRecord = { schema: 'prose/annotation-preview-session@1', id: randomUUID(), file: resolve(file), token: randomBytes(32).toString('hex'), pid: 0, port: options.port ?? 0, state: 'starting', startedAt: new Date().toISOString() };
  writeSession(record, options.from);
  return record;
}

function history(file: string) {
  const inspection = inspectAnnotationFile(file);
  return { inspection, events: inspection.sidecar.history ?? [] };
}

function report(record: SessionRecord, running: boolean): AnnotationPreviewStatus {
  const { inspection, events } = history(record.file);
  const counts: Record<string, number> = {};
  for (const a of inspection.annotations) counts[a.state] = (counts[a.state] ?? 0) + 1;
  return { session: record.id, id: record.id, localUrl: `http://127.0.0.1:${record.port}/?t=${record.token}`, pid: record.pid, port: record.port, state: record.state === 'closed' ? 'closed' : running ? 'open' : 'stopped', running, cursor: events.length, revision: inspection.revision, counts };
}

const sameToken = (a: string, b: string) => {
  const actual = Buffer.from(a), expected = Buffer.from(b);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const originFor = (port: number) => `http://127.0.0.1:${port}`;
const errorStatus = (e: ProseError) => e.code === 'E_CONFLICT' ? 409 : e.code === 'E_NOT_FOUND' ? 404 : ['E_SCHEMA', 'E_USAGE', 'E_PARSE'].includes(e.code) ? 400 : 500;

async function jsonBody(req: IncomingMessage): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new ProseError('E_USAGE', 'Review actions require application/json');
  const parts: Buffer[] = [];
  let bytes = 0;
  for await (const part of req) {
    const data = Buffer.isBuffer(part) ? part : Buffer.from(part);
    bytes += data.length;
    if (bytes > MAX_BODY) throw new ProseError('E_USAGE', 'Review action exceeds the 256 KiB limit');
    parts.push(data);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new ProseError('E_PARSE', 'Review action is not valid JSON'); }
}

export interface RunningAnnotationPreview extends AnnotationPreviewStatus {
  /** Available only to an in-process caller; never embedded in authored HTML or feedback. */
  token: string;
  close(): Promise<void>;
}

/** Start the same server used by detached preview workers, with a direct close handle for embedded callers and tests. */
export async function startAnnotationPreview(file: string, options: AnnotationPreviewOptions = {}): Promise<RunningAnnotationPreview> {
  if (options.local === false) throw new ProseError('E_USAGE', 'Annotation previews support local access only');
  const record = options.session ? readSession(options.session, options.from) : allocate(file, options);
  if (resolve(file) !== record.file || record.state !== 'starting') throw new ProseError('E_CONFLICT', 'Preview lifecycle record does not match this start');
  let server: Server;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= new Promise<void>(done => {
      record.state = 'closed'; record.closedAt = new Date().toISOString();
      writeSession(record, options.from);
      if (!server?.listening) { done(); return; }
      server.close(() => done());
      server.closeAllConnections();
    });
    return closing;
  };
  const assets = reviewAssets(), page = reviewPage('annotations');
  server = createServer((req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; frame-src 'self' about:; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    void (async () => {
      const host = req.headers.host;
      if (host !== `127.0.0.1:${record.port}` && host !== `localhost:${record.port}`) { send(421, { error: { code: 'E_SERVER', message: 'Unexpected Host header' } }); return; }
      const origin = req.headers.origin;
      const sameOrigin = origin === `http://${host}`;
      if ((origin !== undefined && !sameOrigin) || req.headers['sec-fetch-site'] === 'cross-site') { send(403, { error: { code: 'E_SERVER', message: 'Cross-origin review request refused' } }); return; }
      const path = new URL(req.url ?? '/', originFor(record.port)).pathname;
      if (req.method === 'GET' && path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      if(req.method==='GET'&&path==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(page);return;}
      const asset=assets.get(path);
      if(req.method==='GET'&&asset){res.writeHead(200,{'content-type':asset.type});res.end(asset.body);return;}
      const token = typeof req.headers['x-prose-token'] === 'string' ? req.headers['x-prose-token'] : '';
      if (!sameToken(token, record.token)) { send(401, { error: { code: 'E_SERVER', message: 'The review link is missing or its session token is incorrect' } }); return; }
      if (req.method === 'GET' && path === '/api/health') { send(200, { session: record.id, pid: process.pid, state: record.state }); return; }
      if (req.method === 'GET' && path === '/api/state') {
        const { inspection, events } = history(record.file);
        send(200, { session: { id: record.id, state: record.state }, cursor: events.length, inspection:withColors(inspection) }); return;
      }
      if (req.method === 'GET' && path === '/api/publication') { const compiled = compileAnnotations(record.file); send(200, { html: compiled.html, report: compiled.report }); return; }
      if (req.method !== 'POST') { send(404, { error: { code: 'E_NOT_FOUND', message: 'Unknown review endpoint' } }); return; }
      if (!sameOrigin) { send(403, { error: { code: 'E_SERVER', message: 'Review changes require a same-origin request' } }); return; }
      if (record.state !== 'open') throw new ProseError('E_CONFLICT', 'This review session is closed');
      const body = await jsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ProseError('E_SCHEMA', 'Review action must be a JSON object');
      if (path === '/api/decision') {
        const decision = body as Parameters<typeof decideAnnotation>[1];
        if (typeof decision.expectedRevision !== 'string' || typeof decision.eventId !== 'string') throw new ProseError('E_SCHEMA', 'Review changes require expectedRevision and eventId');
        const inspection = decideAnnotation(record.file, decision);
        send(200, { inspection, cursor: inspection.sidecar.history.length }); return;
      }
      if (path === '/api/locate') { send(200, findCandidates(record.file, body as Parameters<typeof findCandidates>[1])); return; }
      if (path === '/api/appearance') {
        const value=body as {appearance:AnnotationAppearance;expectedRevision:string;eventId:string};
        if(typeof value.expectedRevision!=='string'||typeof value.eventId!=='string')throw new ProseError('E_SCHEMA','Appearance changes require expectedRevision and eventId');
        const inspection=setAnnotationAppearance(record.file,value.appearance,{expectedRevision:value.expectedRevision,eventId:value.eventId});
        send(200,{inspection:withColors(inspection),cursor:inspection.sidecar.history.length});return;
      }
      if (path === '/api/close') { send(200, { session: record.id, state: 'closed' }); setImmediate(() => { void close(); }); return; }
      send(404, { error: { code: 'E_NOT_FOUND', message: 'Unknown review endpoint' } });
    })().catch(e => {
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof ProseError) send(errorStatus(e), { error: { code: e.code, message: e.message, ...(e.hint ? { hint: e.hint } : {}) } });
      else send(500, { error: { code: 'E_INTERNAL', message: 'The review request could not be completed' } });
    });
  });
  server.maxConnections = 32;
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 1000;
  try {
    await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(options.port ?? record.port, '127.0.0.1', () => { server.off('error', fail); done(); }); });
    record.port = (server.address() as AddressInfo).port; record.pid = process.pid; record.state = 'open';
    writeSession(record, options.from);
  } catch (e) {
    record.state = 'closed'; record.error = 'Could not start the local preview server'; writeSession(record, options.from);
    throw new ProseError('E_SERVER', `Could not start the local annotation preview (${(e as NodeJS.ErrnoException).code ?? 'server error'})`);
  }
  return { ...report(record, true), token: record.token, close };
}

async function probe(record: SessionRecord): Promise<boolean> {
  if (record.state !== 'open' || record.port === 0) return false;
  try {
    const response = await fetch(`${originFor(record.port)}/api/health`, { headers: { 'x-prose-token': record.token }, signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const value = await response.json() as { session?: string; pid?: number; state?: string };
    return value.session === record.id && value.pid === record.pid && value.state === 'open';
  } catch { return false; }
}

/** Launches a detached worker and returns after its authenticated health probe succeeds. No browser is opened implicitly. */
export async function openAnnotationPreview(file: string, options: AnnotationPreviewOptions = {}): Promise<AnnotationPreviewStatus> {
  const record = allocate(file, options);
  const worker = join(import.meta.dirname, 'preview-worker.ts');
  const child = spawn(process.execPath, [worker, record.id, sessionRoot(options.from)], { detached: true, stdio: 'ignore', windowsHide: true, env: process.env });
  let failed = false;
  child.once('error', () => { failed = true; });
  child.once('exit', () => { failed = true; });
  child.unref();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const current = readSession(record.id, options.from);
    if (await probe(current)) return report(current, true);
    if (failed || current.state === 'closed') break;
    await wait(100);
  }
  // Never kill a PID from a record: a failed launch must not risk an unrelated reused process ID.
  const final = readSession(record.id, options.from);
  if (await probe(final)) await closeAnnotationPreview(record.id, options.from);
  throw new ProseError('E_SERVER', 'The local annotation preview did not start', { hint: 'Check the source/sidecar and whether the requested port is available' });
}

export async function getAnnotationPreviewStatus(id: string, from?: string): Promise<AnnotationPreviewStatus> {
  const record = readSession(id, from);
  return report(record, await probe(record));
}

/** Cursor positions index only the canonical sidecar history; session files never copy accepted annotations. */
export async function getAnnotationFeedback(id: string, since = 0, from?: string) {
  if (!Number.isInteger(since) || since < 0) throw new ProseError('E_USAGE', 'Feedback cursor must be a nonnegative integer');
  const record = readSession(id, from);
  const { inspection, events } = history(record.file);
  if (since > events.length) throw new ProseError('E_CONFLICT', 'Feedback cursor is ahead of the current annotation history');
  return { session: id, revision: inspection.revision, cursor: events.length, events: events.slice(since).map((event, i) => ({ ...event, cursor: since + i + 1 })) };
}

export async function closeAnnotationPreview(id: string, from?: string): Promise<AnnotationPreviewStatus> {
  const record = readSession(id, from);
  if (await probe(record)) {
    const response = await fetch(`${originFor(record.port)}/api/close`, { method: 'POST', headers: { origin: originFor(record.port), 'x-prose-token': record.token, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new ProseError('E_SERVER', 'The annotation preview refused to close');
    for (let attempt = 0; attempt < 40; attempt++) {
      const updated = readSession(id, from);
      if (updated.state === 'closed' && !(await probe(updated))) return report(updated, false);
      await wait(50);
    }
    throw new ProseError('E_SERVER', 'The annotation preview did not finish closing');
  }
  record.state = 'closed'; record.closedAt ??= new Date().toISOString(); writeSession(record, from);
  return report(record, false);
}
