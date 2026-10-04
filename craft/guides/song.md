---
family: song
title: Song lyrics
forms: [song]
reviewed: "2026-10-04"
sources: [fine-ginsborg-2014, gordon-magne-large-2011, pattison-prosody, musical-u-song-forms, pattison-romantic, chase-direct-address, berklee-songwriting-tools, coursera-songwriting-lyrics, parada-cabaleiro-2024, liikkanen-jakubowski-2020, nobile-2022, nunes-2015, hirjee-brown-2010, proto-2013, rodriguez-vazquez-folk-song, wikipedia-metre-hymn, hymnary-azmon, poets-org-hymn, cmudict, wikipedia-ballad-stanza, poets-org-ballad, prosodic, copyright-office-fair-use-faq, copyright-office-fair-use]
---
# Song lyrics: a craft reference

Read the section you need, not the whole guide: `prose guide song --section <name>`. How the text is
marked: a number in brackets, such as [3], points to the Sources list at the end. "Convention:" marks a
habit of the trade or a choice of this plugin that no source tested. "Maintainer judgement:" marks advice
with no source behind it. "Measured here:" marks a number from a run of this plugin on the guide's own
examples; it shows that a problem happens, not how often.

## What it is and who reads or hears it

A lyric is a set of words that a melody will carry. It is written on a page and judged in the air, so it has
three kinds of reader or listener, and they want different things.

1. **The singer.** The singer has to fit each line to notes, breathe between phrases, and hold a vowel at the
   end of a phrase. In a survey of 143 musicians, over a third of the references blamed the performer for sung
   words being hard to understand, diction most often, and factors in the words and music made up 14 percent of
   statements [1].
2. **The listener.** The listener hears each line once, at the speed of the music, and cannot go back.
   In one lab study, stress that lined up with the beat went with easier processing of the next word [2].
3. **The person who sets or sings the words.** A lyric is often handed to a composer, or written to a tune that
   already exists. Maintainer judgement: for that reader the page must show section labels, line lengths and the
   pattern the words were written to.

The form is `song`: a Markdown draft whose headings or label lines name the sections (Verse 1, Chorus, Bridge).
The plugin counts syllables, reads stress and rhyme from a pronouncing dictionary, compares sections with each
other and, when a tempo is declared, reports syllables per beat. It cannot hear the melody, so whether a line
sits well on its notes is for a person to sing.

Two ideas run through the guide. **One central idea**: Berklee's Pat Pattison defines prosody as "when all elements
work together to support the central message of the song" and says that in songwriting "there are only tools, no
rules" except this one [3]. **Words that fit the tune**: stressed syllables on strong beats and a
line length the melody can hold. The word "prosody" has two senses in the sources: Pattison's (every element
supporting the idea) and the linguists' (stress and rhythm of words, as in "song prosody") [3]
[2]. This guide says "stress" for the second.

How far to trust the sources. The craft guidance is practitioner opinion: a Musical U explainer, three Berklee
Online articles and two course pages that are topic lists only [4][3]
[5][6][7][8]. The firmest
items are peer reviewed and narrow: a 353,320-lyric trend study [9], an earworm review
[10], a history of the prechorus [11], a musician survey on intelligibility
[1] and one lab study of 16 listeners [2]. Nunes and colleagues and Hirjee
and Brown are abstract only [12][13]. The stress-to-beat rule is described from folk and
historical song [14][15]. Hymn meter definitions rest on an encyclopedia article,
one hymnal database record and one glossary entry [16][17][18]. There is
no corpus of mismatches in pop, no source for a syllables-per-beat figure and no source for a tolerance, so any
tolerance in the plugin is its own convention. Titles, narrative against emotional songs, showing against telling,
singing translation, parody and the sung-text deliverable are not covered by any source read, so advice on them
below is Maintainer judgement and says so.

### Using the plugin

- Start the file with front matter `form: song`. Optional keys: `tempo` (beats per minute), `beatsPerLine`
  (default 4 when a tempo is given), `syllables` and `scheme` (a pattern the words were written to). `--form song`
  on `scan` and `lint` overrides the form.
- `prose scan <file> --text` prints one row per sung line: line number, `syl` (syllables), `want` (the declared
  count and `ok`, `+n` or `-n`), `stress`, `rh` (rhyme letter), end word, text, `flags` and `spb` (syllables per
  beat). Below the table come the inferred scheme, a trust count and a legend. Without `--text` the same data is JSON,
  including `syllablesPerBeat`, `declared`, `pairs` (each rhymed pair with its class) and `directions`. `--words`
  adds the pronunciation of each word.
- `prose pronounce <word...>` shows how one word is read: `source`, `syllables`, `syllablesAlt` when two readings
  differ in count, `stress`, `variants` and the rhyme key. Use it before arguing with a count.
- `prose lint <file>` runs the rules in the table at the end and lists two judgement rules, `lyric.stress-on-beat`
  and `verse.line-break.purpose`, which it never evaluates.
- Trust tags. Each word is `dict` (found in CMUdict, US English), `affix` (a regular ending on a dictionary word,
  and `o'er`, `e'er` and a trailing `in'` as in `dancin'`) or `guessed` (not found, so the syllable count is a spelling
  estimate, stress is unknown and the rhyme key comes from letters). The scan prints the counts and `flags`
  `guessed:<word>` and `ambiguous:<word>` on the line. Measured here: `unlatched` is `guessed` with two syllables and
  stress `??`, and `every` is 3 or 2 syllables, so a line holding it reads `9/8` and passes an 8-syllable pattern.
  CMUdict's maintainers say they "expect a number of errors, omissions and inconsistencies" and it is US English only
  [19]; findings on guessed lines are weaker, and names, slang and coined words are guessed.
