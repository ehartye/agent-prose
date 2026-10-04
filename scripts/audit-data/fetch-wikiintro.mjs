#!/usr/bin/env node
// @ts-nocheck
// Collects Wikipedia introductions for the audit measurement: pairs of a human-written introduction (before 2023) and
// an introduction generated for the same title by an older GPT model, from the public Hugging Face dataset
// https://huggingface.co/datasets/aadityaubhat/GPT-wiki-intro, through the datasets-server API.
//
//   node scripts/audit-data/fetch-wikiintro.mjs [--out <dir>] [--seed N] [--offsets a,b,c] [--delay SECONDS] [--dry-run] [--help]
//
// Writes <out>/human/wNNNN.txt, <out>/model-plain/wNNNN.txt (the directory name audit-measure.mjs expects) and
// <out>/manifest.json. The default <out> is under the OS temp dir, outside the repository: no text is ever committed.
// --dry-run parses the arguments and prints the plan without making any request.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultOut, politeGetter, rng, sleep } from './common.mjs';

export const DEFAULT_SEED = 20261003;
const DATASET = 'aadityaubhat/GPT-wiki-intro';
const BASE = `https://datasets-server.huggingface.co/rows?dataset=${DATASET}&config=default&split=train`;
const ROWS = 140000;
const BATCH = 100;
const WANT = 350;
const MIN_WORDS = 60, MAX_WORDS = 400;

export function parseArgs(argv) {
  const o = { out: defaultOut('agent-prose-audit-wikiintro'), seed: DEFAULT_SEED, offsets: undefined, delay: 2, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--seed') o.seed = Number(argv[++i]);
    else if (a === '--delay') o.delay = Number(argv[++i]);
    else if (a === '--offsets') {
      o.offsets = String(argv[++i]).split(',').map(Number);
      if (!o.offsets.length || o.offsets.some(n => !Number.isInteger(n) || n < 0)) throw new Error('--offsets needs comma-separated non-negative integers');
    } else throw new Error(`Unknown argument: ${a}`);
  }
  if (!o.out) throw new Error('--out needs a directory');
  if (!Number.isInteger(o.seed)) throw new Error('--seed needs an integer');
  if (!(o.delay >= 0)) throw new Error('--delay needs a number of seconds');
  if (!o.offsets) {
    const r = rng(o.seed);
    o.offsets = Array.from({ length: 5 }, () => r.int(0, ROWS));
  }
  return o;
}

export const HELP = `Usage: node scripts/audit-data/fetch-wikiintro.mjs [--out <dir>] [--seed N] [--offsets a,b,c] [--delay SECONDS] [--dry-run]

Fetches ${BATCH}-row batches of ${DATASET} (Wikipedia introductions before 2023 beside GPT "Curie" introductions
for the same titles) at five seeded random offsets, keeps pairs of ${MIN_WORDS} to ${MAX_WORDS} words with a new title, up to ${WANT}.
Writes human/, model-plain/ and manifest.json into <dir> (default: the OS temp dir). Default seed ${DEFAULT_SEED}.
--offsets pins the offsets instead of drawing them from the seed. --dry-run prints the plan and makes no request.`;

export const urlFor = offset => `${BASE}&offset=${offset}&length=${BATCH}`;

/** Paragraphs kept, whitespace inside each paragraph collapsed to single spaces. */
export function normalize(t) {
  return t.trim().split(/\n\s*\n/).filter(p => p.trim()).map(p => p.split(/\s+/).filter(Boolean).join(' ')).join('\n\n');
}

/** Pairs from fetched rows: both texts within the word bounds, each title once, at most `want`. */
export function selectPairs(rows, want = WANT) {
  const seen = new Set(), out = [];
  for (const r of rows) {
    const h = normalize(r.wiki_intro), m = normalize(r.generated_intro), t = r.title;
    const hw = h.split(/\s+/).length, mw = m.split(/\s+/).length;
    if (!(hw >= MIN_WORDS && hw <= MAX_WORDS && mw >= MIN_WORDS && mw <= MAX_WORDS) || seen.has(t)) continue;
    seen.add(t);
    out.push({ h, m, title: t, humanWords: hw, modelWords: mw });
    if (out.length >= want) break;
  }
  return out;
}

async function main(o) {
  const get = politeGetter({ minGapMs: 0, tries: 4, fallback503Ms: 5000, fallback429Ms: 5000 });
  const rows = [], done = [];
  for (const offset of o.offsets) {
    const r = await get(urlFor(offset), true);
    if (r === null) { console.error(`gave up at offset ${offset}`); break; }
    rows.push(...r.rows.map(x => x.row));
    done.push(offset);
    console.error(`offset ${offset}: ${r.rows.length} rows`);
    await sleep(o.delay * 1000);
  }
  const pairs = selectPairs(rows);
  mkdirSync(join(o.out, 'human'), { recursive: true });
  mkdirSync(join(o.out, 'model-plain'), { recursive: true });
  const entries = pairs.map((p, i) => {
    const id = `w${String(i + 1).padStart(4, '0')}`;
    writeFileSync(join(o.out, 'human', `${id}.txt`), p.h);
    writeFileSync(join(o.out, 'model-plain', `${id}.txt`), p.m);
    return { id, title: p.title, humanWords: p.humanWords, modelWords: p.modelWords };
  });
  const manifest = { fetchedAt: new Date().toISOString(), seed: o.seed, source: BASE, dataset: DATASET, offsets: done, entries };
  writeFileSync(join(o.out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.error(`wrote ${entries.length} pairs to ${o.out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) console.log(HELP);
    else if (o.dryRun) {
      console.log(`Dry run: ${o.offsets.length} requests planned at offsets ${o.offsets.join(', ')}, seed ${o.seed}, ${o.delay} s apart, output ${o.out}.\nFirst: ${urlFor(o.offsets[0])}\nNo request was made and nothing was written.`);
    } else await main(o);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
