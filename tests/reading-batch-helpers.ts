// Shared by the batch-review tests: a project with several real sets (three variants each), sealed predictions, and a queue.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writePrediction } from '../src/owner/prediction.ts';
import { createSet, variantPath, type PromptSet } from '../src/owner/sets.ts';
import { createQueue } from '../src/commands/reading-queue.ts';
import { planOpen } from '../src/reading/open.ts';
import { PUNCHY, SHORT, WARM, tmpProject } from './owner-helpers.ts';

export interface Batch {
  project: string;
  write: (name: string, text: string) => string;
  sets: PromptSet[];
  ids: string[];
}

/** `n` sets (a-01, a-02, ...) made from one draft, oldest first, each with three different variants; `predict(k)` says which get a sealed guess (pick 2, shortlist 3). */
export function seedBatch(n: number, over: { predict?: (k: number) => boolean; lines?: string } = {}): Batch {
  const p = tmpProject();
  const draft = p.write('t.md', SHORT);
  const sets: PromptSet[] = [];
  for (let k = 0; k < n; k++) {
    const id = `a-${String(k + 1).padStart(2, '0')}`;
    const set = createSet(p.project, draft, { id, count: 3, directions: ['shorter', 'warmer', 'punchier'], now: new Date(Date.UTC(2026, 9, 4, 12, k)), ...(over.lines ? { lines: over.lines } : {}) });
    [SHORT.replace('We built', `We raised ${k}`), WARM, PUNCHY].forEach((text, i) => writeFileSync(variantPath(p.project, set, set.variants[i]), text));
    if (!over.predict || over.predict(k)) writePrediction(p.project, set, { pick: 2, shortlist: [3], why: `SEALED-${id}` });
    sets.push(set);
  }
  return { ...p, sets, ids: sets.map(s => s.id) };
}

/** A queue over the given sets of a batch, made directly (no server): the children exist and queue.json is written. */
export function makeQueue(b: Batch, ids = b.ids, prompt = '') {
  const plans = ids.map(id => planOpen(b.project, b.sets.find(s => s.id === id)!, true));
  return createQueue(b.project, plans, prompt);
}

export const variantFileOf = (b: Batch, setId: string, i: number) => {
  const set = b.sets.find(s => s.id === setId)!;
  return variantPath(b.project, set, set.variants[i - 1]);
};
export const draftFileOf = (b: Batch) => join(b.project, 't.md');
