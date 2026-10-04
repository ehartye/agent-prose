// Spans: which source lines each unit of a draft occupies, and the line refs ("12" or "12-13") that name them. Pure: it
// parses, it never reads or writes a file, and it changes no IR. A unit is what the reading page shows as a unit
// (src/reading/units.ts), so a ref means the same thing to the owner's editor, to `prose lint` and to the page.
//
//   fountain  a block (scene, action, speech, parenthetical, transition, ...): its first line to its last contiguous line
//             before the next block. A speech spans its dialogue lines; the cue line above it is not part of the span.
//   markdown  prose: the block (paragraph, list item, step, quote, heading), because a sentence has no source position;
//             every sentence of a block shares its ref. Verse and lyric forms: one source line per unit.
//   dialog    the YAML scalar of a variant, choice, bark line or node text, widened to whole lines.
import { isNode, LineCounter, parseDocument } from 'yaml';
import { ProseError } from '../errors.ts';
import type { Block } from '../ir.ts';
import type { Format } from '../kinds.ts';
import { blockUnits, speakerPrefix } from '../reading/units.ts';

export interface UnitSpan {
  /** Position in the page's unit list (the `unit` a note carries). */
  index: number;
  /** Canonical ref: `start`, or `start-end` when the span covers more than one line. */
  ref: string;
  start: number;
  end: number;
  /** The unit as the page shows it, without its `NAME: ` prefix (see `speaker`). */
  text: string;
  speaker?: string;
}

/** The draft the way every parser sees it: BOM dropped, CRLF and lone CR made LF, so line numbers hold. */
export const normalizeDraft = (text: string): string => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

export const refOf = (start: number, end: number): string => (end > start ? `${start}-${end}` : String(start));

const blank = (l: string | undefined): boolean => l === undefined || l.trim() === '';

/** Last line (1-based) of the contiguous run that starts at `start`, never past `limit`. */
function runEnd(lines: string[], start: number, limit: number, stop: (line: string) => boolean, twoSpace: boolean): number {
  let end = start;
  while (end < limit) {
    const next = lines[end]; // 0-based index `end` is line end + 1
    if (blank(next) && !(twoSpace && next === '  ' && !blank(lines[end + 1]))) break;
    if (stop(next)) break;
    end++;
  }
  return end;
}

