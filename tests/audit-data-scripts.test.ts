import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as arxiv from '../scripts/audit-data/fetch-arxiv.mjs';
import * as wikiintro from '../scripts/audit-data/fetch-wikiintro.mjs';

/** These tests never touch the network: the scripts are only asked for help, a dry run, or handed synthetic data. */
const dir = join(import.meta.dirname, '..', 'scripts', 'audit-data');
const node = (file: string, ...args: string[]) => spawnSync(process.execPath, [join(dir, file), ...args], { encoding: 'utf8', timeout: 20000 });

describe('audit data scripts: argument parsing without any request', () => {
  for (const file of ['fetch-arxiv.mjs', 'fetch-wikiintro.mjs']) {
    it(`${file} prints help`, () => {
      const r = node(file, '--help');
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/Usage: node scripts\/audit-data\//);
    });
    it(`${file} --dry-run plans without a request or any output directory`, () => {
      const out = join(mkdtempSync(join(tmpdir(), 'prose-data-')), 'never-created');
      try {
        const r = node(file, '--dry-run', '--out', out);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toMatch(/No request was made and nothing was written/);
        expect(existsSync(out)).toBe(false);
      } finally { rmSync(join(out, '..'), { recursive: true, force: true }); }
    });
    it(`${file} rejects an unknown argument`, () => {
      const r = node(file, '--bogus');
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/Unknown argument/);
    });
  }

  it('the defaults write outside the repository and use the recorded seeds', () => {
    const a = arxiv.parseArgs([]), w = wikiintro.parseArgs([]);
    for (const o of [a, w]) expect(o.out.startsWith(tmpdir())).toBe(true);
    expect(a.seed).toBe(20240607);
    expect(w.seed).toBe(20261003);
    expect(w.offsets).toHaveLength(5);
    expect(wikiintro.parseArgs(['--seed', '20261003']).offsets).toEqual(w.offsets);
    expect(wikiintro.parseArgs(['--offsets', '7383,1293']).offsets).toEqual([7383, 1293]);
    expect(() => arxiv.parseArgs(['--seed', 'x'])).toThrow(/integer/);
  });

  it('plans 8 sets of 4 windows', () => {
    expect(arxiv.plan()).toHaveLength(32);
    expect(Object.keys(arxiv.SETS)).toHaveLength(8);
  });
});

describe('audit data scripts: parsing and filters on synthetic data', () => {
  const xml = `<OAI-PMH><ListRecords><record><metadata><arXiv xmlns="http://arxiv.org/OAI/arXiv/">
    <id>1234.5678</id><created>2019-03-04</created><title>A &amp; B
      in practice</title><abstract> We study x &lt; y and  more.
    Second line. </abstract></arXiv></metadata></record></ListRecords></OAI-PMH>`;

  it('parses OAI records, decoding entities and collapsing whitespace', () => {
    expect(arxiv.parseRecords(xml)).toEqual([{ id: '1234.5678', created: '2019-03-04', title: 'A & B in practice', ab: 'We study x < y and more. Second line.' }]);
  });
  it('filters by date, length and letters, and checks for English', () => {
    const ab = Array.from({ length: 100 }, () => 'we study the data').join(' ');
    expect(arxiv.keep({ id: 'a', created: '2019-03-04', title: '', ab })).toBe(true);
    expect(arxiv.keep({ id: 'a', created: '2022-01-01', title: '', ab })).toBe(false);
    expect(arxiv.keep({ id: 'a', created: '2019-03-04', title: '', ab: 'too short' })).toBe(false);
    expect(arxiv.looksEnglish(ab)).toBe(true);
    expect(arxiv.looksEnglish('xyz qrs tuv')).toBe(false);
  });
  it('selects pairs by word bounds, one per title', () => {
    const words = (n: number) => Array.from({ length: n }, () => 'w').join(' ');
    const rows = [
      { title: 'A', wiki_intro: words(100), generated_intro: words(80) },
      { title: 'A', wiki_intro: words(100), generated_intro: words(80) },
      { title: 'B', wiki_intro: words(10), generated_intro: words(80) },
      { title: 'C', wiki_intro: `${words(70)}\n\n\n${words(5)}`, generated_intro: words(500) },
    ];
    const pairs = wikiintro.selectPairs(rows);
    expect(pairs.map(p => p.title)).toEqual(['A']);
    expect(wikiintro.normalize('a  b\n\n\n c\td ')).toBe('a b\n\nc d');
  });
});
