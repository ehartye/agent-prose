#!/usr/bin/env node
// Generate REFERENCES.md from craft/references.json; --check fails when the file is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUIDE_REFERENCES, REFERENCES, RULES } from '../src/craft/rules.ts';
import { ALL_LEXICONS } from '../src/measure/lexicon.ts';
import { AUDIT_SOURCES } from '../src/audit/detectors.ts';
import { renderReferences } from '../src/craft/references.ts';

const target = join(import.meta.dirname, '..', 'REFERENCES.md');
const text = renderReferences(REFERENCES, RULES, ALL_LEXICONS, AUDIT_SOURCES, GUIDE_REFERENCES);
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(target, 'utf8').replaceAll('\r\n', '\n'); } catch {}
  if (current !== text) { console.error('REFERENCES.md is stale; run npm run refs'); process.exit(1); }
  console.log('REFERENCES.md is up to date');
} else {
  writeFileSync(target, text);
  console.log(`wrote ${target}`);
}
