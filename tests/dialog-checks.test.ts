import { describe, expect, it } from 'vitest';
import { loadDocument } from '../src/document.ts';
import { getForm } from '../src/forms.ts';
import { checkGraph, jaccard, measureDialog } from '../src/measure/dialog.ts';
import { parseDialog } from '../src/parse/dialog.ts';
import { fixture } from './helpers.ts';

describe('dialog checks', () => {
  const doc = loadDocument(fixture('gate.dialog.yaml'));
  const stats = measureDialog(doc, getForm(doc.form));
  const kinds = (k: string) => stats.issues.filter(i => i.kind === k);

  it('counts the graph', () => {
    expect([stats.nodes, stats.choices, stats.barkPools]).toEqual([5, 2, 2]);
  });

  it('finds dangling targets, dead ends and unreachable nodes', () => {
    expect(kinds('dangling')).toEqual([{ kind: 'dangling', node: 'lost', to: 'nowhere', line: 24 }]);
    expect(kinds('dead-end')).toEqual([{ kind: 'dead-end', node: 'passing', line: 17 }]);
    expect(kinds('unreachable').map(i => i.node)).toEqual(['orphan', 'lost']);
  });

  it('flags single-variant bark pools and near-repeats', () => {
    expect(kinds('single-variant')).toEqual([{ kind: 'single-variant', pool: 'guard-alarm', line: 35 }]);
    expect(stats.nearRepeats).toEqual([{ pool: 'guard-idle', a: 33, b: 34, ai: 7, bi: 8, similarity: 0.83 }]);
  });

  it('flags lines that overflow the text box', () => {
    expect(stats.overflow).toEqual([expect.objectContaining({ line: 6, lines: 3 })]);
    expect([stats.boxChars, stats.boxLines]).toEqual([40, 2]);
  });

  it('flags choice sets without an unconditional fallback, and duplicate ids', () => {
    const issues = checkGraph({
      nodes: [
        { id: 'a', speaker: 'X', text: 'hi', choices: [{ text: 'go', to: 'b', condition: 'flag' }] },
        { id: 'b', speaker: 'X', text: 'bye', end: true },
        { id: 'b', speaker: 'X', text: 'again', end: true },
      ],
      barks: [], nodeLines: { a: 1, b: 5 }, nodeLineByIndex: [1, 5, 9], barkLines: {},
    });
    expect(issues.map(i => i.kind).sort()).toEqual(['duplicate-id', 'no-exit', 'no-fallback']);
  });

  it('reports a duplicate id at the duplicate node, not the first one', () => {
    const pad = (n: number) => Array.from({ length: n }, () => '# pad');
    const src = [
      'nodes:', '  - id: a', '    speaker: X', '    text: hi', '    next: room', ...pad(8),
      '  - id: room', '    speaker: X', '    text: one', '    end: true', ...pad(4),
      '  - id: room', '    speaker: X', '    text: two', '    end: true', '',
    ].join('\n');
    const { graph } = parseDialog(src);
    expect(graph.nodeLines.room).toBe(14);
    expect(checkGraph(graph).filter(i => i.kind === 'duplicate-id')).toEqual([{ kind: 'duplicate-id', node: 'room', line: 22 }]);
  });

  it('computes word-set similarity', () => {
    expect(jaccard('Quiet night on the wall.', 'Quiet night on the wall again.')).toBeCloseTo(5 / 6);
  });

  it('reports every overlapping bark pair with block indexes, leaving thresholds to lint', () => {
    const src = ['barks:', '  - pool: p', '    speaker: X', '    context: c', '    lines:', '      - Cold wind tonight.', '      - Cold rain again.', '      - Nothing here.', ''].join('\n');
    const parsed = parseDialog(src);
    const d = { path: 'x.dialog.yaml', format: 'dialog' as const, form: 'barks', meta: parsed.meta, blocks: parsed.blocks, graph: parsed.graph };
    expect(measureDialog(d, getForm('barks')).nearRepeats).toEqual([{ pool: 'p', a: 6, b: 7, ai: 0, bi: 1, similarity: 0.2 }]);
  });
});
