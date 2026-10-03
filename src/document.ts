import { existsSync, readFileSync, statSync } from 'node:fs';
import type { Block, Doc, Format } from './ir.ts';
import type { DialogGraph } from './dialog-types.ts';
import { ProseError } from './errors.ts';
import { DEFAULT_FORM, getForm } from './forms.ts';
import { parseDialog } from './parse/dialog.ts';
import { parseFountain } from './parse/fountain.ts';
import { parseMarkdown } from './parse/markdown.ts';

export function detectFormat(path: string): Format {
  if (/\.fountain$/i.test(path)) return 'fountain';
  if (/\.(?:md|markdown)$/i.test(path)) return 'markdown';
  if (/\.ya?ml$/i.test(path)) return 'dialog';
  throw new ProseError('E_USAGE', `Cannot tell the format of ${path}`, { hint: 'Use .fountain, .md or .dialog.yaml' });
}

export function loadDocument(path: string, options: { form?: string } = {}): Doc {
  if (!existsSync(path)) throw new ProseError('E_NOT_FOUND', `No such file: ${path}`);
  if (!statSync(path).isFile()) throw new ProseError('E_NOT_FOUND', `Not a file: ${path}`);
  const format = detectFormat(path);
  // One line-ending convention for every parser: CRLF and lone CR become LF, so frontmatter and line numbers hold.
  const source = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let meta: Record<string, unknown>;
  let blocks: Block[];
  let graph: DialogGraph | undefined;
  if (format === 'fountain') ({ meta, blocks } = parseFountain(source));
  else if (format === 'markdown') ({ meta, blocks } = parseMarkdown(source));
  else ({ meta, blocks, graph } = parseDialog(source));
  for (const key of ['form', 'register'] as const) {
    if (meta[key] !== undefined && typeof meta[key] !== 'string') {
      throw new ProseError('E_SCHEMA', `"${key}" must be a string`, { pointer: `/${key}`, hint: `Write ${key}: <id> in the document's metadata` });
    }
  }
  // A bad --form is a usage error; a bad form declared in the document is a schema error at /form.
  const declared = options.form === undefined && typeof meta.form === 'string';
  const resolveForm = () => {
    const f = getForm(options.form?.toLowerCase() ?? (declared ? (meta.form as string).toLowerCase() : DEFAULT_FORM[format]));
    if (f.format !== format) throw new ProseError('E_USAGE', `Form "${f.id}" expects ${f.format}, but ${path} is ${format}`);
    return f;
  };
  let form: ReturnType<typeof getForm>;
  try { form = resolveForm(); }
  catch (e) {
    if (declared && e instanceof ProseError) throw new ProseError('E_SCHEMA', e.message, { pointer: '/form', ...(e.hint ? { hint: e.hint } : {}) });
    throw e;
  }
  return {
    path, format, form: form.id,
    ...(typeof meta.register === 'string' ? { register: meta.register } : {}),
    meta, blocks,
    ...(graph ? { graph } : {}),
  };
}
