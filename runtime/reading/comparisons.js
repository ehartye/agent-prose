// Source and adaptation comparison on the shared review desk.
(function () {
  'use strict';
  const UI = window.ProseReview;
  UI.registerMode('comparison', () => {
    const { h, button, disclosure } = UI;
    const $ = id => document.getElementById(id);
    const comparisonId = /^\/c\/([a-z0-9-]+)\/?$/.exec(location.pathname)?.[1];
    const storageKey = 'prose-reading-token';
    let token = new URLSearchParams(location.search).get('t') || '';
    try {
      if (token) sessionStorage.setItem(storageKey, token);
      else token = sessionStorage.getItem(storageKey) || '';
      if (token) history.replaceState(null, '', location.pathname);
    } catch { /* A token in the current URL remains usable when storage is unavailable. */ }
    let state = null, busy = false;
    const edits = new Map(), controls = new Map();
    const notify = (message, error = false) => UI.notice(message, undefined, error ? 'error' : 'info');
    document.title = 'Reading-level comparison | Prose review';
    $('title').textContent = 'Reading-level comparison';
    $('subtitle').hidden = true;
    $('review-mode-settings').append(
      h('div', { class: 'comparison-settings' },
        button('Reload comparison', reload, 'toolbar-button', { id: 'comparison-reload' }),
        h('p', { class: 'quiet', text: 'Reload keeps unsaved edits in this page. Choose records a version; the source stays unchanged.' })));
    $('app').replaceChildren(h('section', { id: 'comparison-board', class: 'comparison-board', 'aria-label': 'Source and adaptations', tabindex: '0' }));
    const board = $('comparison-board');

    async function request(suffix = '', body) {
      const response = await fetch('/api/comparison/' + comparisonId + suffix, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'x-prose-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      let value;
      try { value = await response.json(); }
      catch { throw Error('The review server did not return a readable response.'); }
      if (!response.ok) {
        const error = Error(value.error?.message || 'The request failed.');
        error.code = value.error?.code;
        throw error;
      }
      return value;
    }
    const isDirty = edit => !!edit && edit.body !== edit.baseBody;
    const anyDirty = () => [...edits.values()].some(isDirty);
    function gradeText(range) { return range[0] === range[1] ? 'U.S. grade ' + range[0] : 'U.S. grades ' + range[0] + '\u2013' + range[1]; }
    function targetDirection(doc) {
      const source = state.source.reader?.readingLevel?.range, target = doc.reader?.readingLevel?.range;
      if (doc.id === 'source') return '';
      if (source && target) {
        if (target[0] === source[0] && target[1] === source[1]) return 'Same requested target';
        if (target[1] < source[0]) return 'Lower requested target';
        if (target[0] > source[1]) return 'Higher requested target';
        return 'Overlapping requested targets';
      }
      const sourceGrade = state.source.reader?.schoolGrade, targetGrade = doc.reader?.schoolGrade;
      if (!sourceGrade || !targetGrade) return '';
      return (targetGrade === sourceGrade ? 'Same' : targetGrade < sourceGrade ? 'Lower' : 'Higher') + ' intended grade';
    }
    function needsMarkdownView(doc) {
      // The analytical parser omits fenced code and pipe-led rows, and reduces images to alt text.
      // Preserve the complete body as text whenever that view would hide source material.
      return /^[ \t]*(?:`{3,}|~{3,}|\|)/m.test(doc.body)
        || /^[ \t]*:?-{3,}:?[ \t]*\|[^\n]*$/m.test(doc.body)
        || /!\[[^\]]*\]\s*(?:\(|\[)/.test(doc.body)
        || /<(?:\/?[A-Za-z][^>]*|!--[\s\S]*?)>/.test(doc.body);
    }
    function reading(doc) {
      const article = h('article', { class: 'comparison-reading reading' });
      if (needsMarkdownView(doc)) {
        article.append(
          h('p', { class: 'comparison-render-note quiet', text: 'Showing Markdown to preserve content this reading view cannot render.' }),
          h('pre', { class: 'comparison-markdown', text: doc.body }));
        return article;
      }
      for (const block of doc.blocks) {
        if (block.kind === 'heading') {
          const level = Math.max(3, Math.min(6, Number(block.meta?.level || 1) + 2));
          article.append(h('h' + level, { text: block.text }));
        } else if (block.kind === 'list-item' || block.kind === 'step') {
          const tag = block.kind === 'step' ? 'ol' : 'ul';
          let list = article.lastElementChild;
          if (!list || list.tagName.toLowerCase() !== tag) {
            list = h(tag, block.kind === 'step' && Number.isInteger(block.meta?.n) ? { start: block.meta.n } : {});
            article.append(list);
          }
          list.append(h('li', { text: block.text }));
        } else article.append(h(block.kind === 'quote' ? 'blockquote' : 'p', { text: block.text }));
      }
      if (!doc.blocks.length) article.append(h('p', { class: 'quiet', text: doc.body || 'No text in this version.' }));
      return article;
    }
    function readerDetails(doc) {
      const reader = doc.reader, report = doc.readability;
      const unavailable = { 'insufficient-sample': 'sample too short', 'unsupported-language': 'language not supported', 'unsupported-genre': 'form not supported' };
      return disclosure('Reader and diagnostic', { class: 'comparison-metadata' },
        h('p', { text: reader?.schoolGrade ? 'Intended class: U.S. grade ' + reader.schoolGrade : 'Intended class: not supplied' }),
        h('p', { text: reader?.readingLevel ? 'Requested reading level: ' + gradeText(reader.readingLevel.range) : 'Requested reading level: not supplied' }),
        reader?.priorKnowledge ? h('p', { text: 'Prior knowledge: ' + reader.priorKnowledge }) : null,
        h('p', { text: report?.status === 'estimated' && report.estimate !== null ? 'Flesch\u2013Kincaid estimate: ' + report.estimate : 'Flesch\u2013Kincaid estimate: unavailable (' + (unavailable[report?.status] || 'reader language not supplied') + ')' }),
        report?.counts ? h('p', { text: 'Formula sample: ' + report.counts.words + ' words in ' + report.counts.paragraphs + ' paragraph blocks. Code, tables and other excluded blocks are not counted.' }) : null,
        h('p', { class: 'quiet', text: 'A formula estimate does not establish comprehension or audience suitability.' }),
        h('p', { class: 'comparison-path quiet', text: doc.path }));
    }
    function updateActions() {
      const unsaved = anyDirty();
      for (const doc of state.variants) {
        const item = controls.get(doc.id), edit = edits.get(doc.id), dirty = isDirty(edit);
        const chosen = state.choiceCurrent && state.choice?.variant === doc.id;
        item.edit.hidden = !!edit;
        item.edit.disabled = busy || state.sourceChanged;
        item.save.hidden = !edit;
        item.save.disabled = busy || !dirty || state.sourceChanged;
        item.discard.hidden = !edit;
        item.discard.disabled = busy;
        item.choose.disabled = busy || unsaved || state.sourceChanged || chosen;
        item.choose.setAttribute('aria-pressed', String(chosen));
        item.status.textContent = dirty ? 'Unsaved changes' : chosen ? 'Chosen version' : state.choice?.variant === doc.id && !state.choiceCurrent ? 'Choice needs review' : unsaved ? 'Save or discard edits before choosing' : '';
        item.panel.dataset.chosen = String(chosen);
        if (item.textarea) item.textarea.disabled = busy;
      }
      $('comparison-reload').disabled = busy;
    }
    function render() {
      const positions = new Map([...board.querySelectorAll('.comparison-column')].map(panel => [panel.dataset.document, panel.querySelector('.comparison-scroll').scrollTop]));
      const left = board.scrollLeft;
      controls.clear();
      board.replaceChildren();
      $('title').textContent = state.title || 'Reading-level comparison';
      document.title = (state.title || 'Reading-level comparison') + ' | Prose review';
      const banner = $('banner');
      banner.hidden = !state.sourceChanged && (!state.choice || state.choiceCurrent);
      banner.textContent = state.sourceChanged ? 'The source has changed. Create a fresh comparison before editing or choosing.' : state.choice && !state.choiceCurrent ? 'The chosen version has changed. Choose again after reviewing.' : '';
      for (const doc of [state.source, ...state.variants]) {
        const source = doc.id === 'source', name = source ? 'Source' : 'Version ' + doc.id;
        const edit = edits.get(doc.id), direction = targetDirection(doc);
        const panel = h('section', { class: 'comparison-column card', 'data-document': doc.id, 'aria-label': name });
        panel.append(h('header', { class: 'comparison-head' },
          h('div', { class: 'comparison-kicker' }, h('span', { class: 'eyebrow', text: source ? 'Source \u00b7 Read only' : name }), needsMarkdownView(doc) ? null : h('span', { class: 'comparison-words quiet', text: doc.words + ' words' })),
          h('h2', { text: doc.label }),
          h('p', { class: 'comparison-direction', text: direction })));
        const content = h('div', { class: 'comparison-scroll' + (edit ? ' editing' : ''), tabindex: '0', 'aria-label': name + ' text' }, readerDetails(doc));
        if (edit) {
          if (edit.baseHash !== doc.hash) content.append(h('p', { class: 'comparison-conflict', text: 'Stored text changed while you were editing. Your edits are preserved.' }), disclosure('Compare stored text', {}, reading(doc)));
          const textarea = h('textarea', { class: 'comparison-editor', 'aria-label': 'Markdown body for version ' + doc.id, spellcheck: 'true', value: edit.body,
            on: { input: event => { edit.body = event.target.value; updateActions(); } } });
          content.append(h('p', { class: 'comparison-editor-label quiet', text: 'Markdown body' }), textarea);
          controls.set(doc.id, { textarea });
        } else content.append(reading(doc));
        panel.append(content);
        if (!source) {
          const status = h('p', { class: 'comparison-edit-status', 'aria-live': 'polite' });
          const editButton = button('Edit', () => beginEdit(doc.id), 'toolbar-button');
          const save = button('Save changes', () => saveEdit(doc.id), 'primary');
          const discard = button('Discard changes', () => discardEdit(doc.id), 'link');
          const choose = button('Choose this version', () => chooseVersion(doc.id), 'primary');
          panel.append(h('footer', { class: 'comparison-actions' }, status, h('div', { class: 'comparison-buttons' }, editButton, save, discard, choose)));
          controls.set(doc.id, { ...(controls.get(doc.id) || {}), panel, status, edit: editButton, save, discard, choose });
        }
        board.append(panel);
        content.scrollTop = positions.get(doc.id) || 0;
      }
      board.scrollLeft = left;
      updateActions();
    }
    function beginEdit(id) {
      if (busy || state.sourceChanged) return;
      const doc = state.variants.find(item => item.id === id);
      edits.set(id, { body: doc.body, baseBody: doc.body, baseHash: doc.hash });
      render();
      controls.get(id).textarea.focus();
    }
    function discardEdit(id) {
      if (busy) return;
      edits.delete(id); render();
      notify('Unsaved changes discarded. The stored version is unchanged.');
    }
    async function reload() {
      if (busy) return;
      busy = true; if (state) updateActions();
      try {
        state = await request(); render();
        $('review-settings').close();
        if (anyDirty()) notify('Comparison reloaded. Your unsaved edits are preserved; compare stored text before saving.');
      } catch (error) { notify(error.message, true); }
      finally { busy = false; if (state) updateActions(); }
    }
    async function mutate(suffix, body, saved) {
      if (busy || state.sourceChanged) return;
      busy = true; updateActions();
      try {
        state = await request(suffix, { ...body, expectedRevision: state.revision });
        if (saved) edits.delete(saved);
        render();
        notify(saved ? 'Changes saved. Review the version before choosing.' : 'Version chosen. The source is unchanged.');
      } catch (error) {
        notify(error.code === 'E_CONFLICT' ? 'The comparison changed elsewhere. Your edits are preserved. Reload comparison to compare stored text, then try again.' : error.message, true);
      } finally { busy = false; updateActions(); }
    }
    function saveEdit(id) {
      const edit = edits.get(id);
      if (isDirty(edit)) return mutate('/edit', { variant: id, body: edit.body }, id);
    }
    function chooseVersion(id) {
      if (anyDirty()) { notify('Save or discard all unsaved edits before choosing a version.', true); return; }
      return mutate('/choose', { variant: id });
    }
    window.addEventListener('beforeunload', event => { if (anyDirty()) { event.preventDefault(); event.returnValue = ''; } });
    if (!comparisonId) { notify('This comparison link is incomplete. Open it again from the project.', true); return; }
    reload();
  });
}());
