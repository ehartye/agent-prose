---
family: verse
title: Poetry and verse forms
forms: [free-verse, haiku, limerick, ballad, sonnet-shakespearean, sonnet-petrarchan, villanelle, sestina]
reviewed: "2026-10-04"
sources: [poets-org-free-verse, hsa-2004, poets-org-limerick, poets-org-ballad, poets-org-sonnet,
  poets-org-villanelle, poets-org-sestina, poets-org-haiku, sonnet-or-not-bot, obermeier-2013,
  mcglone-tofighbakhsh-2000, filkukova-klempe-2013, poets-org-imagery, commonmark-spec, poets-org-enjambment,
  poets-org-caesura, poets-org-meter, poets-org-anapest, wikipedia-scansion, prosodic, agirrezabal-2016, sen-2026,
  poets-org-rhyme, cmudict, knoop-2021, sucher-bacon-2014, porter-machery-2024, poets-org-volta, bell-2020,
  phonologybench, poetry-foundation-free-verse, welch-haiku, hsa-2026, chaudhuri-bhattacharya-2025,
  wikipedia-limerick, wikipedia-ballad-stanza, poetry-foundation-shakespearean-sonnet, blohm-2018]
---
# Poetry and verse forms: a craft reference

Read the section you need, not the whole guide: `prose guide verse --section <name>`. How the text is marked: a number
in brackets, such as [3], points to the Sources list at the end. "Convention:" marks a habit of the craft that no
source tested. "Maintainer judgement:" marks advice with no source behind it. "Measured here:" marks a number from a
run of this plugin on the guide's own examples; it shows that a problem happens, not how often.

## What it is and who reads or hears it

Verse is writing set in lines. The reader sees where each line ends before reading it, and a poem read aloud is heard
line by line. Eight forms share this guide: one with no fixed pattern and seven the plugin can check.

- **Free verse** (`free-verse`) has no established form or meter [1].
- **Haiku** (`haiku`) is a short poem of an image and a cut, in English usually three lines [2].
- **Limerick** (`limerick`) is five lines, rhymed AABBA, with a bouncing rhythm [3].
- **Ballad** (`ballad`) is a story told in four-line stanzas [4].
- **Shakespearean sonnet** (`sonnet-shakespearean`) is fourteen lines: three quatrains and a couplet [5].
- **Petrarchan sonnet** (`sonnet-petrarchan`) is fourteen lines: an octave, a turn, a sestet [5].
- **Villanelle** (`villanelle`) is nineteen lines on two rhymes and two refrains [6].
- **Sestina** (`sestina`) is thirty-nine lines that rotate six end words [7].

Words written to be sung belong to the `prose-songwriting` skill. A poem has a reader on the page, who sees line
breaks, stanzas and white space [1], a listener, who hears rhyme, refrain and beat but not the spelling, and a
checker, who can count lines, stanzas, syllables and end words. Maintainer judgement: an eye rhyme, and a refrain that
comes back altered, are weaker for a listener than for a reader. A fixed form is a promise a reader can count, which
is why a tool can check it and why the count alone proves little. Two ideas run through the guide: a form is a
constraint chosen for the material, not a test of whether the poem is good; and the tool counts and compares sound,
but cannot hear, and cannot tell a fresh image from a stock one.

How far to trust the sources. The form definitions come mostly from one reference, the Academy of American Poets
glossary, and it hedges: the sonnet is "traditionally" iambic pentameter, haiku's syllable pattern has been "routinely
broken", and contemporary villanelles have "loosened the fixed form" [8][6]. A benchmark paper says forms are
"subjective, fluid, context-dependent" and fixed-form rules are "likely to be stretched or broken by poets" [9]. So
every count here is a convention with a typical shape. Evidence on what meter and rhyme do to a reader is thin: one
small German rating study found regular, rhymed stanzas liked more [10], and two abstracts report that rhyme can raise
the judged truth of statements (aphorisms, slogans) in lab studies [11][12]. That does not show that rhyme makes a
poem better.

Gaps, so they are not mistaken for findings. No source covers revising a poem, so the revise section is Maintainer
judgement built on what the plugin measures; imagery rests on a one-line Academy definition and one haiku poet [13].
Free verse has definitions only; haiku has one society source and no Japanese-side source; villanelle and sestina each
have one Academy entry; no source counts how many sonnets turn where the definitions say. The ballad's 4-3-4-3 and the
limerick's stress account rest on Wikipedia, so they are weaker than the rest.

### Using the plugin

- Write `<name>.md` with `form:` in the frontmatter (or pass `--form`). One source line is one verse line, a blank
  line ends a stanza, a heading labels the stanzas after it. A line starting with `- `, `1. ` or `> ` is read as a
  list item, step or quote (`verse.format.markup` warns; the line is still counted), and `#` starts a heading, which
  is not counted [14]. Plain section-label lines (`Chorus`) are read only in a song.
- `prose scan <file> --text` prints a row per line (source line, syllables, stress, rhyme letter, end word, flags),
  the inferred scheme and a count of words by trust; `--words` adds each word's reading, and JSON adds a
  punctuation-based `ending`. Measured here: its `line` column counts source lines, so a poem under three frontmatter
  lines starts at 4.
- `prose pronounce <word...>` shows one word's source, syllables, stress, phones and variants. `prose lint <file>`
  runs the rules below; a passing check prints nothing, so a quiet lint on a sestina means the rotation held and
  nothing else was measured. `prose measure <file>` gives line, stanza and syllable statistics.
- The `prose-poetry` skill writes and checks these forms. For versions the owner will choose between, use a variant
  set (`prose set new`): it checks that versions differ in measured style, not which is better, and its measures are
  the general prose ones, not sound measures.

The engine can check line and stanza counts, end-rhyme groups, the haiku's soft syllable pattern, a pattern or scheme
the draft declares, villanelle refrains, the sestina's rotation and envoi, a polysyllable's stress against its slot
(advisory), and which words are guessed or ambiguous. It cannot judge whether the poem is good, an image fresh, a
break earned, or where the turn falls; it does not check the ballad's stress count, kigo, the cut or the limerick's
twist or how the poem sounds aloud. Known meter lengths use the scansion fit rules (see the meter part).

## Anatomy and conventions

### The line, the break and the pause

The line is the unit a poet chooses. Hirsch says free verse "uses the graphic line to differentiate itself from prose"
[1]. An end-stopped line ends with punctuation; an enjambed line carries a sentence or clause across the break, which
the Academy says "minimize[s] the difference of sound between verse and prose, while increasing the speed and pacing
of a poem" [15]. A caesura is "a pause for a beat in the rhythm of a verse, often indicated by a line break or by
punctuation"; Hirsch puts it inside the line, as in Wordsworth's "The world is too much with us; || late and soon,"
[16]. The entry does not reconcile the two statements.

The plugin sees only punctuation. `ending` in the scan JSON marks a line `stop` (it ends in `. ! ? ;` or `:`), `weak`
(a comma or a dash) or `run-on` (no mark): a proxy, not a reading of syntax, and no source here says what share of
enjambed lines is right. `verse.line-break.purpose` is a judgement rule that lint only lists. Maintainer judgement:
ask of each break what it does (a sound, a pause, a surprise, speed); a break that only reaches a count does nothing.

