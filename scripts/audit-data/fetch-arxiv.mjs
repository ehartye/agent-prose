#!/usr/bin/env node
// @ts-nocheck
// Collects human-written abstracts for the audit measurement: a seeded sample of arXiv abstracts created from 2018 to
// 2021 (before public chat models), through the arXiv OAI-PMH interface (https://oaipmh.arxiv.org/oai).
//
//   node scripts/audit-data/fetch-arxiv.mjs [--out <dir>] [--seed N] [--delay SECONDS] [--dry-run] [--help]
//
// Writes <out>/human/<id>.txt (one abstract each, slashes in old-style ids become underscores), <out>/manifest.json and
// <out>/titles.tsv. The default <out> is under the OS temp dir, outside the repository: no text is ever committed.
// --dry-run parses the arguments and prints the plan without making any request.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultOut, politeGetter, rng } from './common.mjs';

export const DEFAULT_SEED = 20240607;
const BASE = 'https://oaipmh.arxiv.org/oai';
/** OAI set -> window kind: weekly windows for the big computing sets, monthly for the mid-size ones, half-years for the small one. */
export const SETS = {
  'cs:cs:CL': 'w', 'cs:cs:CV': 'w', 'cs:cs:LG': 'w', 'stat:stat:ML': 'w',
  'physics:physics:comp-ph': 'm', 'math:math:PR': 'm', 'q-bio:q-bio:NC': 'm', 'econ:econ:EM': 'y',
};
export const WINDOWS = {
  w: [['2018-06-04', '2018-06-10'], ['2019-10-07', '2019-10-13'], ['2020-04-06', '2020-04-12'], ['2021-09-06', '2021-09-12']],
  m: [['2018-06-01', '2018-06-30'], ['2019-10-01', '2019-10-31'], ['2020-04-01', '2020-04-30'], ['2021-09-01', '2021-09-30']],
  y: [['2018-03-01', '2018-08-31'], ['2019-03-01', '2019-08-31'], ['2020-03-01', '2020-08-31'], ['2021-03-01', '2021-08-31']],
};
const PER_WINDOW = 13;
const PER_SET = 50;
const MIN_WORDS = 80, MAX_WORDS = 400;
const STOP = new Set('the of and to in is we a for that with on this are by as an'.split(' '));

export function parseArgs(argv) {
  const o = { out: defaultOut('agent-prose-audit-arxiv'), seed: DEFAULT_SEED, delay: 5, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--seed') o.seed = Number(argv[++i]);
    else if (a === '--delay') o.delay = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!o.out) throw new Error('--out needs a directory');
  if (!Number.isInteger(o.seed)) throw new Error('--seed needs an integer');
  if (!(o.delay >= 0)) throw new Error('--delay needs a number of seconds');
  return o;
}

export const HELP = `Usage: node scripts/audit-data/fetch-arxiv.mjs [--out <dir>] [--seed N] [--delay SECONDS] [--dry-run]

Samples arXiv abstracts created 2018 to 2021 through OAI-PMH (${BASE}), ${Object.keys(SETS).length} sets, 4 date windows each,
${PER_WINDOW} per window, at most ${PER_SET} per set. Writes human/<id>.txt, manifest.json and titles.tsv into <dir>
(default: the OS temp dir). Requests are spaced --delay seconds apart (default 5); Retry-After and 429 are honoured.
Default seed ${DEFAULT_SEED}. --dry-run prints the plan and makes no request.`;

/** The list of requests the run would make, as [set, from, until, url]. */
export function plan() {
  return Object.entries(SETS).flatMap(([set, kind]) => WINDOWS[kind].map(([from, until]) =>
    [set, from, until, `${BASE}?verb=ListRecords&metadataPrefix=arXiv&set=${set}&from=${from}&until=${until}`]));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITIES[e] ?? m;
});
const tag = (xml, name) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decode(m[1]) : '';
};
const squash = s => s.replace(/\s+/g, ' ').trim();

/** The arXiv-format records of one OAI-PMH ListRecords response (first page only, as the original harvest did). */
export function parseRecords(xml) {
  return [...xml.matchAll(/<arXiv(?:\s[^>]*)?>([\s\S]*?)<\/arXiv>/g)].map(m => ({
    id: tag(m[1], 'id'), created: tag(m[1], 'created'), title: squash(tag(m[1], 'title')), ab: squash(tag(m[1], 'abstract')),
  }));
}

/** Whether a record passes the date, length and letter-share filters. */
export function keep(r) {
  if (!(r.created >= '2018-01-01' && r.created <= '2021-12-31')) return false;
  const n = r.ab.split(' ').filter(Boolean).length;
  if (n < MIN_WORDS || n > MAX_WORDS) return false;
  return (r.ab.match(/[A-Za-z]/g)?.length ?? 0) >= 0.6 * r.ab.length;
}

/** A cheap English check: stop words make up more than a quarter of the lower-case word tokens. */
export function looksEnglish(text) {
  const w = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return w.length > 0 && w.filter(x => STOP.has(x)).length / w.length > 0.25;
}

async function main(o) {
  const get = politeGetter({ minGapMs: o.delay * 1000 });
  const r = rng(o.seed);
  const entries = [];
  for (const [set, from, , url] of plan()) {
    const xml = await get(url);
    if (xml === null) { console.error(`${set} ${from}: FAILED`); continue; }
    const pool = parseRecords(xml).filter(keep).map(e => ({ ...e, set, words: e.ab.split(' ').length }));
    r.shuffle(pool);
    entries.push(...pool.slice(0, PER_WINDOW));
    console.error(`${set} ${from} ${pool.length}`);
  }
  const bySet = new Map();
  for (const e of entries.filter(x => looksEnglish(x.ab))) bySet.set(e.set, [...(bySet.get(e.set) ?? []), e]);
  const final = [...bySet.values()].flatMap(l => l.slice(0, PER_SET));
  mkdirSync(join(o.out, 'human'), { recursive: true });
  for (const e of final) writeFileSync(join(o.out, 'human', `${e.id.replace(/\//g, '_')}.txt`), e.ab);
  const manifest = { fetchedAt: new Date().toISOString(), seed: o.seed, source: 'arXiv OAI-PMH', entries: final.map(({ id, set, title, created, words }) => ({ id, set, title, created, words })) };
  writeFileSync(join(o.out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  writeFileSync(join(o.out, 'titles.tsv'), final.map(e => `${e.id}\t${e.set}\t${e.title}\n`).join(''));
  console.error(`wrote ${final.length} abstracts to ${o.out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) console.log(HELP);
    else if (o.dryRun) {
      const p = plan();
      console.log(`Dry run: ${p.length} requests planned (${Object.keys(SETS).length} sets, 4 windows each), seed ${o.seed}, ${o.delay} s apart, output ${o.out}.\nFirst: ${p[0][3]}\nNo request was made and nothing was written.`);
    } else await main(o);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
