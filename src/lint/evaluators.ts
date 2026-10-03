import type { BlockKind, Doc } from '../ir.ts';
import type { Rule } from '../craft/rules.ts';
import type { Measurement } from '../measure/index.ts';
import type { LexiconHit } from '../measure/lexicon.ts';
import { wordOverlap, type DialogIssueKind } from '../measure/dialog.ts';
import type { Echo } from '../measure/style.ts';
import { NOT_SCRIPT_TEXT, PROSE_KINDS, SPOKEN_KINDS } from '../kinds.ts';
import { sentences, words } from '../text.ts';
import { TARGET_KEYS, VOICE_MIN_WORDS, type TargetKey, type Voice } from '../voice.ts';

export interface Hit { message: string; line?: number | null; speaker?: string; measured?: unknown; fix?: string }
export interface EvalContext { doc: Doc; m: Measurement; rule: Rule }
export type Evaluator = (ctx: EvalContext) => Hit[];

const sentenceMax = (kinds: (doc: Doc) => readonly BlockKind[]): Evaluator => ({ doc, rule }) =>
  doc.blocks
    .filter(b => kinds(doc).includes(b.kind))
    .flatMap(b => sentences(b.text).map(s => ({ b, n: words(s).length })))
    .filter(({ n }) => rule.value !== null && n > rule.value)
    .map(({ b, n }) => ({
      message: `Sentence of ${n} words (limit ${rule.value})`, line: b.line, speaker: b.speaker, measured: n,
      fix: 'Split at a clause boundary, or turn a series into a list.',
    }));

/**
 * Join echoed 3-grams that chain (the last two words of one are the first two of the next) and
 * share the same count and lines, so "in terms of the next steps" is one finding, not four.
 */
export function mergeEchoes(list: Echo[]): Echo[] {
  const key = (e: Echo) => `${e.count}|${e.lines.join(',')}`;
  const w = (e: Echo) => e.phrase.split(' ');
  const follows = (a: Echo, b: Echo) => a !== b && key(a) === key(b) && w(b)[0] === w(a).at(-2) && w(b)[1] === w(a).at(-1);
  const used = new Set<Echo>();
  const out: Echo[] = [];
  for (const e of list) {
    if (used.has(e)) continue;
    let head = e;
    const seen = new Set([e]);
    for (let p = list.find(x => !used.has(x) && !seen.has(x) && follows(x, head)); p; p = list.find(x => !used.has(x) && !seen.has(x) && follows(x, head))) {
      seen.add(p);
      head = p;
    }
    used.add(head);
    const phrase = w(head);
    for (let n = list.find(x => !used.has(x) && follows(head, x)); n; n = list.find(x => !used.has(x) && follows(head, x))) {
      used.add(n);
      phrase.push(w(n).at(-1)!);
      head = n;
    }
    out.push({ phrase: phrase.join(' '), count: e.count, lines: e.lines });
  }
  return out;
}

const SINGULAR = { minutes: 'minute', words: 'word', pages: 'page' } as const;
const count = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

const quote = (s: string) => `\u201C${s}\u201D`;

const perLine = (hits: LexiconHit[], message: (h: LexiconHit) => string, fix?: string): Hit[] =>
  hits.flatMap(h => h.lines.map(line => ({ message: message(h), line, measured: h.id, ...(fix ? { fix } : {}) })));

const issues = (kind: DialogIssueKind, message: (i: { node?: string; to?: string; pool?: string }) => string, fix?: string): Evaluator => ({ m }) =>
  (m.dialog?.issues ?? []).filter(i => i.kind === kind).map(i => ({ message: message(i), line: i.line, measured: i, ...(fix ? { fix } : {}) }));

/** Lowercase that ALL-CAPS description legitimately keeps: McDONALD, O'BRIEN, DANA's, 2nd. */
const ALLOWED_LOWER = [/\b(?:Mc|Mac|De|Di|La|Le|Van|Von|O')(?=[A-Z])/g, /(?<=[A-Z])['’]s\b/g, /(?<=\d)(?:st|nd|rd|th)\b/g];
const hasLowercase = (text: string) => /\p{Ll}/u.test(ALLOWED_LOWER.reduce((t, re) => t.replace(re, ''), text));

