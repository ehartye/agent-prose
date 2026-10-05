import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import MarkdownIt from 'markdown-it';
import type { Block, Doc } from '../ir.ts';
import { parseMarkdown } from '../parse/markdown.ts';
import { words, round2 } from '../text.ts';

export const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const md = new MarkdownIt({ html: false, breaks: true, linkify: false });
md.renderer.rules.image = (tokens, i) => escape(tokens[i].content);
md.renderer.rules.link_open = () => ''; md.renderer.rules.link_close = () => '';
export interface ReadingPage { page: number; words: number; wpm: number; minutes: number }

function speechRows(raw: string): Array<{ html: string; text: string }> {
  const tokens = md.parseInline(raw, {})[0]?.children ?? [];
  const styles: string[] = [], chars: Array<{ char: string; tags: string[] }> = [];
  for (const token of tokens) {
    if (token.type === 'strong_open' || token.type === 'em_open') { styles.push(token.tag); continue; }
    if (token.type === 'strong_close' || token.type === 'em_close') { styles.pop(); continue; }
    if (token.type === 'link_open' || token.type === 'link_close') continue;
    for (const char of token.type === 'softbreak' || token.type === 'hardbreak' ? '\n' : token.content) chars.push({ char, tags: [...styles] });
  }
  const rows: Array<{ html: string; text: string }> = [];
  while (chars.length) {
    let end = chars.findIndex(c => c.char === '\n');
    if (end < 0 || end > 38) {
      end = Math.min(chars.length, 38);
      if (end < chars.length) for (let k = end - 1; k > 18; k--) if (chars[k].char === ' ') { end = k + 1; break; }
    }
    const line = chars.splice(0, end);
    const newline = chars[0]?.char === '\n';
    if (newline) chars.shift();
    const text = line.map(c => c.char).join('') + (newline ? '\n' : '');
    let html = '', active: string[] = [];
    for (const c of line) {
      if (active.join() !== c.tags.join()) {
        html += active.slice().reverse().map(t => `</${t}>`).join('') + c.tags.map(t => `<${t}>`).join(''); active = c.tags;
      }
      html += escape(c.char);
      if (/[,;:.!?…—–]/u.test(c.char)) html += '<span class="breath" aria-label="suggested breath boundary"></span>';
    }
    html += active.slice().reverse().map(t => `</${t}>`).join('');
    rows.push({ html, text });
  }
  return rows;
}

function speech(doc: Doc, source: string, wpm: number, disclosure: boolean): { content: string; pages: ReadingPage[] } {
  const raw: string[] = []; parseMarkdown(source.replace(/^\uFEFF/, ''), raw);
  const sourceLines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const rows: Array<{ html: string; text: string; spoken: boolean }> = [];
  doc.blocks.forEach((b, i) => {
    if (b.kind === 'note') return;
    let text = raw[i] || b.text;
    if (b.kind === 'quote') {
      const lines: string[] = [];
      for (let k = b.line - 1; k < sourceLines.length && /^\s*>/.test(sourceLines[k]); k++) lines.push(sourceLines[k].replace(/^\s*>\s?/, ''));
      text = lines.join('\n');
    }
    speechRows(text).forEach(r => rows.push({ ...r, spoken: b.kind !== 'heading', html: `<div class="reading-line ${b.kind === 'heading' ? 'reading-heading' : ''}">${r.html}</div>` }));
    rows.push({ html: '<div class="reading-gap"></div>', text: '\n\n', spoken: true });
  });
  const pages: ReadingPage[] = [], content: string[] = [];
  for (let start = 0; start < rows.length || start === 0; start += 21) {
    const part = rows.slice(start, start + 21), count = words(part.filter(r => r.spoken).map(r => r.text).join('')).length;
    const info = { page: pages.length + 1, words: count, wpm, minutes: round2(count / wpm) }; pages.push(info);
    content.push(`<section class="reading-page">${disclosure ? '<div class="disclosure">AI-generated voice</div>' : ''}<div class="reading-text">${part.map(r => r.html).join('')}</div><footer>Page ${info.page} · ${count} words · ${info.minutes} estimated minutes at ${wpm} wpm</footer></section>`);
  }
  return { content: content.join(''), pages };
}

