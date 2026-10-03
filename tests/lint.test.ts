import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { lint } from '../src/lint/lint.ts';
import { measure } from '../src/measure/index.ts';
import { EVALUATORS } from '../src/lint/evaluators.ts';
import { RULES, rulesFor } from '../src/craft/rules.ts';
import { fixture, run } from './helpers.ts';

const ids = (fs: Array<{ rule: string }>) => fs.map(f => f.rule);

describe('evaluator registry', () => {
  it('has exactly one evaluator per auto rule', () => {
    const auto = RULES.filter(r => r.check === 'auto').map(r => r.id).sort();
    expect(Object.keys(EVALUATORS).sort()).toEqual(auto);
  });
});

describe('lint', () => {
  it('flags long spoken sentences in a speech and reports duration', () => {
    const r = lint(loadDocument(fixture('keynote.md')));
    expect(r.warnings).toEqual([expect.objectContaining({ rule: 'spoken.sentence.max', at: { line: 10 }, measured: 18 })]);
    expect(ids(r.info)).toContain('spoken.duration.report');
    expect(r.ok).toBe(true);
  });

  it('flags instructions: long sentence, filler, and There-is with its trade-off', () => {
    const r = lint(loadDocument(fixture('setup-guide.md')));
    expect(r.warnings).toContainEqual(expect.objectContaining({ rule: 'style.sentence.max', at: { line: 10 }, measured: 30 }));
    expect(ids(r.warnings).filter(x => x === 'procedure.filler')).toHaveLength(2);
    const there = r.info.find(f => f.rule === 'plain.there-is')!;
    expect(there.at).toEqual({ line: 7 });
    expect(there.tradeoffs).toEqual([expect.objectContaining({ rule: 'ai.copula-avoidance' })]);
  });

  it('errors on dialog graph defects and warns on boxes and barks', () => {
    const r = lint(loadDocument(fixture('gate.dialog.yaml')));
    expect(r.ok).toBe(false);
    expect(ids(r.errors).sort()).toEqual(['dialog.graph.dangling', 'dialog.graph.dead-end']);
    expect(ids(r.warnings).sort()).toEqual([
      'dialog.barks.variety', 'dialog.barks.variety', 'dialog.graph.unreachable', 'dialog.graph.unreachable', 'dialog.line.box',
    ]);
  });

  it('lists judgement rules for the form', () => {
    const r = lint(loadDocument(fixture('pilot.fountain')));
    expect(r.judgement.map(j => j.rule)).toEqual(['comedy.serious-moments', 'voice.distinct']);
    expect(ids(r.info)).toContain('script.runtime.report');
  });

  it('lists formal judgement rules for academic and professional forms', () => {
    const academic = rulesFor('academic').map(r => r.id);
    expect(academic).toEqual(expect.arrayContaining(['formal.bluf', 'formal.supported-claims']));
    expect(rulesFor('professional').map(r => r.id)).toContain('formal.bluf');
    const techDoc = rulesFor('tech-doc').map(r => r.id);
    expect(techDoc).toContain('formal.supported-claims');
    expect(techDoc).not.toContain('formal.bluf');
    for (const id of ['formal.bluf', 'formal.supported-claims', 'comedy.premise']) expect(RULES.find(r => r.id === id)!.check).toBe('judgement');
  });

  it('lists the comic-premise judgement on a multi-cam script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-lint-'));
    const file = join(dir, 'ep.fountain');
    writeFileSync(file, 'Title: Ep\nForm: sitcom-multicam\n\nINT. KITCHEN - DAY\n\nBOB\nWho ate the cake?\n');
    expect(lint(loadDocument(file)).judgement.map(j => j.rule)).toContain('comedy.premise');
  });

  it('states rules faithfully to their sources', () => {
    const premise = RULES.find(r => r.id === 'comedy.premise')!;
    expect(premise.statement).toBe("Jokes grow from the scene's comic premise.");
    expect(premise.forms).toEqual(['sitcom-multicam', 'sitcom-singlecam']);
    const claims = RULES.find(r => r.id === 'formal.supported-claims')!;
    expect(claims.derived).toBe(true);
    expect(claims.sources).toEqual(['wikipedia-signs-ai']);
    expect(claims.rationale).toMatch(/^Plugin policy:/);
  });

  it('errors on chatbot artifacts and warns on clustered AI vocabulary', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-lint-'));
    const file = join(dir, 'memo.md');
    writeFileSync(file, '---\nform: professional\n---\n\nWe delve into the intricate tapestry. It serves as a testament to grit. :contentReference[oaicite:3]{index=3}\n');
    const r = lint(loadDocument(file));
    expect(ids(r.errors)).toEqual(['ai.artifact']);
    expect(r.warnings).toContainEqual(expect.objectContaining({ rule: 'ai.vocabulary', at: { line: 5 } }));
  });

  it('sorts each finding list by line, nulls first, stably', () => {
    const lines = (fs: Array<{ at: { line: number | null } }>) => fs.map(f => f.at.line ?? -Infinity);
    for (const name of ['keynote.md', 'setup-guide.md', 'gate.dialog.yaml', 'pilot.fountain']) {
      const r = lint(loadDocument(fixture(name)));
      for (const list of [r.errors, r.warnings, r.info]) {
        const got = lines(list);
        expect(got, name).toEqual([...got].sort((a, b) => a - b));
      }
    }
  });

  it('reports dialog duration as total voice-over, not playtime', () => {
    const r = lint(loadDocument(fixture('gate.dialog.yaml')));
    const d = r.info.find(f => f.rule === 'spoken.duration.report')!;
    expect(d.message).toMatch(/^About [\d.]+ min of recorded voice-over in total \(all branches and barks\) at \d+ wpm \(\d+ words\)/);
    const speech = lint(loadDocument(fixture('keynote.md'))).info.find(f => f.rule === 'spoken.duration.report')!;
    expect(speech.message).not.toMatch(/voice-over/);
  });

  it('warns on an unclosed Fountain note', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-lint-'));
    const file = join(dir, 'note.fountain');
    writeFileSync(file, '\nShe [[oops\n\nINT. ROOM - DAY\n');
    const r = lint(loadDocument(file));
    expect(r.warnings.filter(f => f.rule === 'script.unclosed-note')).toEqual([
      expect.objectContaining({ rule: 'script.unclosed-note', at: { line: 2 } }),
    ]);
    expect(lint(loadDocument(fixture('pilot.fountain'))).warnings.map(f => f.rule)).not.toContain('script.unclosed-note');
  });

  it('flags an unclosed note in any script block kind, and a stray closer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-lint-'));
    const file = join(dir, 'kinds.fountain');
    writeFileSync(file, '\nINT. ROOM [[OOPS - DAY\n\n> CUT TO [[BLACK\n\n~La la [[hum\n\nShe waits.]]\n');
    const notes = lint(loadDocument(file)).warnings.filter(f => f.rule === 'script.unclosed-note');
    expect(notes.map(f => [f.at.line, f.message])).toEqual([
      [2, 'Unclosed [[ (note text is being read as script)'],
      [4, 'Unclosed [[ (note text is being read as script)'],
      [6, 'Unclosed [[ (note text is being read as script)'],
      [8, 'Stray ]] (an empty line above ended the note)'],
    ]);
  });

  it('merges overlapping echoed phrases into one finding', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-lint-'));
    const file = join(dir, 'memo.md');
    const text = 'We agreed in terms of the next steps today.\n\nSam asked in terms of the next steps why.\n\nNotes in terms of the next steps follow.\n';
    writeFileSync(file, `---\nform: professional\n---\n\n${text}`);
    const echo = lint(loadDocument(file)).info.filter(f => f.rule === 'style.echo');
    expect(echo.map(f => f.message)).toEqual(['"in terms of the next steps" appears 3 times']);
    expect(echo[0].at).toEqual({ line: 5 });
  });

  it('quotes the matched text in lexicon findings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-lint-'));
    const memo = join(dir, 'memo.md');
    writeFileSync(memo, '---\nform: professional\n---\n\nThe tool functions as a bridge. Signed, [Your Name]\n');
    const r = lint(loadDocument(memo));
    expect(r.errors.find(f => f.rule === 'ai.artifact')!.message).toBe('Chatbot artifact: “[Your Name]”');
    expect(r.warnings.concat(r.info).find(f => f.rule === 'ai.copula-avoidance')!.message).toBe('“functions as” in place of is/are');
    const guide = join(dir, 'guide.md');
    writeFileSync(guide, "---\nform: instructions\n---\n\nIt's easy to start.\n");
    expect(lint(loadDocument(guide)).warnings.find(f => f.rule === 'procedure.filler')!.message).toBe('Filler word: “It\'s easy”');
  });

  it('writes readable report messages', () => {
    const there = lint(loadDocument(fixture('setup-guide.md'))).info.find(f => f.rule === 'plain.there-is')!;
    expect(there.message).toBe('Sentence opens with There is/are/was/were or Here is/are');
    const runtime = lint(loadDocument(fixture('pilot.fountain'))).info.find(f => f.rule === 'script.runtime.report')!;
    expect(runtime.message).toMatch(/^About [\d.]+ pages, [\d.]+ min \(range [\d.]+–[\d.]+ min\)$/);
    const bark = lint(loadDocument(fixture('gate.dialog.yaml'))).warnings.find(f => f.rule === 'dialog.barks.variety' && f.at.line === 34)!;
    expect(bark.message).toBe('Bark pool guard-idle: lines 33 and 34 share 5 of their 6 distinct words (overlap 0.83, limit 0.6)');
  });

  it('carries sources on judgement entries and rationale in prose rules', async () => {
    const r = lint(loadDocument(fixture('pilot.fountain')));
    const serious = RULES.find(x => x.id === 'comedy.serious-moments')!;
    expect(r.judgement[0]).toEqual({ rule: serious.id, severity: serious.severity, statement: serious.statement, sources: serious.sources });
    const out = await run('lint', fixture('pilot.fountain'));
    expect(out.judgement[0].sources).toEqual(serious.sources);
    const rules = await run('rules', '--form', 'youtube');
    const promise = rules.rules.find((x: { id: string }) => x.id === 'youtube.promise-delivery');
    expect(promise.rationale).toBe(RULES.find(x => x.id === 'youtube.promise-delivery')!.rationale);
  });

  it('is exposed as prose lint and prose rules', async () => {
    const out = await run('lint', fixture('gate.dialog.yaml'));
    expect(out.ok).toBe(false);
    const rules = await run('rules', '--form', 'youtube');
    expect(rules.rules.map((r: { id: string }) => r.id)).toContain('youtube.promise-delivery');
    const caps = await run('capabilities');
    expect(caps.rules).toBe(RULES.length);
    expect(caps.commands).toEqual(expect.arrayContaining(['capabilities', 'lint', 'measure', 'parse', 'rules']));
  });
});

