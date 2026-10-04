import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ID_RE, strikeDir, validId } from '../src/owner/paths.ts';
import {
  EVENT_SCHEMA, MAX_NOTE, StrikeEventSchema, foldStrikes, listStrikeDirs, parseStrikeLog, readStrikeLog, resolveDraft, storedByEventId,
  strikeKey, undoableApply, withStrikes, type NewEvent, type StrikeEvent,
} from '../src/strike/store.ts';
import { tmpProject, useTmp } from './owner-helpers.ts';

useTmp();

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const H3 = 'c'.repeat(64);
let n = 0;
const row = (e: NewEvent): StrikeEvent => StrikeEventSchema.parse({ ...e, schema: EVENT_SCHEMA, at: `2026-10-04T00:00:${String(n % 60).padStart(2, '0')}Z`, seq: ++n });
const strike = (id: string, extra: Partial<Extract<NewEvent, { type: 'strike' }>> = {}) =>
  row({ type: 'strike', id, ref: '5', start: 5, end: 5, text: `line ${id}`, reason: 'wrong-direction', draftHash: H1, ...extra });
const apply = (id: string, strikes: string[], before = H1, after = H2) =>
  row({ type: 'apply', id, strikes, before, after, removed: [{ start: 5, end: 5, raw: 'x\n', kind: 'unit', strike: strikes[0] }], digest: H3 });

