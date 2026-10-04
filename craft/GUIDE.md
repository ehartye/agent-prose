# Craft guide

Why the rules in `craft/rules.json` exist and how much weight each can bear. For how to write each kind of thing, see the craft reference guides (`prose guide`, files in `craft/guides/`). Every rule cites its
sources in [REFERENCES.md](../REFERENCES.md); this guide explains the reasoning between them.

Three principles run through everything:

1. **Measure, don't assert.** The most common failure of a writing agent is claiming a length,
   pace or fit it never checked. Lint measures; the agent reports the numbers.
2. **Thresholds are conventions unless a source tested them.** Authorities disagree on sentence
   caps, speech length, page timing and line limits. Rules built on those numbers warn and cite;
   they never pretend to be laws. A rule marked `derived: true` uses a threshold this plugin chose.
3. **Rules can pull against each other.** Rules declare `conflicts`, and lint shows the trade-off
   on the finding instead of letting one fix silently create another problem.

## Length and timing

`length.target` compares a draft with the length it declares (`target: 5 minutes`, `Target: 3
pages`, `target: 200 words`) and says how much to cut or add. Spoken time is planned from words
at a rate — 130 words per minute for speeches (CRS); the 150 used for game dialogue and the 160
used for YouTube are this plugin's planning defaults — and script runtime from pages. Both are
estimates with real spread: individual speakers range widely, and Follows suggests treating a
script page as about a minute, ±20%, because few scripts land close to it. So a miss is a prompt
to check, not a failure: the finding is a warning, and its ±10% tolerance is this plugin's choice
(`derived`). A page or word target is compared with measured pages or words, not with an
estimated runtime. When the real reader's pace is known, set it: `wpm` (and the dialog box size)
can be set in `.agent-prose/project.json`, per form under `forms.<id>`, and `wpm` in a draft's
own metadata; the most specific wins. `spoken.duration.report` and `script.runtime.report`
report the estimates. `youtube.segment.pace` warns when a timestamped segment runs above 180
words per minute. The BBC recommends subtitles at 160–180 words per minute, a reading speed for
subtitles rather than a speech rate; the 180 cap is this plugin's own choice, so that spoken
segments can be captioned legibly.

Rules whose thresholds this plugin chose, rather than a source: `length.target` (±10%),
`spoken.sentence.max` (16 words), `style.echo` (3 repeats), `ai.vocabulary` (3 terms),
`youtube.segment.pace` (180 as a cap), `dialog.barks.variety` (0.6 overlap), and the reporting
rules built on planning defaults.