### Meter is a tendency, and the plugin treats it so

The Academy defines meter as "the measured pattern of rhythmic accents in a line of verse", counted in feet and feet
per line, which "can vary or be consistent throughout a poem" [17]; the anapest has "a catchy, headlong momentum" that
modern poets have mostly used for comic or ironic effects [18]. Scansion is contested. Wikipedia says "a perfectly
regular line of iambic pentameter may have anywhere from 2 to 9 stresses, but it is still felt to exhibit 5 pulses or
beats", and that scansion systems are "so numerous and contradictory" that their differences are hard to read; it is
an encyclopedia summary, weak evidence [19]. Prosodic lists every candidate pattern and keeps the best; by its own
report 52% of Shakespeare sonnet lines tie [20]. A scanner built on dictionary stress calls stress "not sufficient for
scanning a line of poetry" but "nevertheless necessary" [21]. A study of the 154 Shakespeare sonnets found "strong
regularity without mechanical uniformity" [22]; its 95.1% agreement rests on the author's own corrections, so it is
not plain-lookup accuracy and is not used here.

So the plugin's meter check is advisory and narrow (this plugin's choice, marked `derived`). Only a polysyllable's
dictionary stress is held against its slot: a primary stress in a weak slot, or none in a strong one, is listed.
One-syllable and guessed words never count, secondary stress is neutral, a feminine ending is allowed, an anapestic
line may drop its first weak syllable, and nothing is above `info`. It runs for the limerick (three feet on lines 1, 2
and 5, two on 3 and 4) and both sonnets (five iambs). In the scan's stress column `1`, `2` and `0` are stressed,
secondary and unstressed, and `?` a one-syllable or guessed word.

Measured here: a fourteen-line Petrarchan draft in eight-syllable lines now draws fourteen meter-length warnings.
Without declared counts, sonnets allow 10 syllables or 11 with a feminine ending; limericks use their line-specific
feet and permit a headless anapest. These use the same fit as advisory scansion, with pronunciation caveats.
An explicit `syllables` pattern takes precedence: declare fourteen 10s in one stanza to require exactly 10,
or a section map for labelled sections. Such a pattern is the author's requirement, and an 11-syllable line misses it.

### Rhyme: types, and the classes this plugin uses

The Academy defines perfect rhyme as words whose "final stressed vowel and all following sounds are identical"
(bright, flight), names end and internal rhyme, gives young and long as slant rhyme, and calls rhyme "a relatively new
technique" absent from Greek and Roman verse [23]. The plugin compares end words with six classes that echo Prosodic's
perfect, slant and assonance [20] but are simpler, US English only (bath and path, and similar pairs, may be wrong)
and conventions, not a standard [24]. Identity and eye rhyme are not defined by any source held for this guide; they
are this plugin's own classes. Every pronunciation variant of both words is compared and the best class wins.

| Class | The plugin means | Example (measured here) |
|---|---|---|
| `identity` | The same word, or the same sounds from the stressed vowel with the same onset | light / light |
| `perfect` | Same sounds from the last stressed vowel to the end, different onset | night / light |
| `assonance` | Same stressed vowel, different ending | day / late |
| `consonance` | Same ending after the vowel, different vowel | young / long |
| `eye` | Share three or more final letters (more than a bare ending such as -ing), but sound gives no better class than slant | love / move |
| `none` | None of the above | cat / dog |

Scheme letters in `prose scan` count identity and perfect pairs; the "near" scheme also counts assonance and
consonance. A pair flagged `uncertain` needed a reading that is not the dictionary's first: wind / sinned is perfect
only if "wind" is read as the verb, which the flat file cannot settle because it holds no part of speech [24]. Lint
compares each member of a rhyme group with the group's first line, not scheme strings, because one missed rhyme shifts
every later letter. Only a certain non-rhyme warns; slant, eye and guessed-word pairs are `info`. Measured here: lint
on Sonnet 18 (public domain) draws no warning and six info findings, among them that temperate / date is "not a
perfect rhyme in the dictionary" and "may be an eye rhyme or a historical pronunciation", and five guessed words
(dimm'd, untrimm'd, ow'st, wander'st, grow'st).

Evidence on rhyme is thin. A German experiment with 54 native speakers found imperfect rhymes "less acceptable than
perfect rhymes", more uncertain to judge, and more acceptable inside metered verse; English slant rhyme is untested
[25]. The Nantucket authors accepted a repeated word, though "you're supposed to pay attention to the last stressed
syllable, not use repeated words", and found that letting any stressed one-syllable word match either beat "is too
permissive" [26]; the Academy lets a limerick's last line repeat the first and says the sestina uses "end-word
repetition to effect a sort of rhyme" [3][7]. In the 17-listener German study metered and rhymed stanzas were liked
more, though the meter manipulation also changed the words [10]. Readers rated AI poems more favourably, and 89% of
those rhymed at every line against 40% of the human poems; the authors credit simplicity, not rhyme, and call
all-lines-rhyme only a "suggestive" predictor [27]. The aphorism and slogan abstracts report only that rhyme raised
the judged accuracy and persuasiveness of statements [11][12]. Maintainer judgement: if a rhymed line makes a claim,
check that it earns its conviction without the rhyme.

### The turn, the refrain and form as constraint

A volta is "a rhetorical shift that marks the change of a thought or argument in a poem", often signalled by "but",
"yet" or "however"; the Academy puts it between lines 8 and 9 of the Petrarchan sonnet and before the final couplet of
the Shakespearean, and finds it in other forms and in free verse [28]. A refrain is a line that comes back verbatim.
Bell's thesis (abstract read) treats constraint as a central category in the criticism of contemporary poetry; it
argues, it does not show that fixed forms help or hurt [29]. Maintainer judgement: pick a form because its constraint
suits the material, and drop it when most lines are padding for the count.

### What the plugin trusts, and how it says so

Each word is read from the CMU Pronouncing Dictionary and tagged `dict` (found), `affix` (a dictionary word plus a
regular ending, such as hummed) or `guessed` (not found: syllables estimated from spelling, stress unknown, rhyme read
from letters). Measured here: `prose pronounce hummed teakettles` reports hummed as `affix`, teakettles as `guessed`.
The maintainers "expect a number of errors, omissions and inconsistencies to remain" [24]; one benchmark's vowel-count
baseline scored 12.1% against 90.0% for a human at counting syllables in sentences, with gold counts from a
pronunciation library [30]. So a guessed word weakens its line's verdicts: `verse.pronunciation.guessed` lists them
and meter skips their lines. A word with readings of different length (temperate: two or three syllables) shows as a
range such as `9/10` and passes a target inside it; `verse.pronunciation.ambiguous` lists a word only when the reading
decides a rhyme or a declared count.

### Free verse

The Academy: "poetry not dictated by an established form or meter and often influenced by the rhythms of speech" [1].
The Poetry Foundation: "nonmetrical, nonrhyming lines that closely follow the natural rhythms of speech", where "a
regular pattern of sound or rhythm may emerge ... but the poet does not adhere to a metrical plan", and most published
lyric poetry since the early 20th century is free verse [31]. Hirsch calls it "a poetry of organic rhythms, of
deliberate irregularity", not formless, and finds iambic-based rhythms in Eliot's "Prufrock"; a short line "often
gives a feeling that something has been taken away" [1].

A free-verse poem has no rule to fail, so the plugin only describes it. One rule applies: `verse.rhyme.every-line`
notes six or more lines in which every end word rhymes with another, a sameness signal for your own review and never
an authorship verdict [27].

### Haiku

The Academy gives the traditional Japanese haiku as three lines and seventeen syllables, 5/7/5, whose regular traits,
"including its famous syllabic pattern", have been "routinely broken"; it keeps the philosophy of "a brief moment in
time" and "a sense of sudden enlightenment" [8]. The Haiku Society of America is more exact. Japanese haiku have
seventeen "sounds" (on) arranged five, seven and five, and some translators "have noted that about twelve syllables in
English approximates the duration of seventeen Japanese on"; "most haiku in English consist of three unrhymed lines of
seventeen or fewer syllables, with the middle line longest, though today's poets use a variety of line lengths and
arrangements" [2]. Welch, one practitioner, says teaching 5-7-5 syllables in English misreads the difference ("haiku"
is two syllables in English, three Japanese sounds) and that most literary haiku in English are shorter than seventeen
[32]. Convention: 5-7-5 is the English schoolbook rule, a translation of a Japanese count of sounds.