- Advisory meter. Stress is shown per word, and only words of two or more syllables carry real stress; every
  one-syllable word is `?` because function words bend to the music. The engine's meter check
  (`verse.meter.deviation`) does not run on songs, so nothing checks a lyric's stress against a foot. Read the stress
  column yourself.
- Syllables per beat. Declare `tempo`, and `beatsPerLine` if the line is not four beats, and `scan` divides each
  line's syllables by `beatsPerLine` and reports the mean and range, with no threshold. Convention: the tempo value
  only switches the figure on; the division does not use it. The figure says how crowded a line is, not whether
  the stress lands.
- `prose set new` writes variants of a passage for the owner to choose between (see the `prose-review` skill). As
  built, a set check measures style features from ordinary prose, not syllables, stress or rhyme, so check every
  variant with `scan` and `lint` yourself.
- The `prose-songwriting` skill writes and checks lyrics; `prose guide song --section rules` prints the table.

## Anatomy and conventions

### Sections and what each one does

Musical U names three common forms and says none of it "is a rule or a formula"; there is "no one single
template" [4].

- **Verse-chorus.** Alternating pairs. Verses usually share a melody with new words each time; choruses usually
  repeat melody and words. The same article says the verse's job is to "set up and build into the chorus, where
  the main idea of the song is expressed directly". A **bridge** (middle eight), usually after the second chorus,
  brings new music and fresh words.
- **Pre-chorus.** A section that builds into the chorus; Musical U notes that "often you could argue a case
  either way" about whether a section is one [4]. Nobile's history of the form says the
  prechorus builds energy toward an arrival at the start of the chorus and that by about 2010 verse-prechorus-chorus
  was close to a default in mainstream popular music. That study is about harmony, texture and form, not lines per
  section [11].
- **Refrain form.** A compressed verse-chorus: one repeated section that ends in one or two identical lines,
  suited to songs where the story matters most [4].
- **AABA.** Two contrasting sections. The A sections are matter-of-fact and carry the direct message; the B is
  more expressive [4]. Pattison reads one standard as an introductory verse then AABA, with three-line
  A sections, a two-line bridge and a closing four-line A [5].

Evidence limits: Musical U's claim that at least 95 percent of chart songs are verse-chorus has no source or count,
and this guide does not use it. Section roles are the authors' descriptions backed by example songs. Berklee's
syllabus lists "Form: Verse/Refrain" and "Number of Lines" as topics without defining them
[7]. Maintainer judgement: choose the form from the story. A song that tells events leans
on verses; a song that holds one feeling leans on its chorus.

Convention: the plugin reads sections from headings (`## Verse 1`) or from a label line on its own: `[Verse 1]`,
`**Verse 1**`, `Chorus (x2)`, `Pre-Chorus:`, or a single capital A to D with an optional note, for AABA drafts. Adjacent
stanzas under one label are one section, so a repeated chorus needs another section between its copies. A section's
base is its label without the number or note: `Verse 2` is `verse`, `A (second night)` is `a`.

### Repetition, the chorus and the hook

What the research shows is narrow.

- Lyrics have become more repetitive. In 353,320 English lyrics from 1970 to 2020, the repeated-line ratio and the
  share of chorus sections rose in rap, country, pop, R&B and rock [9]. The abstract says
  structural complexity "decreased"; the results report increased repetition, and this guide uses the results. It
  describes what exists on a user-edited lyric site, not what makes a song good.
- Repetition and fluency. Per its abstract, one paper found that lexical repetition in a lyric raised processing
  fluency in a lab experiment and in a replication, and that in Billboard Hot 100 data from 1958 to 2012 more
  repetitive songs were more likely to reach number one [12]. Only the abstract was captured: no sample
  sizes, repetition measure or effect sizes. Chart data show association, not that added repetition causes success.
- Earworms. A review of earworm research reports, second-hand, that 90 percent of experimentally induced
  instances in one study were chorus fragments and that 18 diary keepers reported earworms with lyrics 83 percent of
  the time. It also calls "hit song science" results "meager", finds repertoire idiosyncratic across people, and
  notes that more repetition of a tune raised negative appraisal in some studies [10].

What none of it shows: how many repeats a song needs, or that a writer can engineer an earworm. "Hook" is teaching
vocabulary here, not a measured thing. Convention: `lyric.refrain.consistent` expects a repeated `chorus`,
`refrain`, `hook`, `outro` or `tag` section to match its first copy line for line, because Musical U says choruses
usually repeat words and refrains end in identical lines. The source is weak, so a deliberate change is yours to keep.
Maintainer judgement: say the chorus's one idea in a plain sentence and keep that wording each time it returns; vary
the verses, the bridge and the last chorus.

### Prosody, stress and the beat

The rule: stressed syllables sit on strong beats. Proto describes text-setting in present-day English as "basically"
assigning prominent syllables in words to strong beats and calls the stress-to-beat matching rule "established as a
major constraint" from studies of English folk songs. Dell and Halle, as she reports them, find violations rare and
illicit when stress and non-stress swap inside one word, as "drunken" does in a folk song about a sailor, which
"sounds awkward to native ears" [14]. Rodríguez Vázquez argues from two songs that in English speech,
verse and music rhythm are "in almost total agreement" [15].

The experiment. Gordon, Magne and Large had 16 analysed listeners hear six-syllable sentences sung at 150 beats
per minute and then decide whether a word on screen was real. The gap in reaction time between non-words and
real words was 94 ms after sentences whose stress was misaligned with the click and 53 ms after aligned ones (p = 0.009). The authors conclude that alignment
"enhances musical beat tracking and comprehension of lyrics" [2].

