// Shared by the reading-server event tests: a server on an ephemeral port, raw HTTP with a body, and a seeded project.
import { request } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadingServer, type ServerInfo } from '../src/reading/server.ts';
import { projectTasteDir, globalTasteDir } from '../src/owner/paths.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { createSet, variantPath, writeSet, type PromptSet } from '../src/owner/sets.ts';
import { readVerdicts } from '../src/owner/verdicts.ts';
import { openSession } from '../src/reading/session.ts';
import { PUNCHY, SHORT, WARM, tmpProject } from './owner-helpers.ts';

export const TOKEN = 'f'.repeat(32);

export interface Reply { status: number; headers: Record<string, any>; text: string; body: any }

/** Node's http client sends the path as given; a body is optional. */
export function http(info: ServerInfo, path: string, opts: { method?: string; body?: string | Buffer; token?: string | null } = {}): Promise<Reply> {
  const token = opts.token === undefined ? TOKEN : opts.token;
  const full = token ? `${path}${path.includes('?') ? '&' : '?'}t=${token}` : path;
  return new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port: info.port, path: full, method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'), agent: false,
      headers: opts.body === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(opts.body)) } }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body: any = null;
        try { body = JSON.parse(text); } catch { /* not JSON */ }
        ok({ status: res.statusCode!, headers: res.headers, text, body });
      });
    });
    req.on('error', fail);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

export const post = (info: ServerInfo, id: string, event: unknown, opts: { token?: string | null } = {}) =>
  http(info, `/api/session/${id}/event`, { body: typeof event === 'string' ? event : JSON.stringify(event), ...opts });

export async function startServer(servers: ReadingServer[], opts: ConstructorParameters<typeof ReadingServer>[0] = {}): Promise<{ server: ReadingServer; info: ServerInfo }> {
  const server = new ReadingServer({ host: '127.0.0.1', port: 0, token: TOKEN, persist: false, ...opts });
  servers.push(server);
  return { server, info: await server.listen() };
}

/** A project with a real three-variant set, a sealed prediction (pick 2, shortlist 3, why SEALED-REASON) and a session. */
export function seed(over: { id?: string; setId?: string; predict?: boolean } = {}) {
  const p = tmpProject();
  const setId = over.setId ?? 'demo';
  const set = createSet(p.project, p.write('t.md', SHORT), { id: setId, count: 3, directions: ['shorter', 'warmer', 'punchier'] });
  [SHORT.replace('We built', 'We raised'), WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  const labelled: PromptSet = { ...set, variants: set.variants.map(v => ({ ...v, label: `ANGLE-${v.index}`, note: `NOTE-${v.index}` })) };
  writeSet(p.project, labelled);
  const prediction = over.predict === false ? null : writePrediction(p.project, labelled, { pick: 2, shortlist: [3], why: 'SEALED-REASON' });
  const session = openSession(p.project, {
    id: over.id ?? 'read-1', setId, form: 'speech-small', register: 'plain', prompt: 'the bridge speech',
    shown: prediction?.shown ?? [1, 2, 3], hashes: prediction?.hashes ?? {}, target: { minutes: 3 }, wpm: 150,
    candidates: labelled.variants.map(v => ({ index: v.index, name: `v${v.index}`, direction: v.direction, round: 0 })),
  });
  return { ...p, set: labelled, prediction, session };
}
export type Seed = ReturnType<typeof seed>;
export const variantFile = (s: Seed, i: number) => variantPath(s.project, s.set, s.set.variants[i - 1]);

export const projectRows = (project: string) => readVerdicts(join(projectTasteDir(project), 'verdicts.jsonl')).rows;
export const globalRows = () => readVerdicts(join(globalTasteDir(), 'verdicts.jsonl')).rows;
