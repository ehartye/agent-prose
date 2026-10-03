// Event ids are the page's idempotency keys: plain characters only, passed to the CLI as one argument, and a retry is
// recognised by (type, eventId), so a note and a duel that share an id are both recorded.
import { afterEach, describe, expect, it } from 'vitest';
import { ReadingServer } from '../src/reading/server.ts';
import { readEvents } from '../src/reading/session.ts';
import { useTempHome, useTmp } from './owner-helpers.ts';
import { post, seed, startServer, projectRows } from './reading-helpers.ts';
import { run } from './helpers.ts';

useTmp();
useTempHome();
const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });
const lineup = { type: 'lineup', kept: [1, 2, 3], duds: [], order: [1, 2, 3], eventId: 'l1' };

describe('eventId characters', () => {
  it('rejects a NUL, a space, a quote, a slash, a newline and a 101-character id with 400 E_SCHEMA (not a 500)', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    for (const eventId of ['a\0b', 'a b', 'a"b', 'a/b', 'a\nb', 'x'.repeat(101), '', 'é']) {
      const r = await post(info, 'read-1', JSON.stringify({ type: 'play', index: 1, mode: 'read', eventId }));
      expect([r.status, r.body.error.code], JSON.stringify(eventId)).toEqual([400, 'E_SCHEMA']);
    }
    expect(readEvents(s.project, 'read-1')).toEqual([]);
  });

  it('accepts letters, digits, dot, underscore, colon and hyphen, up to 100 characters', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    for (const eventId of ['A-z_0.9:k', '-leading-hyphen', 'x'.repeat(100), 'e2c1a0b4-1c6d-4f0e-9a52-0123456789ab']) {
      const r = await post(info, 'read-1', { type: 'play', index: 1, mode: 'read', eventId });
      expect([r.status, eventId.length > 20 ? 0 : eventId], eventId).toEqual([200, eventId.length > 20 ? 0 : eventId]);
    }
  });

  it('prose set duel refuses an event id with other characters', async () => {
    const s = seed();
    for (const id of ['a b', 'a\0b', 'a/b']) {
      await expect(run('set', 'duel', 'demo', '--a', '1', '--b', '2', '--outcome', 'a', `--event-id=${id}`, '--dir', s.project), id).rejects.toMatchObject({ code: 'E_USAGE' });
    }
  });
});

describe('the CLI gets the event id as one argument', () => {
  it('passes --event-id=<id> (an id starting with a hyphen cannot be read as an option)', async () => {
    const s = seed();
    const calls: string[][] = [];
    const { info } = await startServer(servers, { projects: [s.project], runProse: async (args: string[]) => { calls.push(args); return { appended: 1 }; } });
    await post(info, 'read-1', lineup);
    const r = await post(info, 'read-1', { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab', eventId: '-d1' });
    expect(r.status).toBe(200);
    expect(calls[0]).toContain('--event-id=-d1');
    expect(calls[0]).not.toContain('--event-id');
    expect(calls[0]).not.toContain('-d1');
  });

  it('works against the real CLI with a hyphen-leading id', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project] });
    await post(info, 'read-1', lineup);
    const r = await post(info, 'read-1', { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab', eventId: '-d1' });
    expect(r.status, r.text).toBe(200);
    expect(projectRows(s.project).map(x => (x as any).eventId)).toEqual(['-d1']);
  }, 30_000);
});

describe('dedupe matches on (type, eventId)', () => {
  it('a note and a duel that share an id are both recorded; a retry of each is a duplicate', async () => {
    const s = seed();
    const { info } = await startServer(servers, { projects: [s.project], runProse: async () => ({ appended: 1 }) });
    await post(info, 'read-1', lineup);
    const note = { type: 'note', index: 1, unit: 0, text: 'too blunt', eventId: 'same' };
    const duel = { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab', eventId: 'same' };
    const first = await post(info, 'read-1', note);
    const second = await post(info, 'read-1', duel);
    expect([first.status, first.body.duplicate, second.status, second.body.duplicate]).toEqual([200, undefined, 200, undefined]);
    expect(readEvents(s.project, 'read-1').map(e => e.type)).toEqual(['lineup', 'note', 'duel']);
    const noteRetry = await post(info, 'read-1', note);
    const duelRetry = await post(info, 'read-1', duel);
    expect([noteRetry.body.duplicate, duelRetry.body.duplicate]).toEqual([true, true]);
    expect(readEvents(s.project, 'read-1').map(e => e.type)).toEqual(['lineup', 'note', 'duel']);
  });
});
