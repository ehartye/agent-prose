# Verse skill baselines — no-skill agent, measured 2026-10-03

Nine prompts a real writer might type, each given to an agent with no prose skill and no CLI, drafts then measured with the
verse engine (`prose scan`, `prose lint`) and read for craft. One run per prompt, so these are observations, not rates.
Raw drafts and the measurement script are kept in the maintainer's local working notes.

| Prompt | Verdict | Evidence |
|---|---|---|
| Shakespearean sonnet, grandfather's workshop | strong | 14 lines, ababcdcdefefgg with perfect rhymes, one advisory meter deviation (line 13, syllable 5). Nothing for the checker to flag. |
| Free verse, last night of a road trip | strong | No findings. Concrete images (motel sign, ice machine "like an old dog"); a stock close ("grateful, and a little sorry, that the road has to end somewhere"). |
| Villanelle, the tide | strong | 19 lines; both refrains verbatim at lines 1, 6, 12, 18 and 3, 9, 15, 19; scheme correct. No findings. |
| Five haiku, strict 5-7-5 | strong | All five measure 5/7/5 by the dictionary path ("wavering" counted as three syllables). |
| Words for a melody, 7-7-7-5, lines 2 and 4 rhyme, 3 verses | strong | All nine lines at the requested counts (one line reads 8/7 because "every" has two counts); lines 2 and 4 rhyme (bright/light, high/sky, lay/day). |
| Hymn words in common meter (8.6.8.6), 4 verses | adequate | Counts land at 8/6/8/6 except two lines the dictionary reads as ranges (9/8, 7/6). Only the second and fourth lines of verse 1 rhyme in the way a tune expects; no tool existed to confirm the counts. |
| Sestina, lighthouse keeper | **weak** | **Stanza 3 ends light, keep, sea; the rotation requires light, sea, keep** (lines 23-24). The model did not notice; `verse.form.end-words` flags both lines. The envoi is correct. Everything else about the poem reads well, which is the danger: the error is invisible to a reader skimming. |
| Folk song, verse-chorus-verse-chorus-bridge-chorus, 90 bpm 4/4 | **weak** | See below. |
| Lullaby, AABA | adequate | Perfect rhymes, refrain repeated, B section contrasts. "day is done" appears four times (a lullaby may want that). Section labels `**A**`, `**B**` and the italic `*(AABA, slow...)*` header defeat the engine (see below). |

## The folk song, in detail (the weakest draft)

- **Line lengths do not sit on one tune.** Verse 1 runs 14, 14, 11, 15, 12, 11, 9, 7 syllables; verse 2 runs 16, 16, 13, 14, 11, 11, 7, 8. A singer cannot fit eight lines of that spread to one melody; the model never said so.
- **Rhyme plan is mostly absent in the verses.** Verse 1's scheme is a b c b d e f e: two rhymed pairs in eight lines (light/tight, hat/that). Verse 2 is similar. The chorus rhymes its first four lines (creek/weak, stay/way) but ends on wall/home, which do not rhyme. Nothing says whether that is deliberate.
- **The bridge breaks shape** into 12-, 12-, 10-, 7-, 8- and 4-syllable lines ("But the porch will always be here / When you're ready.").
- **Stock imagery:** "the coffee's going cold", "tips his hat", "the road won't wait", "I love you, little town, but I can't stay". Judgement, not measurable, but a pass that named it would have helped.
- **No singability statement.** The user gave 90 bpm and 4/4; the draft says "Folk, about 90 bpm, 4/4" in an italic line and does nothing with it.
- **The file defeats the tool.** Section labels as `**Verse 1**` and the italic header line are read as verse lines: "90", "bpm" and "4" are reported as guessed words, no sections exist, and `lyric.refrain.consistent` and `lyric.sections.line-match` silently do nothing. After relabelling the labels as headings, lint is still silent on all of the above: the engine has no rule for rhyme density or for within-verse line-length spread, and the like-section rule compares verse to verse (differences of 1 to 2 syllables, inside its 2-syllable convention) rather than line to line within a verse.

## Cross-cutting (ranked)

1. **Unverified structure claims in count-constrained forms.** The strong results (sonnet, villanelle, haiku, melody words) were right without checking; the sestina was wrong without noticing. A checker earns its place on exactly the case where the form has a rule a reader cannot see at a glance.
2. **Section labels and notes written as Markdown emphasis.** Natural for a writer, and it silently disables the lyric checks.
3. **No rhyme plan or line-length plan in lyrics.** Verses wander in length and rhyme; nobody asks what the tune needs.
4. **Stock imagery** in songs (judgement).
5. **No statement of what was not checked**: stress against the beat, anything about the melody, quality.

## Skill implications

- Both skills: write the draft in the native format, run `prose scan` and `prose lint`, fix what they report, and say plainly what the tool cannot judge (quality, imagery, melody, stress against the beat) and that rhyme is US English with guessed words listed. Report numbers from the scan, never "about" counts.
- prose-poetry: pick the form first (the nine forms, or free verse) and write its `form:`; fixed forms with a checkable rule the reader cannot see (sestina rotation, villanelle refrains, sonnet scheme) are verified before the poem is shown; a requested syllable template goes in the draft so the tool can check it; stock endings and forced rhyme are judgement items to name; offer variants through prose-review because taste decides poems.
- prose-songwriting: ask for or state the singing frame first (tempo, time signature, the syllables a line can hold, or the tune's pattern), plan sections and a rhyme scheme per section before writing, keep like sections' line lengths matched, keep the chorus verbatim, label sections with headings or `[Verse 1]`, never emphasis markers; say that stress-on-beat is judged by ear because the tool cannot hear a melody.
- Engine changes the baselines justify (both small, both measured above): recognise lyric section labels written as plain or bold lines and drop parenthesised stage directions; accept an author-declared `syllables` pattern (and rhyme scheme) in the frontmatter so words written for an existing tune are checked against the tune's counts.
