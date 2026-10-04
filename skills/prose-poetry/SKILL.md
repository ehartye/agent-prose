---
name: prose-poetry
description: Write and check poems with agent-prose - free verse, sonnets, haiku, limericks, ballads, villanelles and sestinas, or words for a given meter - drafted as Markdown and measured for syllables, rhyme and form against cited definitions, with every pronunciation tagged by how far to trust it.
when_to_use: Use when asked for a poem, sonnet, haiku, limerick, villanelle, sestina, ballad, verse or free verse, for a poem in a set meter or syllable pattern (5-7-5, iambic pentameter), or when prose lint reports verse.* findings. Words meant to be sung (lyrics, hymn texts, words to a tune) are prose-songwriting; a joke in verse can also use prose-comedy.
---
# prose-poetry

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.

## Craft guide

Craft guide: `prose guide verse --text --section <name>` prints one section of the reference guide for free verse, haiku,
limericks, ballads, sonnets, villanelles and sestinas. Read the section you need, not all of it: `anatomy` before
choosing or writing a form (the shared craft first, then each form), `length` before promising a count, `good` for
worked examples, `failures` and `revise` when a poem is being fixed, `rules` for what lint checks. Run `prose guide` to
list every guide.

## Set up the file

Write `<name>.md` with frontmatter naming the form:

```md
---
form: sonnet-shakespearean   # free-verse | haiku | limerick | ballad | sonnet-shakespearean | sonnet-petrarchan | villanelle | sestina
---
```

One source line is one verse line; a blank line ends a stanza; a heading labels a section. A line that
starts with `- `, `1. `, `> ` or `#` is read by Markdown as a list, step, quote or heading, so start
such a line with a word or escape the marker (lint warns about the first three).

A poem with a fixed line pattern: declare it, and the tool checks every stanza against it.

```md
syllables: 8.6.8.6   # per stanza, repeated; or a list [7, 7, 7, 5]  (for words to be sung, see prose-songwriting)
scheme: xaxa         # a letter per line; x means unconstrained
```

## Plan before you write

- **Pick the form** from the request; use `free-verse` when none is asked for.
- **Sestina:** write the six end words and the rotation (stanza 2 uses the order 6-1-5-2-4-3 of stanza 1,
  and so on) as a table first, then fill each line. The three envoi lines hold all six words, two to a line:
  one inside the line and one at its end.
- **Villanelle:** write the two refrains first; they repeat verbatim at lines 1, 6, 12, 18 and 3, 9, 15, 19.
- **Syllable templates and meters:** write the template down and draft each line to it.

These are the forms where an error is invisible when you read the poem (in testing, a lighthouse
sestina read well with two end words swapped in stanza 3), so they are checked before you show anything.

## Write

- Concrete before abstract: one image or turn per stanza, specifics the reader could not guess.
- A line break should do something: land a sound, a surprise or a pause. Say why when asked.
- Never bend syntax or pick a worse word only to rhyme; change the rhyme word instead. In free verse, rhyme
  every line only on purpose (lint reports six or more fully rhymed lines as a sameness signal to review).
- Name and avoid stock closers ("a little sorry that the road has to end"), borrowed images and
  abstractions that tell the reader how to feel.

## Check, then report numbers

1. Run `prose scan <file> --text`: syllables, stress, end word and rhyme letter per line, the scheme, and how
   many words were `dict`, `affix` or `guessed`. A count such as 9/10 means the word has two pronunciations;
   either reading counts. `?` in the stress column is a one-syllable or guessed word, so ignore it there. For a
   doubtful word run `prose pronounce <word>`.
2. Run `prose lint <file>`. It is silent when a check passes: for fixed forms it checks the line count, the
   rhyme scheme, the villanelle refrains and the sestina's end-word rotation and envoi, so a quiet lint on a
   sestina means the rotation held. Fix each warning, or say why it stays. Read the findings for what they are:
   - A rhyme-scheme warning means that pair does not rhyme in US English. An `info` about an eye rhyme,
     a guessed word or a word with two pronunciations ("wind") is yours to decide.
   - Meter findings are advisory: scansion is contested and one-syllable words can go either way.
   - Words listed as guessed (names, slang, coinages) are estimated from spelling; verdicts on those lines are weaker.
3. Work through the `judgement` list lint prints (line breaks, form-specific craft).
4. Report the scan's numbers (lines, syllable counts wherever the form or the request sets one, the scheme) and
   answer each judgement item in a line. Name what the tool cannot judge: imagery, originality, whether the line
   breaks work, how it sounds read aloud.

Never write "perfect iambic pentameter" or "5-7-5" without the scan that shows it. If the CLI cannot run
here, count syllables line by line yourself and say the count was done by hand.

## Keep

Poems are mostly taste. When the owner may want a choice, offer measurably different versions through the
prose-review skill instead of picking for them. The checks measure form and sound, never whether the poem is good.
