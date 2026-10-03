import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { DIRECTIONS, KNOWN_DIRECTIONS, MOVE_MIN, WEIRD_MIN, assertDirections, directionScore, moveMin } from '../src/owner/directions.ts';
import { featureVector } from '../src/owner/features.ts';
import { ProseError } from '../src/errors.ts';
import { BASE, PUNCHY, SHORT, WARM, tmp, useTmp } from './owner-helpers.ts';

useTmp();
const vec = (text: string) => { const f = join(tmp(), 'd.md'); writeFileSync(f, text); return featureVector(loadDocument(f)); };

describe('directions', () => {
  it('names the directions writers ask for', () => {
    expect(KNOWN_DIRECTIONS).toEqual(expect.arrayContaining(['punchier', 'warmer', 'drier', 'shorter', 'longer', 'plainer', 'more-formal', 'less-formal', 'weirder']));
    for (const d of Object.keys(DIRECTIONS)) expect(Object.keys(DIRECTIONS[d]).length).toBeGreaterThan(0);
  });

  it('validates a list and names the known ones when one is wrong', () => {
    expect(assertDirections(['warmer', 'drier'])).toEqual(['warmer', 'drier']);
    expect(() => assertDirections(['spicier'])).toThrow(ProseError);
    expect(() => assertDirections(['spicier'])).toThrow(expect.objectContaining({ hint: expect.stringMatching(/warmer/) }));
  });

  it('scores movement from the base: shorter and warmer rewrites move as claimed', () => {
    const base = vec(BASE);
    expect(directionScore(base, vec(SHORT), 'shorter')).toBeGreaterThan(MOVE_MIN);
    expect(directionScore(base, vec(SHORT), 'longer')).toBeLessThan(0);
    expect(directionScore(base, vec(WARM), 'warmer')).toBeGreaterThan(MOVE_MIN);
    expect(directionScore(base, vec(PUNCHY), 'punchier')).toBeGreaterThan(MOVE_MIN);
  });

  it('scores "weirder" as distance from the base, and an unchanged draft as zero', () => {
    const base = vec(BASE);
    expect(directionScore(base, base, 'weirder')).toBe(0);
    expect(directionScore(base, vec(PUNCHY), 'weirder')).toBeGreaterThan(MOVE_MIN);
    expect(directionScore(base, base, 'warmer')).toBe(0);
  });
});

describe('weirder and the stricter threshold', () => {
  const para = 'We built the bridge in the rain, in the dark, and in the long months when nobody believed us. It took four years, two floods, and more coffee than the town had ever seen. Today it carries a thousand people a day.';

  it('uses a stricter move threshold for weirder', () => {
    expect(WEIRD_MIN).toBe(1);
    expect(moveMin('weirder')).toBe(WEIRD_MIN);
    expect(moveMin('warmer')).toBe(MOVE_MIN);
  });
  it('does not count a one-word swap as weirder', () => {
    expect(directionScore(vec(para), vec(para.replace('bridge', 'span')), 'weirder')).toBeLessThan(WEIRD_MIN);
  });
  it('does not count shortening alone as weirder', () => {
    const short = 'We built the bridge in the rain and in the long months when nobody believed us. It took four years, two floods, and more coffee than the town had seen. Today it carries a thousand people.';
    expect(directionScore(vec(para), vec(short), 'weirder')).toBeLessThan(WEIRD_MIN);
  });
  it('counts a rewrite that changes word choice and rhythm at the same length', () => {
    const rewrite = "Nobody trusted us, not for a single day. We built it anyway - rain, dark, months of doubt! Four years, two floods, endless coffee: that's what it cost us. Now a thousand people cross it daily, and they don't even know.";
    expect(Math.abs(Math.log2(rewrite.split(/\s+/).length) - Math.log2(para.split(/\s+/).length))).toBeLessThan(0.1);
    expect(directionScore(vec(para), vec(rewrite), 'weirder')).toBeGreaterThanOrEqual(WEIRD_MIN);
  });
  it('less-formal also scores second person, mirroring more-formal', () => {
    expect(DIRECTIONS['less-formal'].secondPerson).toBe(0.3);
    expect(DIRECTIONS['more-formal'].secondPerson).toBe(-0.3);
  });
});

