import { randomBytes } from 'node:crypto';
import { linkSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { ProseError } from '../errors.ts';
import { createConceptRegistry, inspectConceptRegistry } from '../annotation/concepts.ts';
import { readData as dataFile, readText as textFile } from '../annotation/files.ts';
import {
  compileAnnotations, createAnnotationFile, decideAnnotation, findCandidates, inspectAnnotationFile, proposeAnnotations, revalidateAnnotations,
} from '../annotation/store.ts';
import {
  closeAnnotationPreview, getAnnotationFeedback, getAnnotationPreviewStatus, openAnnotationPreview,
} from '../annotation/workbench.ts';

const PROFILES = ['markdown', 'html', 'structured'] as const;
const ACTIONS = ['accept', 'reject', 'defer', 'edit', 'retarget', 'undo'] as const;
const EXPORTS = ['json', 'html', 'web-annotation'] as const;

function choice<T extends string>(value: string, values: readonly T[], flag: string): T {
  if (!(values as readonly string[]).includes(value)) throw new ProseError('E_USAGE', `${flag} must be one of: ${values.join(', ')}`);
  return value as T;
}

function wholeNumber(value: string, flag: string, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n > max) throw new ProseError('E_USAGE', `${flag} must be a whole number from 0 to ${max}`);
  return n;
}

