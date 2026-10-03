// One home for the formats and the block-kind groupings that measurements and lint rules read.
import type { BlockKind } from './ir.ts';

/** Native draft formats, in the order capabilities lists them. */
export const FORMATS = ['fountain', 'markdown', 'dialog'] as const;
export type Format = typeof FORMATS[number];

/** Block kinds that carry prose a reader or listener takes in. */
export const PROSE_KINDS: ReadonlySet<BlockKind> = new Set<BlockKind>(['action', 'line', 'paragraph', 'step', 'list-item', 'quote', 'choice', 'bark']);

/** Blocks that are read aloud, per format. Fountain runtime comes from the page estimate instead. */
export const SPOKEN_KINDS: Readonly<Record<Format, readonly BlockKind[]>> = {
  fountain: ['line'],
  markdown: ['paragraph', 'step', 'list-item', 'quote'],
  dialog: ['line', 'bark'],
};

/** Blocks that never print as script text, so brackets in them are not leaked notes. */
export const NOT_SCRIPT_TEXT: ReadonlySet<BlockKind> = new Set<BlockKind>(['note', 'section', 'synopsis']);

/** Dialog blocks shown in the game's text box. */
export const DIALOG_TEXT_KINDS: ReadonlySet<BlockKind> = new Set<BlockKind>(['line', 'choice', 'bark']);
