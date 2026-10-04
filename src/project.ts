// A prose project is a directory holding .agent-prose/project.json; voice bibles live in .agent-prose/voices/.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { ProseError } from './errors.ts';

export const PROJECT_DIR = '.agent-prose';
export const PROJECT_FILE = 'project.json';

const samePath = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

export interface HomeOption { /** The home directory; the search stops there (default: os.homedir()). */ home?: string }

/**
 * The nearest directory at or above `startDir` that holds .agent-prose/project.json, or null. The walk stops at the
 * home directory and never returns it: ~/.agent-prose holds the managed runtime, not a project.
 */
export function findProject(startDir: string, { home = homedir() }: HomeOption = {}): string | null {
  const stop = resolve(home);
  for (let dir = resolve(startDir); ; dir = dirname(dir)) {
    if (samePath(dir, stop)) return null;
    if (existsSync(join(dir, PROJECT_DIR, PROJECT_FILE))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

/**
 * Create .agent-prose/project.json and voices/ in `dir`; safe to run again. Refuses the home directory: a project
 * there would claim every draft under it (and ~/.agent-prose already holds the managed runtime). `shadows` names the
 * enclosing project, whose voices drafts under `dir` no longer see.
 */
export function initProject(dir: string, { home = homedir() }: HomeOption = {}): { dir: string; created: boolean; shadows?: string } {
  const root = resolve(dir);
  if (samePath(root, resolve(home))) {
    throw new ProseError('E_PROJECT', `Refusing to make the home directory ${root} a prose project`, { hint: 'run it in your project folder, or pass --dir <project folder>' });
  }
  const file = join(root, PROJECT_DIR, PROJECT_FILE);
  const created = !existsSync(file);
  const parent = dirname(root) === root ? null : findProject(dirname(root), { home });
  mkdirSync(join(root, PROJECT_DIR, 'voices'), { recursive: true });
  if (created) writeFileSync(file, JSON.stringify({ schema: 'prose/project@1' }, null, 2) + '\n');
  // Sets, taste data and strike logs (which hold struck text) are working files; voice bibles and project.json stay trackable.
  const ignore = join(root, PROJECT_DIR, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, 'sets/\ntaste/\nstrikes/\n');
  return { dir: root, created, ...(parent ? { shadows: parent } : {}) };
}

/** The project at or above `from`, or an E_PROJECT error that says how to create one. */
export function needProject(from: string): string {
  const project = findProject(from);
  if (!project) throw new ProseError('E_PROJECT', `No prose project at or above ${resolve(from)}`, { hint: 'Run prose init in the project root' });
  return project;
}
