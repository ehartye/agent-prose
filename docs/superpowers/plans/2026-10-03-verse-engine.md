# Verse Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure and lint poems and song lyrics (syllables, stress, rhyme, scheme, form conformance) with every pronunciation result tagged by how trustworthy it is.

**Architecture:** Verse text stays Markdown; the verse measurement re-splits paragraph blocks into lines, looks words up in a vendored CMUdict (lazy, gzip, `node:zlib`) with an affix rule and the existing heuristic as fallback, and feeds `Measurement.verse`. Forms gain an optional `verse` definition; new `verse.*`/`lyric.*` rules with evaluators and cited references; new `prose scan` and `prose pronounce` commands.

**Tech Stack:** Node 24 running TypeScript directly, zod, commander, vitest (all existing). No new dependency.

Design: `docs/superpowers/specs/2026-10-03-verse-engine-design.md` (read it first; it is the source of truth for names, rules and severities). Decision: bundle a pronouncing dictionary with a heuristic fallback (recorded in the maintainer's notes).

**Working agreements for every task**
- Branch `verse-engine`; never commit to `main`. TDD: write the failing test, quote the failing line, then implement. Never weaken a test silently; list every changed expectation.
- Match the surrounding code: comment density, naming, `ProseError` codes, JSON-by-default commands. Read `src/lint/evaluators.ts`, `src/measure/index.ts`, `src/craft/rules.ts`, `src/forms.ts` and an existing command in `src/commands/` before writing.
- Run `npx vitest run`, `npm run typecheck` and `npm run refs:check` before each commit; commit message style `feat: ...` / `test: ...`; end commits with the attribution line the harness requires.
- Source facts for rationales and references come from the clippings and summaries the controller names in each task (ask if one is missing). Quote only what a source supports; if a number is unsupported, call it a convention (`derived: true`).
- Do not touch `~/.agent-prose` or the real home in tests (`useTempHome()` / `tmpProject()` helpers exist).

---

### Task 1: Dictionary file, loader, and the accuracy spike (GATE)

**Files:**
- Create: `scripts/refresh-cmudict.mjs`, `craft/data/cmudict.dict.gz`, `craft/data/CMUDICT-LICENSE.txt`, `src/verse/cmudict.ts`, `tests/verse-cmudict.test.ts`, `tests/fixtures/verse/gold.json`, `tests/verse-spike.test.ts`, `docs/research/verse-dictionary-spike.md`
- Modify: `README.md` (acknowledgement section)

- [ ] **Step 1:** `scripts/refresh-cmudict.mjs` fetches `https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict` (Node `fetch`), strips `;;;` comment lines, lowercases nothing, gzips to `craft/data/cmudict.dict.gz`, and prints entry count, raw size and gzip size. Also fetch the upstream `LICENSE` into `craft/data/CMUDICT-LICENSE.txt` verbatim. Run it; record the numbers.
- [ ] **Step 2 (test first):** `tests/verse-cmudict.test.ts`: `loadCmudict()` returns `Map<string, string[][]>`; `cmudict.get('hello')` has one variant starting `HH`; a word with variants (`read`, `lead` or `the`) has more than one; comments are gone; calling it twice returns the same instance (cached); entry count above 120,000. Confirm red, then implement `src/verse/cmudict.ts` (gunzip with `node:zlib`, parse `word(n) PH1 PH2 ...`, variants grouped by base word in order).
- [ ] **Step 3: gold set.** `tests/fixtures/verse/gold.json`: about 30 lines from public-domain texts whose structure is independently known (Amazing Grace common meter 8/6/8/6; Shakespeare Sonnet 18 first quatrain and couplet with ababcdcdefefgg; an Edward Lear limerick AABBA; a haiku translation; a ballad quatrain; include hard words: "wind", "read", "love/move/dove", "heaven", "fire", a name, and an archaic word). Each entry: `{ text, syllables, endWord, group }` where lines with the same `group` letter and poem id rhyme perfectly; also list a few explicit non-rhyming pairs. Syllable counts must come from the published form or an unambiguous reading; mark any line you are unsure of `"uncertain": true` and exclude it from scoring.
- [ ] **Step 4: spike test.** `tests/verse-spike.test.ts` scores two paths on the gold set: (a) the existing heuristic `syllables()` per word summed per line plus a letters-based rhyme key (last vowel group + tail); (b) dictionary lookup (first variant) with the heuristic for missing words, rhyme key from the last stressed vowel to the end. Metrics: exact syllable-count accuracy per line, and rhyme-pair accuracy (a pair is right when both paths agree with the gold labels). The test only asserts that both run and prints the numbers; the numbers go in the doc.
- [ ] **Step 5:** Write `docs/research/verse-dictionary-spike.md` with: the method, the gold set size, accuracy for both paths, the words each path got wrong, dictionary size (raw, gzip) and load time (measure with `performance.now()`), and the decision: PROCEED if path (b) is better on both metrics; otherwise STOP and report. Keep the doc honest: n is about 30, so say the sample is small.
- [ ] **Step 6:** README acknowledgement of CMU. Commit.

**STOP condition:** if the dictionary does not beat the heuristic on both metrics, or gzip size is over 2 MB, or load time is over 500 ms, report BLOCKED with the numbers and do not continue to Task 2; the controller returns to the owner.

---

### Task 2: `pronounce()` with affix rule and honest fallback

**Files:** Create `src/verse/pronounce.ts`, `tests/verse-pronounce.test.ts`. Modify: `src/text.ts` only if the heuristic needs an exported helper.

Interface:

```ts
export interface Pronunciation {
  word: string;
  source: 'dict' | 'affix' | 'guessed';
  phones: string[];          // best variant, Arpabet with stress digits; [] when guessed
  syllables: number;
  syllablesAlt?: number;     // set when variants disagree on the count (ambiguous)
  stress: string;            // '1' '0' '2' per syllable; '?' for every syllable when guessed
  variants: number;
  rhymeKey: string;          // dict: phones from the last stressed vowel; guessed: letters from the last vowel group
}
export function pronounce(word: string): Pronunciation;
```

- [ ] Tests first: `love` and `dove` share a rhymeKey, `move` does not; a monosyllable is one syllable; `fire` and `hour` per the dictionary's own count; plural/possessive/`-ed`/`-ing`/`-ly` of a dictionary word give `source: 'affix'` with the right syllable count (`walked` = 1, `wanted` = 2 from the dictionary, `kisses`); an invented word (`glorpish`) is `guessed` with `'?'` stress; apostrophes and case are normalised (`Summer's`, `THOU`); a heteronym (`read`) reports `variants > 1` and, if counts differ, `syllablesAlt`. Hyphenated words are split and joined.
- [ ] Implement. Affix rules: `'s`/`s`/`es` (+Z, +S or +IH Z by the stem's last phone), `ed`/`d` (+D, +T, +IH D), `ing` (+IH NG), `ly` (+L IY); only used when the stem is in the dictionary and the whole word is not. Document each rule in a comment with an example.
- [ ] Commit.

