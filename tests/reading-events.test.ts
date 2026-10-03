import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { sessionDir } from '../src/owner/paths.ts';
import { textHash } from '../src/owner/prediction.ts';
import { createSet, readSet, variantPath } from '../src/owner/sets.ts';
import { ReadingServer, runProse, type ServerInfo } from '../src/reading/server.ts';
import { EventSchema, appendEvent, readEvents, readEventsDetailed } from '../src/reading/session.ts';
import { PUNCHY, SHORT, WARM, useTempHome, useTmp } from './owner-helpers.ts';
import { globalRows, http, post, projectRows, seed, startServer, variantFile, type Seed } from './reading-helpers.ts';

useTmp();
useTempHome();

const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });
const start = (s: Seed) => startServer(servers, { projects: [s.project] });

const lineup = (over: object = {}) => ({ type: 'lineup', kept: [1, 2, 3], duds: [], order: [2, 1, 3], eventId: 'l1', ...over });
const duel = (a: number, b: number, outcome: string, eventId: string, position = 'ab') => ({ type: 'duel', a, b, outcome, position, eventId });
const log = (s: Seed, id = 'read-1') => readEvents(s.project, id);
const logLines = (s: Seed, id = 'read-1') => readFileSync(join(sessionDir(s.project, id), 'events.jsonl'), 'utf8').split('\n').filter(Boolean);

/** Every pair of round 0 asked, so the session is in the refine stage with variant 2 as champion. */
async function toRefine(info: ServerInfo) {
  for (const e of [lineup(), duel(1, 2, 'b', 'd1'), duel(2, 3, 'a', 'd2'), duel(1, 3, 'a', 'd3')]) expect((await post(info, 'read-1', e)).status).toBe(200);
}

/** A second set whose three variants become round 1 (session indexes 4, 5, 6 = variants 1, 2, 3 of set `next`). */
function addRound(s: Seed) {
  const next = createSet(s.project, join(s.project, 't.md'), { id: 'next', count: 3, directions: ['shorter', 'warmer', 'punchier'] });
  [SHORT.replace('We built', 'We forged'), WARM.replace('you know', 'friends'), PUNCHY.replace('Nobody', 'No one')]
    .forEach((text, k) => writeFileSync(variantPath(s.project, next, next.variants[k]), text));
  const candidates = next.variants.map(v => ({
    index: v.index + 3, variant: v.index, name: `n${v.index}`, direction: v.direction, round: 1,
    hash: textHash(readFileSync(variantPath(s.project, next, v), 'utf8')),
  }));
  return { next, event: { type: 'round', n: 1, setId: 'next', candidates } };
}

async function toRound1(s: Seed, info: ServerInfo) {
  await toRefine(info);
  expect((await post(info, 'read-1', { type: 'refine', champion: 2, directions: ['warmer'], like: null, eventId: 'r1' })).status).toBe(200);
  const r = addRound(s);
  appendEvent(s.project, 'read-1', r.event); // what the CLI's `reading round` does
  expect((await post(info, 'read-1', { type: 'lineup', kept: [5, 6], duds: [4], order: [6, 5, 4, 2], eventId: 'l2' })).status).toBe(200);
  return r;
}

