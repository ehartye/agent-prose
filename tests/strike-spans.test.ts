import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ProseError } from '../src/errors.ts';
import { unitsOf } from '../src/reading/units.ts';
import { parseRefs, selectSpans, unitRefs, unitSpans } from '../src/strike/spans.ts';
import { fixture } from './helpers.ts';

type Fmt = 'fountain' | 'markdown' | 'dialog';
const refs = (text: string, format: Fmt, form?: string) => unitSpans(text, format, form).map(s => [s.ref, s.speaker ?? '', s.text]);
const usage = (fn: () => unknown) => { try { fn(); } catch (e) { const p = e as ProseError; return `${p.code}: ${p.message} | ${p.hint ?? ''}`; } return 'none'; };

describe('unit spans: Fountain', () => {
  const text = readFileSync(fixture('pilot.fountain'), 'utf8');
  it('gives every unit its source line, a speech its dialogue lines (not the cue), and skips notes, boneyard and synopsis', () => {
    expect(refs(text, 'fountain')).toEqual([
      ['6', '', 'INT. HOSPITAL CORRIDOR - NIGHT'],
      ['8', '', 'Fluorescent lights hum. MAYA (30s) pushes a cart past an empty desk.'],
      ['11', '', '(under her breath)'],
      ['12', 'MAYA', 'Nobody told me the quiet would be the hard part.'],
      ['15', 'DR. OKAFOR', 'Maya! Room four.'],
      ['17', '', 'CRASH FROM ROOM FOUR.'],
      ['19', '', 'CUT TO:'],
      ['21', '', 'FLASHBACK - THE ER'],
      ['30', '', 'Hush now, the night is long.'],
      ['31', '', 'THE END'],
    ]);
  });

  it('a speech over several lines is one unit over a range', () => {
    const s = unitSpans('INT. ROOM - DAY\n\nMARA\nNot tonight.\nPlease.\n\nCUT TO:\n', 'fountain');
    expect(s.map(x => [x.ref, x.text])).toEqual([['1', 'INT. ROOM - DAY'], ['4-5', 'Not tonight. Please.'], ['7', 'CUT TO:']]);
  });

  it('a multi-line action is one unit over its lines, and a boneyard after a blank line is not swallowed', () => {
    const s = unitSpans('INT. ROOM - DAY\n\nRain falls.\nThe kettle screams.\n\n/* old\nMARA\nGone.\n*/\n\nA new beat.\n', 'fountain');
    expect(s.map(x => x.ref)).toEqual(['1', '3-4', '11']);
  });

  it('numbers lines the same through CRLF, lone CR and a BOM', () => {
    const plain = unitSpans(text, 'fountain');
    expect(unitSpans(text.replace(/\n/g, '\r\n'), 'fountain')).toEqual(plain);
    expect(unitSpans('﻿' + text.replace(/\n/g, '\r\n'), 'fountain')).toEqual(plain);
    expect(unitSpans(text.replace(/\n/g, '\r'), 'fountain')).toEqual(plain);
  });
});

describe('unit spans: Markdown prose', () => {
  const md = '---\nform: speech-small\n---\n\n# The bridge\n\nWe built it in the rain. It took four years!\nDid anyone believe us?\n\n> A quoted line.\n> And another.\n\n- First item\n  continued here\n\nToday it carries a thousand people.\n';
  it('spans the block, and every sentence of a block shares its ref', () => {
    expect(refs(md, 'markdown', 'speech-small')).toEqual([
      ['5', '', 'The bridge'],
      ['7-8', '', 'We built it in the rain.'],
      ['7-8', '', 'It took four years!'],
      ['7-8', '', 'Did anyone believe us?'],
      ['10-11', '', 'A quoted line.'],
      ['10-11', '', 'And another.'],
      ['13-14', '', 'First item continued here'],
      ['16', '', 'Today it carries a thousand people.'],
    ]);
  });

  it('stops a paragraph at a fence or a rule that follows it without a blank line', () => {
    const s = unitSpans('A claim.\n```\ncode\n```\nAnother paragraph.\n', 'markdown');
    expect(s.map(x => [x.ref, x.text])).toEqual([['1', 'A claim.'], ['5', 'Another paragraph.']]);
  });

  it('counts frontmatter lines and is stable under CRLF and BOM', () => {
    const crlf = '﻿' + md.replace(/\n/g, '\r\n');
    expect(unitSpans(crlf, 'markdown', 'speech-small')).toEqual(unitSpans(md, 'markdown', 'speech-small'));
  });

  it('has no spans for an empty draft', () => {
    expect(unitSpans('', 'markdown')).toEqual([]);
    expect(unitSpans('  \n\n', 'fountain')).toEqual([]);
  });
});

