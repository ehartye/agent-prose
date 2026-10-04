#!/usr/bin/env node
// Regenerate the generated blocks (rule table, numbered sources) in every craft/guides/<family>.md.
// --check fails when any guide is stale. Run `npm run guides` after changing rules.json or a guide's sources.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUIDES_DIR, regenerate, writtenGuides } from '../src/craft/guides.ts';

const check = process.argv.includes('--check');
const di = process.argv.indexOf('--dir');
const dir = di > 0 ? process.argv[di + 1] : GUIDES_DIR;
const stale = [];
for (const family of writtenGuides(dir)) {
  const file = join(dir, `${family}.md`);
  const current = readFileSync(file, 'utf8');
  const next = regenerate(current);
  if (current.replaceAll('\r\n', '\n') === next) continue;
  stale.push(family);
  if (!check) writeFileSync(file, next);
}
if (check) {
  if (stale.length) { console.error(`Stale guides: ${stale.join(', ')}; run npm run guides`); process.exit(1); }
  console.log('craft guides are up to date');
} else {
  console.log(stale.length ? `regenerated ${stale.join(', ')}` : 'craft guides already up to date');
}