function script(doc: Doc): string {
  const groups: Array<{ html: string; speech?: boolean }> = [];
  const blocks = doc.blocks.filter(b => !['note', 'section', 'synopsis'].includes(b.kind));
  let scenes = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'line' || b.kind === 'parenthetical') {
      const group: Block[] = [b];
      while (blocks[i + 1] && ['line', 'parenthetical'].includes(blocks[i + 1].kind) && blocks[i + 1].meta?.speech === b.meta?.speech) group.push(blocks[++i]);
      const dual = group.some(x => x.meta?.dual === true);
      const extension = group.find(x => typeof x.meta?.extension === 'string')?.meta?.extension;
      const cue = `${b.speaker ?? ''}${typeof extension === 'string' ? ` (${extension})` : ''}`;
      const html = `<div class="speech"><div class="cue">${escape(cue)}</div>${group.map(x => `<div class="${x.kind === 'parenthetical' ? 'parenthetical' : 'dialogue'}">${escape(x.kind === 'parenthetical' ? `(${x.text})` : x.text)}</div>`).join('')}</div>`;
      if (dual && groups.at(-1)?.speech) { const prev = groups.pop()!; groups.push({ html: `<div class="dual">${prev.html}${html}</div>` }); }
      else groups.push({ html, speech: true });
    } else {
      const laterScene = b.kind === 'scene' && scenes++ > 0;
      if (laterScene && doc.form === 'sitcom-multicam' && blocks[i - 1]?.kind !== 'page-break') groups.push({ html: '<div class="page-break"></div>' });
      groups.push({ html: b.kind === 'page-break' ? '<div class="page-break"></div>' : `<div class="${b.kind}">${escape(b.text)}</div>` });
    }
  }
  const title = typeof doc.meta.title === 'string' ? `<section class="title-page"><h1>${escape(doc.meta.title)}</h1>${typeof doc.meta.author === 'string' ? `<p>${escape(doc.meta.author)}</p>` : ''}</section>` : '';
  return `${title}<main class="script">${groups.map(g => g.html).join('')}</main>`;
}

export function renderHtml(doc: Doc, source: string, wpm: number, disclosure: boolean): { html: string; pages: ReadingPage[] } {
  const css = readFileSync(join(import.meta.dirname, '..', '..', 'runtime', 'print', 'style.css'), 'utf8');
  const fonts = [['Courier', 'courier-prime-400.ttf', 400], ['Courier', 'courier-prime-700.ttf', 700], ['Atkinson', 'atkinson-400.ttf', 400], ['Atkinson', 'atkinson-700.ttf', 700]] as const;
  const fontCss = fonts.map(([family, file, weight]) => `@font-face{font-family:${family};font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(join(import.meta.dirname, '..', '..', 'runtime', 'reading', 'fonts', file)).toString('base64')})}`).join('');
  const reading = doc.form.startsWith('speech-');
  let content: string, pages: ReadingPage[] = [];
  if (reading) ({ content, pages } = speech(doc, source, wpm, disclosure));
  else if (doc.format === 'fountain') content = `${disclosure ? '<p class="disclosure">AI-generated voice</p>' : ''}${script(doc)}`;
  else {
    const body = source.replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
    content = `<main class="markdown">${disclosure ? '<p class="disclosure">AI-generated voice</p>' : ''}${md.render(body)}</main>`;
  }
  return { html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src 'none'; script-src 'none'"><title>${escape(String(doc.meta.title ?? 'Reading copy'))}</title><style>${fontCss}${css}</style></head><body data-form="${escape(doc.form)}" class="${reading ? 'reading' : doc.format}">${content}</body></html>`, pages };
}
