import type { Block } from '../ir.ts';
import { plain, splitSpeaker } from '../text.ts';

export interface ParsedFountain { meta: Record<string, string>; blocks: Block[] }

const SCENE = /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i;
const TITLE_KEY = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/;

/** Blank out boneyard comments but keep their newlines so line numbers stay true. */
const stripBoneyard = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''));
/**
 * Fountain 1.1 notes: they may span lines but never cross an empty line (a line of exactly two
 * spaces is a blank line inside the note) and never nest, so an unclosed `[[` stays literal text.
 */
const NOTE = /\[\[(?:(?!\[\[)(?!\n(?! {2}\n)[ \t]*\n)[\s\S])*?\]\]/g;
/**
 * Pull out double-bracket notes ([[ … ]]) before line splitting. Their characters are blanked but newlines kept, so
 * line numbers stay true. `noteOnly` holds the 0-based indices of lines left with nothing but
 * whitespace by the extraction; the parser treats them as absent rather than blank.
 */
function extractNotes(src: string): { text: string; notes: Block[]; noteOnly: Set<number> } {
  const notes: Block[] = [];
  const touched: number[] = [];
  let line = 1;
  let scanned = 0;
  const text = src.replace(NOTE, (m: string, offset: number) => {
    for (; scanned < offset; scanned++) if (src.charCodeAt(scanned) === 10) line++;
    const inner = m.slice(2, -2).split('\n').map(l => (l.trim() === '' ? '' : l)).join('\n');
    notes.push({ kind: 'note', text: inner.trim(), line });
    const span = m.split('\n').length;
    for (let k = 0; k < span; k++) touched.push(line - 1 + k);
    return m.replace(/[^\n]/g, '');
  });
  const lines = text.split('\n');
  const noteOnly = new Set(touched.filter(k => lines[k].trim() === ''));
  return { text, notes, noteOnly };
}
/** Drop emphasis markers, collapse whitespace. */
const clean = (s: string) => plain(s).replace(/\s+/g, ' ').trim();

/** Fountain cue rule plus the multi-cam guard: ≤ 5 words and no terminal punctuation unless forced with @. */
function isCharacter(t: string): boolean {
  if (t.startsWith('@')) return true;
  if (SCENE.test(t)) return false;
  const name = t.replace(/\^\s*$/, '').replace(/\([^)]*\)/g, '').trim();
  return name.length > 0
    && /\p{L}/u.test(name)
    && name === name.toUpperCase()
    && !/[.!?:;,]$/.test(name)
    && name.split(/\s+/).length <= 5;
}

export function parseFountain(source: string): ParsedFountain {
  const { text: body, notes, noteOnly } = extractNotes(stripBoneyard(source.split(/\r\n?/).join('\n')));
  const lines = body.split('\n');
  const meta: Record<string, string> = {};
  const blocks: Block[] = [];
  /** Lines that held only a note are absent: they neither break nor contribute to an element. */
  const absent = (k: number) => noteOnly.has(k);
  let i = 0;
  while (i < lines.length && absent(i)) i++;

  // Title page: key: value pairs at the very top, ended by the first blank line.
  if (i < lines.length && TITLE_KEY.test(lines[i]) && !SCENE.test(lines[i])) {
    let key = '';
    for (; i < lines.length && (absent(i) || lines[i].trim() !== ''); i++) {
      if (absent(i)) continue;
      const m = lines[i].match(TITLE_KEY);
      if (m && !/^\s/.test(lines[i])) { key = m[1].trim().toLowerCase(); meta[key] = m[2].trim(); }
      else if (key) meta[key] = (meta[key] ? `${meta[key]}\n` : '') + lines[i].trim();
    }
  }

  /** Is the nearest present line in direction `step` from `k` blank (or past either end)? */
  const blank = (k: number, step: 1 | -1) => {
    while (k >= 0 && k < lines.length && absent(k)) k += step;
    return k < 0 || k >= lines.length || lines[k].trim() === '';
  };
  let action: { line: number; parts: string[] } | null = null;
  const flushAction = () => {
    if (!action) return;
    const text = clean(action.parts.join(' '));
    if (text) blocks.push({ kind: 'action', text, line: action.line });
    action = null;
  };
  const scene = (text: string, line: number) => {
    const m = text.match(/\s*#([\w.-]+)#\s*$/);
    blocks.push({ kind: 'scene', text: m ? text.slice(0, m.index).trim() : text.trim(), line, ...(m ? { meta: { number: m[1] } } : {}) });
  };
  let speeches = 0;
  /** Consume a cue and its dialogue/parentheticals; return the index of the last consumed line. */
  const dialogue = (start: number): number => {
    const cue = lines[start].trim();
    const dual = /\^\s*$/.test(cue);
    const { name, extension: ext } = splitSpeaker(cue.replace(/^@/, '').replace(/\^\s*$/, ''));
    const speaker = plain(name).trim();
    // Every block of one cue shares a running speech index, so layout and speech stats group by cue, not by speaker.
    const speech = speeches++;
    const extra: Record<string, unknown> = { ...(ext ? { extension: ext } : {}), ...(dual ? { dual: true } : {}) };
    let seg: { line: number; parts: string[] } | null = null;
    const flushSeg = () => {
      if (!seg) return;
      const text = clean(seg.parts.join(' '));
      if (text) blocks.push({ kind: 'line', text, line: seg.line, speaker, meta: { speech, ...extra } });
      seg = null;
    };
    let k = start + 1;
    // Fountain 1.1: inside dialogue, a line of exactly two spaces continues the speech.
    const twoSpace = (j: number) => lines[j] === '  ';
    for (; k < lines.length && (absent(k) || twoSpace(k) || lines[k].trim() !== ''); k++) {
      if (absent(k) || twoSpace(k)) continue;
      const t = lines[k].trim();
      if (/^\(.*\)$/.test(t)) { flushSeg(); blocks.push({ kind: 'parenthetical', text: t.slice(1, -1).trim(), line: k + 1, speaker, meta: { speech } }); }
      else { if (!seg) seg = { line: k + 1, parts: [] }; seg.parts.push(t); }
    }
    flushSeg();
    return k - 1;
  };

  for (; i < lines.length; i++) {
    if (absent(i)) continue;
    const t = lines[i].trim();
    const line = i + 1;
    if (t === '') { flushAction(); continue; }
    const prevBlank = blank(i - 1, -1);
    if (/^={3,}$/.test(t)) { flushAction(); blocks.push({ kind: 'page-break', text: '', line }); continue; }
    if (t.startsWith('#')) { flushAction(); const level = t.match(/^#+/)![0].length; blocks.push({ kind: 'section', text: t.slice(level).trim(), line, meta: { level } }); continue; }
    if (/^=(?!=)/.test(t)) { flushAction(); blocks.push({ kind: 'synopsis', text: t.slice(1).trim(), line }); continue; }
    if (t.startsWith('~')) { flushAction(); blocks.push({ kind: 'lyric', text: clean(t.slice(1)), line }); continue; }
    if (t.startsWith('>') && t.endsWith('<')) { flushAction(); blocks.push({ kind: 'centered', text: clean(t.slice(1, -1)), line }); continue; }
    if (t.startsWith('>')) { flushAction(); blocks.push({ kind: 'transition', text: t.slice(1).trim(), line }); continue; }
    if (t.startsWith('!')) { if (!action) action = { line, parts: [] }; action.parts.push(t.slice(1)); continue; }
    if (prevBlank && /^\.[A-Za-z0-9]/.test(t)) { flushAction(); scene(t.slice(1), line); continue; }
    // Mixed-case lines need a blank line after them too ("Est. 1990 the plaque reads." is action).
    if (prevBlank && SCENE.test(t) && (t === t.toUpperCase() || blank(i + 1, 1))) { flushAction(); scene(t, line); continue; }
    if (prevBlank && blank(i + 1, 1) && t === t.toUpperCase() && /TO:$/.test(t)) { flushAction(); blocks.push({ kind: 'transition', text: t, line }); continue; }
    if (prevBlank && !blank(i + 1, 1) && isCharacter(t)) { flushAction(); i = dialogue(i); continue; }
    if (!action) action = { line, parts: [] };
    action.parts.push(t);
  }
  flushAction();
  // Merge notes by line; on a shared line a note follows the other blocks (sort is stable).
  const merged = [...blocks, ...notes].sort((a, b) => a.line - b.line);
  return { meta, blocks: merged };
}
