import type { BlockKind, Doc } from '../ir.ts';
import { AI_TELLS } from '../measure/lexicon.ts';
import { PROSE_KINDS } from '../kinds.ts';
import { per1000, plain, round2, sentenceRanges, sentences, words } from '../text.ts';

/**
 * Detectors for habits of default model prose. They report spans with a reason and a revision direction; they never
 * say who wrote a text. The hard artifact patterns and the era-tagged vocabulary come from the shared lexicon
 * (craft/lexicon/ai-tells.json), the same entries `prose lint` reads, so the two never drift apart.
 */

export type Tier = 'hard' | 'soft';

export interface Finding {
  tier: Tier;
  family: string;
  line: number;
  /** A span from the draft, at most 120 characters. */
  text: string;
  eras?: string[];
  /** One plain sentence on what makes the span generic. */
  why: string;
  /** A direction for revising the span: add the fact, name the source, cut the formula. Never a replacement phrase. */
  direction: string;
}

/** A block of the draft as the detectors read it: markup stripped and inline code masked, with the raw source where formatting matters. */
export interface Unit {
  kind: BlockKind;
  /** Index of the block in the document, so neighbouring list items can be told apart from separated ones. */
  index: number;
  line: number;
  text: string;
  raw?: string;
  /** The destinations of inline links, joined by spaces: the preparation step keeps a link's text and drops its target, but a tracking parameter or placeholder in the target is still an artifact. */
  targets?: string;
  /** Heading level. */
  level?: number;
}

export interface Ctx {
  /** Formatting detectors read Markdown only. */
  markdown: boolean;
  /** Fountain and dialog drafts: only hard artifacts and vocabulary run (dialogue and stage directions read differently). */
  limited: boolean;
}

interface Span {
  start: number;
  end: number;
  /** Offsets index `raw` rather than `text` (formatting detectors). */
  inRaw?: boolean;
  /** Offsets index `targets`. */
  inTargets?: boolean;
  eras?: string[];
  /** A reason that names this span's own numbers, in place of the family's fixed sentence. */
  why?: string;
}

type Scope = 'all' | 'prose' | 'markdown';
type Target = 'body' | 'heading' | 'any';

/**
 * `corpus`: word lists from published corpus studies (abstract-only in our notes). `field-guide`: Wikipedia's
 * descriptive field guide to informational writing. `reader-reported`: habits readers and our own baseline audits
 * named, with no published source.
 */
export type Evidence = 'corpus' | 'field-guide' | 'reader-reported';

export interface Family {
  id: string;
  tier: Tier;
  /** `all` runs on every format, `prose` skips Fountain and dialog, `markdown` runs on Markdown only. */
  scope: Scope;
  on: Target;
  /** How well the pattern is documented: see Evidence. */
  evidence: Evidence;
  sources: string[];
  why: string;
  direction: string;
  find: (u: Unit, ctx: Ctx, units: Unit[], i: number) => Span[];
}

const MAX_SPAN = 120;
const WIKI = 'wikipedia-signs-ai';

const spansOf = (re: RegExp, text: string, trim?: RegExp): Span[] =>
  [...text.matchAll(re)].map(m => {
    const lead = trim ? (m[0].match(trim)?.[0].length ?? 0) : 0;
    return { start: m.index + lead, end: m.index + m[0].length };
  });

const entries = (pred: (e: typeof AI_TELLS.entries[number]) => boolean) => AI_TELLS.entries.filter(pred);
const lexiconSpans = (list: typeof AI_TELLS.entries, text: string): Span[] =>
  list.flatMap(e => spansOf(e.re, text, /^[.!?\s]+/).map(s => ({ ...s, ...(e.eras ? { eras: e.eras } : {}) })));

const VOCABULARY = entries(e => e.tier === 'vocabulary');
const ARTIFACTS = entries(e => e.tier === 'artifact');
const PROMOTIONAL = entries(e => e.tier === 'promotional');
const COPULA = entries(e => e.id === 'copula-avoidance');
const NOT_ONLY = entries(e => e.id === 'negative-parallelism');

/**
 * Chat residue: text addressed to a chat user instead of to the reader. These phrases are ordinary in speech and in
 * stories, so the rule is narrow. Only a prose paragraph of a Markdown draft is read (never dialog or Fountain speech,
 * never quoted text), and:
 *   - "as an AI language model" or "as an AI assistant" counts anywhere outside quotation marks;
 *   - "I hope this helps", "Let me know if you ..." and "Would you like me to ..." count only as the first or last
 *     sentence of the paragraph, starting that sentence, and not as a speech tag ("... , said the ranger");
 *   - "Certainly!" counts only as the paragraph's opening word, followed by an offer ("Here is ...", "Below ...") or
 *     standing alone.
 * "Let me know if the key doesn't fit." and "Certainly! That is what the lawyer said." are ordinary writing and are not findings.
 */
