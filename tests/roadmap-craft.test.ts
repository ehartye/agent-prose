import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { measure } from '../src/measure/index.ts';
import { lint } from '../src/lint/lint.ts';
import { readDeclared } from '../src/declared.ts';
import { rhymeClass } from '../src/verse/rhyme.ts';
import { pronounce } from '../src/verse/pronounce.ts';
import { verse } from './verse-drafts.ts';

const dir = mkdtempSync(join(tmpdir(), 'prose-craft-roadmap-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let id = 0;
const draft = (text: string, ext = 'md') => {
  const file = join(dir, `draft-${id++}.${ext}`);
  writeFileSync(file, text);
  return loadDocument(file);
};
const findings = (text: string, rule: string) => {
  const r = lint(draft(text));
  return [...r.warnings, ...r.info].filter(f => f.rule === rule);
};

describe('multi-camera preamble layout', () => {
  const body = 'INT. ROOM - DAY\n\nDANA\nHello.\n';
  const script = (text: string) => measure(draft(`Title: T\nForm: sitcom-multicam\n\n${text}`, 'fountain')).script!;
  it('prints a centered preamble without padding before the first scene', () => {
    expect(script(`>COLD OPEN<\n\n${body}`).lines).toBe(script(body).lines + 2);
  });
  it('keeps later scenes and explicit pre-scene page breaks on a new page', () => {
    expect(script(`>COLD OPEN<\n\n===\n\n${body}`).lines).toBe(55 + script(body).lines);
    expect(script(`${body}\nINT. OTHER ROOM - DAY\n\nDANA\nHello.\n`).lines).toBe(55 + script(body).lines);
  });
});

describe('YouTube timestamp components', () => {
  const yt = (body: string) => draft(`---\nform: youtube\n---\n\n${body}\n`);
  it.each(['1:02:00–1:03:00', '62:00—63:00', '102:00-103:00'])('times %s without counting its timestamp as spoken text', range => {
    const m = measure(yt(`[${range}] VO: Four words right here.`));
    expect(m.segments[0]).toMatchObject({ seconds: 60, words: 4, wpm: 4, line: 5 });
    expect(m.spoken!.words).toBe(4);
  });
  it('handles an hour boundary and each source line in one paragraph', () => {
    const m = measure(yt('[59:58–1:00:02] VO: One two\n[1:00:02–1:00:06] VISUAL: ignore this\nVO: Three four'));
    expect(m.segments).toMatchObject([{ seconds: 4, words: 2, line: 5 }, { seconds: 4, words: 2, line: 6 }]);
    expect(m.spoken!.words).toBe(4);
  });
  it.each(['0:60-1:00', '1:60:00-2:00:00', '1:02:99-1:03:00', '1:2-2:00', '1:02:00:00-2:00', '0:xx-1:00', '1:00-2:', '1:00-2:00bad'])('reports malformed %s at its source line', range => {
    const r = lint(yt(`[${range}] VO: One two.`));
    expect(r.warnings.find(f => f.rule === 'youtube.segment.pace')).toMatchObject({ at: { line: 5 } });
    expect(r.warnings.find(f => f.rule === 'youtube.segment.pace')!.message).toMatch(/invalid timestamp/i);
  });
  it.each(['1:00:00-0:59:59', '1:00:00-1:00:00'])('warns when %s has no positive duration', range => {
    expect(lint(yt(`[${range}] VO: One two.`)).warnings.find(f => f.rule === 'youtube.segment.pace')!.message).toMatch(/no duration/);
  });
});

describe('form meter counts', () => {
  it.each(['sonnet-shakespearean', 'sonnet-petrarchan'])('warns on an eight-syllable %s without declared counts', form => {
    const r = findings(verse(form, Array(14).fill('The cat sat on the mat at night').join('\n')), 'verse.form.syllables');
    expect(r).toHaveLength(14);
    expect(r[0]!.message).toMatch(/8 syllables.*meter.*10/);
  });
  it('retains feminine endings and an explicit syllable pattern takes precedence', () => {
    expect(findings(verse('sonnet-petrarchan', Array(14).fill('The cat sat on the mat at night by the sea').join('\n')), 'verse.form.syllables')).toEqual([]);
    expect(findings(verse('sonnet-petrarchan', 'The cat sat on the mat at night', 'syllables: [8]\n'), 'verse.form.syllables')).toEqual([]);
  });
  it('uses the limerick line-specific feet and permits a headless anapest', () => {
    const body = ['one two three four five six seven eight', 'one two three four five six seven eight nine', 'one two three four five', 'one two three four', 'one two three four five six seven eight nine'].join('\n');
    const hits = findings(verse('limerick', body), 'verse.form.syllables');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.message).toMatch(/4 syllables.*meter.*6/);
  });
});

describe('page-derived minute targets', () => {
  it('uses the runtime uncertainty band while word targets keep their own tolerance', () => {
    const source = 'Title: T\nForm: stage-play\n\nINT. ROOM - DAY\n\nDANA\nOne two three four.\n';
    const minutes = measure(draft(source, 'fountain')).script!.minutes;
    const run = (ratio: number) => lint(draft(source.replace('Form: stage-play', `Form: stage-play\nTarget: ${minutes / ratio} minutes`), 'fountain'));
    expect(run(1.15).warnings.map(f => f.rule)).not.toContain('length.target');
    expect(run(1.25).warnings.map(f => f.rule)).toContain('length.target');
  });
});

describe('declared hymn patterns and textual meter', () => {
  it.each(['CM', '8686', '8.6.8.6'])('normalizes %s to common meter counts', syllables => {
    expect(readDeclared({ syllables })!.syllables).toEqual([8, 6, 8, 6]);
  });
  it('normalizes double notation and retains multi-digit array counts', () => {
    expect(readDeclared({ syllables: '8.7.8.7.D' })!.syllables).toEqual([8, 7, 8, 7, 8, 7, 8, 7]);
    expect(readDeclared({ syllables: [12, 10] })!.syllables).toEqual([12, 10]);
    expect(readDeclared({ syllables: { Verse: 'CM', chorus: '8.7.8.7.D' } })!.syllables).toEqual({ verse: [8, 6, 8, 6], chorus: [8, 7, 8, 7, 8, 7, 8, 7] });
  });
  it('scans an explicitly declared lyric foot as advisory textual meter', () => {
    const text = verse('song', 'Morning bells ring out on the hill at dawn', 'meter: {foot: iamb, feet: 5}\n');
    expect(measure(draft(text)).verse!.meter).toMatchObject([{ expected: 10, deviations: [0, 1] }]);
    expect(findings(text, 'verse.meter.deviation')[0]!.message).toMatch(/advisory/);
  });
  it('rejects unknown feet and invalid counts with a meter pointer', () => {
    expect(() => readDeclared({ meter: { foot: 'waltz', feet: 4 } })).toThrow(/meter/);
    expect(() => readDeclared({ meter: { foot: 'iamb', feet: 0 } })).toThrow(/meter/);
  });
});

describe('Pattison family-rhyme convention', () => {
  it.each([['mud', 'truck'], ['love', 'blush'], ['strum', 'hung']])('distinguishes %s/%s from vowel-only assonance', (a, b) => {
    expect(rhymeClass(pronounce(a), pronounce(b))).toEqual({ class: 'family', uncertain: false });
  });
  it.each([['life', 'tide'], ['snow', 'rose']])('keeps unrelated codas %s/%s as assonance', (a, b) => {
    expect(rhymeClass(pronounce(a), pronounce(b)).class).toBe('assonance');
  });
  it('retains reading uncertainty instead of hardcoding the source’s contradictory read/cheap example', () => {
    expect(rhymeClass(pronounce('read'), pronounce('cheap'))).toEqual({ class: 'family', uncertain: true });
  });
});