describe('POST /api/session/<id>/event: the door', () => {
  it('needs the token, a known session, and the POST method', async () => {
    const s = seed();
    const { info } = await start(s);
    expect((await post(info, 'read-1', lineup(), { token: null })).status).toBe(401);
    expect((await post(info, 'read-1', lineup(), { token: 'wrong' })).status).toBe(401);
    const unknown = await post(info, 'nope', lineup());
    expect([unknown.status, unknown.body.error.code]).toEqual([404, 'E_NOT_FOUND']);
    expect((await http(info, '/api/session/read-1/event', { method: 'GET' })).status).toBe(405);
    expect(log(s)).toEqual([]);
  });

  it('answers an oversize body with 413 E_SERVER, and a body near the cap is read', async () => {
    const s = seed();
    const { info } = await start(s);
    const r = await post(info, 'read-1', JSON.stringify({ type: 'note', index: 1, unit: 0, text: 'x'.repeat(70_000) }));
    expect([r.status, r.body.error.code]).toEqual([413, 'E_SERVER']);
    expect((await post(info, 'read-1', ' '.repeat(65_537))).status).toBe(413);
    expect(log(s)).toEqual([]);
    // 60 KB of whitespace around a valid event is still fine
    expect((await post(info, 'read-1', ' '.repeat(60_000) + JSON.stringify({ type: 'play', index: 1, mode: 'read' }))).status).toBe(200);
  });

  it('answers invalid JSON with 400 E_USAGE', async () => {
    const s = seed();
    const { info } = await start(s);
    for (const text of ['{', '', 'nope', '[1', '{"type":']) {
      const r = await post(info, 'read-1', text);
      expect([r.status, r.body.error.code], text).toEqual([400, 'E_USAGE']);
    }
    expect(log(s)).toEqual([]);
  });

  it('refuses round from the page with 403 and the list of what it may send; refineFailed no longer exists (400)', async () => {
    const s = seed();
    const { info } = await start(s);
    const r = await post(info, 'read-1', addRound(s).event);
    expect([r.status, r.body.error.code]).toEqual([403, 'E_SERVER']);
    expect(r.body.error.message).toBe('the reading page may only send play, lineup, duel, note, peek, refine, ship and abandon');
    const gone = await post(info, 'read-1', { type: 'refineFailed', message: 'x' });
    expect([gone.status, gone.body.error.code]).toEqual([400, 'E_SCHEMA']);
    expect(log(s)).toEqual([]);
  });

  it('answers a malformed event with 400 E_SCHEMA and a short message that never echoes the token or paths', async () => {
    const s = seed();
    const { info } = await start(s);
    const bad = [
      {}, [], 'text', null, { type: 'nope' }, { type: 'play' }, { type: 'play', index: 0, mode: 'x' }, { type: 'play', index: 1, mode: 'x', extra: s.project },
      { type: 'duel', a: 1, b: 2, outcome: 'a', position: 'ab' }, { type: 'play', index: 1, mode: 'x', eventId: 'x'.repeat(101) },
      { type: 'lineup', kept: 'all', duds: [], order: [] }, { type: 'note', index: 1, unit: 0, text: '' },
    ];
    for (const e of bad) {
      const r = await post(info, 'read-1', JSON.stringify(e));
      expect([r.status, r.body.error.code], JSON.stringify(e)).toEqual([400, 'E_SCHEMA']);
      expect(r.body.error.message.length).toBeLessThanOrEqual(240);
      expect(r.text).not.toContain(s.project);
      expect(r.text).not.toContain('ffffffff');
    }
    expect(log(s)).toEqual([]);
  });
});

