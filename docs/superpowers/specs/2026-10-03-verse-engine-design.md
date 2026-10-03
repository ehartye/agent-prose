# Verse engine — design

Status: draft for the 0.3.0 line. Decision for pronunciation (accepted 2026-10-03): bundle a pronouncing dictionary and fall back to a heuristic for words it lacks. This spec is the engine only; the `prose-poetry` and `prose-songwriting` skills are later milestones that sit on top of it.

## Goal

Make poems and song lyrics measurable the way speeches and scripts already are: syllables, stress, rhyme, scheme, line shape and form conformance, each reported with how much to trust it. The engine measures; judgement of quality stays with the agent and the owner. Nothing here claims a poem is good.

## Principles

1. **Say how sure you are.** Every pronunciation result is tagged `dict`, `affix` (dictionary word plus a regular ending) or `guessed`. Any metric that rested on a guessed word says so, and findings built on one are downgraded to `info`.
2. **Scansion is contested, so meter is advisory.** Stress is gradient and readers promote and demote syllables (scansion is gradient and contested). Meter deviations are `info`, monosyllables are never counted as deviations, and nothing is an error.
3. **Forms are definitions, counts are conventions.** Line counts and rhyme schemes of sonnet, villanelle, sestina, limerick and ballad come from poets.org glossary pages. Haiku 5/7/5 is soft because that source says it is routinely broken. A number without a source is marked `derived`, as in the existing rules.
4. **No new runtime.** Node only. The dictionary is data, loaded lazily, so prose forms never pay for it.
5. **AI-tell findings are never authorship verdicts** (unchanged from 0.1.0).

## Draft format

Markdown with frontmatter, nothing new to learn.

```markdown
---
form: sonnet-shakespearean
---
## Sonnet 18          <- optional heading; becomes the section label

Shall I compare thee to a summer's day?
Thou art more lovely and more temperate:
...
```

- Each source line is a verse line; a blank line ends a stanza. The Markdown parser already keeps the lines of a paragraph separate (joined by `\n` in the block text), so **no parser or IR change is needed**: the verse measurement re-splits `paragraph` blocks on `\n` and keeps the first line number plus the offset.
- Headings label sections (`## Verse 1`, `## Chorus`, `## Bridge`). A repeated label with the same base name (Chorus, Chorus) is a refrain section.
- Known parser limit, documented in the skill later: a verse line that starts like Markdown (`- `, `1. `, `> `, `#`) becomes a list item, step, quote or heading. The engine reports `verse.format.markup` (`warn`) when a verse form draft contains such blocks, with the fix "start the line with a word or escape the marker".
- Optional frontmatter for lyrics: `tempo` (bpm), `beatsPerLine` (default 4). Without them singability is not computed.

## Forms (craft/forms.json)

`FormSchema` gains an optional `verse` object (strict): `{ kind: 'poem' | 'lyric', lines?: number, scheme?: string, syllables?: number[], meter?: { foot: 'iamb' | 'trochee' | 'anapest' | 'dactyl' | 'common', feet: number }, stanzaSizes?: number[] }`. `format` stays `markdown`; `spoken` stays false. A verse form has `verse` set; every existing form is untouched.

First wave:

| id | Definition used | Source |
|---|---|---|
| `free-verse` | no fixed count; measure only | — |
| `haiku` | 3 lines, 5/7/5 (soft: `info`) | poets.org haiku |
| `limerick` | 5 lines, AABBA, anapestic, lines 1-2-5 three feet, 3-4 two feet | poets.org limerick |
| `ballad` | quatrains, ABCB or ABAB, three or four stresses per line | poets.org ballad |
| `sonnet-shakespearean` | 14 lines, ababcdcdefefgg, iambic pentameter | poets.org sonnet |
| `sonnet-petrarchan` | 14 lines, abbaabba + cdecde or cdcdcd, volta after line 8 | poets.org sonnet |
| `villanelle` | 19 lines, A1 b A2 / a b A1 / a b A2 / a b A1 / a b A2 / a b A1 A2, refrains repeated verbatim | poets.org villanelle |
| `sestina` | 39 lines, six end words rotating, envoi of three lines holding all six | poets.org sestina |
| `song` | lyric; sections from headings; repeated sections consistent; like sections matched | Pattison/Berklee topics, Musical U, Gordon et al. (weak: course descriptions and a practitioner article; stated in the rule notes) |