const TARGET_LABEL: Record<TargetKey, string> = {
  sentenceMean: 'sentence mean', contractionsPer1000: 'contractions per 1,000 words',
  hedgesPer1000: 'hedges per 1,000 words', exclaimPer100: 'exclamations per 100 sentences',
};
const projectVoices = (m: Measurement): Voice[] => m.voices.bibles;
const firstLine = (doc: Doc, speaker: string) => doc.blocks.find(b => b.speaker === speaker && PROSE_KINDS.has(b.kind))?.line ?? null;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A banned word or phrase as a whole-word, case-insensitive pattern; spaces in a phrase match any run of spaces. */
const bannedPattern = (term: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${term.trim().split(/\s+/).map(escapeRe).join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu');

/** Lead words that make a step read as an outcome rather than a mis-phrased action. */
const RESULT_LEAD = new Set(['the', 'your', 'it', 'its', 'this', 'that', 'these', 'those']);

const NOT_IMPERATIVE = new Set(['you', 'your', 'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'its', 'there', 'we', 'our', 'they', 'their', 'user', 'users', 'i', 'please']);
const LOCATION = new Set(['in', 'on', 'from', 'under', 'at', 'inside', 'within', 'after', 'before', 'when', 'if', 'to']);
function leadWord(text: string): string {
  const t = text.replace(/^optional:\s*/i, '');
  const first = (words(t)[0] ?? '').toLowerCase();
  if (LOCATION.has(first) && t.includes(',')) return (words(t.slice(t.indexOf(',') + 1))[0] ?? '').toLowerCase();
  return first;
}

export const EVALUATORS: Record<string, Evaluator> = {
  'youtube.segment.pace': ({ m, rule }) => m.segments.flatMap(s => {
    if (s.seconds <= 0) return [{ message: `Segment ${s.start}–${s.end} has no duration`, line: s.line, measured: s, fix: 'Make the end timestamp later than the start.' }];
    if (rule.value === null || s.wpm <= rule.value) return [];
    return [{ message: `${s.start}–${s.end}: ${s.words} words in ${s.seconds} s is ${s.wpm} wpm (cap ${rule.value}); cut about ${s.words - Math.floor((rule.value * s.seconds) / 60)} words`, line: s.line, measured: s, fix: 'Cut words or widen the segment.' }];
  }),

  'length.target': ({ m, rule, doc }) => (m.target?.checks ?? []).flatMap(c => {
    if (c.measured === null) return [{ message: `Target is in ${c.unit}, but this form (${doc.form}) cannot measure ${c.unit}`, line: null }];
    const off = c.ratio! - 1;
    if (rule.value === null || Math.abs(off) <= rule.value) return [];
    const pct = `${off > 0 ? '+' : ''}${Math.round(off * 100)}%`;
    const verb = off > 0 ? 'cut' : 'add';
    const wpm = m.spoken?.wpm;
    const delta = c.unit === 'minutes' && wpm ? Math.round(Math.abs(m.spoken!.words - c.target * wpm))
      : c.unit === 'words' ? Math.round(Math.abs(c.measured - c.target)) : null;
    const hint = delta === null ? '' : `; ${verb} about ${count(delta, 'word')}${c.unit === 'minutes' ? ` at ${wpm} wpm` : ''}`;
    return [{ message: `Runs ${count(c.measured, SINGULAR[c.unit])} against a ${c.target}-${SINGULAR[c.unit]} target (${pct})${hint}`, line: null, measured: c }];
  }),

  'style.sentence.max': sentenceMax(() => [...PROSE_KINDS]),
  'spoken.sentence.max': sentenceMax(doc => SPOKEN_KINDS[doc.format]),

  'readability.grade.report': ({ m }) => m.style.readingGrade === null ? [] : [{
    message: `Reading grade about ${m.style.readingGrade} (reported only; not a target)`, line: null, measured: m.style.readingGrade,
  }],

  'style.passive.report': ({ m }) => m.style.passive.count === 0 ? [] : [{
    message: `${m.style.passive.count} passive sentence(s), rate ${m.style.passive.rate} (reported only)`, line: null, measured: m.style.passive,
  }],

  'style.echo': ({ m, rule }) => mergeEchoes(m.style.echo.filter(e => rule.value !== null && e.count >= rule.value))
    .map(e => ({ message: `"${e.phrase}" appears ${e.count} times`, line: e.lines[0], measured: e, fix: 'Vary the wording or cut the repeats.' })),

  'plain.there-is': ({ m }) => m.style.thereIs.lines.map(line => ({
    message: 'Sentence opens with There is/are/was/were or Here is/are', line, fix: 'Rewrite around the real subject and verb.',
  })),

  'ai.copula-avoidance': ({ m }) => perLine(m.lexicon.aiTells.filter(h => h.id === 'copula-avoidance'),
    h => `${quote(h.examples[0])} in place of is/are`, "Use 'is' or 'are'."),

  'ai.artifact': ({ m }) => perLine(m.lexicon.aiTells.filter(h => h.tier === 'artifact'),
    h => `Chatbot artifact: ${quote(h.examples[0])}`, 'Remove the leaked markup or fill the placeholder.'),

  'ai.promotional': ({ m }) => perLine(m.lexicon.aiTells.filter(h => h.tier === 'promotional'),
    h => `Promotional word: ${quote(h.examples[0])}`, 'State the fact plainly; let the evidence carry the weight.'),

  'draft.placeholders': ({ m }) => !m.placeholders.length ? [] : [{
    message: `${m.placeholders.length} placeholder${m.placeholders.length === 1 ? '' : 's'} to fill: ${m.placeholders.map(p => `[${p.text}]`).join(', ')}`,
    line: m.placeholders[0].line, measured: m.placeholders,
  }],

  'ai.vocabulary': ({ m, rule }) => {
    const vocab = m.lexicon.aiTells.filter(h => h.tier === 'vocabulary');
    if (rule.value === null || vocab.length < rule.value) return [];
    return [{
      message: `${vocab.length} distinct AI-era vocabulary terms: ${vocab.map(h => quote(h.examples[0])).join(', ')}`,
      line: Math.min(...vocab.flatMap(h => h.lines)),
      measured: vocab.map(h => ({ id: h.id, eras: h.eras, lines: h.lines })),
      fix: 'Replace with plainer, more specific words.',
    }];
  },

  'procedure.filler': ({ m }) => perLine(m.lexicon.filler, h => `Filler word: ${quote(h.examples[0])}`, 'Delete it; the step reads the same without it.'),

  'procedure.step.imperative': ({ doc }) => doc.blocks
    .filter(b => b.kind === 'step' && NOT_IMPERATIVE.has(leadWord(b.text)))
    .map(b => ({
      message: `Step starts with "${words(b.text)[0]}" instead of a verb`, line: b.line,
      fix: RESULT_LEAD.has(leadWord(b.text))
        ? "This reads like a result: make it an unnumbered sentence under the previous step (e.g. 'The thermostat restarts.')"
        : 'Lead with the action: "Tap Reset", or "On the thermostat, press …".',
    })),

  'procedure.single-step': ({ doc }) => {
    const steps = doc.blocks.map((b, i) => ({ b, i })).filter(s => s.b.kind === 'step');
    const n = (k: number) => Number(steps[k].b.meta?.n ?? 1);
    // Step k joins step k-1 when they sit side by side (lazy "1. 1. 1." numbering), or when k is numbered as the
    // next step after k-1 with explanatory paragraphs in between.
    const joins = (k: number) => k > 0 && (steps[k].i === steps[k - 1].i + 1 || n(k) === n(k - 1) + 1);
    // A step numbered past 1 is the tail of a list, even if its head is elsewhere.
    return steps
      .filter((s, k) => n(k) <= 1 && !joins(k) && !(k + 1 < steps.length && joins(k + 1)))
      .map(({ b }) => ({ message: 'A one-step procedure reads better as a bullet', line: b.line }));
  },

  'spoken.duration.report': ({ doc, m }) => !m.spoken ? [] : [{
    message: (doc.format === 'dialog'
      ? `About ${m.spoken.minutes} min of recorded voice-over in total (all branches and barks) at ${m.spoken.wpm} wpm (${m.spoken.words} words)`
      : `Reads in about ${m.spoken.minutes} min at ${m.spoken.wpm} wpm (${m.spoken.words} words)`) +
      (m.spoken.longestBreathUnit ? `; longest breath unit ${m.spoken.longestBreathUnit.words} words (line ${m.spoken.longestBreathUnit.line})` : ''),
    line: null, measured: m.spoken,
  }],

  'script.runtime.report': ({ m }) => !m.script ? [] : [{
    message: `About ${m.script.pages} pages, ${m.script.minutes} min (range ${m.script.band[0]}\u2013${m.script.band[1]} min)`,
    line: null, measured: m.script,
  }],

  'script.unclosed-note': ({ doc }) => doc.blocks
    .filter(b => !NOT_SCRIPT_TEXT.has(b.kind) && /\[\[|\]\]/.test(b.text))
    .map(b => ({
      message: b.text.includes('[[') ? 'Unclosed [[ (note text is being read as script)' : 'Stray ]] (an empty line above ended the note)',
      line: b.line, speaker: b.speaker,
      fix: 'Close the note with ]], and keep two spaces on any blank line inside it.',
    })),

  'script.multicam.caps-action': ({ doc }) => doc.blocks
    .filter(b => b.kind === 'action' && hasLowercase(b.text))
    .map(b => ({ message: 'Multi-cam action should be ALL CAPS', line: b.line, fix: 'Capitalize the description; force with ! when it sits directly above dialogue.' })),

  'script.unprinted-marker': ({ doc }) => doc.blocks
    .filter(b => b.kind === 'section' && /^(?:COLD OPEN|TEASER|ACT\b|TAG\b|END OF\b)/i.test(b.text))
    .map(b => ({ message: `"${b.text}" is a section and will not print`, line: b.line, fix: `Write it as a centered line: >${b.text.toUpperCase()}<` })),

  'dialog.graph.dangling': ({ m }) => (m.dialog?.issues ?? [])
    .filter(i => i.kind === 'dangling' || i.kind === 'duplicate-id')
    .map(i => ({ message: i.kind === 'dangling' ? `Node ${i.node} points to missing node ${i.to}` : `Duplicate node id ${i.node}`, line: i.line, measured: i })),
  'dialog.graph.dead-end': issues('dead-end', i => `Node ${i.node} has no choices, no next, and no end`, 'Add choices, a next node, or end: true.'),
  'dialog.graph.unreachable': issues('unreachable', i => `Node ${i.node} cannot be reached from the start`, 'Link to it from the start, or delete it.'),
  'dialog.choices.fallback': issues('no-fallback', i => `Every choice at node ${i.node} is conditional`),

  'dialog.revisit.variety': issues('repeat-without-variants', i => `Node ${i.node} can be reached repeatedly but has no variants`,
    'Add variants: (rotating lines), or gate the links here with conditions so the player sees it once.'),
  'dialog.graph.exit': issues('no-exit', i => `No unconditional path from ${i.node} reaches an ending`,
    'Add an unconditional choice or fallback that reaches an end: true node.'),

  'voice.targets': ({ doc, m }) => {
    const voices = projectVoices(m);
    return Object.entries(m.speakers).flatMap(([speaker, stats]) => {
      const voice = voices.find(v => v.id === m.voices.matches[speaker]);
      if (!voice || stats.words < VOICE_MIN_WORDS) return [];
      return TARGET_KEYS.flatMap(key => {
        const range = voice.targets[key];
        const value = stats[key];
        if (!range || (value >= range[0] && value <= range[1])) return [];
        return [{
          message: `${speaker}: ${TARGET_LABEL[key]} ${value} is outside [${range[0]}, ${range[1]}] from voice ${voice.id}`,
          line: firstLine(doc, speaker), speaker,
          measured: { voice: voice.id, target: key, value, range, words: stats.words },
          fix: value > range[1] ? `Bring ${TARGET_LABEL[key]} down toward the bible's samples.` : `Bring ${TARGET_LABEL[key]} up toward the bible's samples.`,
        }];
      });
    });
  },

  'voice.bible-valid': ({ m }) => !m.voices.error ? [] : [{
    message: `Voice bibles not loaded: ${m.voices.error.message}`, line: null, measured: m.voices.error,
    fix: 'Fix the named file and field; the voice rules are skipped until every bible loads.',
  }],

  'voice.banned': ({ doc, m }) => {
    const voices = projectVoices(m);
    return doc.blocks.filter(b => b.speaker && PROSE_KINDS.has(b.kind)).flatMap(b => {
      const voice = voices.find(v => v.id === m.voices.matches[b.speaker!]);
      return (voice?.banned ?? []).filter(term => bannedPattern(term).test(b.text)).map(term => ({
        message: `${b.speaker} says "${term}", which voice ${voice!.id} bans`,
        line: b.line, speaker: b.speaker, measured: { voice: voice!.id, term },
        fix: 'Replace it with something this character would say.',
      }));
    });
  },

  'voice.unvoiced': ({ doc, m }) => !projectVoices(m).length ? [] : Object.entries(m.voices.matches)
    .filter(([, id]) => id === null)
    .map(([speaker]) => ({
      message: `${speaker} has no voice bible`, line: firstLine(doc, speaker), speaker,
      fix: `Add ${speaker} to a bible's speakers, or run prose voice fit <file> --speaker "${speaker}" --id <id>.`,
    })),

  'dialog.line.box': ({ m }) => (m.dialog?.overflow ?? []).map(o => ({
    message: `Needs ${o.lines} lines at ${m.dialog!.boxChars} characters (box allows ${m.dialog!.boxLines})`,
    line: o.line, measured: o, fix: 'Cut words or split into two beats.',
  })),

  'dialog.barks.variety': ({ doc, m, rule }) => [
    ...(m.dialog?.issues ?? []).filter(i => i.kind === 'single-variant')
      .map(i => ({ message: `Bark pool ${i.pool} has a single line`, line: i.line, measured: i, fix: 'Write variants so repeats do not grate.' })),
    ...(m.dialog?.nearRepeats ?? []).filter(p => rule.value !== null && p.similarity >= rule.value)
      .map(p => {
        const { shared, union } = wordOverlap(doc.blocks[p.ai]?.text ?? '', doc.blocks[p.bi]?.text ?? '');
        return {
          message: `Bark pool ${p.pool}: lines ${p.a} and ${p.b} share ${shared} of their ${union} distinct words (overlap ${p.similarity}, limit ${rule.value})`,
          line: p.b, measured: p, fix: 'Make the variants differ in more than one word.',
        };
      }),
  ],
};