const AI_SELF = /\bas an AI (?:language model|assistant)\b/giu;
const OFFER_SENTENCE = /^(?:I hope (?:this|that|it) helps\b|Let me know if you\b|Would you like me to\b)/iu;
const CERTAINLY_OPENER = /^Certainly!(?=\s*$|\s+(?:Here(?:['’]s|\s+is|\s+are)|Below|Let me|Sure|I(?:['’]ve|\s+have|['’]ll|\s+will)|The following)\b)/u;
const SPEECH_TAG = /\b(?:said|says|asked|asks|replied|answered|whispered|shouted|called|told|muttered|added|cried|murmured)\b/iu;
const QUOTED = /“[^”]*”|"[^"\n]*"/gu;
const CUTOFF = /\bas of my (?:last )?knowledge (?:update|cut-?off)\b/giu;

const UNDUE = new RegExp([
  String.raw`\b(?:stands?|serves?|remains?)\s+as\s+(?:a|an|the)\s+(?:\p{L}+\s+)?testament\b`,
  String.raw`\bis\s+a\s+testament\s+to\b`,
  String.raw`\bplays?\s+(?:a|an|the)\s+(?:pivotal|crucial|vital|key)\s+role\b`,
  String.raw`\bevolving\s+landscape\b`,
  String.raw`\brich\s+tapestr(?:y|ies)\b`,
  String.raw`\bindelible\s+mark\b`,
  String.raw`\bin\s+today['’]s(?:\s+(?!(?:the|a|an|of|and|to|with|about|for|on)\b)[\p{L}-]+){0,3}\s+world\b`,
].join('|'), 'giu');

const PARTICIPLE = /,\s+(?:highlighting|underscoring|emphasi[sz]ing|reflecting|showcasing|demonstrating|illustrating|ensuring|fostering|contributing\s+to)\b[^.!?]{1,100}(?:[.!?]|$)/giu;

const NOT_PREFIX = String.raw`(?:(?:it|this|that)\s+(?:is|was)\s+not|(?:it|this|that)['’]s\s+not|(?:it|this|that)\s+(?:isn['’]t|wasn['’]t))`;
const NOT_SEP = String.raw`\s*(?:[,;]|[—–]|--)\s*`;
const NOT_SECOND = String.raw`(?:it|this|that)(?:\s+(?:is|was)|['’]s)\b`;
const NEGATIVE = new RegExp(String.raw`\b${NOT_PREFIX}\s+[^.!?;,—–]{1,60}?${NOT_SEP}${NOT_SECOND}`, 'giu');

const WEASEL_VERB = String.raw`(?:argues?|says?|suggests?|believes?|claims?|contends?|(?:have|has)\s+(?:noted|cited|suggested))\b`;
const WEASEL = new RegExp(String.raw`\b(?:(?:(?:some|many|several)\s+)?(?:experts|observers|critics|analysts|scholars|commentators|historians)|many|some|studies|research)\s+${WEASEL_VERB}`, 'giu');
const NAMES = String.raw`[A-Z][\p{L}'’-]+(?:(?:,|\s+and|\s+&)\s+[A-Z][\p{L}'’-]+)*(?:\s+et\s+al\.?)?`;
const MARKER = String.raw`\[\^?\d+(?:[,–-]\s*\d+)*\]|\[\^[^\]]+\]`;
/**
 * A source in the sentence: a numbered or footnote marker, an author-year parenthesis "(Smith et al., 1998)", a narrative
 * citation "Smith (2020)", a URL, or a link (the unit text marks a stripped link with ⟦⟧).
 */
const CITATION = new RegExp(String.raw`${MARKER}|\(${NAMES},?\s+\d{4}[a-z]?\)|${NAMES}(?:['’]s)?\s+\(\d{4}[a-z]?\)|https?://|⟦⟧`, 'u');
/** A marker that stands right after the sentence, as its own range ("Experts argue this. [3]"). */
const TRAILING_MARKER = new RegExp(String.raw`^\s*(?:${MARKER})`, 'u');

const DESPITE = /\bDespite\s+(?:its|their|this|these|the)\b[^.!?]{0,120}?,\s+[^.!?]{0,80}?\b(?:faces|face|continues\s+to\s+face|continue\s+to\s+face|still\s+faces)\b[^.!?]{0,80}?\b(?:challenges?|obstacles?|hurdles?)\b/giu;

const CLOSING = /^(?:Overall|In conclusion),\s/u;

/**
 * Group 1: openers and announcements. All reader-reported: readers and our baseline audits named them; no published source.
 *
 * Stock opener: only the first sentence of the passage's first paragraph, and only the opening words are the span.
 * "Every <noun>" skips time words ("Every Monday", "Every year"), which open ordinary letters and diaries.
 */
const TIME_WORDS = String.raw`(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|morning|afternoon|evening|night|week|weekend|month|year|summer|winter|spring|autumn|fall|time|once|other|now|one)`;
const STOCK_OPENER = new RegExp([
  String.raw`^Every\s+(?!${TIME_WORDS}\b)\p{L}+`,
  String.raw`^In\s+today['’]s`,
  String.raw`^In\s+an\s+era\s+of`,
  String.raw`^In\s+a\s+world\s+where`,
  String.raw`^Imagine\b`,
  String.raw`^Have\s+you\s+ever\s+wondered`,
].join('|'), 'iu');

function stockOpener(u: Unit, _ctx: Ctx, units: Unit[], i: number): Span[] {
  if (u.kind !== 'paragraph' || units.findIndex(x => x.kind === 'paragraph') !== i) return [];
  const first = sentenceRanges(u.text)[0];
  if (!first) return [];
  const m = STOCK_OPENER.exec(u.text.slice(first[0], first[1]));
  return m ? [{ start: first[0], end: first[0] + m[0].length }] : [];
}

const ANNOUNCEMENT = /\b(?:We['’]re|We\s+are|I['’]m|I\s+am)\s+(?:(?:so|very|truly|really)\s+)?(?:excited|thrilled|delighted|proud|pleased)\s+to\s+(?:share|announce|introduce|unveil)\b/giu;

const ROADMAP_VERBS = String.raw`(?:look\s+at|explore|cover|walk\s+through|dive\s+into|discuss|break\s+down)`;
const ROADMAP = new RegExp([
  String.raw`\bIn\s+this\s+(?:post|article|guide|piece|section|chapter),?\s+(?:we(?:['’]ll|\s+will)|I(?:['’]ll|\s+will))\s+${ROADMAP_VERBS}`,
  String.raw`(?:^|(?<=[.!?]\s))Below\s+(?:is|are)\s+(?:a|an|the)\s+(?:overview|summary|breakdown|look|guide|list|walkthrough|rundown)\b`,
  String.raw`(?:^|(?<=[.!?]\s))Below,?\s+we\s+(?:will\s+|['’]ll\s+)?(?:look|explore|cover|walk|discuss|break|outline|summari[sz]e|describe)\b`,
  String.raw`(?:^|(?<=[.!?]\s))Here(?:['’]s|\s+is)\s+what\s+(?:we(?:['’]ll|\s+will)|you(?:['’]ll|\s+will)|I(?:['’]ll|\s+will))\s+(?:cover|learn|find|explore|see|look\s+at)\b`,
].join('|'), 'giu');

/** "delve into" is not here: `delve` is already a vocabulary finding, and "let's delve" is one dive-in finding that swallows it (RANK). */
const PHYSICAL_DIVE = String.raw`(?!\s+(?:the\s+)?(?:water|pool|lake|sea|ocean|river|quarry|waves?)\b)`;
const DIVE_IN = new RegExp([
  String.raw`\blet['’]s\s+(?:dive\s+in|dive\s+into|unpack|explore|delve)\b`,
  String.raw`\bdeep[- ]dives?\b`,
  String.raw`\b(?:dive|dives|diving)\s+(?:deep(?:ly)?\s+)?into\b${PHYSICAL_DIVE}`,
].join('|'), 'giu');

/**
 * Group 2: phrasing patterns. Reader-reported except restating-closer (an extension of the field guide's closing summary).
 */
const startsSentence = (text: string, at: number) => sentenceRanges(text).some(([a]) => a === at);

/** "Whether you're a ... or ...": the first clause must be a noun or activity ("a pro", "building"), so "Whether you're coming or not" is left alone. */
const WHETHER = /\bWhether\s+you(?:['’]re|\s+are)\s+(?:a|an|the|new|just|looking|trying|building|planning|starting|running|managing|working)\b[^.!?,;]{1,80}?\s+or\s+[^.!?,;]{1,50}/gu;
const whetherYoure = (u: Unit): Span[] => spansOf(WHETHER, u.text).filter(s => startsSentence(u.text, s.start));

/**
 * "from X to Y" as a range of examples: each side one or two lowercase words ending in a plural or abstract noun, no
 * determiner, no number, no capitalised name; a verb of motion just before ("moved from vials to plates") is a real transfer.
 */
const FROM_TO = /\b[Ff]rom\s+(\p{Ll}[\p{Ll}-]*(?:\s+\p{Ll}[\p{Ll}-]*)?)\s+to\s+(\p{Ll}[\p{Ll}-]*(?:\s+\p{Ll}[\p{Ll}-]*)?)(?![\p{L}-])/gu;
const DETERMINER = /^(?:the|a|an|this|that|these|those|my|our|your|its|their|his|her|one|each|every|some|any)$/;
const NOUNISH = /(?:[^sui]s|ies|ity|ness|ment|tion|sion)$/;
const MOTION = /\b(?:mov\w*|transferr?\w*|copi\w*|copy|pour\w*|ship\w*|carr\w+|convert\w*|translat\w*|switch\w*|go|goes|went|gone|chang\w*|pass\w*|flow\w*|migrat\w*|import\w*|export\w*|sent|send|draw\w*|drain\w*|shift\w*)\s+(?:\S+\s+){0,2}$/iu;
function fromTo(u: Unit): Span[] {
  const out: Span[] = [];
  for (const m of u.text.matchAll(FROM_TO)) {
    const x = m[1].split(/\s+/);
    const yAll = m[2].split(/\s+/);
    // Try the longer right side first, then the single word before it ("from startups to enterprises are ...").
    const y = yAll.length === 2 && NOUNISH.test(yAll[1]) && !DETERMINER.test(yAll[0]) ? yAll : yAll.slice(0, 1);
    if (!NOUNISH.test(x[x.length - 1]) || !NOUNISH.test(y[y.length - 1])) continue;
    if (DETERMINER.test(x[0]) || DETERMINER.test(y[0])) continue;
    if (MOTION.test(u.text.slice(Math.max(0, m.index - 40), m.index))) continue;
    const rightStart = m.index + m[0].length - m[2].length;
    out.push({ start: m.index, end: rightStart + y.join(' ').length });
  }
  return out;
}

const WORTH_NOTING = /\bit(?:['’]s|\s+is)(?:\s+also)?\s+(?:worth\s+(?:noting|mentioning|remembering)(?:\s+that)?|important\s+to\s+(?:note|remember|understand|recogni[sz]e|keep\s+in\s+mind)\s+that)\b/giu;

/**
 * Marketing verbs, exact words. "Elevate" counts only with a figurative object (your brand, the game), "unlock" only before
 * power, potential or full, "empowered to" is a legal grant, and "leverage" the verb needs an auxiliary or pronoun before it.
 */
const MARKETING = new RegExp([
  String.raw`\bleverag(?:es|ing)\b`,
  String.raw`\bleveraged\b(?!\s+(?:buyouts?|loans?|etfs?|funds?|positions?|finance)\b)`,
  String.raw`(?<=\b(?:to|will|can|could|would|should|must|we|you|they|I|and|or|that|which|who|helps?|lets?)\s)leverage\b`,
  String.raw`\bstreamlin(?:e|es|ed|ing)\b`,
  String.raw`\bseamless(?:ly)?\b(?!\s+(?:steel|tubes?|pipes?|garments?|stockings?|tights?)\b)`,
  String.raw`\bunlock(?:s|ed|ing)?\s+the\s+(?:power|potential|full)\b`,
  String.raw`\belevat(?:e|es|ed|ing)\s+(?:your|their|our|its|the|his|her)\s+(?:\p{L}+\s+)?(?:brands?|business(?:es)?|game|experience|work|workflow|presence|strategy|content|style|cooking|skills|performance|marketing|teams?|results|dish(?:es)?|craft|writing|approach|standards)\b`,
  String.raw`\bempower(?:s|ing)?\b`,
  String.raw`\bempowered\b(?!\s+to\b)`,
  String.raw`\bharness(?:es|ed|ing)?\s+the\b`,
  String.raw`\bnavigat(?:e|es|ed|ing)\s+the\s+complexit(?:y|ies)\b`,
  String.raw`\bgame[- ]changers?\b`,
  String.raw`\bcutting-edge\b|\bcutting\s+edge(?=\s+(?:technolog|research|solution|tool|platform|design|software|approach))`,
  String.raw`\bbest-in-class\b`,
].join('|'), 'giu');
/** A word the vocabulary or promotional lists already report is theirs; the same span is not reported twice. */
const marketingVerbs = (u: Unit): Span[] => {
  const taken = lexiconSpans([...VOCABULARY, ...PROMOTIONAL], u.text);
  return spansOf(MARKETING, u.text).filter(s => !taken.some(t => s.start < t.end && t.start < s.end));
};

const RESTATING = /^(?:In\s+summary|In\s+short|In\s+essence|To\s+sum\s+up|Ultimately|At\s+the\s+end\s+of\s+the\s+day),\s/u;
/** The last paragraph, when another paragraph came before it. "In conclusion," and "Overall," belong to closing-opener. */
function restatingCloser(u: Unit, _ctx: Ctx, units: Unit[], i: number): Span[] {
  if (u.kind !== 'paragraph' || !RESTATING.test(u.text)) return [];
  const paragraphs = units.map((x, n) => (x.kind === 'paragraph' ? n : -1)).filter(n => n >= 0);
  if (paragraphs.length < 2 || paragraphs[paragraphs.length - 1] !== i) return [];
  const first = sentenceRanges(u.text)[0];
  return [{ start: 0, end: first ? first[1] : u.text.length }];
}

const INLINE_HEADER = /^\*\*([^*\n]{1,60}?)(?::\*\*|\*\*:)\s+\S/u;
const EMOJI_LEAD = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)/u;
const BOLD = /\*\*[^*\n][^*]*?\*\*|(?<![\p{L}\p{N}_])__[^_\n][^_]*?__(?![\p{L}\p{N}_])/gu;
const MINOR = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'vs', 'via', 'with', 'from', 'into', 'per', 'over', 'off']);

const isListItem = (u: Unit) => u.kind === 'list-item' || u.kind === 'step';
/** The label of a bullet that opens with a bold label and a colon, lower-cased; undefined for any other unit. */
const headerLabel = (u: Unit | undefined): string | undefined =>
  u && isListItem(u) ? INLINE_HEADER.exec(u.raw ?? '')?.[1].trim().toLowerCase() : undefined;

/** Labels of an ordinary callout list ("**Note:** ..."); these bullets never count as the chat-style layout. */
const CALLOUT_LABELS = new Set(['note', 'warning', 'tip', 'caution', 'important', 'example']);
/** Abstract-noun labels typical of generated bullet lists; three different ones in a row are enough to flag. */
const ABSTRACT_LABELS = new Set([
  'efficiency', 'scalability', 'flexibility', 'reliability', 'performance', 'security', 'innovation', 'quality', 'collaboration',
  'sustainability', 'transparency', 'accessibility', 'usability', 'maintainability', 'productivity', 'adaptability', 'integration',
  'optimization', 'optimisation', 'engagement', 'visibility', 'resilience', 'agility', 'creativity', 'growth', 'impact', 'value', 'trust',
  'community', 'education', 'simplicity', 'consistency', 'compatibility', 'availability', 'durability', 'versatility', 'convenience',
]);

/**
 * Block indexes of the bullets that count as inline-header bullets: a run of adjacent bullets (neighbouring blocks) with
 * bold labels, at least four long, or three long when the labels are all different abstract labels. Callout labels
 * (Note, Warning, Tip, Caution, Important, Example) are ordinary and end a run. Computed once per document.
 */
const flaggedBullets = (() => {
  const cache = new WeakMap<Unit[], Set<number>>();
  return (units: Unit[]): Set<number> => {
    const cached = cache.get(units);
    if (cached) return cached;
    const out = new Set<number>();
    let run: Array<{ unit: Unit; label: string }> = [];
    const close = () => {
      const labels = run.map(r => r.label);
      if (run.length >= 4 || (run.length === 3 && new Set(labels).size === 3 && labels.every(l => ABSTRACT_LABELS.has(l)))) {
        for (const r of run) out.add(r.unit.index);
      }
      run = [];
    };
    for (const u of units) {
      const label = headerLabel(u);
      if (label === undefined || CALLOUT_LABELS.has(label)) { close(); continue; }
      if (run.length && u.index - run[run.length - 1].unit.index !== 1) close();
      run.push({ unit: u, label });
    }
    close();
    cache.set(units, out);
    return out;
  };
})();

/**
 * Ordinary words that are not capitalised mid-sentence: function words, generic verbs, adjectives and the nouns that fill
 * headings (takeaways, steps, team, culture). A heading whose capitalised words are mostly these is capitalised by habit.
 * A name or a place is not here, so "Alice Walker Memorial Hospital Annual Report" and "The Treaty of Westphalia and Its
 * Aftermath" are left alone. About 336 words; it is a heuristic, not a dictionary.
 */
const HEADING_COMMON = new Set((
  'a an the and or but for nor so yet of in on at to by with from into over about as is are be your you our my ' +
  'their its this that these those how what why when where who which build building create creating make making ' +
  'get getting start started use using understand understanding improve improving manage managing leverage ' +
  'leveraging unlock drive driving ensure ensuring achieve achieving explore exploring learn learning grow ' +
  'growing scale scaling optimize optimizing implement implementing develop developing design designing choose ' +
  'choosing find finding take taking move moving work working set setting plan planning avoid avoiding adopt ' +
  'adopting embrace embracing foster fostering enhance enhancing maximize maximizing streamline streamlining ' +
  'navigate navigating overcome overcoming address addressing apply applying turn turning keep keeping put ' +
  'putting see seeing know knowing think thinking key great best better good new next modern future common ' +
  'effective essential important critical crucial major main top simple easy powerful strong successful real full ' +
  'complete ultimate practical current strategic digital global comprehensive potential positive innovative ' +
  'dynamic sustainable overall general basic advanced core high low long short early final first last other more ' +
  'most many several various different specific unique clear right proper smart small large big takeaways ' +
  'takeaway steps step tips tip ways way team teams culture role roles technology education impact importance ' +
  'benefits benefit challenges challenge opportunities opportunity strategies strategy practices practice ' +
  'approach approaches overview summary conclusion introduction background considerations consideration guide ' +
  'guidelines principles principle points point factors factor trends trend directions direction goals goal ' +
  'success growth performance quality value process processes system systems solutions solution framework models ' +
  'model methods method results outcomes outcome insights insight lessons lesson recommendations recommendation ' +
  'landscape world life business businesses organizations organization leadership communication collaboration ' +
  'innovation development management experience customers customer users user data information knowledge skills ' +
  'skill training change changes problems problem issues issue needs need thing things people workplace market ' +
  'industry community environment project projects product products service services journey power art science ' +
  'case rise age era time year years day days today tomorrow'
).split(' '));

function titleCase(u: Unit): boolean {
  if ((u.level ?? 1) < 2) return false; // a document title is title-cased by convention
  const ws = words(u.text);
  if (ws.length < 4 || !/^\p{Lu}/u.test(ws[0])) return false;
  const major = ws.filter(w => !MINOR.has(w.toLowerCase()));
  const capitalised = (w: string) => /^[\p{Lu}\p{N}]/u.test(w);
  if (major.length < 3 || !major.every(capitalised)) return false;
  // Title case lowercases its small words; without any (a name like "Alice Walker Memorial Hospital") a short heading is likelier a name.
  const lowerMinor = ws.slice(1).some(w => MINOR.has(w) && w === w.toLowerCase());
  if (!lowerMinor && ws.length < 6) return false;
  // Most of the capitalised words must be ordinary words; a heading made of names and places is capitalised for its own reasons.
  const caps = ws.filter(capitalised);
  return caps.filter(w => HEADING_COMMON.has(w.toLowerCase())).length * 2 > caps.length;
}

function chatResidue(u: Unit): Span[] {
  if (u.kind !== 'paragraph') return [];
  const quoted = [...u.text.matchAll(QUOTED)].map(m => [m.index, m.index + m[0].length] as const);
  const inQuote = (at: number) => quoted.some(([a, b]) => at >= a && at < b);
  const found: Span[] = spansOf(AI_SELF, u.text).filter(s => !inQuote(s.start));
  const ranges = sentenceRanges(u.text);
  for (const [a, b] of new Set([ranges[0], ranges.at(-1)].filter((r): r is [number, number] => !!r))) {
    const sentence = u.text.slice(a, b);
    if (OFFER_SENTENCE.test(sentence) && !SPEECH_TAG.test(sentence) && !inQuote(a)) found.push({ start: a, end: b });
  }
  const opener = u.text.match(CERTAINLY_OPENER);
  if (opener && !inQuote(0)) found.push({ start: 0, end: opener[0].length });
  return found;
}

function weasel(u: Unit): Span[] {
  const ranges = sentenceRanges(u.text);
  return spansOf(WEASEL, u.text).filter(s => {
    const r = ranges.find(([a, b]) => s.start >= a && s.start < b);
    const end = r?.[1] ?? u.text.length;
    return !CITATION.test(u.text.slice(r?.[0] ?? 0, end)) && !TRAILING_MARKER.test(u.text.slice(end));
  });
}

const closing = (u: Unit): Span[] => {
  if (u.kind !== 'paragraph' || !CLOSING.test(u.text)) return [];
  const first = sentenceRanges(u.text)[0];
  return [{ start: 0, end: first ? first[1] : u.text.length }];
};

/** Every family, in report order. `why` and `direction` are fixed sentences per family. */
export const FAMILIES: Family[] = [
  {
    id: 'artifact', tier: 'hard', scope: 'all', on: 'any', evidence: 'field-guide', sources: [WIKI],
    why: 'Markup or a placeholder left over from a chat tool; it is a defect in finished text whoever wrote it.',
    direction: 'Remove the leaked markup, or fill in the real value.',
    find: u => [...lexiconSpans(ARTIFACTS, u.text), ...(u.targets ? lexiconSpans(ARTIFACTS, u.targets).map(s => ({ ...s, inTargets: true })) : [])],
  },
  {
    id: 'chat-residue', tier: 'hard', scope: 'markdown', on: 'any', evidence: 'field-guide', sources: [WIKI],
    why: 'A sentence addressed to a chat user rather than to the reader, found at the start or end of a prose paragraph, outside quotation marks.',
    direction: 'Cut the sentence; the document should end where its content does.',
    find: chatResidue,
  },
  {
    id: 'knowledge-cutoff', tier: 'hard', scope: 'all', on: 'any', evidence: 'field-guide', sources: [WIKI],
    why: 'A disclaimer about when a tool’s information stopped, which a reader of the document cannot use.',
    direction: 'State the date the facts were checked and name the source, or cut the disclaimer.',
    find: u => spansOf(CUTOFF, u.text),
  },
  {
    id: 'vocabulary', tier: 'soft', scope: 'all', on: 'body', evidence: 'corpus', sources: [WIKI, 'kobak-excess-vocabulary', 'juzek-ward-delve', 'liang-mapping-llm-use'],
    why: 'A word that appears far more often in default model prose than in earlier writing, so it reads generic on its own.',
    direction: 'Say the specific thing the word gestures at, or cut it if it adds no fact.',
    find: u => lexiconSpans(VOCABULARY, u.text),
  },
  {
    id: 'copula-avoidance', tier: 'soft', scope: 'prose', on: 'body', evidence: 'field-guide', sources: [WIKI],
    why: 'A showier verb stands where a plain is or are says the same thing.',
    direction: 'Say what the thing is, with the plain verb.',
    find: u => lexiconSpans(COPULA, u.text),
  },
  {
    id: 'promotional', tier: 'soft', scope: 'prose', on: 'body', evidence: 'field-guide', sources: [WIKI],
    why: 'A word that praises where a fact would show the same thing.',
    direction: 'State the fact and let it carry the weight; name the source of any praise.',
    find: u => lexiconSpans(PROMOTIONAL, u.text),
  },
  {
    id: 'undue-significance', tier: 'soft', scope: 'prose', on: 'body', evidence: 'field-guide', sources: [WIKI],
    why: 'The sentence says the subject matters instead of saying what happened.',
    direction: 'Say what happened and what changed, with the date or the number.',
    find: u => spansOf(UNDUE, u.text),
  },
  {
    id: 'trailing-participle', tier: 'soft', scope: 'prose', on: 'body', evidence: 'field-guide', sources: [WIKI, 'reinhart-llm-style'],
    why: 'A trailing clause that comments on the sentence instead of adding a fact.',
    direction: 'Add the specific fact the clause points at, or cut the clause.',
    find: u => spansOf(PARTICIPLE, u.text),
  },
  {
    id: 'negative-parallelism', tier: 'soft', scope: 'prose', on: 'body', evidence: 'field-guide', sources: [WIKI],
    why: 'The sentence sets up a claim only to deny it, so the real point arrives second.',
    direction: 'State the point directly, once.',
    find: u => [...spansOf(NEGATIVE, u.text), ...lexiconSpans(NOT_ONLY, u.text)],
  },
  {
    id: 'weasel-attribution', tier: 'soft', scope: 'prose', on: 'body', evidence: 'field-guide', sources: [WIKI],
    why: 'The claim is credited to unnamed experts or studies that the reader cannot check.',
    direction: 'Name the source with a citation, or cut the attribution.',
    find: weasel,
  },
  {
    id: 'despite-challenges', tier: 'soft', scope: 'prose', on: 'body', evidence: 'field-guide', sources: [WIKI],
    why: 'A formula that grants a strength, then names unspecified challenges without a single example.',
    direction: 'Name the actual problem and when it happened, or cut the formula.',
    find: u => spansOf(DESPITE, u.text),
  },
  {
    id: 'closing-opener', tier: 'soft', scope: 'prose', on: 'body', evidence: 'field-guide', sources: [WIKI],
    why: 'A paragraph that opens by announcing that it is a summary, then repeats earlier points.',
    direction: 'End on the last new fact, or say something the body has not.',
    find: closing,
  },
  {
    id: 'inline-header-bullets', tier: 'soft', scope: 'markdown', on: 'body', evidence: 'field-guide', sources: [WIKI, 'freeburg-last-fingerprint'],
    why: 'Each bullet opens with a bolded label and a colon, a chat-style layout that breaks the prose into fragments.',
    direction: 'Write the items as sentences, or as a plain list whose labels earn their place.',
    find: (u, _ctx, units) => {
      return flaggedBullets(units).has(u.index) ? [{ start: 0, end: u.raw!.length, inRaw: true }] : [];
    },
  },
  {
    id: 'emoji-lead', tier: 'soft', scope: 'markdown', on: 'any', evidence: 'field-guide', sources: [WIKI, 'freeburg-last-fingerprint'],
    why: 'An emoji opens the heading or bullet, a chat-style decoration the content does not need.',
    direction: 'Cut the emoji and let the words carry the point.',
    find: u => (u.kind === 'heading' || isListItem(u)) && EMOJI_LEAD.test(u.text) ? [{ start: 0, end: u.text.length }] : [],
  },
  {
    id: 'title-case-heading', tier: 'soft', scope: 'markdown', on: 'heading', evidence: 'field-guide', sources: [WIKI, 'freeburg-last-fingerprint'],
    why: 'Every major word of the heading is capitalised, a headline habit where sentence case is the norm.',
    direction: 'Write the heading in sentence case, unless your style guide says otherwise.',
    find: u => titleCase(u) ? [{ start: 0, end: u.text.length }] : [],
  },
  {
    id: 'mechanical-bold', tier: 'soft', scope: 'markdown', on: 'body', evidence: 'field-guide', sources: [WIKI, 'freeburg-last-fingerprint'],
    why: 'Several phrases in one paragraph are bold, so none of them stands out.',
    direction: 'Keep bold for the one term a reader must not miss, and cut the rest.',
    find: u => {
      if (u.kind !== 'paragraph' || !u.raw) return [];
      const bold = [...u.raw.matchAll(BOLD)];
      // The span runs from the first bold phrase to the last, not over the whole paragraph.
      return bold.length >= 3 ? [{ start: bold[0].index, end: bold[bold.length - 1].index + bold[bold.length - 1][0].length, inRaw: true }] : [];
    },
  },
  {
    id: 'stock-opener', tier: 'soft', scope: 'prose', on: 'body', evidence: 'reader-reported', sources: [],
    why: 'The passage opens with a formula that fits almost any topic instead of with its own first fact.',
    direction: 'Open with the specific fact, example or number the passage is about.',
    find: stockOpener,
  },
  {
    id: 'announcement-filler', tier: 'soft', scope: 'prose', on: 'body', evidence: 'reader-reported', sources: [],
    why: 'The sentence announces that the writer is pleased before saying what the news is.',
    direction: 'Lead with the news itself and cut the feeling that introduces it.',
    find: u => spansOf(ANNOUNCEMENT, u.text),
  },
  {
    id: 'roadmap-sentence', tier: 'soft', scope: 'prose', on: 'body', evidence: 'reader-reported', sources: [],
    why: 'The sentence tells the reader what the text will do instead of doing it.',
    direction: 'Cut the roadmap and begin with the first point.',
    find: u => spansOf(ROADMAP, u.text),
  },
  {
    id: 'dive-in', tier: 'soft', scope: 'prose', on: 'body', evidence: 'reader-reported', sources: [],
    why: 'A stock invitation to start, where the text could simply start.',
    direction: 'Cut the invitation and begin with the first concrete point.',
    find: u => spansOf(DIVE_IN, u.text),
  },
  {
    id: 'whether-youre', tier: 'soft', scope: 'prose', on: 'body', evidence: 'reader-reported', sources: [],
    why: 'The sentence addresses every possible reader at once, so it says nothing about the actual one.',
    direction: 'Name the reader this is for, or start with what they get.',
    find: whetherYoure,
  },
  {
    id: 'from-to-range', tier: 'soft', scope: 'prose', on: 'body', evidence: 'reader-reported', sources: [],
    why: 'A "from X to Y" pair stands for a whole range of cases instead of naming one.',
    direction: 'Name the one or two cases that matter, with a detail for each.',
    find: fromTo,
  },
  {
    id: 'worth-noting', tier: 'soft', scope: 'prose', on: 'body', evidence: 'reader-reported', sources: [],
    why: 'The sentence announces that a point matters instead of making the point.',
    direction: 'State the point itself, and say why it matters only if that is not obvious.',
    find: u => spansOf(WORTH_NOTING, u.text),
  },
  {
    id: 'marketing-verbs', tier: 'soft', scope: 'prose', on: 'body', evidence: 'reader-reported', sources: [],
    why: 'A verb or label from promotional copy stands where a plain verb and a measurable result would do.',
    direction: 'Say what the thing does, to what, with what result.',
    find: marketingVerbs,
  },
  {
    id: 'restating-closer', tier: 'soft', scope: 'prose', on: 'body', evidence: 'field-guide', sources: [WIKI],
    why: 'The last paragraph opens by announcing a wrap-up, then repeats earlier points.',
    direction: 'End on the last new fact, or on the next step for the reader.',
    find: restatingCloser,
  },
];

/** Where each audit claim is sourced, for the references table: every family, the measured context and the standing limits. */
export const AUDIT_SOURCES: Array<{ id: string; sources: string[] }> = [
  ...FAMILIES.map(f => ({ id: f.id, sources: f.sources })),
  { id: 'measured', sources: ['freeburg-last-fingerprint', 'reinhart-llm-style'] },
  { id: 'limits', sources: ['liang-gpt-detectors-bias', 'russell-expert-detectors', 'kobak-excess-vocabulary'] },
];

// Higher rank wins where one span sits inside another from a different family (the vocabulary word inside the formula that holds it).
const RANK: Record<string, number> = {
  'undue-significance': 3, 'trailing-participle': 3, 'negative-parallelism': 3, 'weasel-attribution': 3, 'despite-challenges': 3,
  'dive-in': 3, promotional: 2, 'copula-avoidance': 2, vocabulary: 1,
};

const squeeze = (s: string) => {
  const t = s.replace(/⟦⟧/g, '').replace(/\s+/g, ' ').trim();
  return t.length > MAX_SPAN ? `${t.slice(0, MAX_SPAN - 1).trimEnd()}…` : t;
};

/** Offsets of the start of every line of `s`, so a line lookup is a binary search rather than a scan from the top. */
function lineStartsOf(s: string): number[] {
  const starts = [0];
  for (let i = s.indexOf('\n'); i !== -1; i = s.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}
/** The number of newlines before `offset`: the index of the last line start at or before it. */
function newlinesBefore(starts: number[], offset: number): number {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** Findings for the units, hard first, then soft, each in order of appearance. */
export function detect(units: Unit[], ctx: Ctx): Finding[] {
  interface Found { family: Family; unit: number; span: Span; finding: Finding }
  const found: Found[] = [];
  const startsCache = new Map<string, number[]>();
  const lineAt = (u: Unit, i: number, source: string, span: Span) => {
    const key = `${i}:${span.inRaw ? 'raw' : span.inTargets ? 'targets' : 'text'}`;
    let starts = startsCache.get(key);
    if (!starts) startsCache.set(key, starts = lineStartsOf(source));
    return u.line + newlinesBefore(starts, span.start);
  };
  units.forEach((u, i) => {
    for (const family of FAMILIES) {
      if (family.scope === 'markdown' && !ctx.markdown) continue;
      if (family.scope === 'prose' && ctx.limited) continue;
      if (family.on === 'body' && u.kind === 'heading') continue;
      if (family.on === 'heading' && u.kind !== 'heading') continue;
      let last = -1;
      for (const span of family.find(u, ctx, units, i).sort((a, b) => a.start - b.start)) {
        if (span.start < last) continue; // overlapping matches of one family are one finding
        last = span.end;
        const source = span.inRaw ? u.raw! : span.inTargets ? u.targets! : u.text;
        found.push({
          family, unit: i, span,
          finding: {
            tier: family.tier, family: family.id, line: lineAt(u, i, source, span), text: squeeze(source.slice(span.start, span.end)),
            ...(span.eras ? { eras: span.eras } : {}), why: span.why ?? family.why, direction: family.direction,
          },
        });
      }
    }
  });
  // A span inside a higher-ranked span of the same unit is dropped. Sweep each unit's spans by start, keeping the
  // furthest end seen per rank, so the check is linear in the number of findings.
  const dropped = new Set<Found>();
  const byUnit = new Map<number, Found[]>();
  for (const f of found) {
    if (f.span.inRaw || f.span.inTargets) continue;
    const list = byUnit.get(f.unit);
    if (list) list.push(f); else byUnit.set(f.unit, [f]);
  }
  for (const list of byUnit.values()) {
    list.sort((a, b) => a.span.start - b.span.start);
    const maxEnd: number[] = [];
    for (let i = 0; i < list.length;) {
      let j = i;
      while (j < list.length && list[j].span.start === list[i].span.start) j++;
      for (let k = i; k < j; k++) {
        const r = RANK[list[k].family.id] ?? 0;
        maxEnd[r] = Math.max(maxEnd[r] ?? -1, list[k].span.end);
      }
      for (let k = i; k < j; k++) {
        const rank = RANK[list[k].family.id] ?? 0;
        for (let r = rank + 1; r < maxEnd.length; r++) if ((maxEnd[r] ?? -1) >= list[k].span.end) { dropped.add(list[k]); break; }
      }
      i = j;
    }
  }
  const kept = found.filter(f => !dropped.has(f));
  const tierOrder = (t: Tier) => (t === 'hard' ? 0 : 1);
  return kept
    .map((f, n) => ({ f, n }))
    .sort((a, b) => tierOrder(a.f.finding.tier) - tierOrder(b.f.finding.tier) || a.f.finding.line - b.f.finding.line || a.n - b.n)
    .map(({ f }) => f.finding);
}

/** Inline code becomes one neutral word, and a link keeps its text plus a marker the weasel check reads as a source. */
const prepare = (raw: string) => raw
  .replace(/`[^`]*`/g, 'code')
  .replace(/(?<!!)\[([^\]\n]+)\]\(([^)\s]*)[^)]*\)/g, '$1⟦⟧');

const linkTargets = (raw: string): string =>
  [...raw.replace(/`[^`]*`/g, 'code').matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]*)[^)]*\)/g)].map(m => m[1]).filter(Boolean).join(' ');

