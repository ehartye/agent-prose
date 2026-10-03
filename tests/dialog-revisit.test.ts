import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { checkGraph } from '../src/measure/dialog.ts';
import { parseDialog } from '../src/parse/dialog.ts';

const base = { barks: [], barkLines: {} };

describe('revisit variety', () => {
  it('flags nodes with two or more incoming links and no variants', () => {
    const issues = checkGraph({ ...base, start: 'a', nodeLines: { a: 1, b: 2, c: 3 }, nodeLineByIndex: [1, 2, 3], nodes: [
      { id: 'a', speaker: 'X', text: 'hi', choices: [{ text: '1', to: 'c' }, { text: '2', to: 'b' }] },
      { id: 'b', speaker: 'X', text: 'mid', next: 'c' },
      { id: 'c', speaker: 'X', text: 'again', end: true },
    ] });
    expect(issues.filter(i => i.kind === 'repeat-without-variants')).toEqual([{ kind: 'repeat-without-variants', node: 'c', line: 3 }]);
  });
  it('flags nodes on a cycle', () => {
    const issues = checkGraph({ ...base, start: 'hub', nodeLines: { hub: 1, ask: 2 }, nodeLineByIndex: [1, 2], nodes: [
      { id: 'hub', speaker: 'X', text: 'What else?', choices: [{ text: 'Ask', to: 'ask' }, { text: 'Bye', to: 'hub' }] },
      { id: 'ask', speaker: 'X', text: 'Answer.', next: 'hub' },
    ] });
    expect(issues.filter(i => i.kind === 'repeat-without-variants').map(i => i.node)).toEqual(['hub', 'ask']);
  });
  it('counts incoming links by distinct source node', () => {
    const issues = checkGraph({ ...base, start: 'a', nodeLines: { a: 1, b: 2 }, nodeLineByIndex: [1, 2], nodes: [
      { id: 'a', speaker: 'X', text: 'hi', choices: [{ text: 'Yes', to: 'b' }, { text: 'Sure', to: 'b' }] },
      { id: 'b', speaker: 'X', text: 'ok', end: true },
    ] });
    expect(issues.filter(i => i.kind === 'repeat-without-variants')).toEqual([]);
  });
  it('ignores self-loops for the incoming count but still flags the cycle', () => {
    const issues = checkGraph({ ...base, start: 'a', nodeLines: { a: 1, b: 2, end: 3 }, nodeLineByIndex: [1, 2, 3], nodes: [
      { id: 'a', speaker: 'X', text: 'hi', next: 'b' },
      { id: 'b', speaker: 'X', text: 'again?', choices: [{ text: 'Again', to: 'b' }, { text: 'Bye', to: 'end' }] },
      { id: 'end', speaker: 'X', text: 'bye', end: true },
    ] });
    expect(issues.filter(i => i.kind === 'repeat-without-variants').map(i => i.node)).toEqual(['b']);
  });
  it('does not flag a spoke whose every incoming link is a conditional choice', () => {
    const issues = checkGraph({ ...base, start: 'hub', nodeLines: { hub: 1, ask: 2, bye: 3 }, nodeLineByIndex: [1, 2, 3], nodes: [
      { id: 'hub', speaker: 'X', text: 'What else?', variants: ['More?'], choices: [{ text: 'Ask', to: 'ask', condition: 'not asked' }, { text: 'Bye', to: 'bye' }] },
      { id: 'ask', speaker: 'X', text: 'Answer.', next: 'hub' },
      { id: 'bye', speaker: 'X', text: 'Bye.', end: true },
    ] });
    expect(issues.filter(i => i.kind === 'repeat-without-variants').map(i => i.node)).toEqual([]);
  });
  it('is satisfied by variants', () => {
    const issues = checkGraph({ ...base, start: 'hub', nodeLines: { hub: 1 }, nodeLineByIndex: [1], nodes: [
      { id: 'hub', speaker: 'X', text: 'What else?', variants: ['Anything more?'], choices: [{ text: 'Again', to: 'hub' }, { text: 'Bye', to: 'hub' }] },
    ] });
    expect(issues.filter(i => i.kind === 'repeat-without-variants')).toEqual([]);
  });
  it('parses variants into line blocks', () => {
    const p = parseDialog('nodes:\n  - id: a\n    speaker: X\n    text: Hi.\n    variants:\n      - Hello again.\n    end: true\n');
    expect(p.blocks.map(b => [b.text, b.line, b.meta?.variant ?? 0])).toEqual([['Hi.', 4, 0], ['Hello again.', 6, 1]]);
  });
  it('accepts translator comments on nodes and choices', () => {
    const p = parseDialog('nodes:\n  - id: a\n    speaker: X\n    text: Hi.\n    comment: Casual greeting.\n    choices:\n      - text: Bye\n        to: a\n        comment: Curt.\n    variants: [Hey.]\n');
    expect(p.graph.nodes[0].comment).toBe('Casual greeting.');
    expect(p.graph.nodes[0].choices![0].comment).toBe('Curt.');
  });
});