---

### Task 3: Verse lines and per-line prosody

**Files:** Create `src/verse/lines.ts`, `src/verse/prosody.ts`, `tests/verse-lines.test.ts`, `tests/verse-prosody.test.ts`.

- [ ] Tests first for `extractVerse(doc: Doc)`: returns `{ stanzas: Stanza[]; markup: Array<{ line: number; kind: string }> }`. A `Stanza` is `{ section: string | null; lines: VerseLine[] }`, a `VerseLine` is `{ text: string; line: number /* 1-based source line */ }`. Paragraph blocks split on `\n` with `line + offset`; a heading block sets the section for the stanzas after it (heading text trimmed, level ignored); blank-line-separated paragraphs are separate stanzas; list-item/step/quote blocks in a verse draft are reported in `markup` (not silently dropped) and heading blocks are not markup problems. Frontmatter notes and `note` blocks are ignored.
- [ ] Tests first for `analyseLine(text: string)`: `{ syllables, syllablesAlt?, stress, words: Pronunciation[], endWord, ending: 'stop' | 'weak' | 'run-on', guessed: string[], ambiguous: string[] }`. Monosyllable stress becomes `'?'` (flexible); polysyllables keep the dictionary's `1`, `2` and `0` as returned, and meter checking decides what a secondary stress means. End punctuation class: `. ! ? ; :` stop, `, – —` weak, none run-on. Closing quotes and brackets are ignored when finding it. An empty or punctuation-only line returns zero syllables and no end word.
- [ ] Implement; commit.

---

### Task 4: Rhyme classes and schemes

**Files:** Create `src/verse/rhyme.ts`, `tests/verse-rhyme.test.ts`.

```ts
export type RhymeClass = 'identity' | 'perfect' | 'assonance' | 'consonance' | 'eye' | 'none';
export function rhymeClass(a: Pronunciation, b: Pronunciation): { class: RhymeClass; uncertain: boolean };
export function scheme(endWords: Pronunciation[]): { scheme: string; nearScheme: string; pairs: Array<{ a: number; b: number; class: RhymeClass; uncertain: boolean }> };
```

