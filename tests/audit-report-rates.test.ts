import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from '../src/document.ts';
import { buildReport, renderText } from '../src/audit/report.ts';
import { loadRates, type Rates } from '../src/audit/rates.ts';

const MODEL = readFileSync(join(import.meta.dirname, 'fixtures', 'audit', 'model-like.md'), 'utf8');
const doc = () => parseDocument('model-like.md', MODEL, {});

/** The committed rates with chosen counts swapped in, so the sentences are tested against exact numbers. */
function withCounts(counts: Record<string, Record<string, number>>): Rates {
  const base = structuredClone(loadRates()!);
  for (const [ds, fams] of Object.entries(counts)) {
    for (const [fam, count] of Object.entries(fams)) {
      const s = base.datasets[ds].human.families[fam];
      s.count = count;
      s.rate = count / s.n;
    }
  }
  return base;
}

describe('humanRate in the JSON report', () => {
  it('sits on every family with a finding, for both datasets', () => {
    const rates = loadRates()!;
    const r = buildReport(doc(), MODEL, rates);
    expect(Object.keys(r.families).length).toBeGreaterThan(3);
    for (const [fam, entry] of Object.entries(r.families)) {
      expect(Object.keys(entry), fam).toEqual(['evidence', 'sources', 'humanRate']);
      expect(entry.humanRate, fam).toEqual({
        arxiv: { rate: rates.datasets.arxiv.human.families[fam].rate, n: 351 },
        wikiintro: { rate: rates.datasets.wikiintro.human.families[fam].rate, n: 350 },
      });
    }
  });

  it('puts the human median beside each measured value', () => {
    const r = buildReport(doc(), MODEL, loadRates());
    expect(r.measured.humanMedians?.arxiv).toMatchObject({ label: 'arXiv abstracts, 2018 to 2021', sentenceLengthVariation: 0.32 });
    expect(r.measured.humanMedians?.wikiintro?.isAreShare).toBe(1);
  });

  it('adds nothing when there is no rates file, and a family without a rate gets none', () => {
    const none = buildReport(doc(), MODEL, null);
    for (const entry of Object.values(none.families)) expect(Object.keys(entry)).toEqual(['evidence', 'sources']);
    expect(none.measured).not.toHaveProperty('humanMedians');
    const partial = structuredClone(loadRates()!);
    delete partial.datasets.arxiv.human.families['negative-parallelism'];
    delete partial.datasets.wikiintro.human.families['negative-parallelism'];
    const r = buildReport(doc(), MODEL, partial);
    expect(r.families['negative-parallelism']).toEqual({ evidence: expect.any(String), sources: expect.any(Array) });
    expect(r.families['undue-significance'].humanRate).toBeDefined();
  });
});

describe('human-rate line in the text report', () => {
  const line = (rates: Rates | null, fam: string) => {
    const lines = renderText(buildReport(doc(), MODEL, rates)).split('\n');
    const at = lines.findIndex(l => l.startsWith(`  ${fam} (`));
    return lines.slice(at, at + 3).find(l => l.includes('In our samples'));
  };

  it('uses plain rounding, with the sample sizes and the genre caveat', () => {
    const rates = withCounts({ arxiv: { 'undue-significance': 28 }, wikiintro: { 'undue-significance': 10 } });
    expect(line(rates, 'undue-significance')).toBe('    In our samples about 8% of human abstracts and about 3% of human introductions contain this (n=351 and 350); other genres may differ.');
  });

  it('says none of N for a zero count and under 1% for a count that rounds to zero', () => {
    const rates = withCounts({ arxiv: { 'undue-significance': 0 }, wikiintro: { 'undue-significance': 1 } });
    const l = line(rates, 'undue-significance')!;
    expect(l).toContain('none of 351 human abstracts');
    expect(l).toContain('under 1% of human introductions');
    expect(l).not.toContain('0%');
  });

  it('prints nothing without a rates file and for a family without a rate, and never fails', () => {
    expect(line(null, 'undue-significance')).toBeUndefined();
    expect(renderText(buildReport(doc(), MODEL, null))).not.toContain('In our samples');
    const partial = structuredClone(loadRates()!);
    delete partial.datasets.arxiv.human.families['negative-parallelism'];
    delete partial.datasets.wikiintro.human.families['negative-parallelism'];
    expect(line(partial, 'negative-parallelism')).toBeUndefined();
    expect(line(partial, 'undue-significance')).toBeDefined();
  });

  it('shows the human median in the measured lines', () => {
    const text = renderText(buildReport(doc(), MODEL, loadRates()));
    expect(text).toMatch(/sentence-length variation \(sd\/mean\): [\d.]+ \(human median 0\.32 in arXiv abstracts, 2018 to 2021; 0\.42 in Wikipedia introductions, before 2023\)/);
    expect(renderText(buildReport(doc(), MODEL, null))).not.toContain('human median');
  });

  it('never says or implies who wrote a text, a probability, or likely AI', () => {
    const text = renderText(buildReport(doc(), MODEL, loadRates()));
    const rateLines = text.split('\n').filter(l => l.includes('In our samples') || l.includes('human median'));
    expect(rateLines.length).toBeGreaterThan(5);
    for (const l of rateLines) expect(l).not.toMatch(/likely|probab|written by|wrote|AI-generated/i);
  });
});