describe('POST /api/session/<id>/event: happy paths', () => {
  it('appends exactly one event per accepted event and answers {ok, state} with the page payload', async () => {
    const s = seed();
    const { info } = await start(s);
    const steps: Array<[object, string]> = [
      [{ type: 'play', index: 1, mode: 'read', eventId: 'p1' }, 'lineup'],
      [{ type: 'peek', index: 3, eventId: 'k1' }, 'lineup'],
      [{ type: 'note', index: 2, unit: 0, text: 'tighten this', eventId: 'n1' }, 'lineup'],
      [lineup(), 'duel'],
    ];
    let count = 0;
    for (const [event, stage] of steps) {
      const r = await post(info, 'read-1', event);
      expect(r.status, JSON.stringify(event)).toBe(200);
      expect(r.body.ok).toBe(true);
      expect(r.body.duplicate).toBeUndefined();
      expect(r.body.state.state.stage).toBe(stage);
      expect(r.body.state).toEqual((await http(info, '/api/session/read-1')).body);
      expect(logLines(s)).toHaveLength(++count);
    }
    expect(log(s).map(e => e.type)).toEqual(['play', 'peek', 'note', 'lineup']);
    expect(log(s).map(e => (e as any).eventId)).toEqual(['p1', 'k1', 'n1', 'l1']);
    expect(projectRows(s.project)).toEqual([]); // engagement and the lineup are not verdicts
    expect(globalRows()).toEqual([]);
    const abandon = await post(info, 'read-1', { type: 'abandon', eventId: 'a1' });
    expect([abandon.status, abandon.body.state.state.stage]).toEqual([200, 'abandoned']);
    expect(logLines(s)).toHaveLength(5);
  });

  it('records a duel through the CLI first: one verdict row, then the event', async () => {
    const s = seed();
    const { info } = await start(s);
    await post(info, 'read-1', lineup());
    const r = await post(info, 'read-1', duel(1, 3, 'b', 'd1', 'ba'));
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    const rows = projectRows(s.project);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'duel', eventId: 'd1', set: 'demo', weight: 1, shown: [1, 3], winner: { index: 3 }, loser: { index: 1 } });
    expect(globalRows()).toHaveLength(1);
    expect(log(s).filter(e => e.type === 'duel')).toHaveLength(1);
    expect(r.body.state.state.duels).toEqual([{ a: 1, b: 3, outcome: 'b' }]);
  });

  it('records tie and both-bad duels as their own kinds', async () => {
    const s = seed();
    const { info } = await start(s);
    await post(info, 'read-1', lineup());
    await post(info, 'read-1', duel(1, 2, 'tie', 't1'));
    await post(info, 'read-1', duel(2, 3, 'bothBad', 'b1'));
    expect(projectRows(s.project).map(r => r.kind)).toEqual(['tie', 'bothBad']);
  });

  it('answers a repeated duel (same eventId) with duplicate:true and does nothing else', async () => {
    const s = seed();
    const { info } = await start(s);
    await post(info, 'read-1', lineup());
    const first = await post(info, 'read-1', duel(1, 2, 'a', 'same'));
    const second = await post(info, 'read-1', duel(1, 2, 'a', 'same'));
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(first.body.duplicate).toBeUndefined();
    expect(second.body).toMatchObject({ ok: true, duplicate: true });
    expect(second.body.state).toEqual((await http(info, '/api/session/read-1')).body);
    expect(projectRows(s.project)).toHaveLength(1);
    expect(globalRows()).toHaveLength(1);
    expect(log(s).filter(e => e.type === 'duel')).toHaveLength(1);
  });

  it('keeps two simultaneous posts of one duel to one row and one event', async () => {
    const s = seed();
    const { info } = await start(s);
    await post(info, 'read-1', lineup());
    const [a, b] = await Promise.all([post(info, 'read-1', duel(1, 2, 'a', 'race')), post(info, 'read-1', duel(1, 2, 'a', 'race'))]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.duplicate, b.body.duplicate].filter(Boolean)).toHaveLength(1);
    expect(projectRows(s.project)).toHaveLength(1);
    expect(log(s).filter(e => e.type === 'duel')).toHaveLength(1);
  });

  it('answers a repeated non-judgement event with duplicate:true too', async () => {
    const s = seed();
    const { info } = await start(s);
    await post(info, 'read-1', { type: 'note', index: 1, unit: 0, text: 'a', eventId: 'n' });
    const again = await post(info, 'read-1', { type: 'note', index: 1, unit: 0, text: 'a', eventId: 'n' });
    expect(again.body).toMatchObject({ ok: true, duplicate: true });
    expect(log(s)).toHaveLength(1);
  });

  it('ships through `prose set pick` on the set: weighted rows, a hit reveal, then the reveal endpoint serves it', async () => {
    const s = seed();
    const { info } = await start(s);
    await post(info, 'read-1', lineup());
    expect((await http(info, '/api/session/read-1/reveal')).status).toBe(404);
    const r = await post(info, 'read-1', { type: 'ship', champion: 2, eventId: 's1' });
    expect(r.status).toBe(200);
    expect(r.body.state.state).toMatchObject({ stage: 'shipped', shipped: 2 });
    const rows = projectRows(s.project);
    expect(rows).toHaveLength(2);
    expect(rows.every(x => x.kind === 'pick' && x.weight === 0.5 && x.winner.index === 2)).toBe(true);
    expect(rows.map(x => x.loser.index).sort()).toEqual([1, 3]);
    expect(readSet(s.project, 'demo').picked).toBe(2);
    expect(log(s).at(-1)).toMatchObject({ type: 'ship', champion: 2, eventId: 's1' });
    const reveal = await http(info, '/api/session/read-1/reveal');
    expect(reveal.status).toBe(200);
    expect(reveal.body).toMatchObject({ picked: 2, setId: 'demo', matched: true, prediction: { pick: 2, shortlist: [3], why: 'SEALED-REASON', hit: true, shortlistHit: true, sealValid: true } });
  });

  it('reveals a miss when the owner shipped another variant', async () => {
    const s = seed();
    const { info } = await start(s);
    await post(info, 'read-1', lineup());
    await post(info, 'read-1', { type: 'ship', champion: 3 });
    const reveal = (await http(info, '/api/session/read-1/reveal')).body;
    expect(reveal).toMatchObject({ picked: 3, matched: false, prediction: { pick: 2, hit: false, shortlistHit: true } });
  });

  it('says so in the reveal when no prediction was sealed', async () => {
    const s = seed({ predict: false });
    const { info } = await start(s);
    await post(info, 'read-1', lineup());
    const r = await post(info, 'read-1', { type: 'ship', champion: 2 });
    expect(r.status).toBe(200);
    expect(projectRows(s.project)).toHaveLength(2);
    const reveal = (await http(info, '/api/session/read-1/reveal')).body;
    expect(reveal).toMatchObject({ picked: 2, matched: false, prediction: null });
    expect(reveal.note).toMatch(/no prediction/i);
  });

  it('moves to waiting on a refine and holds there until a round arrives', async () => {
    const s = seed();
    const { info } = await start(s);
    await toRefine(info);
    const r = await post(info, 'read-1', { type: 'refine', champion: 2, directions: ['warmer', 'shorter'], like: 3, eventId: 'rf' });
    expect(r.status).toBe(200);
    expect(r.body.state.state).toMatchObject({ stage: 'waiting', pendingRefine: { champion: 2, directions: ['warmer', 'shorter'], like: 3 } });
    expect((await http(info, '/api/session/read-1')).body.state.stage).toBe('waiting');
    expect(projectRows(s.project)).toHaveLength(3); // the three duels only
    // nothing the page can send moves a waiting session
    expect((await post(info, 'read-1', lineup({ eventId: 'x' }))).status).toBe(409);
    expect((await post(info, 'read-1', { type: 'ship', champion: 2, eventId: 'x2' })).status).toBe(409);
    appendEvent(s.project, 'read-1', addRound(s).event);
    expect((await http(info, '/api/session/read-1')).body.state).toMatchObject({ stage: 'lineup', round: 1 });
  });
});

