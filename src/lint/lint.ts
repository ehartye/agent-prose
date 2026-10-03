import type { Doc, Format } from '../ir.ts';
import { ProseError } from '../errors.ts';
import { rulesFor, type Rule } from '../craft/rules.ts';
import { measure, type Measurement } from '../measure/index.ts';
import { EVALUATORS } from './evaluators.ts';

export interface Finding {
  rule: string;
  severity: Rule['severity'];
  message: string;
  at: { line: number | null; speaker?: string };
  measured?: unknown;
  fix?: string;
  tradeoffs?: Rule['conflicts'];
}
export interface LintResult {
  path: string;
  format: Format;
  form: string;
  register: string | null;
  ok: boolean;
  errors: Finding[];
  warnings: Finding[];
  info: Finding[];
  judgement: Array<{ rule: string; severity: Rule['severity']; statement: string; sources: string[] }>;
}

/** Lint a document; pass a measurement already taken to avoid measuring twice. */
export function lint(doc: Doc, m: Measurement = measure(doc)): LintResult {
  const out: LintResult = {
    path: doc.path, format: doc.format, form: doc.form, register: doc.register ?? null,
    ok: true, errors: [], warnings: [], info: [], judgement: [],
  };
  for (const rule of rulesFor(doc.form, doc.register)) {
    if (rule.check === 'judgement') { out.judgement.push({ rule: rule.id, severity: rule.severity, statement: rule.statement, sources: rule.sources }); continue; }
    const evaluate = EVALUATORS[rule.id];
    if (!evaluate) throw new ProseError('E_INTERNAL', `Auto rule ${rule.id} has no evaluator`);
    for (const hit of evaluate({ doc, m, rule })) {
      const finding: Finding = {
        rule: rule.id, severity: rule.severity, message: hit.message,
        at: { line: hit.line ?? null, ...(hit.speaker ? { speaker: hit.speaker } : {}) },
        ...(hit.measured !== undefined ? { measured: hit.measured } : {}),
        ...(hit.fix ? { fix: hit.fix } : {}),
        ...(rule.conflicts.length ? { tradeoffs: rule.conflicts } : {}),
      };
      (rule.severity === 'error' ? out.errors : rule.severity === 'warn' ? out.warnings : out.info).push(finding);
    }
  }
  // by source line, document-level (null) findings first; Array#sort is stable, so rule order breaks ties
  const byLine = (a: Finding, b: Finding) => (a.at.line ?? -1) - (b.at.line ?? -1);
  out.errors.sort(byLine);
  out.warnings.sort(byLine);
  out.info.sort(byLine);
  out.ok = out.errors.length === 0;
  return out;
}
