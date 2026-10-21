import { createHash } from 'node:crypto';
import MarkdownIt from 'markdown-it';
import { parse, parseFragment } from 'parse5';
import { EntityDecoder, DecodingMode, htmlDecodeTree } from 'entities/decode';
import type { DefaultTreeAdapterMap } from 'parse5';
import { ProseError } from '../errors.ts';
import type { Projection, ProjectionBlock, ProjectionRun, SourceProfile } from './projection-types.ts';
export type { Projection, ProjectionBlock, ProjectionRun, SourceProfile } from './projection-types.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (message: string): never => { throw new ProseError('E_PARSE', message); };
export const codePointSlice = (text: string, start: number, end?: number): string => [...text].slice(start, end).join('');
export function codePointToUtf16(text: string, offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > [...text].length) return fail('Code-point boundary is outside the source');
  return [...text].slice(0, offset).join('').length;
}
export function utf16ToCodePoint(text: string, offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length || (offset > 0 && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset] ?? ''))) return fail('Invalid UTF-16 boundary');
  return [...text.slice(0, offset)].length;
}
type Mark = 'strong' | 'em';
interface Unit { text: string; from: number; to: number; marks?: Mark[]; href?: string; hard?: boolean; excluded?: string; fragments?: string[]; field?: string }
interface BlockContext { headingPath?: string[]; level?: number; listDepth?: number; listType?: 'ordered' | 'unordered'; listStart?: number; listItem?: string }
interface ListContext { listType: 'ordered' | 'unordered'; listStart?: number }
const units = (text: string, from: number, to?: number, props: Partial<Unit> = {}): Unit[] => {
  const result: Unit[] = []; let position = from;
  for (const cp of text) { result.push({ text: cp, from: to === undefined ? position : from, to: to === undefined ? position + cp.length : to, ...props }); position += cp.length; }
  return result;
};
class Builder {
  readonly p: Projection; private headings: string[] = []; private ids = new Set<string>();
  readonly raw: string;
  private readonly byteOffsets: number[];
  private pointLength = 0;
  constructor(raw: string, profile: SourceProfile, documentId: string) {
    this.raw = raw;
    this.byteOffsets = new Array<number>(raw.length + 1); let utf16 = 0; let bytes = 0;
    for (const cp of raw) { this.byteOffsets[utf16] = bytes; if (cp.length === 2) this.byteOffsets[utf16 + 1] = bytes; utf16 += cp.length; bytes += Buffer.byteLength(cp); }
    this.byteOffsets[utf16] = bytes;
    this.p = { schema: 'prose/projection@1', projectionVersion: 'prose/annotation-text@1', profile, documentId, sourceDigest: hash(raw), digest: '', text: '', language: 'und', blocks: [], fragments: Object.create(null) as Projection['fragments'], diagnostics: [], barriers: [], sourceMap: [] };
  }
  declareFragment(id: string): void { if (!id || this.ids.has(id)) fail(`Duplicate or empty source fragment ID: ${id}`); this.ids.add(id); }
  add(id: string, kind: string, input: Unit[], context: BlockContext = {}): void {
    if (this.p.blocks.some(b => b.id === id)) fail(`Duplicate block ID: ${id}`);
    const normalized: Unit[] = [];
    for (const u of input) {
      if (/^[\t\n\r\f ]$/.test(u.text) && !u.hard) {
        if (!normalized.length || normalized.at(-1)?.text === '\n') continue;
        if (normalized.at(-1)?.text === ' ' && !normalized.at(-1)?.hard) { const prev = normalized.at(-1)!; prev.to = u.to; prev.fragments = [...new Set([...(prev.fragments ?? []), ...(u.fragments ?? [])])]; continue; }
        normalized.push({ ...u, text: ' ' });
      } else {
        if (u.hard && normalized.at(-1)?.text === ' ') normalized.pop();
        normalized.push(u);
      }
    }
    while (normalized.at(-1)?.text === ' ' && !normalized.at(-1)?.hard) normalized.pop();
    if (!normalized.length) return;
    if (this.p.blocks.length) { this.p.text += '\n'; this.pointLength++; }
    const start = this.pointLength; const text = normalized.map(u => u.text).join(''); const runs: ProjectionRun[] = [];
    for (let n = 0; n < normalized.length; n++) {
      const u = normalized[n]; const at = start + n; const prev = runs.at(-1);
      const marks = u.marks?.length ? [...new Set(u.marks)].sort() as Mark[] : undefined;
      if (prev && JSON.stringify(prev.marks) === JSON.stringify(marks) && prev.href === u.href) { prev.text += u.text; prev.end = at + 1; }
      else runs.push({ text: u.text, start: at, end: at + 1, ...(marks ? { marks } : {}), ...(u.href ? { href: u.href } : {}) });
      this.p.sourceMap!.push({ start: at, end: at + 1, sourceStart: u.from, sourceEnd: u.to, utf16Start: u.from, utf16End: u.to, byteStart: this.byteOffsets[u.from], byteEnd: this.byteOffsets[u.to], ...(u.field ? { field: u.field } : {}) });
      if (u.excluded) {
        this.p.barriers!.push({ start: at, end: at + 1, reason: u.excluded });
        this.p.diagnostics.push({ code: 'excluded-region', message: `Excluded ${u.excluded}`, start: at, end: at + 1, blockId: id });
      }
      for (const fragment of u.fragments ?? []) {
        const old = this.p.fragments[fragment]; this.p.fragments[fragment] = { start: old?.start ?? at, end: at + 1 };
      }
    }
    const block: ProjectionBlock = { id, kind, start, end: start + normalized.length, text, runs, headingPath: context.headingPath ?? [...this.headings], ...(context.level ? { level: context.level } : {}), ...(context.listDepth ? { listDepth: context.listDepth } : {}), ...(context.listType ? { listType: context.listType } : {}), ...(context.listStart !== undefined ? { listStart: context.listStart } : {}), ...(context.listItem ? { listItem: context.listItem } : {}) };
    this.p.blocks.push(block); this.p.text += text; this.pointLength += normalized.length;
    if (kind === 'heading') { const level = context.level ?? 1; this.headings = this.headings.slice(0, level - 1); this.headings.push(text); }
  }
  finish(): Projection {
    this.p.digest = hash(JSON.stringify({ schema: this.p.schema, projectionVersion: this.p.projectionVersion, profile: this.p.profile, adapter: this.p.adapter, language: this.p.language, direction: this.p.direction, text: this.p.text, blocks: this.p.blocks, fragments: this.p.fragments, barriers: this.p.barriers }));
    return this.p;
  }
}