describe('unit spans: verse and lyric', () => {
  it('a lyric gives one line per unit; labels are units of their own, and directions are not', () => {
    const song = readFileSync(fixture('verse/song.md'), 'utf8');
    const s = unitSpans(song, 'markdown', 'song');
    expect(s.slice(0, 5).map(x => [x.ref, x.text])).toEqual([
      ['4', 'Verse 1'], ['6', 'The road was long and the night came down'], ['7', 'I carried my shoes through the sleeping town'],
      ['8', 'Nobody knew me and nobody cared'], ['10', 'Chorus'],
    ]);
    const labelled = unitSpans('[Verse]\nOne line\n(hum softly)\nTwo line\n', 'markdown', 'song');
    expect(labelled.map(x => [x.ref, x.text])).toEqual([['1', 'Verse'], ['2', 'One line'], ['4', 'Two line']]);
  });

  it('a poem gives one line per unit', () => {
    const s = unitSpans('Roses are red\nViolets are blue\n\nSecond stanza\n', 'markdown', 'free-verse');
    expect(s.map(x => [x.ref, x.text])).toEqual([['1', 'Roses are red'], ['2', 'Violets are blue'], ['4', 'Second stanza']]);
  });
});

describe('unit spans: dialog YAML', () => {
  const text = readFileSync(fixture('gate.dialog.yaml'), 'utf8');
  it('names the line of each node text, choice and bark line, with the speaker apart from the text', () => {
    const s = unitSpans(text, 'dialog');
    expect(s.map(x => [x.ref, x.speaker ?? '', x.text.slice(0, 20)])).toEqual([
      ['6', 'GUARD', 'Halt. State your bus'], ['8', '', "I'm here to trade."], ['10', '', 'Just passing through'],
      ['15', 'GUARD', "Market's that way."], ['19', 'GUARD', 'Go on, then.'], ['22', 'GUARD', 'You should never hea'],
      ['26', 'GUARD', 'This points nowhere.'], ['33', 'GUARD', 'Quiet night on the w'],
      ['34', 'GUARD', 'Quiet night on the w'], ['39', 'GUARD', 'To arms!'],
    ]);
  });

  it('covers a block scalar and a variants list down to its last line', () => {
    const y = 'form: quest-dialog\nstart: a\nnodes:\n  - id: a\n    speaker: GUARD\n    text: |\n      First line.\n      Second line.\n    variants:\n      - Halt.\n      - Stop right there.\n    end: true\n';
    const s = unitSpans(y, 'dialog');
    expect(s.map(x => [x.ref, x.text])).toEqual([['6-8', 'First line.'], ['6-8', 'Second line.'], ['10', 'Halt.'], ['11', 'Stop right there.']]);
  });

  it('is stable under CRLF and a BOM', () => {
    expect(unitSpans('﻿' + text.replace(/\n/g, '\r\n'), 'dialog')).toEqual(unitSpans(text, 'dialog'));
  });
});

describe('unit spans agree with the page', () => {
  it('lists exactly the units the reading page lists, for every format', () => {
    const cases: Array<[Fmt, string, string?]> = [
      ['fountain', 'pilot.fountain'], ['dialog', 'gate.dialog.yaml'], ['markdown', 'keynote.md', 'speech-small'],
      ['markdown', 'verse/song.md', 'song'], ['markdown', 'verse/sonnet-clean.md', 'sonnet'], ['markdown', 'setup-guide.md'],
    ];
    for (const [format, file, form] of cases) {
      const text = readFileSync(fixture(file), 'utf8');
      const units = unitsOf(text, format, form);
      const spans = unitSpans(text, format, form);
      expect(spans.length, file).toBe(units.length);
      spans.forEach((s, i) => expect(units[i].endsWith(s.text), `${file} #${i}`).toBe(true));
    }
  });
});

describe('line refs', () => {
  it('parses a comma list of numbers and inclusive ranges', () => {
    expect(parseRefs('12')).toEqual([{ start: 12, end: 12 }]);
    expect(parseRefs(' 12-13 , 20 ')).toEqual([{ start: 12, end: 13 }, { start: 20, end: 20 }]);
  });

  it('refuses anything else as E_USAGE with a hint', () => {
    for (const bad of ['', ',', 'a', '12-', '-3', '0', '3-2', '1.5', '1 2', '12-13-14']) expect(usage(() => parseRefs(bad)), bad).toMatch(/^E_USAGE: .*\| \S/);
    expect(usage(() => parseRefs(Array.from({ length: 21 }, (_, k) => k + 1).join(',')))).toMatch(/At most 20/);
  });

  it('selects every unit whose lines overlap a ref, so a line inside a span names the span', () => {
    const s = unitSpans('INT. ROOM - DAY\n\nMARA\nNot tonight.\nPlease.\n\nCUT TO:\n', 'fountain');
    expect(selectSpans(s, parseRefs('5')).map(x => x.ref)).toEqual(['4-5']);
    expect(selectSpans(s, parseRefs('1-4')).map(x => x.ref)).toEqual(['1', '4-5']);
    expect(selectSpans(s, parseRefs('7,1')).map(x => x.ref)).toEqual(['1', '7']);
  });

  it('a ref that holds no unit is E_USAGE and lists the refs that exist, capped at 20', () => {
    const s = unitSpans('INT. ROOM - DAY\n\nMARA\nNot tonight.\n\nCUT TO:\n', 'fountain');
    expect(usage(() => selectSpans(s, parseRefs('2')))).toMatch(/^E_USAGE: 2 is not a line .*\| Units: 1, 4, 6$/);
    const many = unitSpans(Array.from({ length: 30 }, (_, k) => `Line ${k + 1}.`).join('\n\n'), 'markdown');
    expect(unitRefs(many)).toMatch(/^Units: 1, 3, 5.*, \.\.\.$/);
    expect(unitRefs(many).split(',').length).toBe(21);
  });
});
