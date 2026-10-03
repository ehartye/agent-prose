import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const DIR = join(import.meta.dirname, '..', 'runtime', 'reading');
const files = readdirSync(DIR);
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');
const html = read('index.html');
const js = read('app.js');

describe('the reading page: static safety', () => {
  it('has the three page files', () => {
    expect([...files].sort()).toEqual(['app.js', 'index.html', 'style.css']);
  });

  it('uses none of the banned APIs', () => {
    const banned: Array<[string, RegExp]> = [
      ['innerHTML', /innerHTML/], ['outerHTML', /outerHTML/], ['insertAdjacentHTML', /insertAdjacentHTML/],
      ['document.write', /document\s*\.\s*write/], ['eval(', /\beval\s*\(/], ['new Function', /new\s+Function\b/],
      ['string timer', /set(Timeout|Interval)\s*\(\s*['"`]/], ['javascript: URL', /javascript:/i],
      ['inline handler', /[\s"'<]on[a-z]+\s*=/i], ['setAttribute style', /setAttribute\s*\(\s*['"]style['"]/],
      ['third-party URL', /(https?:)?\/\/[a-z0-9-]+\.[a-z]{2,}/i], ['dynamic import', /importScripts|\bimport\s*\(/],
    ];
    for (const f of files) for (const [name, re] of banned) expect(re.test(read(f)), `${f}: ${name}`).toBe(false);
  });

  it('only fetches relative /api paths', () => {
    expect(js.match(/\bfetch\s*\(/g) ?? []).toHaveLength(1);
    expect(js).toContain('fetch(path, init)');
    const paths = [...js.matchAll(/'([^']*api[/][^']*)'/g)].map(m => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.startsWith('/api/'), p).toBe(true);
    expect(js).toContain('x-prose-token');
    expect(js).toContain('replaceState');
  });

  it('puts draft and note text in only through text nodes', () => {
    expect(js).toContain('textContent');
    expect(js).toContain('createTextNode');
    expect(js).not.toMatch(/\.innerText\s*=/);
  });
});

describe('index.html', () => {
  it('references only files that exist, and nothing external', () => {
    const refs = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map(m => m[1]);
    expect([...refs].sort()).toEqual(['/app.js', '/style.css']);
    for (const r of refs) expect(existsSync(join(DIR, r.slice(1))), r).toBe(true);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('has no inline script, style element, style attribute or handler', () => {
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
    expect(html).not.toMatch(/<script[^>]*>(?!\s*<\/script>)/i);
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('stays within the server CSP', () => {
    const server = readFileSync(join(import.meta.dirname, '..', 'src', 'reading', 'server.ts'), 'utf8');
    expect(server).toContain(`const CSP = "default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";`);
    // a grid column must be allowed to shrink below its content, or one unbroken word widens the whole phone page
    expect(read('style.css')).toMatch(/\.duel-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(read('style.css')).toMatch(/\.reading \{[^}]*overflow-wrap: anywhere/);
    expect(read('style.css')).not.toMatch(/@import|url\(\s*['"]?https?:|@font-face/);
  });
});

describe('phone ergonomics (static: the real browser pass is in docs/research/reading-page-verification.md)', () => {
  const css = read('style.css');
  /** Every `@media <query> { ... }` block in the stylesheet, joined. */
  const media = (query: string): string => {
    const out: string[] = [];
    for (let start = css.indexOf(`@media ${query} {`); start >= 0; start = css.indexOf(`@media ${query} {`, start + 1)) {
      let depth = 0;
      for (let i = css.indexOf('{', start); i < css.length; i++) {
        if (css[i] === '{') depth++;
        if (css[i] === '}' && --depth === 0) { out.push(css.slice(start, i + 1)); break; }
      }
    }
    return out.join('\n');
  };

  it('gives a tappable unit a touch target of at least 40 px on narrow or touch screens, with padding (the font stays)', () => {
    const touch = media('(max-width: 899px), (pointer: coarse)');
    const unit = /\.reading \.unit \{([^}]*)\}/.exec(touch)?.[1] ?? '';
    // an inline unit: 0.5rem above and below adds 2 x 9.5 px to its ~22 px text box at the 19 px root (inline padding does not move lines)
    expect(unit).toMatch(/padding:\s*0\.5rem 0/);
    expect(unit).not.toMatch(/font-size/);
    // a unit set on its own line already has a 1.7 line height: a little padding makes it 40 px without changing the rhythm
    const lines = /\.reading\.lines \.unit \{([^}]*)\}/.exec(touch)?.[1] ?? '';
    expect(lines).toMatch(/padding-block:\s*0\.15rem|padding:\s*0\.15rem 0/);
  });

  it('shows the choice in a sticky bottom bar on narrow screens and in the cards on wide ones', () => {
    expect(css).toMatch(/\.actionbar \{[^}]*position: sticky;[^}]*bottom: 0/);
    expect(media('(max-width: 899px)')).toMatch(/\.duel-pick \{[^}]*display: none/);
    expect(media('(min-width: 900px)')).toMatch(/\.actionbar \.bar-pick \{[^}]*display: none/);
    expect(js).toContain('duel-pick');
    expect(js).toContain('bar-pick');
  });
});

// app.js exposes its pure helpers only when window.__READING_TEST__ is set, and then does not touch the DOM.
function load() {
  const window: Record<string, any> = { __READING_TEST__: true };
  runInNewContext(js, { window, URLSearchParams, Date, Math, console });
  return window.__reading;
}
const r = load();

describe('duel side translation', () => {
  it('maps a visual choice to the canonical outcome for both positions', () => {
    // 'ab': the pair's a is on the left
    expect(r.translateOutcome('left', 'ab')).toBe('a');
    expect(r.translateOutcome('right', 'ab')).toBe('b');
    // 'ba': the pair's a is on the right
    expect(r.translateOutcome('left', 'ba')).toBe('b');
    expect(r.translateOutcome('right', 'ba')).toBe('a');
    for (const p of ['ab', 'ba']) {
      expect(r.translateOutcome('tie', p)).toBe('tie');
      expect(r.translateOutcome('bothBad', p)).toBe('bothBad');
    }
    expect(() => r.translateOutcome('middle', 'ab')).toThrow();
  });

  it('picks a position from the random source', () => {
    expect(r.pickPosition(() => 0.1)).toBe('ab');
    expect(r.pickPosition(() => 0.9)).toBe('ba');
  });
});

describe('the duel action bar', () => {
  it('names the two cards by their labels, in the order shown, then Tie and Neither works', () => {
    expect(r.duelBar(['C', 'A'])).toEqual([
      { choice: 'left', text: 'Draft C', pick: true }, { choice: 'right', text: 'Draft A', pick: true },
      { choice: 'tie', text: 'Tie', pick: false }, { choice: 'bothBad', text: 'Neither works', pick: false },
    ]);
    expect(r.duelBar(['A', 'B']).map((b: any) => b.text)).toEqual(['Draft A', 'Draft B', 'Tie', 'Neither works']);
  });
});

describe('lineup hint', () => {
  it('says line for line layouts (verse, script, dialog) and sentence for prose', () => {
    expect(r.lineupHint(0, 'lines')).toContain('Tap any line to leave a note');
    expect(r.lineupHint(0, 'prose')).toContain('Tap any sentence to leave a note');
    expect(r.lineupHint(0, undefined)).toContain('Tap any sentence');
    expect(r.lineupHint(1, 'lines')).not.toContain('Tap any');
  });
});

describe('timing', () => {
  it('counts words and estimates against the target', () => {
    expect(r.wordCount(['One two three.', '  ', 'Four five.'])).toBe(5);
    const units = [Array(150).fill('word').join(' ')]; // 150 words at 150 wpm = 60 s
    const m = r.timingModel(units, 150, { minutes: 2 });
    expect(m.estSeconds).toBeCloseTo(60);
    expect(m.targetSeconds).toBe(120);
    expect(m.verdict).toBe('under');
    expect(r.timingText(m)).toBe('About 1:00 to read - 150 words - 1:00 under the 2:00 target');
    expect(r.timingModel(units, 150, { words: 100 }).verdict).toBe('over');
    expect(r.timingModel(units, 150, { words: 150 }).verdict).toBe('on');
    expect(r.timingModel(units, null, { words: 100 })).toMatchObject({ estSeconds: null, verdict: 'over', targetWords: 100 });
    expect(r.timingModel(units, null, null).verdict).toBeNull();
  });

  it('formats a clock', () => {
    expect(r.formatClock(161)).toBe('2:41');
    expect(r.formatClock(5)).toBe('0:05');
    expect(r.formatClock(-3)).toBe('0:00');
  });
});

describe('event ids and tokens', () => {
  it('uses randomUUID when there is one and a unique fallback otherwise', () => {
    expect(r.newEventId({ randomUUID: () => 'uuid-1' })).toBe('uuid-1');
    const a = r.newEventId(undefined), b = r.newEventId(undefined);
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(100);
    expect(a).toMatch(/^e-[a-z0-9]+-[0-9a-f]{16}$/);
  });

  const fakeStore = (init: Record<string, string> = {}, throws = false) => {
    const m = new Map(Object.entries(init));
    return {
      getItem: (k: string) => { if (throws) throw new Error('blocked'); return m.get(k) ?? null; },
      setItem: (k: string, v: string) => { if (throws) throw new Error('blocked'); m.set(k, v); },
    };
  };

  it('takes the token from the URL, then from storage', () => {
    const s = fakeStore();
    expect(r.resolveToken('?t=abc', s)).toEqual({ token: 'abc', fromUrl: true, persisted: true });
    expect(r.resolveToken('', s)).toEqual({ token: 'abc', fromUrl: false, persisted: true });
  });

  it('keeps the token in the URL when storage is unavailable', () => {
    expect(r.resolveToken('?t=abc', fakeStore({}, true))).toEqual({ token: 'abc', fromUrl: true, persisted: false });
    expect(r.resolveToken('?t=abc', null)).toEqual({ token: 'abc', fromUrl: true, persisted: false });
    expect(r.resolveToken('', null).token).toBe('');
  });

  it('reads the session id from the path only', () => {
    expect(r.sessionIdFromPath('/s/read-1')).toBe('read-1');
    expect(r.sessionIdFromPath('/s/../x')).toBeNull();
    expect(r.sessionIdFromPath('/')).toBeNull();
  });

  it('backs off on errors and polls steadily otherwise', () => {
    expect(r.backoff(0, 2000)).toBe(2000);
    expect(r.backoff(1, 8000)).toBe(4000);
    expect(r.backoff(9, 2000)).toBe(30000);
  });

  it('breaks units into paragraphs at the given breaks without losing or reordering any', () => {
    const units = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} has about ten words in it, give or take.`);
    const groups: number[][] = r.paragraphsOf(units, [5, 10, 15]);
    expect(groups.flat()).toEqual(units.map((_, i) => i));
    expect(groups.length).toBe(4);
    expect(r.SPEECH_IGNORED.has('interrupted') && r.SPEECH_IGNORED.has('canceled')).toBe(true);
  });

  it('groups units at the payload breaks; no breaks list is one group (the server always sends one)', () => {
    const units = ['a', 'b', 'c', 'd', 'e'];
    expect(r.paragraphsOf(units, [2, 3])).toEqual([[0, 1], [2], [3, 4]]);
    expect(r.paragraphsOf(units, [])).toEqual([[0, 1, 2, 3, 4]]);
    expect(r.paragraphsOf([], [])).toEqual([]);
    // junk breaks (out of range, repeated, unsorted) never lose or reorder a unit
    expect(r.paragraphsOf(units, [9, 3, 3, 0, -1]).flat()).toEqual([0, 1, 2, 3, 4]);
    // there is no count heuristic for an 'older payload': a missing list is one group
    expect(r.paragraphsOf(units)).toEqual([[0, 1, 2, 3, 4]]);
    expect(r.paragraphsOf(Array.from({ length: 20 }, () => 'ten words ten words ten words ten words ten words ten words'))).toHaveLength(1);
  });
});

describe('reveal text', () => {
  const name = (i: number) => `draft ${'ABC'[i - 1]}`;
  const hit = { picked: 2, matched: true, setId: 'demo', prediction: { pick: 2, shortlist: [3], why: 'it is warm', hit: true, shortlistHit: false, sealValid: true } };

  it('lists the parts of a reveal and never yields null or an empty part', () => {
    const parts: Array<{ cls?: string; text: string }> = r.revealParts(hit, name, true, 'You chose draft B.');
    expect(parts.map(p => p.text)).toEqual([
      'Before you looked, your writer guessed you would choose draft B, with draft C as other possibilities.',
      'it is warm', 'You chose draft B.', 'That matches. Your writer read your taste well this time.',
    ]);
    expect(parts[1].cls).toBe('why');
    for (const p of [hit, { ...hit, matched: false, prediction: { ...hit.prediction, why: '', shortlist: [], sealValid: false } }])
      for (const part of r.revealParts(p, name, true, 'You chose draft B.')) expect(typeof part.text === 'string' && part.text.length > 0, JSON.stringify(part)).toBe(true);
  });

  it('says there was nothing to compare when no guess was sealed', () => {
    expect(r.revealParts({ picked: 1, prediction: null, note: 'No prediction was sealed' }, name, true, 'You chose draft A.').map((p: any) => p.text)).toEqual(['You chose draft A.', 'No prediction was sealed']);
  });

  it('names variants by number when the guess was about another set', () => {
    expect(r.revealParts(hit, name, false, 'x')[0].text).toContain('variant 2');
  });
});

describe('speech support', () => {
  const Utterance = function Utterance() {};
  it('needs a real speechSynthesis object and an utterance constructor, not just the property', () => {
    expect(r.speechSupported({ speechSynthesis: { speak() {} }, SpeechSynthesisUtterance: Utterance })).toBe(true);
    expect(r.speechSupported({ speechSynthesis: undefined, SpeechSynthesisUtterance: Utterance })).toBe(false);
    expect(r.speechSupported({ speechSynthesis: null, SpeechSynthesisUtterance: Utterance })).toBe(false);
    expect(r.speechSupported({ speechSynthesis: { speak() {} } })).toBe(false);
    expect(r.speechSupported({})).toBe(false);
  });
});

