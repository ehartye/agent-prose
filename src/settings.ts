// Measurement settings, most specific last: form defaults, then the project's project.json, then the document's metadata.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Doc } from './ir.ts';
import { ProseError } from './errors.ts';
import { FORMS, getForm, type Form } from './forms.ts';
import { PROJECT_DIR, PROJECT_FILE } from './project.ts';
import { readTarget, type Target } from './target.ts';

const FormSettings = z.strictObject({
  wpm: z.number().positive().optional(),
  boxChars: z.number().int().positive().optional(),
  boxLines: z.number().int().positive().optional(),
});
export const ProjectSchema = z.strictObject({
  schema: z.literal('prose/project@1'),
  wpm: z.number().positive().optional(),
  forms: z.record(z.string(), FormSettings).default({}),
}).superRefine((p, ctx) => {
  for (const [id, s] of Object.entries(p.forms)) {
    const form = FORMS.find(f => f.id === id);
    if (!form) { ctx.addIssue({ code: 'custom', path: ['forms', id], message: `unknown form "${id}"` }); continue; }
    if (s.wpm !== undefined && !form.wpm) ctx.addIssue({ code: 'custom', path: ['forms', id, 'wpm'], message: `form ${id} is timed by pages, not words per minute` });
    for (const key of ['boxChars', 'boxLines'] as const) {
      if (s[key] !== undefined && !form[key]) ctx.addIssue({ code: 'custom', path: ['forms', id, key], message: `form ${id} has no dialog box` });
    }
  }
});
export type ProjectSettings = z.infer<typeof ProjectSchema>;

export interface Settings { wpm: number | null; boxChars: number | null; boxLines: number | null; target: Target | null }

/** The project's project.json, validated; E_SCHEMA names the file and the field. */
export function loadProjectSettings(projectDir: string): ProjectSettings {
  const file = join(projectDir, PROJECT_DIR, PROJECT_FILE);
  const hint = 'project.json holds schema "prose/project@1", optional wpm, and forms.<id>.{wpm, boxChars, boxLines}';
  if (!existsSync(file)) return { schema: 'prose/project@1', forms: {} };
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    throw new ProseError('E_SCHEMA', `project.json: ${(e as Error).message}`, { pointer: '', details: { file }, hint });
  }
  const r = ProjectSchema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new ProseError('E_SCHEMA', `project.json: ${issue.message}`, {
      pointer: issue.path.length ? '/' + issue.path.join('/') : '', details: { file }, hint,
    });
  }
  return r.data;
}

/** A document's wpm: a positive number, or a numeric string as a title page writes it. */
function readWpm(raw: unknown, form: Form): number | undefined {
  if (raw == null) return undefined;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(raw) ? Number(raw) : NaN;
  if (!(n > 0)) throw new ProseError('E_SCHEMA', 'wpm must be a positive number of words per minute', { pointer: '/wpm' });
  if (!form.wpm) throw new ProseError('E_SCHEMA', `form ${form.id} is timed by pages, not words per minute`, { pointer: '/wpm', hint: 'Remove wpm, or declare a spoken form that is timed by words' });
  return n;
}

/**
 * The settings a measurement uses. wpm applies only to forms timed by words per minute, and the box only to forms
 * with a dialog box; other forms get null.
 */
export function resolveSettings(doc: Doc, project: string | null): Settings {
  const form = getForm(doc.form);
  const p = project ? loadProjectSettings(project) : null;
  const f = p?.forms[form.id] ?? {};
  const docWpm = readWpm(doc.meta.wpm, form);
  return {
    wpm: form.wpm ? (docWpm ?? f.wpm ?? p?.wpm ?? form.wpm) : null,
    boxChars: form.boxChars ? (f.boxChars ?? form.boxChars) : null,
    boxLines: form.boxLines ? (f.boxLines ?? form.boxLines) : null,
    target: readTarget(doc.meta.target),
  };
}