What the sources put in its place. Traditional haiku carry a season word (kigo) and a cutting word (kireji), "a sort
of spoken punctuation". In English "season words are sometimes omitted", "the most common technique is juxtaposing two
images or ideas", "punctuation, space, a line-break, or a grammatical break may substitute for a cutting word", most
haiku have no titles, and metaphor and simile are commonly avoided [2]. The Society's 2026 definition names neither
syllables nor lines, and says "a cut suggests a meaningful relationship between two or more images, perceptions, or
ideas" [33]. Welch: use "objective imagery", avoid interpreting words such as "beautiful" or "mysterious", and
"instead of writing about your reactions to stimuli, in a good haiku you write about those things that cause your
reactions" [32]. In one reader study (51 readers) originality was the strongest predictor of creativity ratings; its
control texts were built as 5-7-5, and it did not test 5-7-5 [34].

In the plugin: three lines (`verse.form.line-count` warns otherwise, though the Society allows variation and a
benchmark says haiku can mean concise poems of any length [9]) and a soft 5/7/5 that never rises above `info`. Not
checked: season, cut, image, or whether the poem is really a senryu, which "highlights the human condition" [33].

### Limerick

Five lines; "typically" the first two rhyme, the third and fourth rhyme, and the fifth "either repeats the first line
or rhymes with it" (AABBA); the rhythm is anapestic, "an accentual pattern that contains many sets of double
weakly-stressed syllables"; Lear preferred "nonsense" to "limerick" [3]. Wikipedia, citing the phonetician
Abercrombie, counts three stresses on lines 1, 2 and 5 and two on lines 3 and 4, with a flexible number of unstressed
syllables, at least one between stresses; stress is often distorted in the first line, "a feature of the form"; the
first line traditionally introduces a person and a place; and "the most prized limericks incorporate a kind of twist",
in the final line or the tortured rhymes [35]. It is a convenience source.

The plugin checks five lines, the AABBA groups (a repeated word counts as identity rhyme) and, advisory, the stress of
polysyllables against three anapests on lines 1, 2 and 5 and two on lines 3 and 4, where a line may drop its first
weak syllable.

### Ballad

A typical ballad is "a plot-driven song"; "often, a ballad does not tell the reader what's happening, but rather shows
the reader what's happening", in quatrains with "as few as three or four stresses" a line, rhymed on the second and
fourth lines or on all alternating lines [4]. Wikipedia describes iambic tetrameter on lines 1 and 3, trimeter on
lines 2 and 4, rhymed ABCB, with assonance common and the longer lines rarely rhymed [36]. The Academy states only
three or four stresses, so 4-3-4-3 is the common textbook shape, not a rule either source gives for every ballad.

The plugin checks that each stanza has four lines and rhymes ABCB or ABAB, whichever gives fewer warnings; it does not
check stresses. For words set to a known tune, declare `syllables: 8.6.8.6` and `scheme: xaxa` (`x` is a line that
need not rhyme) and lint counts each stanza against them. Convention: eight and six is the shape of common meter, the
hymn pattern; nothing here says every ballad uses it.

### The two sonnets

The Academy: "traditionally, the sonnet is a fourteen-line poem written in iambic pentameter, employing one of several
rhyme schemes", with two models, the Petrarchan and the Shakespearean [5]. The Petrarchan is an octave and a sestet,
rhymed abba abba then cdecde or cdcdcd; it "presents an argument, observation, question, or some other answerable
charge in the octave", and the turn between lines 8 and 9 makes the sestet "the vehicle for the counterargument,
clarification, or whatever answer the octave demands". The Shakespearean, three quatrains and a couplet rhymed abab
cdcd efef gg, "has been noted to lend itself much better to the comparatively rhyme-poor English language"; its
couplet "usually" concludes, amplifies or refutes the quatrains, and in Sonnet 130 "swerves in a surprising direction"
[5]. The Poetry Foundation says it allows "more space to be devoted to the buildup of a subject or problem" than the
Petrarchan, then "just two lines to conclude or resolve" [37]. Milton let the octave run into the sestet, and Spenser
linked the quatrains (abab bcbc cdcd ee) [5].

The plugin checks fourteen lines, each rhyme group against its first line, and (advisory) five iambs. The Petrarchan
may use either sestet scheme; the one with fewer warnings is used. The turn is not checked, and no source says how
many sonnets turn where the definitions place it. Measured here: changing the Petrarchan example's "But in the spring"
to "And in the spring" leaves lint at no warnings.

### Villanelle

Nineteen lines, five tercets and a quatrain, "with two repeating rhymes and two refrains". The first and third lines
of the opening tercet return alternately as the last line of each later tercet and together close the poem: A1 b A2 /
a b A1 / a b A2 / a b A1 / a b A2 / a b A1 A2 [6]. Scholars dispute whether it was a fixed form before the late
nineteenth century, and contemporary poets "have loosened the fixed form to allow variations on the refrains"; no
meter is stated [6].

The plugin checks 19 lines in stanzas of 3, 3, 3, 3, 3 and 4; A1 at lines 1, 6, 12 and 18 and A2 at 3, 9, 15 and 19,
each equal to its first appearance once case and punctuation are ignored (`verse.form.refrain`); and every `a` and `b`
line rhymed with its group's first line. If the line count is wrong the refrain check stays silent and the line count
speaks.

### Sestina

