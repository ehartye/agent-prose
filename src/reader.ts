import type { Format } from './ir.ts';
import { ProseError } from './errors.ts';

/** Intended readers and an optional requested text level; school placement does not imply a target. */
export interface Reader {
  language: string;
  schoolGrade?: number;
  ageGroup?: 'child' | 'adolescent' | 'adult' | 'mixed';
  priorKnowledge?: string;
  readingLevel?: { scale: 'us-grade'; range: [number, number] };
  essentialTerms?: string[];
}

function fail(pointer: string, message: string): never {
  throw new ProseError('E_SCHEMA', message, { pointer });
}

function object(value: unknown, pointer: string, keys: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(pointer, `${pointer} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      const escaped = key.replace(/~/g, '~0').replace(/\//g, '~1');
      fail(`${pointer}/${escaped}`, `Unknown key "${key}" in ${pointer}`);
    }
  }
  return value as Record<string, unknown>;
}

function nonempty(value: unknown, pointer: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(pointer, `${pointer} must be a nonempty string`);
  return value;
}

function grade(value: unknown, pointer: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 4 || value > 12) {
    fail(pointer, `${pointer} must be a U.S. grade integer from 4 through 12`);
  }
  return value;
}

function strings(value: unknown, pointer: string, nonemptyItems: boolean): string[] {
  if (!Array.isArray(value)) fail(pointer, `${pointer} must be a list of strings`);
  return value.map((item, index) => {
    if (nonemptyItems) return nonempty(item, `${pointer}/${index}`);
    if (typeof item !== 'string') fail(`${pointer}/${index}`, `${pointer}/${index} must be a string`);
    return item;
  });
}

// RFC 5646 §2.1 fixes this grandfathered list; ordinary tag syntax cannot recognize every entry.
const GRANDFATHERED = new Set([
  'en-gb-oed', 'i-ami', 'i-bnn', 'i-default', 'i-enochian', 'i-hak', 'i-klingon', 'i-lux', 'i-mingo',
  'i-navajo', 'i-pwn', 'i-tao', 'i-tay', 'i-tsu', 'sgn-be-fr', 'sgn-be-nl', 'sgn-ch-de',
  'art-lojban', 'cel-gaulish', 'no-bok', 'no-nyn', 'zh-guoyu', 'zh-hakka', 'zh-min', 'zh-min-nan', 'zh-xiang',
]);
const LANGUAGE_TAG = new RegExp([
  '^(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4,8})', // language and optional extlangs
  '(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?', // optional script and region
  '((?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*)', // variants
  '((?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*)', // extensions (x is reserved)
  '(?:-x(?:-[a-z0-9]{1,8})+)?$', // optional private-use sequence
].join(''));

/**
 * Check RFC 5646 syntax and duplicate variants/singletons (§2.2.9), without consulting a registry.
 * Intl handles modern canonicalization. Tags outside Intl's locale syntax (including private-use,
 * grandfathered and extlang forms) fall back to ASCII lowercase, with no preferred-value mappings.
 * This is structural validation, not a claim of IANA registration or supported reading measurement.
 */
function normalizeLanguage(language: string): string {
  const invalid = () => fail('/reader/language', '/reader/language must have BCP 47 syntax with no duplicate variants or extension singletons');
  // Reject non-ASCII and whitespace explicitly, including a final newline that a regex $ could otherwise skip.
  if (/[^A-Za-z0-9-]/.test(language)) invalid();
  const lower = language.toLowerCase();
  if (!GRANDFATHERED.has(lower) && !/^x(?:-[a-z0-9]{1,8})+$/.test(lower)) {
    const match = LANGUAGE_TAG.exec(lower);
    if (!match) return invalid();
    const variants = match[1].split('-').slice(1);
    const singletons = [...match[2].matchAll(/-([0-9a-wy-z])(?=-)/g)].map(m => m[1]);
    if (new Set(variants).size !== variants.length || new Set(singletons).size !== singletons.length) invalid();
  }
  try { return Intl.getCanonicalLocales(language)[0]; }
  catch { return lower; }
}

/** Validate a standalone profile, returning normalized language without changing the document metadata. */
export function readReader(meta: Record<string, unknown>): Reader | null {
  if (!Object.hasOwn(meta, 'reader')) return null;
  const raw = object(meta.reader, '/reader', ['language', 'schoolGrade', 'ageGroup', 'priorKnowledge', 'readingLevel', 'essentialTerms']);
  const reader: Reader = { language: normalizeLanguage(nonempty(raw.language, '/reader/language')) };
  if (Object.hasOwn(raw, 'schoolGrade')) reader.schoolGrade = grade(raw.schoolGrade, '/reader/schoolGrade');
  if (Object.hasOwn(raw, 'ageGroup')) {
    const age = raw.ageGroup;
    if (age !== 'child' && age !== 'adolescent' && age !== 'adult' && age !== 'mixed') {
      fail('/reader/ageGroup', '/reader/ageGroup must be child, adolescent, adult or mixed');
    }
    reader.ageGroup = age;
  }
  if (Object.hasOwn(raw, 'priorKnowledge')) reader.priorKnowledge = nonempty(raw.priorKnowledge, '/reader/priorKnowledge');
  if (Object.hasOwn(raw, 'readingLevel')) {
    const level = object(raw.readingLevel, '/reader/readingLevel', ['scale', 'range']);
    if (level.scale !== 'us-grade') fail('/reader/readingLevel/scale', '/reader/readingLevel/scale must be us-grade');
    if (!Array.isArray(level.range) || level.range.length !== 2) {
      fail('/reader/readingLevel/range', '/reader/readingLevel/range must contain exactly two grade integers');
    }
    const low = grade(level.range[0], '/reader/readingLevel/range/0');
    const high = grade(level.range[1], '/reader/readingLevel/range/1');
    if (low > high) fail('/reader/readingLevel/range', '/reader/readingLevel/range must be ordered from lower to higher grade');
    reader.readingLevel = { scale: 'us-grade', range: [low, high] };
  }
  if (Object.hasOwn(raw, 'essentialTerms')) reader.essentialTerms = strings(raw.essentialTerms, '/reader/essentialTerms', true);
  return reader;
}

/** Form and format validation runs after document form resolution, including any command-line override. */
export function validateLearningMetadata(meta: Record<string, unknown>, format: Format, form: string): void {
  if (Object.hasOwn(meta, 'reader')) {
    if (format !== 'markdown') fail('/reader', 'reader metadata is supported only for Markdown documents');
    readReader(meta);
  }
  if (form !== 'textbook') {
    if (Object.hasOwn(meta, 'teaching')) fail('/teaching', 'teaching metadata is supported only for the textbook form');
    return;
  }
  const teaching = object(meta.teaching, '/teaching', ['unit', 'goals', 'prerequisites']);
  if (teaching.unit !== 'explanation' && teaching.unit !== 'lesson' && teaching.unit !== 'chapter') {
    fail('/teaching/unit', '/teaching/unit must be explanation, lesson or chapter');
  }
  const goals = strings(teaching.goals, '/teaching/goals', true);
  if (goals.length === 0) fail('/teaching/goals', '/teaching/goals must contain at least one learning goal');
  if (Object.hasOwn(teaching, 'prerequisites')) strings(teaching.prerequisites, '/teaching/prerequisites', false);
}