Limits, stated plainly. Sixteen people, isochronous sentences on artificial tunes, unreduced vowels, and a word
recognition task, not real songs or enjoyment. Proto's own survey of about 90 songs from the 13th century to
Shakespeare found 65 settings that break the rule, which she attributes to older English stress patterns, so the rule
is a description of a tradition and not a law [14]. There is no pop corpus of mismatches, no tolerance and no
count of how many a song survives. Berklee's course lists "Matching Musical Stress and Syllable Stress" and "Recognizing
Word Stresses: Gray Areas" as topics and nothing more [7]. `lyric.stress-on-beat` is therefore a
judgement rule and the plugin never scores it.

How to check by hand. Fix the grid first: where the strong beats fall in the line, which comes from the tune or from
your own choice. Then read the scan's stress column against it. Maintainer judgement: for a line of 8 syllables on
four beats, with a pickup, the strong beats usually fall on syllables 2, 4, 6 and 8; say which grid you assumed. Stress
is only informative for polysyllables; for a line of one-syllable words, decide by meaning which words the singer
would lean on. If the stress is wrong in a polysyllable, change the word or the line, not the tune.

### Writing to a stated syllable pattern

Words for an existing tune, or to a pattern the owner gave, are the common case. No source read covers writing to a
stated pattern, so the method is Maintainer judgement: settle the pattern first, write it in the front matter, write
to it, then scan.

- `syllables` is the per-stanza count repeated for every stanza (`[8, 6, 8, 6]`, `8.6.8.6`, `8 6 8 6` or
  `8,6,8,6`), or a map by section base (`verse`, `chorus`, `bridge`); a section with no entry is not checked.
  `scheme` is one letter per line (`xaxa`; `x` is an unconstrained line).
- A key that matches no section, a map on a draft with no labels, or a stanza with the wrong number of lines is a
  warning, so a typo cannot switch the check off silently.
- `verse.form.syllables` warns (it is the author's requirement, not a convention) when a line misses the pattern,
  and accepts a line whose syllable range includes the target. `verse.form.rhyme-scheme` warns when lines that should
  rhyme do not; a slant pair, an eye pair or a pair resting on a guessed word is only info.
- When no melody exists, choose a pattern, write it down and say that you assumed it, so the owner can correct it.
  A line's syllable count is not its timing: rests, held notes and pickups change how much room a line has.

### Hymn meters and matching a text to a tune

A hymn meter is a syllable pattern per stanza line, and most hymnals carry a metrical index of their tunes, so a text
can be sung to any tune of the same meter. Definitions from the encyclopedia article [16]:

| Name | Pattern | Notes |
|---|---|---|
| Common Metre (C.M.) | 8.6.8.6 | iambic tetrameter and trimeter lines, rhyming on lines 2 and 4 and sometimes 1 and 3 |
| Long Metre (L.M.) | 8.8.8.8 | iambic tetrameter |
| Short Metre (S.M.) | 6.6.8.6 | |
| Doubled | 8.6.8.6.8.6.8.6 (D.C.M. or C.M.D.), 8.8.8.8.8.8.8.8 (D.L.M.) | the pattern doubled |
| By number | for example 10.10.10.10 | other meters are written as their counts |

The article's matching rule: "A hymn may be sung to any tune in the same metre, as long as the poetic foot (such as
iambic, trochaic) also conforms." A count does not give the stress: most 8.7.8.7 hymns are trochaic, and the article says
significant metrical substitution is rare in a well-written hymn. Some hymns are "irregular", with different meters
verse to verse, and older labels (P.M., L.P.M., H.M.) vary by region and period [16]. A hymnal
database lists the tune AZMON as 8.6.8.6 with a link to more tunes of that meter, and records the same tune as 8686,
CM and CMD, so notation is not uniform [17]. A poetry glossary says the hymnal stanza, also called common
measure, is traditionally the same as the ballad stanza but with the stricter rhythms and rhymes of the hymnal
[18]; a ballad stanza is four lines, iambic tetrameter then trimeter, usually rhymed ABCB
[20], and the poetic ballad has as few as three or four stresses a line [21].
These definitions rest on one encyclopedia article, one database record and two glossary entries; no hymnal's own
explanation was read.

What the engine does. Declare the pattern in the front matter (`syllables: 8.6.8.6`, `scheme: xaxa`). Lint then checks
the syllables of every line and, with that scheme, that lines 2 and 4 of each stanza rhyme. Measured here: `CM`, `8686` and `8.7.8.7.D` are
rejected with `E_SCHEMA`, so write the counts out (`8.7.8.7.8.7.8.7`). The engine has an iambic "common" foot for
its meter check (four feet, then three), but no form turns it on, so a hymn text's stress is checked by you. Whether a
stress deviation is acceptable is a convention with no source, and the plugin sets no tolerance.

Matching a text to any tune of its meter, step by step (Maintainer judgement): declare the meter, scan, fix every count,
then read the stress column for iambic lines (weak, strong, weak, strong...) and fix each polysyllable that lands wrong.
Last, sing it to the tune.

### Rhyme in lyrics

Pattison names three types: perfect (identical vowel and following consonants, different onsets: fire/desire),
family (same vowel, related consonants after it: mud/truck, love/blush) and assonance (vowels only: read/cheap). He
advises perfect or family rhyme to "support stable or resolved meaning" and assonance for "unstable or unresolved
meaning" [3]. That is one teacher's framework, and the course page lists "Family Rhyme" without
defining it [7]. His "unstable" and "stable" are listed as skills in a course description
that gives no rule [8].

The plugin's classes (conventions that follow Prosodic's definitions [22], read from CMUdict [19]):