Thirty-nine lines: six six-line stanzas and a three-line envoi. The first stanza's six end words return in a fixed
order; "in place of a rhyme scheme, the sestina relies on end-word repetition to effect a sort of rhyme", and lines
"may be of any length", though the original had a syllabic restriction [7]. The Academy's rows are 1 ABCDEF, 2 FAEBDC,
3 CFDABE, 4 ECBFAD, 5 DEACFB and 6 BDFECA, then an envoi of ECA or ACE (the plugin stores them as end-word numbers,
A=0 to F=5). Each row is the one before it read in the order 6, 1, 5, 2, 4, 3 (checked here against the Academy's
table), which makes the rows easy to rebuild. The envoi "must also include the remaining three end-words, BDF, in the
course of the three lines so that all six recurring words appear in the final three lines". Of Pound's sestina the
Academy says "each recurrence changes in meaning, often very subtly" [7]. Maintainer judgement: choose end words that
can be a noun in one stanza and a verb or an adjective in another, and write the six words and the rotation as a table
before any line.

The plugin compares the last word of lines 1 to 36 with the first stanza's word for that slot (lowercase, so "hand"
and "hands" differ) and checks that all six words occur in lines 37 to 39, in any order; it does not check ECA. `prose
scan` prints the rotation as rhyme letters (a to f are the six end words). If the line count is not 39, only it
speaks.

## Length and timing

Verse has fixed lengths, not runtimes. The counts: haiku 3 lines, limerick 5, sonnets 14, villanelle 19 (stanzas of 3,
3, 3, 3, 3, 4), sestina 39 (six of 6, then 3), ballad stanzas of 4, free verse any. Every one is a convention that
practice stretches [8][9], which is why lint warns and never errors on a form's own count, and why haiku syllables are
`info`. A conflict is stated on the finding: a syllable count can dictate where a line breaks, and the Academy says
haiku counts are routinely broken, so let the break win when it must.

**How the plugin counts.** One source line is one verse line and a blank line ends a stanza; headings and frontmatter
are not lines. Syllables are each word's dictionary vowel count (a guessed word's is estimated from spelling); where
readings differ the column shows a range and a target inside it passes. `prose measure` gives the mean, spread,
minimum and maximum.

**Targets.** A draft can declare `target: 100 words`; `length.target` compares it with the word count and warns
outside plus or minus 10%, this plugin's choice (`derived`). Measured here: the free-verse example below has 46 words,
and with `target: 100 words` lint warns "Runs 46 words against a 100-word target (-54%)". There is no reading-time or
pace estimate for verse: `prose measure` reports no spoken figures for these forms, and no source here gives one.
Maintainer judgement: if a poem must fill a slot (a card, a toast, a page), set a word target and read it aloud with
its pauses to time it.

## What good looks like

The examples are written for this guide. Each lints with no errors under `prose lint`, with its form in the
frontmatter, and with no warnings except the marked failures, whose counts are shown. A failure that is one changed
word of a good poem is described after it; the guide's tests make the same change and count the findings.

### Free verse: the thing seen instead of the feeling

The failure names its feeling and rhymes every line in pairs. Measured here: lint reports 0 warnings and 1 info
finding, `verse.rhyme.every-line`; nothing checks that the feeling is stated. The rewrite shows a porch, boots and a
kettle and breaks lines where the sense turns. Measured here: lint reports nothing.

<!-- bad example, on purpose: the guide's tests lint it as free-verse and expect 0 warnings -->

```markdown
---
form: free-verse
---
The rain came down and made me sad,
the grey sky made me feel so bad.
I stood alone beside the door,
and could not take it anymore.
My heart was heavy as a stone,
I felt so lost and all alone.
```

```markdown
---
form: free-verse
---
Rain on the porch roof all night.
By six the gutter has filled and spilled
over the bed of mint.
My father's boots are by the door,
one on its side, still dark at the toe.
I put the kettle on and do not move them.
```

### Haiku: two images and a cut

The failure counts 5-7-5 exactly and says what it feels, with the interpreting word Welch warns against [32]. Measured
here: lint reports no warnings and no info, because every line meets the count, which is all it checks. The rewrite
cuts after "first frost" (a dash; frost is the season) and sets the dog's breath beside the writer's without saying
what that means. It does not keep 5-7-5: lint reports 0 warnings and 3 info findings (lines of 2, 5 and 4 syllables
against a soft 5/7/5). Keep the poem; the Society's definition names neither syllables nor lines [33].

<!-- bad example, on purpose: the guide's tests lint it as haiku and expect 0 warnings -->

```markdown
---
form: haiku
---
The beautiful dawn
fills my heart with happiness
and I feel so glad
```

```markdown
---
form: haiku
---
first frost—
the dog's breath and mine
over the gate
```

### Limerick: the last line turns

The poem scans as three anapests on lines 1, 2 and 5 and two on lines 3 and 4, and puts its twist in the last line,
one of the two places Wikipedia says a prized limerick's twist may lie [35]. Measured here: lint reports nothing.
Failure by one change: ending line 2 on "wall" instead of "stair" draws 1 warning, `verse.form.rhyme-scheme` (lines 4
and 5, source lines, "Claire" and "wall"). Maintainer judgement: the usual slip when a rhyme word is changed for sense
and the first rhyme is not re-checked.

```markdown
---
form: limerick
---
A curator in Dover, named Claire,
Hung a portrait too high on the stair;
It looked down on the crowd
And it said, clear and loud,
"From here you're all parting and hair."
```

### Ballad: the event, not a summary of it

The failure summarises ("she was sad", "felt sorry"), the opposite of what the Academy says a ballad does [4], and its
second and fourth lines do not rhyme. Measured here: lint reports 1 warning, `verse.form.rhyme-scheme`, for "money"
and "free". The rewrite is three quatrains of eight and six syllables with lines 2 and 4 rhymed; it declares
`syllables: 8.6.8.6` and `scheme: xaxa`, so lint also counts every line. Measured here: lint reports nothing and the
scan's `want` column reads `ok` on all twelve lines. The wet shoes, the lamp and the hand that leaves no ripple carry
the story; none of it is told.

<!-- bad example, on purpose: the guide's tests lint it as ballad and expect 1 warning -->

```markdown
---
form: ballad
---
A woman came down to the pier at dusk.
She was sad and she had no money.
The ferryman felt sorry for her
and took her across for free.
```

```markdown
---
form: ballad
syllables: 8.6.8.6
scheme: xaxa
---
At dusk a woman reached the pier
with water in her shoes.
She had no coin, she had no bag,
and nothing left to lose.

The ferryman bent to his oars,
the lamp swung on its nail.
She dipped one hand beside the boat
and left no ripple's trail.

He grounded on the farther bank.
She stepped out, dry and slight.
He rowed back light across the dark
and did not sleep that night.
```

### The sonnets: where the turn falls

The Shakespearean example spends two quatrains on a view (waiting is a loss) and a third on a counter-image, then
turns on "But" at line 13 into the couplet. The Petrarchan one states a loss in the octave and turns on "But" at line
9. Both are ten syllables to a line (read the `syl` column) and rhyme perfectly in the dictionary. Measured here: lint
reports nothing on either.

