import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './helpers.ts';

const cli = join(import.meta.dirname, '..', 'scripts', 'prose.mjs');
const sonnet = join(import.meta.dirname, 'fixtures', 'verse', 'sonnet18.md');

/** Run the real CLI with a throwaway home, so nothing touches the real ~/.agent-prose. */
function prose(...args: string[]) {
  const home = mkdtempSync(join(tmpdir(), 'prose-verse-cli-'));
  try {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, AGENT_PROSE_HOME: home } });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: r.stdout.trim().startsWith('{') ? JSON.parse(r.stdout) : undefined, error: r.stderr.trim() ? JSON.parse(r.stderr.trim()).error : undefined };
  } finally { rmSync(home, { recursive: true, force: true }); }
}

describe('prose scan', () => {
  it('prints JSON with lines, scheme, trust and notes', () => {
    const { status, json: s } = prose('scan', sonnet);
    expect(status).toBe(0);
    expect(s).toMatchObject({ form: 'sonnet-shakespearean', kind: 'poem', dialect: 'US English' });
    expect(s.lines).toHaveLength(14);
    expect(Object.keys(s.lines[0])).toEqual(expect.arrayContaining(['line', 'stanza', 'section', 'text', 'syllables', 'stress', 'endWord', 'rhyme', 'ending', 'flags']));
    expect(s.lines[0].endWord).toBe('day');
    expect(s.scheme).toHaveLength(14);
    expect(s.nearScheme).toHaveLength(14);
    expect(s.pairs.length).toBeGreaterThan(0);
    expect(s.trust.words).toBe(s.trust.dict + s.trust.affix + s.trust.guessed);
    expect(s.notes).toContain('Pronunciations come from CMUdict (US English); guessed words are estimated from spelling.');
    expect(s.notes.some((n: string) => /^Pairs like \S+\/\S+ look like rhymes but differ/.test(n))).toBe(true);
    expect(s.lines.every((l: any) => !('words' in l))).toBe(true);
  });

  it('flags temperate and date', () => {
    const { json: s } = prose('scan', sonnet);
    const flags = s.lines.flatMap((l: any) => l.flags).join(' ');
    expect(flags).toMatch(/temperate/);
    expect(s.notes.join(' ')).toMatch(/temperate\/date/);
  });

  it('--words adds per-word pronunciations', () => {
    const { json: s } = prose('scan', sonnet, '--words');
    expect(s.lines[0].words.map((w: any) => w.word).slice(0, 3)).toEqual(['shall', 'i', 'compare']);
    expect(Object.keys(s.lines[0].words[0]).sort()).toEqual(['rhymeKey', 'source', 'stress', 'syllables', 'variants', 'word']);
  });

  it('--text prints one row per line, the trust summary and the caveats', () => {
    const { status, stdout } = prose('scan', sonnet, '--text');
    expect(status).toBe(0);
    expect(stdout).not.toContain('\x1b[');
    const rows = stdout.split('\n').filter(l => /^\s*\d+\s+\d+(?:\/\d+)?\s/.test(l));
    expect(rows).toHaveLength(14);
    expect(stdout).toContain('Pronunciations come from CMUdict (US English)');
    expect(stdout).toMatch(/dict \d+/);
    expect(stdout).toMatch(/Pairs like/);
  });

  it('refuses a prose draft with a hint naming the verse forms', () => {
    const { status, error } = prose('scan', fixture('keynote.md'));
    expect(status).toBe(2);
    expect(error.code).toBe('E_USAGE');
    expect(error.hint).toContain('sonnet-shakespearean');
    expect(error.hint).toContain('haiku');
  });

  it('reports a missing file as E_NOT_FOUND', () => {
    const { status, error } = prose('scan', 'no-such-file.md');
    expect([status, error.code]).toEqual([1, 'E_NOT_FOUND']);
  });

  it('--form overrides the draft form', () => {
    expect(prose('scan', sonnet, '--form', 'haiku').json.form).toBe('haiku');
  });
});

