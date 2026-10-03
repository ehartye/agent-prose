import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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

  describe('the bundled dictionary (binary)', () => {
    const DICT = 'craft/data/cmudict.dict.gz';
    const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
    // Bytes that are not valid UTF-8 and hold CRLF pairs: text normalisation would corrupt or drop them.
    const BINARY = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x0d, 0x0a, 0xff, 0xfe, 0x80, 0x0d, 0x0a, 0x00]);
    const made: string[] = [];
    const temp = (prefix: string) => { const d = mkdtempSync(join(tmpdir(), prefix)); made.push(d); return d; };
    afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

    /** A minimal runtime source: the real package files plus a stand-in dictionary. */
    function miniSource(bytes: Buffer) {
      const dir = temp('prose-src-');
      for (const f of ['package.json', 'package-lock.json']) cpSync(join(root, f), join(dir, f));
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src', 'cli.ts'), 'export {};');
      mkdirSync(join(dir, 'craft', 'data'), { recursive: true });
      writeFileSync(join(dir, DICT), bytes);
      return dir;
    }

    it('is part of the runtime files and the fingerprint covers it', () => {
      expect(describeSource(root).files).toContain(DICT);
      const a = describeSource(miniSource(BINARY));
      const changed = Buffer.from(BINARY);
      changed[8] = 0x81;
      expect(describeSource(miniSource(changed)).fingerprint).not.toBe(a.fingerprint);
      // CRLF in a binary is content, not a line ending: dropping the CR must change the fingerprint too.
      const lf = Buffer.concat([BINARY.subarray(0, 4), BINARY.subarray(5)]);
      expect(describeSource(miniSource(lf)).fingerprint).not.toBe(a.fingerprint);
      expect(describeSource(miniSource(BINARY)).fingerprint).toBe(a.fingerprint);
    });

    it('installs the dictionary byte for byte', () => {
      for (const [source, label] of [[miniSource(BINARY), 'binary stand-in'], [root, 'real dictionary']] as const) {
        const home = temp('prose-home-');
        const globalRoot = temp('prose-global-');
        // npm is stubbed: no install, and "link" points the global package at the release like the real one would.
        const npm = (args: string[], { cwd }: { cwd?: string; progress?: boolean } = {}) => {
          if (args[0] === 'link') symlinkSync(cwd!, join(globalRoot, 'agent-prose'), 'junction');
          return args[0] === 'root' ? globalRoot : '';
        };
        const rt = installRuntime(source, { home, npm, checkDependencies: () => {} });
        const installed = join(rt.root, DICT);
        expect(existsSync(installed), label).toBe(true);
        expect(sha(installed), label).toBe(sha(join(source, DICT)));
        expect(resolveRuntime(source, { home }).fingerprint, label).toBe(rt.fingerprint);
      }
    });

    it('refuses a release whose installed dictionary was altered', () => {
      const source = miniSource(BINARY);
      const home = temp('prose-home-');
      const globalRoot = temp('prose-global-');
      const npm = (args: string[], { cwd }: { cwd?: string; progress?: boolean } = {}) => {
        if (args[0] === 'link') symlinkSync(cwd!, join(globalRoot, 'agent-prose'), 'junction');
        return args[0] === 'root' ? globalRoot : '';
      };
      const rt = installRuntime(source, { home, npm, checkDependencies: () => {} });
      writeFileSync(join(rt.root, DICT), Buffer.concat([BINARY, Buffer.from([1])]));
      expect(() => resolveRuntime(source, { home })).toThrow(/modified/);
    });
  });

  describe('the reading page files (runtime/)', () => {
    const made: string[] = [];
    afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
    const PAGE = ['runtime/reading/index.html', 'runtime/reading/app.js', 'runtime/reading/style.css'];
    const LF = String.fromCharCode(10);
    const CRLF = String.fromCharCode(13, 10);
    const lines = (eol: string, last: string) => ['console.log(1);', `console.log(${last});`, ''].join(eol);

    /** A minimal runtime source: the real package files plus a stand-in page script. */
    function miniSource(app: string) {
      const dir = mkdtempSync(join(tmpdir(), 'prose-src-'));
      made.push(dir);
      for (const f of ['package.json', 'package-lock.json']) cpSync(join(root, f), join(dir, f));
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src', 'cli.ts'), 'export {};');
      mkdirSync(join(dir, 'runtime', 'reading'), { recursive: true });
      writeFileSync(join(dir, 'runtime', 'reading', 'app.js'), app);
      return dir;
    }

    it('are part of the runtime files', () => {
      for (const f of PAGE) expect(describeSource(root).files).toContain(f);
    });

    it('change the fingerprint when app.js changes, and not when only its line endings do', () => {
      const a = describeSource(miniSource(lines(LF, '2'))).fingerprint;
      expect(describeSource(miniSource(lines(LF, '3'))).fingerprint).not.toBe(a);
      expect(describeSource(miniSource(lines(CRLF, '2'))).fingerprint).toBe(a);
    });

    it('install with the release, next to src, where the server looks for them', () => {
      const home = mkdtempSync(join(tmpdir(), 'prose-home-'));
      const globalRoot = mkdtempSync(join(tmpdir(), 'prose-global-'));
      made.push(home, globalRoot);
      const npm = (args: string[], { cwd }: { cwd?: string; progress?: boolean } = {}) => {
        if (args[0] === 'link') symlinkSync(cwd!, join(globalRoot, 'agent-prose'), 'junction');
        return args[0] === 'root' ? globalRoot : '';
      };
      const rt = installRuntime(root, { home, npm, checkDependencies: () => {} });
      const text = (f: string) => readFileSync(f, 'utf8').replaceAll(CRLF, LF);
      for (const f of PAGE) expect(text(join(rt.root, f))).toBe(text(join(root, f)));
    });
  });

  it('measures a prose draft from the installed release without loading the dictionary', () => {
    const home = mkdtempSync(join(tmpdir(), 'prose-home-'));
    const globalRoot = mkdtempSync(join(tmpdir(), 'prose-global-'));
    try {
      const npm = (args: string[], { cwd }: { cwd?: string; progress?: boolean } = {}) => {
        if (args[0] === 'link') symlinkSync(cwd!, join(globalRoot, 'agent-prose'), 'junction');
        return args[0] === 'root' ? globalRoot : '';
      };
      const rt = installRuntime(root, { home, npm, checkDependencies: () => {} });
      // The stubbed npm installed nothing, so lend the release this checkout's dependencies.
      symlinkSync(join(root, 'node_modules'), join(rt.root, 'node_modules'), 'junction');
      const src = pathToFileURL(join(rt.root, 'src')).href;
      const code = `
        import { loadDocument } from '${src}/document.ts';
        import { measure } from '${src}/measure/index.ts';
        import * as dict from '${src}/verse/cmudict.ts';
        measure(loadDocument(${JSON.stringify(join(root, 'tests', 'fixtures', 'keynote.md'))}, { form: 'professional' }));
        console.log(dict.cmudictLoads);`;
      expect(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }).trim()).toBe('0');
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(globalRoot, { recursive: true, force: true });
    }
  });
});