describe('dialog fix hints', () => {
  const lintYaml = (yaml: string) => { const d = mkdtempSync(join(tmpdir(), 'prose-dlg-')); const f = join(d, 'c.dialog.yaml'); writeFileSync(f, yaml); return lint(loadDocument(f)); };
  const fixOf = (r: ReturnType<typeof lint>, rule: string) => [...r.errors, ...r.warnings, ...r.info].find(f => f.rule === rule)?.fix;
  it('tells the writer how to fix revisit, exit, unreachable and dead-end findings', () => {
    const r = lintYaml([
      'start: hub',
      'nodes:',
      '  - id: hub', '    speaker: X', '    text: What else?',
      '    choices:', '      - text: Ask', '        to: hub', '      - text: Leave', '        to: bye', '        condition: done',
      '  - id: bye', '    speaker: X', '    text: Bye.', '    end: true',
      '  - id: orphan', '    speaker: X', '    text: Lost.',
    ].join('\n') + '\n');
    expect(fixOf(r, 'dialog.revisit.variety')).toBe('Add variants: (rotating lines), or gate the links here with conditions so the player sees it once.');
    expect(fixOf(r, 'dialog.graph.exit')).toBe('Add an unconditional choice or fallback that reaches an end: true node.');
    expect(fixOf(r, 'dialog.graph.unreachable')).toBe('Link to it from the start, or delete it.');
    expect(fixOf(r, 'dialog.graph.dead-end')).toBe('Add choices, a next node, or end: true.');
  });
});

describe('no-exit loops', () => {
  it('flags a hub whose only exit is conditional', () => {
    const issues = checkGraph({ ...base, start: 'hub', nodeLines: { hub: 1, ask: 2, bye: 3 }, nodeLineByIndex: [1, 2, 3], nodes: [
      { id: 'hub', speaker: 'X', text: 'What else?', variants: ['More?'], choices: [{ text: 'Ask', to: 'ask' }, { text: 'Leave', to: 'bye', condition: 'met_mayor' }, { text: 'Again', to: 'hub' }] },
      { id: 'ask', speaker: 'X', text: 'Answer.', variants: ['Well.'], next: 'hub' },
      { id: 'bye', speaker: 'X', text: 'Bye.', end: true },
    ] });
    expect(issues.filter(i => i.kind === 'no-exit')).toEqual([{ kind: 'no-exit', node: 'hub', line: 1 }]);
  });
  it('is quiet when an unconditional path reaches an end', () => {
    const issues = checkGraph({ ...base, start: 'a', nodeLines: { a: 1, b: 2 }, nodeLineByIndex: [1, 2], nodes: [
      { id: 'a', speaker: 'X', text: 'hi', next: 'b' },
      { id: 'b', speaker: 'X', text: 'bye', end: true },
    ] });
    expect(issues.filter(i => i.kind === 'no-exit')).toEqual([]);
  });
});
