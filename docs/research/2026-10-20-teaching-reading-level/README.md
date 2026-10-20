# Teaching and reader-targeting evaluation

Date: 2026-10-20. This is a small engineering evaluation of authoring instructions,
not a student study or a grade-calibration dataset.

## Procedure and artifacts

The initial exploratory drafts, `baseline-teaching.md` and `baseline-reading.md`,
were collected before the two skills were written. They already explained their
topics competently and preserved important qualifications. We did not manufacture
a prose failure to justify the skills. Their main missing evidence was an explicit
reader profile, a recorded preservation review and actual diagnostic execution.

After implementation, two fresh agents received the same four task/fact packets
in the same orchestration turn. Run A could read both skills, their direct local
references and the teaching guide. Run B could not read those materials or the
specification. Neither used external research for the writing tasks. Both inherited
the parent model; the orchestration interface did not expose a reproducible model
snapshot, sampling settings or seed. This is one paired run with no statistical
power. The initial exploratory outputs are not the control arm of this comparison.

`run-a/` contains five drafts, separate drafting-agent notes and ten actual CLI
lint/measure JSON records. `run-b/` contains four files, with both history versions
inside one file. Preserve these outputs as generated; source packets, not real
study reports or historical documents, supplied the content.

The following is a normalized task record, rather than a byte-for-byte transcript
of the dispatch messages:

1. Write about 450 words teaching diffusion to an average U.S. high school freshman,
   with a small practice section. Preserve random motion, net movement down a
   concentration gradient, continued motion at dynamic equilibrium, and the
   otherwise-identical-conditions qualification on gradient/rate comparisons.
   Temperature, distance and medium also affect rate.
2. Give a concise freshman-level account of a fictional observational sleep study.
   Students self-reported at least eight hours of school-night sleep and higher
   mean grades; the association persisted after adjustment for age and school.
   Family resources, preexisting health and study habits were unmeasured. Retain
   causal and participating-school limits. A randomized intervention asks a
   different causal question; assignment, adherence and outcome measurement matter.
   No sample size or effect size was supplied.
3. Write exactly 200 body words for grade 4 distinguishing weather observation from
   prediction. Retain both terms, earlier/current measurements, future uncertainty,
   observations/models as forecast inputs, and usefulness despite possible errors.
4. Give brief grade 6 and grade 12 explanations of conflicting historical accounts.
   Retain `corroboration`: disagreement need not imply lying; vantage point, time,
   purpose and memory may differ. Contemporary accounts are not automatically
   accurate; copied repetition is not independent evidence. Preserve unresolved
   uncertainty. No actual historical accounts or quotations were supplied.

## Independent review

A fresh reviewer read draft bodies and selected skill descriptions, without the
implementation, specification, skill bodies or drafting-agent notes. It was not
told the exposure mapping. Artifact names remained A/B, and metadata/layout could
reveal the arm, so this was not fully blinded or randomized. The planned shuffled
artifact labels were not used; this limits the strength of the comparison.

The fixed rubric used 0 for material failure, 1 for usable with revision, and 2
for good: reader/goal fit, explanation/connections, meaning/qualifications,
vocabulary support, requested examples/practice/feedback, and respectful tone.
Verification honesty was checked separately. A provisional pass required 80% of
applicable points with no zero. Fabrication, a lost required condition, a wrong
practice answer or a false testing claim would fail regardless of total.

| Output | Run A | Run B | Result |
|---|---:|---:|---|
| Freshman diffusion lesson | 12/12 | 12/12 | Both provisional pass |
| Freshman study account | 10/10 | 10/10 | Both provisional pass |
| Grade 4 weather | 10/10 | 10/10 | Both provisional pass |
| Grade 6 history | 10/10 | 10/10 | Both provisional pass |
| Grade 12 history | 10/10 | 10/10 | Both provisional pass |

Practice was not required in the last four outputs and was scored N/A. The reviewer
found no fabricated result, lost required condition, wrong practice answer or false
testing claim. These ceiling scores may reflect easy tasks or an insensitive rubric;
they do not establish equal quality in general or a benefit from the skills.