| Class | Meaning | Measured here |
|---|---|---|
| `perfect` | same sounds from the last stressed vowel, different onset | fire/desire, light/tonight |
| `identity` | the same word, or the same sounds and onset | bare/bear |
| `assonance` | same stressed vowel, different tail | home/alone, mud/truck, love/blush |
| `consonance` | same tail, different vowel | stone/plane |
| `eye` | spelled alike, sounds differ | love/move, where/here |
| `none` | | done/dim |

There is no `family` class: Pattison's family examples (mud/truck, love/blush) come out as `assonance`, so the plugin
cannot tell a family rhyme from a plain vowel rhyme. `scan` letters count `perfect` and `identity` only, and a `near`
scheme also counts assonance and consonance. A pair that depends on a second pronunciation is marked uncertain
(wind/sinned is `perfect` only through a variant), and dialect rhymes (gone/on) can be wrong because the dictionary is
US English. `verse.form.rhyme-scheme` warns only for a certain non-rhyme and gives slant, eye and guessed pairs as info.
Hirjee and Brown, in an abstract on rap, say imperfect and internal rhymes matter and can be modelled
statistically; they say nothing about pop or hymns [13]. The plugin does not check internal rhyme.

### Singability

The one source is a survey. It lists 43 factors, with diction and the performer named most often, and reports that
sopranos are harder to understand than lower voices, that syllables are easier to understand than isolated vowels,
and that singers modify vowels and consonants to be understood. Pop singers, who are amplified, can stay closer to
spoken vowels [1]. It measures musicians' perceptions, not listener comprehension, and it gives no
rule about open vowels on long notes, consonant clusters or breath.

Maintainer judgement, drawn from that survey's emphasis on diction and vowels: end a held note on a vowel, not on a
cluster of consonants, keep clusters off fast notes, leave room to breathe, and put a high held note on an open vowel.
No threshold exists, and the plugin shows nothing about vowels, clusters, breath or range. The test is to sing it.

### Perspective, address and imagery

Berklee's articles are teaching, not tests, and a lyric guide can take questions from them, not rules.

- **Who is speaking to whom.** Direct address places the lyric "between an 'I' and a 'you'". Chase lists intimacy,
  immediate stakes and a conversational voice as gains, and lists the limits: the narrator knows only their own
  view, the relationship can stay vague, general statements slide into clichés without specific detail, and the I and
  the you need balance. She names four kinds of you: singular specific, plural specific, self-reflective and
  universal [6].
- **Keep the pronoun steady.** Pattison criticises a love song for switching between "she" and "you", because
  third-person pronouns "create a more factual, more objective world" [5]. It is his opinion.
- **Sense-bound language.** The same article praises a lyric whose images let listeners "supply each of the images
  from their own sense memories", and reads odd line counts as pushing forward motion and an even, rhymed closing
  section as resolved [5]. Maintainer judgement: one specific detail the listener could not guess
  carries more than three familiar ones.
- **The central idea.** State it in a sentence before writing, decide whether it is settled or unsettled by saying it
  aloud, and let rhyme, line length and the section order follow [3].

### Labels and what a lyric sheet carries

Maintainer judgement on what the page should carry for the next person: section labels, one pattern per section, the
tempo and time signature if known, who sings what, and any line that is a direction and not a lyric. Put the frame in the
front matter and keep the lyric lines free of notes.

- Do not put emphasis markers on lyric lines, and no tempo or key line inside the lyrics.
- A direction is a line that is wholly one parenthesised phrase (`(hum softly)`), a line of up to twelve words with a
  bpm figure (`Folk, about 90 bpm, 4/4`) or a line of up to six words with a stand-alone time signature (`Waltz time,
  3/4`). Convention: the tool skips such lines and `verse.format.direction` lists each one, so a sung line that looks
  like a direction is never lost silently. If a skipped line is sung, rewrite it without the parentheses or tempo.
- Do not start a lyric line with `- `, `1. ` or `> `: Markdown reads it as a list item, step or quote
  (`verse.format.markup`).
- Repeat a chorus by writing it out again under its label; the plugin has no "repeat" shorthand.

### Quoting other lyrics

This is a pointer, not legal advice, and it covers the United States only. The Copyright Office FAQ says there are "no
legal rules permitting the use of a specific number of words, a certain number of musical notes, or percentage of a
work", that fair use depends on all the circumstances, and that "in cases of doubt, the Copyright Office recommends that
permission be obtained" [23]. The Fair Use Index lists four factors: purpose and character,
nature of the work, amount and substantiality, and effect on the market [24]. So do not rely on
"a few lines" being safe. Write original words. This guide quotes no lyrics at all and every example is original.
Nothing read covers parody, singing translation, or how a new lyric set to an existing tune is treated; ask the owner.

## Length and timing

`song` is not a spoken form, so the plugin plans no runtime and has no `wpm`. A draft may declare `target: 120 words`,
and `length.target` compares it with the lyric's word count and warns beyond 10 percent (the plugin's choice). Measured
here: the example below has 114 words, and a declared target of 20 words warns "cut about 94 words". Otherwise length is
measured in lines, syllables and sections.

- Report, per section: line count, syllables per line, the scheme and any declared pattern met or missed. If a tempo was
  given, report the syllables per beat.
- Convention: like sections keep within 2 syllables per line of each other, because Musical U says verses usually share a
  melody with new words, so their lines must fit one tune. `lyric.sections.line-match` reports it as info; the 2 is this
  plugin's, and the Berklee and Coursera pages list line length and symmetry without a threshold
  [4][7][8].
- Seconds are arithmetic, not a finding: `beatsPerLine` times 60 over the tempo gives a line's time before rests, so
  a 4-beat line at 96 beats per minute takes 2.5 seconds and eight such lines take 20. It is a lower bound.
