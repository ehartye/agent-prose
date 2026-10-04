// @ts-nocheck
// Shared helpers for the audit data-collection scripts: a seeded generator, a polite fetch with retries, and path defaults.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const USER_AGENT = 'agent-prose-measurement/1.0 (research sample)';

/** mulberry32: a small seeded generator, so a run with the same seed makes the same choices on every machine. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** An integer in [lo, hi]. */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    /** Fisher-Yates, in place. */
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    },
  };
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The default output directory: outside the repository, under the OS temp dir. */
export const defaultOut = name => join(tmpdir(), name);

/**
 * A polite GET: at least `minGapMs` between requests, up to `tries` attempts, honouring Retry-After on 503 and 429
 * (a fallback wait when the response carries none). Resolves to the body text or parsed JSON, or null once the
 * attempts run out.
 */
export function politeGetter({ minGapMs, tries = 4, fallback503Ms = 30000, fallback429Ms = 120000, log = console.error }) {
  let last = 0;
  return async function get(url, asJson = false) {
    for (let fails = 0; fails < tries;) {
      const wait = minGapMs - (Date.now() - last);
      if (wait > 0) await sleep(wait);
      last = Date.now();
      try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(120000) });
        if (res.ok) return asJson ? await res.json() : await res.text();
        fails++;
        const retryAfter = Number(res.headers.get('Retry-After'));
        if (res.status === 503) await sleep(retryAfter > 0 ? retryAfter * 1000 : fallback503Ms);
        else if (res.status === 429) await sleep(retryAfter > 0 ? retryAfter * 1000 : fallback429Ms);
        else log(`HTTP ${res.status}`);
      } catch (e) {
        fails++;
        log(`error: ${e instanceof Error ? e.message : e}`);
        await sleep(10000);
      }
    }
    return null;
  };
}
