#!/usr/bin/env node
// Measurement harness for the style audit. Runs the audit's detectors in-process over three groups of plain-text
// abstracts (human, model-plain, model-clean), splits the ids into a calibration half and a held-out half with a
// seeded shuffle, and prints per-family flag rates, soft-finding density and a paired comparison, with Wilson intervals.
//
//   node scripts/audit-measure.mjs <dataDir> [--seed N] [--json]
//
// <dataDir> holds human/<id>.txt, model-plain/<id>.txt and model-clean/<id>.txt. The data is never copied into the
// repository. Deterministic: no network, no clock, no randomness beyond the seeded shuffle.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDocument } from '../src/document.ts';
import { buildReport } from '../src/audit/report.ts';
import { FAMILIES } from '../src/audit/detectors.ts';

const GROUPS = ['human', 'model-plain', 'model-clean'];
const DEFAULT_SEED = 20261003;
/** Passages under this many words are counted as short in the report; it is context only and flags nothing. */
const MIN_WORDS = 100;
const SOFT = FAMILIES.filter(f => f.tier === 'soft').map(f => f.id);
const HARD = FAMILIES.filter(f => f.tier === 'hard').map(f => f.id);

function parseArgs(argv) {
  const o = { dir: undefined, seed: DEFAULT_SEED, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--seed') o.seed = Number(argv[++i]);
    else if (!a.startsWith('--') && o.dir === undefined) o.dir = a;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!o.dir) throw new Error('Usage: node scripts/audit-measure.mjs <dataDir> [--seed N] [--json]');
  if (!Number.isInteger(o.seed)) throw new Error('--seed needs an integer');
  return o;
}

/** mulberry32: a small seeded generator, so the split is the same on every machine. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sorted ids, shuffled (Fisher-Yates) with the seed; the first half calibrates and the rest is held out. */
export function splitIds(ids, seed) {
  const a = [...ids].sort();
  const r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const cut = Math.ceil(a.length / 2);
  return { calibration: new Set(a.slice(0, cut)), heldout: new Set(a.slice(cut)) };
}

/** Wilson 95% score interval for k of n. */
export function wilson(k, n) {
  if (!n) return { rate: null, lo: null, hi: null };
  const z = 1.959964, p = k / n, d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { rate: p, lo: Math.max(0, (c - m) / d), hi: Math.min(1, (c + m) / d) };
}

function percentile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** One abstract read as a Markdown draft with form `academic`, the way `prose audit` would read a file. */
function analyze(text) {
  const doc = parseDocument('abstract.md', text, { form: 'academic' });
  const r = buildReport(doc, text);
  return { words: r.words, findings: [...r.tiers.hard, ...r.tiers.soft] };
}

function load(dir) {
  const groups = {};
  for (const g of GROUPS) {
    const d = join(dir, g);
    groups[g] = new Map();
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter(n => n.endsWith('.txt')).sort()) {
      const id = f.slice(0, -4);
      groups[g].set(id, { id, ...analyze(readFileSync(join(d, f), 'utf8')) });
    }
  }
  return groups;
}

function familyRates(recs) {
  const out = {};
  for (const fam of [...SOFT, ...HARD]) {
    const k = recs.filter(r => r.findings.some(f => f.family === fam)).length;
    out[fam] = { tier: HARD.includes(fam) ? 'hard' : 'soft', k, ...wilson(k, recs.length) };
  }
  return out;
}

function summarize(recs) {
  const dens = recs.map(r => (r.words ? (r.findings.filter(f => f.tier === 'soft').length * 1000) / r.words : 0)).sort((a, b) => a - b);
  const anySoft = recs.filter(r => r.findings.some(f => f.tier === 'soft')).length;
  return {
    n: recs.length,
    meanWords: mean(recs.map(r => r.words)),
    underMinWords: recs.filter(r => r.words < MIN_WORDS).length,
    families: familyRates(recs),
    anySoft: { k: anySoft, ...wilson(anySoft, recs.length) },
    softPerThousand: { mean: mean(dens), median: percentile(dens, 0.5), p90: percentile(dens, 0.9) },
  };
}

/** Whether a passage has at least one soft finding. */
const flagged = rec => rec.findings.some(f => f.tier === 'soft');

function paired(humans, models, ids) {
  const c = { both: 0, modelOnly: 0, humanOnly: 0, neither: 0, n: 0 };
  for (const id of [...ids].sort()) {
    const h = humans.get(id), m = models.get(id);
    if (!h || !m) continue;
    c.n++;
    const hm = flagged(h), mm = flagged(m);
    if (hm && mm) c.both++; else if (mm) c.modelOnly++; else if (hm) c.humanOnly++; else c.neither++;
  }
  return c;
}