- No source read gives a song's length, the lines in a verse or the number of verses. A chorus-to-all-sections trend
  exists in the corpus study, as a description only [9]. Maintainer judgement: let the owner's
  stated length or tune decide, and report the numbers so they can check.

## What good looks like

Every example is written for this guide and every person, place and number in it is invented. Each Markdown example
passes `prose lint --form song` with no errors and no warnings. The bad examples are plain text, with the counts lint
gives them.

### A verse and chorus with consistent counts

```markdown
---
form: song
tempo: 96
syllables: { verse: [8, 8, 8, 8], chorus: [8, 8, 8, 6] }
scheme: { verse: xaxa, chorus: aabb }
---
## Verse 1
The porch light burns till half past three
I leave the door ajar for you
The kettle ticks beside the sink
The window glass turns slowly blue

## Chorus
Come home, come home, I've kept the light
There's soup and bread and room tonight
Don't tell me why, don't tell me where
Just come on up the stair

## Verse 2
The clock above the stove runs slow
I wind it each night just for you
The cat has claimed your side of bed
The kitchen smells of something new

## Chorus
Come home, come home, I've kept the light
There's soup and bread and room tonight
Don't tell me why, don't tell me where
Just come on up the stair
```

Measured here: `prose scan` reads 8 syllables on every verse line and 8, 8, 8, 6 on the chorus, 2.00 syllables per beat
on the 8-syllable lines and 1.50 on the 6, and all 114 words are `dict`. The scheme is declared for lines 2 and 4 of each
verse, and `you` and `blue`, `you` and `new` rhyme. The chorus returns word for word, so `lyric.refrain.consistent` is
silent, and the two verses match line for line in syllables. The pattern was declared, and then followed.

### A line whose stress falls off the beat

<!-- bad example, on purpose: the guide's tests lint it as song with an 8-syllable pattern and expect 0 warnings -->

```text
Silver lantern in the cold rain
```

Measured here: `prose scan` gives 8 syllables (`want 8 ok`) and the stress `1010????`, and `prose lint` reports nothing.
On a grid where the strong beats are syllables 2, 4, 6 and 8 (an assumption; the tool does not know the tune),
the stressed "Sil" and "lan" land on syllables 1 and 3, which are weak. The count is right and the stress is wrong, and only a
person reading the stress column sees it. Rewritten:

```markdown
---
form: song
syllables: [8]
---
The silver lantern in the rain
```

Measured here: also 8 syllables, stress `?1010???`, so "Sil" and "lan" fall on syllables 2 and 4. Lint reports nothing on
either line, which is the point: a count check passes both.

### A hymn text in Common Meter

```markdown
---
form: song
syllables: 8.6.8.6
scheme: xaxa
---
The lamp is lit, the day is done,
The hills are growing dim;
We gather in the fading light
To sing the closing hymn.

The river slows, the swallows rest,
The fields lie still and wide;
Be near when all the night comes down
And keep them side by side.
```

Measured here: `prose scan` reads 8, 6, 8, 6 in both stanzas, with `dim`/`hymn` and `wide`/`side` as the rhymed pairs, and
lint reports no warnings. Read the stress column too: the stressed syllable of each polysyllable (`gather`, `fading`,
`growing`, `closing`, `river`, `swallows`) lands on an even syllable of its line, the strong slot of an iambic line.
A text that breaks the pattern:

<!-- bad example, on purpose: the guide's tests lint it as song with the declared pattern and expect 1 warning -->

```text
The lamp is lit, the day is done,
The hills are growing dim;
We gather in the fading evening light
To sing the closing hymn.
```

Measured here: with `syllables: 8.6.8.6` and `scheme: xaxa` declared, `prose lint` reports 1 warning, line 3 has 10
syllables where the pattern asks for 8. It would not sing to a tune of that meter without crowding the line.

### A chorus repeated with variation

<!-- bad example, on purpose: the guide's tests lint it as song and expect 1 warning -->

```text
## Chorus
Come home, come home, I've kept the light
There's soup and bread and room tonight
Don't tell me why, don't tell me where
Just come on up the stair

## Verse 2
The clock above the stove runs slow
I wind it each night just for you

## Chorus
Come home, come home, I've kept the light
There's soup and bread and room tonight
Don't tell me why, don't tell me where
Come in out of the air
```

Measured here: `prose lint` reports 1 warning, `lyric.refrain.consistent`: the second Chorus reads "Come in out of the
air" where the first has "Just come on up the stair". If the change is on purpose, name it. Label the changed copy
`## Final Chorus`: its base is `final chorus`, which is not a refrain label, so the tool stops comparing it. Convention:
that is a different label, not a pass, and the change is yours to defend. Musical U describes choruses as repeating words and verses as taking new
words each time, so put the variation in a verse, the bridge or a tag [4].

### A bridge

```markdown
---
form: song
tempo: 96
---
## Bridge
Some nights I think you won't come back
And I should lock the door
Then something moves along the track
And now I'm sure once more

## Final Chorus
Come home, come home, I've kept the light
There's soup and bread and room tonight
Don't tell me why, don't tell me where
Come in out of the air
```

The bridge turns from waiting to doubt and back, in a pattern (`abab`) the verses do not use, and returns to the chorus.
Measured here: `prose scan` reads 8, 6, 8, 6 on the bridge, 1.81 syllables per beat over both sections, and lint reports
nothing, because a bridge that appears once is compared with nothing. Convention: a bridge is new on purpose, so the
first example's `syllables` map has no `bridge` entry.

### Four labelled sections in AABA

