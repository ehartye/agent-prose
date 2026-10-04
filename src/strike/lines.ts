// Strike lines: the units of a draft grouped the way a strike names them (one per ref), with whether each can be struck.
// Pure, like spans.ts. A strike line is what the page lists in its Draft view and what `prose strike --line` resolves to:
// a Markdown paragraph is one line (every sentence shares its ref), a Fountain speech is one line, a dialog variant,
// choice or bark line is one line. The static rules live here; whether removing a line leaves exactly the other units is
// checked by simulating it (plan.ts), which is what makes four formats safe.
import { FORMS } from '../forms.ts';
import type { Format } from '../kinds.ts';
import { blockUnits, layoutOf } from '../reading/units.ts';
import { dialogEntries, normalizeDraft, unitSpans, type DialogEntry } from './spans.ts';

/** Longest text a strike records (a longer unit is not strikable). */
export const MAX_STRUCK_TEXT = 2000;

export interface StrikeLine {
  /** Canonical ref of the unit(s): what `--line` and the page name. */
  ref: string;
  start: number;
  end: number;
  /** The units' text as the page shows it, without the `NAME: ` prefix. */
  text: string;
  speaker?: string;
  /** Indexes into the page's unit list that this line covers. */
  units: number[];
  strikable: boolean;
  /** Why not, in words an owner can read. */
  why?: string;
  /** Starts a new block (paragraph, stanza, speech) in the page's layout. */
  break: boolean;
  /** The lines a removal takes: the same as start-end, except for a dialog choice (its `to:` and `condition:` go with it). */
  removal: [number, number];
  /** A Fountain speech: when nothing is left under its cue, the cue goes too. */
  speech: boolean;
  /** Dialog only: the list this line sits in. Removing every entry of a list removes its key too. */
  seq: DialogEntry['seq'];
}

/** Every unit of the draft grouped by ref, in page order. `text` is the draft as read from disk; `form` decides whether Markdown is verse. */
export function strikeLines(text: string, format: Format, form?: string): StrikeLine[] {
  const source = normalizeDraft(text);
  const spans = unitSpans(source, format, form);
  if (spans.length === 0) return [];
  const verse = format === 'markdown' && form !== undefined && FORMS.find(f => f.id === form)?.verse !== undefined;
  const joiner = format === 'markdown' && !verse ? ' ' : '\n';
  const { entries, all } = blockUnits(source, format, form);
  const breaks = new Set(layoutOf(source, format, form).breaks);
  const dialog = format === 'dialog' ? dialogEntries(source, all) : null;
  // The entry (dialog) and block (fountain) behind each unit, by unit index.
  const behind: Array<{ speech: boolean; entry: DialogEntry | null }> = [];
  for (const { block, units } of entries) {
    for (let k = 0; k < units.length; k++) behind.push({ speech: format === 'fountain' && block.kind === 'line' && !!block.speaker, entry: dialog ? dialog[all.indexOf(block)] : null });
  }
  const groups = new Map<string, typeof spans>();
  for (const s of spans) groups.set(s.ref, [...(groups.get(s.ref) ?? []), s]);
  return [...groups.values()].map(g => {
    const first = g[0];
    const { speech, entry } = behind[first.index];
    const joined = g.map(s => s.text).join(joiner);
    let strikable = true;
    let why: string | undefined;
    const no = (reason: string) => { if (strikable) { strikable = false; why = reason; } };
    if (joined.length > MAX_STRUCK_TEXT) no(`too long to record (over ${MAX_STRUCK_TEXT} characters)`);
    if (entry) {
      if (entry.role === 'text') no("a node needs its text; strike a variant, or rewrite it");
      else if (entry.flow) no('written in flow style ([a, b]); rewrite it instead');
      else if (entry.item === null) no('not a plain list entry in the YAML; rewrite it instead');
      else if (entry.role === 'bark' && entry.seq && entry.seq.count < 2) no('a bark pool needs at least one line; rewrite it instead');
    }
    return {
      ref: first.ref, start: first.start, end: first.end, text: joined,
      ...(first.speaker ? { speaker: first.speaker } : {}),
      units: g.map(s => s.index), strikable, ...(why ? { why } : {}),
      break: breaks.has(first.index),
      removal: entry?.item ?? [first.start, first.end], speech, seq: entry?.seq ?? null,
    };
  });
}