type HtmlNode = DefaultTreeAdapterMap['node'];
const children = (node: HtmlNode): HtmlNode[] => 'childNodes' in node ? node.childNodes : [];
const attr = (node: HtmlNode, name: string): string | undefined => 'attrs' in node ? node.attrs.find(a => a.name === name)?.value : undefined;
const tag = (node: HtmlNode): string => 'tagName' in node ? node.tagName : '';
const textValue = (node: HtmlNode): string => 'value' in node ? node.value : '';
const htmlBlocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);
const htmlContainers = new Set(['html', 'body', 'main', 'article', 'section', 'div', 'header', 'footer', 'nav', 'aside', 'ul', 'ol', 'details', 'summary']);
const htmlInline = new Set(['span', 'strong', 'b', 'em', 'i', 'a', 'mark', 'dfn', 'abbr', 'small', 'sup', 'sub', 's', 'u', 'br']);
const invisible = new Set(['script', 'style', 'template', 'head', 'noscript']);
function decodedHtmlUnits(raw: string, start: number, end: number, expected: string, props: Partial<Unit>): Unit[] {
  const output: Unit[] = []; let position = start;
  while (position < end) {
    if (raw[position] === '&') {
      // The same HTML entity algorithm exposes consumed lengths, including legacy and two-code-point entities.
      const decoded: Array<{ cp: number; consumed: number }> = [];
      const decoder = new EntityDecoder(htmlDecodeTree, (cp, consumed) => decoded.push({ cp, consumed })); decoder.startEntity(DecodingMode.Legacy);
      let consumed = decoder.write(raw.slice(0, end), position + 1); if (consumed < 0) consumed = decoder.end();
      if (consumed > 0) { for (const value of decoded) output.push(...units(String.fromCodePoint(value.cp), position, position + value.consumed, props)); position += consumed; continue; }
    }
    if (raw[position] === '\r') { const length = raw[position + 1] === '\n' ? 2 : 1; output.push(...units('\n', position, position + length, props)); position += length; continue; }
    const cp = String.fromCodePoint(raw.codePointAt(position)!); output.push(...units(cp === '\0' ? '�' : cp, position, position + cp.length, props)); position += cp.length;
  }
  if (output.map(u => u.text).join('') !== expected) fail('Unsupported HTML text/source mapping; no location was guessed');
  return output;
}
function projectHtml(builder: Builder, contentRoot = 'body'): void {
  const root = parse(builder.raw, { sourceCodeLocationInfo: true }); const all: HtmlNode[] = [];
  const collect = (n: HtmlNode): void => { all.push(n); for (const c of children(n)) collect(c); }; collect(root);
  const selected = all.filter(n => contentRoot.startsWith('#') ? attr(n, 'id') === contentRoot.slice(1) : tag(n) === contentRoot);
  if (selected.length !== 1) fail('HTML content root must select exactly one tag or #id');
  let languageFound = false;
  for (let node: HtmlNode | null = selected[0]; node; node = 'parentNode' in node ? node.parentNode : null) {
    const language = attr(node, 'lang'); const direction = attr(node, 'dir')?.toLowerCase();
    // An explicitly empty lang means unknown, rather than inheriting an ancestor's declaration.
    if (!languageFound && language !== undefined) { builder.p.language = language.trim() ? language : 'und'; languageFound = true; }
    if (!builder.p.direction && (direction === 'ltr' || direction === 'rtl' || direction === 'auto')) builder.p.direction = direction;
  }
  for (const n of all) { const id = attr(n, 'id'); if (id !== undefined) builder.declareFragment(id); }
  const exclusion = (n: HtmlNode): string | undefined => invisible.has(tag(n)) || attr(n, 'hidden') !== undefined || attr(n, 'aria-hidden') === 'true' || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(n, 'style') ?? '') ? `hidden ${tag(n)}` : undefined;
  const walkInline = (n: HtmlNode, props: Partial<Unit> = {}): Unit[] => {
    const name = tag(n); const location = n.sourceCodeLocation;
    if (n.nodeName === '#text') {
      if (!location) return [];
      return decodedHtmlUnits(builder.raw, location.startOffset, location.endOffset, textValue(n), props);
    }
    if (n.nodeName === '#comment') return [];
    const reason = exclusion(n) ?? (!htmlInline.has(name) && !htmlBlocks.has(name) && !htmlContainers.has(name) ? name || 'unsupported node' : undefined);
    if (reason) return [{ text: '\uFFFC', from: location?.startOffset ?? 0, to: location?.endOffset ?? 0, excluded: reason }];
    const marks = [...(props.marks ?? [])]; if (['strong', 'b'].includes(name)) marks.push('strong'); if (['em', 'i'].includes(name)) marks.push('em');
    const id = attr(n, 'id'); const next = { ...props, marks, ...(name === 'a' && attr(n, 'href') ? { href: attr(n, 'href') } : {}), fragments: [...(props.fragments ?? []), ...(id ? [id] : [])] };
    if (name === 'br') return [{ text: '\n', from: location?.startOffset ?? 0, to: location?.endOffset ?? 0, hard: true, ...next }];
    return children(n).flatMap(c => walkInline(c, next));
  };
  let ordinal = 0;
  const itemIds = new Map<HtmlNode, string>(all.filter(n => tag(n) === 'li').map((n, index) => [n, `html-item-${index + 1}`]));
  const htmlListContext = (n: HtmlNode): ListContext => {
    if (tag(n) === 'ul') return { listType: 'unordered' };
    if (attr(n, 'reversed') !== undefined || (attr(n, 'type') !== undefined && attr(n, 'type') !== '1')) fail('Unsupported HTML list numbering: reversed or nonnumeric marker type');
    const start = attr(n, 'start');
    if (start !== undefined && (!/^[+-]?\d+$/.test(start.trim()) || !Number.isSafeInteger(Number(start)))) fail('Unsupported HTML list start value');
    return { listType: 'ordered', listStart: start === undefined ? 1 : Number(start) };
  };
  const visit = (n: HtmlNode, ancestors: string[] = [], listDepth = 0, inListItem = false, inheritedList?: ListContext, inheritedItemId?: string): void => {
    const name = tag(n); const reason = exclusion(n);
    if (reason) { builder.add(`html-${++ordinal}`, 'excluded', walkInline(n, { fragments: ancestors })); return; }
    if (name === 'li' && attr(n, 'value') !== undefined) fail('Unsupported HTML list item numbering reset');
    const ownId = attr(n, 'id'); const fragments = [...ancestors, ...(ownId ? [ownId] : [])];
    const depth = listDepth + (['ul', 'ol'].includes(name) ? 1 : 0); const insideItem = inListItem || name === 'li';
    const list = ['ul', 'ol'].includes(name) ? htmlListContext(n) : inheritedList;
    const listItem = name === 'li' ? itemIds.get(n) : inheritedItemId;
    const listContext: BlockContext = insideItem ? { listDepth: Math.max(1, depth), ...(list ?? { listType: 'unordered' }), ...(listItem ? { listItem } : {}) } : {};
    if (htmlBlocks.has(name) && !children(n).some(c => htmlBlocks.has(tag(c)) || htmlContainers.has(tag(c)))) {
      builder.add(ownId ?? `html-${++ordinal}`, /^h[1-6]$/.test(name) ? 'heading' : insideItem ? 'list-item' : name === 'blockquote' ? 'blockquote' : 'paragraph', walkInline(n, { fragments: ancestors }), { ...(/^h/.test(name) ? { level: Number(name[1]) } : {}), ...listContext }); return;
    }
    if (htmlContainers.has(name) || htmlBlocks.has(name) || n === selected[0]) {
      let pending: HtmlNode[] = [];
      const flush = (): void => { if (pending.length) builder.add(`html-${++ordinal}`, insideItem ? 'list-item' : name === 'blockquote' ? 'blockquote' : 'paragraph', pending.flatMap(c => walkInline(c, { fragments })), listContext); pending = []; };
      for (const child of children(n)) {
        if (htmlBlocks.has(tag(child)) || htmlContainers.has(tag(child)) || exclusion(child)) { flush(); visit(child, fragments, depth, insideItem, list, listItem); }
        else pending.push(child);
      }
      flush(); return;
    }
    builder.add(`html-${++ordinal}`, 'excluded', walkInline(n, { fragments: ancestors }));
  };
  const inheritedLists: HtmlNode[] = []; let inheritedItem = false; let inheritedItemId: string | undefined;
  const firstParent = 'parentNode' in selected[0] ? selected[0].parentNode : null;
  for (let node: HtmlNode | null = firstParent; node; node = 'parentNode' in node ? node.parentNode : null) { if (['ol', 'ul'].includes(tag(node))) inheritedLists.push(node); if (tag(node) === 'li') { inheritedItem = true; inheritedItemId ??= itemIds.get(node); if (attr(node, 'value') !== undefined) fail('Unsupported HTML list item numbering reset'); } }
  for (const list of inheritedLists) htmlListContext(list);
  visit(selected[0], [], inheritedLists.length, inheritedItem, inheritedLists.length ? htmlListContext(inheritedLists[0]) : undefined, inheritedItemId);
}