```markdown
---
form: song
---
A
The lamp is low, the house is still
The snow lies soft against the sill

A (second night)
The clock runs slow, the cat is curled
The quiet settles on the world

B (bridge, rise a little)
Wherever you have been today
It could not be too far away

A
The lamp is low, the door is wide
And you are home, and warm inside
```

The letters label sections for AABA drafts. `A (second night)` has the same base as `A`, so the two A sections are compared
line by line in length, and they match.

## Common failures and the habits behind them

Fixing the habit behind a failure prevents the next one. The habits are Maintainer judgement unless cited.

### A count that is right and a stress that is wrong

Counting syllables, then trusting the count: the habit is checking what the tool shows and stopping there. A line can match
the pattern and still put a stressed syllable on a weak beat (the lantern example above) [2]. Fix: read
the stress column against the grid you chose, and sing the line.

### A pattern declared and not followed

Writing a pattern in the front matter and then writing freely. Fix: before the first scan, compare the draft with the pattern
line by line; a pattern you wrote and did not follow costs a whole fix round.

### Verses that cannot share a tune

Verse 2 with lines of 7 to 16 syllables against verse 1: the habit is writing each verse as a new poem. Fix: copy the
verse 1 line lengths and rhyme plan, and rewrite the words inside them (`lyric.sections.line-match`).

### A chorus that drifts

A word or two changed each time the chorus returns: the habit is polishing the copy in front of you. Fix: keep the first
chorus as the master and paste it back (`lyric.refrain.consistent`) [4].

### Stock images and the unspecific you

"Heart on fire", "the road won't wait": the habit is reaching for the familiar word because it rhymes. Chase lists
over-reliance on general statements as a limit of direct address [6]. Fix: name the detail.

### A word the tool cannot read

A name, a slang word or an invented one is `guessed`, so its syllables and rhyme are estimates and findings on its line are weaker. Fix:
run `prose pronounce <word>`, decide the reading you mean and count by ear and by hand [19].

### A perspective that slips

Switching between "she" and "you" for the same person [5]. Fix: pick the address and keep it through the
song, or make the change on purpose.

### Quoted lines

Reusing a recognisable line from another song because it fits. Fix: write original words; the Copyright Office states no
number of lines that is safe [23].

## How to revise

Revise in this order: early steps change what the song says, later ones how it sings.

1. **State the central idea and the frame.** One sentence; the tempo, time signature and the pattern per section, or a
   pattern you chose and said you assumed [3].
2. **List the sections in order** (verse-chorus, AABA, verse-chorus-bridge) before writing, with a rhyme plan per section.
3. **Write to the pattern.** Keep like sections matched line for line.
4. **Run `prose scan <file> --text`, then `prose lint <file>`.** Read each warning and each `guessed` or `ambiguous` flag.
   Fix it or say why it stays.
5. **Read the stress column against the grid.** Decide the grid first; fix each polysyllable on a weak beat.
6. **Work through the judgement list.** `lyric.stress-on-beat` and `verse.line-break.purpose`: answer each in a line of
   your report.
7. **Sing it.** The tool cannot hear a melody. Breath, vowels and clusters are for a singer.
8. **Offer options when taste decides.** Two choruses or two bridges go through the `prose-review` skill.
9. **Report.** Per section: lines, syllables per line, scheme, declared pattern met or missed, syllables per beat when a
   tempo was given. Say what was not checked: the melody, stress against the beat, and whether the lyric is good.

## Rules that apply

The table is generated from `craft/rules.json` for `song`. The `ai.*` rules are style findings about phrasing, not
detectors; the `voice.*` rules fire only in a project with voice bibles. A threshold marked "This plugin's choice" is not
a source's figure. `lyric.stress-on-beat` and `verse.line-break.purpose` are judgement rules: lint lists them and never
evaluates them. The sentence-based reports (`readability.grade.report`, `style.passive.report`) stay silent for lyrics, whose line
breaks are not sentence boundaries, and `style.echo` does not run on songs, because repetition is a device here.

<!-- generated:rules begin (npm run guides) -->
| Rule | What it checks | Severity | Threshold | Threshold basis | Run by |
|---|---|---|---|---|---|
| `readability.grade.report` | Reading grade is reported, never targeted. | info | none | n/a | lint |
| `style.passive.report` | Passive voice is counted and reported, not banned. | info | none | n/a | lint |
| `ai.copula-avoidance` | 'serves as', 'stands as', 'functions as' in place of is/are are flagged. | info | none | n/a | lint |
| `ai.artifact` | No leaked chatbot markup or unfilled placeholders. | error | none | n/a | lint |
| `draft.placeholders` | Bracketed placeholders are listed until filled. | info | none | n/a | lint |
| `ai.vocabulary` | Three or more distinct era-tagged AI vocabulary terms in one draft are flagged. | warn | 3 distinct terms | This plugin's choice (derived) | lint |
| `length.target` | A draft with a declared target lands within ±10% of it. | warn | 0.1 fraction | This plugin's choice (derived) | lint |
| `voice.targets` | Each voiced speaker's measured style stays inside the voice bible's target ranges. | warn | none | n/a | lint |
| `voice.bible-valid` | Every voice bible in the project loads: valid YAML and schema, id matching the file name, unique ids, and each speaker claimed by one bible. | error | none | n/a | lint |
| `voice.banned` | A speaker never uses a word their voice bible bans. | warn | none | n/a | lint |
| `voice.unvoiced` | In a project with voice bibles, every speaker resolves to one. | info | none | n/a | lint |
| `verse.form.rhyme-scheme` | End rhymes follow the scheme, the form's or the one the draft declares in its frontmatter (a letter per line, x for an unconstrained line): each rhyme group matches its first line. | warn | none | n/a | lint |
| `verse.form.syllables` | Each line fits the syllable pattern: the haiku's 5, 7, 5 (soft, info), or one the draft declares in its frontmatter for a tune or hymn meter such as 8.6.8.6 (the author's own requirement, warn). | warn | none | n/a | lint |
| `verse.pronunciation.guessed` | Words missing from the pronouncing dictionary are listed; verdicts on their lines are weaker. | info | none | n/a | lint |
| `verse.pronunciation.ambiguous` | Words with several pronunciations are listed only where the reading matters: an end word whose rhyme depends on it, or a word that decides whether a line fits a declared syllable or meter count. | info | none | n/a | lint |
| `verse.format.markup` | A verse line that starts like Markdown (a dash, a number and period, or >) is read as a list item, step or quote, not a line. | warn | none | n/a | lint |
| `verse.format.direction` | In a song, a line that is wholly one parenthesised phrase, or a short line giving a tempo (90 bpm) or a time signature (4/4), is read as a direction, not a lyric, and is left out of the measurement. | info | none | n/a | lint |
| `lyric.refrain.consistent` | A refrain section repeated under the same label matches its first occurrence. | warn | none | n/a | lint |
| `lyric.sections.line-match` | Like sections (Verse 1, Verse 2) stay within 2 syllables per line of each other. | info | 2 syllables | This plugin's choice (derived) | lint |
| `verse.line-break.purpose` | Each line ends where it does for a reason: sound, sense, speed or surprise. | info | none | n/a | judgement |
| `lyric.stress-on-beat` | Stressed syllables meet strong beats when the lyric is set to music. | info | none | n/a | judgement |
<!-- generated:rules end -->