The ballad's three or four stresses per line and the Petrarchan volta after line 8 are definitions only: they live in each form's `basis` text and no rule checks them (scansion of stress counts is contested, and a turn is a matter of sense, not structure). The haiku's `soft` flag is read by `verse.form.syllables`, which words its message accordingly and never rises above `info`.

Not in the first wave, with the reason: blues form (no source found), internal rhyme (needs more evidence than a definition; tracked as a follow-up), AABA as its own form (the `song` form detects the shape from labels instead).

## Pronunciation (src/verse/)

- `craft/data/cmudict.dict.gz` plus `craft/data/CMUDICT-LICENSE.txt` (the CMU notice, kept verbatim) and an acknowledgement in the README, as the CMU README requests. Comments stripped, otherwise unmodified. The gzip is read with `node:zlib`, so there is no new dependency. A `scripts/refresh-cmudict.mjs` documents how the file was made (fetch from `cmusphinx/cmudict`, strip, gzip) and prints size and entry counts.
- `pronounce(word) → { phones, syllables, stress, variants, source }`. Lookup order: whole word; possessive/plural/`-ed`/`-ing`/`-ly` stripped and the regular ending added to the stem's phones (`source: 'affix'`); otherwise the heuristic from `src/text.ts` (`source: 'guessed'`, stress unknown, rhyme key from letters).
- Variants: the first variant is used; if variants disagree on syllable count the word is `ambiguous` and the count is a range. Part-of-speech is not available in the flat file, so heteronyms are flagged (`variants > 1`), never resolved.
- US English only, stated in the output and in the rule notes (British rhymes such as "bath/path" may be wrong).
- The dictionary loads on first call and is cached for the process.

## Measurement (Measurement.verse, null for non-verse forms)

Per line: syllables (a count, or a range when variants disagree; form checks accept a target inside the range), stress string using `1` stressed, `0` unstressed, `?` flexible (monosyllables and unknowns), end word, terminal punctuation class (`stop` for `. ! ? ; :`, `weak` for `,` and dashes, `run-on` for none), `guessed` words, `ambiguous` words. This is a punctuation proxy for enjambment and is labelled one; true syntactic enjambment needs a parser we do not have.

Per stanza and poem: syllable mean, standard deviation, min and max; `scheme` (letters from perfect and identity end rhymes) and `nearScheme` (also counting assonance and consonance); repeated lines (exact, normalised) with their line numbers; section list for lyrics.

