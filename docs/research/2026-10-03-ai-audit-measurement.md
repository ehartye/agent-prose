# Style audit: measured behaviour on abstracts

> Note (v2): the cluster rule this document describes, and `src/audit/cluster.ts`, were removed in audit v2, which reports a count of hallmarks instead of a cluster verdict. The measurements below are kept as they were run and are not rewritten.

Date: 2026-10-03. Script: `scripts/audit-measure.mjs`. Cluster defaults: `src/audit/cluster.ts`. Sample ids: `2026-10-03-ai-audit-sample-ids.txt`.

Short version: on this sample the audit's cluster rule never fired, for human abstracts or for model abstracts. It produced no human false positives (0 of 175 held out), and it caught none of the plain-prompt model abstracts either (0 of 175). Soft findings are rare in both groups, and where they occur they are more common in the human abstracts. The audit is a revision aid for spans; these numbers give no support for using it to tell who wrote a text, and it is not meant for that.

## Method

- **Detectors under test.** The same code `prose audit` runs: `src/audit/detectors.ts` and `src/audit/report.ts`, imported in-process. Each abstract is parsed as one Markdown draft with form `academic`, the way the command would read a file. Hard artifacts do not count toward the cluster; only soft findings do.
- **Cluster rule.** Met when the text has at least `minFamilies` distinct soft families, at least `minPerThousand` soft findings per 1,000 words, and at least 100 words. Abstracts under 100 words never meet it (18 of 176 human abstracts in the calibration half, 17 of 175 held out).
- **Split.** The 351 ids are sorted, shuffled with a seeded generator (mulberry32, seed 20261003) and cut in two: 176 for calibration, 175 held out. The same id goes to the same half in every group, so groups are paired by title.
- **Statistics.** Per-family flag rate is the share of abstracts with at least one finding of that family. The cluster rate carries a Wilson 95% interval. Soft findings per 1,000 words are computed per abstract, then summarised as mean, median and 90th percentile. The paired comparison counts, per title, whether the model abstract and the human abstract each meet the cluster.
- **Reproduce.** `node scripts/audit-measure.mjs <dataDir> [--seed N] [--json] [--sweep] [--threshold-families K --threshold-per-thousand X]`. Pure Node, no new dependency, deterministic (two runs give identical JSON).

## Data

- **Human abstracts.** 351 arXiv abstracts, harvested on 2026-10-03 through the arXiv OAI-PMH interface, with creation dates from 2018-01-09 to 2021-09-28 (before public chat models). Eight sets, 37 to 50 abstracts each: cs.CL 38, cs.CV 41, cs.LG 48, stat.ML 37, physics.comp-ph 45, math.PR 50, q-bio.NC 44, econ.EM 48. By year: 2018 101, 2019 93, 2020 76, 2021 81. The harvest used a fixed seed (20240607) for sampling within each set and year. The ids are in `2026-10-03-ai-audit-sample-ids.txt`, one per line. No abstract text is stored in this repository. LaTeX was left in the text; some math abstracts are LaTeX-heavy.
- **Model, plain prompt.** 351 abstracts written by Claude for the same titles, with a short prompt that gave the title and asked for an abstract and no style instruction.
- **Model, careful-human prompt.** 120 of those titles, written with an added instruction to write like a careful human researcher and avoid assistant-sounding phrasing. 60 fall in each half.
- **Length.** Mean words: human 162, plain 197, clean 191.

## Calibration

Sweep on the calibration half only: minimum distinct soft families 1 to 5, minimum soft findings per 1,000 words from 0 to 20. Each cell is human false-positive percentage / plain-prompt model percentage (176 abstracts each).

| families \ per 1,000 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 15 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 7/5 | 7/5 | 7/5 | 7/5 | 6/5 | 4/3 | 2/1 | 1/1 | 0/1 | 0/0 | 0/0 | 0/0 |
| 2 | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| 3 to 5 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |

(Percentages are rounded. The script's text output with `--sweep` prints the exact counts in brackets beside each cell, human flagged then plain-prompt flagged, for example `[7,5]` out of 176 and 176.)

**Criterion as specified.** At most 5% human false positives on the calibration half, then the highest plain-prompt rate. The literal optimum is 1 family with at least 5 findings per 1,000 words (human 4.0%, plain-prompt 2.8%, 7 of 176 and 5 of 176). I did not adopt it:

- With abstracts of about 160 words, 5 findings per 1,000 words means a single finding, so the rule becomes "any one flagged word". That contradicts design Principle 4 (one or two soft tells are coincidence; the rule needs several distinct families).
- The 2.8% against 4.0% difference is 5 abstracts against 7, which is noise.
- It does not hold up outside the calibration half. On the held-out half the same setting flagged 22 of 175 human abstracts (12.6%, interval 8.5 to 18.3%) and 7 of 175 plain-prompt abstracts (4.0%). More human abstracts than model abstracts. The held-out half was looked at, once: after I had decided to keep the starting value, while checking whether the literal optimum should replace it. Nothing was tuned on it, and the shipped setting does not depend on it.

**Choice.** The shipped threshold is the Task 1 starting value, kept as it was. Nothing was tuned on any data: not on the calibration half, not on the held-out half, not on the second genre. Among the settings that keep "several distinct families" (3 or more), all 36 settings tie at 0% human and 0% plain-prompt on the calibration half. Tie-break: keep the setting already in the code when it is in the tied set. So the defaults stay at 3 families, 4 findings per 1,000 words, 100 words. The calibration confirmed the Task 1 placeholder is safe on this sample; it did not show the rule catches anything here. Constants and measured rates are recorded in `src/audit/cluster.ts`.

**Family check.** Per-family human flag rates on the calibration half: vocabulary 5.7%, trailing-participle 1.1%, undue-significance 0.6%, negative-parallelism 0.6%, every other family 0.0%. No soft family flags more than 15% of human abstracts, so none was dropped from the family count and no pattern was narrowed. No detector code changed.

## Held-out results

Setting: 3 families, 4 per 1,000 words, 100 words. Held-out half: 175 human, 175 plain-prompt, 60 careful-prompt abstracts.

| Group | n | Cluster met | Rate | Wilson 95% interval |
|---|---|---|---|---|
| Human | 175 | 0 | 0.0% | 0.0% to 2.1% |
| Model, plain prompt | 175 | 0 | 0.0% | 0.0% to 2.1% |
| Model, careful-human prompt | 60 | 0 | 0.0% | 0.0% to 6.0% |

The human false-positive rate meets the 5% target, and the upper end of its interval is 2.1%. The same rule meets the cluster for none of the plain-prompt model abstracts, so as a detector of default model prose it has no measured sensitivity here. The careful-prompt result (0 of 60) cannot show how far instruction removes surface tells, because the plain-prompt rate is already 0; the two are indistinguishable at this threshold. Single findings are the only place a difference shows, and it points the other way: any soft finding appears in 14.3% of human abstracts, 6.3% of plain-prompt and 1.7% of careful-prompt abstracts.

Per-family flag rate, held-out half (families not listed flagged 0% in every group; hard families flagged 0%):

| Family | Human | Plain prompt | Careful prompt |
|---|---|---|---|
| vocabulary | 10.3% | 4.6% | 1.7% |
| negative-parallelism | 3.4% | 1.1% | 0.0% |
| copula-avoidance | 0.6% | 0.6% | 0.0% |
| trailing-participle | 0.6% | 0.6% | 0.0% |
| any soft family | 14.3% | 6.3% | 1.7% |

Soft findings per 1,000 words per abstract, held-out half:

| Group | Mean | Median | 90th percentile |
|---|---|---|---|
| Human | 0.97 | 0.00 | 5.68 |
| Model, plain prompt | 0.34 | 0.00 | 0.00 |
| Model, careful prompt | 0.09 | 0.00 | 0.00 |

The calibration half looks the same: mean 0.42, 0.26 and 0.00; medians and 90th percentiles 0.00.

Paired by title (held-out half): for the 175 titles with a plain-prompt abstract, both met the cluster 0 times, the model abstract only 0 times, the human abstract only 0 times, neither 175 times. For the 60 titles with a careful-prompt abstract, the same: neither 60 times. With a looser rule (the 1-family setting above) the pairing is informative in the wrong direction: for the calibration half, the model abstract alone met it 4 times and the human alone 6 times (both 1).

**Hard-tier findings.** None in any group: no leaked markup, placeholders, chat residue or cutoff disclaimers in the human, plain-prompt or careful-prompt abstracts.

**Most frequent soft spans in the human group** (both halves, spans cut to at most six words):

| Count | Family | Span |
|---|---|---|
| 8 | vocabulary | additionally |
| 7 | vocabulary | crucial |
| 3 | vocabulary | enhance |
| 3 | vocabulary | interplay |
| 2 | vocabulary | enhanced |
| 2 | vocabulary | enhances |
| 2 | vocabulary | highlighting |
| 2 | vocabulary | pivotal |
| 1 | copula-avoidance | serves as |
| 1 | negative-parallelism | a not-only-but-also construction |

False-positive sources are word-level vocabulary entries that were ordinary in human research writing before 2022 (sentence-initial *Additionally*, *crucial*, *enhance*), plus *not only ... but also* constructions that people use constantly. Both are why the cluster rule requires several families.

## What this shows and what it does not

- **One genre.** arXiv abstracts only. Other kinds of writing (essays, fiction, emails, articles) can behave very differently, and the tell lists were largely built from other genres.
- **One model family.** The model samples are Claude only, from short prompts. Other models, longer prompts and system prompts can differ; the audit also finds nothing in the Claude samples, so the result says nothing about those either way.
- **Human sample.** It includes authors of unknown nativeness and abstracts of mixed quality; it is not a sample of any named group of writers.
- **The prompts were short.** The plain prompt gave a title and asked for an abstract. The model abstracts are dense and plain, which is probably why few tells appear. A different prompt could give a different result.
- **The 5% target is a convention.** It is not derived from any source. Sample sizes of 175 give intervals of about two percentage points at 0 flagged and a few more near 10%.
- **The numbers apply to these samples only.** They are not rates for any population.
- **A low flag rate says nothing about who wrote a text.** Zero flags on a model abstract, or on a human one, shows only that these patterns were absent. Removing the patterns is easy, and the audit does not identify authors.
- **A rule that rarely fires.** On this genre the cluster rule is close to inert. It would need other evidence, such as a larger lexicon or a different genre sample, before anyone should read its silence or its firing as informative. Recalibrate when the lexicon changes.

## Second genre: Wikipedia introductions against an older GPT model

Added after the abstract results, to see how the audit behaves on the output of an older, small GPT model. The word lists describe later models, so this check shows only how the audit behaves on this model's output, not how it would behave on the models the lists were built around. The data is the public Hugging Face dataset at https://huggingface.co/datasets/aadityaubhat/GPT-wiki-intro, fetched through the datasets-server API on 2026-10-03: 350 pairs, each the human-written Wikipedia introduction for a title (before 2023) and an introduction generated from the same title by GPT "Curie" (`text-curie-001`) with a prompt asking for a 200-word Wikipedia-style introduction and seeded with the first seven words of the real text. Mean words: human 199, generated 142. The rows came from five random offsets (seed 20261003). The dataset card gives a non-specific license (`cc`); only aggregate numbers are kept here. The same detectors and the same cluster setting (3 families, 4 per 1,000 words, 100 words) were run unchanged; nothing was recalibrated on this data.

| | Calibration half (175) | Held-out half (175) |
|---|---|---|
| Cluster met, human | 0.0% (0.0 to 2.1%) | 0.0% (0.0 to 2.1%) |
| Cluster met, generated | 0.0% (0.0 to 2.1%) | 0.0% (0.0 to 2.1%) |
| Any soft finding, human | 7.4% | 7.4% |
| Any soft finding, generated | 4.0% | 2.3% |
| Soft findings per 1,000 words, mean, human | 0.40 | 0.43 |
| Soft findings per 1,000 words, mean, generated | 0.39 | 0.16 |
| Hard findings, any group | none | none |

Of the generated introductions, 47 of 175 in the calibration half and 39 of 175 in the held-out half are under 100 words and cannot meet the cluster rule at all (none of the human introductions are).

Most frequent soft spans in the human group: *serves as* (4), *additionally* (4), *functions as* (2), *renowned* (2), *crucial* (2), plus single occurrences of *nestled*, *diverse array*, *indelible mark* and *garnered*. These are ordinary in human encyclopedia writing, which is part of why the families that match them are advisory.

### What the two samples say together

- **No sensitivity was measured, in either genre or for either model.** In both samples the share of texts with any soft finding is higher for the human text than for the model text, and the cluster rule fires for neither. (This was the v1 result. In v2 the `triplet-density` threshold was set from the same human data, so its model-versus-human gap is not an independent sensitivity measure either.) The audit does not distinguish these model samples from human writing and must not be read as if it did.
- **The false-positive side is reassuring but narrow.** With the cluster rule at 0 of 350 (both halves, abstracts) and 0 of 350 (introductions), human writing in these two genres did not meet it. That says the cluster rule is conservative; it does not say a single family is safe, since individual families flagged between 1% and 10% of human texts.
- **The samples do not include the models the word lists describe.** The vocabulary and phrase lists are dated to GPT-4, GPT-4o and GPT-5 era output. The two model samples are a current Claude model and an old small GPT model. Claude text in particular shows almost none of the listed habits. Whether the audit detects GPT-4-era prose, longer pieces, marketing copy or prompts that elicit chatty output is unmeasured here.
- **What this means for the tool.** It is a revision aid for prose that is generic or formulaic where those patterns are present, and it can say nothing useful about who wrote a text. The summary sentence, the standing limits text and the skill all say so. A quiet report is not evidence of anything.

## v2: per-family human rates

Added with audit v2, which has no cluster rule and instead prints, beside every family it reports, how common that family is in human writing. Nothing above this section was re-run or rewritten. The numbers live in `craft/audit-rates.json` (schema `prose/audit-rates@1`, aggregates only: no text and no ids) and are regenerated by `scripts/audit-measure.mjs --write-rates`; `scripts/audit-data/README.md` says how to collect the data again and how to rerun the harness. The file was generated on 2026-10-04 from the same two samples described above.

**What a cell is.** The share of texts that contain at least one finding of the family, as `count/n (rate; Wilson 95% interval)`. "Human" is the pre-2023 text of each dataset; "model" is the model sample for the same titles (Claude, plain prompt, for the abstracts; an older GPT model, the dataset's own generated introductions, for the Wikipedia introductions). The model columns are for context only: no sensitivity claim rests on them, and no family is tuned to them.

| Family | arXiv human (n=351) | arXiv model (n=351) | Introductions human (n=350) | Introductions model (n=350) |
|---|---|---|---|---|
| artifact | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| chat-residue | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| knowledge-cutoff | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| vocabulary | 28/351 (8.0%; 5.6% to 11.3%) | 15/351 (4.3%; 2.6% to 6.9%) | 11/350 (3.1%; 1.8% to 5.5%) | 5/350 (1.4%; 0.6% to 3.3%) |
| copula-avoidance | 1/351 (0.3%; 0.1% to 1.6%) | 1/351 (0.3%; 0.1% to 1.6%) | 6/350 (1.7%; 0.8% to 3.7%) | 0/350 (0.0%; 0.0% to 1.1%) |
| promotional | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 4/350 (1.1%; 0.4% to 2.9%) | 5/350 (1.4%; 0.6% to 3.3%) |
| undue-significance | 1/351 (0.3%; 0.1% to 1.6%) | 0/351 (0.0%; 0.0% to 1.1%) | 1/350 (0.3%; 0.1% to 1.6%) | 0/350 (0.0%; 0.0% to 1.1%) |
| trailing-participle | 3/351 (0.9%; 0.3% to 2.5%) | 2/351 (0.6%; 0.2% to 2.1%) | 2/350 (0.6%; 0.2% to 2.1%) | 1/350 (0.3%; 0.1% to 1.6%) |
| negative-parallelism | 7/351 (2.0%; 1.0% to 4.1%) | 2/351 (0.6%; 0.2% to 2.1%) | 2/350 (0.6%; 0.2% to 2.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| weasel-attribution | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 1/350 (0.3%; 0.1% to 1.6%) | 0/350 (0.0%; 0.0% to 1.1%) |
| despite-challenges | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| closing-opener | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| inline-header-bullets | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| emoji-lead | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| title-case-heading | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| mechanical-bold | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| stock-opener | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| announcement-filler | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| roadmap-sentence | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| dive-in | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| whether-youre | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| from-to-range | 4/351 (1.1%; 0.4% to 2.9%) | 3/351 (0.9%; 0.3% to 2.5%) | 1/350 (0.3%; 0.1% to 1.6%) | 1/350 (0.3%; 0.1% to 1.6%) |
| worth-noting | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| marketing-verbs | 13/351 (3.7%; 2.2% to 6.2%) | 2/351 (0.6%; 0.2% to 2.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 2/350 (0.6%; 0.2% to 2.1%) |
| restating-closer | 0/351 (0.0%; 0.0% to 1.1%) | 0/351 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) | 0/350 (0.0%; 0.0% to 1.1%) |
| triplet-density | 6/351 (1.7%; 0.8% to 3.7%) | 33/351 (9.4%; 6.8% to 12.9%) | 18/350 (5.1%; 3.3% to 8.0%) | 23/350 (6.6%; 4.4% to 9.7%) |

Reading the table:

- **Hard families** (artifact, chat-residue, knowledge-cutoff) were found in none of the 1,402 texts in any column; the upper end of each interval is 1.1%.
- **Families the table shows at 0 of N in every column** have not been observed in these samples, so their human rate is below about 1% here. That is a statement about these two genres, not a measurement of how rare the phrases are elsewhere: the v2 families came from reader reports and baseline audits of chat-style writing, which neither genre resembles.
- **The commonest human families.** In the abstracts: vocabulary 8.0%, marketing-verbs 3.7%, negative-parallelism 2.0%, triplet-density 1.7%, from-to-range 1.1%. In the introductions: triplet-density 5.1%, vocabulary 3.1%, copula-avoidance 1.7%, promotional 1.1%, then trailing-participle and negative-parallelism at 0.6% each. These are the families a report should be read most carefully for, since a finding of one is the least unusual in human text.
- **Triplet density** is the one family whose model sample exceeds the human one in both genres (abstracts 9.4% against 1.7%, introductions 6.6% against 5.1%). Its human rate is low by construction, because its threshold is the human 95th percentile (below). The gap is also partly an artifact of that choice: the threshold was set from this same human data, and the human median is 0 lists per 1,000 words against a threshold of 10.9.

## The triplet-density threshold

`triplet-density` fires when a passage of at least 100 words has more three-item lists ("A, B, and C") per 1,000 words than the threshold. The threshold is read from `craft/audit-rates.json`: the larger of the two datasets' human 95th percentiles of the measured `tripletListsPer1000` (texts of at least 100 words), rounded up to one decimal.

| Dataset | Human 95th percentile | Model 95th percentile |
|---|---|---|
| arXiv abstracts | 6.9 | 15.5 |
| Wikipedia introductions | 10.849 | 15.7 |

The larger human value is 10.849, so the threshold is 10.9 per 1,000 words (it replaced a placeholder of 9). With a passage of 100 words or more, one list can reach at most 10.0 per 1,000, so at this threshold it takes at least two lists. The file's own `triplet-density` rates were regenerated after the threshold changed, since they depend on it: with the placeholder of 9 the human rate was 9 of 351 abstracts and 28 of 350 introductions; with 10.9 it is 6 and 18, the figures in the table. The medians of the measured values are in the same file and are printed beside each measured value in `prose audit`: human median em dashes 0 per 1,000 words in both genres, sentence-length variation 0.32 (abstracts) and 0.42 (introductions), triplet lists 0 per 1,000, and is/are share 1.

## Limits

- **Two genres.** Scientific abstracts and encyclopedia introductions. Blog posts, emails, marketing copy, fiction, speech and chat answers are not measured, and the families the v2 additions target (openers, announcements, roadmap sentences, "whether you're") probably live there (an inference from where readers reported them, not something measured here). The line printed with each family says "other genres may differ" for this reason.
- **One model family plus an older model.** The abstract model sample is one current Claude model with a plain prompt; the introduction sample is one old, small GPT model. Neither is the kind of model the word lists describe, so the model columns say little about those models.
- **Nativeness is unknown.** arXiv authors include many non-native English writers, and the Wikipedia introductions come from editors of unknown background. The rates describe these samples and cannot be split by writer.
- **These samples only.** A rate is the share of texts in a sample of about 350 with at least one finding, with an interval that is wide for small counts (for 0 of 350, up to 1.1%). It is not a probability about any passage, and the audit does not use it as one: it reports the rate so a reader can see how ordinary a finding is in human writing.
- **Data stays out of the repository.** Only the aggregates in `craft/audit-rates.json` are committed.