// Token source instrumentation is local to this parser instance; markdown-it still owns syntax recognition.
// `any` is confined to its mutable inline State API, which lacks public extension metadata types.
function mappedMarkdownParser(): InstanceType<typeof MarkdownIt> {
  const md = new MarkdownIt('commonmark', { html: true });
  const parser = md.inline as any;
  const Base = parser.State;
  parser.State = class extends Base {
    pendingMap: Array<[number, number]> = [];
    pushPending(): any {
      const pending = this.pending; const token = super.pushPending();
      token.meta = { ...(token.meta ?? {}), sourceUnits: this.pendingMap.slice(0, [...pending].length) };
      this.pendingMap = []; return token;
    }
  };
  parser.tokenize = function (state: any): void {
    const rules = this.ruler.getRules(''); const end = state.posMax;
    while (state.pos < end) {
      const before = state.pos; let ok = false;
      for (const rule of rules) {
        const count = state.tokens.length; const pending = state.pending;
        if (state.level >= md.options.maxNesting) break;
        if (!rule(state, false)) continue;
        ok = true;
        if (state.pos <= before) fail('Markdown inline parser did not advance');
        if (state.pending.length > pending.length && state.pending.startsWith(pending)) {
          const added = state.pending.slice(pending.length); let at = before;
          for (const cp of added) { state.pendingMap.push([at, at + cp.length]); at += cp.length; }
        } else if (state.pending.length < pending.length && pending.startsWith(state.pending)) state.pendingMap.length = [...state.pending].length;
        const added = state.tokens.slice(count);
        let delimiter = before;
        for (const token of added) {
          if (token.meta?.sourceUnits || token.meta?.sourceRange) continue;
          if (token.type === 'text' && added.some((t: any) => t.type === 'link_open' && t.markup === 'autolink')) {
            if (state.src.slice(before + 1, state.pos - 1) !== token.content) fail('Unsupported autolink display normalization/source map');
            let position = before + 1; const sourceUnits: Array<[number, number]> = [];
            for (const cp of token.content) { sourceUnits.push([position, position + cp.length]); position += cp.length; }
            token.meta = { sourceUnits };
          }
          else if (token.type === 'text' && token.content.length === 1 && /[*_]/.test(token.content)) { token.meta = { sourceUnits: [[delimiter, ++delimiter]] }; }
          else token.meta = { ...(token.meta ?? {}), sourceRange: [before, state.pos] };
        }
        break;
      }
      if (!ok) { state.pending += state.src[state.pos]; state.pendingMap.push([state.pos, state.pos + 1]); state.pos++; }
    }
    if (state.pending) state.pushPending();
  };
  md.inline.ruler.before('link', 'prose_span', (state: any, silent: boolean): boolean => {
    if (state.src[state.pos] !== '[') return false;
    const end = state.md.helpers.parseLinkLabel(state, state.pos, false); if (end < 0) return false;
    const match = state.src.slice(end + 1).match(/^\{#([A-Za-z][\w:.-]*)\}/); if (!match) return false;
    if (silent) return false;
    const max = state.posMax; const start = state.pos;
    state.push('prose_span_open', 'span', 1).meta = { fragment: match[1], sourceRange: [start, start + 1] };
    state.pos = start + 1; state.posMax = end; state.md.inline.tokenize(state);
    state.push('prose_span_close', 'span', -1).meta = { fragment: match[1], sourceRange: [end, end + match[0].length + 1] };
    state.pos = end + match[0].length + 1; state.posMax = max; return true;
  });
  // Joining text destroys per-token source maps. The rendering projection performs its own coalescing.
  md.core.ruler.disable('text_join'); md.inline.ruler2.disable('fragments_join');
  return md;
}
function projectMarkdown(builder: Builder): void {
  const lines: Array<{ text: string; offset: number }> = []; let offset = 0;
  for (const match of builder.raw.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) { if (!match[0] && offset === builder.raw.length) break; lines.push({ text: match[0].replace(/[\r\n]+$/, ''), offset }); offset += match[0].length; }
  let markdown = builder.raw;
  if (lines[0]?.text.replace(/^\uFEFF/, '').trim() === '---') {
    const closing = lines.findIndex((line, index) => index > 0 && /^---[\t ]*$/.test(line.text));
    if (closing < 0) fail('Frontmatter opened on line 1 is never closed with ---');
    const end = lines[closing + 1]?.offset ?? builder.raw.length;
    // Hide authoring metadata before parsing, retaining every raw offset and line boundary.
    markdown = builder.raw.slice(0, end).replace(/[^\r\n]/g, ' ') + builder.raw.slice(end);
  }
  const md = mappedMarkdownParser(); const env = {}; const tokens = md.parse(markdown, env);
  const stack: string[] = []; const lists: ListContext[] = []; const items: string[] = []; let headingLevel = 1; let ordinal = 0; let itemOrdinal = 0;
  for (const token of tokens) {
    if (token.nesting === 1) { stack.push(token.type); if (token.type === 'heading_open') headingLevel = Number(token.tag[1]); if (token.type === 'ordered_list_open') lists.push({ listType: 'ordered', listStart: Number(token.attrGet('start') ?? 1) }); else if (token.type === 'bullet_list_open') lists.push({ listType: 'unordered' }); if (token.type === 'list_item_open') items.push(`markdown-item-${++itemOrdinal}`); continue; }
    if (token.nesting === -1) { stack.pop(); if (token.type === 'ordered_list_close' || token.type === 'bullet_list_close') lists.pop(); if (token.type === 'list_item_close') items.pop(); continue; }
    if (token.type === 'html_block') {
      const from = lines[token.map?.[0] ?? 0]?.offset ?? 0; const to = lines[token.map?.[1] ?? 0]?.offset ?? builder.raw.length;
      const htmlRaw = builder.raw.slice(from, to);
      // Quoted/list-prefixed HTML needs a composed source map rather than guessed line offsets.
      if (htmlRaw.replace(/\r\n?/g, '\n').trim() === token.content.trim()) {
        const nested = new Builder(htmlRaw, 'html', builder.p.documentId); projectHtml(nested); const projection = nested.finish();
        for (const id of Object.keys(projection.fragments)) builder.declareFragment(id);
        if (projection.blocks.length) {
          const points = [...projection.text]; const sourceMap = new Map(projection.sourceMap!.map(m => [m.start, m])); const nestedItems = new Map<string, string>();
          for (const block of projection.blocks) {
            const input: Unit[] = [];
            for (let at = block.start; at < block.end; at++) {
              const mapping = sourceMap.get(at)!; const run = block.runs.find(r => r.start <= at && r.end > at)!;
              const barrier = projection.barriers!.find(b => b.start <= at && b.end > at);
              const fragments = Object.entries(projection.fragments).filter(([, range]) => at >= range.start && at < range.end).map(([id]) => id);
              input.push({ text: points[at], from: from + mapping.sourceStart, to: from + mapping.sourceEnd, marks: run.marks, href: run.href, fragments, ...(points[at] === '\n' ? { hard: true } : {}), ...(barrier ? { excluded: barrier.reason } : {}) });
            }
            if (block.listItem && !nestedItems.has(block.listItem)) nestedItems.set(block.listItem, `markdown-item-${++itemOrdinal}`);
            builder.add(Object.hasOwn(projection.fragments, block.id) ? block.id : `markdown-${++ordinal}`, block.kind, input, { ...(block.level ? { level: block.level } : {}), ...(block.listDepth ? { listDepth: block.listDepth } : {}), ...(block.listType ? { listType: block.listType } : {}), ...(block.listStart !== undefined ? { listStart: block.listStart } : {}), ...(block.listItem ? { listItem: nestedItems.get(block.listItem) } : {}) });
          }
          continue;
        }
      }
      builder.add(`markdown-${++ordinal}`, 'excluded', [{ text: '\uFFFC', from, to, excluded: 'unmapped HTML block' }]); continue;
    }
    if (['fence', 'code_block', 'hr'].includes(token.type)) {
      const from = lines[token.map?.[0] ?? 0]?.offset ?? 0; const to = lines[token.map?.[1] ?? 0]?.offset ?? builder.raw.length;
      builder.add(`markdown-${++ordinal}`, 'excluded', [{ text: '\uFFFC', from, to, excluded: token.type }]); continue;
    }
    if (token.type !== 'inline') continue;
    const contentMap: Array<[number, number]> = []; const map = token.map ?? [0, lines.length]; let lineIndex = map[0];
    for (const [n, contentLine] of token.content.split('\n').entries()) {
      let found = -1;
      while (lineIndex < map[1]) { found = lines[lineIndex]?.text.indexOf(contentLine) ?? -1; if (found >= 0) break; lineIndex++; }
      if (found < 0) fail('Unsupported Markdown block/source mapping; no location was guessed');
      if (n) { const previous = lines[lineIndex - 1]; contentMap.push([previous.offset + previous.text.length, lines[lineIndex].offset]); }
      for (let i = 0; i < contentLine.length; i++) contentMap.push([lines[lineIndex].offset + found + i, lines[lineIndex].offset + found + i + 1]);
      lineIndex++;
    }
    const output: Unit[] = []; const marks: Mark[] = []; const fragments: string[] = []; let href: string | undefined;
    const inlineHtml: Array<{ name: string; marks: Mark[]; href?: string; fragment?: string; excluded: boolean }> = [];
    for (const child of token.children ?? []) {
      const metadata = (child.meta ?? {}) as { sourceUnits?: Array<[number, number]>; sourceRange?: [number, number]; fragment?: string };
      if (child.type === 'html_inline') {
        const closing = /^<\/([A-Za-z][\w-]*)\s*>$/.exec(child.content);
        if (closing) {
          const top = inlineHtml.at(-1); if (!top || top.name !== closing[1].toLowerCase()) fail('Unsupported unbalanced inline HTML structure');
          inlineHtml.pop(); marks.splice(0, marks.length, ...top!.marks); href = top!.href; if (top!.fragment) fragments.pop(); continue;
        }
        if (/^<!--/.test(child.content)) continue;
        const element = parseFragment(child.content).childNodes.find(n => 'tagName' in n);
        if (!element) fail('Unsupported inline HTML structure');
        const name = tag(element!); const range = metadata.sourceRange!;
        const from = contentMap[range[0]]?.[0] ?? 0; const to = contentMap[Math.max(range[0], range[1] - 1)]?.[1] ?? from;
        const parentExcluded = inlineHtml.some(n => n.excluded);
        const excluded = parentExcluded || !htmlInline.has(name) || attr(element!, 'hidden') !== undefined || attr(element!, 'aria-hidden') === 'true' || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(element!, 'style') ?? '');
        const isVoid = ['br', 'img', 'hr', 'input', 'wbr'].includes(name) || /\/\s*>$/.test(child.content);
        const fragment = attr(element!, 'id'); if (fragment) builder.declareFragment(fragment);
        if (excluded && !parentExcluded) output.push({ text: '\uFFFC', from, to, excluded: name, fragments: [...fragments] });
        if (name === 'br' && !excluded) output.push({ text: '\n', from, to, hard: true, marks: [...marks], href, fragments: [...fragments] });
        if (!isVoid) {
          inlineHtml.push({ name, marks: [...marks], href, fragment, excluded });
          if (['strong', 'b'].includes(name)) marks.push('strong'); if (['em', 'i'].includes(name)) marks.push('em');
          if (name === 'a') href = attr(element!, 'href'); if (fragment) fragments.push(fragment);
        }
        continue;
      }
      if (inlineHtml.some(n => n.excluded)) continue;
      if (child.type === 'strong_open') { marks.push('strong'); continue; } if (child.type === 'em_open') { marks.push('em'); continue; }
      if (child.type === 'strong_close' || child.type === 'em_close') { marks.pop(); continue; }
      if (child.type === 'link_open') { href = String(child.attrGet('href') ?? '') || undefined; continue; } if (child.type === 'link_close') { href = undefined; continue; }
      if (child.type === 'prose_span_open') { builder.declareFragment(metadata.fragment!); fragments.push(metadata.fragment!); continue; } if (child.type === 'prose_span_close') { fragments.pop(); continue; }
      if (child.type === 'text' && !child.content) continue;
      let value = child.content; let excluded: string | undefined;
      if (['code_inline', 'image'].includes(child.type)) { value = '\uFFFC'; excluded = child.type; }
      else if (child.type === 'softbreak') value = ' ';
      else if (child.type === 'hardbreak') value = '\n';
      else if (!['text', 'text_special'].includes(child.type)) fail(`Unsupported Markdown inline token: ${child.type}`);
      let n = 0;
      for (const cp of value) {
        const range = metadata.sourceUnits?.[n++] ?? metadata.sourceRange;
        if (!range) throw new ProseError('E_PARSE', 'Markdown inline source map is missing');
        const from = contentMap[range[0]]?.[0]; const to = contentMap[Math.max(range[0], range[1] - 1)]?.[1];
        if (from === undefined || to === undefined) fail('Markdown inline source map is outside its block');
        output.push({ text: cp, from, to, marks: [...marks], ...(href ? { href } : {}), fragments: [...fragments], ...(child.type === 'hardbreak' ? { hard: true } : {}), ...(excluded ? { excluded } : {}) });
      }
    }
    if (inlineHtml.length) fail('Unsupported unclosed inline HTML structure');
    const kind = stack.includes('heading_open') ? 'heading' : stack.includes('list_item_open') ? 'list-item' : stack.includes('blockquote_open') ? 'blockquote' : 'paragraph';
    builder.add(`markdown-${++ordinal}`, kind, output, { ...(kind === 'heading' ? { level: headingLevel } : {}), ...(kind === 'list-item' ? { listDepth: stack.filter(s => s === 'list_item_open').length, ...lists.at(-1), listItem: items.at(-1) } : {}) });
  }
}

const record = (v: unknown, label: string): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(`${label} must be an object`); return v as Record<string, unknown>; };
const keys = (v: Record<string, unknown>, allowed: string[], label: string): void => { for (const k of Object.keys(v)) if (!allowed.includes(k)) fail(`Unsupported ${label} field: ${k}`); };
const string = (v: unknown, label: string): string => { if (typeof v !== 'string' || !v.trim()) return fail(`${label} must be a nonempty string`); return v; };
/** Locate JSON string values by exact field path; labels and repeated text never substitute for field identity. */
function jsonStringRanges(raw: string): Map<string, { start: number; end: number }> {
  const ranges = new Map<string, { start: number; end: number }>(); let position = 0;
  const whitespace = (): void => { while (/\s/.test(raw[position] ?? '') && position < raw.length) position++; };
  const scanString = (): { start: number; end: number; value: string } => {
    const start = position++; while (position < raw.length) { if (raw[position] === '\\') position += 2; else if (raw[position++] === '"') break; }
    return { start, end: position, value: JSON.parse(raw.slice(start, position)) as string };
  };
  const visit = (path: string): void => {
    whitespace();
    if (raw[position] === '"') { const result = scanString(); ranges.set(path, result); return; }
    if (raw[position] === '{') {
      position++; whitespace();
      while (raw[position] !== '}') { const key = scanString().value; whitespace(); position++; visit(`${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`); whitespace(); if (raw[position] !== ',') break; position++; whitespace(); }
      position++; return;
    }
    if (raw[position] === '[') {
      position++; whitespace(); let index = 0;
      while (raw[position] !== ']') { visit(`${path}/${index++}`); whitespace(); if (raw[position] !== ',') break; position++; }
      position++; return;
    }
    while (position < raw.length && !/[\s,}\]]/.test(raw[position])) position++;
  };
  visit(''); return ranges;
}
function projectStructured(builder: Builder, sourceDocument?: string): void {
  let parsed: unknown; try { parsed = JSON.parse(builder.raw); } catch { fail('Structured source must be inert valid JSON'); }
  const root = record(parsed, 'Structured source'); keys(root, ['schema', 'adapter', 'documents', 'extraction'], 'structured source');
  if (root.schema !== 'prose/structured-source@1') fail('Unsupported structured source schema');
  const adapter = record(root.adapter, 'Adapter'); keys(adapter, ['id', 'version', 'sourceSchema', 'projectionVersion', 'inlineDialect', 'selectedContentKinds', 'exclusions'], 'adapter'); string(adapter.id, 'Adapter ID'); string(adapter.version, 'Adapter version');
  if (adapter.projectionVersion !== undefined && adapter.projectionVersion !== '1') fail('Unsupported projection version');
  if (adapter.inlineDialect !== undefined && adapter.inlineDialect !== 'runs') fail('Structured fields must be parsed into declared runs before projection');
  builder.p.adapter = { id: adapter.id as string, version: adapter.version as string, ...(adapter.sourceSchema !== undefined ? { sourceSchema: string(adapter.sourceSchema, 'Adapter source schema') } : {}), ...(adapter.inlineDialect !== undefined ? { inlineDialect: adapter.inlineDialect as string } : {}) };
  if (!Array.isArray(root.documents) || !root.documents.length) fail('Structured source needs documents');
  const docs = (root.documents as unknown[]).map((v, i) => record(v, `Document ${i}`)); const documentIds = new Set<string>();
  for (const doc of docs) {
    keys(doc, ['id', 'language', 'dir', 'blocks'], 'document'); const id = string(doc.id, 'Document ID'); if (documentIds.has(id)) fail(`Duplicate document ID: ${id}`); documentIds.add(id);
    if (doc.language !== undefined) string(doc.language, 'Document language');
    if (doc.dir !== undefined && !['ltr', 'rtl', 'auto'].includes(doc.dir as string)) fail('Document direction must be ltr, rtl or auto');
  }
  const selected = sourceDocument ? docs.find(d => d.id === sourceDocument) : docs.find(d => d.id === builder.p.documentId) ?? (docs.length === 1 ? docs[0] : undefined);
  if (!selected) fail('Select an existing structured source document explicitly');
  builder.p.language = selected!.language as string | undefined ?? 'und';
  if (selected!.dir !== undefined) builder.p.direction = selected!.dir as 'ltr' | 'rtl' | 'auto';
  if (!Array.isArray(selected!.blocks)) fail('Document blocks must be an array');
  const ids = new Set<string>(); const ranges = jsonStringRanges(builder.raw);
  const itemContexts = new Map<string, string>(); const activeItems = new Map<number, string>();
  for (const [bi, value] of (selected!.blocks as unknown[]).entries()) {
    const block = record(value, 'Block'); keys(block, ['id', 'kind', 'context', 'runs', 'reason', 'source'], 'block');
    const id = string(block.id, 'Block ID'); if (ids.has(id)) fail(`Duplicate block ID: ${id}`); ids.add(id);
    const kind = string(block.kind, 'Block kind');
    if (kind === 'excluded') { activeItems.clear(); builder.add(id, kind, [{ text: '\uFFFC', from: 0, to: 0, excluded: string(block.reason, 'Exclusion reason'), field: `/documents/${docs.indexOf(selected!)}/blocks/${bi}` }]); continue; }
    if (!['paragraph', 'heading', 'list-item', 'blockquote'].includes(kind)) fail(`Unsupported structured block kind ${kind}; declare an excluded barrier`);
    const context = block.context === undefined ? {} : record(block.context, 'Block context'); keys(context, ['headingPath', 'level', 'listDepth', 'listType', 'listStart', 'listItem'], 'block context');
    if (context.headingPath !== undefined && (!Array.isArray(context.headingPath) || context.headingPath.some(v => typeof v !== 'string'))) fail('Heading path must contain strings');
    if (context.level !== undefined && (!Number.isInteger(context.level) || Number(context.level) < 1 || Number(context.level) > 6)) fail('Heading level must be 1 through 6');
    if (context.listDepth !== undefined && (!Number.isInteger(context.listDepth) || Number(context.listDepth) < 1)) fail('List depth must be positive');
    if (context.listType !== undefined && !['ordered', 'unordered'].includes(context.listType as string)) fail('Unsupported list type');
    if (context.listStart !== undefined && (!Number.isSafeInteger(context.listStart) || context.listType !== 'ordered')) fail('List start requires an ordered list and a safe integer');
    if (context.listItem !== undefined) string(context.listItem, 'List item identity');
    if (kind !== 'list-item' && (context.listType !== undefined || context.listStart !== undefined || context.listItem !== undefined)) fail('List metadata requires a list-item block');
    if (kind === 'list-item') {
      const depth = Number(context.listDepth ?? 1);
      for (const activeDepth of activeItems.keys()) if (activeDepth > depth) activeItems.delete(activeDepth);
      if (context.listItem !== undefined) {
        const item = context.listItem as string;
        const itemContext = JSON.stringify({ depth, type: context.listType ?? 'unordered', start: context.listType === 'ordered' ? context.listStart ?? 1 : undefined });
        if (itemContexts.has(item) && (itemContexts.get(item) !== itemContext || activeItems.get(depth) !== item)) fail('List item identity was reused after closure or its list context changed');
        itemContexts.set(item, itemContext); activeItems.set(depth, item);
      } else activeItems.delete(depth);
    } else activeItems.clear();
    if (!Array.isArray(block.runs)) fail('Structured block needs explicit runs');
    const output: Unit[] = [];
    for (const [ri, value] of (block.runs as unknown[]).entries()) {
      const run = record(value, 'Run'); keys(run, ['text', 'marks', 'href', 'break', 'source'], 'run');
      const field = `/documents/${docs.indexOf(selected!)}/blocks/${bi}/runs/${ri}`;
      if (run.break !== undefined) { if (run.break !== 'hard' || Object.keys(run).some(k => !['break', 'source'].includes(k))) fail('Hard break run cannot also contain text or formatting'); output.push({ text: '\n', hard: true, from: 0, to: 0, field }); continue; }
      if (typeof run.text !== 'string') fail('Run text must be a string');
      if (run.marks !== undefined && (!Array.isArray(run.marks) || run.marks.some(v => !['strong', 'em'].includes(v)))) fail('Unsupported structured run mark');
      if (run.href !== undefined && typeof run.href !== 'string') fail('Run href must be a string');
      const range = ranges.get(`${field}/text`); if (!range) fail('Structured text/source mapping is missing');
      // JSON escapes map to their full original source spans rather than pretending field text is raw JSON.
      let pos = range!.start + 1;
      for (const cp of run.text as string) {
        const length = builder.raw[pos] === '\\' ? builder.raw[pos + 1] === 'u' ? (cp.length === 2 && builder.raw[pos + 6] === '\\' ? 12 : 6) : 2 : cp.length;
        output.push({ text: cp, from: pos, to: pos + length, marks: run.marks as Mark[] | undefined, href: run.href as string | undefined, field }); pos += length;
      }
    }
    builder.add(id, kind, output, context as BlockContext);
  }
}
export function projectSource(raw: string, options: { profile: SourceProfile; documentId: string; sourceDocument?: string; contentRoot?: string }): Projection {
  if (typeof raw !== 'string' || !options.documentId?.trim()) fail('Source text and stable document ID are required');
  const builder = new Builder(raw, options.profile, options.documentId);
  if (options.profile === 'markdown') projectMarkdown(builder);
  else if (options.profile === 'html') projectHtml(builder, options.contentRoot);
  else if (options.profile === 'structured') projectStructured(builder, options.sourceDocument);
  else fail(`Unsupported source profile: ${options.profile}`);
  return builder.finish();
}