describe('POST /api/session/<id>/event: refusals append nothing', () => {
  it('returns the CLI message as 409 and appends nothing when a variant changed after sealing', async () => {
    const s = seed();
    const { info } = await start(s);
    await post(info, 'read-1', lineup());
    const before = logLines(s);
    writeFileSync(variantFile(s, 2), readFileSync(variantFile(s, 2), 'utf8') + 'Sneaky edit.\n');
    const r = await post(info, 'read-1', duel(1, 2, 'a', 'bad'));
    expect([r.status, r.body.error.code]).toEqual([409, 'E_CONFLICT']);
    expect(r.body.error.message).toContain('variant 2 changed after the prediction was sealed');
    expect(Object.keys(r.body.error).sort()).toEqual(['code', 'hint', 'message']);
    expect(r.text).not.toContain(s.project);
    expect(logLines(s)).toEqual(before);
    expect(projectRows(s.project)).toEqual([]);
    const ship = await post(info, 'read-1', { type: 'ship', champion: 1 });
    expect(ship.status).toBe(409);
    expect(logLines(s)).toEqual(before);
    expect(readSet(s.project, 'demo').picked).toBeUndefined();
  });

  it('answers transition violations with 409 and a hint', async () => {
    const s = seed();
    const { info } = await start(s);
    for (const e of [duel(1, 2, 'a', 'x'), { type: 'ship', champion: 1 }, { type: 'refine', champion: 1, directions: [], like: null }]) {
      const r = await post(info, 'read-1', e);
      expect([r.status, r.body.error.code], JSON.stringify(e)).toEqual([409, 'E_CONFLICT']);
      expect(r.body.error.hint).toBeTruthy();
    }
    await post(info, 'read-1', lineup({ kept: [1, 2], duds: [3] }));
    expect((await post(info, 'read-1', duel(1, 3, 'a', 'y'))).status).toBe(409); // 3 is a dud
    expect((await post(info, 'read-1', lineup({ eventId: 'again' }))).status).toBe(409); // once per round
    await post(info, 'read-1', duel(1, 2, 'a', 'z'));
    expect((await post(info, 'read-1', duel(2, 1, 'b', 'z2'))).status).toBe(409); // already compared
    expect(projectRows(s.project)).toHaveLength(1);
    expect(log(s).map(e => e.type)).toEqual(['lineup', 'duel']);
  });

  it('rejects every event after ship or abandon with 409', async () => {
    const s = seed();
    const { info } = await start(s);
    await post(info, 'read-1', lineup());
    await post(info, 'read-1', { type: 'ship', champion: 2, eventId: 'ship' });
    const n = logLines(s).length;
    for (const e of [{ type: 'play', index: 1, mode: 'x' }, { type: 'abandon' }, { type: 'ship', champion: 1 }, duel(1, 3, 'a', 'late'), { type: 'note', index: 1, unit: 0, text: 'x' }]) {
      const r = await post(info, 'read-1', e);
      expect([r.status, r.body.error.code], JSON.stringify(e)).toEqual([409, 'E_CONFLICT']);
    }
    expect(logLines(s)).toHaveLength(n);
    // the same ship retried by the page is a duplicate, not an error
    expect((await post(info, 'read-1', { type: 'ship', champion: 2, eventId: 'ship' })).body).toMatchObject({ ok: true, duplicate: true });
    expect(projectRows(s.project)).toHaveLength(2);
  });

  it('rejects a note on a unit or variant that does not exist', async () => {
    const s = seed();
    const { info } = await start(s);
    const units = (await http(info, '/api/session/read-1')).body.candidates.find((c: any) => c.index === 2).units.length;
    expect((await post(info, 'read-1', { type: 'note', index: 2, unit: units - 1, text: 'ok' })).status).toBe(200);
    for (const unit of [units, units + 5, 999]) {
      const r = await post(info, 'read-1', { type: 'note', index: 2, unit, text: 'too far' });
      expect([r.status, r.body.error.code], String(unit)).toEqual([400, 'E_SCHEMA']);
    }
    expect((await post(info, 'read-1', { type: 'note', index: 9, unit: 0, text: 'x' })).status).toBe(400);
    expect(log(s)).toHaveLength(1);
  });

  it('refuses a note on a variant that changed after sealing (its text is not shown)', async () => {
    const s = seed();
    const { info } = await start(s);
    writeFileSync(variantFile(s, 3), readFileSync(variantFile(s, 3), 'utf8') + 'More.\n');
    expect((await post(info, 'read-1', { type: 'note', index: 3, unit: 0, text: 'x' })).status).toBe(409);
    expect(log(s)).toEqual([]);
  });
});

