# Craft guide

Why the rules in `craft/rules.json` exist and how much weight each can bear. Every rule cites its
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
words per minute, the top of the 160–180 range BBC subtitle timing assumes.

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
`verse.form.syllables` is the soft haiku 5/7/5 (info). `verse.form.refrain` and
`verse.form.end-words` check the villanelle's repeated lines and the sestina's rotation and
envoi, and stay silent when the line count is wrong because `verse.form.line-count` already spoke.
`verse.meter.deviation` is advisory: scansion is contested, so only a polysyllable's dictionary
stress against its slot counts, and lines with guessed words are skipped. `verse.pronunciation.guessed`
and `verse.pronunciation.ambiguous` list the words the dictionary lacks or reads two ways, since
verdicts on those lines are weaker. `verse.rhyme.every-line` notes free verse where every line rhymes
(a sameness signal from one study, never an authorship verdict). `verse.format.markup` catches a
verse line the Markdown parser swallowed as a list item, step or quote. For songs,
`lyric.refrain.consistent` expects a repeated chorus to match its first occurrence and
`lyric.sections.line-match` flags like sections more than 2 syllables apart on a line; both rest on
weak sources (a practitioner article and course descriptions) and are conventions. Two judgement
rules are never evaluated: `verse.line-break.purpose` (why this line ends here) and
`lyric.stress-on-beat` (stressed syllables on strong beats; the tool cannot hear the melody).

### Writing and checking a verse draft

The draft is Markdown. Write one verse line per source line and put a blank line between stanzas.
A heading labels the stanzas after it (a song's `## Verse 1`, `## Chorus`). Lyrics may also set
`tempo` (beats per minute) and `beatsPerLine` (default 4) in the frontmatter, which adds syllables
per beat to the measurements. Do not start a verse line with `- `, `1. ` or `> `: the parser reads it
as a list item, step or quote (`verse.format.markup` says so, and the line is still counted). A line
starting with `#` becomes a heading and is not counted as verse.

What each family of rules checks:

- **Form** (`verse.form.*`): line count, stanza sizes, end-rhyme scheme, the haiku's soft syllable
  pattern, the villanelle's refrains and the sestina's end-word rotation.
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

Why an unexplained pick weighs one third of a duel when four variants are shown. A pick records
that the winner beat every other shown variant, but the owner compared them loosely. Each loser
therefore counts 1/(shown-1) of a duel, so one choice carries about one duel of evidence however
many variants were shown (two shown: weight 1; four shown: one third each).
