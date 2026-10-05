import { ProseError } from './errors.ts';
import type { Foot } from './verse/meter.ts';

/**
 * An author-declared syllable pattern and rhyme scheme for a verse draft (words written for an existing tune or hymn
 * meter), read from the frontmatter keys `syllables` and `scheme`. Each is the per-STANZA pattern, repeated for every
 * stanza, or a map from section base label (`verse`, `chorus`) to the pattern for that section's stanzas.
 */
export type SyllablePattern = number[] | Record<string, number[]>;
export type SchemePattern = string | Record<string, string>;
export interface Declared { syllables: SyllablePattern | null; scheme: SchemePattern | null; meter?: { foot: Foot; feet: number } }

const SYLLABLES_HINT = 'syllables accepts a list [8, 6, 8, 6], a string "8.6.8.6", "8 6 8 6" or "8,6,8,6", aliases "CM"/"8686", double notation "8.7.8.7.D", or a map by section: {verse: [8, 6, 8, 6], chorus: [7, 7, 8]}';
const SCHEME_HINT = 'scheme accepts one letter per line as a string ("abcb", "xaxa"; x is an unconstrained line), or a map by section: {verse: abcb, chorus: aabb}';

const isMap = (raw: unknown): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null && !Array.isArray(raw);
const fail = (key: 'syllables' | 'scheme', pointer: string, why: string) =>
  new ProseError('E_SCHEMA', `${key}: ${why}`, { pointer, hint: key === 'syllables' ? SYLLABLES_HINT : SCHEME_HINT });

function oneSyllables(raw: unknown, pointer: string): number[] {
  let items: unknown[];
  if (Array.isArray(raw)) items = raw;
  else if (typeof raw === 'string') {
    const notation = raw.trim().toUpperCase();
    if (notation === 'CM' || notation === '8686') return [8, 6, 8, 6];
    if (/\.D$/.test(notation)) {
      const pattern = oneSyllables(notation.slice(0, -2), pointer);
      return [...pattern, ...pattern];
    }
    items = raw.trim() === '' ? [] : raw.trim().split(/[\s.,]+/);
    const bad = items.find(t => typeof t === 'string' && !/^\d+$/.test(t));
    if (bad !== undefined) throw fail('syllables', pointer, `${bad === '' ? 'has an empty count (a trailing separator?)' : `has ${JSON.stringify(bad)}, which is not a whole number`}; separate counts with . , or a space, such as "8.6.8.6"`);
    items = items.map(Number);
  } else if (typeof raw === 'number' && Number.isInteger(raw)) {
    throw fail('syllables', pointer, `a single number is not a pattern; write [${raw}] or a string such as "${raw}"`);
  } else throw fail('syllables', pointer, 'must be a list of counts or a string such as "8.6.8.6" (quote it: a bare 8.6 is a decimal number)');
  if (!items.length) throw fail('syllables', pointer, 'must hold at least one count');
  for (const n of items) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) throw fail('syllables', pointer, `counts must be positive whole numbers, found ${JSON.stringify(n)}`);
  }
  return items as number[];
}

function oneScheme(raw: unknown, pointer: string): string {
  if (typeof raw !== 'string' || !/^[a-zA-Z]+$/.test(raw.trim())) throw fail('scheme', pointer, 'must be a string of letters, one per line, such as "abcb" or "xaxa"');
  return raw.trim().toLowerCase();
}

function read<T>(key: 'syllables' | 'scheme', raw: unknown, one: (v: unknown, pointer: string) => T): T | Record<string, T> | null {
  if (raw == null) return null;
  if (!isMap(raw)) return one(raw, `/${key}`);
  const out: Record<string, T> = {};
  for (const [section, value] of Object.entries(raw)) {
    const name = section.trim().toLowerCase();
    if (!name) throw fail(key, `/${key}`, 'has a section with no name');
    out[name] = one(value, `/${key}/${section}`);
  }
  if (!Object.keys(out).length) throw fail(key, `/${key}`, 'has no sections');
  return out;
}

/** Declared counts, rhyme scheme and optional textual meter; null when absent. Throws E_SCHEMA when malformed. */
export function readDeclared(meta: Record<string, unknown>): Declared | null {
  const syllables = read('syllables', meta.syllables, oneSyllables) as SyllablePattern | null;
  const scheme = read('scheme', meta.scheme, oneScheme) as SchemePattern | null;
  let meter: Declared['meter'];
  if (meta.meter != null) {
    const raw = meta.meter;
    if (!isMap(raw) || !['iamb', 'trochee', 'anapest', 'dactyl', 'common'].includes(String(raw.foot)) ||
      typeof raw.feet !== 'number' || !Number.isInteger(raw.feet) || raw.feet < 1) {
      throw new ProseError('E_SCHEMA', 'meter: needs a known foot and a positive whole-number feet count', {
        pointer: '/meter', hint: 'meter: {foot: iamb, feet: 5}; feet: iamb, trochee, anapest, dactyl, common. Textual scansion is advisory, not alignment with music.',
      });
    }
    meter = { foot: raw.foot as Foot, feet: raw.feet };
  }
  return syllables === null && scheme === null && !meter ? null : { syllables, scheme, ...(meter ? { meter } : {}) };
}

/** The pattern as the author would write it: `8.6.8.6`, `xaxa`, or `verse 8.6.8.6; chorus 7.7.8`. */
export function describeSyllables(p: SyllablePattern): string {
  return Array.isArray(p) ? p.join('.') : Object.entries(p).map(([k, v]) => `${k} ${v.join('.')}`).join('; ');
}
export function describeScheme(p: SchemePattern): string {
  return typeof p === 'string' ? p : Object.entries(p).map(([k, v]) => `${k} ${v}`).join('; ');
}
