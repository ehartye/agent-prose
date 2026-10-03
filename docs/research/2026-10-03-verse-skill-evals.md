# Verse skill evals (2026-10-03)

Paired runs with `claude plugin eval` (with plugin against a no-plugin baseline arm), three runs per arm, on the cases in
`evals/` named `poetry-sestina`, `song-folk` and `song-hymn`, plus three negative cases. Quality cases are scored by
single-criterion LLM judges that read the written draft. Raw outputs are kept in the maintainer's local working notes.

**Environment limit (as in the first eval round).** On Windows an eval run cannot be granted Bash, so the agent can write the
draft but cannot run `prose scan` or `prose lint`. These evals therefore measure the skills' *guidance*, not the
check-and-fix loop that is the skills' main job. Structural criteria cannot be judged by an LLM reliably (see
"Judges" below), so structure is verified with the engine on the kept drafts, and the loop is tested separately.

## Triggering

| | Result |
|---|---|
| Right skill fired on its case | 9 / 9 with-skill runs |
| A verse skill fired on a negative case (docstring, UI microcopy, taglines) | 0 / 24 runs (48 quiet-grader checks passed on the first two cases, 4 on the third) |

While writing the evals the audit of `when_to_use` found one collision (the poetry skill claimed hymn meter, the songwriting skill
claimed hymn texts); words meant to be sung now belong to prose-songwriting only.

## Judge scores (final run)

| Case | With skill | Without | Δ |
|---|---|---|---|
| song-folk | 0.78 | 0.72 | +0.06 |
| song-hymn | 0.67 | 0.73 | −0.07 |
| poetry-sestina | 0.92 | 1.00 | −0.08 |

Mean Δ −0.03. All three differences are within judge noise at three runs per arm; the judges split their votes on the same
draft, and the imagery criterion (`song-folk` q5) failed every draft in both arms, so stock images were not fixed by the skill.
Runs with the skill took 4 to 10 turns and cost about 1.5 to 2 times as much as runs without it (it reads the skill and writes
frontmatter).

### Judges

An earlier run (two runs per arm) had judges failing every sestina on rotation and structure, including drafts the form checker
confirms are correct, and a first draft of `song-hymn` q3 ("singable") failed in both arms. Count-style and structure-style
criteria were replaced by qualitative ones, as in the first eval round; structure is checked with the engine instead.

## Measured with the verse engine (kept drafts)

**Hymn words in common meter** (the request states 8.6.8.6; the same pattern, 8.6.8.6 with only lines 2 and 4 rhyming, was
applied to every kept draft, so the arms are measured alike):

| Draft | Lines off the stated pattern |
|---|---|
| with skill, runs 1 to 3 | 1, 0, 0 |
| without skill, runs 1 to 3 | 6, 5, 6 |

Rhyme on lines 2 and 4 held in all six. The judge could not see this difference; the engine can. The skill's instruction to write
the pattern down and draft each line to it appears to help even when the agent cannot run the tool.

**Folk song, verse line-length spread and rhyme coverage** (kept drafts, two verses each, sections read from the labels):

| Draft | Spread of syllables within each verse | Lines rhymed within their verse |
|---|---|---|
| with skill | 2, 2 / 2, 2 / 2, 2 | 4/8, 4/8, 5/8 |
| without skill | 1, 2 / 4, 2 / 2, 1 | 4/8, 11/16, 12/12 |

No advantage in this sample: the no-skill drafts were not as uneven as the draft in the earlier baseline (a spread of 8 to 9
syllables in each verse, see `2026-10-03-verse-skill-baselines.md`). One draft in four across the two rounds showed that failure;
that is too few to call a rate.

**Sestina** (kept drafts, form checker): with skill, two of three correct and one with a word missing from the envoi; without
skill, two of two correct once a stray subtitle line is removed (two others were unusable only because the draft added a subtitle line).
Together with the baseline round, one of four no-skill sestinas had a rotation error that nothing caught.

## The loop, with the CLI (agents with Bash, one run per skill)

Three agents followed each skill end to end against the real CLI and reported what happened.

| Task | First scan and lint | After fixing | Skill feedback acted on |
|---|---|---|---|
| Sestina | rotation correct, one 8-syllable line in the envoi | clean | lint is silent when form checks pass; say what `?` and `9/10` mean; envoi order |
| Folk song | 14 warnings: chorus rhymed abab against the declared aabb, lines of 6 and 7 against a declared 8 | 0 errors, 0 warnings, 0 info | compare your own declared pattern to the draft before the first scan; `scan` now prints syllables per beat |
| Hymn words | two info findings, one a slant rhyme (hill/well) | clean | add a hymn example; explain the inferred scheme against the declared one |

Each skill was revised from this feedback before the final eval pass, and `prose scan` gained a legend and a syllables-per-beat
column.

## Limits

- Three runs per arm and an LLM judge from the same model family: the judge scores are indicative only.
- The loop was tested once per skill, by agents that read the skill and used the CLI directly, not through the plugin's managed runtime.
- Gold labels and drafts are English; pronunciation is US English from CMUdict, so British rhymes are weaker.
- The imagery and stock-phrase criteria never improved: those remain judgement the skills only ask the agent to do.
- A re-run on Linux or WSL2 with Bash granted would exercise the real loop inside the eval harness.
