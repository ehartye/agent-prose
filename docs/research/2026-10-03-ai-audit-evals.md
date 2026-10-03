# AI audit skill evals (2026-10-03)

Paired runs with `claude plugin eval` (with plugin against a no-plugin baseline arm) on three quality cases (run with `--runs 3`, so three runs per arm; the case files default to two) and five negative cases (`--runs 2`, one arm), plus a separate end-to-end loop test with the real CLI. Quality cases are scored by single-criterion LLM judges that read the written file. The baselines they were built from are in `2026-10-03-ai-audit-baselines.md`; what the audit itself detects, and does not, is in `2026-10-03-ai-audit-measurement.md`.

**Environment limit (as in the earlier rounds).** On Windows an eval run cannot be granted a shell, so the agent writes its answer but cannot run `prose audit`. These evals therefore measure the skill's guidance. The loop with the tool is tested separately, below.

## Triggering

| | Result |
|---|---|
| The audit skill fired on its own cases | 8 / 9 with-skill runs (the authorship question missed once: the agent answered without invoking it) |
| The audit skill fired on a negative case (a docstring, UI microcopy, taglines, a typo fix, writing a new blog introduction) | 0 / 10 runs; all 58 quiet-grader checks passed |

## Judge scores

| Case | With skill | Without | Δ |
|---|---|---|---|
| audit-revise (make a blog introduction sound less like AI) | 0.87 | 0.87 | 0.00 |
| audit-authorship ("was this written by AI?") | 0.75 | 0.75 | 0.00 |
| audit-detector (sound human and avoid detectors) | 0.75 | 0.83 | -0.08 |

Mean Δ about -0.03: no measurable gain from the judges, within their noise at three runs per arm. Runs with the skill took 4 to 6 turns against 2 and cost 1.5 to 2 times as much.

### What the judges could not see

- **The authorship criterion failed every run in both arms.** The criterion was "no probability, percentage, odds or confidence level, and no conclusion either way". Reading the answers directly: none of the three with-skill answers gave any verdict or odds ("I won't give a verdict or a probability", specific quoted spans, weak signals named as non-findings, the method noted); of the three no-skill answers, one said "roughly even odds, maybe leaning slightly toward AI" and two declined. The earlier no-skill baseline for the same question gave "roughly 70-80% likely AI-generated". So across the four no-skill answers observed, two gave odds or a percentage; across three with-skill answers, none did. The judge failed all six, probably reacting to the word "probability" in sentences that refuse to give one, so the criterion does not discriminate. The grader was rewritten after this round to ask only about a number or ratio and to say that a refusal does not count against the answer; that rewrite has not been run, and a scripted regex grader would be better still (the harness has a `regex` grader type, but its configuration is not publicly documented, so it was not used). The unrewritten criterion shipped for this round's numbers.
- **Revision quality.** Reading one pair: the with-skill revision replaced the generic opener with a concrete prompt to the reader ("Ask your team why it picked its current vendor...") where the no-skill revision kept a generic opener ("Your team probably makes hundreds of decisions a quarter"); both kept the same stock examples and a roadmap-style sentence. The difference is modest and the judges scored both 0.87.

## The loop with the real CLI (agents with a shell, one run per request)

| Request | Tool result before and after | What the skill produced | Skill feedback acted on |
|---|---|---|---|
| Make a blog introduction sound less like AI, no extra details available | 0 soft findings before and after; three-item lists 11.1 to 7.3 per 1,000 words; sentence variation 0.53 to 0.56 | Cut the stock opener's setup, the roadmap sentence, the closing restatement; listed the unsourced figures; invented nothing | What to do when the owner has no details to add; wording for a "less AI" request; reporting zeros |
| Rewrite an announcement post to sound human and avoid detectors, with three real facts supplied | 0 soft findings before and after; three-item lists 18.6 to 0 | Opened with the detector sentence, then folded in the three facts (neighbourhood, first client, starting price) and nothing else; cut the stock opener and the pun closer | The detector sentence goes first in the reply; adding supplied facts is allowed |

Neither run gave an authorship verdict. Both reported counts from the tool and kept the standing limit. In both, the tool was quiet while the judgement pass found the real issues, which matches the measurement write-up: on current model text the tool alone says little, so the skill's value is the discipline and the judgement pass, not the tool's findings. The feedback from both runs was folded into the skill before the end of this round.

## Limits

- Three runs per arm and an LLM judge from the same model family: indicative only; two of the criteria were unusable (above).
- The loop was tested once per request, by agents that read the skill and used the CLI directly rather than through the plugin's managed runtime. The skill was revised after the final eval pass (small wording changes from the loop feedback) and was not re-run through the eval.
- Two pieces of model text from one model family were used; the skill's behaviour on text from other models, longer pieces, or genres other than blog and announcement copy is unmeasured.
- Nothing here shows the skill makes text harder to attribute, and that is not its aim.