```markdown
---
form: sonnet-shakespearean
---
I used to think that waiting was a loss,
A strip of dead road laid across the day.
I checked my watch and sighed and, feeling cross,
Would stamp my feet and look the other way.

My gran would settle on the step, her bowl
Of peas and split each pod along its seam,
And watch the lane, as if the light were whole,
And let the afternoon go like a stream.

She never glanced at clocks. The bus would come
Or not, and either way the peas were sweet.
I think of her when I stand waiting, numb,
And find the time to take the empty seat.

But what I tallied as the time I paid
She spent as hers, and so the day was made.
```

```markdown
---
form: sonnet-petrarchan
---
They sold the farm the winter of the rain:
The cattle first, the tractor, then the ground.
A man in a good coat walked slowly round,
Named us a price, and drove back down the lane.
My father watched him through the kitchen pane,
Then went out to the barn. The only sound
Was his own boots. The old dog, having found
A place in the straw, did not once complain.

But in the spring the buyer made a call:
The bell cow would not follow, and would stand.
My father drove up through the rain and stood
Beside the gate. He did not speak at all.
She came across the field and licked his hand,
And let him lead her out, as once she would.
```

Failures, each one change with the counts the tests check. Changing "cross" in the first sonnet's third line to "late"
draws 1 warning, `verse.form.rhyme-scheme`: lines 4 and 6 should rhyme. Deleting its last line draws 1 warning,
`verse.form.line-count` ("Expected 14 lines ... found 13"), and the rhyme check goes silent because the line count has
spoken. With `syllables:` set to fourteen tens and the poem written as one block, lint is silent on the first sonnet,
and adding one syllable to a line draws 1 warning from `verse.form.syllables`.

### Villanelle: refrains that mean more each time

