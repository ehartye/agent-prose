import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeSource, installRuntime, resolveRuntime } from '../scripts/managed-runtime.js';

const root = join(import.meta.dirname, '..');

describe('managed runtime', () => {
  it('describes the agent-prose source with a fingerprinted release key', () => {
    const d = describeSource(root);
    expect(d.name).toBe('agent-prose');
    expect(d.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    expect(d.key.startsWith(`${version}-`)).toBe(true);
    expect(d.key).toMatch(/^[0-9.]+-[0-9a-f]{16}-/);
    expect(d.files).toContain('src/cli.ts');
  });

  it('points a missing release at the prose-setup skill', () => {
    const home = mkdtempSync(join(tmpdir(), 'prose-home-'));
    try { expect(() => resolveRuntime(root, { home })).toThrow(/prose-setup/); }
    finally { rmSync(home, { recursive: true, force: true }); }
  });

  it('refuses to install inside the checkout', () => {
    expect(() => installRuntime(root, { home: join(root, '.managed') })).toThrow(/outside the plugin/);
  });

  it('launcher reports a missing runtime as a JSON error on stderr', () => {
    const home = mkdtempSync(join(tmpdir(), 'prose-home-'));
    try {
      const r = spawnSync(process.execPath, [join(root, 'scripts', 'run-managed.js'), 'capabilities'], { encoding: 'utf8', env: { ...process.env, AGENT_PROSE_HOME: home } });
      expect(r.status).toBe(1);
      const { error } = JSON.parse(r.stderr.trim());
      expect(error.code).toBe('E_RUNTIME_MISSING');
      expect(error.message).toMatch(/Managed CLI .* is missing/);
      expect(error.hint).toBe(`Run the prose-setup skill (node "${join(root, 'scripts', 'setup.js')}")`);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  it('setup reports usage errors as E_USAGE (exit 2) in the same JSON error shape, with or without --json', () => {
    for (const extra of [[], ['--json']]) {
      const r = spawnSync(process.execPath, [join(root, 'scripts', 'setup.js'), '--bogus', ...extra], { encoding: 'utf8' });
      expect(r.status).toBe(2);
      const { error } = JSON.parse(r.stderr.trim());
      expect(error.code).toBe('E_USAGE');
      expect(error.message).toMatch(/^Usage: node scripts\/setup\.js/);
      expect(error.hint).toMatch(/prose-setup/);
    }
  });
});
