import type { Block, Doc } from '../ir.ts';
import type { Form } from '../forms.ts';
import type { DialogGraph, DialogNode } from '../dialog-types.ts';
import { DIALOG_TEXT_KINDS } from '../kinds.ts';
import { round2, words, wrapCount } from '../text.ts';

export type DialogIssueKind = 'dangling' | 'duplicate-id' | 'unreachable' | 'dead-end' | 'no-fallback' | 'single-variant' | 'repeat-without-variants' | 'no-exit';
export interface DialogIssue { kind: DialogIssueKind; node?: string; pool?: string; to?: string; line: number }
export interface DialogStats {
  nodes: number; choices: number; barkPools: number; boxChars: number; boxLines: number;
  issues: DialogIssue[];
  overflow: Array<{ line: number; chars: number; lines: number; text: string }>;
  /**
   * Every pair of lines in a bark pool that shares at least one word (similarity > 0, which keeps the list bounded
   * by real overlap). `a`/`b` are source lines, `ai`/`bi` indexes into `doc.blocks`. The lint rule applies its threshold.
   */
  nearRepeats: NearRepeat[];
}
export interface NearRepeat { pool: string; a: number; b: number; ai: number; bi: number; similarity: number }

/** Distinct (lower-cased) words the two lines share, and the distinct words across both. */
export function wordOverlap(a: string, b: string): { shared: number; union: number } {
  const A = new Set(words(a).map(w => w.toLowerCase()));
  const B = new Set(words(b).map(w => w.toLowerCase()));
  return { shared: [...A].filter(w => B.has(w)).length, union: new Set([...A, ...B]).size };
}

export function jaccard(a: string, b: string): number {
  const { shared, union } = wordOverlap(a, b);
  return union ? shared / union : 0;
}

const targets = (n: DialogNode) => [...(n.choices ?? []).map(c => c.to), ...(n.next ? [n.next] : [])];

export function checkGraph(graph: Pick<DialogGraph, 'nodes' | 'barks' | 'nodeLines' | 'nodeLineByIndex' | 'barkLines' | 'start'>): DialogIssue[] {
  const issues: DialogIssue[] = [];
  // first-wins line per id; a duplicate reports its own line
  const ids = new Map<string, number>();
  graph.nodes.forEach((n, ni) => {
    if (ids.has(n.id)) issues.push({ kind: 'duplicate-id', node: n.id, line: graph.nodeLineByIndex[ni] ?? 1 });
    else ids.set(n.id, graph.nodeLines[n.id] ?? 1);
  });
  for (const n of graph.nodes) {
    const line = ids.get(n.id)!;
    for (const to of targets(n)) if (!ids.has(to)) issues.push({ kind: 'dangling', node: n.id, to, line });
    if (!n.choices?.length && !n.next && !n.end) issues.push({ kind: 'dead-end', node: n.id, line });
    if (n.choices?.length && n.choices.every(c => c.condition)) issues.push({ kind: 'no-fallback', node: n.id, line });
  }
  const start = graph.start ?? graph.nodes[0]?.id;
  if (start !== undefined && !ids.has(start)) issues.push({ kind: 'dangling', node: '(start)', to: start, line: 1 });
  if (start !== undefined && ids.has(start)) {
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const to of targets(byId.get(id)!)) if (ids.has(to)) queue.push(to);
    }
    for (const [id, line] of ids) if (!seen.has(id)) issues.push({ kind: 'unreachable', node: id, line });
  }
  // Incoming links by distinct source (two choices from one node count once; self-loops are left to the cycle check),
  // and whether any link into a node is unconditional: a node reached only through gated choices is seen once by design.
  const sources = new Map<string, Set<string>>();
  const openly = new Set<string>();
  for (const n of graph.nodes) {
    for (const c of n.choices ?? []) if (!c.condition) openly.add(c.to);
    if (n.next) openly.add(n.next);
    for (const to of targets(n)) if (to !== n.id) sources.set(to, (sources.get(to) ?? new Set()).add(n.id));
  }
  const incoming = new Map([...sources].map(([id, s]) => [id, s.size]));
  const byId2 = new Map(graph.nodes.map(n => [n.id, n]));
  const onCycle = (id: string): boolean => {
    const seen = new Set<string>();
    const stack = [...targets(byId2.get(id)!)];
    while (stack.length) {
      const x = stack.pop()!;
      if (x === id) return true;
      if (seen.has(x) || !byId2.has(x)) continue;
      seen.add(x);
      stack.push(...targets(byId2.get(x)!));
    }
    return false;
  };
  // An end node is exempt only when it has fewer than two incoming links.
  for (const n of graph.nodes) {
    if (!ids.has(n.id) || n.variants?.length || n.end && (incoming.get(n.id) ?? 0) < 2) continue;
    if (!openly.has(n.id)) continue;
    if ((incoming.get(n.id) ?? 0) >= 2 || onCycle(n.id)) issues.push({ kind: 'repeat-without-variants', node: n.id, line: ids.get(n.id)! });
  }
  if (start !== undefined && ids.has(start)) {
    // From the start, follow only unconditional edges; an ending must be reachable that way.
    const seen = new Set<string>();
    const stack = [start];
    let exit = false;
    while (stack.length && !exit) {
      const id = stack.pop()!;
      const n = byId2.get(id);
      if (seen.has(id) || !n) continue;
      seen.add(id);
      if (n.end) exit = true;
      stack.push(...(n.choices ?? []).filter(c => !c.condition).map(c => c.to), ...(n.next ? [n.next] : []));
    }
    if (!exit) issues.push({ kind: 'no-exit', node: start, line: ids.get(start)! });
  }
  for (const b of graph.barks) if (b.lines.length === 1) issues.push({ kind: 'single-variant', pool: b.pool, line: graph.barkLines[b.pool] ?? 1 });
  return issues;
}

export function measureDialog(doc: Doc, form: Form): DialogStats {
  const graph = doc.graph!;
  const boxChars = form.boxChars ?? 40;
  const boxLines = form.boxLines ?? 2;
  const overflow = doc.blocks
    .filter(b => DIALOG_TEXT_KINDS.has(b.kind))
    .map(b => ({ line: b.line, chars: b.text.length, lines: wrapCount(b.text, boxChars), text: b.text }))
    .filter(o => o.lines > boxLines);
  const pools = new Map<string, Array<{ b: Block; i: number }>>();
  doc.blocks.forEach((b, i) => {
    if (b.kind !== 'bark') return;
    const pool = String(b.meta?.pool);
    pools.set(pool, [...(pools.get(pool) ?? []), { b, i }]);
  });
  const nearRepeats: NearRepeat[] = [];
  for (const [pool, lines] of pools) {
    for (let x = 0; x < lines.length; x++) for (let y = x + 1; y < lines.length; y++) {
      const [p, q] = [lines[x], lines[y]];
      const similarity = jaccard(p.b.text, q.b.text);
      if (similarity > 0) nearRepeats.push({ pool, a: p.b.line, b: q.b.line, ai: p.i, bi: q.i, similarity: round2(similarity) });
    }
  }
  return {
    nodes: graph.nodes.length,
    choices: graph.nodes.reduce((n, x) => n + (x.choices?.length ?? 0), 0),
    barkPools: graph.barks.length,
    boxChars, boxLines,
    issues: checkGraph(graph),
    overflow, nearRepeats,
  };
}
