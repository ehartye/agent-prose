import { describe, expect, it } from 'vitest';
import { layoutOf, unitsOf } from '../src/reading/units.ts';

const MD = `---
form: speech-small
---

# The bridge

We built the bridge in the rain. It took four years! Did anyone believe us?

> A quoted line. And another.

<!-- a private comment -->

Today it carries a thousand people a day.
`;

const FOUNTAIN = `Title: Pilot

INT. KITCHEN - NIGHT

Rain on the window. A kettle screams.

MARA
(whispering)
Not tonight.
Please.

CUT TO:
`;

const DIALOG = `form: quest-dialog
start: gate
nodes:
  - id: gate
    speaker: GUARD
    text: |
      Halt.
      State your business.
    choices:
      - text: I'm here to trade.
        to: trade
  - id: trade
    speaker: GUARD
    text: Market's that way.
    end: true
barks:
  - pool: idle
    speaker: GUARD
    context: waiting
    lines:
      - Nice weather.
`;

describe('unitsOf', () => {
  it('splits Markdown into sentences per block, headings as their own unit', () => {
    expect(unitsOf(MD, 'markdown')).toEqual([
      'The bridge',
      'We built the bridge in the rain.', 'It took four years!', 'Did anyone believe us?',
      'A quoted line.', 'And another.',
      'Today it carries a thousand people a day.',
    ]);
  });

  it('splits Fountain into one unit per block line (a speech is one unit), without cues or title page', () => {
    expect(unitsOf(FOUNTAIN, 'fountain')).toEqual([
      'INT. KITCHEN - NIGHT',
      'Rain on the window. A kettle screams.',
      '(whispering)', 'MARA: Not tonight. Please.',
      'CUT TO:',
    ]);
  });

  it("prefixes each unit of a speech with its speaker, keeping a cue extension but not CONT'D, and none on action", () => {
    const script = `INT. HALL - DAY

GRIMBLE (V.O.)
First line.

GRIMBLE (CONT'D)
Second line.

Someone walks in.
`;
    expect(unitsOf(script, 'fountain')).toEqual([
      'INT. HALL - DAY', 'GRIMBLE (V.O.): First line.', 'GRIMBLE: Second line.', 'Someone walks in.',
    ]);
  });

  it('splits dialog into the text lines of each node, choice and bark', () => {
    expect(unitsOf(DIALOG, 'dialog')).toEqual([
      'GUARD: Halt.', 'GUARD: State your business.', "I'm here to trade.", "GUARD: Market's that way.", 'GUARD: Nice weather.',
    ]);
  });

  it('keeps a dialog speaker extension in the prefix', () => {
    const y = `nodes:
  - id: a
    speaker: GRIMBLE (O.S.)
    text: Who goes?
    variants:
      - Name yourself.
`;
    expect(unitsOf(y, 'dialog')).toEqual(['GRIMBLE (O.S.): Who goes?', 'GRIMBLE (O.S.): Name yourself.']);
  });

  it('is stable across calls and CRLF line endings', () => {
    for (const [text, format] of [[MD, 'markdown'], [FOUNTAIN, 'fountain'], [DIALOG, 'dialog']] as const) {
      expect(unitsOf(text, format)).toEqual(unitsOf(text, format));
      expect(unitsOf(text.replace(/\n/g, '\r\n'), format)).toEqual(unitsOf(text, format));
    }
  });

  it('returns no units for an empty variant', () => {
    for (const format of ['markdown', 'fountain', 'dialog'] as const) {
      expect(unitsOf('', format)).toEqual([]);
      expect(unitsOf('  \n\n', format)).toEqual([]);
    }
  });
});

const SONNET = `---
form: sonnet-shakespearean
---

Shall I compare thee to a summer's day?
Thou art more lovely and more temperate.
Rough winds do shake the darling buds of May,
And summer's lease hath all too short a date.

Sometime too hot the eye of heaven shines,
And often is his gold complexion dimmed.
`;

describe('layoutOf', () => {
  it('lays Markdown prose out as paragraphs: a break at each block start', () => {
    const l = layoutOf(MD, 'markdown', 'speech-small');
    expect(l.layout).toBe('prose');
    expect(l.units).toEqual(unitsOf(MD, 'markdown'));
    // heading | 3 sentences | quote (2) | closing line
    expect(l.breaks).toEqual([1, 4, 6]);
  });

  it('lays a verse form out as lines, one unit per line, with a break at each stanza', () => {
    const l = layoutOf(SONNET, 'markdown', 'sonnet-shakespearean');
    expect(l.layout).toBe('lines');
    expect(l.units).toHaveLength(6);
    expect(l.units[0]).toBe("Shall I compare thee to a summer's day?");
    expect(l.units[1]).toBe('Thou art more lovely and more temperate.');
    expect(l.breaks).toEqual([4]);
    // the same text under a prose form is split into sentences, which is why the form matters
    expect(layoutOf(SONNET, 'markdown', 'professional').units.length).toBeLessThan(6);
  });

  it('lays Fountain out as lines with a break at each block, keeping a parenthetical with its speech', () => {
    const l = layoutOf(FOUNTAIN, 'fountain', 'tv-drama');
    expect(l.layout).toBe('lines');
    expect(l.units).toEqual(unitsOf(FOUNTAIN, 'fountain'));
    // scene | action | (whispering) + speech | transition
    expect(l.breaks).toEqual([1, 2, 4]);
  });

  it('lays dialog out as lines and an empty draft out as nothing', () => {
    expect(layoutOf(DIALOG, 'dialog', 'quest-dialog').layout).toBe('lines');
    expect(layoutOf('   ', 'markdown', 'free-verse')).toEqual({ layout: 'prose', units: [], breaks: [] });
  });
});
