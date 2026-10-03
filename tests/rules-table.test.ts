import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RULES } from '../src/craft/rules.ts';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { initProject } from '../src/project.ts';
import { measure } from '../src/measure/index.ts';
import { VOICE_MIN_WORDS } from '../src/voice.ts';

/** A draft written to its own temp directory; `voices` makes that directory a prose project holding these bibles. */
interface Draft { file: string; text: string; voices?: Record<string, string> }

const made: string[] = [];
const tmp = (prefix: string) => { const d = mkdtempSync(join(tmpdir(), prefix)); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

function lintDraft(d: Draft) {
  const dir = tmp('prose-table-');
  if (d.voices) {
    // an injected home: nothing here touches the real home directory
    initProject(dir, { home: tmp('prose-table-home-') });
    for (const [name, body] of Object.entries(d.voices)) writeFileSync(join(dir, '.agent-prose', 'voices', name), body);
  }
  const file = join(dir, d.file);
  writeFileSync(file, d.text);
  return lint(loadDocument(file));
}
const findings = (d: Draft) => { const r = lintDraft(d); return [...r.errors, ...r.warnings, ...r.info]; };
const fired = (d: Draft, rule: string) => findings(d).some(f => f.rule === rule);

const md = (form: string, body: string, front = ''): Draft => ({ file: 'draft.md', text: `---\nform: ${form}\n${front}---\n\n${body}\n` });
const fountain = (form: string, body: string, voices?: Record<string, string>): Draft =>
  ({ file: 'scene.fountain', text: `Title: T\nForm: ${form}\n\nINT. ROOM - DAY\n\n${body}\n`, ...(voices ? { voices } : {}) });
const dialog = (form: string, lines: string[]): Draft => ({ file: 'talk.dialog.yaml', text: [`form: ${form}`, ...lines].join('\n') + '\n' });

const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');
const sentence = (n: number) => `The ${words(n - 1, 'cat')}.`;

/** A sound quest: start reaches a single ending node, and one bark pool with two distinct lines. */
const GOOD_DIALOG = dialog('quest-dialog', [
  'start: a',
  'nodes:',
  '  - id: a', '    speaker: X', '    text: Hello there.', '    choices:', '      - text: Bye.', '        to: b',
  '  - id: b', '    speaker: X', '    text: Farewell.', '    end: true',
  'barks:',
  '  - pool: idle', '    speaker: X', '    context: idle', '    lines:', '      - Quiet night on the wall.', '      - Rain again, of course.',
]);
const badDialog = (nodes: string[]) => dialog('quest-dialog', ['start: a', 'nodes:', ...nodes]);

const BIBLE = [
  'schema: prose/voice@1', 'id: grimble', 'name: Grimble', 'speakers: [GRIMBLE]',
  'description: A curt goblin shopkeeper.', 'samples: ["Buy or leave."]', 'banned: [friend]',
  'targets:', '  sentenceMean: [2, 6]',
].join('\n') + '\n';
const VOICES = { 'grimble.yaml': BIBLE };
const say = (speaker: string, line: string) => `${speaker}\n${line}\n`;
const CURT = say('GRIMBLE', 'Buy or leave. No haggling here. Pay first. Coins on the counter. Lamps are fragile. Mind the shelf. ' +
  'Touch nothing twice. Shop closes soon. Bring the cart round. Ask the boy. He knows prices. I do not chat. Next customer. Hurry up.');
const LONG = say('GRIMBLE', 'Every lamp on these shelves was carried over the mountains by my own two hands in the dead of winter. ' +
  'Take your time and look around, because nothing here is cheap and nothing here is fake, whatever the others say.');

/** `unanchored`: the finding is about the whole document, so it has no line. `alone`: the failing draft must trigger no other dialog rule. */
interface Row { rule: string; passing: Draft; failing: Draft; note?: string; unanchored?: true; alone?: true }

const ROWS: Row[] = [
  { rule: 'style.sentence.max', passing: md('academic', sentence(20)), failing: md('academic', sentence(30)) },
  { rule: 'spoken.sentence.max', passing: md('speech-small', sentence(12)), failing: md('speech-small', sentence(20)) },
  { rule: 'readability.grade.report', unanchored: true, note: 'reported once a draft has 30 words', passing: md('academic', sentence(20)), failing: md('academic', sentence(20) + ' ' + sentence(20)) },
  { rule: 'style.passive.report', unanchored: true, passing: md('academic', 'The boy threw the ball.'), failing: md('academic', 'The ball was thrown by the boy.') },
  { rule: 'style.echo', passing: md('academic', 'We ran the tests. We fixed the bug. We shipped the fix.'),
    failing: md('academic', 'In terms of cost it works. In terms of time it works. In terms of risk it works.') },
  { rule: 'plain.there-is', passing: md('professional', 'The build has a problem.'), failing: md('professional', 'There is a problem with the build.') },
  { rule: 'ai.copula-avoidance', passing: md('academic', 'The library is a hub for the town.'), failing: md('academic', 'The library serves as a hub for the town.') },
  { rule: 'ai.artifact', passing: md('academic', 'Results are in the table.'), failing: md('academic', 'Results are in the table contentReference[oaicite:0].') },
  { rule: 'draft.placeholders', passing: md('academic', 'Flake rate fell from 9% to 2%.'), failing: md('academic', 'Flake rate fell from [X%] to [Y%].') },
  { rule: 'ai.promotional', passing: md('academic', 'This study is new.'), failing: md('academic', 'This groundbreaking study is new.') },
  { rule: 'ai.vocabulary', passing: md('academic', 'We delve into the data.'),
    failing: md('academic', 'We delve into the intricate tapestry of the data.') },
  { rule: 'procedure.filler', passing: md('instructions', '1. Open the lid.\n2. Press reset.'), failing: md('instructions', '1. Simply open the lid.\n2. Press reset.') },
  { rule: 'spoken.duration.report', unanchored: true, note: 'always reported for spoken forms; absent from read forms',
    passing: md('academic', 'A short note.'), failing: md('speech-small', 'Thank you all for coming tonight.') },
  { rule: 'script.runtime.report', unanchored: true, note: 'always reported for scripts; absent from Markdown',
    passing: md('academic', 'A short note.'), failing: fountain('tv-drama', 'She waits.') },
  { rule: 'script.unclosed-note', passing: fountain('tv-drama', 'She waits. [[a note]]'), failing: fountain('tv-drama', 'She waits. [[unclosed note]') },
  { rule: 'dialog.graph.dangling', passing: GOOD_DIALOG,
    failing: badDialog(['  - id: a', '    speaker: X', '    text: Hi.', '    next: nowhere']) },
  { rule: 'dialog.graph.dead-end', passing: GOOD_DIALOG,
    failing: badDialog(['  - id: a', '    speaker: X', '    text: Hi.', '    next: b', '  - id: b', '    speaker: X', '    text: Stuck.']) },
  { rule: 'dialog.graph.unreachable', passing: GOOD_DIALOG,
    failing: badDialog(['  - id: a', '    speaker: X', '    text: Hi.', '    end: true', '  - id: orphan', '    speaker: X', '    text: Lost.', '    end: true']) },
  { rule: 'dialog.choices.fallback', passing: GOOD_DIALOG, alone: true, note: 'an unconditional next keeps an exit open, so only this rule fires',
    failing: badDialog(['  - id: a', '    speaker: X', '    text: Hi.', '    next: b', '    choices:', '      - text: Pay.', '        to: b', '        condition: has_coin',
      '  - id: b', '    speaker: X', '    text: Thanks.', '    end: true']) },
  { rule: 'dialog.line.box', passing: GOOD_DIALOG,
    failing: badDialog(['  - id: a', '    speaker: X', `    text: ${'Halt there, traveller, and state your business before the bell rings twice and the captain wakes up.'}`, '    end: true']) },
  { rule: 'dialog.barks.variety', passing: GOOD_DIALOG,
    failing: dialog('barks', ['barks:', '  - pool: alarm', '    speaker: X', '    context: alarm', '    lines:', '      - To arms!']) },
  { rule: 'length.target', unanchored: true, passing: md('speech-small', `${words(130)}.`, 'target: 1 minute\n'), failing: md('speech-small', `${words(160)}.`, 'target: 1 minute\n') },
  { rule: 'youtube.segment.pace', passing: md('youtube', `0:00-0:10 ${words(20)}.`), failing: md('youtube', `0:00-0:10 ${words(40)}.`) },
  { rule: 'script.multicam.caps-action', passing: fountain('sitcom-multicam', 'THE DOOR SWINGS OPEN, AND IN WALKS A STRANGER.'),
    failing: fountain('sitcom-multicam', 'The door swings open, and in walks a stranger.') },
  { rule: 'script.unprinted-marker', passing: fountain('tv-drama', '>ACT ONE<\n\nShe waits.'), failing: fountain('tv-drama', '# ACT ONE\n\nShe waits.') },
  { rule: 'dialog.revisit.variety', passing: GOOD_DIALOG,
    failing: badDialog(['  - id: a', '    speaker: X', '    text: What else?', '    choices:', '      - text: Ask again.', '        to: a', '      - text: Bye.', '        to: b',
      '  - id: b', '    speaker: X', '    text: Bye.', '    end: true']) },
  { rule: 'dialog.graph.exit', passing: GOOD_DIALOG, alone: true, note: 'an unconditional choice loops back, so no fallback; variants keep revisit quiet',
    failing: badDialog(['  - id: a', '    speaker: X', '    text: Hi.', '    variants: [Hi again.]', '    choices:', '      - text: Pay.', '        to: b', '        condition: has_coin',
      '      - text: Wait.', '        to: a',
      '  - id: b', '    speaker: X', '    text: Thanks.', '    end: true']) },
  { rule: 'procedure.step.imperative', passing: md('instructions', '1. Open the lid.\n2. Press reset.'), failing: md('instructions', '1. You open the lid.\n2. Press reset.') },
  { rule: 'procedure.single-step', passing: md('instructions', '1. Open the lid.\n2. Press reset.'), failing: md('instructions', '1. Open the lid.') },
  { rule: 'voice.targets', passing: fountain('tv-drama', CURT, VOICES), failing: fountain('tv-drama', LONG, VOICES) },
  { rule: 'voice.bible-valid', unanchored: true, passing: fountain('tv-drama', CURT, VOICES),
    failing: fountain('tv-drama', CURT, { 'grimble.yaml': 'schema: prose/voice@1\nid: grimble\n' }) },
  { rule: 'voice.banned', passing: fountain('tv-drama', say('GRIMBLE', 'Buy or leave.'), VOICES),
    failing: fountain('tv-drama', say('GRIMBLE', 'Buy or leave, friend.'), VOICES) },
  { rule: 'voice.unvoiced', passing: fountain('tv-drama', say('GRIMBLE', 'Buy or leave.'), VOICES),
    failing: fountain('tv-drama', say('GRIMBLE', 'Buy or leave.') + '\n' + say('BOB', 'Just looking.'), VOICES) },
];

describe('per-rule table', () => {
  const auto = RULES.filter(r => r.check === 'auto').map(r => r.id);

  it('has exactly one row for every auto rule', () => {
    const rows = ROWS.map(r => r.rule);
    expect(new Set(rows).size).toBe(rows.length);
    expect([...rows].sort()).toEqual([...auto].sort());
  });

  it('voice drafts are long enough to be checked, so a passing voice.targets draft passes on its numbers', () => {
    const dir = tmp('prose-table-');
    initProject(dir, { home: tmp('prose-table-home-') });
    writeFileSync(join(dir, '.agent-prose', 'voices', 'grimble.yaml'), BIBLE);
    const file = join(dir, 'scene.fountain');
    writeFileSync(file, fountain('tv-drama', CURT).text);
    const m = measure(loadDocument(file));
    expect(m.voices.matches.GRIMBLE).toBe('grimble');
    expect(m.speakers.GRIMBLE.words).toBeGreaterThanOrEqual(VOICE_MIN_WORDS);
  });

  for (const row of ROWS) {
    it(`${row.rule}: fires on the failing draft, not on the passing one${row.note ? ` (${row.note})` : ''}`, () => {
      expect(fired(row.failing, row.rule), 'failing draft').toBe(true);
      expect(fired(row.passing, row.rule), 'passing draft').toBe(false);
    });

    it(`${row.rule}: the finding ${row.unanchored ? 'is document-level' : 'is anchored to a line'}`, () => {
      const hit = findings(row.failing).find(f => f.rule === row.rule);
      expect(hit, 'finding').toBeDefined();
      if (row.unanchored) expect(hit!.at.line).toBeNull();
      else expect(hit!.at.line).not.toBeNull();
      if (row.alone) expect(findings(row.failing).filter(f => f.rule.startsWith('dialog.') && f.rule !== row.rule).map(f => f.rule)).toEqual([]);
    });
  }
});