function topSpans(recs, limit = 10) {
  const counts = new Map();
  for (const r of recs) for (const f of r.findings) {
    if (f.tier !== 'soft') continue;
    const span = f.text.toLowerCase().split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:]+$/, '');
    const key = `${f.family}\t${span}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit).map(([k, n]) => {
    const [family, span] = k.split('\t');
    return { family, span, count: n };
  });
}

const pct = v => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const ci = r => `${pct(r.rate)} [${pct(r.lo)}, ${pct(r.hi)}]`;
const num = v => (v === null ? 'n/a' : v.toFixed(2));
const cell = (w, ...xs) => xs.map(s => String(s).padEnd(w)).join(' ');

function render(result) {
  const out = [];
  out.push(`Audit measurement (seed ${result.seed})`);
  const drop = Object.entries(result.droppedModelIds);
  out.push(`Model ids absent from the human set, dropped: ${drop.length ? drop.map(([g, n]) => `${g} ${n}`).join(', ') : '0'}`);
  for (const half of ['calibration', 'heldout']) {
    out.push('', `=== ${half} half (${result.halves[half].ids} ids) ===`);
    const gs = result.halves[half].groups;
    const names = GROUPS.filter(g => gs[g]);
    out.push(cell(32, '', ...names));
    out.push(cell(32, 'n', ...names.map(g => gs[g].n)));
    out.push(cell(32, 'mean words', ...names.map(g => num(gs[g].meanWords))));
    out.push(cell(32, 'under 100 words', ...names.map(g => gs[g].underMinWords)));
    out.push('', 'Family flag rate (share of abstracts with at least one finding)');
    for (const fam of [...HARD, ...SOFT]) out.push(cell(32, `${fam} (${HARD.includes(fam) ? 'hard' : 'soft'})`, ...names.map(g => pct(gs[g].families[fam].rate))));
    out.push(cell(32, 'any soft', ...names.map(g => pct(gs[g].anySoft.rate))));
    out.push('', 'Soft findings per 1,000 words (mean / median / p90)');
    for (const g of names) out.push(`  ${g.padEnd(12)} ${num(gs[g].softPerThousand.mean)} / ${num(gs[g].softPerThousand.median)} / ${num(gs[g].softPerThousand.p90)}`);
    for (const [g, c] of Object.entries(result.halves[half].paired)) {
      out.push('', `Paired by title, any soft finding, human vs ${g} (n=${c.n}): both ${c.both}, ${g} only ${c.modelOnly}, human only ${c.humanOnly}, neither ${c.neither}`);
    }
    out.push('', 'Ten most frequent soft spans in the human group');
    for (const s of result.halves[half].topHumanSpans) out.push(`  ${String(s.count).padStart(3)}  ${s.family}: "${s.span}"`);
  }
  out.push('', 'Ten most frequent soft spans in the whole human group (both halves)');
  for (const s of result.topHumanSpansAll) out.push(`  ${String(s.count).padStart(3)}  ${s.family}: "${s.span}"`);
  out.push('', 'Hard findings in any group');
  for (const g of GROUPS) out.push(`  ${g}: ${result.hardFindings[g].length}${result.hardFindings[g].map(h => `\n    ${h.id} ${h.family}: "${h.text}"`).join('')}`);
  return out.join('\n');
}

export function run(opts) {
  const groups = load(opts.dir);
  const { calibration, heldout } = splitIds([...groups.human.keys()], opts.seed);
  // Ids are split from the human set, so a model id with no human counterpart belongs to neither half: count and say so.
  const dropped = {};
  for (const g of GROUPS) {
    if (g === 'human') continue;
    const n = [...groups[g].keys()].filter(id => !groups.human.has(id)).length;
    if (n) {
      dropped[g] = n;
      console.error(`warning: ${n} ${g} id${n === 1 ? '' : 's'} not in the human set, left out of both halves`);
    }
  }
  const halves = {};
  for (const [name, ids] of [['calibration', calibration], ['heldout', heldout]]) {
    const gs = {}, pairs = {};
    for (const g of GROUPS) {
      const recs = [...groups[g].values()].filter(r => ids.has(r.id));
      if (recs.length) gs[g] = summarize(recs);
      if (g !== 'human' && recs.length) pairs[g] = paired(groups.human, groups[g], ids);
    }
    halves[name] = { ids: ids.size, groups: gs, paired: pairs, topHumanSpans: topSpans([...groups.human.values()].filter(r => ids.has(r.id))) };
  }
  const hardFindings = {};
  for (const g of GROUPS) {
    hardFindings[g] = [...groups[g].values()].flatMap(r => r.findings.filter(f => f.tier === 'hard').map(f => ({ id: r.id, family: f.family, text: f.text })));
  }
  return { seed: opts.seed, droppedModelIds: dropped, halves, topHumanSpansAll: topSpans([...groups.human.values()]), hardFindings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseArgs(process.argv.slice(2));
  const result = run(opts);
  console.log(opts.json ? JSON.stringify(result, null, 2) : render(result));
}
