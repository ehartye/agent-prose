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

  /**
   * The brief folded to one line: the character's first sentence, else the context's, else nothing. The page clips it to
   * the width with CSS; this only picks the words.
   */
  function briefGist(b) {
    const text = String((b && (b.character || b.context)) || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(text);
    return m ? m[0] : text;
  }

  /**
   * The existing line as the page shows it: one row per line, `Speaker: text` as units read, plus a muted note when the
   * draft has changed since the set was made. Null when the set records no original. Display only.
   */
  function originalParts(o) {
    if (!o || !Array.isArray(o.lines) || !o.lines.length) return null;
    return { rows: o.lines.map(l => (l.speaker ? l.speaker + ': ' : '') + l.text), note: o.stale ? 'The draft has changed since this set was made' : null };
  }

  /**
   * The reasons a line can be struck for, in the order the picker offers them. `id` is what the server takes; `label` is
   * what the owner reads. None is preselected: the owner says why.
   */
  const STRIKE_REASONS = [
    { id: 'wrong-direction', label: 'Wrong direction' },
    { id: 'faulty-premise', label: 'Faulty premise' },
    { id: 'not-worth-rewrite', label: 'Not worth rewriting' },
  ];
  const MAX_NOTE = 500;
  const reasonLabel = id => { const r = STRIKE_REASONS.find(x => x.id === id); return r ? r.label : String(id); };

  /** The strike on a line (current ones only: a stale strike names a line of an older draft), or undefined. */
  const strikeOn = (draft, ref) => (draft && Array.isArray(draft.strikes) ? draft.strikes.find(s => s.ref === ref && !s.stale) : undefined);
  const staleStrikes = draft => (draft && Array.isArray(draft.strikes) ? draft.strikes.filter(s => s.stale) : []);

  /**
   * The pending bar's words: how many lines are struck and, when some were struck against an older draft, that they can
   * only be undone. Null when nothing is struck. Nothing is removed from the draft by a strike: that takes Review and apply.
   */
  function pendingSummary(draft) {
    const n = draft && Array.isArray(draft.strikes) ? draft.strikes.length : 0;
    if (n === 0) return null;
    const stale = staleStrikes(draft).length;
    return {
      count: n, stale,
      text: n === 1 ? '1 line struck' : n + ' lines struck',
      note: stale
        ? 'The draft changed since ' + stale + ' of these ' + (stale === 1 ? 'was' : 'were') + ' struck. Undo ' + (stale === 1 ? 'it' : 'them') + ' and strike again.'
        : 'Struck lines stay in the draft until you review and apply them.',
    };
  }

  /** True when the strikes can be applied: some are struck, none is stale, and the draft can still change. */
  const applyReady = draft => !!(draft && draft.editable && Array.isArray(draft.strikes) && draft.strikes.length > 0 && !draft.strikes.some(s => s.stale));

  /** The latest removal that can still be undone ("Removed 3 lines"), or null: the server only sends it while the draft is as that apply left it. */
  function appliedSummary(draft) {
    const a = draft && draft.editable ? draft.applied : null;
    return a ? { id: a.id, text: 'Removed ' + a.count + (a.count === 1 ? ' line' : ' lines') } : null;
  }

  /** One row of the apply plan as words: where, the exact text, why, and what else goes with it. The text is shown as text, never parsed. */
  function removalParts(row) {
    const where = row.start === row.end ? 'Line ' + row.start : 'Lines ' + row.start + '-' + row.end;
    const text = row.kind === 'blank' ? '' : String(row.text);
    let extra = null;
    if (row.kind === 'cue') extra = 'Also removes the speaker cue ' + text.trim();
    else if (row.kind === 'blank') extra = 'Also removes a blank line, so the spacing stays even';
    else if (row.kind === 'key') extra = 'Also removes the list heading ' + text.trim() + ' that is left empty';
    return { where, text, extra, reason: row.reason ? reasonLabel(row.reason) : null, note: row.note || null };
  }

  /** The heading and the button of a plan: how many struck lines go. */
  const planTitle = plan => 'Remove ' + plan.count + (plan.count === 1 ? ' line' : ' lines') + ' from the draft?';
  const planButton = plan => 'Remove ' + plan.count + (plan.count === 1 ? ' line' : ' lines');

  /** The body of a strike request, or null when the pick is not complete (no reason, a note that is too long). The draft path never goes to the server. */
  function strikeBody(draft, pick, eventId) {
    if (!draft || !pick || !STRIKE_REASONS.some(r => r.id === pick.reason)) return null;
    const note = String(pick.note || '').trim();
    if (note.length > MAX_NOTE) return null;
    return { ref: pick.ref, reason: pick.reason, ...(note ? { note } : {}), draftHash: draft.hash, eventId };
  }

  /** What is on screen: stage, round, event count, the brief, the existing line (an edit of either, or a stale draft, re-renders) and the draft's rev (its strikes and hash). */
  const signature = p => p.state.stage + '|' + p.state.round + '|' + p.state.events + '|' + (p.session && p.session.brief ? JSON.stringify([p.session.brief.character, p.session.brief.context, !!p.session.brief.confirmed]) : '')
    + (p.session && p.session.original ? '|' + JSON.stringify([p.session.original.stale, p.session.original.lines.map(l => [l.speaker, l.text])]) : '')
    + (p.draft ? '|' + p.draft.rev : '')
    + (p.queue ? '|' + JSON.stringify([p.queue.status, p.queue.stage, p.queue.choice, p.queue.message || '', p.queue.sentVariant]) : '');

  // ---- the compare grid: pure helpers (the server sends the aligned rows and the word ops; the page only folds and renders) ----

  /** Variants shown side by side at once: three beside a Current column, four without. */
  const compareLimit = hasCurrent => (hasCurrent ? 3 : 4);

  /**
   * The variants on screen, as keys in display order. `recent` is the owner's picks, oldest first (null: nothing chosen yet, so
   * the first ones in display order). Never more than `limit`; the most recently chosen win.
   */
  function shownKeys(allKeys, recent, limit) {
    const want = (recent || []).filter(k => allKeys.includes(k));
    const picked = want.length ? want.slice(-limit) : allKeys.slice(0, limit);
    return allKeys.filter(k => picked.includes(k));
  }

  /** The picks after the owner presses `key`: a shown one is hidden (never the last one), a hidden one is shown and, at the limit, the least recently chosen goes. */
  function togglePicked(allKeys, recent, key, limit) {
    const now = shownKeys(allKeys, recent, limit);
    if (now.includes(key)) return now.length > 1 ? now.filter(k => k !== key) : now;
    return [...now, key].slice(-limit);
  }

  const normCell = c => (c ? (c.speaker || '') + '\u0000' + String(c.text).replace(/\s+/g, ' ').trim() : null);

  /** True when the row reads the same in every visible column (and in Current, when it is shown): such rows fold. A line that was struck before the set was made, an added line and a removed line never fold. */
  function rowIsSame(row, keys, hasCurrent) {
    if (row.base === null || !row.cur || row.cur.struck) return false;
    const cur = normCell(row.cur);
    const seen = hasCurrent ? [cur] : [];
    for (const k of keys) {
      const cell = row.cells ? row.cells[k] : undefined;
      if (cell === undefined) seen.push(cur);
      else if (cell === null || cell.struck) return false;
      else seen.push(normCell(cell));
    }
    return seen.every(x => x === seen[0]);
  }

  /** An insertion row (a line only some variants add) matters only when a visible variant has a line on it. */
  const rowShown = (row, keys) => row.base !== null || keys.some(k => row.cells && row.cells[k]);

  /** The rows as segments: a plain row, or one fold for each run of rows that are the same in every visible column. */
  function foldSegments(rows, keys, hasCurrent) {
    const out = [];
    for (const row of rows) {
      if (rowIsSame(row, keys, hasCurrent)) {
        const last = out[out.length - 1];
        if (last && last.fold) last.rows.push(row); else out.push({ fold: true, rows: [row], id: row.base });
      } else out.push({ fold: false, row });
    }
    return out;
  }

  /** Where a fold of rows begins and ends, in words: "Overseer, line 3 - Overseer, line 5". */
  function foldLabel(rows) {
    const at = r => (r.cur.speaker ? r.cur.speaker + ', ' : '') + 'line ' + (r.base + 1);
    const n = rows.length;
    return { text: n + (n === 1 ? ' line unchanged' : ' lines unchanged'), where: n === 1 ? at(rows[0]) : at(rows[0]) + ' - ' + at(rows[n - 1]) };
  }

  /** For each row, the unit index of the variant's line on it (-1 when it has none): lines run in order, so it is a running count. */
  function unitMap(rows, key) {
    let n = 0;
    return rows.map(r => { const c = r.cells ? r.cells[key] : undefined; if (c === null) return -1; return n++; });
  }

  const tokenCount = s => String(s).trim().split(/\s+/).filter(Boolean).length;

  /** How many of a variant's words are new against the base: every word of an added line (with its speaker), and the `+` words of a changed one. */
  function newWords(rows, key) {
    let n = 0;
    for (const r of rows) {
      const c = r.cells ? r.cells[key] : undefined;
      if (!c) continue;
      if (c.ops) n += c.ops.reduce((t, op) => t + (op[0] === '+' ? tokenCount(op[1]) : 0), 0);
      else if (r.base === null) n += tokenCount((c.speaker || '') + ' ' + c.text);
    }
    return n;
  }

  /**
   * The Current cell's words as runs. A word every visible variant cut is `all` (struck solid); one only some cut is `some`
   * (struck dashed, with the letters of who cut it); the rest are plain. `visible` is [{ label, cell }]: a missing cell is
   * "unchanged", null is "this variant has no such line" (every word cut). A cell whose ops do not describe this text cuts nothing.
   */
  function curRuns(text, visible) {
    const toks = String(text).trim().split(/\s+/).filter(Boolean);
    const cutBy = toks.map(() => []);
    for (const v of visible) {
      if (v.cell === null) { cutBy.forEach(a => a.push(v.label)); continue; }
      if (!v.cell || !v.cell.ops) continue;
      let i = 0;
      const mine = [];
      for (const op of v.cell.ops) {
        if (op[0] === '+') continue;
        const n = tokenCount(op[1]);
        if (op[0] === '-') for (let j = 0; j < n; j++) mine.push(i + j);
        i += n;
      }
      if (i === toks.length) mine.forEach(j => cutBy[j].push(v.label));
    }
    const runs = [];
    toks.forEach((t, i) => {
      const by = cutBy[i];
      const cut = by.length === 0 ? null : by.length === visible.length ? 'all' : 'some';
      const last = runs[runs.length - 1];
      if (last && last.cut === cut && last.by.join() === by.join()) last.text += ' ' + t;
      else runs.push({ text: t, cut, by });
    });
    return runs.map((r, i) => ({ ...r, text: i < runs.length - 1 ? r.text + ' ' : r.text }));
  }

  /** What a variant cell shows: plain runs and new runs (the cut words are only ever shown struck on the Current line). */
  function cellRuns(cell, isNewLine) {
    if (!cell) return [];
    if (cell.ops) return cell.ops.filter(op => op[0] !== '-').map(op => ({ text: op[1], fresh: op[0] === '+' }));
    return [{ text: cell.text, fresh: !!isNewLine }];
  }

  /** A column's state words, never only a mark: Your pick from last round / Kept / Passed. */
  const stateWord = (state, batchItem) => (state === 'keep' ? (batchItem ? 'Your pick' : 'Kept') : state === 'pass' ? 'Passed' : '');

  /** True only when the browser has a speech synthesizer object and an utterance constructor (the property alone can be undefined). */
  const speechSupported = win => !!(win && win.speechSynthesis && typeof win.SpeechSynthesisUtterance === 'function');

  // ---- batch review: pure helpers (the queue's rail, the tally, the staged choice, the keys) ----

  const queueIdFromPath = path => { const m = /^\/q\/([a-z0-9-]+)\/?$/.exec(path || ''); return m ? m[1] : null; };
  /** Items the rail shows at once; the pager steps by this many. */
  const RAIL_PAGE = 10;
  /** An item the owner has not chosen for yet (a skipped one comes back, a blocked one needs another try). */
  const isUndecided = status => status === 'waiting' || status === 'skipped' || status === 'blocked';

  /** "N of M chosen", then, only once something is chosen, what has and has not been sent. Nothing is sent until the owner presses Send picks. */
  function tallyText(counts, total) {
    const chosen = counts.picked + counts.sent;
    const head = chosen + ' of ' + total + ' chosen';
    if (chosen === 0) return head;
    if (counts.sent === 0) return head + ' - nothing sent until you press Send picks';
    if (counts.picked > 0) return head + ' - ' + counts.sent + ' sent, ' + counts.picked + ' not sent yet';
    return head + ' - ' + counts.sent + ' sent';
  }

  /** The rail's own count line: chosen, and how many are skipped (they come back at the end) or blocked. */
  function railSummary(counts, total) {
    const bits = [(counts.picked + counts.sent) + ' of ' + total + ' chosen'];
    if (counts.skipped) bits.push(counts.skipped + ' skipped, back at the end');
    if (counts.blocked) bits.push(counts.blocked + ' blocked');
    return bits.join('. ');
  }

  /** The words beside an item's mark, so the state is never a colour or a shape alone. */
  function statusWord(item) {
    const letter = item.picked ? ' ' + item.picked : '';
    switch (item.status) {
      case 'picked': return 'Picked' + letter + ', not sent';
      case 'sent': return item.via === 'cli' ? 'Picked' + letter + ' outside this page' : 'Sent' + letter;
      case 'skipped': return 'Skipped';
      case 'blocked': return 'Blocked: ' + (item.message || 'could not be sent');
      case 'ended': return 'Closed';
      default: return 'Waiting';
    }
  }

  /** The whole state of a rail item for a screen reader, with its place in the queue. */
  const railLabel = (item, pos, total) => item.who + ', ' + item.where + ', ' + statusWord(item).toLowerCase() + ', item ' + pos + ' of ' + total;

  /** The next item after `cur` in rail order, wrapping, that is still undecided; null when there is no other one. `items` is indexed by item number - 1. */
  function nextUnchosen(order, items, cur) {
    const at = order.indexOf(cur);
    for (let k = 1; k <= order.length; k++) {
      const n = order[(at + k) % order.length];
      if (n !== cur && items[n - 1] && isUndecided(items[n - 1].status)) return n;
    }
    return null;
  }

  /** The neighbour of `cur` in rail order (by = 1 next, -1 previous); null at either end (j and k do not wrap). */
  function stepItem(order, cur, by) {
    const to = order.indexOf(cur) + by;
    return order.indexOf(cur) < 0 || to < 0 || to >= order.length ? null : order[to];
  }

  const railPageOf = (order, cur) => Math.max(0, Math.floor(order.indexOf(cur) / RAIL_PAGE));
  /** The items on one page of the rail (the page is clamped), with the page count. */
  function railWindow(order, page) {
    const pages = Math.max(1, Math.ceil(order.length / RAIL_PAGE));
    const p = Math.min(Math.max(0, page), pages - 1);
    return { page: p, pages, from: p * RAIL_PAGE, ns: order.slice(p * RAIL_PAGE, (p + 1) * RAIL_PAGE) };
  }

  /** Keep is a radio in a batch: keeping the kept draft clears it, keeping another replaces it; a kept draft is never also passed. */
  function keepChoice(choice, index) {
    return { variant: choice.variant === index ? null : index, passes: choice.passes.filter(p => p !== index) };
  }
  /** Pass toggles; passing the kept draft takes the keep away. */
  function passChoice(choice, index) {
    const has = choice.passes.includes(index);
    return { variant: choice.variant === index ? null : choice.variant, passes: has ? choice.passes.filter(p => p !== index) : [...choice.passes, index] };
  }
  /** The column marks a staged choice shows: { index: 'keep' | 'pass' }. */
  function marksFromChoice(choice) {
    const out = {};
    for (const p of choice.passes) out[p] = 'pass';
    if (choice.variant !== null) out[choice.variant] = 'keep';
    return out;
  }
  const noChoice = choice => choice.variant === null && choice.passes.length === 0;

  /** The first words of a draft for the Send review: units joined, cut at 60 characters. */
  function previewText(units) {
    const t = (units || []).map(u => String(u).trim()).filter(Boolean).join(' ');
    return t.length > 60 ? t.slice(0, 60).trimEnd() + '...' : t;
  }

  /** What a variant changed, for the Send review: its first changed or added line from the compare rows, else its own units (a whole-draft copy would otherwise start with the draft's opening). */
  function changedUnits(payload, index) {
    const key = String(index);
    if (payload.compare && Array.isArray(payload.compare.rows)) {
      for (const row of payload.compare.rows) {
        const cell = row.cells ? row.cells[key] : undefined;
        if (cell && (cell.ops || row.base === null)) return [(cell.speaker ? cell.speaker + ': ' : '') + cell.text];
      }
    }
    const c = (payload.candidates || []).find(x => x.index === index);
    return (c && c.units) || [];
  }

  /** One line of the Send review: where, which draft and how it starts. */
  const reviewLine = (item, label, units) => item.who + ' (' + item.where + '): ' + label + ' - ' + previewText(units);

  /**
   * What a key does on the desk, or null. Plain keys only: never in a field (`inField`), never with Ctrl, Alt or Meta held
   * (except Ctrl or Cmd+Enter), and none of them at all once the owner turns shortcuts off (Escape and Ctrl/Cmd+Enter still
   * work, they are not single characters). `st`: { keysOn, batch, panel: null | 'send' | 'finish' | 'help' }.
   */
  function keyAction(ev, st) {
    if (ev.key === 'Escape') return st.panel ? { action: 'close' } : null;
    if (ev.inField || ev.altKey) return null;
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') return st.batch ? { action: st.panel === 'send' ? 'confirm' : 'review' } : null;
    if (!st.keysOn || ev.ctrlKey || ev.metaKey) return null;
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (k === '?') return { action: 'help' };
    if (!st.batch) return null;
    const plain = { j: 'next', k: 'previous', n: 'unchosen', s: 'skip', u: 'clear', e: 'fold', b: 'brief' };
    if (Object.prototype.hasOwnProperty.call(plain, k) && !ev.shiftKey) return { action: plain[k] };
    if (/^[a-f]$/.test(k)) return { action: ev.shiftKey ? 'pass' : 'keep', letter: k.toUpperCase() };
    return null;
  }

  const SPEECH_IGNORED = new Set(['interrupted', 'canceled']);
  const backoff = (fails, base) => (fails ? Math.min(30000, 2000 * 2 ** Math.min(fails, 4)) : base);

  if (window.__READING_TEST__) {
    window.__reading = { wordCount, formatClock, timingModel, timingText, pickPosition, translateOutcome, duelBar, newEventId, lineupHint, resolveToken, sessionIdFromPath, paragraphsOf, briefParts, briefGist, originalParts, signature, STRIKE_REASONS, reasonLabel, strikeOn, staleStrikes, pendingSummary, applyReady, appliedSummary, removalParts, planTitle, planButton, strikeBody, backoff, revealParts, speechSupported, SPEECH_IGNORED, queueIdFromPath, RAIL_PAGE, isUndecided, tallyText, railSummary, statusWord, railLabel, nextUnchosen, stepItem, railPageOf, railWindow, keepChoice, passChoice, marksFromChoice, noChoice, previewText, reviewLine, changedUnits, keyAction, compareLimit, shownKeys, togglePicked, rowIsSame, rowShown, foldSegments, foldLabel, unitMap, newWords, curRuns, cellRuns, stateWord };
    return;
  }

  // ---- state ----

  const store = (() => { try { const s = window.sessionStorage; s.getItem(TOKEN_KEY); return s; } catch { return null; } })();
  const auth = resolveToken(window.location.search, store);
  const sessionId = sessionIdFromPath(window.location.pathname);
  const batchId = queueIdFromPath(window.location.pathname);
  const batch = batchId !== null;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let data = null;       // the last payload
  let renderedSig = '';  // what is on screen: stage, round and event count
  let fails = 0;
  let timer = null;
  let busy = false;
  let fatal = false;
  const ui = {
    marks: {}, marksRound: -1, selected: null, noteDraft: '', rate: 1, directions: [], like: '', confirmShip: false,
    showChange: {}, measured: {}, reveal: null, revealFor: '', speech: null, positions: {}, briefOpen: false, originalOpen: true,
    view: 'variants', pick: null, plan: null,
    cmp: { recent: null, phone: null, open: new Set() }, drawn: {},
    // a batch: the rail, the open item, the Send and Finish panels, the shortcut switch, items already fetched
    cur: null, entered: null, rail: null, railSig: '', railPage: 0, panel: null, sending: false, sendTotal: 0, sendBase: 0, itemError: null,
    keys: readKeys(), cache: new Map(), prefetched: new Set(),
  };
  /** The shortcut switch is remembered in this browser only; storage may be unavailable. */
  function readKeys() { try { return window.localStorage.getItem('prose-keys') !== 'off'; } catch { return true; } }
  function saveKeys(on) { try { window.localStorage.setItem('prose-keys', on ? 'on' : 'off'); } catch { /* not remembered */ } }
  /** Where the open item's requests go: its own session, or its place in the queue (never a session id the page chose). */
  const base = () => (batch ? '/api/queue/' + batchId + '/item/' + ui.cur : '/api/session/' + sessionId);
  /** What is on screen: the item's own signature, the rail's, and which item. */
  const fullSig = p => signature(p) + (batch ? '|' + ui.railSig + '|' + ui.cur : '');

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
  const btn = (text, onClick, cls, extra, ...kids) => h('button', { type: 'button', class: cls || '', text, on: { click: onClick }, ...(extra || {}) }, ...kids);

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
    const changed = fullSig(p) !== renderedSig;
    data = p;
    if (quiet) { renderedSig = fullSig(p); return; }
    if (changed) render();
    // The plan on screen belongs to one draft and one set of strikes; when either moves, show the new plan instead of a stale one.
    if (ui.plan && !ui.plan.busy && !ui.plan.loading && p.draft && ui.plan.rev !== p.draft.rev) openPlan('The draft or the strikes changed, so this is the new list. Nothing has been removed.');
  }

  async function load() {
    if (batch) return loadBatch();
    if (!sessionId) return;
    try {
      const res = await request('GET', base());
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
    // a batch polls the rail (and the open item) every 8 s, every 2 s while picks are being sent
    const every = (data && data.state.stage === 'waiting') || ui.sending ? 2000 : 8000;
    timer = setTimeout(async () => { await load(); schedule(); }, backoff(fails, every));
  }

  /** Send an owner event. Returns true when the server took it. */
  async function send(event, opts) {
    const gate = !(opts && opts.quiet); // a quiet send (a play note) never blocks the owner's next tap
    if (gate && busy) return false;
    if (gate) { busy = true; setBusy(true); }
    try {
      const res = await post(base() + '/event', JSON.stringify({ ...event, eventId: newEventId(window.crypto) }));
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
  function setBusy(on) { for (const b of app.querySelectorAll('button[data-gate]')) b.disabled = on || b.hasAttribute('data-hold'); }

  /** Strike a line or take a strike back. Gated like a judgement; a 409 or 404 reloads the page state, as send() does. Returns true when the server took it. */
  async function strikeSend(suffix, body) {
    if (busy) return false;
    busy = true; setBusy(true);
    try {
      const res = await post(base() + '/strike' + suffix, JSON.stringify(body));
      if (res.ok && res.body && res.body.state) { hideNotice(); showBanner(false); apply(res.body.state); return true; }
      showProblem(res);
      if (res.status === 409 || res.status === 404) await load();
      return false;
    } catch {
      showBanner(true);
      return false;
    } finally {
      busy = false; setBusy(false);
    }
  }
  const clearStrike = id => strikeSend('/clear', { strike: id, eventId: newEventId(window.crypto) });
  const undoRemoval = applied => strikeSend('/undo', { apply: applied.id, eventId: newEventId(window.crypto) });

  /**
   * Ask the server for the plan (the exact text each strike would remove) and show it. Nothing is removed here: the plan
   * is read only. `why` says why the owner is looking at a new plan.
   */
  async function openPlan(why) {
    if (!data || !data.draft) return;
    const rev = data.draft.rev;
    ui.plan = { loading: true, rev, why: why || null, busy: false, plan: null };
    render();
    try {
      const res = await request('GET', base() + '/strike/preview');
      if (!ui.plan) return;
      if (res.ok && res.body) { ui.plan = { loading: false, rev, why: why || null, busy: false, plan: res.body }; hideNotice(); }
      else { ui.plan = null; showProblem(res); await load(); }
    } catch { ui.plan = null; showBanner(true); }
    render();
  }

  /** Remove the lines the plan shows: the digest of that exact plan goes to the server, which hands it to the CLI. */
  async function confirmPlan() {
    const cur = ui.plan;
    if (!cur || !cur.plan || busy) return;
    busy = true; setBusy(true); cur.busy = true;
    try {
      const res = await post(base() + '/strike/apply', JSON.stringify({ digest: cur.plan.digest, eventId: newEventId(window.crypto) }));
      if (res.ok && res.body && res.body.state) { hideNotice(); showBanner(false); ui.plan = null; ui.view = 'draft'; apply(res.body.state); render(); return; }
      cur.busy = false;
      busy = false; setBusy(false);
      const msg = res.body && res.body.error && res.body.error.message;
      if (res.status === 409) { await openPlan((msg ? msg + '. ' : '') + 'Here is the current list; nothing was removed.'); return; }
      showProblem(res);
    } catch { cur.busy = false; showBanner(true); }
    finally { busy = false; setBusy(false); }
  }

  function closePlan() {
    ui.plan = null;
    render();
    const again = app.querySelector('[data-role="review"]');
    if (again) again.focus();
  }

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
    for (const els of unitEls.values()) for (const el of els) if (el) el.classList.remove('speaking');
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
    const item = batch && ui.rail ? ui.rail.items[ui.cur - 1] : null;
    if (item) {
      // The title row of a batch item reads "who - where", with its place in the queue and what the screen asks of the owner beside it.
      const pos = ui.rail.order.indexOf(ui.cur) + 1;
      const heading = item.who + ' - ' + item.where;
      $('title').textContent = heading;
      $('subtitle').textContent = 'Item ' + pos + ' of ' + ui.rail.items.length + '. ' + (sub || title);
      document.title = heading;
      return;
    }
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
        mark.style.setProperty('--at', String(Math.min(100, (m.targetSeconds / top) * 100)));
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
    const struck = new Set(Array.isArray(c.struck) ? c.struck : []);
    const box = h('div', { class: 'reading' });
    const lines = c.layout === 'lines';
    if (lines) box.classList.add('lines');
    paragraphsOf(units, c.breaks).forEach(group => {
      const p = h('p', { class: lines ? 'stanza' : undefined });
      group.forEach((i, k) => {
        const selected = ui.selected && ui.selected.index === c.index && ui.selected.unit === i;
        const span = h('span', {
          class: 'unit' + (noted.has(i) ? ' noted' : '') + (selected ? ' selected' : '') + (struck.has(i) ? ' struck' : ''),
          text: units[i], ...(batch ? {} : { role: 'button', tabindex: '0' }),
          'aria-label': noted.has(i) ? 'Sentence with a note: ' + units[i] : (struck.has(i) ? 'Struck line, kept as it was: ' + units[i] : undefined),
          on: batch ? {} : {
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
    const kids = [h('div', { class: 'card-head' }, h('span', { class: 'label', text: c.label, 'aria-label': 'Draft ' + c.label }),
      o.tag ? h('span', { class: 'tag', text: o.tag }) : null,
      o.state ? h('span', { class: 'state-word', text: o.state === 'keep' ? 'Kept' : 'Passed' }) : null)];
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
    return h('article', { class: 'card' + (o.state === 'keep' ? ' kept' : o.state === 'pass' ? ' passed' : ''), 'data-index': String(c.index) }, kids);
  }

  /** "The brief": who speaks and where the line lands, folded to one line above the variants; open, it shows Character and Context in two columns. Display only. */
  function briefBlock() {
    const parts = briefParts(data.session.brief);
    if (!parts) return null;
    const el = h('details', { class: 'brief', open: ui.briefOpen },
      h('summary', null,
        h('b', { text: 'The brief' }),
        h('span', { class: 'gist', text: briefGist(data.session.brief) }),
        parts.note ? h('span', { class: 'chip brief-note', text: parts.note }) : null),
      h('div', { class: 'body' }, parts.rows.map(r => h('div', null, h('h3', { text: r.label }), h('p', { text: r.text })))));
    el.addEventListener('toggle', () => { ui.briefOpen = el.open; });
    return el;
  }

  /** "The current line": what the set was asked to improve, open above the variants. Context only: no controls, no notes. */
  function originalBlock() {
    const parts = originalParts(data.session.original);
    if (!parts) return null;
    const el = h('details', { class: 'original', open: ui.originalOpen },
      h('summary', { text: 'The current line' }),
      parts.rows.map(row => h('p', { class: 'original-line', text: row })),
      parts.note ? h('p', { class: 'quiet original-note', text: parts.note }) : null);
    el.addEventListener('toggle', () => { ui.originalOpen = el.open; });
    return el;
  }

  // ---- the compare grid (the lineup): the current line and the variants as aligned columns ----

  const SVG_NS = 'http://www.w3.org/2000/svg';
  /** An SVG element, made with createElementNS: no markup is parsed, and the CSP needs no inline style (the paths are drawn by a class). */
  function svg(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
    for (const kid of kids) el.appendChild(kid);
    return el;
  }
  const CIRCLE = 'M20 3C9 3 2 11 3 21c1 10 9 17 19 16 11-1 16-9 15-19C36 9 28 2 18 4c-3 .6-5 1.600-7 3';
  const SLASH = 'M4 36L36 4';
  /** The pencil marks: a circle (kept) and a slash (passed), decorative; the state is also in words. */
  const pencil = kind => svg('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true', focusable: 'false' }, svg('path', { class: kind, pathLength: '1', d: kind === 'circle' ? CIRCLE : SLASH }));
  const sr = text => h('span', { class: 'sr-only', text });
  const phoneQuery = window.matchMedia ? window.matchMedia('(max-width: 899px)') : null;
  const isPhone = () => !!(phoneQuery && phoneQuery.matches);
  if (phoneQuery) phoneQuery.addEventListener('change', () => { if (data && !fatal) render(); });

  /** The Current cell's words: struck solid when every visible variant cut them, dashed when only some did. */
  function curNodes(cell, visible, same) {
    const runs = same ? [{ text: cell.text, cut: null, by: [] }] : curRuns(cell.text, visible);
    return runs.map(run => {
      if (!run.cut) return run.text;
      if (run.cut === 'all') return h('del', { class: 'cut' }, sr('cut: '), run.text, sr(' end cut'));
      const who = 'cut in ' + run.by.join(', ');
      return h('del', { class: 'cut some', title: who }, sr(who + ': '), run.text, sr(' end cut'));
    });
  }
  /** A variant cell's words: the new ones marked, nothing else. */
  const varNodes = (cell, isNewLine) => cellRuns(cell, isNewLine).map(run => (run.fresh ? h('ins', null, sr('added: '), run.text, sr(' end added')) : run.text));

  function compareView(shown, pinned) {
    const cmp = data.compare;
    const hasCur = cmp.hasCurrent;
    const phone = isPhone();
    const allKeys = shown.map(c => String(c.index));
    const limit = phone ? 1 : compareLimit(hasCur);
    const keys = phone ? [allKeys.includes(ui.cmp.phone) ? ui.cmp.phone : allKeys[0]] : shownKeys(allKeys, ui.cmp.recent, limit);
    const colOf = k => shown.find(c => String(c.index) === k);
    const cols = keys.map(colOf);
    const stateOf = c => (c.index === pinned ? null : ui.marks[c.index] || null);
    const rowIndex = new Map(cmp.rows.map((row, i) => [row, i]));
    const maps = new Map(keys.map(k => [k, unitMap(cmp.rows, k)]));
    const noted = new Map(cols.map(c => [c.index, new Set(data.state.notes.filter(n => n.index === c.index).map(n => n.unit))]));
    const who = label => (phone ? h('span', { class: 'who', text: label }) : null);
    cols.forEach(c => unitEls.set(c.index, []));

    const curCell = row => {
      const cell = row.cur;
      if (!cell) return h('div', { class: 'cell cur gone', role: 'cell' }, who('Current'), h('span', { class: 'gone-text', text: 'No line here' }));
      const visible = keys.map(k => ({ label: colOf(k).label, cell: row.cells ? row.cells[k] : undefined }));
      return h('div', { class: 'cell cur', role: 'cell' }, who('Current'),
        cell.speaker ? h('span', { class: 'sp', text: cell.speaker }) : null,
        h('span', { class: cell.struck ? 'struck' : '' }, curNodes(cell, visible, !!row.same)));
    };
    const varCell = (row, i, c) => {
      const key = String(c.index);
      const state = stateOf(c);
      const cls = 'cell var' + (state === 'pass' ? ' passed' : '') + (state === 'keep' ? ' kept' : '');
      const cell = row.cells ? row.cells[key] : undefined;
      const src = cell === undefined ? row.cur : cell;
      if (!src) return h('div', { class: cls + ' gone', role: 'cell' }, who('Draft ' + c.label), h('span', { class: 'gone-text', text: 'Line removed' }));
      const unit = maps.get(key)[i];
      const plain = row.same || cell === undefined;
      const selected = ui.selected && ui.selected.index === c.index && ui.selected.unit === unit;
      const isNoted = noted.get(c.index).has(unit);
      const span = h('span', {
        class: 'unit' + (isNoted ? ' noted' : '') + (selected ? ' selected' : '') + (src.struck ? ' struck' : ''), ...(batch ? {} : { role: 'button', tabindex: '0' }),
        'aria-label': isNoted ? 'Line with a note: ' + src.text : (src.struck ? 'Struck line, kept as it was: ' + src.text : undefined),
        on: batch ? {} : { click: () => selectUnit(c.index, unit), keydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectUnit(c.index, unit); } } },
      }, plain ? src.text : varNodes(src, row.base === null));
      unitEls.get(c.index)[unit] = span;
      return h('div', { class: cls, role: 'cell', 'data-unit': String(unit) }, who('Draft ' + c.label), src.speaker ? h('span', { class: 'sp', text: src.speaker }) : null, span);
    };

    const dataRows = row => {
      const i = rowIndex.get(row);
      const out = [h('div', { class: 'gr', role: 'row' },
        h('div', { class: 'ln', role: 'rowheader' }, phone ? (row.base === null ? 'Added line' : 'Line ' + (row.base + 1)) : (row.base === null ? '+' : String(row.base + 1)), row.base === null && !phone ? sr(' added line') : null),
        hasCur ? curCell(row) : null, cols.map(c => varCell(row, i, c)))];
      const sel = ui.selected && cols.find(c => c.index === ui.selected.index);
      if (sel && maps.get(String(sel.index))[i] === ui.selected.unit) {
        out.push(h('div', { class: 'gr noterow', role: 'row' }, h('div', { class: 'ln', role: 'rowheader' }, sr('Note')), h('div', { class: 'notecell', role: 'cell' }, noteBox(sel))));
      }
      return out;
    };

    const segs = foldSegments(cmp.rows.filter(row => rowShown(row, keys)), keys, hasCur);
    const body = [];
    segs.forEach(seg => {
      if (!seg.fold) { body.push(...dataRows(seg.row)); return; }
      const open = ui.cmp.open.has(seg.id);
      const lab = foldLabel(seg.rows);
      const a = seg.rows[0].base + 1, z = seg.rows[seg.rows.length - 1].base + 1;
      body.push(h('div', { class: 'gr foldrow', role: 'row' },
        h('div', { class: 'ln', role: 'rowheader', text: a === z ? String(a) : a + '-' + z }),
        h('div', { class: 'fold', role: 'cell' },
          btn(lab.text + ': ' + lab.where, () => { if (open) ui.cmp.open.delete(seg.id); else ui.cmp.open.add(seg.id); render(); }, 'foldbtn', { 'aria-expanded': String(open), 'data-key': 'fold-' + seg.id }))));
      if (open) seg.rows.forEach(row => body.push(...dataRows(row)));
    });

    const colHead = c => {
      const st = stateOf(c);
      const fresh = !!st && (ui.drawn[c.index] || '') !== st;
      ui.drawn[c.index] = st || '';
      const word = c.index === pinned ? 'Your pick from last round' : stateWord(st, batch);
      const play$ = btn('Play', () => (speech.index === c.index ? stopSpeech() : play(c.index, 0)), 'small', { hidden: !speechOn(), 'data-key': 'play-' + c.index, 'aria-label': 'Play draft ' + c.label });
      const pause$ = btn('Pause', togglePause, 'small', { hidden: true, 'data-key': 'pause-' + c.index, 'aria-label': 'Pause draft ' + c.label });
      controlEls.set(c.index, { play: play$, pause: pause$ });
      return h('div', { class: 'colhead' + (st ? ' is-' + st : '') + (fresh ? ' draw' : ''), role: 'columnheader', 'data-state': st === 'keep' ? 'kept' : st === 'pass' ? 'passed' : undefined },
        h('span', { class: 'badge' }, sr('Draft '), c.label, pencil('circle'), pencil('slash')),
        h('span', { class: 'state-word', text: word }),
        h('span', { class: 'head-actions' }, play$, pause$));
    };
    const head = h('div', { class: 'gr headrow', role: 'row' },
      h('div', { class: 'ln', role: 'columnheader' }, sr('Line')),
      hasCur && !phone ? h('div', { class: 'colhead cur', role: 'columnheader', text: 'Current' }) : null, cols.map(colHead));

    const footCell = c => {
      const st = stateOf(c);
      const kept = st === 'keep', passed = st === 'pass';
      const n = newWords(cmp.rows, String(c.index));
      const actions = c.index === pinned ? null : h('div', { class: 'acts' },
        btn(kept ? 'Kept' : 'Keep', () => markKeep(c), kept ? 'on' : '', { 'aria-pressed': String(kept), 'data-key': 'keep-' + c.index, 'aria-label': (kept ? 'Kept' : 'Keep') + ' draft ' + c.label }),
        btn(passed ? 'Passed' : 'Pass', () => markPass(c), passed ? 'off' : '', { 'aria-pressed': String(passed), 'data-key': 'pass-' + c.index, 'aria-label': (passed ? 'Passed' : 'Pass') + ' draft ' + c.label }));
      return h('div', { class: 'foot' + (passed ? ' passed' : ''), role: 'cell' },
        timingBlock(c), h('p', { class: 'newcount', text: n + ' of ' + wordCount(c.units || []) + ' words new' }),
        changeBlock(c), notesList(c), actions);
    };
    const baseUnits = cmp.rows.filter(row => row.base !== null).map(row => (row.cur.speaker ? row.cur.speaker + ': ' : '') + row.cur.text);
    const foot = h('div', { class: 'gr footrow', role: 'row' },
      h('div', { class: 'ln', role: 'rowheader' }, sr('Measured, and your choice')),
      hasCur && !phone ? h('div', { class: 'foot', role: 'cell' }, timingBlock({ index: 'cur', units: baseUnits })) : null, cols.map(footCell));

    // above the grid: the chooser (a phone shows one draft at a time; a wide screen, when there are more drafts than fit), and expand or fold all
    const bar = [];
    if (phone) {
      bar.push(h('div', { class: 'pair', role: 'group', 'aria-label': hasCur ? 'Compare the current line with' : 'Show draft' },
        shown.map(c => {
          const st = stateOf(c);
          return btn(c.label, () => { ui.cmp.phone = String(c.index); render(); }, 'pill', { 'aria-pressed': String(String(c.index) === keys[0]), 'data-key': 'show-' + c.index }, st ? sr(st === 'keep' ? ', kept' : ', passed') : null);
        })));
    } else if (allKeys.length > limit) {
      bar.push(h('div', { class: 'showpick' },
        h('div', { class: 'pair', role: 'group', 'aria-label': 'Show in the comparison' },
          shown.map(c => btn(c.label, () => { ui.cmp.recent = togglePicked(allKeys, ui.cmp.recent, String(c.index), limit); render(); }, 'pill', { 'aria-pressed': String(keys.includes(String(c.index))), 'data-key': 'pick-' + c.index }))),
        h('span', { class: 'quiet', role: 'status', text: keys.map(k => colOf(k).label).join(' ') + ' shown' })));
    }
    const folds = segs.filter(x => x.fold);
    if (folds.length) {
      const all = folds.every(f => ui.cmp.open.has(f.id));
      bar.push(btn(all ? 'Fold all' : 'Expand all', () => { if (all) folds.forEach(f => ui.cmp.open.delete(f.id)); else folds.forEach(f => ui.cmp.open.add(f.id)); render(); }, 'small expand', { 'data-key': 'expand-all' }));
    }
    const stale = data.session.original && data.session.original.stale ? h('p', { class: 'quiet original-note', text: 'The draft has changed since this set was made' }) : null;
    return [stale, bar.length ? h('div', { class: 'cmpbar' }, bar) : null,
      h('section', { class: 'sheet grid n' + (cols.length + (hasCur && !phone ? 1 : 0)) + (phone ? ' phone' : ''), role: 'table', 'aria-label': hasCur ? 'The current line and the drafts, side by side' : 'The drafts, side by side' }, head, body, foot),
      rateControl()];
  }

  /** Keep one draft in a single-set lineup (several may be kept), or choose it in a batch (one at a time, staged in the queue until Send picks). */
  function markKeep(c) {
    if (batch) return setChoice(keepChoice(data.queue.choice, c.index));
    ui.marks[c.index] = ui.marks[c.index] === 'keep' ? null : 'keep';
    render();
  }
  function markPass(c) {
    if (batch) return setChoice(passChoice(data.queue.choice, c.index));
    ui.marks[c.index] = ui.marks[c.index] === 'pass' ? null : 'pass';
    render();
  }

  function lineupScreen() {
    const s = data.state;
    const pinned = s.round > 0 && s.champion !== null && s.lineup.includes(s.champion) ? s.champion : null;
    const shown = data.candidates.filter(c => s.lineup.includes(c.index));
    if (batch) {
      // The staged choice is the marks: the server holds it, so a reload or another device shows the same.
      ui.marks = marksFromChoice(data.queue.choice);
      setTitle('Choose a draft', lineupHintBatch());
      const body = data.compare && shown.length > 0 && shown.every(c => !c.changed && c.hashOk && c.units)
        ? [compareView(shown, null)]
        : [originalBlock(), rateControl(), shown.map(c => card(c, {
          state: ui.marks[c.index],
          actions: h('div', { class: 'row grow' },
            btn(ui.marks[c.index] === 'keep' ? 'Kept' : 'Keep', () => markKeep(c), ui.marks[c.index] === 'keep' ? 'on' : '', { 'aria-pressed': String(ui.marks[c.index] === 'keep'), 'data-key': 'keep-' + c.index }),
            btn(ui.marks[c.index] === 'pass' ? 'Passed' : 'Pass', () => markPass(c), ui.marks[c.index] === 'pass' ? 'off' : '', { 'aria-pressed': String(ui.marks[c.index] === 'pass'), 'data-key': 'pass-' + c.index })),
        }))];
      return [...batchTop(), briefBlock(), ...body];
    }
    if (ui.marksRound !== s.round) { ui.marks = {}; ui.marksRound = s.round; ui.drawn = {}; ui.cmp = { recent: null, phone: null, open: new Set() }; }
    const choosable = c => !(c.changed || !c.hashOk || !c.units) && c.index !== pinned;
    const marked = shown.filter(c => choosable(c) && ui.marks[c.index] === 'keep').length;
    const open = shown.filter(c => choosable(c) && ui.marks[c.index] !== 'pass' && ui.marks[c.index] !== 'keep').length;
    setTitle(s.round === 0 ? 'Read each draft' : 'Round ' + (s.round + 1) + ': the new drafts', lineupHint(s.round, (shown[0] || {}).layout));
    const ready = marked > 0 || (s.round > 0 && open === 0);
    const go = btn('Continue', async () => {
      const kept = shown.filter(c => choosable(c) && ui.marks[c.index] === 'keep').map(c => c.index);
      const duds = shown.filter(c => choosable(c) && (ui.marks[c.index] === 'pass' || (ui.marks[c.index] !== 'keep' && s.round > 0))).map(c => c.index);
      const broken = shown.filter(c => !choosable(c) && c.index !== pinned).map(c => c.index);
      await send({ type: 'lineup', kept, duds: [...duds, ...broken], order: shown.map(c => c.index) });
    }, 'primary', { disabled: !ready, 'data-gate': '1' });
    const dock = h('div', { class: 'actionbar' }, go, h('span', { class: 'quiet', role: 'status', text: ready ? marked + ' kept' : 'Keep at least one draft to continue' }));
    // Side by side when the server aligned the drafts (every one readable); otherwise the stack of cards as before.
    if (data.compare && shown.length > 0 && shown.every(c => !c.changed && c.hashOk && c.units)) return [briefBlock(), compareView(shown, pinned), dock];
    const cards = shown.map(c => {
      const actions = c.index === pinned ? null : h('div', { class: 'row grow' },
        btn(ui.marks[c.index] === 'keep' ? 'Kept' : 'Keep', () => markKeep(c), ui.marks[c.index] === 'keep' ? 'on' : '', { 'aria-pressed': String(ui.marks[c.index] === 'keep'), 'data-key': 'keep-' + c.index }),
        btn(ui.marks[c.index] === 'pass' ? 'Passed' : 'Pass', () => markPass(c), ui.marks[c.index] === 'pass' ? 'off' : '', { 'aria-pressed': String(ui.marks[c.index] === 'pass'), 'data-key': 'pass-' + c.index }));
      return card(c, { tag: c.index === pinned ? 'Your pick from last round' : null, actions, state: c.index === pinned ? null : ui.marks[c.index] });
    });
    return [briefBlock(), originalBlock(), rateControl(), cards, dock];
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
    return [briefBlock(), originalBlock(), rateControl(), h('div', { class: 'duel-grid' }, cards), h('div', { class: 'actionbar' }, bar)];
  }

  function refineScreen() {
    const s = data.state;
    const champ = candidateOf(s.champion);
    setTitle('Your favorite so far', 'Tell the writer what to try next, or ship this one.');
    const out = [briefBlock(), originalBlock()];
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

  // ---- the draft and its strikes ----

  /** The picker under a line: why it should go (none preselected), an optional note, Strike and Cancel. */
  function pickerFor(line) {
    const pick = ui.pick;
    const area = h('textarea', { rows: '2', maxlength: String(MAX_NOTE), 'aria-label': 'Why (optional)', placeholder: 'Why, in a few words (optional)', value: pick.note, on: { input: () => { pick.note = area.value; } } });
    const go = btn('Strike', async () => {
      const body = strikeBody(data.draft, pick, newEventId(window.crypto));
      if (!body) return;
      if (await strikeSend('', body)) { ui.pick = null; render(); }
    }, 'primary', { 'data-gate': '1', 'data-hold': !pick.reason, disabled: !pick.reason });
    const reasons = STRIKE_REASONS.map(r => btn(r.label, () => { pick.reason = r.id; render(); const again = app.querySelector('.picker [aria-checked="true"]'); if (again) again.focus(); },
      pick.reason === r.id ? 'on' : '', { role: 'radio', 'aria-checked': String(pick.reason === r.id) }));
    return h('div', { class: 'picker' },
      h('div', { role: 'radiogroup', 'aria-label': 'Why strike this line', class: 'row grow' }, reasons),
      area,
      h('div', { class: 'row' }, go, btn('Cancel', () => { ui.pick = null; render(); }, 'link')));
  }

  function draftLine(line, draft) {
    const strike = strikeOn(draft, line.ref);
    const text = (line.speaker ? line.speaker + ': ' : '') + line.text;
    const row = h('div', { class: 'draft-line' + (strike ? ' is-struck' : ''), 'data-ref': line.ref },
      h('span', { class: 'line-ref', 'aria-hidden': 'true', text: line.ref }),
      h('span', { class: 'line-text' + (strike ? ' struck' : ''), text }));
    if (strike) {
      row.appendChild(h('span', { class: 'sr-only', text: ' (struck)' }));
      row.appendChild(h('div', { class: 'strike-meta' },
        h('span', { class: 'chip', text: reasonLabel(strike.reason) }),
        strike.note ? h('span', { class: 'strike-note', text: strike.note }) : null,
        draft.editable ? btn('Undo', () => clearStrike(strike.id), 'link', { 'data-gate': '1', 'aria-label': 'Undo the strike on ' + line.ref }) : null));
    } else if (!line.strikable) {
      row.appendChild(h('span', { class: 'quiet why', text: line.why || 'This line cannot be struck.' }));
    } else if (draft.editable) {
      const open = ui.pick && ui.pick.ref === line.ref;
      row.appendChild(btn('Strike', () => {
        ui.pick = open ? null : { ref: line.ref, reason: null, note: '' };
        render();
        const first = app.querySelector('.picker [role="radio"]');
        if (first) first.focus();
      }, 'strike-btn', { 'aria-expanded': String(!!open), 'aria-label': 'Strike line ' + line.ref }));
      if (open) row.appendChild(pickerFor(line));
    }
    return row;
  }

  function draftScreen() {
    const draft = data.draft;
    setTitle('The draft', draft ? draft.source : '');
    if (!draft) return [h('p', { class: 'quiet', text: 'The draft is not available. It may have moved, been deleted, or no longer be readable.' })];
    const out = [h('p', { class: 'quiet', text: draft.editable
      ? 'Strike a line you want gone and say why. Striking only records it: nothing leaves the draft until you review and apply.'
      : 'This session is closed, so strikes can no longer change.' })];
    const stale = staleStrikes(draft);
    if (stale.length) {
      out.push(h('section', { class: 'stale-strikes', 'aria-label': 'Struck against an older draft' },
        h('h2', { text: 'Struck against an older draft' }),
        h('p', { class: 'quiet', text: 'The draft has changed since these were struck, so they no longer hold. Undo them, then strike again.' }),
        stale.map(st => h('div', { class: 'draft-line is-struck', 'data-ref': st.ref },
          h('span', { class: 'line-ref', 'aria-hidden': 'true', text: st.ref }),
          h('span', { class: 'line-text struck', text: (st.speaker ? st.speaker + ': ' : '') + st.text }),
          h('div', { class: 'strike-meta' }, h('span', { class: 'chip', text: reasonLabel(st.reason) }),
            st.note ? h('span', { class: 'strike-note', text: st.note }) : null,
            draft.editable ? btn('Undo', () => clearStrike(st.id), 'link', { 'data-gate': '1', 'aria-label': 'Undo the strike on ' + st.ref }) : null)))));
    }
    if (!draft.lines.length) out.push(h('p', { class: 'quiet', text: 'This draft has no lines to strike.' }));
    let block = null;
    draft.lines.forEach((line, i) => {
      if (i === 0 || line.break) { block = h('div', { class: 'draft-block' }); out.push(block); }
      block.appendChild(draftLine(line, draft));
    });
    if (draft.truncated) out.push(h('p', { class: 'quiet', text: 'Only the first ' + draft.lines.length + ' lines are shown.' }));
    return out;
  }

  /** Sticky at the bottom of every screen while lines are struck: how many, and what to do about stale ones. */
  function pendingBar() {
    const sum = data && data.draft ? pendingSummary(data.draft) : null;
    if (!sum) return null;
    const stale = staleStrikes(data.draft);
    return h('div', { class: 'pendingbar', role: 'status' },
      h('strong', { text: sum.text }),
      h('span', { class: 'quiet', text: ' ' + sum.note }),
      sum.stale && data.draft.editable ? btn(stale.length === 1 ? 'Undo it' : 'Undo them', async () => { for (const st of stale) { if (!(await clearStrike(st.id))) break; } }, 'link', { 'data-gate': '1' }) : null,
      applyReady(data.draft) ? btn('Review and apply', () => openPlan(), 'primary', { 'data-gate': '1', 'data-role': 'review' }) : null,
      ui.view !== 'draft' ? btn('See the draft', () => { ui.view = 'draft'; render(); }, 'link') : null);
  }

  /** After an apply, while it can still be undone: what was removed and the way back. */
  function removedBar() {
    const sum = data && data.draft ? appliedSummary(data.draft) : null;
    if (!sum) return null;
    return h('div', { class: 'pendingbar removedbar', role: 'status' },
      h('strong', { text: sum.text }),
      h('span', { class: 'quiet', text: ' Undo puts them back.' }),
      btn('Undo removal', () => undoRemoval(data.draft.applied), 'primary', { 'data-gate': '1' }));
  }

  /** The apply review: every line that would go, as text, and the explicit confirmation. Replaces the screen while it is open. */
  function planScreen() {
    const cur = ui.plan;
    setTitle('Review before removing', data.draft ? data.draft.source : '');
    if (cur.loading || !cur.plan) return [h('p', { class: 'quiet', text: 'Working out exactly what would be removed...' })];
    const plan = cur.plan;
    const rows = plan.removed.map(row => {
      const part = removalParts(row);
      return h('div', { class: 'plan-row plan-' + row.kind },
        h('div', { class: 'plan-where' }, h('strong', { text: part.where }), part.reason ? h('span', { class: 'chip', text: part.reason }) : null),
        part.extra ? h('p', { class: 'quiet', text: part.extra }) : null,
        row.kind === 'blank' ? null : h('pre', { class: 'plan-text', text: part.text }),
        part.note ? h('p', { class: 'strike-note', text: part.note }) : null);
    });
    return [
      h('h2', { class: 'plan-title', tabindex: '-1', text: planTitle(plan) }),
      cur.why ? h('p', { class: 'plan-why', role: 'status', text: cur.why }) : null,
      h('p', { class: 'warn', text: 'This link can delete lines from the draft.' }),
      h('p', { class: 'quiet', text: 'These are the exact lines that will be removed from ' + (data.draft ? data.draft.source : 'the draft') + '. Undo removal puts them back as long as the draft is not edited meanwhile.' }),
      h('div', { class: 'plan-rows' }, rows),
      h('div', { class: 'row plan-actions' },
        btn(planButton(plan), confirmPlan, 'primary danger', { 'data-gate': '1', 'data-role': 'confirm' }),
        btn('Not yet', closePlan, '', { 'data-gate': '1' })),
    ];
  }

  /** The switch between the variants and the draft, in the header: only when the session has a draft to show. */
  function viewBar() {
    const el = $('views');
    el.textContent = '';
    if (!data || !data.draft) { el.hidden = true; ui.view = 'variants'; return; }
    el.hidden = false;
    const tab = (view, text) => btn(text, () => { if (ui.view !== view) { ui.view = view; ui.pick = null; render(); } }, '', { 'aria-pressed': String(ui.view === view) });
    el.append(tab('variants', 'Variants'), tab('draft', 'Draft'));
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
    if (ui.reveal && ui.revealFor === fullSig(data)) fill(ui.reveal);
    else {
      box.append(h('p', { class: 'quiet', text: 'Opening the sealed guess...' }));
      const sig = fullSig(data);
      request('GET', base() + '/reveal').then(res => {
        if (res.ok) { ui.reveal = res.body; ui.revealFor = sig; fill(res.body); }
        else { box.replaceChildren(h('p', { text: 'You chose ' + labelFor(data.state.shipped) + '.' }), h('p', { class: 'quiet', text: 'The sealed guess is not available.' })); }
      }).catch(() => { box.replaceChildren(h('p', { text: 'You chose ' + labelFor(data.state.shipped) + '.' }), h('p', { class: 'quiet', text: 'Could not reach the server for the sealed guess. Reload to try again.' })); });
    }
    return [box];
  }

  // ---- batch review: the rail, one item at a time, staged choices, Send picks, Finish ----

  const railItem = n => (ui.rail ? ui.rail.items[n - 1] : null);
  const lineupHintBatch = () => 'Keep the draft you want, or none. Nothing is sent until you press Send picks.';
  const announce = text => { const el = $('live'); if (!el) return; el.textContent = ''; setTimeout(() => { el.textContent = text; }, 30); };
  const openStage = () => !!(ui.rail && ui.rail.queue.stage === 'open');

  /** The rail's number for the item as it reads on screen: its place in the queue and its state in words. */
  function itemAnnouncement(n) {
    const it = railItem(n);
    return 'Item ' + (ui.rail.order.indexOf(n) + 1) + ' of ' + ui.rail.items.length + ': ' + it.who + ', ' + it.where + ', ' + statusWord(it).toLowerCase();
  }

  /** The state of a rail item as a class: the hollow circle waits, the filled circle holds the letter, the slash is a skip. */
  const stateClass = it => (it.status === 'picked' ? 'picked' : it.status === 'sent' ? 'picked sent' : it.status === 'skipped' ? 'skipped' : it.status === 'blocked' ? 'blocked' : it.status === 'ended' ? 'ended' : '');

  function renderRail() {
    const el = $('rail');
    const desk = $('desk');
    if (!batch || !ui.rail) { el.hidden = true; return; }
    const r = ui.rail;
    const focused = document.activeElement && el.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
    desk.classList.add('batch');
    el.hidden = false;
    const w = railWindow(r.order, ui.railPage);
    ui.railPage = w.page;
    const rows = w.ns.map(n => {
      const it = r.items[n - 1];
      return h('li', null, h('button', {
        type: 'button', class: 'qitem', 'aria-current': n === ui.cur ? 'true' : undefined, 'data-key': 'rail-' + n,
        'aria-label': railLabel(it, r.order.indexOf(n) + 1, r.items.length), on: { click: () => go(n) },
      },
      h('span', { class: 'state ' + stateClass(it), 'data-l': it.picked || '', 'aria-hidden': 'true' }),
      h('span', { class: 'qtext' }, h('span', { class: 'who', text: it.who }), h('span', { class: 'where', text: it.where }), h('span', { class: 'qstatus', text: statusWord(it) }))));
    });
    const pager = w.pages > 1 ? h('div', { class: 'pager', role: 'group', 'aria-label': 'Pages of the queue' },
      btn('Earlier', () => { ui.railPage = w.page - 1; renderRail(); }, 'small', { disabled: w.page === 0, 'data-key': 'rail-earlier' }),
      h('span', { class: 'quiet', text: (w.from + 1) + '-' + (w.from + w.ns.length) + ' of ' + r.order.length }),
      btn('Later', () => { ui.railPage = w.page + 1; renderRail(); }, 'small', { disabled: w.page >= w.pages - 1, 'data-key': 'rail-later' })) : null;
    el.replaceChildren(
      h('h2', { class: 'rail-title', text: 'Review desk' }),
      h('p', { class: 'count', text: railSummary(r.queue.counts, r.items.length) }),
      h('ol', { class: 'queue' }, rows), ...(pager ? [pager] : []));
    if (focused) { const again = Array.prototype.find.call(el.querySelectorAll('[data-key]'), x => x.getAttribute('data-key') === focused); if (again && !again.disabled) again.focus({ preventScroll: true }); }
  }

  /** The rail's payload: re-render only when something on it changed. */
  function applyRail(r, quiet) {
    const sig = JSON.stringify([r.queue.stage, r.queue.counts, r.order, r.items.map(i => [i.status, i.picked, i.message || '', i.via || ''])]);
    const changed = sig !== ui.railSig;
    ui.rail = r;
    ui.railSig = sig;
    if (changed && !quiet) { renderRail(); if (data) render(); }
  }

  /** The item to open first: the one named in the address (#3) when the queue has it, else the first still to be decided. */
  function startItem(r) {
    const n = Number(String(window.location.hash || '').replace(/^#/, ''));
    return Number.isInteger(n) && r.items.some(i => i.n === n) ? n : r.current;
  }

  /** The marks drawn for an item as it is first shown are fully drawn, not animated: only a change the owner makes draws. */
  function enterItem() {
    ui.entered = ui.cur;
    ui.drawn = {};
    for (const c of data.candidates) ui.drawn[c.index] = marksFromChoice(data.queue.choice)[c.index] || '';
    ui.cmp = { recent: null, phone: null, open: new Set() };
    ui.view = 'variants'; ui.plan = null; ui.pick = null; ui.selected = null; ui.noteDraft = ''; ui.confirmShip = false;
  }

  function rememberItem(n, payload) {
    ui.cache.set(n, payload);
    if (ui.cache.size > 12) for (const k of ui.cache.keys()) { if (k !== ui.cur) { ui.cache.delete(k); break; } }
  }

  /** The open item's payload arrived. */
  function applyItem(n, payload) {
    if (n !== ui.cur) return;
    ui.itemError = null;
    rememberItem(n, payload);
    if (ui.entered !== n) { data = payload; enterItem(); render(); return; }
    apply(payload);
  }

  /** The next item is fetched once, a moment after the open one is on screen, so Next is instant. */
  function prefetch() {
    if (!batch || !ui.rail) return;
    const next = stepItem(ui.rail.order, ui.cur, 1);
    if (next === null || ui.cache.has(next) || ui.prefetched.has(next)) return;
    ui.prefetched.add(next);
    setTimeout(async () => {
      try { const res = await request('GET', '/api/queue/' + batchId + '/item/' + next); if (res.ok) rememberItem(next, res.body); } catch { /* it is fetched when the owner gets there */ }
    }, 600);
  }

  async function loadBatch() {
    try {
      const rail = await request('GET', '/api/queue/' + batchId);
      if (!rail.ok) { loadFailed(rail); return; }
      fails = 0;
      showBanner(false);
      if (ui.cur === null) ui.cur = startItem(rail.body);
      applyRail(rail.body, true);
      renderRail();
      const n = ui.cur;
      const res = await request('GET', '/api/queue/' + batchId + '/item/' + n);
      if (n !== ui.cur) return;
      if (res.ok) { applyItem(n, res.body); prefetch(); }
      else if (res.status === 404) { data = null; ui.itemError = (res.body && res.body.error && (res.body.error.message)) || 'This item is not available'; renderItemError(); }
      else if (res.status === 401) loadFailed(res);
      else showProblem(res);
    } catch {
      fails++;
      showBanner(true);
    }
  }

  function loadFailed(res) {
    if (res.status === 401 || res.status === 404) {
      fatal = true;
      showMessage(res.status === 401 ? 'This link is missing its key' : 'That review was not found',
        (res.body && res.body.error && (res.body.error.hint || res.body.error.message)) || 'Ask your writer for a fresh link.');
    } else showProblem(res);
  }

  function renderItemError() {
    renderRail();
    setTitle('Not available', ui.itemError);
    app.className = '';
    $('views').hidden = true;
    app.replaceChildren(h('p', { class: 'quiet', text: ui.itemError + '. The rest of the queue is on the left.' }), batchDock());
  }

  /** Open an item: the rail follows it, the address names it, the title row takes the focus, and a screen reader hears where it is. */
  function go(n) {
    if (!ui.rail || !railItem(n)) return;
    stopSpeech();
    ui.cur = n;
    ui.railPage = railPageOf(ui.rail.order, n);
    try { window.history.replaceState(null, '', window.location.pathname + '#' + n); } catch { /* the address stays */ }
    const cached = ui.cache.get(n);
    ui.entered = null;
    if (cached) { data = cached; enterItem(); render(); } else { data = null; renderRail(); app.replaceChildren(h('p', { class: 'quiet', text: 'Loading...' })); }
    $('title').focus();
    announce(itemAnnouncement(n));
    request('GET', '/api/queue/' + batchId + '/item/' + n).then(res => { if (res.ok) { applyItem(n, res.body); prefetch(); } else if (n === ui.cur) { if (res.status === 404) { data = null; ui.itemError = (res.body && res.body.error && res.body.error.message) || 'This item is not available'; renderItemError(); } else showProblem(res); } }).catch(() => showBanner(true));
  }
  const goUnchosen = () => { const n = nextUnchosen(ui.rail.order, ui.rail.items, ui.cur); if (n !== null) go(n); };

  /** A write to the queue (choose, skip, send, finish): gated like a judgement, answered with the rail and, for a choice, the item. */
  async function batchPost(path, body) {
    if (busy) return null;
    busy = true; setBusy(true);
    try {
      const res = await post('/api/queue/' + batchId + path, JSON.stringify({ ...body, eventId: newEventId(window.crypto) }));
      if (res.ok && res.body) { hideNotice(); showBanner(false); if (res.body.rail) applyRail(res.body.rail, true); return res.body; }
      showProblem(res);
      if (res.status === 409 || res.status === 404 || res.status === 400) await load();
      return null;
    } catch {
      showBanner(true);
      return null;
    } finally {
      busy = false; setBusy(false);
    }
  }

  /** Stage the choice for the open item: the server keeps it in the queue log (nothing is sent). */
  async function setChoice(next) {
    const n = ui.cur;
    const body = await batchPost('/choose', { item: n, variant: next.variant, passes: next.passes });
    if (body && body.state && body.state.queue.n === ui.cur) { rememberItem(n, body.state); apply(body.state); }
  }

  /** Skip the open item (it goes to the end of the queue) and move on to the one that follows it. */
  async function skipItem() {
    const n = ui.cur;
    const after = stepItem(ui.rail.order, n, 1);
    const body = await batchPost('/skip', { item: n });
    if (!body) return;
    ui.cache.delete(n);
    if (after !== null) go(after);
    else if (body.state && body.state.queue.n === ui.cur) apply(body.state);
  }

  // ---- Send picks and Finish: a panel above the item, nothing happens until a button in it is pressed ----

  /** The items the server would send: the chosen ones not yet sent, in rail order. Their text comes from fresh item payloads. */
  async function openSend(thenFinish) {
    if (!ui.rail || ui.sending) return;
    const ns = ui.rail.order.filter(n => ['picked', 'blocked'].includes(ui.rail.items[n - 1].status));
    ui.panel = { kind: 'send', loading: true, lines: [], thenFinish: !!thenFinish };
    render();
    const lines = [];
    let at = 0;
    const worker = async () => {
      while (at < ns.length) {
        const n = ns[at++];
        try {
          const res = await request('GET', '/api/queue/' + batchId + '/item/' + n);
          if (!res.ok) continue;
          rememberItem(n, res.body);
          const v = res.body.queue.choice.variant;
          const c = v === null ? null : res.body.candidates.find(x => x.index === v);
          if (c) lines.push({ n, text: reviewLine(railItem(n), c.label, changedUnits(res.body, v)) });
        } catch { /* the line is left out; the server sends what is staged */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (!ui.panel || ui.panel.kind !== 'send') return;
    lines.sort((a, b) => ui.rail.order.indexOf(a.n) - ui.rail.order.indexOf(b.n));
    ui.panel = { kind: 'send', loading: false, lines, thenFinish: !!thenFinish, focus: true };
    render();
  }

  function closePanel() {
    const kind = ui.panel ? ui.panel.kind : null;
    ui.panel = null;
    render();
    const again = app.querySelector('[data-key="' + (kind === 'send' ? 'send' : kind === 'finish' ? 'finish' : 'keys') + '"]');
    if (again) again.focus();
  }

  async function confirmSend() {
    const panel = ui.panel;
    if (!panel || panel.kind !== 'send' || panel.loading || ui.sending || panel.lines.length === 0) return;
    ui.panel = null;
    ui.sending = true; ui.sendTotal = panel.lines.length; ui.sendBase = ui.rail.queue.counts.sent;
    render();
    schedule();
    const body = await batchPost('/send', { sendId: newEventId(window.crypto).slice(0, 60) });
    ui.sending = false;
    if (body && Array.isArray(body.results)) {
      const sent = body.results.filter(r => r.status === 'sent').length;
      const blocked = body.results.filter(r => r.status === 'blocked');
      if (blocked.length) showNotice(sent + ' sent. ' + blocked.length + (blocked.length === 1 ? ' pick' : ' picks') + ' could not be sent.', blocked[0].message + (blocked.length > 1 ? ' (The others are marked in the list.)' : ''));
    }
    ui.cache.clear(); ui.prefetched.clear();
    await load();
    // "Send and finish" finishes only when every pick went through; a blocked one is left for the owner to see
    if (panel.thenFinish && body && Array.isArray(body.results) && body.results.every(r => r.status === 'sent') && openStage()) await doFinish();
    if (data) render();
  }

  async function doFinish() {
    const body = await batchPost('/finish', {});
    ui.panel = null;
    ui.cache.clear(); ui.prefetched.clear();
    if (body) await load();
    if (data) render();
  }

  function openFinish() {
    if (!ui.rail || ui.sending) return;
    ui.panel = { kind: 'finish', focus: true };
    render();
  }

  function toggleHelp() {
    ui.panel = ui.panel && ui.panel.kind === 'help' ? null : { kind: 'help', focus: true };
    render();
  }
  function setKeys(on) { ui.keys = on; saveKeys(on); render(); }

  /** The panel that is open, built from state; the heading takes the focus when it first appears. */
  function panelBlock() {
    const pn = ui.panel;
    if (!pn || !ui.rail) return null;
    const c = ui.rail.queue.counts;
    if (pn.kind === 'send') {
      if (pn.loading) return h('section', { class: 'panel', role: 'region', 'aria-labelledby': 'panel-h' }, h('h2', { id: 'panel-h', tabindex: '-1', text: 'Send picks' }), h('p', { class: 'quiet', text: 'Getting your choices together...' }));
      const n = pn.lines.length;
      return h('section', { class: 'panel', role: 'region', 'aria-labelledby': 'panel-h' },
        h('h2', { id: 'panel-h', tabindex: '-1', text: n === 0 ? 'Nothing to send' : 'Send ' + n + (n === 1 ? ' pick?' : ' picks?') }),
        n === 0 ? h('p', { text: 'Nothing is chosen yet. Keep a draft in an item first.' })
          : [h('ul', { class: 'review' }, pn.lines.map(l => h('li', { text: l.text }))),
            h('p', { class: 'warn', text: 'Picks cannot be changed once sent.' })],
        h('div', { class: 'row' },
          n > 0 ? btn(pn.thenFinish ? 'Send ' + n + (n === 1 ? ' pick and finish' : ' picks and finish') : 'Send ' + n + (n === 1 ? ' pick' : ' picks'), confirmSend, 'primary', { 'data-key': 'confirm-send' }) : null,
          btn('Not yet', closePanel, '', { 'data-key': 'panel-back' })));
    }
    if (pn.kind === 'finish') {
      const unsent = c.picked;
      return h('section', { class: 'panel', role: 'region', 'aria-labelledby': 'panel-h' },
        h('h2', { id: 'panel-h', tabindex: '-1', text: unsent ? 'Send them first?' : 'Finish the review?' }),
        unsent
          ? h('p', { text: unsent + (unsent === 1 ? ' pick is' : ' picks are') + ' chosen but not sent. Finishing without sending drops them; the sets stay unpicked.' })
          : h('p', { text: 'Sets without a pick stay as they are, and your writer can open them again. Picks already sent stay.' }),
        h('div', { class: 'row' },
          unsent ? btn('Send and finish', () => openSend(true), 'primary', { 'data-key': 'finish-send' }) : null,
          btn(unsent ? 'Finish without them' : 'Finish', doFinish, unsent ? '' : 'primary', { 'data-key': 'finish-go', 'data-gate': '1' }),
          btn('Back', closePanel, '', { 'data-key': 'panel-back' })));
    }
    const rows = [['j / k', 'next and previous item'], ['n', 'next unchosen item'], ['a to f', 'keep that draft'], ['Shift + a to f', 'pass on that draft'], ['u', 'clear the choice for this item'],
      ['s', 'skip this item (it comes back at the end)'], ['e', 'expand or fold the unchanged lines'], ['b', 'open or close the brief'], ['Ctrl or Cmd + Enter', 'open Send picks, and confirm it'], ['Escape', 'close a panel'], ['?', 'show this list']];
    return h('section', { class: 'panel', role: 'region', 'aria-labelledby': 'panel-h' },
      h('h2', { id: 'panel-h', tabindex: '-1', text: 'Keyboard shortcuts' }),
      h('dl', { class: 'keys' }, rows.map(r => [h('dt', { text: r[0] }), h('dd', { text: r[1] })])),
      h('div', { class: 'row' },
        btn(ui.keys ? 'Turn shortcuts off' : 'Turn shortcuts on', () => setKeys(!ui.keys), '', { 'aria-pressed': String(ui.keys), 'data-key': 'keys-switch' }),
        btn('Close', closePanel, '', { 'data-key': 'panel-back' })));
  }

  /** The row above an item: previous and next, skip, clear, and the way out to the full single-set flow. */
  function batchTop() {
    const q = data.queue;
    const prev = stepItem(ui.rail.order, ui.cur, -1);
    const next = stepItem(ui.rail.order, ui.cur, 1);
    const live = openStage() && q.status !== 'sent' && q.status !== 'ended';
    return [
      panelBlock(),
      q.message && q.status === 'blocked' ? h('p', { class: 'warn blocked-msg', role: 'alert', text: 'Could not be sent: ' + q.message }) : null,
      h('div', { class: 'itembar' },
        btn('Previous', () => go(prev), 'small', { disabled: prev === null, 'data-key': 'prev' }),
        btn('Next', () => go(next), 'small', { disabled: next === null, 'data-key': 'next' }),
        live ? btn('Skip this one', skipItem, 'small', { 'data-key': 'skip', 'data-gate': '1' }) : null,
        live ? btn('Clear choice', () => setChoice({ variant: null, passes: [] }), 'small', { disabled: noChoice(q.choice), 'data-key': 'clear', 'data-gate': '1' }) : null,
        h('a', { class: 'own', href: '/s/' + data.session.id, text: 'Open as its own session' })),
    ];
  }

  /** The dock of a batch: the tally, Next unchosen, Finish, Keys, and Send picks. Once the review is over it is only the summary. */
  function batchDock() {
    const r = ui.rail;
    const total = r.items.length;
    const c = r.queue.counts;
    if (r.queue.stage !== 'open') {
      const text = r.queue.stage === 'done' ? 'All ' + total + ' sets have a pick.' : 'The review is over: ' + c.sent + ' sent, ' + (total - c.sent) + ' not chosen.';
      return h('div', { class: 'actionbar batchbar over' }, h('span', { class: 'tally', role: 'status', text }));
    }
    const nextN = nextUnchosen(r.order, r.items, ui.cur);
    const undecided = c.waiting + c.skipped + c.blocked;
    const status = ui.sending ? 'Sending ' + Math.min(ui.sendTotal, Math.max(0, c.sent - ui.sendBase)) + ' of ' + ui.sendTotal + '...' : tallyText(c, total);
    return h('div', { class: 'actionbar batchbar' },
      h('span', { class: 'tally', role: 'status', text: status }),
      btn(undecided === 0 ? 'All chosen' : 'Next unchosen', goUnchosen, '', { disabled: nextN === null, 'data-key': 'next-unchosen' }),
      btn('Finish', openFinish, '', { disabled: ui.sending, 'data-key': 'finish' }),
      btn('Keys', toggleHelp, 'link', { 'aria-pressed': String(!!(ui.panel && ui.panel.kind === 'help')), 'data-key': 'keys' }),
      btn('Send picks', () => openSend(false), 'primary', { disabled: c.picked === 0 || ui.sending, 'data-key': 'send' }));
  }

  /** What an item that is not a lineup shows: sent (the sealed guess, opened), closed, or judged in its own session. */
  function batchScreen() {
    const q = data.queue;
    const stage = data.state.stage;
    const top = batchTop();
    if (q.status === 'sent') {
      if (q.via === 'cli') {
        const c = candidateOf(q.sentVariant);
        setTitle('Picked outside this page', 'Picked outside this page');
        return [...top, h('p', { text: 'This set was picked outside this page' + (c ? ': draft ' + c.label : '') + '.' }), h('p', { class: 'quiet', text: 'Your writer or the command line recorded it, so there is nothing more to do here.' }), batchDock()];
      }
      return [...top, ...revealScreen(), batchDock()];
    }
    if (q.status === 'ended' || stage === 'abandoned') {
      setTitle('Closed', 'This item is closed');
      return [...top, h('p', { text: 'This item was closed without a pick. Its set is still unpicked, and your writer can open it again.' }), batchDock()];
    }
    if (stage !== 'lineup') {
      setTitle('In its own session', 'This set is being judged in its own session');
      return [...top, h('p', { text: 'This set is being judged in its own session, so it cannot take a quick pick here.' }), batchDock()];
    }
    return [...lineupScreen(), batchDock()];
  }

  /** The shortcuts: one place that maps a key to what the screen does. */
  function runKey(act) {
    const q = data && data.queue;
    const live = openStage() && q && q.status !== 'sent' && q.status !== 'ended' && data.state.stage === 'lineup';
    const cand = act.letter ? data.candidates.find(c => c.label === act.letter && data.state.lineup.includes(c.index) && !c.changed && c.hashOk && c.units) : null;
    switch (act.action) {
      case 'close': closePanel(); break;
      case 'help': toggleHelp(); break;
      case 'next': { const n = stepItem(ui.rail.order, ui.cur, 1); if (n !== null) go(n); break; }
      case 'previous': { const n = stepItem(ui.rail.order, ui.cur, -1); if (n !== null) go(n); break; }
      case 'unchosen': goUnchosen(); break;
      case 'review': if (openStage() && ui.rail.queue.counts.picked > 0) openSend(false); break;
      case 'confirm': confirmSend(); break;
      case 'skip': if (live) skipItem(); break;
      case 'clear': if (live && !noChoice(q.choice)) setChoice({ variant: null, passes: [] }); break;
      case 'keep': if (live && cand) markKeep(cand); break;
      case 'pass': if (live && cand) markPass(cand); break;
      case 'fold': { const b = app.querySelector('[data-key="expand-all"]'); if (b) b.click(); break; }
      case 'brief': ui.briefOpen = !ui.briefOpen; render(); break;
      default: break;
    }
  }

  function onKey(ev) {
    if (!batch || !data || !ui.rail) return;
    const t = ev.target;
    const inField = !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
    const act = keyAction({ key: ev.key, shiftKey: ev.shiftKey, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, altKey: ev.altKey, inField },
      { keysOn: ui.keys, batch: true, panel: ui.panel ? ui.panel.kind : null });
    if (!act) return;
    ev.preventDefault();
    runKey(act);
  }

  function render() {
    if (!data) return;
    const focused = document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-key') : null;
    stopSpeech();
    unitEls.clear(); controlEls.clear(); timingEls.clear();
    renderedSig = fullSig(data);
    const stage = data.state.stage;
    if (stage !== 'refine') ui.confirmShip = false;
    viewBar();
    if (batch) renderRail();
    app.className = stage === 'duel' && !batch && !(ui.view === 'draft' && data.draft) ? 'wide' : '';
    let screen;
    if (ui.plan) screen = planScreen();
    else if (ui.view === 'draft' && data.draft) screen = batch ? [...batchTop(), ...draftScreen(), batchDock()] : draftScreen();
    else if (batch) screen = batchScreen();
    else if (stage === 'lineup') screen = lineupScreen();
    else if (stage === 'duel') screen = duelScreen();
    else if (stage === 'refine') screen = refineScreen();
    else if (stage === 'waiting') screen = waitingScreen();
    else if (stage === 'shipped') screen = revealScreen();
    else { setTitle('This session is closed', ''); screen = [h('p', { text: 'Thanks for reading. Your writer closed this session, so there is nothing more to do here.' })]; }
    const prompt = data.session.prompt && stage !== 'shipped' && stage !== 'abandoned' ? h('p', { class: 'quiet', text: data.session.prompt }) : null;
    const items = [prompt, ...screen].flat(2).filter(Boolean);
    const bars = ui.plan ? [] : [pendingBar(), removedBar()].filter(Boolean);
    const bar = bars.length ? h('div', { class: 'bars' }, bars) : null;
    if (bar) {
      // One sticky dock at the bottom: the pending bar above the screen's own action bar, so the two never overlap.
      const at = items.findIndex(el => el.classList && el.classList.contains('actionbar'));
      if (at >= 0) items.splice(at, 1, h('div', { class: 'dock' }, bar, items[at]));
      else items.push(h('div', { class: 'dock' }, bar));
    }
    app.replaceChildren(...items);
    updatePlayState();
    if (focused) {
      // The screen was rebuilt: put the focus back on the same control (found by its stable key), so a keyboard user keeps their place.
      const again = Array.prototype.find.call(app.querySelectorAll('[data-key]'), el => el.getAttribute('data-key') === focused);
      if (again && !again.disabled && !again.hidden) again.focus({ preventScroll: true });
    }
    if (ui.plan && ui.plan.plan && !ui.plan.focused) { ui.plan.focused = true; const t = app.querySelector('.plan-title'); if (t) t.focus(); }
    // a panel that has just opened takes the focus on its heading (Escape or its own button closes it and gives the focus back)
    if (ui.panel && ui.panel.focus) { ui.panel.focus = false; const hd = app.querySelector('#panel-h'); if (hd) hd.focus(); }
    if (batch) prefetch();
  }

  // ---- start ----

  /** The font licences, linked from the page itself (index.html stays free of /fonts references; the files are served by the same server). */
  function fontsFooter() {
    const link = (href, text) => h('a', { href, text });
    document.body.appendChild(h('footer', { class: 'site-foot' }, 'Fonts: SIL OFL 1.1 - ', link('/fonts/OFL-CourierPrime.txt', 'Courier Prime'), ' - ', link('/fonts/OFL-Atkinson.txt', 'Atkinson Hyperlegible')));
  }

  function boot() {
    fontsFooter();
    if (!sessionId && !batch) { showMessage('Reading', 'Open the link your writer gave you to start reading.'); return; }
    if (!auth.token) { showMessage('This link is missing its key', 'Ask your writer for a fresh link.'); return; }
    // The token moves into session storage and out of the visible address; if storage is unavailable it stays in the URL.
    if (auth.fromUrl && auth.persisted) { try { window.history.replaceState(null, '', window.location.pathname + (batch ? window.location.hash : '')); } catch { /* keep the URL */ } }
    if (batch) document.addEventListener('keydown', onKey);
    checkSpeech();
    load().then(schedule);
  }

  boot();
}());
