import { isNode, LineCounter, parseDocument } from 'yaml';
import type { Block } from '../ir.ts';
import { ProseError } from '../errors.ts';
import { DialogSchema, type DialogGraph } from '../dialog-types.ts';
import { splitSpeaker } from '../text.ts';

export interface ParsedDialog { meta: Record<string, unknown>; blocks: Block[]; graph: DialogGraph }

export function parseDialog(source: string): ParsedDialog {
  // loadDocument already normalizes; direct callers may pass raw CRLF or CR-only text.
  source = source.replace(/\r\n?/g, '\n');
  const lineCounter = new LineCounter();
  const document = parseDocument(source, { lineCounter, prettyErrors: false });
  if (document.errors.length) {
    const e = document.errors[0];
    throw new ProseError('E_PARSE', `Dialog YAML: ${e.message}`, { details: { line: lineCounter.linePos(e.pos[0]).line } });
  }
  /** Line of the deepest existing node on `path` (a missing key reports its parent's line). */
  const lineAt = (path: (string | number)[]): number => {
    for (let n = path.length; n >= 0; n--) {
      const node = document.getIn(path.slice(0, n), true);
      if (isNode(node) && node.range) return lineCounter.linePos(node.range[0]).line;
    }
    return 1;
  };
  const result = DialogSchema.safeParse(document.toJS());
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path as (string | number)[];
    throw new ProseError('E_SCHEMA', issue.message, { pointer: '/' + path.join('/'), details: { line: lineAt(path) } });
  }
  const g = result.data;
  const blocks: Block[] = [];
  // "GRIMBLE (O.S.)" speaks as GRIMBLE, as in Fountain; the extension stays in meta.
  const who = (raw: string) => { const { name, extension } = splitSpeaker(raw); return { speaker: name || raw, ext: extension ? { extension } : {} }; };
  g.nodes.forEach((n, ni) => {
    const { speaker, ext } = who(n.speaker);
    blocks.push({ kind: 'line', text: n.text, line: lineAt(['nodes', ni, 'text']), speaker, meta: { node: n.id, ...ext } });
    (n.variants ?? []).forEach((text, k) => blocks.push({
      kind: 'line', text, line: lineAt(['nodes', ni, 'variants', k]), speaker, meta: { node: n.id, variant: k + 1, ...ext },
    }));
    (n.choices ?? []).forEach((c, ci) => blocks.push({
      kind: 'choice', text: c.text, line: lineAt(['nodes', ni, 'choices', ci, 'text']),
      meta: { node: n.id, to: c.to, ...(c.condition ? { condition: c.condition } : {}) },
    }));
  });
  g.barks.forEach((b, bi) => {
    const { speaker, ext } = who(b.speaker);
    b.lines.forEach((text, li) => blocks.push({
      kind: 'bark', text, line: lineAt(['barks', bi, 'lines', li]), speaker, meta: { pool: b.pool, context: b.context, ...ext },
    }));
  });
  const nodeLineByIndex = g.nodes.map((_, ni) => lineAt(['nodes', ni]));
  // first-wins: a duplicate id or pool keeps the line of its first definition
  const nodeLines: Record<string, number> = {};
  g.nodes.forEach((n, ni) => { if (!Object.hasOwn(nodeLines, n.id)) nodeLines[n.id] = nodeLineByIndex[ni]; });
  const barkLines: Record<string, number> = {};
  g.barks.forEach((b, bi) => { if (!Object.hasOwn(barkLines, b.pool)) barkLines[b.pool] = lineAt(['barks', bi]); });
  const graph: DialogGraph = { ...g, nodeLines, nodeLineByIndex, barkLines };
  const meta = { ...(g.form ? { form: g.form } : {}), ...(g.register ? { register: g.register } : {}), ...(g.target !== undefined ? { target: g.target } : {}), ...(g.wpm !== undefined ? { wpm: g.wpm } : {}) };
  return { meta, blocks, graph };
}