const FENCE_OR_RULE = /^\s*(?:```|~~~|-{3,}\s*$|\*{3,}\s*$|_{3,}\s*$|\|)/;

/** The YAML scalar ranges of a dialog draft, in the order parseDialog emits blocks, as [startLine, endLine]. */
function dialogRanges(source: string, blocks: Block[]): Array<[number, number]> | null {
  const lc = new LineCounter();
  const doc = parseDocument(source, { lineCounter: lc, prettyErrors: false });
  const data = doc.toJS() as { nodes?: Array<{ variants?: unknown[]; choices?: unknown[] }>; barks?: Array<{ lines?: unknown[] }> };
  const out: Array<[number, number]> = [];
  const add = (path: (string | number)[]) => {
    const node = doc.getIn(path, true);
    if (!isNode(node) || !node.range) { out.push([0, 0]); return; }
    const start = lc.linePos(node.range[0]).line;
    let e = node.range[1];
    while (e > node.range[0] && /\s/.test(source[e - 1])) e--;
    out.push([start, Math.max(start, lc.linePos(Math.max(node.range[0], e - 1)).line)]);
  };
  (data.nodes ?? []).forEach((n, ni) => {
    add(['nodes', ni, 'text']);
    (n.variants ?? []).forEach((_, k) => add(['nodes', ni, 'variants', k]));
    (n.choices ?? []).forEach((_, ci) => add(['nodes', ni, 'choices', ci, 'text']));
  });
  (data.barks ?? []).forEach((b, bi) => (b.lines ?? []).forEach((_, li) => add(['barks', bi, 'lines', li])));
  return out.length === blocks.length && out.every(r => r[0] > 0) ? out : null;
}

/**
 * Every unit of the draft with the source lines it occupies, in page order. `text` is the draft as read from disk (any line
 * endings, with or without BOM); `form` is the form id, which decides whether a Markdown draft is verse.
 */
export function unitSpans(text: string, format: Format, form?: string): UnitSpan[] {
  const source = normalizeDraft(text);
  const lines = source.split('\n');
  const { entries, all } = blockUnits(source, format, form);
  const starts = all.map(b => b.line).sort((a, b) => a - b);
  const nextStart = (b: Block): number => starts.find(s => s > b.line) ?? lines.length + 1;
  const ranges = format === 'dialog' ? dialogRanges(source, all) : null;
  const out: UnitSpan[] = [];
  for (const { block, units } of entries) {
    let start = block.line;
    let end = start;
    const limit = nextStart(block) - 1;
    if (ranges) [start, end] = ranges[all.indexOf(block)];
    else if (format === 'markdown') end = runEnd(lines, start, limit, l => FENCE_OR_RULE.test(l), false);
    else if (format === 'fountain') end = runEnd(lines, start, limit, () => false, true);
    const prefix = speakerPrefix(block);
    for (const u of units) {
      let s = start, e = end;
      if (u.at !== null && block.line + u.at <= end) s = e = block.line + u.at;
      out.push({
        index: out.length, ref: refOf(s, e), start: s, end: e,
        text: u.unit.startsWith(prefix) ? u.unit.slice(prefix.length) : u.unit,
        ...(prefix && block.speaker ? { speaker: block.speaker } : {}),
      });
    }
  }
  return out;
}

export interface LineRef { start: number; end: number }

/** A comma list of refs ("12", "12-13") as ranges. Anything else is E_USAGE: refs come from the command line. */
export function parseRefs(list: string, max = 20): LineRef[] {
  const parts = list.split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length === 0) throw new ProseError('E_USAGE', 'No line refs given', { hint: 'Name source lines of the draft, e.g. --lines 12 or --lines 12-13,20' });
  if (parts.length > max) throw new ProseError('E_USAGE', `At most ${max} line refs at once (got ${parts.length})`, { hint: 'Select fewer lines, or make a second set' });
  return parts.map(p => {
    const m = p.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new ProseError('E_USAGE', `"${p}" is not a line ref`, { hint: 'A ref is a source line number or an inclusive range: 12 or 12-13' });
    const start = Number(m[1]);
    const end = m[2] === undefined ? start : Number(m[2]);
    if (start < 1 || end < start) throw new ProseError('E_USAGE', `"${p}" is not a valid line range`, { hint: 'Lines count from 1, and a range runs from the smaller number to the larger' });
    return { start, end };
  });
}

/** The refs of the units, deduplicated and capped, for an error hint. */
export const unitRefs = (spans: UnitSpan[], cap = 20): string => {
  const refs = [...new Set(spans.map(s => s.ref))];
  return `Units: ${refs.slice(0, cap).join(', ')}${refs.length > cap ? ', ...' : ''}`;
};

/**
 * The spans a ref list names: every unit whose lines overlap a ref (so `12` inside a span selects that span), in draft
 * order. A ref that overlaps no unit is E_USAGE listing the refs that exist.
 */
export function selectSpans(spans: UnitSpan[], refs: LineRef[]): UnitSpan[] {
  const picked = new Set<number>();
  for (const r of refs) {
    const hit = spans.filter(s => s.start <= r.end && s.end >= r.start);
    if (hit.length === 0) {
      throw new ProseError('E_USAGE', `${refOf(r.start, r.end)} is not a line of the draft that holds text`, { hint: spans.length ? unitRefs(spans) : 'The draft has no lines to select' });
    }
    hit.forEach(s => picked.add(s.index));
  }
  return spans.filter(s => picked.has(s.index));
}