The refrains are the poem. "We bury what we love and let it grow" first reads as planting and by the end as faith with
no promise attached; "The frost goes down. The rest I cannot know" is the same sentence each time and means more as
the winter goes on. Measured here: lint reports nothing, and `prose scan` prints the scheme `abaabaabaabaabaabaa`.
Failures by one change. Changing the third appearance of the first refrain (the poem's line 12, source line 18) to "We
bury what we love, then let it grow." draws 1 warning, `verse.form.refrain`, naming that line and quoting the line it
should repeat; the rhyme is intact, so only that rule speaks. Changing only its punctuation draws none, since the
check ignores case and punctuation. Poets do vary refrains [6]; the warning prompts you to confirm the change is on
purpose.

```markdown
---
form: villanelle
---
We bury what we love and let it grow.
October gave a week of steady rain.
The frost goes down. The rest I cannot know.

The beds are raked, the whole long garden low
And dark, and nothing there to break the plain.
We bury what we love and let it grow.

My neighbour says the squirrels will dig, and so
He lays out wire along the garden lane.
The frost goes down. The rest I cannot know.

I kneel and press them deep, row after row,
And ask no questions of what may remain.
We bury what we love and let it grow.

The days draw in. The window fills with snow.
No wish of mine could hasten or explain.
The frost goes down. The rest I cannot know.

Come March I'll kneel and look. And even though
I'll have no right to say it was in vain,
We bury what we love and let it grow.
The frost goes down. The rest I cannot know.
```

### Sestina: a rotation you can read

The six end words are bread, window, hands, light, water and door, the objects of one kitchen; they drift in sense
(the light is the weather, then the sign that the shop is open; the door is locked, then not). Measured here: lint
reports nothing, and `prose scan` prints the end-word letters, which are the rotation: `abcdef faebdc cfdabe ecbfad
deacfb bdfeca eca` (a is bread, b window, c hands, d light, e water, f door). The envoi ends on water, hands and bread
(E, C, A) and holds door, window and light inside its lines. Failures by one change. Swapping the last words of source
lines 19 and 20 (door and light) draws 2 warnings from `verse.form.end-words`, each naming the line, the word found
and the word stanza 3 should end it with. Replacing "water" in source line 46 with "tap" draws 1 warning, that the
envoi is missing "water"; the line is outside the 36 rotation lines, so only the envoi check speaks.

```markdown
---
form: sestina
---
At three I come down in the dark to the bread.
The shop is cold. Frost has grown on the window.
I flour the table and warm my hands.
One bulb is on, and gives a thin yellow light.
The tap shudders, then it gives me water.
Outside, a van goes by. I lock the door.

My mother never locked the kitchen door.
She said an open house would never want for bread.
She woke me to the sound of running water
and sat me on a stool beside the window
to watch the sky above the yard take light.
She taught me how to read the dough with my hands.

"Learn it through the skin," she said. "Your hands
know more than you do." Then she propped the door
and let the cold come in, and let the light
come with it, and said the cold was good for bread.
I watched her lean across me to the window
and tip the washing-up bowl's grey water

across the yard. I loved the sound of water
falling in the dark, and her red hands
on the sill. She wiped them dry at the window
and said, "Go on," and I went through the door
to fetch the coal. We never ate our bread
until the loaves were out and there was light.

She died in March. The mornings kept their light.
I could not stand to run the kitchen water,
and for a month I sold the town no bread.
I sat and looked at flour on my hands
and did not move. At six, someone at the door
knocked once, then tapped his ring against the window.

He said, "Nobody's seen you at the window.
We saw the shop was dark. We missed the light."
I let him in. I did not lock the door.
I filled the kettle at the tap, the water
loud in the empty room, and washed my hands,
and floured the board, and started on the bread.

I leave the door unlocked. I run the water.
The window fills with light; I wash my hands.
A face comes to the window. I hand over bread.
```

## Common failures and the habits behind them

Each failure has a habit that produces it; fixing the habit prevents the next one. The habits are Maintainer judgement
unless a source is cited.

### Bending the line to the count or the rhyme

Failure: an inverted phrase, a filler word or an odd verb so the line reaches ten syllables or the rhyme lands. Habit:
choosing the rhyme before the sense. Fix: change the rhyme word, not the syntax; let a haiku break its count, as the
Academy and the Society both allow [8][2]. German readers rated unconventional syntax less acceptable [38].

### Telling the feeling, or reaching for the stock image

Failure: "sad", "beautiful", a closing line that explains the poem, an image borrowed from a hundred poems. Habit:
writing from the idea of the poem. Fix: write the things that cause the reaction (Welch's objective imagery, for
haiku); the Academy defines imagery as language "representing a sensory experience" [32][13]. The plugin cannot detect
this; it is for the writer and the owner.

### Every line rhymes, or the rhyme is the argument

Failure: couplets all the way down in free verse, or a rhymed statement with more conviction than it has earned.
Habit: letting the sound lead. Fix: let some lines end on unrhymed sounds, and test each rhymed claim without its
rhyme. `verse.rhyme.every-line` flags the first as a sameness signal [27]; the second rests on the rhyme-as-reason
abstracts [11].

### Wearing the form without its turn

Failure: fourteen lines and no volta; a villanelle whose refrains read the same each time; a sestina whose end words
keep one meaning; a limerick with no twist; a haiku with no cut. Habit: treating the count as the form. Fix: name the
turn, the changing refrain, the new sense of the end word, the twist or the cut before drafting [28][7]. The plugin
passes all of these.

### Trusting a quiet lint

Failure: writing "perfect iambic pentameter" because lint printed nothing, or "5-7-5" without a scan; reporting an eye
rhyme as a rhyme; ignoring guessed words. Habit: reading silence as approval. Fix: lint is silent when a check passes
and has no length check for sonnet lines; read the `syl` and `stress` columns, report the numbers, and say which words
were guessed or ambiguous and what was not checked.

## How to revise

Maintainer judgement throughout; no source covers revising poems. What the poem does comes before how it sounds.

1. **Name the form and the reader.** Set `form:` (or `--form`). For words to a known tune, declare `syllables` and
   `scheme`. Decide whether the owner may want a choice (a variant set) before polishing one version.
2. **Scan.** Run `prose scan <file> --text`. Check lines, the `syl` column against the form (10 or 11 for pentameter,
   5/7/5 for a counted haiku), the rhyme letters against the scheme, and the trust counts.
3. **Lint.** Fix warnings in this order: line count and stanza size, refrains or end words, then rhyme scheme. Decide
   each `info` (slant or eye rhyme, guessed or ambiguous word, meter) and say why one stays.
4. **Find the turn.** Mark the volta, the cut, the changed refrain, the new sense of an end word, or the twist, and
   check it falls where the form puts it. If nothing turns, cut or reorder before touching words.
5. **Break the lines on purpose.** For each line ask why it ends here (`verse.line-break.purpose`); move a break that
   only reaches a count, and let a haiku or free-verse line break win over a syllable target.
6. **Cut telling, then check by ear.** Replace each named feeling with the thing that causes it; cut a closing line
   that explains; read the poem aloud and `prose pronounce` any doubtful word. Change a rhyme that works only on the
   page.
7. **Re-run and report numbers.** Report lines, syllables where the form or request sets a count, the scheme and the
   guessed words. Say what the tool cannot judge: imagery, originality, whether the breaks work, how it sounds.

## Rules that apply

The table is generated from `craft/rules.json` for the eight forms. A threshold marked "This plugin's choice" is not a
source's figure. The `verse.*` checks measure form and sound; the prose-style rules at the top mostly stay quiet for
poems, whose line breaks are not sentence boundaries. Whether a poem is good, fresh or well broken is for the writer
and the owner.

<!-- generated:rules begin (npm run guides) -->
| Rule | What it checks | Severity | Threshold | Threshold basis | Run by |
|---|---|---|---|---|---|
| `readability.grade.report` | Reading grade is reported, never targeted. | info | none | n/a | lint |
| `style.passive.report` | Passive voice is counted and reported, not banned. | info | none | n/a | lint |
| `ai.copula-avoidance` | 'serves as', 'stands as', 'functions as' in place of is/are are flagged. | info | none | n/a | lint |
| `ai.artifact` | No leaked chatbot markup or unfilled placeholders. | error | none | n/a | lint |
| `draft.placeholders` | Bracketed placeholders are listed until filled. | info | none | n/a | lint |
| `ai.vocabulary` | Three or more distinct era-tagged AI vocabulary terms in one draft are flagged. | warn | 3 distinct terms | This plugin's choice (derived) | lint |
| `length.target` | A draft with a declared target lands within ±10% of it; page-derived script minute targets use the provisional ±20% timing band. | warn | 0.1 fraction | This plugin's choice (derived) | lint |
| `voice.targets` | Each voiced speaker's measured style stays inside the voice bible's target ranges. | warn | none | n/a | lint |
| `voice.bible-valid` | Every voice bible in the project loads: valid YAML and schema, id matching the file name, unique ids, and each speaker claimed by one bible. | error | none | n/a | lint |
| `voice.banned` | A speaker never uses a word their voice bible bans. | warn | none | n/a | lint |
| `voice.unvoiced` | In a project with voice bibles, every speaker resolves to one. | info | none | n/a | lint |
| `verse.form.line-count` | The form fixes the line count: sonnet 14, villanelle 19, sestina 39, limerick 5, haiku 3, and ballad stanzas of 4. | warn | none | n/a | lint |
| `verse.form.rhyme-scheme` | End rhymes follow the scheme, the form's or the one the draft declares in its frontmatter (a letter per line, x for an unconstrained line): each rhyme group matches its first line. | warn | none | n/a | lint |
| `verse.form.syllables` | Each line fits a declared syllable pattern, the form's known meter length with tolerated variation, or the soft haiku count. | warn | none | n/a | lint |
| `verse.form.refrain` | Villanelle refrains repeat verbatim at the required lines (A1 at 1, 6, 12, 18; A2 at 3, 9, 15, 19). | warn | none | n/a | lint |
| `verse.form.end-words` | Sestina stanzas rotate the first stanza's six end words in the fixed order, and the envoi holds all six. | warn | none | n/a | lint |
| `verse.meter.deviation` | Lines where a polysyllabic word's stress contradicts its slot in the form's or author's declared textual meter are listed (advisory). | info | none | n/a | lint |
| `verse.pronunciation.guessed` | Words missing from the pronouncing dictionary are listed; verdicts on their lines are weaker. | info | none | n/a | lint |
| `verse.pronunciation.ambiguous` | Words with several pronunciations are listed only where the reading matters: an end word whose rhyme depends on it, or a word that decides whether a line fits a declared syllable or meter count. | info | none | n/a | lint |
| `verse.rhyme.every-line` | Free verse of six or more lines where every end word rhymes with another line is flagged as a sameness signal. | info | 6 lines | This plugin's choice (derived) | lint |
| `verse.format.markup` | A verse line that starts like Markdown (a dash, a number and period, or >) is read as a list item, step or quote, not a line. | warn | none | n/a | lint |
| `verse.line-break.purpose` | Each line ends where it does for a reason: sound, sense, speed or surprise. | info | none | n/a | judgement |
<!-- generated:rules end -->

## Sources

Numbers in brackets in the text refer to this list. Reference-work entries (the Academy and Poetry Foundation
glossaries, the Haiku Society definitions) state conventions and were not tested; several studies were read only as
abstracts, and the German studies do not carry to English rhyme.

<!-- generated:sources begin (npm run guides) -->
1. Academy of American Poets (with Edward Hirsch, A Poet's Glossary), 2019. [Free Verse (Glossary of Poetic Terms)](https://poets.org/glossary/free-verse) (review; id `poets-org-free-verse`). Reference glossary entry, not a study: poetry not dictated by an established form or meter; Hirsch's essay calls it organic and deliberately irregular, with a visual form and a graphic line. A defender's account; no critique, no study of its rhythm.
2. Haiku Society of America Definitions Committee, 2004. [Report of the Definitions Committee, September 18, 2004](https://www.hsa-haiku.org/hsa-definitions-2004.html) (style-guide; id `hsa-2004`). One society's official definitions of haiku and related terms, for readers and writers in English: seventeen on in Japanese against seventeen or fewer syllables in English, kigo, kireji, juxtaposition, no titles. The only haiku society source held; no Japanese-side or other English-language society.
3. Academy of American Poets, 2019. [Limerick (Glossary of Poetic Terms)](https://poets.org/glossary/limerick) (review; id `poets-org-limerick`). Reference glossary entry, not a study: five lines, AABBA (the fifth line repeats the first or rhymes with it), anapestic, three stresses on lines 1, 2 and 5 and two on lines 3 and 4.
4. Academy of American Poets, 2019. [Ballad (Glossary of Poetic Terms)](https://poets.org/glossary/ballad) (review; id `poets-org-ballad`). Reference glossary entry, not a study: quatrain stanzas, lines with as few as three or four stresses, rhymed on the second and fourth lines or on all alternating lines.
5. Academy of American Poets, 2019. [Sonnet (Glossary of Poetic Terms)](https://poets.org/glossary/sonnet) (review; id `poets-org-sonnet`). Reference glossary entry, not a study: traditionally 14 lines of iambic pentameter; Petrarchan abbaabba then cdecde or cdcdcd with a turn after line 8; Shakespearean abab cdcd efef gg. The entry says "traditionally" and "one of several rhyme schemes".
6. Academy of American Poets, 2019. [Villanelle (Glossary of Poetic Terms)](https://poets.org/glossary/villanelle) (review; id `poets-org-villanelle`). Reference glossary entry, not a study: 19 lines, five tercets and a quatrain, A1 b A2 / a b A1 / a b A2 / a b A1 / a b A2 / a b A1 A2. Notes that contemporary poets have loosened the refrains. Gives no meter.
7. Academy of American Poets, 2019. [Sestina (Glossary of Poetic Terms)](https://poets.org/glossary/sestina) (review; id `poets-org-sestina`). Reference glossary entry, not a study: 39 lines, six six-line stanzas rotating six end words (ABCDEF, FAEBDC, CFDABE, ECBFAD, DEACFB, BDFECA) and a three-line envoi holding all six. Lines may be any length; no rhyme scheme.
8. Academy of American Poets, 2019. [Haiku (Glossary of Poetic Terms)](https://poets.org/glossary/haiku) (review; id `poets-org-haiku`). Reference glossary entry, not a study: a traditional Japanese haiku is three lines in 5/7/5, and the entry says the form's regular traits, including the syllable pattern, have been routinely broken.
9. Walsh, Preus and Antoniak, 2024. [Sonnet or Not, Bot? Poetry Evaluation for Large Models and Datasets](https://arxiv.org/html/2406.18906v3) (review; id `sonnet-or-not-bot`). arXiv preprint (v3); peer-review status was not confirmed. A form-recognition benchmark of over 4.1k annotated poems; says poetic forms are "likely to be stretched or broken by poets".
10. Obermeier, Menninghaus, von Koppenfels, Raettig, Schmidt-Kassow, Otterbein and Kotz, 2013. [Aesthetic and emotional effects of meter and rhyme in poetry](https://www.frontiersin.org/articles/10.3389/fpsyg.2013.00010/full) (peer-reviewed; id `obermeier-2013`). 17 native German speakers rated recorded four-line stanzas; metered and rhymed versions were liked more. Small sample, German poetry heard aloud, end rhyme present or absent only.
11. Matthew S. McGlone and Jessica Tofighbakhsh, 2000. [Birds of a feather flock conjointly (?): rhyme as reason in aphorisms](https://europepmc.org/article/MED/11228916) (peer-reviewed; id `mcglone-tofighbakhsh-2000`). Psychological Science. Read as an abstract only: rhyming aphorisms were judged more accurate than equivalent non-rhyming ones, attributed to processing fluency. About statements, not poems.
12. Petra Filkuková and Sven Hroar Klempe, 2013. [Rhyme as reason in commercial and social advertising](https://europepmc.org/article/MED/23841497) (peer-reviewed; id `filkukova-klempe-2013`). Scandinavian Journal of Psychology. Read as an abstract only: three experiments in which rhyming slogans were rated more likeable, persuasive and trustworthy. No sample sizes or effect sizes held; about slogans, not poems.
13. Academy of American Poets, 2022. [Imagery (Glossary of Poetic Terms)](https://poets.org/glossary/imagery) (review; id `poets-org-imagery`). Reference glossary entry, a short definition only: language representing a sensory experience (visual, auditory, olfactory, tactile, gustatory). No craft advice on writing or revising it.
14. MacFarlane (CommonMark). [CommonMark Spec](https://spec.commonmark.org/) (standard; id `commonmark-spec`). The Markdown specification the parser follows: a line starting with a list marker, a number and a period, > or # starts a list item, ordered list, block quote or heading.
15. Academy of American Poets, 2022. [Enjambment (Glossary of Poetic Terms)](https://poets.org/glossary/enjambment) (review; id `poets-org-enjambment`). Reference glossary entry, not a study: defines enjambment against the end-stopped line and says without punctuation lines run on faster. Gives no way to detect it mechanically.
16. Academy of American Poets (with Edward Hirsch, A Poet's Glossary), 2023. [Caesura (Glossary of Poetic Terms)](https://poets.org/glossary/caesura) (review; id `poets-org-caesura`). Reference glossary entry: a pause for a beat in the rhythm of a verse, often shown by a line break or punctuation; Hirsch places it inside the line, marked || in scansion. The two statements are not reconciled.
17. Academy of American Poets, 2023. [Meter (Glossary of Poetic Terms)](https://poets.org/glossary/meter) (review; id `poets-org-meter`). Reference glossary entry: the measured pattern of rhythmic accents in a line; feet and feet per line; meter can vary or be consistent. It labels a three-stress Dickinson line as tetrameter, so its scansions are one reading and not used as examples.
18. Academy of American Poets (with Edward Hirsch, A Poet's Glossary), 2023. [Anapest (Glossary of Poetic Terms)](https://poets.org/glossary/anapest) (review; id `poets-org-anapest`). Reference glossary entry: two unaccented syllables then one accented; a headlong momentum, mostly used in modern poetry for comic or ironic effects.
19. Wikipedia contributors. [Scansion](https://en.wikipedia.org/wiki/Scansion) (practitioner; id `wikipedia-scansion`). Weak evidence: an encyclopedia summary (no allowed kind fits an encyclopedia article, so the nearest is practitioner, as for wikipedia-signs-ai). Its claims rest on citations that were not checked here.
20. Heuser, Falk and Anttila (quadrismegistus/prosodic). [Prosodic: a metrical-phonological parser for English and Finnish](https://github.com/quadrismegistus/prosodic) (platform-doc; id `prosodic`). The project's own documentation and self-reported figures: rhyme classed as perfect, slant (consonance), assonance or none from the sounds after the last stressed vowel; bands fitted to Walker's 1775 rhyming dictionary.
21. Manex Agirrezabal, Aitzol Astigarraga, Bertol Arrieta and Mans Hulden, 2016. [ZeuScansion: a tool for scansion of English poetry](http://jlm.ipipan.waw.pl/index.php/JLM/article/download/102/136) (peer-reviewed; id `agirrezabal-2016`). Journal of Language Modelling. A finite-state scansion tool built on dictionary stress with a stress guesser for unknown words; its authors say lexical stress is not sufficient for scanning a line but is necessary.
22. Tushar Sen, 2026. [Quantifying Shakespeare's iambic pentameter](https://jdmdh.episciences.org/19417/pdf) (peer-reviewed; id `sen-2026`). Journal of Data Mining and Digital Humanities, single author. A corpus study of the 154 sonnets: strong regularity without mechanical uniformity. Its 95.1% agreement depends on the author's corrections and the first-variant rule, so it is not plain-dictionary accuracy.
23. Academy of American Poets, 2022. [Rhyme (Glossary of Poetic Terms)](https://poets.org/glossary/rhyme) (review; id `poets-org-rhyme`). Reference glossary entry: perfect rhyme (final stressed vowel and all following sounds identical), end and internal rhyme, slant rhyme (young and long); rhyme is a relatively new technique. It defines neither identity rhyme nor eye rhyme.
24. Carnegie Mellon University Speech Group (cmusphinx/cmudict). [CMU US English pronouncing dictionary](https://github.com/cmusphinx/cmudict) (platform-doc; id `cmudict`). US English only. The maintainers do not guarantee accuracy and "expect a number of errors, omissions and inconsistencies to remain"; the flat file carries no part of speech and handles reduced variants inconsistently.
25. Christine A. Knoop, Stefan Blohm, Maria Kraxenberger and Winfried Menninghaus, 2021. [How perfect are imperfect rhymes?](https://ids-pub.bsz-bw.de/files/12565/Knoop_Blohm_Kraxenberger_How_Perfect_2021.pdf) (peer-reviewed; id `knoop-2021`). Psychology of Aesthetics, Creativity, and the Arts. A speeded judgment experiment with 54 native German speakers and 180 German couplets: imperfect rhymes less acceptable than perfect ones, more acceptable in metered context. German stimuli; the table cells did not re-attach, so only the prose findings are used.
26. Danielle Sucher and Darius Bacon, 2014. [Nantucket, hacking at verse (BangBangCon talk)](https://bangbangcon.com/2014-transcripts/danielle-sucher-darius-bacon-nantucket-hacking-at-verse.txt) (practitioner; id `sucher-bacon-2014`). A short spoken talk by two programmers who searched books for limericks with CMUdict: informal, no accuracy figures, but a first-hand account of unknown words, repeated-word rhyme and over-permissive stress matching.
27. Porter and Machery, 2024. [AI-generated poetry is indistinguishable from human-written poetry and is rated more favorably](https://pmc.ncbi.nlm.nih.gov/articles/PMC11564748) (peer-reviewed; id `porter-machery-2024`). Scientific Reports, two pre-registered studies on non-expert readers; ChatGPT 3.5 poems against poems by 10 canonical poets. The paper itself, not a news summary.
28. Academy of American Poets, 2022. [Volta (Glossary of Poetic Terms)](https://poets.org/glossary/volta) (review; id `poets-org-volta`). Reference glossary entry: a rhetorical shift in thought, often marked by but, yet or however; between lines 8 and 9 in the Petrarchan sonnet, before the couplet in the Shakespearean, and found in other forms and free verse. No count of how many sonnets turn there.
29. Alexander Bell (PhD thesis, University of East Anglia), 2020. [Constraint in contemporary poetry](https://ueaeprints.uea.ac.uk/id/eprint/79837/1/2020BellAPhD.pdf) (peer-reviewed; id `bell-2020`). A doctoral thesis, read only in its abstract and framing: treats constraint as a central category in the criticism and practice of contemporary poetry. A critical argument, not evidence about fixed forms.
30. Suvarna, Khandelwal and Peng, 2024. [PhonologyBench: Evaluating Phonological Skills of Large Language Models](https://arxiv.org/html/2404.02456v1) (review; id `phonologybench`). arXiv preprint (v1); peer-review status was not confirmed. Six 2024-era LLMs on grapheme-to-phoneme, syllable counting and rhyme generation, American English; gold syllable counts come from a G2P library.
31. Poetry Foundation, 2024. [Free verse (glossary term)](https://www.poetryfoundation.org/learn/glossary-terms/free-verse) (review; id `poetry-foundation-free-verse`). Reference glossary entry: nonmetrical, nonrhyming lines that follow the natural rhythms of speech; most published lyric poetry since the early 20th century is free verse.
32. Michael Dylan Welch, 2003. [Becoming a Haiku Poet](https://www.graceguts.com/essays/becoming-a-haiku-poet) (practitioner; id `welch-haiku`). One haiku poet's essay: objective imagery, a pause with two juxtaposed parts, a season reference, and the claim that teaching 5-7-5 syllables in English misreads Japanese sound counts. A practitioner's view, not a study.
33. Haiku Society of America, 2026. [HSA Definitions (haiku, senryu and haibun updated in 2026)](https://www.hsa-haiku.org/hsa-definitions.html) (style-guide; id `hsa-2026`). The Society's current page: the 2026 haiku definition names neither syllables nor lines and adds that a cut suggests a meaningful relationship between two or more images, perceptions or ideas.
34. Soma Chaudhuri and Joydeep Bhattacharya, 2025. [Creativity judgments in haiku and senryu](https://doi.org/10.1002/jocb.70018) (peer-reviewed; id `chaudhuri-bhattacharya-2025`). Journal of Creative Behavior. 51 readers in one lab rated 140 award-winning English haiku and senryu and 70 control texts built as 5-7-5; originality was the strongest predictor of creativity ratings. It does not test whether 5-7-5 matters.
35. Wikipedia contributors. [Limerick (poetry)](https://en.wikipedia.org/wiki/Limerick_(poetry)) (practitioner; id `wikipedia-limerick`). Weak evidence: an encyclopedia summary (nearest allowed kind). Quotes the phonetician Abercrombie on three stresses in lines 1, 2 and 5 and two in lines 3 and 4; stress in the first line is often distorted; the twist may lie in the last line or the tortured rhymes.
36. Wikipedia contributors. [Ballad stanza](https://en.wikipedia.org/wiki/Ballad_stanza) (practitioner; id `wikipedia-ballad-stanza`). Weak evidence: an encyclopedia summary (nearest allowed kind). Iambic tetrameter on lines 1 and 3, trimeter on lines 2 and 4, rhymed ABCB. The Academy gives only three or four stresses a line, so 4-3-4-3 is the common shape, not a rule.
37. Poetry Foundation, 2024. [Shakespearean sonnet (glossary term)](https://www.poetryfoundation.org/learn/glossary-terms/shakespearean-sonnet) (review; id `poetry-foundation-shakespearean-sonnet`). Reference glossary entry: three quatrains and a couplet, abab cdcd efef gg; more space for the buildup than the Petrarchan form, then two lines to conclude. The Petrarchan entry could not be captured.
38. Stefan Blohm, Valentin Wagner, Matthias Schlesewsky and Winfried Menninghaus, 2018. [Sentence judgments and the grammar of poetry](https://ids-pub.bsz-bw.de/files/12582/Blohm_Wagner_Sentence_judgments_2018.pdf) (peer-reviewed; id `blohm-2018`). Poetics. Two experiments with German readers: conventional departures from ordinary syntax and alternating rhythm raised judged poeticity; non-canonical syntax was rated more poetic but less acceptable. German sentences, not English verse.
<!-- generated:sources end -->
