// Units: the tappable pieces of a variant, for line-anchored notes and read-aloud highlighting. A note's `unit` is an
// index into this list, so the split must give the same answer on every load of the same file.
//
//   markdown  prose. A heading is one unit; every other block (paragraph, quote, list item, step, on-screen note)
//             is split into sentences with sentences(). Private comments (<!-- -->) are not read and not units.
//   fountain  a script. One unit per non-empty line of each spoken or staged block (scene heading, action,
//             parenthetical, dialogue, transition, centered text, lyric). The parser joins the consecutive lines of one
//             speech into one block, so a speech is one unit; a parenthetical keeps its parentheses. A speech unit is
//             prefixed `NAME: ` (or `NAME (V.O.): `); action and the rest carry no prefix. Cues themselves,
//             notes, synopses, sections and the title page are not units. Action is a line, not a sentence.
//   dialog    a dialog YAML. One unit per non-empty line of each node text, node variant, choice and bark line; node and
//             bark lines are prefixed with their speaker like a speech, choices (the player's words) are not.
//
// Verse forms (a form with a `verse` block in forms.json) are Markdown drafts whose units are lines; layoutOf also returns
// `breaks` (stanza, paragraph and block starts) and the layout the page uses. Empty text has no units.
import { parseDialog } from '../parse/dialog.ts';
import { parseFountain } from '../parse/fountain.ts';
import { parseMarkdown } from '../parse/markdown.ts';
import type { Block, BlockKind } from '../ir.ts';
import type { Format } from '../kinds.ts';
import { FORMS } from '../forms.ts';
import { classifyLine } from '../verse/lines.ts';
import { sentences } from '../text.ts';

const FOUNTAIN_UNITS = new Set<BlockKind>(['scene', 'action', 'line', 'parenthetical', 'transition', 'centered', 'lyric']);
const DIALOG_UNITS = new Set<BlockKind>(['line', 'choice', 'bark']);

const lines = (text: string): string[] => text.split(/\r\n?|\n/).map(l => l.trim()).filter(Boolean);

/** How the page lays units out: `prose` flows them into paragraphs, `lines` sets one unit per line. */
export type Layout = 'prose' | 'lines';
/** `breaks` are the unit indexes (never 0) that start a new paragraph, stanza or block. */
export interface UnitLayout { layout: Layout; units: string[]; breaks: number[] }

const splitProse = (b: Block): string[] => {
  if (b.kind === 'heading') return b.text.trim() ? [b.text.trim()] : [];
  if (b.kind === 'note' && !b.meta?.onscreen) return [];
  return sentences(b.text);
};
const VERSE_BLOCKS = new Set<BlockKind>(['paragraph', 'list-item', 'step', 'quote']);
/**
 * A verse block as groups of units. In a lyric form a plain, bold or bracketed section label is a heading (a group of its
 * own, like a `##` heading) and a direction such as `(hum softly)` is no unit, exactly as extractVerse reads them.
 */
const splitVerse = (lyric: boolean) => (b: Block): string[][] => {
  if (b.kind === 'heading') return [b.text.trim() ? [b.text.trim()] : []];
  if (b.kind === 'note' && !b.meta?.onscreen) return [];
  if (!VERSE_BLOCKS.has(b.kind)) return [sentences(b.text)];
  if (b.kind !== 'paragraph' || !lyric) return [lines(b.text)];
  const groups: string[][] = [[]];
  for (const l of lines(b.text)) {
    const c = classifyLine(l, true);
    if (c.kind === 'direction') continue;
    if (c.kind === 'label') groups.push([c.label], []);
    else groups.at(-1)!.push(l);
  }
  return groups;
};
/** Spoken lines carry who says them, so a script reads as a script: `NAME: text`, a cue extension kept as written (V.O.), CONT'D not. */
const spoken = (b: Block, l: string): string => {
  if (b.kind === 'parenthetical') return `(${l})`;
  if ((b.kind !== 'line' && b.kind !== 'bark') || !b.speaker) return l;
  const ext = typeof b.meta?.extension === 'string' ? ` (${b.meta.extension})` : '';
  return `${b.speaker}${ext}: ${l}`;
};
const splitLines = (kinds: Set<BlockKind>) => (b: Block): string[] => (kinds.has(b.kind) ? lines(b.text).map(l => spoken(b, l)) : []);

/** Groups of units, one group per block: a group is a paragraph (prose), a stanza (verse) or a script block. */
function groupsOf(text: string, format: Format, verse: boolean, lyric: boolean): { layout: Layout; groups: string[][] } {
  switch (format) {
    case 'markdown': return { layout: verse ? 'lines' : 'prose', groups: parseMarkdown(text).blocks.flatMap(verse ? splitVerse(lyric) : b => [splitProse(b)]) };
    case 'fountain': {
      // A parenthetical belongs to the speech after it, so no gap opens between them.
      const groups: string[][] = [];
      let glue = false;
      for (const b of parseFountain(text).blocks) {
        const g = splitLines(FOUNTAIN_UNITS)(b);
        if (g.length === 0) continue;
        if (glue) groups[groups.length - 1].push(...g); else groups.push(g);
        glue = b.kind === 'parenthetical';
      }
      return { layout: 'lines', groups };
    }
    case 'dialog': return { layout: 'lines', groups: parseDialog(text).blocks.map(splitLines(DIALOG_UNITS)) };
  }
}

/** Units plus how to lay them out. `form` (an id from forms.json) says whether a Markdown draft is verse. */
export function layoutOf(text: string, format: Format, form?: string): UnitLayout {
  if (text.trim() === '') return { layout: 'prose', units: [], breaks: [] };
  const def = format === 'markdown' && form !== undefined ? FORMS.find(f => f.id === form)?.verse : undefined;
  const { layout, groups } = groupsOf(text, format, def !== undefined, def?.kind === 'lyric');
  const units: string[] = [];
  const breaks: number[] = [];
  for (const g of groups.filter(x => x.length > 0)) {
    if (units.length > 0) breaks.push(units.length);
    units.push(...g);
  }
  return { layout, units, breaks };
}

export const unitsOf = (text: string, format: Format, form?: string): string[] => layoutOf(text, format, form).units;
