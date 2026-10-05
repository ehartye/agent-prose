import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { ProseError } from '../errors.ts';

export const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export interface Artifact { path: string; bytes: Buffer }
interface Journal { schema: 'prose/render-journal@1'; pid: number; id: string; complete: boolean; stages: string[]; artifacts: Array<{ path: string; staged: string; hash: string }> }
const conflict = (path: string) => new ProseError('E_CONFLICT', `Artifact exists or aliases another path: ${path}`);
const same = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function canonical(path: string): string { return existsSync(path) ? realpathSync(path) : join(realpathSync(dirname(path)), basename(path)); }

export function preflight(source: string, targets: string[]): void {
  let paths: string[];
  try { paths = targets.map(p => canonical(resolve(p))); }
  catch { throw new ProseError('E_USAGE', 'Every output parent directory must already exist'); }
  const input = realpathSync(source);
  for (let i = 0; i < targets.length; i++) {
    if (same(paths[i], input) || paths.slice(0, i).some(p => same(p, paths[i]))) throw conflict(targets[i]);
    try { lstatSync(targets[i]); throw conflict(targets[i]); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
}

/** Roll back an interrupted publication only when its recorded stage still owns the output inode. */
export function recoverPublications(targets: string[]): void {
  for (const parent of new Set(targets.map(p => dirname(resolve(p))))) {
    if (!existsSync(parent)) continue;
    for (const name of readdirSync(parent).filter(n => n.startsWith('.prose-render-'))) {
      const stage = join(parent, name), path = join(stage, 'journal.json');
      if (!existsSync(stage)) continue;
      if (lstatSync(stage).isSymbolicLink() || !existsSync(path)) continue;
      let journal: Journal;
      try { journal = JSON.parse(readFileSync(path, 'utf8')) as Journal; }
      catch { throw new ProseError('E_CONFLICT', 'Unreadable render recovery journal; preserve it for inspection', { details: { journal: path } }); }
      if (journal.schema !== 'prose/render-journal@1' || !journal.artifacts.some(a => targets.some(t => same(resolve(t), a.path)))) continue;
      try { process.kill(journal.pid, 0); throw new ProseError('E_CONFLICT', 'Another render publication is active'); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
      if (!Array.isArray(journal.stages) || !journal.stages.includes(stage) || !/^[a-f0-9-]{36}$/.test(journal.id)) throw new ProseError('E_CONFLICT', 'Invalid render recovery journal');
      for (const s of journal.stages) if (basename(s) !== `.prose-render-${journal.id}` || existsSync(s) && lstatSync(s).isSymbolicLink()) throw new ProseError('E_CONFLICT', 'Invalid render recovery stage');
      const complete = journal.stages.some(s => existsSync(join(s, 'complete')));
      for (const a of journal.artifacts) {
        if (!journal.stages.includes(dirname(a.staged)) || !same(dirname(dirname(a.staged)), dirname(a.path)) || !/^\d+$/.test(basename(a.staged))) throw new ProseError('E_CONFLICT', 'Invalid render recovery journal');
        if (complete) continue;
        const staged = a.staged;
        if (!existsSync(a.path)) continue;
        const old = statSync(staged), current = lstatSync(a.path);
        if (current.isSymbolicLink() || old.dev !== current.dev || old.ino !== current.ino || hash(readFileSync(a.path)) !== a.hash) throw new ProseError('E_CONFLICT', 'Interrupted render artifact changed; preserve it and inspect the journal', { details: { journal: path, artifact: a.path } });
      }
      if (!complete) for (const a of journal.artifacts) if (existsSync(a.path)) unlinkSync(a.path);
      for (const s of journal.stages) if (existsSync(s)) rmSync(s, { recursive: true });
    }
  }
}

export function publish(artifacts: Artifact[], beforePublish?: (index: number, target: string) => void): void {
  // One journal per directory; all groups are prepared before any file is linked.
  const stages: string[] = [], staged: Array<{ artifact: Artifact; path: string }> = [], linked: typeof staged = [];
  const journal: Journal = { schema: 'prose/render-journal@1', pid: process.pid, id: randomUUID(), complete: false, stages, artifacts: [] };
  try {
    for (const parent of new Set(artifacts.map(a => dirname(a.path)))) {
      const stage = join(parent, `.prose-render-${journal.id}`); mkdirSync(stage); stages.push(stage);
      for (const artifact of artifacts.filter(a => dirname(a.path) === parent)) {
        const name = String(journal.artifacts.length), path = join(stage, name);
        const fd = openSync(path, 'wx'); try { writeFileSync(fd, artifact.bytes); fsyncSync(fd); } finally { closeSync(fd); }
        staged.push({ artifact, path }); journal.artifacts.push({ path: artifact.path, staged: path, hash: hash(artifact.bytes) });
      }
    }
    for (const stage of stages) {
      const fd = openSync(join(stage, 'journal.json'), 'wx'); try { writeFileSync(fd, JSON.stringify(journal)); fsyncSync(fd); } finally { closeSync(fd); }
    }
    for (const [index, entry] of staged.entries()) {
      beforePublish?.(index, entry.artifact.path);
      try { linkSync(entry.path, entry.artifact.path); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw conflict(entry.artifact.path); throw e; }
      linked.push(entry);
    }
    for (const stage of stages) {
      const fd = openSync(join(stage, 'complete'), 'wx'); try { writeFileSync(fd, 'published\n'); fsyncSync(fd); } finally { closeSync(fd); }
    }
  } catch (e) {
    for (const entry of linked) {
      const old = statSync(entry.path), current = existsSync(entry.artifact.path) ? lstatSync(entry.artifact.path) : undefined;
      if (current && !current.isSymbolicLink() && old.dev === current.dev && old.ino === current.ino && hash(readFileSync(entry.artifact.path)) === hash(entry.artifact.bytes)) unlinkSync(entry.artifact.path);
    }
    if (e instanceof ProseError) throw e;
    throw new ProseError('E_RENDER', `Artifact publication failed: ${(e as Error).message}`);
  } finally { for (const stage of stages) rmSync(stage, { recursive: true, force: true }); }
}
