import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectFormat, loadDocument } from '../src/document.ts';
import { FORMS, getForm } from '../src/forms.ts';
import { ProseError } from '../src/errors.ts';
import { fixture, run } from './helpers.ts';

const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

describe('forms', () => {
  it('registers the fifteen v1 forms and the verse forms', () => {
    expect(FORMS.map(f => f.id)).toHaveLength(24);
    expect(getForm('tv-drama').format).toBe('fountain');
    expect(code(() => getForm('no-such-form'))).toBe('E_USAGE');
  });
});

describe('loadDocument', () => {
  it('detects formats by extension', () => {
    expect(detectFormat('a.fountain')).toBe('fountain');
    expect(detectFormat('a.MD')).toBe('markdown');
    expect(detectFormat('a.dialog.yaml')).toBe('dialog');
    expect(code(() => detectFormat('a.docx'))).toBe('E_USAGE');
  });

  it('resolves the form from the document, a default, or an override', () => {
    expect(loadDocument(fixture('pilot.fountain')).form).toBe('tv-drama');
    expect(loadDocument(fixture('keynote.md')).form).toBe('speech-large');
    expect(loadDocument(fixture('keynote.md')).register).toBe('professional');
    expect(loadDocument(fixture('gate.dialog.yaml')).form).toBe('quest-dialog');
    expect(loadDocument(fixture('pilot.fountain'), { form: 'sitcom-multicam' }).form).toBe('sitcom-multicam');
  });

  it('rejects missing files and form/format mismatches', () => {
    expect(code(() => loadDocument(fixture('missing.md')))).toBe('E_NOT_FOUND');
    expect(code(() => loadDocument(fixture('pilot.fountain'), { form: 'speech-large' }))).toBe('E_USAGE');
  });

  it('strips a leading UTF-8 BOM before parsing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-bom-'));
    try {
      const path = join(dir, 'bom.fountain');
      writeFileSync(path, '\uFEFFTitle: X\nForm: stage-play\n\nINT. STAGE - NIGHT\n', 'utf8');
      expect(loadDocument(path).form).toBe('stage-play');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('normalizes CRLF and CR-only line endings for every format', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-eol-'));
    try {
      const md = ['---', 'form: speech-small', 'register: casual', '---', '', '# Hi', '', 'One line.', ''];
      const yaml = ['form: barks', 'barks:', '  - pool: idle', '    speaker: GUARD', '    context: idle', '    lines:', '      - Quiet night.', '      - Cold night.', ''];
      for (const [eol, tag] of [['\r\n', 'crlf'], ['\r', 'cr']] as const) {
        const mdPath = join(dir, `${tag}.md`);
        writeFileSync(mdPath, md.join(eol), 'utf8');
        const mdDoc = loadDocument(mdPath);
        expect(mdDoc.form).toBe('speech-small');
        expect(mdDoc.register).toBe('casual');
        expect(mdDoc.blocks.map(b => [b.kind, b.text, b.line])).toEqual([['heading', 'Hi', 6], ['paragraph', 'One line.', 8]]);
        const yamlPath = join(dir, `${tag}.dialog.yaml`);
        writeFileSync(yamlPath, yaml.join(eol), 'utf8');
        const dlg = loadDocument(yamlPath);
        expect(dlg.form).toBe('barks');
        expect(dlg.blocks.map(b => [b.text, b.line])).toEqual([['Quiet night.', 7], ['Cold night.', 8]]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads the form id case-insensitively', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-form-'));
    try {
      const path = join(dir, 'case.fountain');
      writeFileSync(path, 'Title: X\nForm: Stage-Play\n\nINT. STAGE - NIGHT\n', 'utf8');
      expect(loadDocument(path).form).toBe('stage-play');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads the --form override case-insensitively', () => {
    expect(loadDocument(fixture('pilot.fountain'), { form: 'Sitcom-Multicam' }).form).toBe('sitcom-multicam');
  });

  it('rejects a path that is not a file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-dir-'));
    try {
      const path = join(dir, 'folder.md');
      mkdirSync(path);
      let err: ProseError | undefined;
      try { loadDocument(path); } catch (e) { err = e as ProseError; }
      expect(err?.code).toBe('E_NOT_FOUND');
      expect(err?.message).toBe(`Not a file: ${path}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('prose parse', () => {
  it('emits the IR', async () => {
    const out = await run('parse', fixture('gate.dialog.yaml'));
    expect(out.format).toBe('dialog');
    expect(out.blocks.length).toBe(10);
  });

  it('lists forms in capabilities', async () => {
    const caps = await run('capabilities');
    expect(caps.formats).toEqual(['fountain', 'markdown', 'dialog']);
    expect(caps.forms).toContain('stage-play');
    expect(caps.commands).toContain('parse');
  });
});

describe('meta validation', () => {
  const load = (name: string, body: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-meta-'));
    try {
      const path = join(dir, name);
      writeFileSync(path, body, 'utf8');
      try { loadDocument(path); } catch (e) { return e as ProseError; }
      return undefined;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('rejects a non-string form or register in frontmatter with E_SCHEMA and a pointer', () => {
    const form = load('a.md', '---\nform: 3\n---\n\nHello.\n');
    expect([form?.code, form?.pointer]).toEqual(['E_SCHEMA', '/form']);
    const register = load('b.md', '---\nregister: [casual]\n---\n\nHello.\n');
    expect([register?.code, register?.pointer]).toEqual(['E_SCHEMA', '/register']);
  });

  it('rejects a non-string register in dialog YAML the same way', () => {
    const err = load('c.dialog.yaml', 'register: 5\nnodes:\n  - id: a\n    speaker: X\n    text: hi\n    end: true\n');
    expect([err?.code, err?.pointer]).toEqual(['E_SCHEMA', '/register']);
  });
});

describe('form declared in the document', () => {
  const draft = (name: string, body: string) => { const d = mkdtempSync(join(tmpdir(), 'prose-form-')); const f = join(d, name); writeFileSync(f, body); return f; };
  const err = (fn: () => unknown) => { try { fn(); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };

  it('reports an unknown form in metadata as E_SCHEMA at /form', () => {
    const e = err(() => loadDocument(draft('a.md', '---\nform: ode\n---\n\nHi.\n')));
    expect([e.code, e.pointer]).toEqual(['E_SCHEMA', '/form']);
  });

  it('reports a metadata form for the wrong format as E_SCHEMA at /form', () => {
    const e = err(() => loadDocument(draft('a.md', '---\nform: tv-drama\n---\n\nHi.\n')));
    expect([e.code, e.pointer]).toEqual(['E_SCHEMA', '/form']);
  });

  it('keeps E_USAGE for a bad --form option', () => {
    expect(err(() => loadDocument(draft('a.md', 'Hi.\n'), { form: 'ode' })).code).toBe('E_USAGE');
  });
});