## Sources

Numbers in brackets in the text refer to this list. Most sources report their authors' practice and were not
tested on singers or listeners.

<!-- generated:sources begin (npm run guides) -->
1. Philip A. Fine and Jane Ginsborg, 2014. [Making myself understood: perceived factors affecting the intelligibility of sung text](https://www.frontiersin.org/articles/10.3389/fpsyg.2014.00809/full) (peer-reviewed; id `fine-ginsborg-2014`). Survey of 143 musicians: 43 factors in four groups. Perceptions, not listener tests; gives no rule on open vowels, consonant clusters or breath.
2. Gordon, Magne and Large, 2011. [EEG correlates of song prosody: a new look at the relationship between linguistic and musical rhythm](https://www.frontiersin.org/articles/10.3389/fpsyg.2011.00352/full) (peer-reviewed; id `gordon-magne-large-2011`). 16 analysed participants heard sung six-syllable sentences; stress aligned with the beat eased word recognition. Lab sentences on tonal sequences, not real songs or lyrics.
3. Pat Pattison (Berklee Online), 2022. [Prosody in Music and Songwriting](https://online.berklee.edu/takenote/prosody-in-music-and-songwriting/) (practitioner; id `pattison-prosody`). Teacher's article, one opinion with illustrative examples: prosody means every element supporting the central message; stable against unstable meaning; perfect, family and assonance rhyme. Not evidence.
4. Musical U (guest expert), 2019. [Anatomy of a Song: The Three Most Common Song Forms](https://www.musical-u.com/learn/anatomy-of-a-song-the-three-most-common-song-forms/) (practitioner; id `musical-u-song-forms`). Weak evidence: a practitioner teaching article. Describes verse-chorus, refrain and AABA forms; its 95% figure is unsourced and not used; the author says none of it "is a rule or a formula".
5. Pat Pattison (Berklee Online), 2024. [The Best (and Worst) Romantic Song Lyrics](https://online.berklee.edu/takenote/best-and-worst-romantic-song-lyrics/) (practitioner; id `pattison-romantic`). Teacher's reading of two songs: sense-bound language, line counts as feeling, an AABA form, and a pronoun switch he dislikes. Preferences are opinion.
6. Erin Chase (Berklee Online). [Direct Address in Songwriting: Writing Lyrics That Feel Like Conversations](https://online.berklee.edu/takenote/direct-address-in-songwriting-writing-lyrics-that-feel-like-conversations/) (practitioner; id `chase-direct-address`). Course excerpt: lyrics between an I and a you, with gains, limits and four kinds of you. Craft vocabulary with song examples; no test of effect.
7. Berklee Online (Keys and Pattison). [Songwriting Tools and Techniques (course page)](https://online.berklee.edu/courses/songwriting-tools-and-techniques) (practitioner; id `berklee-songwriting-tools`). Weak evidence: a course description and syllabus. It lists topics (matching musical stress and syllable stress, line length, common meter, rhyme types) without defining them or giving thresholds.
8. Coursera, Berklee College of Music (Pattison). [Songwriting: Writing the Lyrics (course page)](https://www.coursera.org/learn/songwriting-lyrics) (practitioner; id `coursera-songwriting-lyrics`). Weak evidence: a marketing and course-description page. It says learners judge whether a lyric is stable or unstable through line lengths, number of lines, stress and melody, with no definition or threshold.
9. Emilia Parada-Cabaleiro, Maximilian Mayerl, Stefan Brandl, Marcin Skowron, Markus Schedl, Elisabeth Lex and Eva Zangerle, 2024. [Song lyrics have become simpler and more repetitive over the last five decades](https://pmc.ncbi.nlm.nih.gov/articles/PMC10978890/) (peer-reviewed; id `parada-cabaleiro-2024`). 353,320 English lyrics from a user-edited site, 1970 to 2020: repeated-line ratio and chorus share rose in five genres. A trend in what exists, not a measure of quality; the abstract's wording says complexity decreased while the results show repetition increased.
10. Lassi A. Liikkanen and Kelly Jakubowski, 2020. [Involuntary musical imagery as a component of ordinary music cognition: a review of empirical evidence](https://pmc.ncbi.nlm.nih.gov/articles/PMC7704448/) (review; id `liikkanen-jakubowski-2020`). Review of earworm studies. The chorus and lyrics figures (90% and 83%) are second-hand through the review; it calls hit song science results meager. About listening, not about writing.
11. Drew Nobile, 2022. [Teleology in Verse-Prechorus-Chorus Form](https://mtosmt.org/issues/mto.22.28.3/mto.22.28.3.nobile.html) (peer-reviewed; id `nobile-2022`). Music-theory history of the prechorus in songs from 1965 to 2020: it builds toward an arrival at the chorus. About harmony, texture and form, not lyric lines per section.
12. Joseph C. Nunes, Andrea Ordanini and Francesca Valsesia, 2015. [The power of repetition: repetitive lyrics in a song increase processing fluency and drive market success](https://myscp.onlinelibrary.wiley.com/doi/10.1016/j.jcps.2014.12.004) (peer-reviewed; id `nunes-2015`). Abstract only: lab and chart studies of lexical repetition and fluency, with Billboard Hot 100 data 1958 to 2012. No sample sizes or effect sizes captured; chart data are observational.
13. Hussein Hirjee and Daniel Brown, 2010. [Using automated rhyme detection to characterize rhyming style in rap music](https://kb.osu.edu/handle/1811/48548) (peer-reviewed; id `hirjee-brown-2010`). Abstract only and about rap: imperfect and internal rhymes modelled statistically. No figures and nothing on pop or hymn lyrics.
14. Proto, 2013. [Prominence matching in English songs: a historical perspective](https://revistas.uned.es/index.php/signa/article/download/6345/6078) (peer-reviewed; id `proto-2013`). Linguistics article on stress-to-beat matching in English text-setting, with a survey of about 90 songs from the 13th century to Shakespeare. Reports Dell and Halle, Halle and Lerdahl and Hayes and Kaun second-hand; descriptive, not a listener experiment, and no syllables-per-beat figure.
15. Rodríguez Vázquez. [The metrics of folk song: text-setting in Spanish and English](https://revistas.uned.es/index.php/rhythmica/article/download/13136/12114) (peer-reviewed; id `rodriguez-vazquez-folk-song`). Argument from two folk songs, one Spanish and one English, that English speech, verse and musical rhythm agree. Two songs and the stress-timed against syllable-timed typology; no corpus or experiment.
16. Wikipedia contributors. [Metre (hymn)](https://en.wikipedia.org/wiki/Metre_(hymn)) (practitioner; id `wikipedia-metre-hymn`). Weak evidence: an encyclopedia article, the only full set of hymn meter definitions read (Common, Long, Short, doubled, numbered). No allowed kind fits an encyclopedia, so the nearest is practitioner.
17. Hymnary.org. [Tune: AZMON](https://hymnary.org/tune/azmon_glaser) (platform-doc; id `hymnary-azmon`). One hymnal-database record: meter 8.6.8.6 with a link to more tunes of that meter, and the same tune recorded as 8686, CM and CMD. Not a definition of meter.
18. Academy of American Poets (Hirsch, A Poet's Glossary). [Hymn (Glossary of Poetic Terms)](https://poets.org/glossary/hymn) (review; id `poets-org-hymn`). Glossary entry: the hymnal stanza, or common measure, is traditionally the same as the ballad stanza with stricter rhythms and rhymes. No syllable counts and no rule on matching texts to tunes.
19. Carnegie Mellon University Speech Group (cmusphinx/cmudict). [CMU US English pronouncing dictionary](https://github.com/cmusphinx/cmudict) (platform-doc; id `cmudict`). US English only. The maintainers do not guarantee accuracy and "expect a number of errors, omissions and inconsistencies to remain"; the flat file carries no part of speech and handles reduced variants inconsistently.
20. Wikipedia contributors. [Ballad stanza](https://en.wikipedia.org/wiki/Ballad_stanza) (practitioner; id `wikipedia-ballad-stanza`). Weak evidence: an encyclopedia summary (nearest allowed kind). Iambic tetrameter on lines 1 and 3, trimeter on lines 2 and 4, rhymed ABCB. The Academy gives only three or four stresses a line, so 4-3-4-3 is the common shape, not a rule.
21. Academy of American Poets, 2019. [Ballad (Glossary of Poetic Terms)](https://poets.org/glossary/ballad) (review; id `poets-org-ballad`). Reference glossary entry, not a study: quatrain stanzas, lines with as few as three or four stresses, rhymed on the second and fourth lines or on all alternating lines.
22. Heuser, Falk and Anttila (quadrismegistus/prosodic). [Prosodic: a metrical-phonological parser for English and Finnish](https://github.com/quadrismegistus/prosodic) (platform-doc; id `prosodic`). The project's own documentation and self-reported figures: rhyme classed as perfect, slant (consonance), assonance or none from the sounds after the last stressed vowel; bands fitted to Walker's 1775 rhyming dictionary.
23. US Copyright Office. [Fair Use (FAQ)](https://www.copyright.gov/help/faq/faq-fairuse.html) (standard; id `copyright-office-fair-use-faq`). Official general information, United States only and not legal advice: no legal rule permits a set number of words or notes, fair use depends on all the circumstances, and permission is recommended in cases of doubt.
24. US Copyright Office. [Fair Use Index](https://www.copyright.gov/fair-use/) (standard; id `copyright-office-fair-use`). The four factors; fair use is decided case by case, and the Office gives no individual advice.
<!-- generated:sources end -->
