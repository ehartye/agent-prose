import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { checkSet } from '../src/owner/check.ts';
import { createSet, variantPath } from '../src/owner/sets.ts';
import { tmpProject, useTmp } from './owner-helpers.ts';

useTmp();
const draft = (text: string, speaker = 'CAP-0') => `form: quest-dialog\nnodes:\n  - id: cap-status\n    speaker: ${speaker}\n    text: ${JSON.stringify(text)}\n    end: true\n`;

function seeded() {
  const p = tmpProject();
  const set = createSet(p.project, p.write('line.dialog.yaml', draft('The report is filed.')), { id: 'line', count: 2, directions: ['drier', 'drier'] });
  return { ...p, set };
}

describe('line-scoped source review checks', () => {
  it('reports uncertainty for a short directional edit instead of treating a zero as a quality verdict', () => {
    const { project, set } = seeded();
    writeFileSync(variantPath(project, set, set.variants[0]), draft('The ledger has your report.'));
    writeFileSync(variantPath(project, set, set.variants[1]), draft('Filed. Next report.'));
    const r = checkSet(project, set);
    expect(r.keep).toEqual([1, 2]);
    expect(r.variants[0].movement?.score).toBe(0);
    expect(r.variants[0].warnings.some(w => w.startsWith('direction-uncertain:'))).toBe(true);
  });

  it('rejects a source-bound candidate that changes a speaker while retaining text-only alternatives', () => {
    const { project, set } = seeded();
    Object.assign(set, { sourceRef: { schema: 'prose/dialog-source@1', manifest: 'C:/example/manifest.json', manifestHash: 'a'.repeat(64), slotId: 'cap-status', slotHash: 'b'.repeat(64) } });
    writeFileSync(variantPath(project, set, set.variants[0]), draft('The ledger has your report.', 'VECTOR-2'));
    writeFileSync(variantPath(project, set, set.variants[1]), draft('Filed. Next report.'));
    const r = checkSet(project, set);
    expect(r.variants[0].reasons).toContain('source-structure-changed: only the designated line text may change');
    expect(r.keep).toEqual([2]);
  });
});