- [ ] Tests first from a table: `day/say` perfect; `love/dove` perfect; `love/move` none or consonance (decide from the definitions below and pin it); `cat/cut` consonance; `time/mine` assonance (stressed vowel differs? check: AY in both, tails differ → assonance); `light/light` identity; `fire/choir`; a guessed word makes `uncertain: true`; scheme letters assigned in order of first appearance (`abab`, `abba`, `aabba`), a line with no end word breaks nothing (gets `-`); `scheme` counts identity+perfect only, `nearScheme` also assonance and consonance.
- [ ] Spike findings that change the rules (docs/research/verse-dictionary-spike.md): (1) `rhymeClass` compares ALL variant pairs and takes the best class; if the best class came from a non-first variant it sets `uncertain: true` ("wind" lists the verb first, so wind/sinned only rhymes via a variant). (2) Add class `eye`: the words share their last 3 or more letters, sound different, and no variant pair rhymes (temperate/date, love/move). `eye` is not a rhyme for `scheme` or `nearScheme`; it is reported so findings can say "may be an eye rhyme or a historical pronunciation". Tests: love/move is `eye`, wind/sinned is perfect and uncertain, temperate/date is `eye`.
- [ ] Definitions (from the spec): perfect = identical phones from the last stressed vowel to the end and different onset; identity = same word; assonance = same stressed vowel, different tail; consonance = same final consonant cluster, different vowel. Document in the file header that these follow Prosodic's definitions, are conventions, and that dialect limits apply (US English).
- [ ] Commit.

---

### Task 5: Form definitions and meter conformance

**Files:** Modify `src/forms.ts`, `craft/forms.json`, `craft/GUIDE.md` (short verse section). Create `src/verse/meter.ts`, `tests/verse-forms.test.ts`, `tests/verse-meter.test.ts`.

- [ ] Tests first: `FormSchema` accepts the optional `verse` object from the spec and rejects unknown keys; all existing forms still parse unchanged; the nine new forms (`free-verse`, `haiku`, `limerick`, `ballad`, `sonnet-shakespearean`, `sonnet-petrarchan`, `villanelle`, `sestina`, `song`) exist with `format: markdown`, `spoken: false`, the specified `verse` fields, and a `basis` that names the poets.org page (or, for `song`, says the sources are weak). Sonnet scheme strings and villanelle/sestina definitions are exactly as in the spec.
- [ ] `src/verse/meter.ts`: `checkMeter(lines: LineAnalysis[], meter: { foot, feet }) → Array<{ line: number; syllables; expected: number; deviations: number[]; skipped?: 'guessed' }>`. Expected pattern per foot (iamb `01`, trochee `10`, anapest `001`, dactyl `100`, `common` = alternating 4/3 stress counts). A deviation is a position where a polysyllabic word's `1` falls in a weak slot or its `0` in a strong slot; `?` never deviates; one extra weak final syllable is allowed; lines containing a guessed word are `skipped: 'guessed'`. Tests: Sonnet 18 line 1 passes; a clear trochaic line in an iambic form deviates; a line with a guessed word is skipped.
- [ ] Commit.

---

### Task 6: `Measurement.verse` and lyric measures

**Files:** Create `src/measure/verse.ts`, `tests/measure-verse.test.ts`. Modify `src/measure/index.ts`, `src/measure/` types as needed, `tests/measure.test.ts` only for the new field (non-verse forms get `verse: null`; list as a changed expectation).

- [ ] Tests first: a sonnet fixture (use Sonnet 18 in `tests/fixtures/verse/`) measured with form `sonnet-shakespearean` gives 14 lines, scheme `ababcdcdefefgg`, per-line syllables, no meter skips beyond guessed ones; free-verse fixture reports syllable mean/sd/min/max and ending classes; a `song` fixture with `## Verse 1`, `## Chorus`, `## Verse 2`, `## Chorus` reports sections, refrain repeats, per-line syllable differences between Verse 1 and Verse 2, and syllables-per-beat only when `tempo` and `beatsPerLine` are in the frontmatter; repeated lines are reported with their source line numbers; a prose-form measurement does not import or load the dictionary (assert with a module-level load counter exported from `src/verse/cmudict.ts`).
- [ ] Implement `measureVerse(doc, form)` returning the structure in the spec ("Measurement"), include `markup` problems, `guessed` and `ambiguous` word lists per line and overall; call it from `measure()` only when `form.verse` is set. Dynamic `import()` the verse module so prose forms never load the dictionary.
- [ ] Commit.

