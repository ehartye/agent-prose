// Rebuild craft/data/cmudict.dict.gz and the licence from upstream CMUdict (cmusphinx/cmudict).
// Comment lines (";;;") are stripped; nothing else is changed. Run: node scripts/refresh-cmudict.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BASE = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'craft', 'data');

async function get(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

const [dict, license] = await Promise.all([get('cmudict.dict'), get('LICENSE')]);
const lines = dict.split(/\r?\n/).filter(line => line.trim() && !line.startsWith(';;;'));
const text = `${lines.join('\n')}\n`;
const gz = gzipSync(Buffer.from(text, 'utf8'), { level: 9 });
const bases = new Set(lines.map(line => line.split(' ')[0].replace(/\(\d+\)$/, '')));

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'cmudict.dict.gz'), gz);
writeFileSync(join(out, 'CMUDICT-LICENSE.txt'), license);
console.log(`lines (pronunciations): ${lines.length}`);
console.log(`distinct words: ${bases.size}`);
console.log(`raw bytes: ${Buffer.byteLength(text)}`);
console.log(`gzip bytes: ${gz.length}`);
