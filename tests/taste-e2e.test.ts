/**
 * End to end on a SYNTHETIC OWNER. This validates the plumbing and the learning loop (set new, predict, set pick, the
 * verdict and prediction logs, the fitted model, taste show and taste stats). It does NOT validate human taste: the owner
 * here is a rule ("the shortest mean sentence length wins"), and the "agent" is a seeded random
 * pick standing in for an agent with no information about that owner. A second baseline, an agent that always predicts variant 1,
 * is computed from the same picks.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { variantPath, readSet } from '../src/owner/sets.ts';
import { run } from './helpers.ts';
import { BASE, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
useTempHome();

/** A small seeded generator (mulberry32), so the run is the same every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['bridge', 'river', 'rain', 'we', 'built', 'the', 'town', 'long', 'year', 'dark', 'people', 'crossed', 'every', 'morning', 'water', 'stone', 'cold', 'doubted', 'finally', 'remembers', 'carried', 'thousand', 'a', 'and', 'in', 'of', 'through', 'nobody', 'believed', 'walk', 'after', 'flood', 'steady', 'quietly', 'engineers', 'patience'];
const CONTRACTIONS = ["didn't", "it's", "we're", "couldn't", "that's", "they'd"];
const LENGTHS = [4, 6, 9, 13, 18];

interface Variant { text: string; meanSentence: number }

/** One variant of 40 to 80 words with sentences of exactly `len` words and `contractions` contractions. */
function variant(rnd: () => number, len: number, contractions: number): Variant {
  // Contractions are drawn at random as noise: the owner ignores them (the three sentence lengths of a set are always distinct).
  const ks: number[] = [];
  for (let k = 1; k <= 20; k++) if (len * k >= 40 && len * k <= 80) ks.push(k);
  const sentences = ks[Math.floor(rnd() * ks.length)];
  const total = len * sentences;
  const words = Array.from({ length: total }, () => WORDS[Math.floor(rnd() * WORDS.length)]);
  const slots = new Set<number>();
  while (slots.size < contractions) slots.add(1 + Math.floor(rnd() * (total - 1)));
  let c = 0;
  for (const s of slots) words[s] = CONTRACTIONS[c++ % CONTRACTIONS.length];
  const out: string[] = [];
  for (let s = 0; s < sentences; s++) {
    const w = words.slice(s * len, (s + 1) * len);
    w[0] = w[0][0].toUpperCase() + w[0].slice(1);
    out.push(w.join(' ') + '.');
  }
  return { text: `---\nform: speech-small\n---\n\n${out.join(' ')}\n`, meanSentence: len };
}

/** Three variants of different style: three distinct sentence lengths, contraction counts drawn at random. */
function generateSet(rnd: () => number): Variant[] {
  const lens = [...LENGTHS].sort(() => rnd() - 0.5).slice(0, 3);
  return lens.map(len => variant(rnd, len, Math.floor(rnd() * 5)));
}

/** The synthetic owner: the shortest mean sentence length (the lengths of a set are distinct, so there is no tie). Returns the 1-based index. */
function ownerPick(vs: Variant[]): number {
  return vs.reduce((best, v, i) => (v.meanSentence < vs[best].meanSentence ? i : best), 0) + 1;
}

describe('taste model end to end on a synthetic owner', () => {
  it('learns a known preference through the real commands and reports both predictors', async () => {
    const { project, write } = tmpProject();
    const base = write('talk.md', BASE);
    const rnd = seeded(20261003);
    const SESSIONS = 30;
    const modelHit: (boolean | null)[] = []; // null: the model abstained
    const agentHit: boolean[] = [];
    const alwaysOne: boolean[] = []; // the stronger baseline: an agent that always predicts variant 1

    for (let i = 1; i <= SESSIONS; i++) {
      const id = `s${i}`;
      const vs = generateSet(rnd);
      run('set', 'new', base, '--directions', 'shorter,plainer,punchier', '--count', '3', '--id', id);
      const set = readSet(project, id);
      vs.forEach((v, k) => writeFileSync(variantPath(project, set, set.variants[k]), v.text));
      const agentPick = 1 + Math.floor(rnd() * 3); // an agent with no taste information: a random guess
      const predicted = await run('predict', '--set', id, '--pick', String(agentPick), '--why', 'random stand-in', '--dir', project);
      expect(predicted, `session ${i}`).toBeTruthy();
      const picked = ownerPick(vs);
      const revealed = await run('set', 'pick', id, '--pick', String(picked), '--dir', project);
      expect(revealed.reveal.agent.hit, `session ${i}`).toBe(picked === agentPick);
      agentHit.push(revealed.reveal.agent.hit);
      alwaysOne.push(picked === 1);
      modelHit.push(revealed.reveal.model.abstained ? null : revealed.reveal.model.hit);
    }
    const stats = await run('taste', 'stats', '--dir', project);
    const show = await run('taste', 'show', '--dir', project);

    // Early sessions: no pairs, then fewer than the 15 a layer needs, so the model abstains rather than guessing.
    expect(modelHit[0]).toBeNull();
    expect(modelHit.slice(0, 5).every(h => h === null)).toBe(true);
    // Late sessions: 10 of the last 10 in the seeded run. Chance for three variants is 1/3, and 8 or more of 10 by chance is
    // about 0.3% (binomial), so 8 is a bar a no-information guesser all but never clears and this run clears with room.
    const last = modelHit.slice(-10);
    expect(last.every(h => h !== null)).toBe(true);
    expect(last.filter(h => h).length).toBeGreaterThanOrEqual(8);
    // The agent stand-in guesses at random: its overall rate stays near 1/3 (14 of 30 in the seeded run), below the model's late rate.
    const agentRate = agentHit.filter(Boolean).length / SESSIONS;
    expect(agentRate).toBeLessThan(0.6);
    expect(last.filter(h => h).length / 10).toBeGreaterThan(agentRate);
    // And above the always-variant-1 baseline, over the whole run and over the same last ten sessions.
    expect(last.filter(h => h).length / 10).toBeGreaterThan(alwaysOne.filter(Boolean).length / SESSIONS);
    expect(last.filter(h => h).length).toBeGreaterThan(alwaysOne.slice(-10).filter(Boolean).length);

    // taste show names the preference, with the right words and as strong.
    expect(show.enough).toBe(true);
    expect(show.preferences[0]).toMatchObject({ feature: 'sentence', words: 'shorter sentences', confidence: 'strong' });
    expect(show.preferences[0].weight).toBeLessThan(0);
    expect(show.markdown).toContain('**shorter sentences**');

    // taste stats reports both predictors; the model's abstentions are counted; the comparison covers the sessions both predicted.
    const abstained = modelHit.filter(h => h === null).length;
    expect(stats.sessions).toBe(SESSIONS);
    expect(stats.agent).toMatchObject({ predicted: SESSIONS, hits: agentHit.filter(Boolean).length, voided: 0 });
    expect(stats.model).toMatchObject({ abstained, predicted: SESSIONS - abstained, hits: modelHit.filter(h => h).length, voided: 0 });
    expect(abstained).toBeGreaterThanOrEqual(5);
    expect(stats.model.recent.rate).toBe(last.filter(h => h).length / 10);
    expect(stats.comparison.both).toBe(stats.model.predicted);
    expect(stats.comparison.modelBetter + stats.comparison.same + stats.comparison.agentBetter).toBe(stats.comparison.both);
    expect(stats.comparison.modelBetter).toBeGreaterThan(stats.comparison.agentBetter);
  });
});
