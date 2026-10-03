import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { ProseError } from '../errors.ts';
import { PROJECT_DIR } from '../project.ts';
import { managedHome } from '../../scripts/managed-runtime.js';

export const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_ID = 64;
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

/** Ids become directory names, so they are checked before any path is built. */
export function validId(id: string, what = 'id'): string {
  if (!ID_RE.test(id) || id.length > MAX_ID || WINDOWS_DEVICE.test(id)) {
    throw new ProseError('E_USAGE', `${what} "${id.slice(0, 80)}" must be 1-${MAX_ID} lower-case letters, digits and hyphens, not starting with a hyphen, and not a Windows device name`);
  }
  return id;
}

/** `<prefix>-<yyyymmdd>-<hhmm>-<4 hex>` from the UTC time; sorts by creation time. */
export function newId(prefix: string, now: Date = new Date(), rand: () => string = () => randomBytes(2).toString('hex')): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}-${rand()}`;
}

/** A path normalised for comparing projects: resolved, and lower-cased on Windows where paths are case-insensitive. */
export const projectKey = (path: string): string => {
  const r = resolve(path);
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

export const setsDir = (project: string) => join(project, PROJECT_DIR, 'sets');
export const setDir = (project: string, id: string) => join(setsDir(project), validId(id, 'Set id'));
export const projectTasteDir = (project: string) => join(project, PROJECT_DIR, 'taste');

/** The per-user directory. It is also the managed runtime's home, so tests must override AGENT_PROSE_HOME. */
export const proseHome = managedHome;
export const globalTasteDir = () => join(proseHome(), 'taste');