describe('rounds: later sets, frozen hashes, and the champion\'s own set', () => {
  it('requires a hash on a new round event, keeps an older one without it readable, and takes an optional set variant', () => {
    const s = seed();
    const { event } = addRound(s);
    expect(EventSchema.safeParse(event).success).toBe(true);
    expect(EventSchema.safeParse({ ...event, candidates: [{ ...event.candidates[0], hash: undefined }] }).success).toBe(false);
    expect(EventSchema.safeParse({ ...event, candidates: [{ ...event.candidates[0], hash: 'abc' }] }).success).toBe(false);
    // an event written before hashes existed is still read (not skipped)
    const old = { ...event, candidates: event.candidates.map(({ hash: _h, ...c }) => c), at: '2026-10-03T00:00:00.000Z', seq: 1 };
    writeFileSync(join(sessionDir(s.project, 'read-1'), 'events.jsonl'), JSON.stringify(old) + '\n');
    const read = readEventsDetailed(s.project, 'read-1');
    expect(read.skipped).toBe(0);
    expect(read.events).toHaveLength(1);
  });

  it('freezes a round-1 candidate by the hash in its round event: changed after the round marks it changed', async () => {
    const s = seed();
    const { info } = await start(s);
    const r = await toRound1(s, info);
    let body = (await http(info, '/api/session/read-1')).body;
    const c = (i: number) => body.candidates.find((x: any) => x.index === i);
    for (const i of [4, 5, 6]) expect(c(i), String(i)).toMatchObject({ changed: false, hashOk: true });
    expect(c(5).units.join(' ')).toContain('friends');
    expect(c(2)).toMatchObject({ changed: false, hashOk: true }); // the pinned champion, round 0 hash
    writeFileSync(variantPath(s.project, r.next, r.next.variants[1]), readFileSync(variantPath(s.project, r.next, r.next.variants[1]), 'utf8') + 'Edited.\n');
    body = (await http(info, '/api/session/read-1')).body;
    expect(c(5)).toMatchObject({ changed: true, hashOk: false });
    expect('units' in c(5)).toBe(false);
    expect(c(4)).toMatchObject({ changed: false, hashOk: true });
  });

  it('judges a round-1 candidate by the hash in its round event, not by anything else', async () => {
    const s = seed();
    const { info } = await start(s);
    await toRefine(info);
    await post(info, 'read-1', { type: 'refine', champion: 2, directions: [], like: null });
    const { event } = addRound(s);
    // an event whose hash does not match the file marks the variant changed
    appendEvent(s.project, 'read-1', { ...event, candidates: event.candidates.map((c, k) => (k === 0 ? { ...c, hash: '0'.repeat(64) } : c)) });
    const body = (await http(info, '/api/session/read-1')).body;
    expect(body.candidates.find((x: any) => x.index === 4)).toMatchObject({ changed: true, hashOk: false });
    expect(body.candidates.find((x: any) => x.index === 5)).toMatchObject({ changed: false, hashOk: true });
  });

  it('records a round-1 duel against the later set, using the candidates\' own variant numbers', async () => {
    const s = seed();
    const { info } = await start(s);
    await toRound1(s, info);
    const before = projectRows(s.project).length; // three round-0 duels
    const r = await post(info, 'read-1', duel(5, 6, 'a', 'r1d'));
    expect(r.status).toBe(200);
    const rows = projectRows(s.project);
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({ kind: 'duel', set: 'next', eventId: 'r1d', shown: [2, 3], winner: { index: 2 }, loser: { index: 3 } });
  });

  it('records a duel between the pinned champion and a new variant (two sets) as a cross-set row in the later set', async () => {
    const s = seed();
    const { info } = await start(s);
    await toRound1(s, info);
    const before = projectRows(s.project).length;
    const r = await post(info, 'read-1', duel(2, 5, 'b', 'cross'));
    expect(r.status).toBe(200);
    expect(r.body.recorded).toBeUndefined();
    expect(r.body.note).toBeUndefined();
    const rows = projectRows(s.project);
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({
      kind: 'duel', set: 'next', setUid: readSet(s.project, 'next').uid, eventId: 'cross', shown: [2, 2], n: 2, weight: 1,
      winner: { index: 2 }, loser: { index: 2, set: 'demo', setUid: s.set.uid },
    });
    expect(rows.at(-1)!.winner.set).toBeUndefined();
    expect(globalRows()).toHaveLength(before + 1);
    expect(r.body.state.state.duels).toContainEqual({ a: 2, b: 5, outcome: 'b' });
    expect(log(s).filter(e => e.type === 'duel')).toHaveLength(4);
    // a retry is a duplicate: no second row
    expect((await post(info, 'read-1', duel(2, 5, 'b', 'cross'))).body.duplicate).toBe(true);
    expect(projectRows(s.project)).toHaveLength(before + 1);
    // stats count it as a decisive duel (every row so far is one)
    expect(rows.every(x => x.kind === 'duel')).toBe(true);
    const stats = await runProse(['taste', 'stats', '--dir', s.project], { cwd: s.project }) as any;
    expect(stats.duels.project.decisive).toBe(rows.length);
  });

  it('a failing cross-set write returns the CLI error and appends no event', async () => {
    const s = seed();
    const { info } = await start(s);
    await toRound1(s, info);
    const events = log(s).length;
    writeFileSync(variantFile(s, 2), readFileSync(variantFile(s, 2), 'utf8') + '\nAn extra sentence nobody sealed.\n'); // the champion changed after sealing
    const r = await post(info, 'read-1', duel(2, 5, 'a', 'bad-cross'));
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/Set demo: variant 2 changed after the prediction was sealed/);
    expect(log(s)).toHaveLength(events);
  });

  it('ships a round-1 champion on its own set (no prediction there), and the reveal says so', async () => {
    const s = seed();
    const { info } = await start(s);
    await toRound1(s, info);
    await post(info, 'read-1', duel(5, 6, 'a', 'x1'));
    await post(info, 'read-1', duel(2, 5, 'b', 'x2'));
    const done = await post(info, 'read-1', duel(2, 6, 'a', 'x3'));
    expect(done.body.state.state.stage).toBe('refine');
    const r = await post(info, 'read-1', { type: 'ship', champion: 5, eventId: 'sh' });
    expect(r.status).toBe(200);
    expect(readSet(s.project, 'next').picked).toBe(2); // session variant 5 is variant 2 of set `next`
    expect(readSet(s.project, 'demo').picked).toBeUndefined();
    const picks = projectRows(s.project).filter(x => x.kind === 'pick');
    expect(picks).toHaveLength(2);
    expect(picks.every(x => x.set === 'next' && x.winner.index === 2)).toBe(true);
    const reveal = (await http(info, '/api/session/read-1/reveal')).body;
    expect(reveal).toMatchObject({ picked: 5, setId: 'next', variant: 2, matched: false, prediction: null });
    expect(reveal.note).toMatch(/no prediction/i);
  });

  it('ships the pinned round-0 champion on the round-0 set, where its sealed prediction is revealed', async () => {
    const s = seed();
    const { info } = await start(s);
    await toRound1(s, info);
    const r = await post(info, 'read-1', { type: 'ship', champion: 2 });
    expect(r.status).toBe(200);
    expect(readSet(s.project, 'demo').picked).toBe(2);
    expect(readSet(s.project, 'next').picked).toBeUndefined();
    expect((await http(info, '/api/session/read-1/reveal')).body).toMatchObject({ picked: 2, setId: 'demo', matched: true, prediction: { why: 'SEALED-REASON', hit: true } });
  });

  it('does not let a round-1 lineup ship before it has a champion, or ship a dud', async () => {
    const s = seed();
    const { info } = await start(s);
    await toRefine(info);
    await post(info, 'read-1', { type: 'refine', champion: 2, directions: [], like: null });
    appendEvent(s.project, 'read-1', addRound(s).event);
    expect((await post(info, 'read-1', { type: 'ship', champion: 2 })).status).toBe(409); // lineup stage
    await post(info, 'read-1', { type: 'lineup', kept: [5], duds: [4, 6], order: [] });
    expect((await post(info, 'read-1', { type: 'ship', champion: 4 })).status).toBe(409);
  });
});