describe('prose scan: syllables per beat and legend', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prose-verse-spb-'));
  const draft = (front: string) => { const f = join(dir, `d${Math.random().toString(36).slice(2)}.md`); writeFileSync(f, `---
${front}
---
[Verse 1]
The road was long and the night came down
I carried my shoes
Nobody knew me and nobody cared
Take me home
`); return f; };

  it('JSON syllablesPerBeat is null when no tempo is declared, with a legend', () => {
    const { json: s } = prose('scan', sonnet);
    expect(s.syllablesPerBeat).toBeNull();
    expect(s.legend[0]).toMatch(/^Stress: 1 stressed, 2 secondary, 0 unstressed, \? flexible/);
    expect(s.legend[1]).toBe('Scheme counts perfect and identity rhymes; near also counts assonance and consonance (slant rhymes).');
    expect(s.legend).toHaveLength(2);
  });

  it('JSON syllablesPerBeat carries tempo, beats, per-line values and mean', () => {
    const { json: s } = prose('scan', draft('form: song\ntempo: 90'));
    expect(s.syllablesPerBeat).toMatchObject({ tempo: 90, beatsPerLine: 4 });
    expect(s.syllablesPerBeat.perLine).toHaveLength(s.lines.length);
    expect(s.syllablesPerBeat.perLine).toEqual(s.lines.map((l: any) => Math.round(l.syllables / 4 * 100) / 100));
  });

  it('--text adds an spb column and one note line only when tempo is declared', () => {
    const plain = prose('scan', sonnet, '--text').stdout;
    expect(plain).not.toMatch(/\bspb\b/);
    expect(plain).not.toContain('Syllables per beat');
    expect(plain).toContain('Stress: 1 stressed, 2 secondary');
    const t = prose('scan', draft('form: song\ntempo: 90\nbeatsPerLine: 8'), '--text').stdout;
    expect(t).toMatch(/\bspb\b/);
    expect(t).toMatch(/^Syllables per beat: tempo 90, 8 beats per line, mean \d\.\d\d \(range \d\.\d\d to \d\.\d\d\)\.$/m);
  });

  it('adds the declared-pattern legend only when a pattern or scheme is declared', () => {
    expect(prose('scan', sonnet, '--text').stdout).not.toContain('Declared pattern:');
    const t = prose('scan', draft('form: free-verse\nsyllables: 8.6.8.6\nscheme: xaxa'), '--text').stdout;
    expect(t).toContain('Declared pattern: lines marked +n/-n are n syllables over/under it');
    expect(t).toContain('checked by prose lint');
  });
});

describe('prose pronounce', () => {
  it('returns one entry per word with its source', () => {
    const { json: p } = prose('pronounce', 'love', 'dove', 'glorpish');
    expect(p.dialect).toBe('US English');
    expect(p.note).toMatch(/guessed/i);
    expect(p.words.map((w: any) => [w.word, w.source])).toEqual([['love', 'dict'], ['dove', 'dict'], ['glorpish', 'guessed']]);
    expect(p.words[0]).toMatchObject({ syllables: 1, stress: '1', phones: ['L', 'AH1', 'V'], variants: 1, rhymeKey: 'AH V' });
  });

  it('needs at least one word', () => {
    const { status, error } = prose('pronounce');
    expect([status, error.code]).toEqual([2, 'E_USAGE']);
  });
});

describe('capabilities', () => {
  it('lists scan, pronounce and the verse forms', () => {
    const caps = prose('capabilities').json;
    expect(caps.commands).toEqual(expect.arrayContaining(['scan', 'pronounce']));
    expect(caps.verseForms).toEqual(expect.arrayContaining(['haiku', 'sonnet-shakespearean']));
    expect(caps.verseForms).not.toContain('keynote');
    expect(caps.forms).toEqual(expect.arrayContaining(caps.verseForms));
  });
});