Concrete observations:

- Both diffusion lessons explain two-way movement and net direction accurately.
  A makes the learning goal explicit; B supplies a useful numerical crossing
  illustration and more explanation of rate factors. Body lengths were about
  439 and 430 words, excluding headings/frontmatter.
- Both study accounts preserve causal/scope qualifications. A labels the study
  fictional and states that sample/effect estimates were absent; B is shorter
  and especially clear about assignment to a particular intervention.
- Both weather bodies were independently counted at exactly 200 whitespace-delimited
  words, excluding headings/frontmatter. A sustains one child's example; B explains
  what a forecast model does and gives concrete ways forecasts can be wrong.
- Both history pairs preserve independent evidence and uncertainty. A explains
  `contemporaneous`; B avoids adding that term at grade 6 and is more compact.
  A's fictional-exercise closing paragraphs add little to the requested explanation.

Run A's distinct contribution was observable workflow evidence: typed profiles
with no inferred numerical target, separate preservation notes, bounded revisions
and actual CLI diagnostics. All final saved-draft lint commands exited successfully
with no errors or warnings. Judgement prompts remain unverified by the tool. The
literal `cause` observation was absent where the prose used `causes`, illustrating
why term matching cannot substitute for semantic review.

## Routing inspection

This was description inspection, not an automatic activation experiment:

| Request | Expected primary behavior |
|---|---|
| Research abstract | `prose-formal`; add audience adaptation only if requested |
| Reset procedure | `prose-instruct`; add reader adaptation when needed |
| Grade 1 decodability | Distinct decoding support; outside grades 4–12 numerical scope |
| Short notice | Existing professional-writing skill; short text can have no grade estimate |
| Spanish lesson | Teaching may apply; English grade measurement is unavailable |
| Poem | Poetry keeps its genre; no paragraph-grade estimate for verse |

The reviewer flagged broad grade-level wording in the new reading-level description.
It was tightened to put grades 4–12 first. Teaching and reader adaptation intentionally
compose for grade-targeted lessons; actual automatic skill selection remains untested.

The separate [constraint-conflict check](conflicting-constraints.md) supplied a
five-word limit with three mandatory phrases totalling eight words. After reading
both skills, the agent explicitly reported the conflict and named the required
adjustment. It did not drop a phrase, claim a successful five-word draft or enter
repeated revisions. The orchestrator independently confirmed the eight-word minimum.

No educator review, intended-reader comprehension test, classroom trial or demonstrated
learning improvement occurred. The excerpts in the teaching skill are separately
labelled research-assessed material or standards-selected exemplars; these generated
drafts are original demonstrations and have neither status.

## Engineering verification

On Windows with Node 24.18.0:

- `npm test`: 137 files passed; 2,781 tests passed, two skipped.
- `npm run typecheck` and `npm run refs:check`: passed.
- `git diff --check`: passed.
- A later docs/skill-metadata check passed all 38 tests in `tests/skills.test.ts`.
- Isolated managed setup passed using separate temporary runtime and npm-prefix
  directories. The installed launcher parsed, measured and linted the guide's
  Markdown example and resolved `guide textbook`. All four new skill/reference
  resources were present. It recorded school grade 9 with no numerical target.
  Ordinary setup did not request a browser download or replace the user's CLI link.

Independent specification/code review identified and corrected valid BCP 47 tags
rejected by Intl-only checking, closing ATX hashes on excluded section headings,
and non-ASCII Kelvin signs turning into ASCII during case folding. Each received
failing regressions before its fix. Legacy golden measurements were checked to
differ only by the additive `readability: null` field for untargeted drafts.

An initial full run also caught three integration omissions: rule documentation,
the auto-rule table row and the guide-family inventory. Those were corrected;
the full passing run above includes the fixes. These checks establish the runtime
contract and packaging on this branch, not learning effectiveness. Integration,
cross-platform CI and publication are separate from this local verification.