/** The blocks the audit reads. Code (fenced and inline) and block quotes never reach a detector. */
export function unitsOf(doc: Doc, raws?: string[]): Unit[] {
  const useRaw = doc.format === 'markdown' && raws !== undefined && raws.length === doc.blocks.length;
  const units: Unit[] = [];
  doc.blocks.forEach((b, index) => {
    if (doc.format === 'markdown') {
      if (!['paragraph', 'step', 'list-item', 'heading'].includes(b.kind)) return;
      const raw = raws?.[index];
      units.push({
        kind: b.kind, index, line: b.line, text: useRaw ? plain(prepare(raw!)) : b.text,
        ...(useRaw ? { raw: raw! } : {}), ...(useRaw && linkTargets(raw!) ? { targets: linkTargets(raw!) } : {}), ...(b.kind === 'heading' ? { level: Number(b.meta?.level ?? 1) } : {}),
      });
    } else if (PROSE_KINDS.has(b.kind) && b.kind !== 'quote') {
      units.push({ kind: b.kind, index, line: b.line, text: b.text });
    }
  });
  return units;
}

export interface Measured {
  emDashesPer1000: number | null;
  /** Standard deviation of sentence length over its mean. */
  sentenceLengthVariation: number | null;
  tripletListsPer1000: number | null;
  /** is and are as a share of is, are and showier substitutes. */
  isAreShare: number | null;
  notes: string[];
}