describe('sealed prediction: no response before ship contains it', () => {
  const GETS = ['/', '/s/read-1', '/app.js', '/style.css', '/api/health', '/api/sessions', '/api/session/read-1', '/api/session/read-1/reveal', '/api/session/nope', '/api/session/nope/reveal', '/api/nothing'];

  it('after every event type in a full flow, every route is free of the reasoning, and the reveal appears only after ship', async () => {
    const s = seed();
    const { info } = await start(s);
    const sweep = async (when: string, shipped = false) => {
      for (const path of GETS) {
        const r = await http(info, path);
        if (shipped && path === '/api/session/read-1/reveal') { expect(r.status).toBe(200); continue; } // the one place it belongs, after the ship
        expect(r.text, `${when} ${path}`).not.toContain('SEALED-REASON');
        if (path.startsWith('/api/') && path !== '/api/health') {
          expect(r.text, `${when} ${path}`).not.toMatch(/"(why|prediction|seal|shortlistHit)"/);
          if (path === '/api/session/read-1/reveal') expect(r.status, when).toBe(shipped ? 200 : 404);
        }
      }
    };
    const send = async (event: unknown, expected = 200) => {
      const r = await post(info, 'read-1', event);
      expect(r.status, JSON.stringify(event)).toBe(expected);
      expect(r.text, JSON.stringify(event)).not.toContain('SEALED-REASON');
      expect(r.text).not.toMatch(/"(why|prediction|seal|shortlistHit)"/);
      return r;
    };
    await sweep('start');
    for (const [name, event, code] of [
      ['play', { type: 'play', index: 2, mode: 'read' }, 200], ['peek', { type: 'peek', index: 2 }, 200],
      ['note', { type: 'note', index: 2, unit: 0, text: 'nice' }, 200], ['early duel', duel(1, 2, 'a', 'early'), 409],
      ['early ship', { type: 'ship', champion: 2 }, 409], ['page round', { type: 'round', n: 1, setId: 'x', candidates: [] }, 403],
      ['lineup', lineup(), 200], ['duel', duel(2, 3, 'a', 'f1'), 200], ['duplicate', duel(2, 3, 'a', 'f1'), 200],
    ] as Array<[string, object, number]>) {
      await send(event, code);
      await sweep(name);
    }
    writeFileSync(variantFile(s, 1), 'edited after sealing\n');
    await send(duel(1, 2, 'a', 'f2'), 409); // a failing CLI write names the problem, not the prediction
    await sweep('failed duel');
    await send({ type: 'ship', champion: 2 }, 409); // variant 1 is edited, so the pick is refused too
    await sweep('failed ship');
    writeFileSync(variantFile(s, 1), SHORT.replace('We built', 'We raised'));
    await send({ type: 'ship', champion: 2 });
    await sweep('ship', true);
    const reveal = await http(info, '/api/session/read-1/reveal');
    expect(reveal.text).toContain('SEALED-REASON');
  });

  it('keeps the prediction out of a refine and a round-1 payload as well', async () => {
    const s = seed();
    const { info } = await start(s);
    await toRefine(info);
    await post(info, 'read-1', { type: 'refine', champion: 2, directions: ['warmer'], like: null });
    for (const path of GETS) expect((await http(info, path)).text, path).not.toContain('SEALED-REASON');
    appendEvent(s.project, 'read-1', addRound(s).event);
    for (const path of GETS) expect((await http(info, path)).text, path).not.toContain('SEALED-REASON');
  });
});

