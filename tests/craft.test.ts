import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUIDE_REFERENCES, REFERENCES, RULES, rulesFor } from '../src/craft/rules.ts';
import { renderReferences } from '../src/craft/references.ts';
import { ALL_LEXICONS } from '../src/measure/lexicon.ts';
import { AUDIT_SOURCES } from '../src/audit/detectors.ts';
import { FORMS } from '../src/forms.ts';
import { loadGuide } from '../src/craft/guides.ts';

const root = join(import.meta.dirname, '..');
const refIds = new Set(REFERENCES.map(r => r.id));
const guides = GUIDE_REFERENCES.map(g => ({ ...g, sources: loadGuide(g.family).sources }));

describe('craft data', () => {
  it('has unique rule and reference ids', () => {
    expect(new Set(RULES.map(r => r.id)).size).toBe(RULES.length);
    expect(refIds.size).toBe(REFERENCES.length);
  });

  it('cites only known references, and every reference is cited', () => {
    const cited = new Set([...RULES.flatMap(r => r.sources), ...ALL_LEXICONS.flatMap(l => l.sources), ...AUDIT_SOURCES.flatMap(a => a.sources)]);
    for (const id of cited) expect(refIds, `unknown reference ${id}`).toContain(id);
    const allCited = new Set([...cited, ...guides.flatMap(g => g.sources)]);
    for (const id of refIds) expect(allCited, `uncited reference ${id}`).toContain(id);
  });

  it('names only known forms', () => {
    const formIds = new Set(FORMS.map(f => f.id));
    for (const r of RULES) if (r.forms !== 'all') for (const f of r.forms) expect(formIds, `${r.id} → ${f}`).toContain(f);
  });

  it('declares conflicts reciprocally, between real rules', () => {
    const byId = new Map(RULES.map(r => [r.id, r]));
    for (const r of RULES) for (const c of r.conflicts) {
      expect(byId.has(c.rule), `${r.id} conflicts with unknown ${c.rule}`).toBe(true);
      expect(byId.get(c.rule)!.conflicts.map(x => x.rule), `${c.rule} must declare ${r.id}`).toContain(r.id);
    }
  });

  it('filters rules by form', () => {
    const ids = rulesFor('quest-dialog').map(r => r.id);
    expect(ids).toContain('dialog.graph.dead-end');
    expect(ids).not.toContain('procedure.filler');
  });

  it('renders a reference row without double parentheses, escaping table pipes', () => {
    const md = renderReferences([
      { id: 'x', authors: 'Org (Blog)', year: 2024, title: 'A | B', url: 'https://example.com/', kind: 'practitioner' },
      { id: 'y', authors: 'Solo | Pair', year: null, title: 'T', url: 'https://example.com/y', kind: 'book' },
    ], [], []);
    expect(md).toContain('| x | Org (Blog), 2024. [A \\| B](https://example.com/) | practitioner |  |');
    expect(md).toContain('| y | Solo \\| Pair. [T](https://example.com/y) | book |  |');
  });

  it('grounds rationales in what the cited sources say', () => {
    const rationale = (id: string) => RULES.find(r => r.id === id)!.rationale;
    expect(rationale('dialog.revisit.variety')).toMatch(/variants or summaries/);
    expect(rationale('dialog.revisit.variety')).not.toMatch(/sequences|cycles|shuffles/);
    expect(rationale('dialog.revisit.variety')).toMatch(/only through conditional links.*always-true condition/);
    expect(rationale('script.multicam.caps-action')).toMatch(/twice/);
    expect(rationale('script.multicam.caps-action')).not.toMatch(/why/);
  });
  it('explains every rule in craft/GUIDE.md', () => {
    const guide = readFileSync(join(root, 'craft', 'GUIDE.md'), 'utf8');
    const missing = RULES.map(r => r.id).filter(id => !guide.includes(`\`${id}\``));
    expect(missing, 'rule ids missing from craft/GUIDE.md').toEqual([]);
  });
  it('keeps REFERENCES.md in sync', () => {
    const expected = renderReferences(REFERENCES, RULES, ALL_LEXICONS, AUDIT_SOURCES, guides);
    expect(readFileSync(join(root, 'REFERENCES.md'), 'utf8').replaceAll('\r\n', '\n')).toBe(expected);
  });
});
