import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, run, stable } from './helpers.ts';

const cli = join(import.meta.dirname, '..', 'scripts', 'prose.mjs');
const AUDIT = join(ROOT, 'tests', 'fixtures', 'audit');
const MODEL = join(AUDIT, 'model-like.md');
const HUMAN = join(AUDIT, 'human-plain.md');

/** Run the real CLI with a throwaway home, so nothing touches the real ~/.agent-prose. */
function prose(...args: string[]) {
  const home = mkdtempSync(join(tmpdir(), 'prose-audit-cli-'));
  try {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, AGENT_PROSE_HOME: home } });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: r.stdout.trim().startsWith('{') ? JSON.parse(r.stdout) : undefined, error: r.stderr.trim() ? JSON.parse(r.stderr.trim()).error : undefined };
  } finally { rmSync(home, { recursive: true, force: true }); }
}

describe('golden audit outputs', () => {
  for (const [label, file] of [['model-like', MODEL], ['human-plain', HUMAN]] as const) {
    it(`audit ${label}`, async () => {
      const out = stable(await run('audit', file));
      await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot(join('golden', `audit-${label}.md.audit.json`));
    });
  }

  it('finds several families in the model-like paragraph and none in the plain one', async () => {
    const m = await run('audit', MODEL);
    expect(new Set(m.tiers.soft.map((f: any) => f.family)).size).toBeGreaterThanOrEqual(6);
    const h = await run('audit', HUMAN);
    expect(h.tiers).toEqual({ hard: [], soft: [] });
  });
});

describe('prose audit', () => {
  it('prints JSON with the documented shape', () => {
    const { status, json: r } = prose('audit', MODEL);
    expect(status).toBe(0);
    expect(Object.keys(r)).toEqual(['path', 'form', 'words', 'tiers', 'families', 'measured', 'summary', 'limits', 'lexicon']);
    expect(Object.keys(r.tiers)).toEqual(['hard', 'soft']);
    expect(r).not.toHaveProperty('cluster');
    expect(r.lexicon.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.form).toBe('professional');
    for (const f of r.tiers.soft) expect(Object.keys(f)).toEqual(expect.arrayContaining(['tier', 'family', 'line', 'text', 'why', 'direction']));
  });

  it('prints a readable list grouped by family with the limits at the end for --text', () => {
    const { status, stdout, json } = prose('audit', MODEL, '--text');
    expect(status).toBe(0);
    expect(json).toBeUndefined();
    const heads = ['undue-significance', 'negative-parallelism', 'inline-header-bullets'].map(f => stdout.indexOf(f));
    expect(heads.every(i => i >= 0)).toBe(true);
    expect(stdout).not.toMatch(/[Cc]luster/);
    expect(stdout).toMatch(/^Hallmarks some readers associate with AI-generated text$/m);
    expect(stdout).not.toMatch(/Soft findings by family/);
    expect(stdout).toMatch(/line \d+/);
    const limits = stdout.indexOf('Limits');
    expect(limits).toBeGreaterThan(stdout.indexOf('undue-significance'));
    expect(stdout).toMatch(/authorship/);
    expect(stdout.trimEnd().split('\n').at(-1)).toMatch(/Lexicon reviewed \d{4}-\d{2}-\d{2}/);
  });

  it('lists hard findings under a defects heading in --text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-audit-'));
    try {
      const f = join(dir, 'd.md');
      writeFileSync(f, 'Certainly! Here is the draft.\n');
      const { stdout } = prose('audit', f, '--text');
      expect(stdout).toMatch(/Hard artifacts/);
      expect(stdout).toMatch(/chat-residue/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('honours --form, and skips verse forms with a note', () => {
    const { status, json: r } = prose('audit', MODEL, '--form', 'academic');
    expect(status).toBe(0);
    expect(r.form).toBe('academic');
    const v = prose('audit', MODEL, '--form', 'limerick');
    expect(v.json.form).toBe('limerick');
    expect(v.json.skipped).toMatch(/verse/i);
    expect(v.json.tiers).toEqual({ hard: [], soft: [] });
  });

  it('fails with a stable code for a missing file and a bad form', () => {
    expect(prose('audit', join(AUDIT, 'nope.md')).error.code).toBe('E_NOT_FOUND');
    const bad = prose('audit', MODEL, '--form', 'nonsense');
    expect(bad.status).toBe(2);
    expect(bad.error.code).toBe('E_USAGE');
  });

  it('is listed by capabilities', () => {
    expect(prose('capabilities').json.commands).toContain('audit');
  });
});

describe('prose audit, plain-text title line', () => {
  it('finds the stock opener below a title with no # marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-audit-title-'));
    try {
      const file = join(dir, 'draft.md');
      writeFileSync(file, 'Why Your Team Should Write Down Its Decisions\n\nEvery team makes hundreds of decisions each quarter. Which vendor to choose, which feature to ship, and who owns the follow-up are rarely written anywhere.\n');
      const { status, json: r } = prose('audit', file);
      expect(status).toBe(0);
      const hits = [...r.tiers.hard, ...r.tiers.soft].filter((f: any) => f.family === 'stock-opener');
      expect(hits.map((f: any) => f.text)).toEqual(['Every team']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