---

### Task 7: References, rules and evaluators

**Files:** Modify `craft/references.json`, `craft/rules.json`, `src/lint/evaluators.ts`, `REFERENCES.md` (generated by `npm run refs:check`). Create `tests/lint-verse.test.ts`. Modify `tests/rules-table.test.ts` expectations (rule counts) and list the change.

- [ ] References first: one entry per source the rules cite (poets.org sonnet, villanelle, sestina, limerick, haiku, ballad, enjambment; Obermeier et al. 2013; Gordon, Magne and Large 2011; Porter and Machery 2024; PhonologyBench; Sonnet or Not, Bot; Wikipedia Scansion marked `kind: 'review'` only if no better fit, with a note; Prosodic; CMUdict; Coursera/Berklee songwriting pages marked `practitioner` with the note that they are course descriptions; Musical U). Use exact URLs from the clippings' `source:` frontmatter. Kinds from the allowed enum.
- [ ] Tests first in `tests/lint-verse.test.ts`: for each auto rule in the spec's table, one passing and one failing draft with the finding's severity and message asserted (line-count, rhyme-scheme exact and slant-only, syllables for haiku as `info`, villanelle refrain, sestina end-words, meter deviation silent on guessed lines, guessed list, ambiguous list, every-line rhyme on free verse of six lines, markup, refrain consistency, line-match with a 3-syllable difference). Judgement rules appear in `judgement[]` for verse forms and not for prose forms. A finding built on an `uncertain` rhyme is downgraded to `info` with a note.
- [ ] Rules: add the 12 auto rules and 2 judgement rules from the spec; `forms` lists restrict them to the right forms; `derived` true where the spec says convention; `conflicts` where a rule can contradict another (for example `verse.form.syllables` against `verse.meter.deviation` in haiku). Rationales state only what the cited sources support; weak evidence is named as weak.
- [ ] Evaluators in `src/lint/evaluators.ts` (or a new `src/lint/verse-evaluators.ts` merged into `EVALUATORS` if the file gets unwieldy).
- [ ] Commit.

---

### Task 8: Commands (`scan`, `pronounce`) and capabilities

**Files:** Create `src/commands/verse.ts`, `tests/verse-cli.test.ts`. Modify `src/cli.ts`, `src/commands/capabilities.ts`, `tests/cli.test.ts`/capabilities expectations (list changes).

- [ ] Tests first: `prose scan <file>` JSON has `lines[]` (line, text, syllables, stress, endWord, rhyme letter, flags), `scheme`, `nearScheme`, and `trust` (counts of dict/affix/guessed words); `--text` prints an aligned table; `--words` adds per-word pronunciation with source; a non-verse draft gives `E_USAGE` with a hint naming the verse forms; `prose pronounce love dove glorpish` returns three entries with sources and a note that the dictionary is US English; capabilities lists verse forms (marked) and the new rules.
- [ ] Implement with the same error and output conventions as the other commands.
- [ ] Commit.

---

### Task 9: Golden files, runtime, laziness, docs

**Files:** Create `tests/golden/verse-sonnet.scan.json` (via the existing golden helper), `tests/verse-runtime.test.ts`. Modify `README.md`, `craft/GUIDE.md`, `tests/managed-runtime.test.ts` if needed.

- [ ] Golden for `prose scan` on Sonnet 18 and one lint result for a deliberately broken sonnet.
- [ ] Runtime test: the managed runtime copies `craft/data/cmudict.dict.gz` byte-for-byte (not text-normalised) and the fingerprint changes when the file changes; a measure of a prose draft leaves the dictionary-load counter at zero.
- [ ] README: a short "Verse" section (forms, `scan`, `pronounce`, US English, the trust tags, the CMU acknowledgement); GUIDE.md: the verse format and its Markdown caveat.
- [ ] Run the whole suite three times (race tests) plus typecheck and refs:check. Commit.

---

### Task 10: Final review and handoff

- [ ] Dispatch the final code reviewer over the whole branch; fix findings in the same loop as other tasks.
- [ ] Controller (not a subagent): record the shipped-on-branch status with the spike numbers and the measured dictionary size and speed in the maintainer's notes, rebase onto `main`, squash-merge, leak-scan history, push `main` only. No version bump or marketplace PR until the verse skills land (spec "Out of scope").
