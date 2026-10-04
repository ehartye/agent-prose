import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const DIR = join(import.meta.dirname, '..', 'runtime', 'reading');
const entries = readdirSync(DIR, { withFileTypes: true });
const files = entries.filter(e => e.isFile()).map(e => e.name);
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');
const html = read('index.html');
const js = read('app.js');

describe('the reading page: static safety', () => {
  it('has the three page files and the fonts folder, and nothing else', () => {
    expect([...files].sort()).toEqual(['app.js', 'index.html', 'style.css']);
    expect(entries.filter(e => e.isDirectory()).map(e => e.name)).toEqual(['fonts']);
    expect(readdirSync(join(DIR, 'fonts')).sort()).toEqual([
      'OFL-Atkinson.txt', 'OFL-CourierPrime.txt', 'README.txt', 'atkinson-400.ttf', 'atkinson-700.ttf', 'courier-prime-400.ttf', 'courier-prime-700.ttf',
    ]);
  });

  it('uses none of the banned APIs', () => {
    const banned: Array<[string, RegExp]> = [
      ['innerHTML', /innerHTML/], ['outerHTML', /outerHTML/], ['insertAdjacentHTML', /insertAdjacentHTML/],
      ['document.write', /document\s*\.\s*write/], ['eval(', /\beval\s*\(/], ['new Function', /new\s+Function\b/],
      ['string timer', /set(Timeout|Interval)\s*\(\s*['"`]/], ['javascript: URL', /javascript:/i],
      ['inline handler', /[\s"'<]on[a-z]+\s*=/i], ['setAttribute style', /setAttribute\s*\(\s*['"]style['"]/],
      ['third-party URL', /(https?:)?\/\/[a-z0-9-]+\.[a-z]{2,}/i], ['dynamic import', /importScripts|\bimport\s*\(/],
    ];
    // The SVG namespace is an identifier, not a request: createElementNS needs it, and it is the one URL-shaped string the page may hold.
    const scan = (f: string) => read(f).replaceAll('http://www.w3.org/2000/svg', '');
    for (const f of files) for (const [name, re] of banned) expect(re.test(scan(f)), `${f}: ${name}`).toBe(false);
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
    expect(server).toContain(`const CSP = "default-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";`);
    const csp = /const CSP = "([^"]*)"/.exec(server)![1];
    expect(csp).not.toMatch(/unsafe|https?:|data:|\*/);
    expect(csp).toContain("font-src 'self'");
    // a grid column must be allowed to shrink below its content, or one unbroken word widens the whole phone page
    expect(read('style.css')).toMatch(/\.duel-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(read('style.css')).toMatch(/\.reading \{[^}]*overflow-wrap: anywhere/);
    expect(read('style.css')).not.toMatch(/@import|url\(\s*['"]?(https?:|\/\/|data:)/);
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


describe('strikes: the pure helpers', () => {
  const draft = (strikes: any[], over: any = {}) => ({ source: 't.md', hash: 'a'.repeat(64), rev: 'r1', editable: true, lines: [], strikes, applied: null, ...over });
  const mk = (id: string, ref: string, stale = false) => ({ id, ref, reason: 'wrong-direction', text: 'x', at: 't', stale });

  it('offers exactly the three reasons, in order, none preselected, with the words an owner reads', () => {
    expect(r.STRIKE_REASONS).toEqual([
      { id: 'wrong-direction', label: 'Wrong direction' }, { id: 'faulty-premise', label: 'Faulty premise' }, { id: 'not-worth-rewrite', label: 'Not worth rewriting' },
    ]);
    expect(r.reasonLabel('faulty-premise')).toBe('Faulty premise');
    expect(r.reasonLabel('anything-else')).toBe('anything-else');
  });

  it('says how many lines are struck, and nothing when none are', () => {
    expect(r.pendingSummary(draft([]))).toBeNull();
    expect(r.pendingSummary(null)).toBeNull();
    expect(r.pendingSummary(undefined)).toBeNull();
    expect(r.pendingSummary(draft([mk('s1', '5')]))).toMatchObject({ count: 1, stale: 0, text: '1 line struck' });
    expect(r.pendingSummary(draft([mk('s1', '5'), mk('s2', '7')])).text).toBe('2 lines struck');
    expect(r.pendingSummary(draft([mk('s1', '5')])).note).toBe('Struck lines stay in the draft until you review and apply them.');
  });

  it('says the draft changed, and that the stale ones can only be undone', () => {
    const one = r.pendingSummary(draft([mk('s1', '5', true), mk('s2', '7')]));
    expect(one).toMatchObject({ count: 2, stale: 1, note: 'The draft changed since 1 of these was struck. Undo it and strike again.' });
    expect(r.pendingSummary(draft([mk('s1', '5', true), mk('s2', '7', true)])).note).toBe('The draft changed since 2 of these were struck. Undo them and strike again.');
  });

  it('finds the current strike on a line and ignores a stale one', () => {
    const d = draft([mk('s1', '5', true), mk('s2', '7')]);
    expect(r.strikeOn(d, '7').id).toBe('s2');
    expect(r.strikeOn(d, '5')).toBeUndefined();
    expect(r.strikeOn(null, '5')).toBeUndefined();
    expect(r.staleStrikes(d).map((s: any) => s.id)).toEqual(['s1']);
    expect(r.staleStrikes(undefined)).toEqual([]);
  });

  it('builds a strike request only from a complete pick, with the hash the page saw and no path', () => {
    const d = draft([]);
    expect(r.strikeBody(d, { ref: '5', reason: null, note: '' }, 'e1')).toBeNull();
    expect(r.strikeBody(d, { ref: '5', reason: 'boring', note: '' }, 'e1')).toBeNull();
    expect(r.strikeBody(d, { ref: '5', reason: 'wrong-direction', note: 'x'.repeat(501) }, 'e1')).toBeNull();
    expect(r.strikeBody(null, { ref: '5', reason: 'wrong-direction', note: '' }, 'e1')).toBeNull();
    expect(r.strikeBody(d, { ref: '5', reason: 'wrong-direction', note: '   ' }, 'e1')).toEqual({ ref: '5', reason: 'wrong-direction', draftHash: 'a'.repeat(64), eventId: 'e1' });
    expect(r.strikeBody(d, { ref: '5-6', reason: 'not-worth-rewrite', note: '  too sweet ' }, 'e2')).toEqual({ ref: '5-6', reason: 'not-worth-rewrite', note: 'too sweet', draftHash: 'a'.repeat(64), eventId: 'e2' });
  });

  it('re-renders when the draft rev changes, and not otherwise', () => {
    const p = (rev?: string) => ({ state: { stage: 'lineup', round: 0, events: 3 }, session: { brief: null, original: null }, ...(rev ? { draft: { rev } } : {}) });
    expect(r.signature(p('a'))).not.toBe(r.signature(p('b')));
    expect(r.signature(p('a'))).toBe(r.signature(p('a')));
    expect(r.signature(p())).not.toBe(r.signature(p('a')));
  });
});

describe('strikes: apply helpers', () => {
  const draft = (over: any = {}) => ({ source: 't.md', hash: 'a'.repeat(64), rev: 'r1', editable: true, lines: [], strikes: [{ id: 's1', ref: '5', reason: 'wrong-direction', stale: false }], applied: null, ...over });

  it('offers apply only when something is struck, nothing is stale and the session is open', () => {
    expect(r.applyReady(draft())).toBe(true);
    expect(r.applyReady(draft({ strikes: [] }))).toBe(false);
    expect(r.applyReady(draft({ editable: false }))).toBe(false);
    expect(r.applyReady(draft({ strikes: [{ id: 's1', ref: '5', reason: 'x', stale: false }, { id: 's2', ref: '7', reason: 'x', stale: true }] }))).toBe(false);
    expect(r.applyReady(null)).toBe(false);
  });

  it('says what was removed while it can be undone, and not once the session is closed', () => {
    expect(r.appliedSummary(draft({ applied: { id: 'a1', count: 3, at: 'x' } }))).toEqual({ id: 'a1', text: 'Removed 3 lines' });
    expect(r.appliedSummary(draft({ applied: { id: 'a2', count: 1, at: 'x' } })).text).toBe('Removed 1 line');
    expect(r.appliedSummary(draft())).toBeNull();
    expect(r.appliedSummary(draft({ editable: false, applied: { id: 'a1', count: 3, at: 'x' } }))).toBeNull();
    expect(r.appliedSummary(null)).toBeNull();
  });

  it('puts every removed row in words: lines, the exact text, the reason, and what else goes with it', () => {
    expect(r.removalParts({ start: 17, end: 18, kind: 'unit', text: 'Not tonight.\nPlease.', reason: 'faulty-premise', note: 'never says please' }))
      .toEqual({ where: 'Lines 17-18', text: 'Not tonight.\nPlease.', extra: null, reason: 'Faulty premise', note: 'never says please' });
    expect(r.removalParts({ start: 16, end: 16, kind: 'cue', text: 'MAYA', reason: 'wrong-direction' })).toMatchObject({ where: 'Line 16', extra: 'Also removes the speaker cue MAYA' });
    expect(r.removalParts({ start: 19, end: 19, kind: 'blank', text: '' })).toMatchObject({ text: '', extra: expect.stringMatching(/blank line/), reason: null });
    expect(r.removalParts({ start: 10, end: 10, kind: 'key', text: '    choices:' }).extra).toBe('Also removes the list heading choices: that is left empty');
  });

  it('counts lines in the heading and the button', () => {
    expect([r.planTitle({ count: 1 }), r.planButton({ count: 1 })]).toEqual(['Remove 1 line from the draft?', 'Remove 1 line']);
    expect(r.planButton({ count: 3 })).toBe('Remove 3 lines');
  });
});

describe('strikes: the page source', () => {
  it('sends strikes, the apply and the undo through the one request path, to the strike routes', () => {
    expect(js).toContain("'/api/session/' + sessionId + '/strike' + suffix");
    expect(js).toContain("'/clear'");
    expect(js).toContain("'/strike/preview'");
    expect(js).toContain("'/strike/apply'");
    expect(js).toContain("'/undo'");
    expect(js).toContain('This link can delete lines from the draft.');
    expect(js).toContain("'Review and apply'");
    expect(js).toContain("'Undo removal'");
    expect(js).toContain("'Not yet'");
    expect(js).toContain('digest: cur.plan.digest');
  });

  it('never sends a path or a text to the server: the apply carries only the digest and an event id', () => {
    expect(js).not.toMatch(/JSON\.stringify\(\{[^}]*(file|path|text)[^}]*\}\)/);
    expect(js).toContain("JSON.stringify({ digest: cur.plan.digest, eventId: newEventId(window.crypto) })");
  });

  it('uses real buttons, a labelled radio group for the reasons, and a status bar', () => {
    expect(js).toContain("role: 'radiogroup'");
    expect(js).toContain("role: 'radio'");
    expect(js).toContain("role: 'status'");
    expect(js).toContain("'aria-checked'");
    expect(js).not.toMatch(/<(div|span)[^>]*onclick/i);
  });

  it('keeps the draft view text-only and the picker note capped at 500', () => {
    expect(js).toContain("maxlength: String(MAX_NOTE)");
    expect(js).toContain('const MAX_NOTE = 500');
    expect(read('index.html')).toContain('id="views"');
  });

  it('styles a struck line with a line-through that is also muted, and keeps tap targets at 44 px', () => {
    const css = read('style.css');
    expect(css).toMatch(/\.struck, \.unit\.struck \{[^}]*text-decoration: line-through/);
    expect(css).toMatch(/button \{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.dock \{[^}]*position: sticky;[^}]*bottom: 0/);
    expect(css).toMatch(/\.dock \.actionbar \{[^}]*position: static/);
  });
});
