import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installRuntime, inspectInstallation, resolveRuntime } from '../scripts/managed-runtime.js';

const root = join(import.meta.dirname, '..');
const made: string[] = [];
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'prose-isolation-')); made.push(dir);
  const source = join(dir, 'source'), home = join(dir, 'home'), prefix = join(dir, 'prefix');
  const globalRoot = join(prefix, 'node_modules'), old = join(dir, 'old-release');
  for (const path of [source, globalRoot, old]) mkdirSync(path, { recursive: true });
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'agent-prose', version: '1.0.0' }));
  writeFileSync(join(source, 'package-lock.json'), JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } }));
  writeFileSync(join(old, 'package.json'), JSON.stringify({ name: 'agent-prose', version: '0.0.1' }));
  writeFileSync(join(old, 'sentinel'), 'keep this release');
  writeFileSync(join(prefix, 'prose.cmd'), 'sentinel command shim');
  const linked = join(globalRoot, 'agent-prose');
  symlinkSync(old, linked, 'junction');
  const snapshot = () => ({ target: realpathSync(linked), package: readFileSync(join(old, 'package.json'), 'utf8'), sentinel: readFileSync(join(old, 'sentinel'), 'utf8'), shim: readFileSync(join(prefix, 'prose.cmd'), 'utf8') });
  const calls: string[] = [];
  const npm = (args: string[], { cwd }: { cwd?: string; progress?: boolean } = {}) => {
    calls.push(args[0]);
    if (args[0] === 'link') { rmSync(linked); symlinkSync(cwd!, linked, 'junction'); }
    return args[0] === 'root' ? globalRoot : args[0] === 'prefix' ? prefix : '';
  };
  return { dir, source, home, prefix, globalRoot, old, linked, snapshot, calls, npm };
}

it('no-link installs, reuses and repairs dependencies without changing an existing global link', () => {
  const f = fixture(), before = f.snapshot();
  let healthy = false;
  const check = () => { if (!healthy) throw new Error('missing dependencies'); };
  const npm = (args: string[], options = {}) => { const result = f.npm(args, options); if (args[0] === 'ci') healthy = true; return result; };
  const options = { home: f.home, npm, checkDependencies: check, link: false };
  const runtime = installRuntime(f.source, options);
  installRuntime(f.source, options);
  healthy = false;
  installRuntime(f.source, options);
  expect(f.calls).toEqual(['ci', 'ci']);
  expect(resolveRuntime(f.source, { home: f.home }).root).toBe(runtime.root);
  const report = inspectInstallation(f.source, options);
  expect(report).toMatchObject({ ok: true, cliVersion: '1.0.0', linked: false, linkedVersion: '0.0.1', errors: [] });
  expect(report.warnings.join(' ')).toMatch(/differs from plugin/);
  expect(f.snapshot()).toEqual(before);
});

it('no-link failure preserves the global sentinel and leaves no install receipt or lock', () => {
  const f = fixture(), before = f.snapshot();
  expect(() => installRuntime(f.source, { home: f.home, npm: f.npm, link: false, checkDependencies: () => { throw new Error('broken dependencies'); } })).toThrow('broken dependencies');
  expect(f.calls).toEqual(['ci']);
  expect(f.snapshot()).toEqual(before);
  expect(existsSync(join(f.home, 'setup.lock'))).toBe(false);
  expect(() => resolveRuntime(f.source, { home: f.home })).toThrow(/missing/);
});

it('default setup still links, and optional inspection failures do not fail a ready launcher', () => {
  const f = fixture();
  const runtime = installRuntime(f.source, { home: f.home, npm: f.npm, checkDependencies: () => {} });
  expect(f.calls).toEqual(['ci', 'link', 'root']);
  expect(realpathSync(f.linked)).toBe(realpathSync(runtime.root));
  expect(inspectInstallation(f.source, { home: f.home, npm: f.npm, checkDependencies: () => {} })).toMatchObject({ ok: true, linked: true, linkedVersion: '1.0.0', warnings: [] });
  const report = inspectInstallation(f.source, { home: f.home, npm: () => { throw new Error('npm unavailable'); }, checkDependencies: () => {} });
  expect(report.ok).toBe(true);
  expect(report.errors).toEqual([]);
  expect(report.warnings.join(' ')).toMatch(/npm unavailable/);
});

it('missing or broken runtimes remain errors, separately from the stale link advisory', () => {
  const f = fixture();
  expect(inspectInstallation(f.source, { home: f.home, npm: f.npm })).toMatchObject({ ok: false, cliVersion: null, linkedVersion: '0.0.1' });
  installRuntime(f.source, { home: f.home, npm: f.npm, link: false, checkDependencies: () => {} });
  const report = inspectInstallation(f.source, { home: f.home, npm: f.npm, checkDependencies: () => { throw new Error('dependency failure'); } });
  expect(report.ok).toBe(false);
  expect(report.errors).toEqual(['dependency failure']);
});

it('setup CLI --no-link and --check preserve sentinel global state and the checked launcher runs', () => {
  const f = fixture(), before = f.snapshot();
  const fakeNpm = join(f.dir, 'npm-cli.js'), calls = join(f.dir, 'calls.jsonl');
  // Only dependency installation is substituted. Real setup, inspection,
  // receipt verification and the launcher execute in child Node processes.
  writeFileSync(fakeNpm, `const fs=require('node:fs');const path=require('node:path');
    const command=process.argv[2];fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(command)+'\\n');
    if(command==='ci') fs.symlinkSync(${JSON.stringify(join(root, 'node_modules'))},path.join(process.cwd(),'node_modules'),'junction');
    else if(command==='root') console.log(${JSON.stringify(f.globalRoot)});
    else if(command==='prefix') console.log(${JSON.stringify(f.prefix)});
    else { console.error('unexpected npm mutation: '+command);process.exit(9); }
  `);
  // npm supplies upper-case variants on Windows. Node passes only the first
  // case-insensitive key to a child, so remove inherited spellings before
  // selecting the disposable prefix and fake npm (never the machine's npm).
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !['agent_prose_home', 'npm_config_prefix', 'npm_execpath'].includes(key.toLowerCase())));
  Object.assign(env, { AGENT_PROSE_HOME: f.home, npm_config_prefix: f.prefix, npm_execpath: fakeNpm });
  for (const args of [['--no-link', '--json'], ['--check', '--no-link', '--json']]) {
    const result = spawnSync(process.execPath, [join(root, 'scripts/setup.js'), ...args], { env, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, linked: false, linkedVersion: '0.0.1', dependencies: true, errors: [] });
    expect(f.snapshot()).toEqual(before);
  }
  const launched = spawnSync(process.execPath, [join(root, 'scripts/run-managed.js'), 'capabilities'], { env, encoding: 'utf8' });
  expect(launched.status, launched.stderr).toBe(0);
  expect(JSON.parse(launched.stdout).name).toBe('prose');
  expect(readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))).toEqual(['ci', 'root', 'prefix', 'root', 'prefix']);
  expect(f.snapshot()).toEqual(before);
});
