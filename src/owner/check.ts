import { loadDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import type { Doc } from '../ir.ts';
import { PROSE_KINDS } from '../kinds.ts';
import { lint } from '../lint/lint.ts';
import { directionScore, moveMin } from './directions.ts';
import { distance, featureVector, type FeatureVector } from './features.ts';
import { BARELY_CHANGED_AT, DUPLICATE_AT, SIMILAR_AT, similarity } from './similarity.ts';
import { basePath, variantPath, type PromptSet } from './sets.ts';
import { MIN_VARIANTS } from './sets.ts';
import { round2 } from '../text.ts';

export interface VariantCheck {
  index: number;
  file: string;
  direction: string | null;
  label: string | null;
  status: 'ok' | 'rejected';
  reasons: string[];
  warnings: string[];
  words: number | null;
  movement: { direction: string; score: number; moved: boolean } | null;
  vsBase: { similarity: number; distance: number } | null;
}

export interface CheckResult {
  set: string;
  ok: boolean;
  keep: number[];
  rejected: Array<{ index: number; reasons: string[] }>;
  /** Set-level warnings (not about one variant): they never reject anything. */
  warnings: string[];
  variants: VariantCheck[];
  next: string;
}

const proseText = (doc: Doc) => doc.blocks.filter(b => PROSE_KINDS.has(b.kind)).map(b => b.text).join('\n');
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

interface Loaded { doc: Doc; text: string; vec: FeatureVector }

export function checkSet(project: string, set: PromptSet): CheckResult {
  const baseDoc = loadDocument(basePath(project, set), { form: set.form });
  const baseText = proseText(baseDoc);
  const baseVec = featureVector(baseDoc);
  const baseErrors = new Set(lint(baseDoc).errors.map(f => f.rule));

  const loaded = new Map<number, Loaded>();
  const variants: VariantCheck[] = set.variants.map(v => {
    const out: VariantCheck = {
      index: v.index, file: v.file, direction: v.direction, label: v.label ?? null,
      status: 'ok', reasons: [], warnings: [], words: null, movement: null, vsBase: null,
    };
    let doc: Doc;
    try {
      doc = loadDocument(variantPath(project, set, v), { form: set.form });
    } catch (e) {
      out.status = 'rejected';
      out.reasons.push(`parse-error: ${e instanceof ProseError ? e.message : String(e)}`);
      return out;
    }
    const declared = doc.meta.form;
    if (typeof declared === 'string' && declared.toLowerCase() !== set.form) {
      out.reasons.push(`form-changed: declares ${declared.toLowerCase()}, the set is ${set.form}`);
    }
    const text = proseText(doc);
    const vec = featureVector(doc);
    loaded.set(v.index, { doc, text, vec });
    out.words = Math.round(2 ** vec.length);
    const sim = similarity(baseText, text);
    out.vsBase = { similarity: sim, distance: round2(distance(baseVec, vec)) };
    if (norm(text) === norm(baseText)) out.reasons.push('unchanged');
    else if (sim >= BARELY_CHANGED_AT) out.reasons.push('barely-changed');
    const fresh = lint(doc).errors.filter(f => !baseErrors.has(f.rule));
    for (const f of fresh) out.reasons.push(`lint-error: ${f.rule}${f.at.line !== null ? ` at line ${f.at.line}` : ''} - ${f.message}`);
    if (v.direction) {
      const score = round2(directionScore(baseVec, vec, v.direction));
      out.movement = { direction: v.direction, score, moved: score >= moveMin(v.direction) };
      if (!out.movement.moved && out.reasons.length === 0) out.warnings.push(`weak-direction: ${v.direction} moved ${score} (needs at least ${moveMin(v.direction)})`);
    }
    if (out.reasons.length) out.status = 'rejected';
    return out;
  });

  // Pairwise: a later variant that repeats an earlier surviving one is rejected or warned about.
  const byLabel = new Map<string, number>();
  for (const v of variants) {
    if (v.status === 'rejected') continue;
    const mine = loaded.get(v.index)!;
    for (const earlier of variants) {
      if (earlier.index >= v.index || earlier.status === 'rejected') continue;
      const sim = similarity(loaded.get(earlier.index)!.text, mine.text);
      if (sim >= DUPLICATE_AT) { v.status = 'rejected'; v.reasons.push(`duplicate-of #${earlier.index}`); break; }
      if (sim >= SIMILAR_AT) v.warnings.push(`similar-to #${earlier.index} (${sim})`);
    }
    if (v.status === 'rejected') continue;
    if (v.label) {
      const key = norm(v.label);
      const first = byLabel.get(key);
      if (first !== undefined) v.warnings.push(`same-angle-as #${first} ("${key}")`);
      else byLabel.set(key, v.index);
    }
  }

  // The check judges variants; whether the owner agreed to the brief they were written against cannot be verified here.
  const warnings = set.brief && !set.brief.confirmedAt
    ? ['brief-unconfirmed: the owner has not confirmed the brief these variants were written against (prose set brief ' + set.id + ' --confirmed, once they agree)']
    : [];
  const keep = variants.filter(v => v.status === 'ok').map(v => v.index);
  const rejected = variants.filter(v => v.status === 'rejected').map(v => ({ index: v.index, reasons: v.reasons }));
  const ok = keep.length >= MIN_VARIANTS;
  return {
    set: set.id, ok, keep, rejected, warnings, variants,
    next: ok
      ? `Seal your guess before the owner sees anything: prose predict --set ${set.id} --pick <n> --why "..."; then present the kept variants (${keep.join(', ')})`
      : `Only ${keep.length} variant(s) survive; a set needs at least ${MIN_VARIANTS}. Rewrite the rejected ones (${rejected.map(r => r.index).join(', ') || 'none'}) and run prose set check ${set.id} again`,
  };
}