/** The leading lookbehind stops the match restarting inside a long word, which made this quadratic. */
const TRIPLET = /(?<![\p{L}'’-])[\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2},\s+[\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2},\s+(?:and|or)\s+\p{L}/gu;
const IS_ARE = /\b(?:is|are)\b/giu;
const SUBSTITUTES = /\b(?:serves?|stands?|functions?|operates?|acts?)\s+as\b|\b(?:represents|constitutes|boasts|embodies)\b/giu;

export const MEASURED_NOTES = [
  'Em dash rates run from 0.0 to 9.1 per 1,000 words across models, so a rate says little by itself.',
  'Reported for context only; none of these values is flagged.',
  'The is/are share counts is and are against serves/stands/functions/operates/acts as, represents, constitutes, boasts and embodies.',
];

/** The context values for the body units, never flagged. `words` is the denominator. */
export function measureUnits(units: Unit[]): { words: number; measured: Measured } {
  const body = units.filter(u => u.kind !== 'heading');
  const text = body.map(u => u.text);
  const W = text.reduce((n, t) => n + words(t).length, 0);
  const lengths = text.flatMap(t => sentences(t).map(s => words(s).length));
  const mean = lengths.length ? lengths.reduce((a, n) => a + n, 0) / lengths.length : 0;
  const sd = lengths.length ? Math.sqrt(lengths.reduce((a, n) => a + (n - mean) ** 2, 0) / lengths.length) : 0;
  const count = (re: RegExp) => text.reduce((n, t) => n + (t.match(re)?.length ?? 0), 0);
  const is = count(IS_ARE);
  const sub = count(SUBSTITUTES);
  return {
    words: W,
    measured: {
      emDashesPer1000: W ? per1000(count(/—/g), W) : null,
      sentenceLengthVariation: lengths.length >= 2 && mean > 0 ? round2(sd / mean) : null,
      tripletListsPer1000: W ? per1000(count(TRIPLET), W) : null,
      isAreShare: is + sub ? round2(is / (is + sub)) : null,
      notes: MEASURED_NOTES,
    },
  };
}
