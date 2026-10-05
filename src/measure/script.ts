import type { Block, BlockKind } from '../ir.ts';
import type { Form } from '../forms.ts';
import { round2, words, wrapCount } from '../text.ts';

export const LINES_PER_PAGE = 55;
const WIDTH = { action: 60, dialogue: 35, parenthetical: 25 };
/** Kinds that never print, so they neither take layout lines nor break a speech. */
const NON_PRINTING = new Set<BlockKind>(['note', 'section', 'synopsis']);

export interface SceneLength { line: number; heading: string; lines: number; pages: number }

export interface ScriptStats {
  layout: 'screenplay' | 'multicam';
  lines: number; pages: number; minutes: number; band: [number, number];
  scenes: number; dialogueWords: number; actionWords: number; dialogueShare: number;
  /** Layout lines each scene takes, heading to the next heading (multi-cam page padding excluded). */
  scenesDetail: SceneLength[];
  /** Speeches (one cue each); the longest by spoken words, excluding parentheticals, and the line of its first dialogue. */
  speeches: { count: number; longestWords: number; longestLine: number };
}

const isSpeech = (b: Block) => b.kind === 'line' || b.kind === 'parenthetical';

/**
 * Does `b` continue the speech `prev` belongs to? Parsed Fountain stamps meta.speech per cue; blocks without it fall
 * back to "same speaker, back to back".
 */
function sameSpeech(prev: Block | undefined, b: Block): boolean {
  if (!prev || !isSpeech(prev)) return false;
  const a = prev.meta?.speech, c = b.meta?.speech;
  return a !== undefined || c !== undefined ? a === c : prev.speaker === b.speaker;
}

/** Group dialogue blocks into speeches, skipping non-printing blocks between them. */
function speechesOf(blocks: Block[]): Block[][] {
  const out: Block[][] = [];
  let prev: Block | undefined;
  for (const b of blocks) {
    if (NON_PRINTING.has(b.kind)) continue;
    if (isSpeech(b)) {
      if (sameSpeech(prev, b)) out.at(-1)!.push(b);
      else out.push([b]);
    }
    prev = b;
  }
  return out;
}

interface Layout { lines: number; scenes: SceneLength[] }

function layout(blocks: Block[], kind: 'screenplay' | 'multicam'): Layout {
  const dialogueFactor = kind === 'multicam' ? 2 : 1;
  let lines = 0;
  let prev: Block | undefined;
  const scenes: Array<Omit<SceneLength, 'pages'>> = [];
  let sceneStart = 0;
  const closeScene = () => { const s = scenes.at(-1); if (s) s.lines = lines - sceneStart; };
  for (const b of blocks) {
    if (NON_PRINTING.has(b.kind)) continue;
    switch (b.kind) {
      case 'scene':
        closeScene();
        // multi-cam starts every scene on a new page
        if (kind === 'multicam' && scenes.length > 0) lines = Math.ceil(lines / LINES_PER_PAGE) * LINES_PER_PAGE;
        sceneStart = lines;
        scenes.push({ line: b.line, heading: b.text, lines: 0 });
        lines += kind === 'multicam' ? 3 : 2;
        break;
      case 'action': case 'centered': case 'lyric': lines += 1 + wrapCount(b.text, WIDTH.action); break;
      case 'transition': lines += 2; break;
      case 'line': case 'parenthetical':
        if (!sameSpeech(prev, b)) lines += 2; // blank line + character cue
        lines += b.kind === 'line' ? wrapCount(b.text, WIDTH.dialogue) * dialogueFactor : wrapCount(b.text, WIDTH.parenthetical);
        break;
      case 'page-break': lines = Math.ceil(lines / LINES_PER_PAGE) * LINES_PER_PAGE; break;
      default: break;
    }
    prev = b;
  }
  closeScene();
  return { lines, scenes: scenes.map(s => ({ ...s, pages: round2(s.lines / LINES_PER_PAGE) })) };
}

/** Lines a standard layout needs; multi-cam double-spaces dialogue, gives scene headings an extra line and starts each scene on a new page. */
export function scriptLines(blocks: Block[], kind: 'screenplay' | 'multicam'): number {
  return layout(blocks, kind).lines;
}

export function measureScript(blocks: Block[], form: Form): ScriptStats | null {
  if (!form.layout || !form.minutesPerPage) return null;
  const { lines, scenes } = layout(blocks, form.layout);
  const pages = round2(lines / LINES_PER_PAGE);
  const minutes = round2(pages * form.minutesPerPage);
  const count = (kind: Block['kind']) => blocks.filter(b => b.kind === kind).reduce((n, b) => n + words(b.text).length, 0);
  const dialogueWords = count('line');
  const actionWords = count('action');
  const speeches = speechesOf(blocks);
  let longest = { words: 0, line: 0 };
  for (const s of speeches) {
    const n = s.filter(b => b.kind === 'line').reduce((t, b) => t + words(b.text).length, 0);
    if (n > longest.words) longest = { words: n, line: (s.find(b => b.kind === 'line') ?? s[0]).line };
  }
  return {
    layout: form.layout, lines, pages, minutes, band: [round2(minutes * 0.8), round2(minutes * 1.2)],
    scenes: scenes.length,
    dialogueWords, actionWords,
    dialogueShare: dialogueWords + actionWords ? round2(dialogueWords / (dialogueWords + actionWords)) : 0,
    scenesDetail: scenes,
    speeches: { count: speeches.length, longestWords: longest.words, longestLine: longest.line },
  };
}
