import { describe, expect, it } from 'vitest';
import { projectSource, codePointSlice, codePointToUtf16, utf16ToCodePoint } from '../src/annotation/source.ts';

const structured = (blocks: unknown[], documents?: unknown[]) => JSON.stringify({ schema: 'prose/structured-source@1', adapter: { id: 'course-content', version: '1' }, documents: documents ?? [{ id: 'lesson', language: 'en-US', blocks }] });
const block = (id: string, text: string) => ({ id, kind: 'paragraph', runs: [{ text }] });

describe('annotation source projection', () => {
  it('preserves selected structured document language and direction in projection bindings', () => {
    const raw = structured([], [{ id: 'other', language: 'en-US', blocks: [block('other', 'Other')] }, { id: 'lesson', language: 'ar', dir: 'rtl', blocks: [block('intro', 'نص')] }]);
    const p = projectSource(raw, { profile: 'structured', documentId: 'lesson' });
    expect(p.language).toBe('ar'); expect(p.direction).toBe('rtl');
    const changedLanguage = projectSource(raw.replace('"language":"ar"', '"language":"fa"'), { profile: 'structured', documentId: 'lesson' });
    const changedDirection = projectSource(raw.replace('"dir":"rtl"', '"dir":"auto"'), { profile: 'structured', documentId: 'lesson' });
    expect(changedLanguage.text).toBe(p.text); expect(changedLanguage.digest).not.toBe(p.digest);
    expect(changedDirection.text).toBe(p.text); expect(changedDirection.digest).not.toBe(p.digest);
  });
  it('inherits HTML language and direction from the scoped root or its nearest ancestor', () => {
    const raw = '<html lang="fa" dir="rtl"><body><main id="reading"><p>متن</p></main></body></html>';
    const inherited = projectSource(raw, { profile: 'html', documentId: 'lesson', contentRoot: '#reading' });
    expect(inherited.language).toBe('fa'); expect(inherited.direction).toBe('rtl');
    const overridden = projectSource(raw.replace('<main id="reading">', '<main id="reading" lang="ar" dir="auto">'), { profile: 'html', documentId: 'lesson', contentRoot: '#reading' });
    expect(overridden.language).toBe('ar'); expect(overridden.direction).toBe('auto');
    const unknown = projectSource(raw.replace('<main id="reading">', '<main id="reading" lang="">'), { profile: 'html', documentId: 'lesson', contentRoot: '#reading' });
    expect(unknown.language).toBe('und');
  });
  it('uses unknown language for undeclared sources and rejects invalid structured metadata', () => {
    expect(projectSource('An English-looking sentence.', { profile: 'markdown', documentId: 'lesson' }).language).toBe('und');
    const html = projectSource('<p>Unspecified language</p>', { profile: 'html', documentId: 'lesson' });
    expect(html.language).toBe('und'); expect(html.direction).toBeUndefined();
    for (const document of [
      { id: 'lesson', language: 7, blocks: [block('intro', 'Text')] },
      { id: 'lesson', language: 'en-US', dir: 'sideways', blocks: [block('intro', 'Text')] },
    ]) expect(() => projectSource(structured([], [document]), { profile: 'structured', documentId: 'lesson' })).toThrow(/language|direction/i);
  });
  it('projects equivalent prose and formatting from Markdown, HTML and structured snapshots', () => {
    const sources = [
      projectSource('# Transport\n\nThe **process** is [diffusion](https://example.org).', { profile: 'markdown', documentId: 'lesson' }),
      projectSource('<h1>Transport</h1><p>The <strong>process</strong> is <a href="https://example.org">diffusion</a>.</p>', { profile: 'html', documentId: 'lesson' }),
      projectSource(structured([{ id: 'heading', kind: 'heading', context: { level: 1 }, runs: [{ text: 'Transport' }] }, { id: 'intro', kind: 'paragraph', runs: [{ text: 'The ' }, { text: 'process', marks: ['strong'] }, { text: ' is ' }, { text: 'diffusion', href: 'https://example.org' }, { text: '.' }] }]), { profile: 'structured', documentId: 'lesson' }),
    ];
    for (const p of sources) {
      expect(p.text).toBe('Transport\nThe process is diffusion.');
      expect(p.blocks[1].runs.some(r => r.marks?.includes('strong') && r.text === 'process')).toBe(true);
      expect(p.blocks[1].runs.find(r => r.href)?.text).toBe('diffusion');
      expect(p.blocks[1].headingPath).toEqual(['Transport']);
      expect(p.blocks.map(b => codePointSlice(p.text, b.start, b.end))).toEqual(p.blocks.map(b => b.text));
    }
  });
  it('decodes entities, preserves NBSP and Unicode, collapses ASCII whitespace and normalizes hard breaks', () => {
    const p = projectSource('<p>A  &amp;\tB&nbsp;😀 é<br>Next</p>', { profile: 'html', documentId: 'lesson' });
    expect(p.text).toBe('A & B\u00a0😀 é\nNext');
    expect(codePointSlice(p.text, 6, 7)).toBe('😀');
    expect(p.sourceMap?.find(m => codePointSlice(p.text, m.start, m.end) === '&')).toMatchObject({ sourceStart: 6, sourceEnd: 11 });
  });
  it('supports attributed spans without preserving their delimiters and records source ranges', () => {
    const p = projectSource('The [**process**]{#process} is diffusion.', { profile: 'markdown', documentId: 'lesson' });
    expect(p.text).toBe('The process is diffusion.');
    expect(p.fragments.process).toEqual({ start: 4, end: 11 });
    expect(p.sourceMap?.filter(m => m.start >= 4 && m.end <= 11).every(m => m.sourceStart >= 7 && m.sourceEnd <= 14)).toBe(true);
  });
  it('supports CommonMark inline HTML spans and formatting without exposing attributes as text', () => {
    const p = projectSource('A <span id="term"><em>term</em></span><br>after <code>omit</code> tail.', { profile: 'markdown', documentId: 'lesson' });
    expect(p.text).toBe('A term\nafter \uFFFC tail.');
    expect(p.fragments.term).toEqual({ start: 2, end: 6 });
    expect(p.blocks[0].runs.find(r => r.text === 'term')?.marks).toEqual(['em']);
    expect(p.barriers).toHaveLength(1);
  });
  it('projects supported raw HTML prose blocks in Markdown with original source offsets', () => {
    const raw = '# Chapter\r\n\r\n<p id="note">A <strong>term</strong>.</p>\r\n\r\nAfter.';
    const p = projectSource(raw, { profile: 'markdown', documentId: 'lesson' });
    expect(p.text).toBe('Chapter\nA term.\nAfter.');
    expect(p.fragments.note).toEqual({ start: 8, end: 15 });
    const t = p.sourceMap?.find(m => m.start === 10);
    expect(t?.sourceStart).toBe(raw.indexOf('term'));
  });
  it('does not execute or fetch HTML and excludes hidden and unsupported content with barriers', () => {
    const p = projectSource('<body><p>Before <code>secret</code> after.</p><script>throw 1</script><p hidden>hidden</p><p>Last</p></body>', { profile: 'html', documentId: 'lesson' });
    expect(p.text).not.toContain('secret'); expect(p.text).not.toContain('throw'); expect(p.text).not.toContain('hidden');
    expect(p.barriers?.length).toBeGreaterThan(0);
    expect(p.diagnostics.some(d => d.code === 'excluded-region')).toBe(true);
  });
  it('scopes static HTML to one exact declared root and rejects conflicting IDs', () => {
    expect(projectSource('<p>outside</p><main id="reading"><p>Inside</p></main>', { profile: 'html', contentRoot: '#reading', documentId: 'lesson' }).text).toBe('Inside');
    expect(() => projectSource('<p id="x">One</p><p id="x">Two</p>', { profile: 'html', documentId: 'lesson' })).toThrow(/duplicate/i);
    expect(() => projectSource('<p>One</p>', { profile: 'html', contentRoot: '#missing', documentId: 'lesson' })).toThrow(/root/i);
    const reserved = projectSource('<p id="__proto__">Literal ID</p>', { profile: 'html', documentId: 'lesson' });
    expect(Object.hasOwn(reserved.fragments, '__proto__')).toBe(true);
    expect(reserved.fragments.__proto__).toEqual({ start: 0, end: 10 });
  });
  it('retains HTML container fragments and separates nested list blocks with typed depth', () => {
    const p = projectSource('<section id="part"><p>First</p><ul><li>Outer<ul><li>Inner</li></ul></li></ul><p>Last</p></section>', { profile: 'html', documentId: 'lesson' });
    expect(p.text).toBe('First\nOuter\nInner\nLast');
    expect(p.fragments.part).toEqual({ start: 0, end: 22 });
    expect(p.blocks.filter(b => b.kind === 'list-item').map(b => b.listDepth)).toEqual([1, 2]);
  });
  it('preserves ordered starts and nested bullet semantics in Markdown and HTML lists', () => {
    const markdown = projectSource('5. First\n   - Nested\n6. Second', { profile: 'markdown', documentId: 'lesson' });
    const html = projectSource('<ol start="5"><li>First<ul><li>Nested</li></ul></li><li>Second</li></ol>', { profile: 'html', documentId: 'lesson' });
    for (const p of [markdown, html]) {
      expect(p.text).toBe('First\nNested\nSecond');
      expect(p.blocks.map(b => ({ kind: b.kind, depth: b.listDepth, type: b.listType, start: b.listStart }))).toEqual([
        { kind: 'list-item', depth: 1, type: 'ordered', start: 5 },
        { kind: 'list-item', depth: 2, type: 'unordered', start: undefined },
        { kind: 'list-item', depth: 1, type: 'ordered', start: 5 },
      ]);
    }
  });
  it('retains validated structured list metadata, including zero starts, in its digest', () => {
    const item = { id: 'step', kind: 'list-item', context: { listDepth: 2, listType: 'ordered', listStart: 0 }, runs: [{ text: 'First' }] };
    const p = projectSource(structured([item]), { profile: 'structured', documentId: 'lesson' });
    expect(p.blocks[0]).toMatchObject({ listDepth: 2, listType: 'ordered', listStart: 0 });
    const changed = projectSource(structured([{ ...item, context: { ...item.context, listStart: 3 } }]), { profile: 'structured', documentId: 'lesson' });
    expect(changed.digest).not.toBe(p.digest);
    for (const context of [{ listType: 'alphabetic' }, { listType: 'ordered', listStart: 1.5 }, { listType: 'unordered', listStart: 2 }]) expect(() => projectSource(structured([{ ...item, context }]), { profile: 'structured', documentId: 'lesson' })).toThrow(/list/i);
  });
  it('keeps separate paragraph blocks grouped under the same owning list item', () => {
    const markdown = projectSource('1. First paragraph.\n\n   Second paragraph.\n\n2. Next item.', { profile: 'markdown', documentId: 'lesson' });
    const html = projectSource('<ol><li><p>First paragraph.</p><p>Second paragraph.</p></li><li>Next item.</li></ol>', { profile: 'html', documentId: 'lesson' });
    for (const p of [markdown, html]) {
      expect(p.blocks.map(b => b.text)).toEqual(['First paragraph.', 'Second paragraph.', 'Next item.']);
      expect(p.blocks[0].listItem).toBeTruthy();
      expect(p.blocks[0].listItem).toBe(p.blocks[1].listItem);
      expect(p.blocks[2].listItem).not.toBe(p.blocks[0].listItem);
      expect(new Set(p.blocks.map(b => b.id)).size).toBe(3);
    }
  });
  it('restores an outer item identity after a nested list and scopes repeated raw HTML items', () => {
    const p = projectSource('<ol><li><p>Outer first.</p><ul><li>Inner.</li></ul><p>Outer last.</p></li></ol>', { profile: 'html', documentId: 'lesson' });
    expect(p.blocks[0].listItem).toBe(p.blocks[2].listItem);
    expect(p.blocks[1].listItem).not.toBe(p.blocks[0].listItem);
    const markdown = projectSource('<ul><li>First.</li></ul>\n\nPlain.\n\n<ul><li>Second.</li></ul>', { profile: 'markdown', documentId: 'lesson' });
    const items = markdown.blocks.filter(b => b.kind === 'list-item');
    expect(items).toHaveLength(2); expect(items[0].listItem).not.toBe(items[1].listItem);
  });
  it('accepts persistent structured list item handles and rejects malformed grouping metadata', () => {
    const context = { listDepth: 1, listType: 'ordered', listStart: 1, listItem: 'step-a' };
    const p = projectSource(structured([{ ...block('p1', 'First.'), kind: 'list-item', context }, { ...block('p2', 'Continuation.'), kind: 'list-item', context }]), { profile: 'structured', documentId: 'lesson' });
    expect(p.blocks.map(b => b.listItem)).toEqual(['step-a', 'step-a']);
    expect(p.blocks.map(b => b.id)).toEqual(['p1', 'p2']);
    for (const item of [{ ...block('p', 'Text'), context: { listItem: 'item' } }, { ...block('p', 'Text'), kind: 'list-item', context: { listItem: 5 } }, { ...block('p', 'Text'), kind: 'list-item', context: { listItem: '' } }]) expect(() => projectSource(structured([item]), { profile: 'structured', documentId: 'lesson' })).toThrow(/list/i);
  });
  it('rejects recycling a structured item handle or changing its declared nesting and numbering', () => {
    const item = (id: string, listItem: string, depth = 1, type = 'ordered') => ({ ...block(id, id), kind: 'list-item', context: { listDepth: depth, listType: type, listItem } });
    for (const blocks of [
      [item('p1', 'same'), item('p2', 'other'), item('p3', 'same')],
      [item('p1', 'same'), item('p2', 'same', 2)],
      [item('p1', 'same'), item('p2', 'same', 1, 'unordered')],
    ]) expect(() => projectSource(structured(blocks), { profile: 'structured', documentId: 'lesson' })).toThrow(/list item/i);
    const nested = projectSource(structured([item('p1', 'outer'), item('p2', 'inner', 2), item('p3', 'outer')]), { profile: 'structured', documentId: 'lesson' });
    expect(nested.blocks.map(b => b.listItem)).toEqual(['outer', 'inner', 'outer']);
  });
  it('explicitly rejects unsupported HTML numbering resets and reversed or alphabetic lists', () => {
    for (const raw of ['<ol><li value="8">Reset</li></ol>', '<ol reversed><li>Reverse</li></ol>', '<ol type="a"><li>Letter</li></ol>']) expect(() => projectSource(raw, { profile: 'html', documentId: 'lesson' })).toThrow(/unsupported.*list|list.*unsupported/i);
  });
  it('maps legacy and multi-code-point HTML entities to precisely consumed source syntax', () => {
    const raw = '<p>&notit; &NotEqualTilde; &#x1F600;</p>';
    const p = projectSource(raw, { profile: 'html', documentId: 'lesson' });
    expect(p.text).toBe('¬it; ≂̸ 😀');
    expect(p.sourceMap?.[0]).toMatchObject({ sourceStart: 3, sourceEnd: 7 });
    expect(p.sourceMap?.[1]).toMatchObject({ sourceStart: 7, sourceEnd: 8 });
    expect(p.sourceMap?.filter(m => m.sourceStart === raw.indexOf('&NotEqualTilde;'))).toHaveLength(2);
  });
  it('preserves stable structured IDs across insertion and reordering, selecting documents explicitly', () => {
    const raw = structured([], [{ id: 'other', blocks: [block('a', 'Other')] }, { id: 'lesson', blocks: [block('intro', 'Hello'), block('end', 'End')] }]);
    const p = projectSource(raw, { profile: 'structured', documentId: 'publication', sourceDocument: 'lesson' });
    expect(p.documentId).toBe('publication'); expect(p.blocks.map(b => b.id)).toEqual(['intro', 'end']);
    expect(() => projectSource(raw, { profile: 'structured', documentId: 'publication' })).toThrow(/document/i);
    const reordered = projectSource(structured([block('end', 'End'), block('new', 'New'), block('intro', 'Hello')]), { profile: 'structured', documentId: 'lesson' });
    expect(reordered.blocks[2].id).toBe('intro');
  });
  it('rejects unknown structured schemas, missing/duplicate IDs, executable fields and undeclared formatting', () => {
    for (const raw of [
      JSON.stringify({ schema: 'prose/structured-source@9' }), structured([block('', 'No')]), structured([block('x', 'One'), block('x', 'Two')]),
      structured([{ ...block('x', 'One'), render: 'execute()' }]), structured([{ id: 'x', kind: 'paragraph', runs: [{ text: 'One', marks: ['rainbow'] }] }]),
    ]) expect(() => projectSource(raw, { profile: 'structured', documentId: 'lesson' })).toThrow();
  });
  it('retains adapter declarations and binds mapping/version changes to the projection digest', () => {
    const raw = structured([block('intro', 'Same prose')]); const changed = raw.replace('"version":"1"', '"version":"2"');
    const a = projectSource(raw, { profile: 'structured', documentId: 'lesson' });
    const b = projectSource(changed, { profile: 'structured', documentId: 'lesson' });
    expect(a.text).toBe(b.text); expect(a.digest).not.toBe(b.digest);
    expect(b.adapter).toEqual({ id: 'course-content', version: '2' });
    for (const invalid of [raw.replace('"version":"1"', '"version":1'), raw.replace('"id":"course-content",', '')]) expect(() => projectSource(invalid, { profile: 'structured', documentId: 'lesson' })).toThrow(/adapter/i);
  });
  it('represents declared structured exclusions and hard breaks without allowing implicit crossings', () => {
    const p = projectSource(structured([block('a', 'Before'), { id: 'table', kind: 'excluded', reason: 'table' }, { id: 'b', kind: 'paragraph', runs: [{ text: 'After' }, { break: 'hard' }, { text: 'line' }] }]), { profile: 'structured', documentId: 'lesson' });
    expect(p.text).toContain('After\nline'); expect(p.barriers).toHaveLength(1);
  });
  it('creates deterministic projection digests while retaining exact-byte source bindings', () => {
    const a = projectSource('Hello\r\nworld', { profile: 'markdown', documentId: 'lesson' });
    const b = projectSource('Hello\nworld', { profile: 'markdown', documentId: 'lesson' });
    expect(a.text).toBe('Hello world'); expect(a.digest).toBe(b.digest); expect(a.sourceDigest).not.toBe(b.sourceDigest);
  });
  it('maps JSON field text rather than an identical ID, including escaped astral characters', () => {
    const raw = structured([block('same', 'same 😀\nword')]);
    const p = projectSource(raw, { profile: 'structured', documentId: 'lesson' });
    expect(p.sourceMap?.[0].sourceStart).toBe(raw.indexOf('"text":"') + 8);
    expect(p.sourceMap?.find(m => codePointSlice(p.text, m.start, m.end) === '😀')?.sourceEnd).toBe(raw.indexOf('😀') + 2);
  });
  it('maps CommonMark references, nested emphasis, escapes, entities, CRLF and literal delimiters', () => {
    const raw = '> **A *nested* word** &amp; \\*literal\\* 😀\r\n> [term][ref]\r\n\r\n[ref]: https://example.org\r\n';
    const p = projectSource(raw, { profile: 'markdown', documentId: 'lesson' });
    expect(p.text).toBe('A nested word & *literal* 😀 term');
    expect(p.blocks[0].runs.find(r => r.href)?.text).toBe('term');
    for (const map of p.sourceMap ?? []) {
      const text = codePointSlice(p.text, map.start, map.end);
      const original = raw.slice(map.sourceStart, map.sourceEnd);
      if (/^[A-Za-z😀]$/u.test(text)) expect(original).toBe(text);
    }
  });
  it('maps autolink display text to its original characters and retains hard breaks', () => {
    const raw = '<https://example.org>  \nNext\\\nline';
    const p = projectSource(raw, { profile: 'markdown', documentId: 'lesson' });
    expect(p.text).toBe('https://example.org\nNext\nline');
    expect(p.sourceMap?.[0]).toMatchObject({ sourceStart: 1, sourceEnd: 2 });
    expect(p.sourceMap?.[5]).toMatchObject({ sourceStart: 6, sourceEnd: 7 });
  });
  it('converts code-point and UTF-16 offsets exactly and rejects surrogate interiors', () => {
    expect(codePointToUtf16('A😀B', 2)).toBe(3); expect(utf16ToCodePoint('A😀B', 3)).toBe(2);
    expect(() => utf16ToCodePoint('A😀B', 2)).toThrow(/boundary/i);
  });
});
