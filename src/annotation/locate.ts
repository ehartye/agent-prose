import { createHash } from 'node:crypto';
import { ProseError } from '../errors.ts';
import type { Projection } from './projection-types.ts';

export interface TargetSelector {
  quote?: string; prefix?: string; suffix?: string; fragment?: string; block?: string; blocks?: string[]; start?: number; end?: number;
  binding?: { sourceDigest: string; projectionDigest: string };
}
export interface Candidate { id: string; quote: string; prefix: string; suffix: string; start: number; end: number; blockId: string; sourceDigest: string; projectionDigest: string }
export interface Resolution { status: 'exact' | 'relocated' | 'ambiguous' | 'missing' | 'source-changed' | 'unsupported'; range?: { start: number; end: number }; candidates: Candidate[]; message?: string }
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const changed = (p: Projection, s: TargetSelector): boolean => !!s.binding && (s.binding.sourceDigest !== p.sourceDigest || s.binding.projectionDigest !== p.digest);
interface TextIndex { text: string; chars: string[]; codePoints: Int32Array; boundaries: Set<number> }
const indexes = new WeakMap<Projection, TextIndex>();
function textIndex(p: Projection): TextIndex {
  const cached = indexes.get(p); if (cached?.text === p.text) return cached;
  const chars = Array.from(p.text), codePoints = new Int32Array(p.text.length + 1).fill(-1);
  let offset = 0;
  chars.forEach((char, index) => { codePoints[offset] = index; offset += char.length; });
  codePoints[offset] = chars.length;
  const boundaries = new Set<number>([0, chars.length]);
  for (const part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(p.text)) boundaries.add(codePoints[part.index]);
  const prepared = { text: p.text, chars, codePoints, boundaries }; indexes.set(p, prepared); return prepared;
}
const slice = (p: Projection, start: number, end?: number): string => textIndex(p).chars.slice(start, end).join('');
function validRange(p: Projection, start: number, end: number): boolean {
  const index = textIndex(p);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end > start && end <= index.chars.length && index.boundaries.has(start) && index.boundaries.has(end) && !(p.barriers ?? []).some(gap => start < gap.end && end > gap.start);
}
function candidate(p: Projection, start: number, end: number): Candidate {
  const payload = `${p.documentId}:${p.sourceDigest}:${p.digest}:${start}:${end}`;
  return {
    id: `pc1.${start}.${end}.${digest(payload)}`, quote: slice(p, start, end),
    prefix: slice(p, Math.max(0, start - 40), start), suffix: slice(p, end, end + 40), start, end,
    blockId: p.blocks.find(b => start >= b.start && start < b.end)?.id ?? '', sourceDigest: p.sourceDigest, projectionDigest: p.digest,
  };
}
interface Located { candidates: Candidate[]; unsupported: boolean }
function locate(p: Projection, s: TargetSelector): Located {
  const candidates: Candidate[] = []; let unsupported = false;
  const ranges: Array<{ start: number; end: number }> = [];
  if (s.fragment !== undefined) {
    const fragment = Object.hasOwn(p.fragments, s.fragment) ? p.fragments[s.fragment] : undefined; if (fragment) ranges.push(fragment);
  } else if (s.start !== undefined && s.end !== undefined && !changed(p, s)) ranges.push({ start: s.start, end: s.end });
  else if (s.quote !== undefined) {
    if (!s.quote) return { candidates: [], unsupported: false };
    let from = 0; const indexMap = textIndex(p).codePoints, length = Array.from(s.quote).length;
    while (from <= p.text.length) {
      const index = p.text.indexOf(s.quote, from); if (index < 0) break;
      const start = indexMap[index];
      // A match beginning inside a surrogate pair is never a valid code-point range.
      if (start >= 0) ranges.push({ start, end: start + length }); else unsupported = true;
      from = index + Math.max(1, String.fromCodePoint(p.text.codePointAt(index)!).length);
    }
  } else if (s.block !== undefined) { const block = p.blocks.find(b => b.id === s.block); if (block) ranges.push({ start: block.start, end: block.end }); }
  for (const { start, end } of ranges) {
    if (!validRange(p, start, end)) { unsupported = true; continue; }
    const quote = slice(p, start, end);
    if (s.quote !== undefined && s.quote !== quote) continue;
    if (s.block !== undefined) { const block = p.blocks.find(b => b.id === s.block); if (!block || start < block.start || end > block.end) continue; }
    if (s.blocks !== undefined) { const ids=p.blocks.filter(b=>b.start<end&&b.end>start).map(b=>b.id); if(ids.length!==s.blocks.length||ids.some((id,i)=>id!==s.blocks![i]))continue; }
    if (s.prefix !== undefined && !slice(p, Math.max(0, start - Array.from(s.prefix).length), start).endsWith(s.prefix)) continue;
    if (s.suffix !== undefined && !slice(p, end, end + Array.from(s.suffix).length).startsWith(s.suffix)) continue;
    // Positions in a current binding are assertions. In an old snapshot they are historical evidence only.
    if (!changed(p, s) && ((s.start !== undefined && s.start !== start) || (s.end !== undefined && s.end !== end))) continue;
    candidates.push(candidate(p, start, end));
  }
  return { candidates, unsupported };
}
export function locateCandidates(projection: Projection, selector: TargetSelector): Candidate[] { return locate(projection, selector).candidates; }
export function resolveTarget(p: Projection, s: TargetSelector): Resolution {
  const result = locate(p, s);
  if (result.candidates.length > 1) return { status: 'ambiguous', candidates: result.candidates, message: 'Several exact occurrences match; choose an occurrence explicitly' };
  if (result.candidates.length === 1) {
    const { start, end } = result.candidates[0];
    return { status: changed(p, s) ? 'source-changed' : 'exact', range: { start, end }, candidates: result.candidates, ...(changed(p, s) ? { message: 'Source binding changed; exact occurrence requires dependency revalidation' } : {}) };
  }
  if (result.unsupported) return { status: 'unsupported', candidates: [], message: 'Target crosses an excluded region, invalid boundary or grapheme interior' };
  if (changed(p, s)) return { status: 'source-changed', candidates: [], message: 'Historical source binding cannot resolve to an exact current occurrence' };
  return { status: 'missing', candidates: [], message: 'Selectors do not agree on a current exact occurrence' };
}
export function candidateFromId(p: Projection, id: string): Candidate {
  const match = /^pc1\.(\d+)\.(\d+)\.([a-f0-9]{64})$/.exec(id);
  if (!match) throw new ProseError('E_SCHEMA', 'Invalid annotation candidate ID');
  const start = Number(match[1]); const end = Number(match[2]);
  if (!validRange(p, start, end) || candidate(p, start, end).id !== id) throw new ProseError('E_CONFLICT', 'Stale candidate ID or source snapshot mismatch');
  return candidate(p, start, end);
}