describe('strike rows', () => {
  it('accepts the four row types and refuses unknown keys, bad refs, reasons, hashes and oversized notes', () => {
    const ok = { schema: EVENT_SCHEMA, at: 't', seq: 1 };
    expect(StrikeEventSchema.safeParse({ ...ok, type: 'strike', id: 's1', ref: '5-6', start: 5, end: 6, text: 't', reason: 'faulty-premise', note: 'why', draftHash: H1 }).success).toBe(true);
    const base = { ...ok, type: 'strike', id: 's1', ref: '5', start: 5, end: 5, text: 't', reason: 'wrong-direction', draftHash: H1 };
    expect(StrikeEventSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(StrikeEventSchema.safeParse({ ...base, ref: '5-' }).success).toBe(false);
    expect(StrikeEventSchema.safeParse({ ...base, reason: 'boring' }).success).toBe(false);
    expect(StrikeEventSchema.safeParse({ ...base, draftHash: 'abc' }).success).toBe(false);
    expect(StrikeEventSchema.safeParse({ ...base, note: 'x'.repeat(MAX_NOTE + 1) }).success).toBe(false);
    expect(StrikeEventSchema.safeParse({ ...base, note: 'bad\u0007bell' }).success).toBe(false);
    expect(StrikeEventSchema.safeParse({ ...base, text: 'x'.repeat(2001) }).success).toBe(false);
    expect(StrikeEventSchema.safeParse({ ...base, eventId: 'has space' }).success).toBe(false);
    expect(StrikeEventSchema.safeParse({ ...ok, type: 'clear', strike: 's1' }).success).toBe(true);
    expect(StrikeEventSchema.safeParse({ ...ok, type: 'clear', strike: '../x' }).success).toBe(false);
    expect(StrikeEventSchema.safeParse({ ...ok, type: 'apply', id: 'a1', strikes: [], before: H1, after: H2, removed: [], digest: H3 }).success).toBe(false);
    expect(StrikeEventSchema.safeParse({ ...ok, type: 'undo', apply: 'a1', before: H2, after: H1 }).success).toBe(true);
    expect(StrikeEventSchema.safeParse({ ...ok, type: 'teleport' }).success).toBe(false);
  });

  it('folds a note with its line endings and trims it', () => {
    const r = StrikeEventSchema.parse({ schema: EVENT_SCHEMA, at: 't', seq: 1, type: 'strike', id: 's1', ref: '1', start: 1, end: 1, text: 't', reason: 'wrong-direction', draftHash: H1, note: '  a\r\nb  ' });
    expect(r.type === 'strike' && r.note).toBe('a\nb');
  });
});

describe('foldStrikes', () => {
  it('a strike is pending, and stale when its draft hash is not the current one', () => {
    const f = foldStrikes([strike('s1'), strike('s2', { draftHash: H2 })], H1);
    expect(f.pending.map(p => [p.id, p.stale])).toEqual([['s1', false], ['s2', true]]);
    expect(foldStrikes([strike('s1')], H2).pending[0].stale).toBe(true);
    expect(foldStrikes([strike('s1')], null).pending[0].stale).toBe(true);
  });

  it('a clear withdraws a pending strike; clearing what is not pending is a problem, not a throw', () => {
    const f = foldStrikes([strike('s1'), strike('s2'), row({ type: 'clear', strike: 's1' }), row({ type: 'clear', strike: 's1' }), row({ type: 'clear', strike: 's9' })], H1);
    expect(f.pending.map(p => p.id)).toEqual(['s2']);
    expect(f.problems).toHaveLength(2);
  });

  it('numbers the next strike past every id ever used, cleared or applied', () => {
    expect(foldStrikes([], H1)).toMatchObject({ nextStrike: 1, nextApply: 1 });
    const f = foldStrikes([strike('s1'), strike('s4'), row({ type: 'clear', strike: 's4' }), apply('a2', ['s1'])], H1);
    expect(f).toMatchObject({ nextStrike: 5, nextApply: 3 });
  });

  it('an apply moves its strikes out of pending and keeps them forever', () => {
    const f = foldStrikes([strike('s1'), strike('s2'), apply('a1', ['s1'])], H2);
    expect(f.pending.map(p => p.id)).toEqual(['s2']);
    expect(f.applied).toHaveLength(1);
    expect(f.applied[0]).toMatchObject({ id: 'a1', before: H1, after: H2, undone: false });
    expect(f.applied[0].strikes.map(s => s.id)).toEqual(['s1']);
  });

  it('an undo marks the apply undone and returns its strikes to pending, valid again against the restored draft', () => {
    const events = [strike('s1'), strike('s2'), apply('a1', ['s1', 's2']), row({ type: 'undo', apply: 'a1', before: H2, after: H1 })];
    const f = foldStrikes(events, H1);
    expect(f.applied[0].undone).toBe(true);
    expect(f.pending.map(p => [p.id, p.stale])).toEqual([['s1', false], ['s2', false]]);
    expect(foldStrikes(events, H3).pending.every(p => p.stale)).toBe(true);
  });

  it('an undo of an apply that is missing or already undone is a problem and changes nothing', () => {
    const f = foldStrikes([strike('s1'), apply('a1', ['s1']), row({ type: 'undo', apply: 'a1', before: H2, after: H1 }), row({ type: 'undo', apply: 'a1', before: H2, after: H1 }), row({ type: 'undo', apply: 'a7', before: H2, after: H1 })], H1);
    expect(f.pending.map(p => p.id)).toEqual(['s1']);
    expect(f.problems).toHaveLength(2);
  });

  it('an apply naming a strike that is not pending records the apply and a problem', () => {
    const f = foldStrikes([strike('s1'), apply('a1', ['s1', 's8'])], H2);
    expect(f.applied[0].strikes.map(s => s.id)).toEqual(['s1']);
    expect(f.problems).toEqual(['a1 names s8, which is not pending']);
  });

  it('a duplicated strike id is ignored with a problem', () => {
    const f = foldStrikes([strike('s1'), strike('s1', { text: 'other' })], H1);
    expect(f.pending).toHaveLength(1);
    expect(f.pending[0].text).toBe('line s1');
    expect(f.problems).toHaveLength(1);
  });

  it('only the latest un-undone apply can be undone, and only while the draft is as it left it', () => {
    const events = [strike('s1'), strike('s2'), apply('a1', ['s1'], H1, H2), apply('a2', ['s2'], H2, H3)];
    const f = foldStrikes(events, H3);
    expect(undoableApply(f, H3)?.id).toBe('a2');
    expect(undoableApply(f, H2)).toBeNull();
    expect(undoableApply(f, H1)).toBeNull();
    const undone = foldStrikes([...events, row({ type: 'undo', apply: 'a2', before: H3, after: H2 })], H2);
    expect(undoableApply(undone, H2)?.id).toBe('a1');
    expect(undoableApply(foldStrikes([], H1), H1)).toBeNull();
  });

  it('keeps pending strikes in the order they were made and the history whole', () => {
    const events = [strike('s2'), strike('s10'), strike('s3')];
    const f = foldStrikes(events, H1);
    expect(f.pending.map(p => p.id)).toEqual(['s2', 's3', 's10']);
    expect(f.history).toBe(events);
  });
});

describe('parseStrikeLog', () => {
  it('skips and counts torn lines, unknown rows and rows missing their schema', () => {
    const good = JSON.stringify(strike('s1'));
    const text = [good, '{"type":"strike","id":"s2"', 'not json', JSON.stringify({ type: 'teleport' }), JSON.stringify({ ...JSON.parse(good), schema: 'other' }), '', good.replace('s1', 's3')].join('\n');
    const { events, skipped } = parseStrikeLog(text);
    expect(events.map(e => e.type === 'strike' && e.id)).toEqual(['s1', 's3']);
    expect(skipped).toBe(4);
  });

  it('finds a retry by type and event id', () => {
    const events = [strike('s1', { eventId: 'e1' }), row({ type: 'clear', strike: 's1', eventId: 'e1' })];
    expect(storedByEventId(events, 'strike', 'e1')?.type).toBe('strike');
    expect(storedByEventId(events, 'clear', 'e1')?.type).toBe('clear');
    expect(storedByEventId(events, 'clear', 'e2')).toBeUndefined();
    expect(storedByEventId(events, 'strike', undefined)).toBeUndefined();
  });
});

describe('strike keys and draft paths', () => {
  it('is a slug of the file name and eight hex of the path, and always a valid id', () => {
    const k = strikeKey('scenes/Act One (final) .fountain');
    expect(k).toMatch(/^act-one-final-fountain-[0-9a-f]{8}$/);
    expect(ID_RE.test(k)).toBe(true);
    expect(() => validId(k)).not.toThrow();
    expect(strikeKey('a/x.md')).not.toBe(strikeKey('b/x.md'));
    expect(strikeKey('a/x.md')).toBe(strikeKey('a/x.md'));
    expect(strikeKey('???.md')).toMatch(/^md-[0-9a-f]{8}$/);
    expect(strikeKey(`${'long-name-'.repeat(20)}.md`).length).toBeLessThanOrEqual(49);
    expect(strikeKey('..\\..\\evil.md')).toMatch(/^[a-z0-9-]+$/);
  });

  it('resolves a draft inside the project to its project-relative path', () => {
    const p = tmpProject();
    const file = p.write('talks/toast.md', 'Hello.\n');
    expect(resolveDraft(p.project, file)).toMatchObject({ file, source: 'talks/toast.md' });
  });

  it('refuses a draft outside the project, inside .agent-prose, of another type, missing, or a folder', () => {
    const p = tmpProject();
    const q = tmpProject();
    const other = q.write('x.md', 'Hi.\n');
    const code = (fn: () => unknown) => { try { fn(); } catch (e) { return `${(e as { code: string }).code}: ${(e as Error).message}`; } return 'none'; };
    expect(code(() => resolveDraft(p.project, other))).toMatch(/^E_USAGE: The draft is not inside the project/);
    expect(code(() => resolveDraft(p.project, join(p.project, '..', 'x.md')))).toMatch(/^E_NOT_FOUND|^E_USAGE/);
    const inside = p.write('.agent-prose/sets/demo/base.md', 'Hi.\n');
    expect(code(() => resolveDraft(p.project, inside))).toMatch(/^E_USAGE: A file inside \.agent-prose/);
    expect(code(() => resolveDraft(p.project, p.write('notes.txt', 'Hi.\n')))).toMatch(/^E_USAGE: Cannot tell the format/);
    expect(code(() => resolveDraft(p.project, join(p.project, 'nope.md')))).toMatch(/^E_NOT_FOUND/);
    mkdirSync(join(p.project, 'folder.md'));
    expect(code(() => resolveDraft(p.project, join(p.project, 'folder.md')))).toMatch(/^E_NOT_FOUND: Not a file/);
  });

  it('refuses a symbolic link (when the platform lets the test make one)', () => {
    const p = tmpProject();
    const real = p.write('real.md', 'Hi.\n');
    try { symlinkSync(real, join(p.project, 'link.md')); } catch { return; }
    expect(() => resolveDraft(p.project, join(p.project, 'link.md'))).toThrow(/symbolic link/);
  });
});

describe('withStrikes', () => {
  it('makes the folder and draft.json once, numbers rows, and a second writer sees the first one’s rows', () => {
    const p = tmpProject();
    const d = resolveDraft(p.project, p.write('a.md', 'Hello.\n'));
    withStrikes(p.project, d, w => {
      expect(w.events).toEqual([]);
      const a = w.append({ type: 'strike', id: 's1', ref: '1', start: 1, end: 1, text: 'Hello.', reason: 'wrong-direction', draftHash: H1 });
      expect(a).toMatchObject({ seq: 1, schema: EVENT_SCHEMA });
    });
    const dir = strikeDir(p.project, d.key);
    expect(JSON.parse(readFileSync(join(dir, 'draft.json'), 'utf8'))).toMatchObject({ schema: 'prose/strike-draft@1', source: 'a.md' });
    withStrikes(p.project, d, w => {
      expect(w.events.map(e => e.seq)).toEqual([1]);
      expect(w.append({ type: 'clear', strike: 's1' }).seq).toBe(2);
    });
    expect(readStrikeLog(dir).events.map(e => e.type)).toEqual(['strike', 'clear']);
    expect(listStrikeDirs(p.project)).toEqual([{ key: d.key, source: 'a.md', dir }]);
  });

  it('terminates a torn last line so it stays one skipped line, and keeps numbering past it', () => {
    const p = tmpProject();
    const d = resolveDraft(p.project, p.write('a.md', 'Hello.\n'));
    withStrikes(p.project, d, w => { w.append({ type: 'strike', id: 's1', ref: '1', start: 1, end: 1, text: 'Hello.', reason: 'wrong-direction', draftHash: H1 }); });
    const log = join(strikeDir(p.project, d.key), 'events.jsonl');
    writeFileSync(log, readFileSync(log, 'utf8') + '{"type":"clear","stri');
    withStrikes(p.project, d, w => { w.append({ type: 'clear', strike: 's1' }); });
    const { events, skipped } = readStrikeLog(strikeDir(p.project, d.key));
    expect(events.map(e => e.seq)).toEqual([1, 2]);
    expect(skipped).toBe(1);
  });

  it('refuses a folder that belongs to another draft', () => {
    const p = tmpProject();
    const d = resolveDraft(p.project, p.write('a.md', 'Hello.\n'));
    withStrikes(p.project, d, () => undefined);
    writeFileSync(join(strikeDir(p.project, d.key), 'draft.json'), JSON.stringify({ schema: 'prose/strike-draft@1', source: 'other.md', createdAt: 't' }));
    expect(() => withStrikes(p.project, d, () => undefined)).toThrow(/already belongs to another draft/);
  });

  it('listStrikeDirs ignores folders that are not ours', () => {
    const p = tmpProject();
    mkdirSync(join(p.project, '.agent-prose', 'strikes', 'stray'), { recursive: true });
    mkdirSync(join(p.project, '.agent-prose', 'strikes', '.tmp'), { recursive: true });
    expect(listStrikeDirs(p.project)).toEqual([]);
    expect(listStrikeDirs(tmpProject().project)).toEqual([]);
  });
});
