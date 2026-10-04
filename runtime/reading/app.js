// The reading page. Plain JS, no dependencies, no build. Draft text and note text are untrusted: they only ever
// reach the page through textContent or createTextNode (see the h() helper), never as markup.
(function () {
  'use strict';

  // ---- pure helpers (exposed to tests through window.__reading when window.__READING_TEST__ is set) ----

  const TOKEN_KEY = 'prose-reading-token';
  /** What a tap leaves a note on: a line in verse, scripts and dialog, a sentence in prose. */
  const unitWord = layout => (layout === 'lines' ? 'line' : 'sentence');
  const lineupHint = (round, layout) => (round === 0
    ? 'Keep the ones worth a closer look and pass on the rest. Tap any ' + unitWord(layout) + ' to leave a note.'
    : 'Your earlier pick comes along. Keep or pass on the new ones.');
  const wordCount = units => units.reduce((n, u) => n + (String(u).trim() ? String(u).trim().split(/\s+/).length : 0), 0);

  function formatClock(seconds) {
    const s = Math.max(0, Math.round(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /** Estimated read time against the declared target. Seconds when the form has a words-per-minute, words otherwise. */
  function timingModel(units, wpm, target) {
    const words = wordCount(units);
    const model = { words, estSeconds: null, targetSeconds: null, diff: null, verdict: null, targetWords: null };
    if (wpm) {
      model.estSeconds = (words / wpm) * 60;
      if (target && target.minutes) model.targetSeconds = target.minutes * 60;
      else if (target && target.words) model.targetSeconds = (target.words / wpm) * 60;
    } else if (target && target.words) {
      model.targetWords = target.words;
    }
    const [value, goal] = model.estSeconds !== null && model.targetSeconds !== null ? [model.estSeconds, model.targetSeconds]
      : model.targetWords !== null ? [words, model.targetWords] : [null, null];
    if (value !== null) {
      model.diff = value - goal;
      model.verdict = Math.abs(model.diff) <= goal * 0.03 ? 'on' : model.diff > 0 ? 'over' : 'under';
    }
    return model;
  }

  function timingText(m) {
    const parts = [m.words + ' words'];
    if (m.estSeconds !== null) parts.unshift('About ' + formatClock(m.estSeconds) + ' to read');
    if (m.verdict && m.targetSeconds !== null) {
      parts.push(m.verdict === 'on' ? 'right on the ' + formatClock(m.targetSeconds) + ' target'
        : formatClock(Math.abs(m.diff)) + (m.verdict === 'over' ? ' over' : ' under') + ' the ' + formatClock(m.targetSeconds) + ' target');
    } else if (m.verdict && m.targetWords !== null) {
      parts.push(m.verdict === 'on' ? 'right on the ' + m.targetWords + '-word target'
        : Math.round(Math.abs(m.diff)) + (m.verdict === 'over' ? ' over' : ' under') + ' the ' + m.targetWords + '-word target');
    }
    return parts.join(' - ');
  }

  /** Which side the pair's first candidate (a) is on: 'ab' = a on the left, 'ba' = a on the right. */
  const pickPosition = (rand = Math.random) => (rand() < 0.5 ? 'ab' : 'ba');

  /** A choice on the screen ('left', 'right', 'tie', 'bothBad') as the outcome relative to the pair's canonical a/b. */
  function translateOutcome(choice, position) {
    if (choice === 'tie' || choice === 'bothBad') return choice;
    if (choice !== 'left' && choice !== 'right') throw new Error('unknown choice ' + choice);
    const aIsLeft = position === 'ab';
    return (choice === 'left') === aIsLeft ? 'a' : 'b';
  }

  /**
   * The duel's choices for the bottom bar, in the order the cards are shown. On a phone the cards stack, so the bar names
   * them by their draft labels (not "left" and "right"); `choice` is what translateOutcome takes.
   */
  function duelBar(labels) {
    return [
      { choice: 'left', text: 'Draft ' + labels[0], pick: true }, { choice: 'right', text: 'Draft ' + labels[1], pick: true },
      { choice: 'tie', text: 'Tie', pick: false }, { choice: 'bothBad', text: 'Neither works', pick: false },
    ];
  }

  function newEventId(cr, rand = Math.random) {
    if (cr && typeof cr.randomUUID === 'function') return cr.randomUUID();
    const hex = n => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('');
    return 'e-' + Date.now().toString(36) + '-' + hex(16);
  }

  /** The token from ?t= (first load) or storage. `store` is sessionStorage or null; reads and writes may throw. */
  function resolveToken(search, store) {
    const fromUrl = new URLSearchParams(search || '').get('t');
    let saved = null;
    let persisted = false;
    if (store) { try { saved = store.getItem(TOKEN_KEY); } catch { saved = null; } }
    const token = fromUrl || saved || '';
    if (fromUrl && store) { try { store.setItem(TOKEN_KEY, fromUrl); persisted = true; } catch { persisted = false; } }
    else if (saved) persisted = true;
    return { token, fromUrl: Boolean(fromUrl), persisted };
  }

  const sessionIdFromPath = path => { const m = /^\/s\/([a-z0-9-]+)\/?$/.exec(path || ''); return m ? m[1] : null; };

  /**
   * Unit indexes grouped into paragraphs, stanzas or blocks. `breaks` are the unit indexes that start a new group (from
   * the server, which knows the draft's blocks and always sends the list); without one there is a single group.
   */
  function paragraphsOf(units, breaks) {
    const starts = new Set((Array.isArray(breaks) ? breaks : []).filter(b => Number.isInteger(b) && b > 0 && b < units.length));
    const out = [];
    units.forEach((u, i) => { if (i === 0 || starts.has(i)) out.push([]); out[out.length - 1].push(i); });
    return out;
  }

  /** The paragraphs of the reveal, in order: only real text (a missing part is left out, never shown as "null"). */
  function revealParts(r, labelFor, sameSet, mine) {
    const a = r.prediction;
    if (!a) return [{ text: mine }, { text: r.note || 'Your writer did not seal a guess for this one, so there is nothing to compare.' }];
    const name = i => (sameSet ? labelFor(i) : 'variant ' + i);
    const others = a.shortlist && a.shortlist.length ? ', with ' + a.shortlist.map(name).join(' and ') + ' as other possibilities' : '';
    return [
      { text: 'Before you looked, your writer guessed you would choose ' + name(a.pick) + others + '.' },
      a.why ? { cls: 'why', text: a.why } : null,
      { text: mine },
      { text: r.matched ? 'That matches. Your writer read your taste well this time.'
        : a.shortlistHit ? 'Not the first guess, but your choice was on their shortlist.' : 'Not this time, and that is useful: it shows your writer something to learn.' },
      a.sealValid === false ? { cls: 'quiet', text: 'The seal on that guess does not check out, so treat it as unverified.' } : null,
    ].filter(Boolean);
  }

  /**
   * The brief as the page shows it: a Character and a Context row (only what is there) and the muted unconfirmed line.
   * Null when there is nothing to show (a reserved characterRef alone has no text).
   */
  function briefParts(b) {
    if (!b) return null;
    const rows = [];
    if (b.character) rows.push({ label: 'Character', text: b.character });
    if (b.context) rows.push({ label: 'Context', text: b.context });
    if (!rows.length) return null;
    return { rows, note: b.confirmed ? null : 'Not confirmed with you yet' };
  }

  /** What is on screen: stage, round, event count and the brief (an edit of its words or its confirmation re-renders). */
  const signature = p => p.state.stage + '|' + p.state.round + '|' + p.state.events + '|' + (p.session && p.session.brief ? JSON.stringify([p.session.brief.character, p.session.brief.context, !!p.session.brief.confirmed]) : '');

  /** True only when the browser has a speech synthesizer object and an utterance constructor (the property alone can be undefined). */
  const speechSupported = win => !!(win && win.speechSynthesis && typeof win.SpeechSynthesisUtterance === 'function');

  const SPEECH_IGNORED = new Set(['interrupted', 'canceled']);
  const backoff = (fails, base) => (fails ? Math.min(30000, 2000 * 2 ** Math.min(fails, 4)) : base);

  if (window.__READING_TEST__) {
    window.__reading = { wordCount, formatClock, timingModel, timingText, pickPosition, translateOutcome, duelBar, newEventId, lineupHint, resolveToken, sessionIdFromPath, paragraphsOf, briefParts, signature, backoff, revealParts, speechSupported, SPEECH_IGNORED };
    return;
  }

  // ---- state ----

  const store = (() => { try { const s = window.sessionStorage; s.getItem(TOKEN_KEY); return s; } catch { return null; } })();
  const auth = resolveToken(window.location.search, store);
  const sessionId = sessionIdFromPath(window.location.pathname);
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let data = null;       // the last payload
  let renderedSig = '';  // what is on screen: stage, round and event count
  let fails = 0;
  let timer = null;
  let busy = false;
  let fatal = false;
  const ui = {
    marks: {}, marksRound: -1, selected: null, noteDraft: '', rate: 1, directions: [], like: '', confirmShip: false,
    showChange: {}, measured: {}, reveal: null, revealFor: '', speech: null, positions: {}, briefOpen: true,
  };

  const $ = id => document.getElementById(id);
  const app = $('app');

  // ---- DOM helper: text goes in as text, never as markup; no style attributes (the CSP forbids them) ----

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'style') throw new Error('no style attributes');
      else if (k === 'value' || k === 'disabled' || k === 'hidden' || k === 'checked') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return el;
  }
  const btn = (text, onClick, cls, extra) => h('button', { type: 'button', class: cls || '', text, on: { click: onClick }, ...(extra || {}) });

  // ---- transport ----

  function headers(json) {
    const out = { 'x-prose-token': auth.token };
    if (json) out['content-type'] = 'application/json';
    return out;
  }

  async function request(method, path, body) {
    const init = { method, headers: headers(body !== undefined), cache: 'no-store' };
    if (body !== undefined) init.body = body;
    const res = await fetch(path, init);
    let parsed = null;
    try { parsed = await res.json(); } catch { parsed = null; }
    return { ok: res.ok, status: res.status, body: parsed };
  }

  /** A POST is retried once on a network error with the same body, so the same eventId (the server is idempotent). */
  async function post(path, body) {
    try { return await request('POST', path, body); }
    catch { return request('POST', path, body); }
  }

  function showBanner(on) {
    const el = $('banner');
    el.hidden = !on;
    el.textContent = on ? 'Reconnecting... the page will pick up where you left off.' : '';
  }

  function showNotice(message, hint) {
    const el = $('notice');
    el.textContent = '';
    el.appendChild(h('div', { class: 'msg' }, message, hint ? h('span', { class: 'hint', text: hint }) : null));
    el.appendChild(btn('Dismiss', () => { el.hidden = true; }, 'link'));
    el.hidden = false;
  }
  const hideNotice = () => { $('notice').hidden = true; };

  function showProblem(res) {
    const e = res.body && res.body.error;
    showNotice((e && e.message) || 'Something went wrong (' + res.status + ').', e && e.hint);
  }

  function apply(p, quiet) {
    const changed = signature(p) !== renderedSig;
    data = p;
    if (quiet) { renderedSig = signature(p); return; }
    if (changed) render();
  }

  async function load() {
    if (!sessionId) return;
    try {
      const res = await request('GET', '/api/session/' + sessionId);
      fails = 0;
      showBanner(false);
      if (res.ok) apply(res.body);
      else if (res.status === 401 || res.status === 404) {
        fatal = true;
        showMessage(res.status === 401 ? 'This link is missing its key' : 'That reading session was not found',
          (res.body && res.body.error && (res.body.error.hint || res.body.error.message)) || 'Ask your writer for a fresh link.');
      } else showProblem(res);
    } catch {
      fails++;
      showBanner(true);
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (fatal) return;
    const base = data && data.state.stage === 'waiting' ? 2000 : 8000;
    timer = setTimeout(async () => { await load(); schedule(); }, backoff(fails, base));
  }

  /** Send an owner event. Returns true when the server took it. */
  async function send(event, opts) {
    const gate = !(opts && opts.quiet); // a quiet send (a play note) never blocks the owner's next tap
    if (gate && busy) return false;
    if (gate) { busy = true; setBusy(true); }
    try {
      const res = await post('/api/session/' + sessionId + '/event', JSON.stringify({ ...event, eventId: newEventId(window.crypto) }));
      if (res.ok && res.body && res.body.state) { hideNotice(); showBanner(false); apply(res.body.state, opts && opts.quiet); return true; }
      if (!(opts && opts.silent)) showProblem(res);
      if (res.status === 409) await load();
      return false;
    } catch {
      if (!(opts && opts.silent)) showBanner(true);
      return false;
    } finally {
      if (gate) { busy = false; setBusy(false); }
    }
  }
  function setBusy(on) { for (const b of app.querySelectorAll('button[data-gate]')) b.disabled = on; }

  // ---- read-aloud ----

  const speech = { run: 0, index: null, unit: -1, paused: false, startedAt: 0, pausedAt: 0, pausedTotal: 0, fromStart: false };
  const unitEls = new Map();    // candidate index -> unit span elements
  const controlEls = new Map(); // candidate index -> { play, pause }
  const timingEls = new Map();  // candidate index -> element for the on-device time

  function checkSpeech() {
    if (!speechSupported(window)) { setSpeech('no'); return; }
    const has = () => { try { return window.speechSynthesis.getVoices().length > 0; } catch { return false; } };
    if (has()) { setSpeech('yes'); return; }
    setSpeech('pending');
    try { window.speechSynthesis.addEventListener('voiceschanged', () => { if (has()) setSpeech('yes'); }); } catch { /* no events */ }
    setTimeout(() => { if (ui.speech !== 'yes' && !has()) setSpeech('no'); }, 1500);
  }
  function setSpeech(state) {
    ui.speech = state;
    $('speech-note').hidden = state !== 'no';
    updatePlayState();
  }

  const speechOn = () => ui.speech === 'yes' || ui.speech === 'pending';
  const synth = () => window.speechSynthesis;
  const unitsOf = index => { const c = data && data.candidates.find(x => x.index === index); return (c && c.units) || []; };

  function highlight(index, i) {
    for (const els of unitEls.values()) for (const el of els) el.classList.remove('speaking');
    const el = i >= 0 && unitEls.get(index) && unitEls.get(index)[i];
    if (!el) return;
    el.classList.add('speaking');
    try { el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' }); } catch { /* old browser */ }
  }

  function updatePlayState() {
    for (const [index, c] of controlEls) {
      const mine = speech.index === index;
      c.play.hidden = !speechOn();
      c.play.textContent = mine ? 'Stop' : 'Play';
      c.pause.hidden = !mine;
      c.pause.textContent = speech.paused ? 'Resume' : 'Pause';
    }
  }

  function stopSpeech() {
    speech.run++;
    const was = speech.index;
    speech.index = null; speech.unit = -1; speech.paused = false;
    try { synth().cancel(); } catch { /* nothing to cancel */ }
    highlight(was, -1);
    updatePlayState();
  }

  function speakUnit(run, index, i) {
    if (run !== speech.run) return;
    const units = unitsOf(index);
    if (i >= units.length) { finishReading(run, index); return; }
    if (!String(units[i]).trim()) { speakUnit(run, index, i + 1); return; }
    speech.unit = i;
    highlight(index, i);
    // One short utterance per unit: highlighting works without boundary events, and long utterances are the ones
    // Chrome silently stops.
    const u = new window.SpeechSynthesisUtterance(units[i]);
    u.rate = ui.rate;
    u.addEventListener('end', () => speakUnit(run, index, i + 1));
    u.addEventListener('error', ev => {
      if (run !== speech.run || SPEECH_IGNORED.has(ev.error)) return;
      stopSpeech();
      showNotice('Reading aloud stopped.', 'This browser could not speak that text. You can still read it on the page.');
    });
    synth().speak(u);
  }

  function finishReading(run, index) {
    if (run !== speech.run) return;
    if (speech.fromStart) {
      ui.measured[index] = { seconds: (Date.now() - speech.startedAt - speech.pausedTotal) / 1000, rate: ui.rate };
      renderMeasured(index);
    }
    stopSpeech();
  }

  function play(index, from) {
    if (!speechOn()) return;
    stopSpeech();
    const run = ++speech.run;
    Object.assign(speech, { index, unit: from, paused: false, startedAt: Date.now(), pausedTotal: 0, fromStart: from === 0 });
    updatePlayState();
    send({ type: 'play', index, mode: 'speech' }, { quiet: true, silent: true });
    // cancel() right before speak() can swallow the first utterance in Chrome; a beat in between avoids that.
    setTimeout(() => speakUnit(run, index, from), 60);
  }

  function togglePause() {
    if (speech.index === null) return;
    try {
      if (speech.paused) { synth().resume(); speech.pausedTotal += Date.now() - speech.pausedAt; speech.paused = false; }
      else { synth().pause(); speech.pausedAt = Date.now(); speech.paused = true; }
    } catch { /* ignore */ }
    updatePlayState();
  }

  function renderMeasured(index) {
    const el = timingEls.get(index);
    const m = ui.measured[index];
    if (!el || !m) return;
    el.textContent = 'On this device it took ' + formatClock(m.seconds) + (Math.abs(m.rate - 1) > 0.01 ? ' (at ' + m.rate.toFixed(1) + 'x speed)' : '');
  }

  // ---- screens ----

  function setTitle(title, sub) {
    $('title').textContent = title;
    $('subtitle').textContent = sub || '';
    document.title = title;
  }

  function showMessage(title, text) {
    stopSpeech();
    setTitle(title, '');
    app.className = '';
    app.replaceChildren(h('p', { class: 'quiet', text }));
  }

  function candidateOf(index) { return data.candidates.find(c => c.index === index); }

  function rateControl() {
    const out = h('span', { class: 'quiet', text: ui.rate.toFixed(1) + 'x' });
    const input = h('input', {
      type: 'range', id: 'rate', min: '0.8', max: '1.3', step: '0.1', value: String(ui.rate),
      on: { input: () => { ui.rate = parseFloat(input.value); out.textContent = ui.rate.toFixed(1) + 'x'; } },
    });
    return h('div', { class: 'rate' }, h('label', { for: 'rate', text: 'Reading speed' }), input, out);
  }

  function timingBlock(c) {
    const m = timingModel(c.units || [], data.session.wpm, data.session.target);
    const kids = [h('div', { text: timingText(m) })];
    if (m.estSeconds !== null) {
      const top = Math.max(m.estSeconds, m.targetSeconds || 0) * 1.2 || 1;
      const fill = h('div', { class: 'fill' + (m.verdict === 'over' ? ' over' : '') });
      fill.style.setProperty('--fill', String(Math.min(100, (m.estSeconds / top) * 100)));
      const bar = h('div', { class: 'bar', 'aria-hidden': 'true' }, fill);
      if (m.targetSeconds !== null) {
        const mark = h('div', { class: 'mark' });
        mark.style.setProperty('--mark', String(Math.min(100, (m.targetSeconds / top) * 100)));
        bar.appendChild(mark);
      }
      kids.push(bar);
    }
    const measured = h('div', { class: 'measured', 'aria-live': 'polite' });
    timingEls.set(c.index, measured);
    kids.push(measured);
    const el = h('div', { class: 'timing' }, kids);
    renderMeasured(c.index);
    return el;
  }

  function textBlock(c) {
    const units = c.units || [];
    const els = [];
    const noted = new Set(data.state.notes.filter(n => n.index === c.index).map(n => n.unit));
    const box = h('div', { class: 'reading' });
    const lines = c.layout === 'lines';
    if (lines) box.classList.add('lines');
    paragraphsOf(units, c.breaks).forEach(group => {
      const p = h('p', { class: lines ? 'stanza' : undefined });
      group.forEach((i, k) => {
        const selected = ui.selected && ui.selected.index === c.index && ui.selected.unit === i;
        const span = h('span', {
          class: 'unit' + (noted.has(i) ? ' noted' : '') + (selected ? ' selected' : ''),
          text: units[i], role: 'button', tabindex: '0',
          'aria-label': noted.has(i) ? 'Sentence with a note: ' + units[i] : undefined,
          on: {
            click: () => selectUnit(c.index, i),
            keydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectUnit(c.index, i); } },
          },
        });
        els[i] = span;
        p.appendChild(span);
        if (!lines && k < group.length - 1) p.appendChild(document.createTextNode(' '));
      });
      box.appendChild(p);
    });
    unitEls.set(c.index, els);
    return box;
  }

  function selectUnit(index, unit) {
    const same = ui.selected && ui.selected.index === index && ui.selected.unit === unit;
    ui.selected = same ? null : { index, unit };
    if (!same) ui.noteDraft = '';
    render();
    const box = app.querySelector('.notebox textarea');
    if (box) box.focus();
  }

  function noteBox(c) {
    if (!ui.selected || ui.selected.index !== c.index) return null;
    const text = (c.units || [])[ui.selected.unit] || '';
    const area = h('textarea', { rows: '3', maxlength: '500', 'aria-label': 'Your note', value: ui.noteDraft, on: { input: () => { ui.noteDraft = area.value; } } });
    return h('div', { class: 'notebox' },
      h('p', { class: 'quote', text }),
      area,
      h('div', { class: 'row' },
        btn('Save note', async () => {
          const note = area.value.trim();
          if (!note) { area.focus(); return; }
          const ok = await send({ type: 'note', index: c.index, unit: ui.selected.unit, text: note });
          if (ok) { ui.selected = null; ui.noteDraft = ''; render(); }
        }, 'primary', { 'data-gate': '1' }),
        speechOn() ? btn('Read from here', () => play(c.index, ui.selected.unit)) : null,
        btn('Cancel', () => { ui.selected = null; ui.noteDraft = ''; render(); }, 'link')));
  }

  function notesList(c) {
    const mine = data.state.notes.filter(n => n.index === c.index);
    if (!mine.length) return null;
    return h('ul', { class: 'notes', 'aria-label': 'Your notes' }, mine.map(n =>
      h('li', null, h('span', { class: 'q', text: (c.units || [])[n.unit] || '' }), h('span', { text: n.text }))));
  }

  function changeBlock(c) {
    const open = ui.showChange[c.index];
    const peeked = data.state.peeked.includes(c.index);
    const toggle = btn(open ? 'Hide what changed' : 'What changed?', async () => {
      if (open) { ui.showChange[c.index] = false; render(); return; }
      if (!peeked) { const ok = await send({ type: 'peek', index: c.index }); if (!ok) return; }
      ui.showChange[c.index] = true;
      render();
    }, 'link', { 'data-gate': '1' });
    const out = [h('div', { class: 'row' }, toggle)];
    if (open && peeked) {
      const fresh = candidateOf(c.index);
      out.push(h('div', { class: 'change' },
        h('p', { text: fresh.direction ? 'The writer was aiming for: ' + fresh.direction : 'No direction was recorded for this one.' }),
        fresh.angle ? h('p', { text: 'Angle: ' + fresh.angle }) : null,
        fresh.note ? h('p', { text: 'Note: ' + fresh.note }) : null,
        h('p', { class: 'quiet', text: 'These are the writer\'s own words, not a measure of how good the draft is. Trust your reading.' })));
    }
    return out;
  }

  /** One variant: label, timing, play controls, the tappable text, notes, and whatever buttons the screen adds. */
  function card(c, o) {
    o = o || {};
    const kids = [h('div', { class: 'card-head' }, h('span', { class: 'label', text: c.label, 'aria-label': 'Draft ' + c.label }), o.tag ? h('span', { class: 'tag', text: o.tag }) : null)];
    if (c.changed || !c.hashOk || !c.units) {
      kids.push(h('p', { class: 'changed-msg', text: 'This draft changed after it was sealed; it can\'t be chosen.' }));
      if (o.actionsWhenChanged) kids.push(o.actionsWhenChanged);
      return h('article', { class: 'card', 'data-index': String(c.index) }, kids);
    }
    kids.push(timingBlock(c));
    const play$ = btn('Play', () => (speech.index === c.index ? stopSpeech() : play(c.index, 0)), 'primary', { hidden: !speechOn() });
    const pause$ = btn('Pause', togglePause, '', { hidden: true });
    controlEls.set(c.index, { play: play$, pause: pause$ });
    kids.push(h('div', { class: 'row' }, play$, pause$));
    kids.push(textBlock(c), noteBox(c), notesList(c));
    if (o.actions) kids.push(o.actions);
    if (!o.noChange) kids.push(...changeBlock(c));
    return h('article', { class: 'card', 'data-index': String(c.index) }, kids);
  }

  /** "The brief": who speaks and where the line lands, open above the variants unless the owner folded it. Display only. */
  function briefBlock() {
    const parts = briefParts(data.session.brief);
    if (!parts) return null;
    const el = h('details', { class: 'brief', open: ui.briefOpen },
      h('summary', { text: 'The brief' }),
      parts.rows.map(r => h('p', {}, h('strong', { text: r.label + ': ' }), r.text)),
      parts.note ? h('p', { class: 'quiet brief-note', text: parts.note }) : null);
    el.addEventListener('toggle', () => { ui.briefOpen = el.open; });
    return el;
  }

  function lineupScreen() {
    const s = data.state;
    const pinned = s.round > 0 && s.champion !== null && s.lineup.includes(s.champion) ? s.champion : null;
    const shown = data.candidates.filter(c => s.lineup.includes(c.index));
    if (ui.marksRound !== s.round) { ui.marks = {}; ui.marksRound = s.round; }
    const choosable = c => !(c.changed || !c.hashOk || !c.units) && c.index !== pinned;
    const marked = shown.filter(c => choosable(c) && ui.marks[c.index] === 'keep').length;
    const open = shown.filter(c => choosable(c) && ui.marks[c.index] !== 'pass' && ui.marks[c.index] !== 'keep').length;
    setTitle(s.round === 0 ? 'Read each draft' : 'Round ' + (s.round + 1) + ': the new drafts', lineupHint(s.round, (shown[0] || {}).layout));
    const cards = shown.map(c => {
      const mark = which => () => { ui.marks[c.index] = ui.marks[c.index] === which ? null : which; render(); };
      const actions = c.index === pinned ? null : h('div', { class: 'row grow' },
        btn(ui.marks[c.index] === 'keep' ? 'Kept' : 'Keep', mark('keep'), ui.marks[c.index] === 'keep' ? 'on' : '', { 'aria-pressed': String(ui.marks[c.index] === 'keep') }),
        btn(ui.marks[c.index] === 'pass' ? 'Passed' : 'Pass', mark('pass'), ui.marks[c.index] === 'pass' ? 'off' : '', { 'aria-pressed': String(ui.marks[c.index] === 'pass') }));
      return card(c, { tag: c.index === pinned ? 'Your pick from last round' : null, actions });
    });
    const ready = marked > 0 || (s.round > 0 && open === 0);
    const go = btn('Continue', async () => {
      const kept = shown.filter(c => choosable(c) && ui.marks[c.index] === 'keep').map(c => c.index);
      const duds = shown.filter(c => choosable(c) && (ui.marks[c.index] === 'pass' || (ui.marks[c.index] !== 'keep' && s.round > 0))).map(c => c.index);
      const broken = shown.filter(c => !choosable(c) && c.index !== pinned).map(c => c.index);
      await send({ type: 'lineup', kept, duds: [...duds, ...broken], order: shown.map(c => c.index) });
    }, 'primary', { disabled: !ready, 'data-gate': '1' });
    return [briefBlock(), rateControl(), cards, h('div', { class: 'actionbar' }, go,
      h('span', { class: 'quiet', text: ready ? marked + ' kept' : 'Keep at least one draft to continue' }))];
  }

  function duelPosition(pair) {
    const key = data.session.id + ':' + pair[0] + '-' + pair[1];
    if (!ui.positions[key]) {
      let saved = null;
      if (store) { try { saved = store.getItem('prose-pos-' + key); } catch { saved = null; } }
      ui.positions[key] = saved === 'ab' || saved === 'ba' ? saved : pickPosition();
      if (store) { try { store.setItem('prose-pos-' + key, ui.positions[key]); } catch { /* memory only */ } }
    }
    return ui.positions[key];
  }

  function duelScreen() {
    const s = data.state;
    const pair = data.pair;
    if (!pair) return [h('p', { class: 'quiet', text: 'Getting the next pair ready...' })];
    const n = s.shortlist.length;
    const position = duelPosition(pair);
    const order = position === 'ab' ? pair : [pair[1], pair[0]];
    setTitle('Which one reads better?', 'Pair ' + (s.duels.length + 1) + ' of ' + (n * (n - 1)) / 2);
    const choose = choice => () => send({ type: 'duel', a: pair[0], b: pair[1], outcome: translateOutcome(choice, position), position });
    const cards = order.map((idx, side) => {
      const c = candidateOf(idx);
      return card(c, {
        // On a wide screen the choice sits in each card; on a narrow one the cards stack and it moves to the bar below.
        actions: h('div', { class: 'row grow duel-pick' }, btn('This one', choose(side === 0 ? 'left' : 'right'), 'primary', { 'data-gate': '1' })),
      });
    });
    const bar = duelBar(order.map(idx => (candidateOf(idx) || {}).label || '?')).map(b =>
      btn(b.text, choose(b.choice), b.pick ? 'primary bar-pick' : '', { 'data-gate': '1', ...(b.pick ? { 'aria-label': 'Choose ' + b.text.toLowerCase() } : {}) }));
    return [briefBlock(), rateControl(), h('div', { class: 'duel-grid' }, cards), h('div', { class: 'actionbar' }, bar)];
  }

  function refineScreen() {
    const s = data.state;
    const champ = candidateOf(s.champion);
    setTitle('Your favorite so far', 'Tell the writer what to try next, or ship this one.');
    const out = [briefBlock()];
    if (champ) out.push(card(champ, { tag: 'Winning so far', noChange: false }));
    const chips = data.directions.map(d => {
      const on = ui.directions.includes(d);
      return btn(d, () => {
        if (on) ui.directions = ui.directions.filter(x => x !== d);
        else if (ui.directions.length < 4) ui.directions = [...ui.directions, d];
        render();
      }, '', { 'aria-pressed': String(on), disabled: !on && ui.directions.length >= 4 });
    });
    out.push(h('h2', { text: 'Which way next?' }), h('p', { class: 'quiet', text: 'Pick up to four. ' + ui.directions.length + ' chosen.' }), h('div', { class: 'chips', role: 'group', 'aria-label': 'Directions' }, chips));
    const others = s.shortlist.filter(i => i !== s.champion).map(candidateOf).filter(Boolean);
    if (others.length) {
      const select = h('select', { id: 'like', on: { change: () => { ui.like = select.value; } } },
        h('option', { value: '', text: 'No particular one' }),
        others.map(c => h('option', { value: String(c.index), text: 'Draft ' + c.label })));
      select.value = ui.like;
      out.push(h('div', { class: 'row' }, h('label', { for: 'like', text: 'More like this one: ' }), select));
    }
    if (s.notes.length) out.push(h('p', { class: 'quiet', text: 'Your ' + s.notes.length + (s.notes.length === 1 ? ' note goes' : ' notes go') + ' along with the request.' }));
    out.push(h('div', { class: 'actionbar' },
      btn('Send to the writer', () => send({ type: 'refine', champion: s.champion, directions: ui.directions, like: ui.like ? Number(ui.like) : null }), 'primary', { 'data-gate': '1' }),
      btn('Ship it', () => { ui.confirmShip = true; render(); }, '', { 'data-gate': '1' })));
    if (ui.confirmShip && champ) {
      out.push(h('div', { class: 'confirm', role: 'alertdialog', 'aria-label': 'Confirm your choice' },
        h('p', { text: 'Ship draft ' + champ.label + ' as your final choice? This is the end of the session, and it can\'t be undone.' }),
        h('div', { class: 'row' },
          btn('Yes, ship it', () => send({ type: 'ship', champion: s.champion }), 'primary', { 'data-gate': '1' }),
          btn('Not yet', () => { ui.confirmShip = false; render(); }))));
    }
    return out;
  }

  function waitingScreen() {
    setTitle('Your writer is working on the next round', 'You can leave this page open. It updates by itself.');
    return [h('div', { class: 'center' }, h('span', { class: 'pulse', 'aria-hidden': 'true' }), h('p', { class: 'quiet', text: 'Waiting for new drafts...' }))];
  }

  function labelFor(index) { const c = candidateOf(index); return c ? 'draft ' + c.label : 'draft ' + index; }

  function revealScreen() {
    setTitle('Your choice', 'Here is what your writer guessed before you chose.');
    const box = h('div', { class: 'reveal' });
    const fill = r => {
      box.replaceChildren();
      revealParts(r, labelFor, r.setId === data.session.setId, 'You chose ' + labelFor(r.picked) + '.')
        .forEach(part => box.append(h('p', { class: part.cls, text: part.text })));
    };
    if (ui.reveal && ui.revealFor === signature(data)) fill(ui.reveal);
    else {
      box.append(h('p', { class: 'quiet', text: 'Opening the sealed guess...' }));
      const sig = signature(data);
      request('GET', '/api/session/' + sessionId + '/reveal').then(res => {
        if (res.ok) { ui.reveal = res.body; ui.revealFor = sig; fill(res.body); }
        else { box.replaceChildren(h('p', { text: 'You chose ' + labelFor(data.state.shipped) + '.' }), h('p', { class: 'quiet', text: 'The sealed guess is not available.' })); }
      }).catch(() => { box.replaceChildren(h('p', { text: 'You chose ' + labelFor(data.state.shipped) + '.' }), h('p', { class: 'quiet', text: 'Could not reach the server for the sealed guess. Reload to try again.' })); });
    }
    return [box];
  }

  function render() {
    if (!data) return;
    stopSpeech();
    unitEls.clear(); controlEls.clear(); timingEls.clear();
    renderedSig = signature(data);
    const stage = data.state.stage;
    if (stage !== 'refine') ui.confirmShip = false;
    app.className = stage === 'duel' ? 'wide' : '';
    let screen;
    if (stage === 'lineup') screen = lineupScreen();
    else if (stage === 'duel') screen = duelScreen();
    else if (stage === 'refine') screen = refineScreen();
    else if (stage === 'waiting') screen = waitingScreen();
    else if (stage === 'shipped') screen = revealScreen();
    else { setTitle('This session is closed', ''); screen = [h('p', { text: 'Thanks for reading. Your writer closed this session, so there is nothing more to do here.' })]; }
    const prompt = data.session.prompt && stage !== 'shipped' && stage !== 'abandoned' ? h('p', { class: 'quiet', text: data.session.prompt }) : null;
    app.replaceChildren(...[prompt, ...screen].flat(2).filter(Boolean));
    updatePlayState();
  }

  // ---- start ----

  function boot() {
    if (!sessionId) { showMessage('Reading', 'Open the link your writer gave you to start reading.'); return; }
    if (!auth.token) { showMessage('This link is missing its key', 'Ask your writer for a fresh link.'); return; }
    // The token moves into session storage and out of the visible address; if storage is unavailable it stays in the URL.
    if (auth.fromUrl && auth.persisted) { try { window.history.replaceState(null, '', window.location.pathname); } catch { /* keep the URL */ } }
    checkSpeech();
    load().then(schedule);
  }

  boot();
}());
