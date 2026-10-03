import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeEach } from 'vitest';
import { initProject } from '../src/project.ts';

const made: string[] = [];

/** A fresh temp directory, removed after the test file finishes. Call useTmp() once per file. */
export function tmp(prefix = 'prose-owner-'): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  made.push(d);
  return d;
}
export function useTmp(): void {
  afterAll(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });
}

/** A prose project in a temp directory (its "home" is a separate temp directory, so nothing touches the real one). */
export function tmpProject(): { project: string; write: (name: string, text: string) => string } {
  const home = tmp('prose-home-');
  const project = tmp('prose-proj-');
  initProject(project, { home });
  return {
    project,
    write: (name, text) => {
      const file = join(project, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      return file;
    },
  };
}

/** Point AGENT_PROSE_HOME at a fresh temp directory for each test, restoring it afterwards. */
export function useTempHome(): { home: () => string } {
  let home = '';
  let prior: string | undefined;
  beforeEach(() => { prior = process.env.AGENT_PROSE_HOME; home = tmp('prose-taste-home-'); process.env.AGENT_PROSE_HOME = home; });
  afterEach(() => { if (prior === undefined) delete process.env.AGENT_PROSE_HOME; else process.env.AGENT_PROSE_HOME = prior; });
  return { home: () => home };
}

const header = '---\nform: speech-small\n---\n\n';
export const BASE = `${header}We built the bridge in the rain, in the dark, and in the long months when nobody believed us. It took four years, two floods, and more coffee than the town had ever seen. Today it carries a thousand people a day.\n`;
export const SHORT = `${header}We built the bridge in the rain and the dark. A thousand people cross it every day.\n`;
export const WARM = `${header}We didn't just build a bridge, you know. We built it in the rain, in the dark, when nobody believed we could. And look: a thousand of you cross it every day.\n`;
export const WARM_DUP = WARM.replace('every day', 'every single day');
export const PUNCHY = `${header}Four years. Two floods. One bridge. Nobody doubts it now.\n`;
