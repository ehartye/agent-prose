---
name: prose-songwriting
description: Write and check song lyrics with agent-prose - verse-chorus, AABA, folk, pop, lullabies, hymn texts and words written to an existing melody - drafted as Markdown with labelled sections, then measured for line lengths, rhyme, refrains and syllables per beat.
when_to_use: Use when asked for song lyrics, a chorus, verse or bridge, a lullaby, a hymn text, words for a tune or melody, a song at a stated tempo or syllable pattern, or when prose lint reports lyric.* findings. A poem meant to be read is prose-poetry; spoken scripts and narration are prose-script.
---
# prose-songwriting

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.

## Craft guide

Craft guide: `prose guide song --text --section <name>` prints one section of the reference guide for song lyrics.
Read the section you need, not all of it: `anatomy` before writing (sections, repetition, stress and the beat, hymn
meters, rhyme, singability, quoting), `good` for worked examples, `failures` and `revise` when a draft is being fixed,
`rules` for what lint checks. Run `prose guide` to list every guide.

## Set up the file

Write `<name>.md`. Put tempo and the singing frame in the frontmatter, never in the lyrics:

```md
---
form: song
tempo: 90                     # optional, beats per minute
beatsPerLine: 8               # optional, default 4 when tempo is given
syllables: { verse: [8, 6, 8, 6], chorus: [7, 7, 8] }   # optional per-section pattern; or one list for every stanza
scheme: { verse: abcb, chorus: aabb }                   # optional; x means a line is unconstrained
---
## Verse 1
...
## Chorus
...
```

A hymn text or any one-pattern tune is the same file with one pattern for every stanza and no chorus
(`syllables: 8.6.8.6` and `scheme: xaxa` mean only lines 2 and 4 rhyme). `beatsPerLine` is how many beats a line
is sung over (8 for two bars of 4/4); `prose scan` then prints syllables per beat.

Label sections with `## Verse 1`, `## Chorus`, `## Bridge` (or `[Verse 1]` lines); labels written in bold or
plain are also recognised, and a parenthesised stage direction is ignored. Repeat a chorus by writing it out again.
Never put emphasis markers on lyric lines, and no tempo or key line inside the lyrics.

## Frame first

Settle what the voice can sing before any words: tempo, time signature, how many syllables a line holds, and
the tune's pattern if there is one (a hymn meter, "7-7-7-5"). When the melody is unknown, choose a pattern
yourself, write it into `syllables`, and say you assumed it so the owner can correct it. Do not
interrogate; one assumption stated is better than five questions.

## Plan, then write

- **Structure:** list the sections in order (verse-chorus, AABA, verse-chorus-bridge) before writing.
- **Rhyme plan per section:** pick a scheme for the verse (ABCB is common) and a tighter one for the
  chorus, and keep every verse on the same plan. An unrhymed verse line is a choice, not an accident.
- **The chorus is the hook:** state its one idea in plain words, and keep it verbatim each time it returns.
- **Like sections match:** verse 2 follows verse 1 line for line in length (within about two syllables).
  Lines from 7 to 16 syllables in one verse cannot sit on one melody.
- **Follow your own pattern:** before the first scan, compare the draft line by line with the `syllables` and
  `scheme` you declared; a pattern you wrote and did not follow costs a whole fix round.
- **Singable:** stressed syllables belong on strong beats, vowels you can hold at phrase ends, room to
  breathe. The tool cannot hear a melody, so this stays your judgement; say so and suggest singing it through once.
- **Concrete over stock:** name and replace worn images ("coffee's going cold", "the road won't wait"). One
  specific detail the listener could not guess carries more than three familiar ones.

## Check, then report numbers

1. Run `prose scan <file> --text`: per-line syllables and rhyme letters, the scheme, syllables per beat when a
   tempo is declared, and trust counts. `?` in the stress column is a one-syllable or guessed word, and a count
   such as 9/10 means two pronunciations (either reading counts).
2. Run `prose lint <file>`. It checks that a repeated chorus is identical, that like sections have matched line
   lengths, the declared `syllables` and `scheme` for every stanza, and rhyme pairs in US English. Fix each
   warning or say why it stays. Guessed words (names, slang, coined words) are estimated from spelling.
3. Work through the `judgement` list (stress on the beat, line-break purpose) and answer each item in a line of
   your report.
4. Report per section: line count, syllables per line, the scheme and any declared pattern met or missed.
   If tempo was given, report syllables per beat. Say what was not checked: the melody, stress against the
   beat, and whether the lyric is good.

Never state a syllable or rhyme claim without the scan; if the CLI cannot run here, count by hand and say so.

## Keep

Taste decides songs. When the owner may want a choice (two choruses, two bridges), offer measurably different
versions through the prose-review skill instead of picking for them.