describe('the runner', () => {
  it('maps the CLI\'s JSON error codes to ProseError codes the handler turns into statuses', async () => {
    const s = seed();
    const run = (...args: string[]) => runProse(args, { cwd: s.project }).then(() => null, (e: ProseError) => e);
    expect(await run('set', 'pick', 'missing-set', '--pick', '1', '--dir', s.project)).toMatchObject({ code: 'E_NOT_FOUND' });
    expect(await run('set', 'duel', 'demo', '--a', '1', '--b', '1', '--outcome', 'a', '--dir', s.project)).toMatchObject({ code: 'E_USAGE' });
    expect(await run('set', 'pick', 'demo', '--pick', 'x', '--dir', s.project)).toMatchObject({ code: 'E_USAGE' });
    expect(await run('definitely-not-a-command')).toMatchObject({ code: 'E_USAGE' });
    const ok = await runProse(['set', 'duel', 'demo', '--a', '1', '--b', '2', '--outcome', 'a', '--event-id', 'direct', '--dir', s.project], { cwd: s.project });
    expect(ok).toMatchObject({ set: 'demo', appended: 1 });
  });

  it('turns a timeout into E_SERVER', async () => {
    const s = seed();
    const slow = await runProse(['set', 'list', '--dir', s.project], { cwd: s.project, timeoutMs: 1 }).then(() => null, (e: ProseError) => e);
    expect(slow).toMatchObject({ code: 'E_SERVER' });
  });

  it('is replaceable on the server, and its errors reach the page as code, message and hint with paths scrubbed', async () => {
    const s = seed();
    const calls: string[][] = [];
    const { info } = await startServer(servers, {
      projects: [s.project],
      runProse: async (args: string[]) => { calls.push(args); throw new ProseError('E_NOT_FOUND', `gone from ${s.project}`, { hint: `look in ${s.project}` }); },
    });
    await post(info, 'read-1', lineup());
    const r = await post(info, 'read-1', duel(1, 2, 'a', 'stub'));
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: { code: 'E_NOT_FOUND', message: 'gone from <path>', hint: 'look in <path>' } });
    expect(calls[0].slice(0, 3)).toEqual(['set', 'duel', 'demo']);
    expect(calls[0]).toEqual(expect.arrayContaining(['--a', '1', '--b', '2', '--outcome', 'a', '--position', 'ab', '--event-id=stub', '--dir', s.project]));
    expect(log(s).map(e => e.type)).toEqual(['lineup']);
  });

  it('maps E_PREDICTION_REQUIRED to 409 and any other failure to 500 E_SERVER', async () => {
    const s = seed();
    let err: Error = new ProseError('E_PREDICTION_REQUIRED', 'seal first', { hint: 'prose predict' });
    const { info } = await startServer(servers, { projects: [s.project], runProse: async () => { throw err; } });
    await post(info, 'read-1', lineup());
    expect((await post(info, 'read-1', duel(1, 2, 'a', 'p1'))).status).toBe(409);
    err = new ProseError('E_SERVER', 'the CLI did not finish');
    expect((await post(info, 'read-1', duel(1, 2, 'a', 'p2'))).status).toBe(500);
    err = new Error('boom');
    const r = await post(info, 'read-1', duel(1, 2, 'a', 'p3'));
    expect([r.status, r.body.error.code]).toEqual([500, 'E_SERVER']);
    expect(r.text).not.toContain('boom');
  });
});
