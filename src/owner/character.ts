// Resolving the brief's character against the project's voice bibles (milestone 5 of the line review spec): a voice id
// snapshots the bible's bio; the speaker of the reviewed lines finds a bible when no character was given.
import { loadDocument } from '../document.ts';
import { unitSpans, parseRefs, selectSpans } from '../strike/spans.ts';
import { loadVoices, voiceFor, type Voice } from '../voice.ts';

export const MAX_CHARACTER = 600;
const ID_SHAPE = /^[a-z0-9-]+$/;

/** The text a brief keeps from a bible: its bio, else "Name. Description", cut to the brief's limit. Taken once, so a later bible edit never changes a set. */
export function snapshotOf(v: Voice): string {
  const text = (v.bio ?? `${v.name}. ${v.description}`).replace(/\r\n?/g, '\n').trim();
  return text.length > MAX_CHARACTER ? `${text.slice(0, MAX_CHARACTER - 1)}…` : text;
}

export interface ResolvedCharacter { character?: string; characterRef?: string; notes: string[] }

/**
 * `--character <value>`: an id match wins. A value shaped like a voice id (lower-case letters, digits, hyphens) that names
 * a bible is that bible's snapshot, with `characterRef` recording the id; anything else is inline text, as before milestone 5.
 * An id-shaped value with no bible stays inline text and says so (a one-word character is usually a mistyped id).
 */
export function resolveCharacterText(project: string, value: string): ResolvedCharacter {
  const trimmed = value.trim();
  if (!ID_SHAPE.test(trimmed)) return { character: value, notes: [] };
  const bible = loadVoices(project).find(v => v.id === trimmed);
  if (bible) return { character: snapshotOf(bible), characterRef: bible.id, notes: [`character taken from voice bible ${bible.id} (${bible.bio ? 'its bio' : 'name and description, it has no bio'}); later edits to the bible do not change this set`] };
  return { character: value, notes: [`no voice named ${trimmed}; stored as inline text`] };
}

/**
 * No `--character`: the bible of the speakers of the reviewed lines (`--lines`, else the whole draft). Exactly one bible
 * resolves; none resolves nothing, and several resolve nothing with a note naming them (no guessing).
 */
export function resolveBySpeaker(project: string, draft: string, text: string, lines: string | undefined): ResolvedCharacter {
  const bibles = loadVoices(project);
  if (!bibles.length) return { notes: [] };
  const doc = loadDocument(draft);
  const speakers = lines === undefined
    ? doc.blocks.map(b => b.speaker)
    : selectSpans(unitSpans(text, doc.format, doc.form), parseRefs(lines)).map(s => s.speaker);
  const found = [...new Set(speakers.filter((s): s is string => !!s).map(s => voiceFor(bibles, s)?.id).filter((v): v is string => !!v))];
  if (found.length === 1) {
    const bible = bibles.find(v => v.id === found[0])!;
    return { character: snapshotOf(bible), characterRef: bible.id, notes: [`character taken from voice bible ${bible.id}, the speaker of ${lines === undefined ? 'this draft' : 'these lines'} (${bible.bio ? 'its bio' : 'name and description, it has no bio'}); it is not confirmed with the owner yet. Pass --character <text> to use other words`] };
  }
  if (found.length > 1) return { notes: [`${found.length} voice bibles match the speakers here (${found.join(', ')}); no character was chosen. Pass --character <voice-id> or --character <text>`] };
  return { notes: [] };
}
