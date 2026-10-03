import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

/** Words to pronunciation variants; each variant is a list of Arpabet phones with stress digits (AH0, EH1). */
export type Cmudict = Map<string, string[][]>;

const DATA = join(import.meta.dirname, '..', '..', 'craft', 'data', 'cmudict.dict.gz');

let cached: Cmudict | undefined;
/** How many times the file has been read in this process; prose forms must leave it at zero. */
export let cmudictLoads = 0;

/** Parse CMUdict text: `word PH PH ...`, variants as `word(2) PH ...`, ";;;" lines and "# ..." tails ignored. */
export function parseCmudict(text: string): Cmudict {
  const map: Cmudict = new Map();
  for (const raw of text.split('\n')) {
    if (raw.startsWith(';;;')) continue;
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const [head, ...phones] = line.split(/\s+/);
    if (!phones.length) continue;
    const word = head.replace(/\(\d+\)$/, '');
    const variants = map.get(word);
    if (variants) variants.push(phones);
    else map.set(word, [phones]);
  }
  return map;
}

/** Load the vendored dictionary on first call and keep it for the process (US English, CMUdict). */
export function loadCmudict(): Cmudict {
  if (!cached) {
    cached = parseCmudict(gunzipSync(readFileSync(DATA)).toString('utf8'));
    cmudictLoads++;
  }
  return cached;
}