describe('lint inputs and output headers', () => {
  it('lints against a measurement the caller passes in', () => {
    const doc = loadDocument(fixture('gate.dialog.yaml'));
    const m = measure(doc);
    const barks = (r: ReturnType<typeof lint>) => r.warnings.filter(f => f.rule === 'dialog.barks.variety' && f.measured && 'similarity' in (f.measured as object));
    expect(barks(lint(doc, m))).toHaveLength(1);
    expect(barks(lint(doc, { ...m, dialog: { ...m.dialog!, nearRepeats: [] } }))).toHaveLength(0);
  });

  it('applies the rule threshold to the full list of bark pairs, reading text by block index', () => {
    const doc = loadDocument(fixture('gate.dialog.yaml'));
    const m = measure(doc);
    // a pair whose lines are wrong but whose indexes are right still reads the right text
    const pair = { ...m.dialog!.nearRepeats.find(p => p.a === 33)!, a: 1, b: 2 };
    const r = lint(doc, { ...m, dialog: { ...m.dialog!, nearRepeats: [pair, { pool: 'guard-idle', a: 33, b: 34, ai: 7, bi: 8, similarity: 0.1 }] } });
    const found = r.warnings.filter(f => f.rule === 'dialog.barks.variety' && f.message.includes('overlap'));
    expect(found.map(f => f.message)).toEqual(['Bark pool guard-idle: lines 1 and 2 share 5 of their 6 distinct words (overlap 0.83, limit 0.6)']);
  });

  it('heads lint output with format and register, like parse and measure', async () => {
    const out = await run('lint', fixture('keynote.md'));
    expect([out.path, out.format, out.form, out.register]).toEqual([fixture('keynote.md'), 'markdown', 'speech-large', 'professional']);
    const dialog = await run('lint', fixture('gate.dialog.yaml'));
    expect([dialog.format, dialog.register]).toEqual(['dialog', null]);
  });

  it('lists each rule with its topic, forms and registers', async () => {
    const out = await run('rules');
    const rule = RULES.find(r => r.registers !== 'all') ?? RULES[0];
    const listed = out.rules.find((x: { id: string }) => x.id === rule.id);
    expect(listed).toMatchObject({ topic: rule.topic, forms: rule.forms, registers: rule.registers });
  });
});
