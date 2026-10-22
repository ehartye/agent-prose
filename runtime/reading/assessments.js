// Supplied editorial assessments on the common proof desk. No model calls or source writes.
(function () {
  'use strict';
  const UI = window.ProseReview;
  UI.registerMode('assessment', () => {
    const { h, button, disclosure, queueItem } = UI;
    const $ = id => document.getElementById(id);
    const id = /^\/a\/([a-z0-9-]+)\/?$/.exec(location.pathname)?.[1];
    const url = new URL(location.href), key = 'prose-reading-token';
    let token = url.searchParams.get('t') || '';
    try {
      if (token) sessionStorage.setItem(key, token);
      else token = sessionStorage.getItem(key) || '';
      if (token) { url.searchParams.delete('t'); history.replaceState(null, '', url.pathname + url.search + url.hash); }
    } catch { /* Keep the URL credential for reload when session storage is unavailable. */ }
    let state, selected, overview = false, query = '';
    const positions = new Map(), expanded = new Map();
    const desk = $('desk'), rail = $('rail'), app = $('app');
    rail.hidden = false;
    rail.setAttribute('aria-label', 'Passages');
    $('title').textContent = 'Passage assessment';
    $('subtitle').textContent = 'Loading batch…';
    const picker = button('Select passage', () => {
      const open = desk.dataset.pickerOpen !== 'true';
      desk.dataset.pickerOpen = String(open); picker.setAttribute('aria-expanded', String(open));
      if (open) rail.querySelector('input')?.focus();
    }, 'assessment-picker', { 'aria-controls': 'rail', 'aria-expanded': 'false' });
    $('title').closest('header').insertBefore(picker, $('review-settings-button'));
    const statusText = p => p.report ? state.recommendations[p.report.recommendation] : 'Awaiting assessment';
    const current = () => state.passages.find(p => p.id === selected);
    const list = values => h('ul', {}, values.map(value => h('li', { text: value })));
    function remember() {
      if (!selected || overview) return;
      positions.set(selected, [app.querySelector('.assessment-source-scroll')?.scrollTop || 0, app.querySelector('.assessment-inspector-scroll')?.scrollTop || 0]);
      expanded.set(selected, [...app.querySelectorAll('[data-criterion]')].filter(el => el.open).map(el => el.dataset.criterion));
    }
    function locationState() {
      const hash = new URLSearchParams(location.hash.slice(1));
      const passage = state.passages.find(p => p.id === hash.get('p'));
      selected = passage?.id || state.passages[0].id; overview = hash.get('view') === 'overview';
    }
    function saveLocation() {
      const next = new URL(location.href);
      next.hash = new URLSearchParams({ p: selected, ...(overview ? { view: 'overview' } : {}) }).toString();
      history.replaceState(null, '', next.pathname + next.search + next.hash);
    }
    function choose(passageId, showOverview = false) {
      remember(); selected = passageId; overview = showOverview; saveLocation(); renderQueue(); render();
      desk.dataset.pickerOpen = 'false'; picker.setAttribute('aria-expanded', 'false');
      app.querySelector('h2')?.focus({ preventScroll: true });
      $('live').textContent = overview ? 'Batch overview' : current().title + '. ' + statusText(current());
    }
    const queue = h('div', { class: 'assessment-queue' });
    const found = h('p', { class: 'quiet assessment-found', 'aria-live': 'polite' });
    function renderQueue() {
      const passages = state.passages.filter(p => (p.title + '\n' + p.text).toLowerCase().includes(query));
      found.textContent = query ? passages.length + ' of ' + state.passages.length + ' passages' : '';
      queue.replaceChildren(...passages.map(p => queueItem({
        who: p.title, where: p.text.replace(/\s+/g, ' ').slice(0, 110), status: statusText(p), tag: String(state.passages.indexOf(p) + 1).padStart(2, '0'),
        current: !overview && selected === p.id, label: p.title + ', ' + statusText(p),
        onClick: () => choose(p.id), attrs: { 'data-recommendation': p.report?.recommendation || 'pending' },
      })), ...(passages.length ? [] : [h('p', { class: 'quiet', text: 'No passages match. Clear the search to see the batch.' })]));
      rail.querySelector('[data-overview]')?.setAttribute('aria-pressed', String(overview));
    }
    function profile() {
      const r = state.reader;
      return disclosure('Reader, task and support anchors', { class: 'assessment-profile' },
        h('p', {}, h('strong', { text: r.profile }), ' · U.S. grade ' + r.schoolGrade),
        h('p', {}, h('strong', { text: 'Prior knowledge: ' }), r.priorKnowledge),
        h('p', {}, h('strong', { text: 'Task: ' }), r.task),
        h('p', {}, h('strong', { text: 'Available supports: ' }), r.supports.length ? r.supports.join('; ') : 'None specified; do not assume teacher assistance.'),
        h('dl', { class: 'assessment-anchors' }, Object.values(state.supportLevels).flatMap(level => [h('dt', { text: level.label }), h('dd', { text: level.anchor })])),
        h('p', { class: 'quiet', text: 'Ratings describe anticipated support needs for this task. They are not scores, measured learner outcomes or grade certification.' }));
    }
    function criterion(row) {
      const dimension = state.rubric.find(item => item.id === row.criterion);
      const level = state.supportLevels[row.rating];
      const wasOpen = expanded.get(selected);
      return disclosure(dimension.label + ' · ' + level.label, {
        class: 'assessment-criterion', 'data-criterion': row.criterion, 'data-rating': row.rating,
        open: wasOpen ? wasOpen.includes(row.criterion) : true,
      },
      ...row.evidence.map(quote => h('blockquote', { text: quote })),
      h('p', { text: row.reason }), h('p', {}, h('strong', { text: 'Action / retain: ' }), row.action));
    }
    function render() {
      if (overview) { renderOverview(); return; }
      const p = current(), index = state.passages.indexOf(p), report = p.report;
      const sourceScroll = h('div', { class: 'assessment-source-scroll', tabindex: '0', role: 'region', 'aria-label': 'Passage text' },
        h('div', { class: 'assessment-text', text: p.text }));
      const source = h('section', { class: 'assessment-source card', 'aria-labelledby': 'assessment-passage-heading' },
        h('header', { class: 'assessment-pane-head' },
          h('div', { class: 'assessment-kicker' }, h('span', { text: 'PASSAGE ' + (index + 1) + ' / ' + state.passages.length }), h('span', { class: 'quiet', text: p.text.trim().split(/\s+/).length + ' words' })),
          h('h2', { id: 'assessment-passage-heading', tabindex: '-1', text: p.title }),
          h('div', { class: 'assessment-turn' },
            button('Previous', () => choose(state.passages[index - 1].id), '', { disabled: index === 0 }),
            button('Next', () => choose(state.passages[index + 1].id), '', { disabled: index === state.passages.length - 1 }),
            h('a', { class: 'assessment-jump', href: '#assessment-report', text: 'Go to assessment', on: { click: event => {
              event.preventDefault();
              $('assessment-report').scrollIntoView({ block: 'start' });
              $('assessment-report').focus({ preventScroll: true });
            } } }))), sourceScroll);
      const inspectorScroll = h('div', { class: 'assessment-inspector-scroll', tabindex: '0', role: 'region', 'aria-label': 'Assessment details' }, profile());
      if (report) {
        inspectorScroll.append(h('p', { class: 'assessment-summary', text: report.summary }),
          h('h3', { text: 'Support needed' }), ...state.rubric.map(item => criterion(report.criteria.find(row => row.criterion === item.id))),
          h('h3', { text: 'Proposed changes' }));
        if (!report.proposals.length) inspectorScroll.append(h('p', { class: 'quiet', text: 'No changes proposed in this report.' }));
        report.proposals.forEach((proposal, i) => {
          const kinds = { 'text-edit': 'Text edit', support: 'Instructional support', 'content-request': 'Content or evidence request' };
          inspectorScroll.append(h('section', { class: 'assessment-proposal' },
            h('p', { class: 'assessment-kicker', text: (i + 1) + '. ' + kinds[proposal.kind] }),
            h('h4', { text: proposal.location }),
            proposal.criterion ? h('p', { class: 'quiet', text: state.rubric.find(row => row.id === proposal.criterion).label }) : null,
            h('p', { text: proposal.description }),
            proposal.before === undefined ? null : h('div', { class: 'assessment-edit' },
              h('p', { class: 'quiet', text: 'Before' }), h('blockquote', { text: proposal.before }),
              h('p', { class: 'quiet', text: 'Proposed' }), h('blockquote', { text: proposal.after }))));
        });
        inspectorScroll.append(h('h3', { text: 'Checks and limits' }),
          h('p', { class: 'quiet', text: report.origin === 'agent' ? 'Agent editorial assessment' : 'User-provided editorial assessment' }),
          report.checks.length ? list(report.checks) : h('p', { text: 'No additional checks reported.' }), list(report.limits));
      } else {
        inspectorScroll.append(h('div', { class: 'assessment-pending' }, h('h3', { text: 'Awaiting assessment' }),
          h('p', { text: 'This passage is included in the batch. No rubric, recommendation or proposed changes have been supplied yet.' })));
      }
      inspectorScroll.append(disclosure('Snapshot details', {}, h('p', { text: 'Created ' + new Date(state.createdAt).toLocaleString() }),
        h('p', { text: 'The report applies to this exact text snapshot. Source documents may have changed since it was created.' }),
        h('p', { class: 'assessment-hash', text: 'SHA-256 ' + p.sourceHash })));
      const inspector = h('section', { class: 'assessment-inspector card', id: 'assessment-report', 'aria-labelledby': 'assessment-report-heading', tabindex: '-1' },
        h('header', { class: 'assessment-pane-head', 'data-recommendation': report?.recommendation || 'pending' },
          h('p', { class: 'assessment-kicker', text: 'EDITORIAL ASSESSMENT' }),
          h('h2', { id: 'assessment-report-heading', text: statusText(p) })), inspectorScroll);
      app.replaceChildren(h('div', { class: 'assessment-board' }, source, inspector));
      const position = positions.get(selected) || [0, 0]; sourceScroll.scrollTop = position[0]; inspectorScroll.scrollTop = position[1];
    }
    function renderOverview() {
      app.replaceChildren(h('section', { class: 'assessment-overview card' },
        h('h2', { tabindex: '-1', text: 'Batch overview' }),
        h('p', { text: state.counts.assessed + ' of ' + state.counts.passages + ' passages have supplied assessments. Each is judged independently against the shared reader and task.' }),
        profile(),
        h('div', { class: 'assessment-table-wrap', tabindex: '0' }, h('table', { 'aria-label': 'Passage recommendations' },
          h('thead', {}, h('tr', {}, ['Passage', 'Recommendation', 'Deciding reason'].map(label => h('th', { scope: 'col', text: label })))),
          h('tbody', {}, state.passages.map((p, i) => h('tr', {},
            h('th', { scope: 'row' }, button(String(i + 1).padStart(2, '0') + ' · ' + p.title, () => choose(p.id), 'link', { 'aria-label': 'Open passage ' + (i + 1) })),
            h('td', { text: statusText(p) }), h('td', { text: p.report?.summary || 'No report supplied.' })))))),
        h('p', { class: 'quiet', text: 'No average rating is calculated. A localized obstacle cannot cancel a decisive missing prerequisite.' })));
    }
    async function load() {
      try {
        const response = await fetch('/api/assessment/' + id, { headers: { 'x-prose-token': token } });
        const value = await response.json();
        if (!response.ok) throw Error(value.error?.message || 'The assessment could not be loaded.');
        state = value; locationState(); saveLocation();
        document.title = state.title + ' | Prose review';
        $('subtitle').textContent = 'U.S. grade ' + state.reader.schoolGrade + ' · ' + state.counts.assessed + '/' + state.counts.passages + ' assessed';
        const search = h('input', { id: 'assessment-search', type: 'search', placeholder: 'Title or passage text', on: { input: e => { query = e.target.value.trim().toLowerCase(); renderQueue(); } } });
        rail.replaceChildren(h('p', { class: 'assessment-kicker', text: 'PASSAGE ASSESSMENT' }), h('h2', { class: 'assessment-batch-title', text: state.title }),
          h('p', { class: 'quiet', text: state.counts.assessed + ' of ' + state.counts.passages + ' assessed' }),
          button('Batch overview', () => choose(selected, true), '', { 'data-overview': '', 'aria-pressed': String(overview) }),
          h('label', { for: 'assessment-search', text: 'Find a passage' }), search, found, queue);
        renderQueue(); render();
      } catch (error) { $('subtitle').textContent = 'Batch unavailable'; app.replaceChildren(); UI.notice(error.message, 'Open the authenticated link returned by prose assessment open.'); }
    }
    window.addEventListener('hashchange', () => { if (!state) return; remember(); locationState(); renderQueue(); render(); });
    load();
  });
}());
