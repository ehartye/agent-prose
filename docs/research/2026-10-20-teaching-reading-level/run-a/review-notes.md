# Run A review notes

These notes record drafting-agent review and tool use. They do not score the drafts or compare them with another run. The five numbered Markdown files contain the final reader-facing drafts, with authoring metadata in front matter. Each draft also has separate raw `.lint.json` and `.measure.json` files.

## Conditions and source limits

Used `skills/prose-teach/SKILL.md`, `skills/prose-reading-level/SKILL.md`, their directly linked local reference files, and the local teaching guide's `anatomy` and `failures` sections. No other skills, web research, runtime edits, or commits were used for this run.

The task's supplied fact packets were the content sources. They were not independent research reports. No original study prose, sample size, effect size, historical sources, or historical quotations were supplied. The study draft therefore reconstructs a concise account from the packet rather than preserving the wording of a missing original. The history drafts explain a method without pretending to assess actual evidence.

Audience labels mean typical U.S. students in grades 9, 9, 4, 6, and 12 respectively. These labels are starting assumptions, not assessed learner profiles. The drafts assume no specialist topic knowledge. The diffusion lesson assumes only that matter consists of particles; it introduces random motion and the other necessary concepts. The weather explanation assumes familiarity with daily weather. No numerical reading-level band was requested or entered.

## Preservation and teaching review

- **Diffusion:** Reviewed the account of random particle motion, two-way crossings, net movement down a gradient, continued motion at dynamic equilibrium, and the condition on the steeper-gradient rate comparison. Temperature, distance, and medium remain additional influences on rate. The coloring-container situation is explicitly an invented illustration, not a reported experiment. The lesson defines its key terms, shows why unequal crossings can result from random motion, and supplies two practice questions with a separate answer key. Checked the key against the packet. The recap retains the distinction between an individual particle's path and the direction of net movement.
- **Sleep study:** Preserved self-reported school-night sleep of at least eight hours, self-reported higher mean grades, adjustment for age and school, and all three named unmeasured factors: family resources, preexisting health, and study habits. Retained the association/causation distinction and restriction to participating schools. Added no sample or effect estimates. The randomized-intervention paragraph concerns assignment to an effort to change sleep, a different question from the observed sleep/grade association. Assignment, adherence, and outcome measurement remain explicit limitations to consider. The CLI's literal term observation marks `cause` absent because the text uses `causes`; manual review checked the actual causal meaning.
- **Weather:** Retained observations of current or earlier weather and predictions of weather not yet observed. Observations and models support forecasts; forecasts remain uncertain, can be wrong, and remain useful for planning. The Maya scenario is explicitly invented. Essential terms `observation` and `prediction` remain and are defined. The final body is 200 whitespace-delimited words, excluding its title and metadata.
- **History, both versions:** Retained that eyewitness disagreement need not imply lying; differences can arise from vantage point, time, purpose, and memory. Both explain that a contemporaneous account is not automatically accurate. Both retain `corroboration`, compare independent accounts, distinguish copied repetition from independent evidence, and preserve uncertainty when contradictions cannot be settled. The five-books situation in the sixth-grade draft is an illustrative example, not an actual source claim. Both state that no real historical accounts or quotations were supplied. The intellectual task remains interpreting disagreement through evidence.

The sixth-grade history version uses shorter explanatory steps and a concrete copying example. The senior version uses more compact source-analysis language. Neither version receives an automatic grade certification from its metadata or diagnostic.

## Actual commands and checks

All commands ran from the repository root.

Read these files with `Get-Content -Raw`:

```text
skills/prose-teach/SKILL.md
skills/prose-reading-level/SKILL.md
skills/prose-reading-level/references/reading-level.md
skills/prose-teach/references/examples.md
```

Ran:

```powershell
node scripts/prose.mjs guide teaching-prose --text --section anatomy
node scripts/prose.mjs guide teaching-prose --text --section failures
node scripts/prose.mjs capabilities
```

Capabilities included `textbook`. After the first drafts, ran the following two commands once for each of the five numbered files; after revisions, ran them again for all five and saved those final outputs in the accompanying JSON files:

```powershell
node scripts/prose.mjs lint <draft-path>
node scripts/prose.mjs measure <draft-path>
```

The final loop used `Get-ChildItem -Filter '0*.md'`, passed each draft's full path to the CLI, saved results with `Set-Content -Encoding utf8`, and inspected their parsed JSON. All ten final CLI commands exited 0. All five final lint results report `ok: true`, no errors, and no warnings. Lint also emits judgement prompts; these are reminders for content review, not automated judgements that the teaching succeeds.

The `measure` readability report used `flesch-kincaid-grade`, method version 1, `markdown-paragraphs-v1`, and `english-spelling-heuristic-v1`. Its estimates cover eligible paragraphs only; headings, lists, and answer-key sections are excluded. Consequently its 358 eligible words for diffusion do not represent the full lesson. The raw JSON preserves the estimates and limitations. No formula target was requested. Term presence and grade estimates were treated as information, not evidence that meaning or audience suitability had been established.

Also counted whitespace-delimited body words after removing front matter and headings using `[regex]::Matches($body, '\S+').Count`. Final counts were 439 for diffusion, 153 for the study, 200 for weather, 174 for sixth-grade history, and 185 for senior history. The diffusion count includes practice and answer text. Tokenization differs from the CLI's word count, especially around punctuation and lists; the counts were not treated as interchangeable.

## Revision record

After the initial five drafts and first diagnostic pass, made one revision pass to the sixth-grade history explanation to unpack clauses and use more familiar surrounding words while keeping the terminology and qualifications. Made two revision passes to the weather explanation: clarified the opening time distinction and reduced the body to 200 words. The diffusion, study, and senior history drafts received no revision after their initial checks. Rechecked each revised draft against its packet; the final diagnostic pass then covered all five drafts.

## Tests not performed

No independent content review, educator review, intended-reader comprehension test, classroom trial, accessibility evaluation, or learning-outcome study was performed within Run A. No human students read these drafts as part of this work. Drafting-agent review and CLI diagnostics cannot establish that a typical learner will understand them or that their practice produces learning. The reading-level research references informed the workflow; their results do not validate these newly authored passages.
