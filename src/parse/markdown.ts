import { parse as parseYaml } from 'yaml';
import type { Block } from '../ir.ts';
import { ProseError } from '../errors.ts';
import { plain } from '../text.ts';

export interface ParsedMarkdown { meta: Record<string, unknown>; blocks: Block[] }

function frontmatter(lines: string[]): { meta: Record<string, unknown>; bodyStart: number } {
  if (lines[0]?.trim() !== '---') return { meta: {}, bodyStart: 0 };
  const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---');
  if (end === -1) throw new ProseError('E_PARSE', 'Frontmatter opened on line 1 is never closed with ---', { details: { line: 1 } });
  let data: unknown;
  try { data = parseYaml(lines.slice(1, end).join('\n')); }
  catch (e) { throw new ProseError('E_PARSE', `Frontmatter is not valid YAML: ${(e as Error).message}`, { details: { line: 2 } }); }
  if (data == null) return { meta: {}, bodyStart: end + 1 };
  if (typeof data !== 'object' || Array.isArray(data)) throw new ProseError('E_PARSE', 'Frontmatter must be a YAML mapping', { details: { line: 2 } });
  return { meta: data as Record<string, unknown>, bodyStart: end + 1 };
}

export function parseMarkdown(source: string): ParsedMarkdown {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const { meta, bodyStart } = frontmatter(lines);
  const blocks: Block[] = [];
  let para: { line: number; parts: string[] } | null = null;
  let open: { block: Block; kind: 'quote' | 'item' } | null = null;
  let fenced = false;

  const flush = () => {
    if (!para) return;
    // Lines stay separate so per-line cues (VISUAL:, VO:) survive; text helpers treat \n as whitespace.
    // plain() runs over the whole paragraph so markup that wraps a line (a long link, bold) is stripped too.
    const text = plain(para.parts.join('\n'));
    if (/^\[[^\]]*\]$/.test(text)) blocks.push({ kind: 'note', text: text.slice(1, -1).trim(), line: para.line, meta: { onscreen: true } });
    else blocks.push({ kind: 'paragraph', text, line: para.line });
    para = null;
  };
  const add = (b: Block): Block => { flush(); blocks.push(b); return b; };

  for (let i = bodyStart; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    const line = i + 1;
    let m: RegExpMatchArray | null;
    if (/^(```|~~~)/.test(t)) { flush(); open = null; fenced = !fenced; continue; }
    if (fenced) continue;
    if (t === '' || /^(?:-{3,}|\*{3,}|_{3,})$/.test(t) || t.startsWith('|')) { flush(); open = null; continue; }
    if ((m = t.match(/^(#{1,6})\s+(.*)$/))) { add({ kind: 'heading', text: plain(m[2]), line, meta: { level: m[1].length } }); open = null; continue; }
    if ((m = t.match(/^<!--(.*)-->$/))) { add({ kind: 'note', text: m[1].trim(), line }); open = null; continue; }
    if ((m = raw.match(/^ {0,3}(\d+)[.)]\s+(.*)$/))) { open = { block: add({ kind: 'step', text: plain(m[2]), line, meta: { n: Number(m[1]) } }), kind: 'item' }; continue; }
    if ((m = raw.match(/^ {0,3}[-*+]\s+(.*)$/))) { open = { block: add({ kind: 'list-item', text: plain(m[1]), line }), kind: 'item' }; continue; }
    if ((m = t.match(/^>\s?(.*)$/))) {
      if (open?.kind === 'quote') open.block.text += ' ' + plain(m[1]);
      else open = { block: add({ kind: 'quote', text: plain(m[1]), line }), kind: 'quote' };
      continue;
    }
    if (open?.kind === 'item' && /^\s{2,}\S/.test(raw)) { open.block.text += ' ' + plain(t); continue; }
    open = null;
    if (!para) para = { line, parts: [] };
    para.parts.push(t);
  }
  flush();
  return { meta, blocks };
}