/** A complete new artifact appears at once, and an existing path can never be replaced. */
function exportFile(file: string, contents: string): void {
  const absolute = resolve(file);
  const temporary = `${absolute}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, contents, { flag: 'wx' });
    linkSync(temporary, absolute);
  } catch (e) {
    const cause = (e as NodeJS.ErrnoException).code;
    throw new ProseError(cause === 'EEXIST' ? 'E_CONFLICT' : cause === 'ENOENT' ? 'E_NOT_FOUND' : 'E_INTERNAL', `Could not export to ${file}`, {
      hint: cause === 'EEXIST' ? 'Choose a new output path; exports never overwrite an existing file' : 'Check that the output directory exists and is writable',
      details: { cause },
    });
  } finally { try { rmSync(temporary, { force: true }); } catch { /* preserve the original export failure */ } }
}

export function registerAnnotationCommands(program: Command, io: Io): void {
  const concepts = program.command('concepts').description('Persistent project concepts and vocabulary lists');
  concepts.command('init').description('Create a versioned concept registry without replacing existing files')
    .option('--file <path>', 'registry path', 'concepts.yaml')
    .option('--project <name>', 'project identity')
    .option('--language <tag>', 'content language')
    .action((opts: { file: string; project?: string; language?: string }) => {
      createConceptRegistry(opts.file, { project: opts.project, language: opts.language });
      io.emit({ file: resolve(opts.file), ...inspectConceptRegistry(opts.file) });
    });
  concepts.command('show').description('Read a registry, optionally selecting one vocabulary list')
    .option('--file <path>', 'registry path', 'concepts.yaml')
    .option('--list <id>', 'vocabulary list identity')
    .action((opts: { file: string; list?: string }) => {
      const result = inspectConceptRegistry(opts.file);
      if (!opts.list) { io.emit({ file: resolve(opts.file), ...result }); return; }
      const members = Object.hasOwn(result.registry.lists, opts.list) ? result.registry.lists[opts.list] : undefined;
      if (!members) throw new ProseError('E_NOT_FOUND', `Unknown vocabulary list: ${opts.list}`);
      io.emit({ file: resolve(opts.file), revision: result.revision, list: { id: opts.list, concepts: members }, concepts: result.registry.concepts.filter(c => members.includes(c.id)) });
    });
  concepts.command('check').description('Validate registry identities, references and aliases')
    .option('--file <path>', 'registry path', 'concepts.yaml')
    .action((opts: { file: string }) => {
      const inspection = inspectConceptRegistry(opts.file);
      io.emit({ file: resolve(opts.file), ...inspection });
      if (inspection.problems.length) throw new ProseError('E_SCHEMA', 'Concept registry has unresolved references or identity problems', { details: { problems: inspection.problems } });
    });

  const annotation = program.command('annotation').description('Locate, review and publish portable source annotations');
  annotation.command('init <source>').description('Create a sidecar for Markdown, static HTML or an inert structured snapshot')
    .option('--out <path>', 'new sidecar path')
    .option('--profile <name>', 'markdown, html or structured source profile')
    .option('--document <id>', 'document identity to select within a structured snapshot')
    .option('--content-root <selector>', 'static HTML content root: one tag or #id')
    .option('--root <path>', 'content root containing source and registry')
    .option('--concepts <path>', 'persistent concept registry')
    .action((source: string, opts: { out?: string; profile?: string; document?: string; contentRoot?:string; root?: string; concepts?: string }) => {
      const profile = opts.profile === undefined ? undefined : choice(opts.profile, PROFILES, '--profile');
      io.emit(createAnnotationFile(source, opts.out, { profile, sourceDocument: opts.document, contentRoot:opts.contentRoot, root: opts.root, concepts: opts.concepts }));
    });
  annotation.command('locate <sidecar>').description('Find exact candidate occurrences without changing source or sidecar')
    .option('--quote <text>', 'exact passage text')
    .option('--concept <id>', 'concept label and aliases')
    .option('--list <id>', 'vocabulary list labels and aliases')
    .action((file: string, opts: { quote?: string; concept?: string; list?: string }) => {
      if ([opts.quote, opts.concept, opts.list].filter(v => v !== undefined).length !== 1) throw new ProseError('E_USAGE', 'Supply exactly one of --quote, --concept or --list');
      io.emit(findCandidates(file, opts));
    });
  annotation.command('propose <sidecar>').description('Add candidate-bound annotation proposals from a JSON or YAML array')
    .requiredOption('--in <path>', 'proposal array file')
    .option('--expect <revision>', 'sidecar revision required for this write')
    .option('--event <id>', 'idempotent event identity')
    .action((file: string, opts: { in: string; expect?: string; event?: string }) => {
      const proposals = dataFile(opts.in);
      if (!Array.isArray(proposals)) throw new ProseError('E_SCHEMA', 'Proposal input must be an array');
      io.emit(proposeAnnotations(file, proposals as Parameters<typeof proposeAnnotations>[1], { expectedRevision: opts.expect, eventId: opts.event }));
    });
  annotation.command('check <sidecar>').description('Validate source, registry, target resolution and review dependencies')
    .option('--save', 'persist deterministic rebinding when accepted annotation dependencies remain valid')
    .option('--expect <revision>', 'sidecar revision required for --save')
    .action((file: string, opts: { save?: boolean; expect?: string }) => {
      if (!opts.save && opts.expect !== undefined) throw new ProseError('E_USAGE', '--expect requires --save for annotation check');
      const inspection = opts.save ? revalidateAnnotations(file, { expectedRevision: opts.expect }) : inspectAnnotationFile(file);
      io.emit(inspection);
      if (inspection.problems.length) throw new ProseError('E_SCHEMA', 'Annotation sidecar has unresolved identity or reference problems', { details: { problems: inspection.problems } });
    });
  annotation.command('review <sidecar> <id>').description('Accept, reject, defer, edit, retarget or undo an annotation decision')
    .requiredOption('--action <name>', ACTIONS.join(', '))
    .option('--body <text>', 'replacement plain text body')
    .option('--body-file <path>', 'read replacement plain text body from a file')
    .option('--candidate <id>', 'candidate identity returned by locate')
    .option('--target <path>', 'replacement target selector in JSON or YAML')
    .option('--reason <text>', 'optional decision reason')
    .option('--expect <revision>', 'sidecar revision required for this write')
    .option('--event <id>', 'idempotent event identity')
    .action((file: string, id: string, opts: { action: string; body?: string; bodyFile?: string; candidate?: string; target?: string; reason?: string; expect?: string; event?: string }) => {
      const action = choice(opts.action, ACTIONS, '--action');
      if (opts.body !== undefined && opts.bodyFile !== undefined) throw new ProseError('E_USAGE', 'Supply either --body or --body-file');
      if (opts.candidate !== undefined && opts.target !== undefined) throw new ProseError('E_USAGE', 'Supply either --candidate or --target');
      const target = opts.target === undefined ? undefined : dataFile(opts.target) as NonNullable<Parameters<typeof decideAnnotation>[1]['target']>;
      io.emit(decideAnnotation(file, { id, action, body: opts.bodyFile === undefined ? opts.body : textFile(opts.bodyFile), target, candidate: opts.candidate, reason: opts.reason, expectedRevision: opts.expect, eventId: opts.event }));
    });
  annotation.command('preview <sidecar>').description('Open an author review workbench bound to this machine only')
    .option('--local', 'bind only to 127.0.0.1 (always enforced)')
    .option('--port <number>', 'port from 0 to 65535; 0 selects an available port')
    .action(async (file: string, opts: { local?: boolean; port?: string }) => {
      io.emit(await openAnnotationPreview(file, { local: true, port: opts.port === undefined ? undefined : wholeNumber(opts.port, '--port', 65535) }));
    });
  annotation.command('status <session>').description('Read annotation workbench status')
    .action(async (session: string) => { io.emit(await getAnnotationPreviewStatus(session)); });
  annotation.command('feedback <session>').description('Read canonical annotation decisions since a cursor')
    .option('--since <cursor>', 'nonnegative feedback cursor', '0')
    .action(async (session: string, opts: { since: string }) => { io.emit(await getAnnotationFeedback(session, wholeNumber(opts.since, '--since'))); });
  annotation.command('close <session>').description('Close an annotation workbench without changing its decisions')
    .action(async (session: string) => { io.emit(await closeAnnotationPreview(session)); });
  annotation.command('export <sidecar>').description('Export accepted current annotations to a new artifact')
    .requiredOption('--to <format>', 'json, html or web-annotation')
    .requiredOption('--out <path>', 'new output path; existing files are never replaced')
    .action((file: string, opts: { to: string; out: string }) => {
      const format = choice(opts.to, EXPORTS, '--to');
      const compiled = compileAnnotations(file);
      const contents = format === 'html' ? compiled.html : `${JSON.stringify(format === 'json' ? compiled.bundle : compiled.webAnnotation, null, 2)}\n`;
      exportFile(opts.out, contents);
      io.emit({ file: resolve(opts.out), format, report: format === 'web-annotation' ? compiled.webAnnotation.report : compiled.report });
    });
}
