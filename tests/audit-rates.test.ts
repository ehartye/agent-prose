import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAMILIES } from '../src/audit/detectors.ts';
import { loadRates, parseRates, RATES_PATH } from '../src/audit/rates.ts';

const script = join(import.meta.dirname, '..', 'scripts', 'audit-measure.mjs');

describe('craft/audit-rates.json', () => {
  it('validates against the schema and holds aggregates only', () => {
    const raw = JSON.parse(readFileSync(RATES_PATH, 'utf8'));
    const rates = parseRates(raw);
    expect(rates.schema).toBe('prose/audit-rates@1');
    expect(rates.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(rates.datasets).sort()).toEqual(['arxiv', 'wikiintro']);
    for (const d of Object.values(rates.datasets)) {
      expect(d.label.length).toBeGreaterThan(0);
      for (const side of [d.human, d.model]) {
        for (const f of FAMILIES) {
          const r = side.families[f.id];
          expect(r, f.id).toBeDefined();
          expect(r.count).toBeLessThanOrEqual(r.n);
          expect(r.ci[0]).toBeLessThanOrEqual(r.rate);
          expect(r.ci[1]).toBeGreaterThanOrEqual(r.rate);
        }
        expect(side.tripletP95).toBeGreaterThan(0);
        expect(Object.keys(side.medians).sort()).toEqual(['emDashesPer1000', 'isAreShare', 'sentenceLengthVariation', 'tripletListsPer1000']);
      }
    }
  });

  it('loads through the loader and tolerates a missing or broken file', () => {
    expect(loadRates()?.schema).toBe('prose/audit-rates@1');
    const dir = mkdtempSync(join(tmpdir(), 'prose-rates-'));
    try {
      expect(loadRates(join(dir, 'absent.json'))).toBeUndefined();
      writeFileSync(join(dir, 'bad.json'), '{"schema":"nope"}');
      expect(loadRates(join(dir, 'bad.json'))).toBeUndefined();
      for (const bad of [0, 0.5, 100.5, -3]) {
        const rates = JSON.parse(readFileSync(RATES_PATH, 'utf8'));
        rates.datasets.arxiv.human.tripletP95 = bad;
        writeFileSync(join(dir, 'p95.json'), JSON.stringify(rates));
        expect(loadRates(join(dir, 'p95.json')), `tripletP95 ${bad}`).toBeUndefined();
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('audit-measure --write-rates', () => {
  it('writes a schema-valid file from two small directories without any text or ids', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-rates-'));
    try {
      // Each text needs 100 words and a three-item list, so the measured triplet 95th percentile is at least 1 (the schema floor).
      const PAD = ` We bought apples, pears, and plums. ${'We met on Tuesday and walked home together. '.repeat(14)}`;
      for (const set of ['one', 'two']) {
        for (const g of ['human', 'model-plain']) mkdirSync(join(dir, set, g), { recursive: true });
        writeFileSync(join(dir, set, 'human', 'a1.txt'), `We measured the thing and it moved. The results were clear.${PAD}`);
        writeFileSync(join(dir, set, 'human', 'a2.txt'), `It stands as a testament to the work. We report red, green, and blue results in this note.${PAD}`);
        writeFileSync(join(dir, set, 'model-plain', 'a1.txt'), `Leverage the seamless platform to unlock value.${PAD}`);
      }
      const out = join(dir, 'rates.json');
      const r = spawnSync(process.execPath, [script, '--data', `arxiv=${join(dir, 'one')}`, '--data', `wikiintro=${join(dir, 'two')}`, '--write-rates', out, '--date', '2026-01-02'], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      const text = readFileSync(out, 'utf8');
      const rates = parseRates(JSON.parse(text));
      expect(rates.generated).toBe('2026-01-02');
      expect(rates.datasets.arxiv.human.families['undue-significance']).toMatchObject({ count: 1, n: 2 });
      expect(rates.datasets.arxiv.model.families['marketing-verbs'].count).toBe(1);
      expect(text).not.toMatch(/testament|a1|a2/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('keeps the single-directory usage', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-rates-'));
    try {
      mkdirSync(join(dir, 'human'));
      writeFileSync(join(dir, 'human', 'a.txt'), 'A short note.');
      const r = spawnSync(process.execPath, [script, dir, '--json'], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      expect(JSON.parse(r.stdout).seed).toBeTypeOf('number');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