Rhyme classes for an end-word pair: `identity` (same word), `perfect` (same from the last stressed vowel to the end, different onset), `assonance` (same stressed vowel, different tail), `consonance` (same final consonants, different vowel), `eye` (last three or more letters shared but the sounds differ, as in love/move), `none`. All pronunciation variants are compared and the best class wins; a result that needed a non-first variant is `uncertain` (the spike found "wind" lists the verb first). `eye` is never a rhyme for the scheme, but findings name it, because modern US pronunciation misses historical rhymes (Sonnet 18's temperate/date). The classes follow Prosodic's definitions and are conventions, not a standard; weaker than what the form rules assert. A pair that involves a guessed word carries `uncertain: true`.

Meter conformance (only when the form declares `meter`): the declared foot gives the expected pattern per syllable position; a deviation is a polysyllabic word whose lexical stress contradicts its slot (monosyllables are flexible and never count). Reported as a count and positions per line. Feminine endings (one extra weak syllable) are allowed without comment.

Lyrics (`song`): sections with their line syllable counts; for each pair of like sections (same base label, e.g. Verse 1 and Verse 2) the per-line syllable differences; refrain sections compared verbatim; syllables-per-beat only if `tempo` and `beatsPerLine` are declared, reported with no threshold.

## Rules (craft/rules.json, new ids under `verse.*` and `lyric.*`)

Auto rules, each with an evaluator, cited sources and a `derived` flag:

| id | Severity | What it says |
|---|---|---|
| `verse.form.line-count` | warn | Form requires N lines (sonnet 14, villanelle 19, sestina 39, limerick 5, haiku 3). |
| `verse.form.rhyme-scheme` | warn / info | End rhymes follow the form's scheme. If only `nearScheme` matches, `info` naming the slant pairs; a mismatch whose pairs are all `eye` or `uncertain` is `info` ("may be an eye rhyme or a historical pronunciation"), because the spike showed the dictionary rejects Shakespeare's own temperate/date. |
| `verse.form.syllables` | info | Haiku 5/7/5 and the limerick/ballad foot counts; info because poets.org says contemporary practice breaks them. |
| `verse.form.refrain` | warn | Villanelle refrains repeat verbatim at the required lines. |
| `verse.form.end-words` | warn | Sestina end-word rotation and envoi. |
| `verse.meter.deviation` | info | Lists lines with deviations; silent on lines with guessed words. |
| `verse.pronunciation.guessed` | info | Lists words the dictionary lacked; the verdicts on those lines are weaker. |
| `verse.pronunciation.ambiguous` | info | Lists a word with several pronunciations only when the reading matters: an end word whose variants rhyme differently and that sits in a rhyme group the form expects (or whose rhyme with another line depends on the variant), or a word whose readings straddle a declared syllable or meter count. Free-verse and song lines never report count ambiguity. |
| `verse.rhyme.every-line` | info | Free-verse draft of six or more lines where every end word rhymes with a neighbour (research: AI poems in the Porter and Machery study rhymed at every line 89% of the time against 40% for human poems; a sameness signal, never a verdict). |
| `verse.format.markup` | warn | Verse line parsed as a list item, step, quote or heading (see above). |
| `lyric.refrain.consistent` | warn | A section repeated under the same label differs from its first occurrence. |
| `lyric.sections.line-match` | info (derived) | Like sections differ by more than 2 syllables on a line; 2 is a convention. The supporting sources are course descriptions, so the rule says so. |

Judgement rules (always listed, never evaluated): `verse.line-break.purpose` (why this line ends here; poets.org enjambment), `lyric.stress-on-beat` (stressed syllables should meet strong beats; Gordon et al. found aligned stress and beat gave better comprehension; the tool cannot hear the melody, so this stays judgement).

New entries in `craft/references.json` for every source above; `npm run refs:check` regenerates `REFERENCES.md`. Rationales quote only what the cited sources support.

## Commands

- `prose measure` and `prose lint` pick up the verse section and rules for verse forms; no flag.
- `prose scan <file> [--words]` prints a per-line table (line number, text, syllables, stress, end-word, rhyme letter, flags); `--words` adds per-word pronunciation and source. JSON by default like the other commands; `--text` for the table.
- `prose pronounce <word...>` returns pronunciation, stress, variants and source for each word (for learning and debugging the dictionary).
- `prose capabilities` lists the new forms and rules; the forms listing says which are verse.

## Spike first (task 1, gates the dictionary)

Before building on the dictionary, measure it. A hand-checked gold set of about 30 lines from public-domain texts whose structure is independently known (for example Amazing Grace in common meter 8/6/8/6, Shakespeare's Sonnet 18 with ababcdcdefefgg, a Lear limerick, a Basho-style haiku translation, a ballad quatrain), each with its syllable counts and end-rhyme pairs checked against the published form. Compare the existing heuristic with dictionary-plus-fallback on exact syllable count per line and on rhyme-pair classification, and write the result to `docs/research/verse-dictionary-spike.md`. Gate: proceed if the dictionary path is better on both; if the gain is small or negative, stop and revisit the ADR rather than ship a 3.6 MB file for nothing. The gold labels come from the forms' published structure, not from PhonologyBench, whose syllable counts come from a G2P library.

## Testing

TDD for each module. Pinned tests: dictionary loader (entry count, variant parsing, comment stripping, affix rules), rhyme classes on a table of pairs, scheme letters on known poems (the spike's gold set becomes a regression fixture), every form's pass and fail example, evaluator output with guessed-word downgrades, CLI JSON shapes, and a golden file for `prose scan` on a sonnet. The managed runtime test confirms the data file is copied and fingerprinted, and `prose measure` on a prose draft is measured not to load the dictionary.

## Out of scope for this milestone

Skills (`prose-poetry`, `prose-songwriting`), variant-set features for verse (the taste feature vector stays `v1`; verse drafts in variant sets use the existing prose features until a `v2` is justified), internal rhyme, blues and other lyric forms without a source, British pronunciation, a melody or audio model, the LAN reading page. The version bump and marketplace update wait for the skills so 0.3.0 ships a usable feature, not an engine alone.

## Risks

- **A trimmed dictionary may still be large.** Measured in the spike and the refresh script; gzip should help a lot, but the number is unknown until measured.
- **The agent can mark up a poem the tool then "validates".** Findings quote the measured values so a reviewer sees why, and judgement rules stay unevaluated.
- **Slant-rhyme classes are conventions.** They are labelled so and never used for a hard error.
- **Hand-checked gold sets can contain my own scansion mistakes.** The set is limited to texts with independently known structure; the owner can add lines.