Configuration that changes the numbers (`project.json`, a draft's `wpm`) stops the run with an
error when it is invalid, because every figure after it would be wrong. Configuration that only
feeds one rule family (a voice bible) becomes a finding, so the rest of lint still runs.

## Sentences for the eye and the ear

`style.sentence.max` warns on written sentences over 25 words (GOV.UK's cap; NN/g suggests
15–20 even for experts). `spoken.sentence.max` uses 16 words, the top of the 8–16-word average
that speechwriting guidance gives for spoken sentences, and the longest breath unit is reported
for speeches. Neither is a hard rule: the sources disagree, GOV.UK's supporting comprehension
figures are second-hand, and NN/g's range is advice.

## Readability, passive voice and plain style

`readability.grade.report` reports a reading grade but never targets one: a randomised trial
found no comprehension difference between grade-8 and grade-14 versions, and rewriting to lower
a score does not help readers. `style.passive.report` counts passive voice without banning it —
a controlled study found active rewrites changed neither length nor comprehension. Both are
sentence-based prose metrics, so they stay silent for poems and lyrics, whose line breaks are not
sentence boundaries.
`plain.there-is` flags empty "There is / There are" openers (Army writing standard) and declares
a conflict with `ai.copula-avoidance`: the fix is to delete the empty opener, not to swap in
"serves as", which is a documented tell of generated text. `style.echo` flags a three-word phrase
repeated three or more times, the repetition that model-assisted writing tends to introduce.

## Machine-like prose

`ai.artifact` (error) catches leaked chatbot markup and unfilled placeholders that must never
ship. `ai.vocabulary` warns when three or more era-tagged words cluster in one draft (one or two
can be coincidence); the lexicon is tagged by model era because the tells change.
`ai.copula-avoidance` and `ai.promotional` are informational. All of these are style findings:
automated detectors are unreliable and biased against non-native writers, so nothing here is a
verdict on who wrote a text. `draft.placeholders` lists `[bracketed]` gaps still to fill — an
honest placeholder beats an invented fact, but it must not ship.

## Instructions

`procedure.step.imperative`, `procedure.single-step` and `procedure.filler` follow the Google
and Microsoft style guides: one action per step, lead with the verb (or a short location, then
the verb), a single step is a bullet, and no "please", "simply" or "easy". `procedure.recovery`
is a judgement rule: every failure state needs a way back in, because cutting information
causes task failure.

## Scripts

`script.multicam.caps-action` and `script.unprinted-marker` encode multi-camera format (ALL-CAPS
description) and Fountain's rule that `#` sections do not print. `script.unclosed-note` catches a
note whose closing brackets went missing, which turns note text into script text and inflates
every count. `comedy.premise` and `comedy.serious-moments` are judgement rules from working
showrunners: jokes grow from the scene's premise, and jokes release the tension a serious scene
is building.

## YouTube

`youtube.segment.pace` checks pace per segment; `youtube.promise-delivery` (judgement) asks
whether the first 30 seconds confirm the title and thumbnail promise — YouTube reads 30-second
retention exactly that way and removes clickbait whose promise the video never keeps.

## Game dialogue

`dialog.graph.dangling`, `dialog.graph.dead-end`, `dialog.graph.unreachable`,
`dialog.graph.exit` and `dialog.choices.fallback` keep a conversation from breaking or trapping
the player — ink treats loose ends as errors and uses fallback choices so players never run out
of options. `dialog.revisit.variety` asks for rotating variants wherever a player can return,
because a hub that repeats one line makes an implausibly patient NPC. `dialog.line.box` checks
lines against the text box — by default the 40-character, two-line subtitle limit accessibility
guidelines set; a project can set `boxChars` and `boxLines` per form.
`dialog.barks.variety` flags single-line pools and near-duplicates; salience systems rotate
least-recently-heard lines, so a thin pool repeats audibly.

## Voice

`voice.targets`, `voice.banned` and `voice.unvoiced` check speakers against the project's voice
bibles: character voice is measurable, and concrete style guides name what a character would
never say. Ranges from fewer than 40 words are too noisy to check. `voice.bible-valid` is an
error when a bible fails to load (bad YAML or schema, an id that is not the file name, a duplicate
id, or a speaker two bibles claim): a broken style guide cannot check anyone, so the other voice
rules wait until it is fixed while the rest of lint still runs. `voice.distinct` is the swap
test, a judgement rule: no line could move to another character unnoticed.

## Formal writing

`formal.bluf` puts the main result or request in the first or second sentence (Army writing
standard). `formal.supported-claims` keeps claims inside the evidence: generalizations past the
data and invented significance are documented failures of generated prose, and a missing value
is a placeholder, never a guess.

## Verse forms

Nine verse forms (`free-verse`, `haiku`, `limerick`, `ballad`, `sonnet-shakespearean`,
`sonnet-petrarchan`, `villanelle`, `sestina`, `song`) carry a `verse` definition in
`craft/forms.json`; their structures follow the poets.org glossary pages named in each `basis`.
`scheme` is one end-rhyme letter per line, and `schemes` lists alternatives (ballad, the
Petrarchan sestet). Uppercase scheme letters mark refrain lines: the villanelle's `refrains`
names the two refrains A1 and A2 and gives their 1-based lines (A1 at 1, 6, 12, 18; A2 at 3, 9,
15, 19), each repeated verbatim. The sestina's `endWordRotation` has one row per stanza, giving
the end word (A=0 to F=5) that closes each line, and a three-line envoi holds all six. Haiku
counts are soft: poets.org notes contemporary practice often breaks 5/7/5, and the syllables
finding says so. The ballad's three or four stresses per line and the Petrarchan volta after line 8
are definitions only (in each form's `basis`); no check enforces them. `song` rests on weak
sources (course descriptions and a practitioner article). Meter is advisory: `common` meter is
read as iambic lines alternating four and three feet, starting with four.

Verse rules follow the form's definition, and each says how far to trust it. `verse.form.line-count`
warns when the count differs (sonnet 14, villanelle 19, sestina 39, limerick 5, haiku 3, ballad
stanzas of 4). `verse.form.rhyme-scheme` compares each rhyme group with its first line rather than
comparing scheme strings, because one missed rhyme (Sonnet 18's temperate/date) shifts every later
letter; only a certain non-rhyme warns, and slant, eye and guessed-word pairs are info.
`verse.form.syllables` is the soft haiku 5/7/5 (info), or the pattern a draft declares in its frontmatter (warn). `verse.form.refrain` and
`verse.form.end-words` check the villanelle's repeated lines and the sestina's rotation and
envoi, and stay silent when the line count is wrong because `verse.form.line-count` already spoke.
`verse.meter.deviation` is advisory: scansion is contested, so only a polysyllable's dictionary
stress against its slot counts, and lines with guessed words are skipped. `verse.pronunciation.guessed`
and `verse.pronunciation.ambiguous` list the words the dictionary lacks or reads two ways, since
verdicts on those lines are weaker. `verse.rhyme.every-line` notes free verse where every line rhymes
(a sameness signal from one study, never an authorship verdict). `verse.format.markup` catches a
verse line the Markdown parser swallowed as a list item, step or quote. `verse.format.direction`
lists each song line skipped as a performance direction, so a sung line is never lost silently. For songs,
`lyric.refrain.consistent` expects a repeated chorus to match its first occurrence and
`lyric.sections.line-match` flags like sections more than 2 syllables apart on a line; both rest on
weak sources (a practitioner article and course descriptions) and are conventions. Two judgement
rules are never evaluated: `verse.line-break.purpose` (why this line ends here) and
`lyric.stress-on-beat` (stressed syllables on strong beats; the tool cannot hear the melody).

### Writing and checking a verse draft

The draft is Markdown. Write one verse line per source line and put a blank line between stanzas.
A heading labels the stanzas after it (a song's `## Verse 1`, `## Chorus`). Lyrics may also set
`tempo` (beats per minute) and `beatsPerLine` (default 4) in the frontmatter, which adds syllables
per beat to the measurements (`prose scan` shows it as JSON `syllablesPerBeat` and a `spb` column in `--text`; the
`legend` lines there explain the stress column and the inferred scheme, which lint, not scan, compares with a declared one). Do not start a verse line with `- `, `1. ` or `> `: the parser reads it
as a list item, step or quote (`verse.format.markup` says so, and the line is still counted). A line
starting with `#` becomes a heading and is not counted as verse.

In a `song`, a plain or bold line that is only a section label also labels the stanzas after it:
`**Verse 1**`, `Chorus (x2)`, `Bridge`, `Pre-Chorus:`, or a single capital letter A to D with an optional
note for AABA drafts (`A`, `B (bridge, rise a little)`). Adjacent stanzas under the same label are one section.
A direction is a line that is wholly ONE parenthesised phrase (`(hum softly)`; `(Ooh) take me home (ooh)` is
sung), a line of up to twelve words with a bpm figure (`Folk, about 90 bpm, 4/4`), or a line of up to six words
with a stand-alone time signature (`4/4`, `Waltz time, 3/4`; `I love you 24/7` and `Half of me is 1/2 yours` are
sung). A direction is not a lyric, never counted, and listed under `directions` in the scan and measure output.
The skip is a convention of the tool, so `verse.format.direction` (info) names every skipped line; if it is sung,
rewrite it without the parentheses or the tempo wording. Poems are not affected.

Words for an existing tune or hymn meter: declare the tune's pattern in the frontmatter, for any verse form.
`syllables` is the per-stanza count repeated for every stanza (`[8, 6, 8, 6]`, `8.6.8.6`, `8 6 8 6` or `8,6,8,6`)
and `scheme` one letter per line (`xaxa`; `x` is an unconstrained line). Each also takes a map by section base
(`verse`, `chorus`, `bridge`), and a section with no entry is not checked. A key that matches no section of the draft (`vers` for `verse`), or a map on a draft with no
section labels, is a warning, so a typo cannot switch the check off silently. A hymn in common meter:

    syllables: 8.6.8.6
    scheme: xaxa

Words for a 7-7-7-5 tune whose lines 2 and 4 rhyme:

    syllables: [7, 7, 7, 5]
    scheme: xaxa

The declared pattern replaces the form's own for the check. `verse.form.syllables` warns (it is the author's
requirement, not a convention) with `Line N has X syllables; your pattern asks for Y (stanza S, line K)`, accepting
a line whose syllable range includes Y; a stanza with a different number of lines is reported once. A malformed
value stops with an `E_SCHEMA` error that lists the accepted forms.

What each family of rules checks:

- **Form** (`verse.form.*`): line count, stanza sizes, end-rhyme scheme, the haiku's soft syllable
  pattern, a syllable pattern or scheme the draft declares, the villanelle's refrains and the sestina's end-word rotation.
- **Meter** (`verse.meter.deviation`): where a polysyllabic word's stress falls against the form's
  foot. Advisory. The limerick checks three feet on lines 1, 2 and 5 and two on lines 3 and 4, and
  an anapestic line may drop its opening weak syllable.
- **Pronunciation** (`verse.pronunciation.*`): words the dictionary lacks (guessed) or reads two
  ways, so you know which verdicts are weaker. All pronunciations are US English.
- **Rhyme** (`verse.rhyme.every-line`): free verse in which every line rhymes, a sameness signal.
- **Lyrics** (`lyric.*`): a repeated chorus matching its first occurrence, and like sections
  staying within a couple of syllables per line.

What the engine cannot judge: whether the poem is good, whether its imagery is fresh or its line
breaks earn their place, and how a lyric sounds against its melody (`verse.line-break.purpose`
and `lyric.stress-on-beat` are judgement rules the writer weighs). It counts and compares
syllables, stress and rhyme from a dictionary; it does not hear anything.

## Variant sets and picks

Why sets exist. Left alone, a model converges: stock jokes recur in language-model output, and
people who rewrite with a model lose stylistic variety (Padmakumar and He, 2024; see
REFERENCES.md). Asking for five options often returns one idea five ways. A set forces the
options to differ, and puts the choice with the owner.

What the check proves, and what it does not. `prose set check` measures each variant as a
12-number style vector and compares it with the base. It proves three things: the text moved in
the measured style the direction names, it is not a near-duplicate of the base or of another
variant, and it adds no new lint errors. It cannot judge angle or quality. Labels are the agent's
claim, so two variants with one label are flagged rather than trusted.

Thresholds are this plugin's choice, not findings: a duplicate at 0.85 n-gram overlap, similar at
0.6, barely changed from the base at 0.95, moved at 0.1 scale units, with each feature scaled by
a fixed typical spread. Tune them with evidence, not taste.

Why predictions are sealed. The agent states its guess of the owner's pick before the owner sees
anything, with a SHA-256 over the guess, what will be shown and each variant file. A guess that
could be revised after the reveal teaches nothing; the hash makes an edit detectable, and a
variant edited after sealing blocks the pick. The hit rate in `prose taste stats` then measures
how well the agent has learned the owner, which is what taste data is for.

The taste model's guess is sealed too, by `prose predict` itself, in its own file, and scored beside the
agent's at the pick; `prose taste stats` shows both hit rates and who did better where both predicted. The model
abstains when it has no usable pairs, and an abstention is not a miss. Sealing means: the tool never prints the model's pick or ranking before the owner picks, and it seals the guess (a SHA-256 over the guess and a marker file beside it) so an edit is detected at the pick. It is not secret: the file is readable on disk, deleting both files hides the model's result for that set, and a forged file with a recomputed hash cannot be detected (there is no key). The agent's independence therefore rests on the agent not reading it. A crash between writing the agent's prediction and the model's leaves that set unscored for the model; `prose predict --set <id> --model-only` repairs it, before the pick. So the
agent's independence is a matter of discipline: read `prose taste show` before drafting, never the model's
guess before the owner picks. The comparison of the two uses the pick only; shortlist hits are meaningful
only for sets of four or more variants, and the model's recent window is its last N predicted rows while the
agent's is its last N rows. The model fits twelve coarse style features from picks and duels (global, project
and voice layers; the 15-pair thresholds are conventions from another plugin, not tuned on prose). It does not
measure humour or quality, and sparse data is the normal state.

Why an unexplained pick weighs one third of a duel when four variants are shown. A pick records
that the winner beat every other shown variant, but the owner compared them loosely. Each loser
therefore counts 1/(shown-1) of a duel, so one choice carries about one duel of evidence however
many variants were shown (two shown: weight 1; four shown: one third each).

## Adding a craft guide

Craft guides are one Markdown file per family of forms, listed in `craft/guides/families.json` (every form in
`craft/forms.json` belongs to exactly one family; a test enforces it). A guide touches only its own files, so
several can be written in parallel:

1. Copy `craft/guides/game-dialogue.md` to `craft/guides/<family>.md`. Keep the front matter (`family`, `title`,
   `forms` exactly as in families.json, `reviewed`, `sources`) and the eight H2 sections in the same order, with
   the two generated fences (rule table, sources) in place.
2. Cite a source by listing its id in `sources:`, in the order the text first cites it, and writing `[n]` in the
   text. Ids come from `craft/references.json` or from a new `craft/guides/<family>.refs.json` (same shape as
   references.json; ids must be unique across both). Read every source before citing it.
3. Mark every convention with `Convention:` and every claim with no source with `Maintainer judgement:`.
4. Run `npm run guides` (fills the rule table and the sources list) and `npm run refs` (adds the guide's source
   section to REFERENCES.md). `npm run refs:check` and the test suite fail when either is stale.
5. Point only the skills for that family at the guide ("Craft guide: `prose guide <family>`; read the section you
   need"), keeping each skill's description and when_to_use under 1,536 characters.

Only REFERENCES.md is shared: if two guides conflict there, take either side and run `npm run refs`. To split or
merge families, edit `families.json` and the affected guides' `forms`; nothing else changes.
