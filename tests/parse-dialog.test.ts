import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDialog } from '../src/parse/dialog.ts';
import { ProseError } from '../src/errors.ts';
import { fixture } from './helpers.ts';

describe('parseDialog', () => {
  const parsed = parseDialog(readFileSync(fixture('gate.dialog.yaml'), 'utf8'));

  it('reads form and start', () => {
    expect(parsed.meta).toEqual({ form: 'quest-dialog' });
    expect(parsed.graph.start).toBe('gate');
  });

  it('emits line, choice and bark blocks with YAML line numbers', () => {
    expect(parsed.blocks.slice(0, 3)).toEqual([
      { kind: 'line', text: expect.stringMatching(/^Halt\./), line: 6, speaker: 'GUARD', meta: { node: 'gate' } },
      { kind: 'choice', text: "I'm here to trade.", line: 8, meta: { node: 'gate', to: 'trade' } },
      { kind: 'choice', text: 'Just passing through.', line: 10, meta: { node: 'gate', to: 'passing', condition: 'has_pass' } },
    ]);
    expect(parsed.blocks.filter(b => b.kind === 'bark').map(b => [b.line, b.meta?.pool])).toEqual([
      [33, 'guard-idle'], [34, 'guard-idle'], [39, 'guard-alarm'],
    ]);
  });

  it('records node and bark-pool lines', () => {
    expect(parsed.graph.nodeLines).toEqual({ gate: 4, trade: 13, passing: 17, orphan: 20, lost: 24 });
    expect(parsed.graph.barkLines).toEqual({ 'guard-idle': 29, 'guard-alarm': 35 });
  });

  it('reports schema errors with a pointer and line', () => {
    try { parseDialog('nodes:\n  - id: a\n    speaker: X\n'); expect.unreachable(); }
    catch (e) {
      const err = e as ProseError;
      expect(err.code).toBe('E_SCHEMA');
      expect(err.pointer).toBe('/nodes/0/text');
      expect(err.details.line).toBe(2);
    }
  });

  it('reports YAML syntax errors as E_PARSE', () => {
    expect(() => parseDialog('nodes: [\n')).toThrow(ProseError);
  });

  it('keeps the first node and bark pool line for duplicate ids', () => {
    const src = [
      'nodes:',
      '  - id: a', '    speaker: X', '    text: one', '    end: true',
      '  - id: a', '    speaker: X', '    text: two', '    end: true',
      'barks:',
      '  - pool: p', '    speaker: X', '    context: c', '    lines: [hi]',
      '  - pool: p', '    speaker: X', '    context: c', '    lines: [yo]',
    ].join('\n');
    const g = parseDialog(src).graph;
    expect(g.nodeLines.a).toBe(2);
    expect(g.barkLines.p).toBe(11);
  });

  it('reads CR-only line endings with true line numbers when called directly', () => {
    const g = parseDialog(['nodes:', '  - id: a', '    speaker: X', '    text: hi', '    end: true', ''].join('\r'));
    expect(g.blocks.map(b => [b.text, b.line])).toEqual([['hi', 4]]);
    expect(g.graph.nodeLines.a).toBe(2);
  });
});
