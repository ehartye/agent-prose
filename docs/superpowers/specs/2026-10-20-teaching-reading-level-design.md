# Textbook teaching voice and reading-level adaptation

Status: accepted for implementation after research discussion on 2026-10-20. Implement the two skills and small opt-in runtime extension, with source-backed reference examples whose reuse terms and evidence limits are explicit. Baseline: agent-prose 0.9.1, commit `c05c9c3`.

## Outcome

Add two composable capabilities:

1. **`prose-teach`** writes textbook chapters, lessons and educational explanations. It plans what the learner should understand, explains the reasoning, and chooses suitable examples and practice.
2. **`prose-reading-level`** drafts or adapts English prose for an explicit reader profile and requested reading demand. It preserves content while adjusting vocabulary, syntax, connections and explanatory support.

Textbook purpose and reading level are independent. A university textbook can use demanding vocabulary while carefully teaching its meaning. An adult can need accessible language without a childish tone. Neither capability changes the intellectual goal automatically.

The owner specified U.S. late elementary through high school; use grades 4–12 as the working scope. No particular subject was supplied. Markdown is the initial runtime boundary. Reader age, course placement, topic knowledge and language proficiency remain separate. These product boundaries were selected after reviewing the research; the grade formula does not establish them.

## What textbook voice changes

| Dimension | Academic research writing | Textbook teaching | Procedures and technical reference |
|---|---|---|---|
| Primary purpose | Establish, examine or synthesize a supported claim | Develop understanding and the ability to use it | Enable a task or provide lookup information |
| Reader relationship | Address readers with the background appropriate to the publication | Supply the prerequisites this learner needs and make reasoning visible | Supply prerequisites for the task and an executable path |
| Organization | Research question, argument, methods, evidence and disciplinary conventions | Learning goal, connected explanation, examples and suitable checks | Task steps, reference entries, expected results and recovery |
| Terminology | Use precise terms appropriate to the audience | Introduce necessary terms, define them in context and reuse them consistently | Use the names people need to recognize or act on |
| Evidence | Preserve attribution, qualifications and uncertainty | Preserve those same obligations while explaining their significance | Preserve factual accuracy and operational constraints |
| Success | Readers can assess the claim and its support | Learners can explain or apply the concept | Readers can complete the task or find the answer |

These are purposes, not rigid style stereotypes. Academic prose can be clear and accessible; a textbook can be formal, technical and argumentative. A scholarly source used to teach evidence evaluation may remain intact, with instructional framing around it. Teaching voice is therefore a new authoring skill and form, rather than a global replacement of the existing `academic` register.

`prose-instruct` continues to own procedures and technical reference. `prose-formal` continues to own research and professional genres. All three may invoke the reading-level workflow when an audience adaptation is requested.

## Research basis and limits

- **Textbook practice:** [BCcampus](https://opentextbc.ca/selfpublishguide/chapter/textbook-outline/) describes audience-led planning and selectable outcomes, definitions, activities and summaries. [Northwestern](https://searle.northwestern.edu/resources/learning-teaching-guides/translating-principles-of-inclusive-teaching-for-textbook-authors.html) recommends modeled reasoning, acknowledged difficulties and respectful learner positioning. These are institutional authoring guides, not causal estimates of learning gains.
- **Instructional ingredients:** the already captured [IES practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1) supports worked-example/problem alternation and abstract/concrete connections, and distinguishes their evidence ratings from those for explanatory questions and retrieval. It does not validate one chapter template.
- **Reader model:** [Common Core Appendix A](https://achievethecore.org/content/upload/corestandards_appendix_a_text_complexity_ela.pdf) combines quantitative, qualitative and reader/task analysis. [McNamara et al.](https://eric.ed.gov/?id=EJ520492) make prior knowledge relevant to the effects of coherence. The captured evidence contains the latter's abstract, not full methods.
- **Evidence in the requested age range:** [Lupo et al.](https://ila.onlinelibrary.wiley.com/doi/10.1002/rrq.247) report similar comprehension for most ninth graders across easy/challenging versions with the studied supports, with a substantially below-average subgroup benefiting from easier text. [Rand and Rand](https://www.iejee.com/index.php/IEJEE/article/view/1890) report no overall text-level contribution in one grades 4–8 study, with selected subgroup benefits. Both captures are abstracts; neither establishes equivalence or a universal level-matching rule. The existing [Hebert meta-analysis](https://eric.ed.gov/?id=EJ1105625) supports teaching text structures, not merely applying a textbook style or headings.
- **Adaptation can help:** [Crossley et al.](https://eric.ed.gov/?id=EJ1031308) report better comprehension for beginning-level versions in a 48-reader L2 study. The captured abstract supports that bounded result; it does not validate U.S. grade matching.
- **A lower formula score is insufficient:** the existing [Mac et al. randomized trial](https://pmc.ncbi.nlm.nih.gov/articles/PMC12119439/) found no knowledge difference between its adult health-information grade conditions. It does not show that all adaptation is ineffective. [AHRQ](https://www.ahrq.gov/talkingquality/resources/writing/tip6.html) treats formulas as diagnostics; [Microsoft](https://support.microsoft.com/en-us/word/get-your-document-s-readability-and-level-statistics-in-microsoft-word) documents the FK calculation, not independent efficacy.
- **Meaning needs separate review:** [Barayan et al.](https://arxiv.org/html/2409.20246v2) find disagreement between automated and human CEFR judgments. [Agrawal and Carpuat](https://arxiv.org/html/2312.10126v2) evaluate retained support for comprehension questions. Those sentence/paragraph studies inform safeguards; they do not certify school grades or outcomes for current models.

The following architecture, thresholds, rubrics and time estimates are product proposals inferred from that evidence. They are not research findings. The capture is partial for Northwestern: substantive sections 3 and 4 are absent; this spec relies on retained sections 7–10. Other capture warnings and abstract/PDF limitations are recorded in the source summaries. No table-derived grade mapping is used.

## Approaches considered

**A. Two skills with a small, opt-in runtime extension — selected.** Add the teaching form and guide, a shared reader contract, and a transparent diagnostic while keeping semantic review in the authoring workflow.

- **Time:** approximately 3–6 focused engineering days, including paired evaluations and packaging; reader/educator recruitment adds separate calendar time.
- **Risk:** moderate implementation risk around measurement compatibility; low-confidence audience claims are controlled by separating requested, measured and reviewed results. Learning benefits remain unestablished until tested.
- **Complexity:** modest additions to existing Markdown, forms, measurement and lint paths; no model service or new editor.
- **Best practice:** follows the research's multidimensional reader/task approach and the plugin's automatic-versus-judgement distinction.
- **Maintainability:** two short entrypoints, one teaching guide, one cross-cutting reference and one versioned reader/diagnostic module to maintain.

**B. Skills and references only.** Use an explicit prose brief and existing measurement output; defer typed reader metadata and the new form.

- **Time:** approximately 1–2 focused days now; later automation repeats integration and evaluation work.
- **Risk:** low code risk, but inconsistent audience briefs and ambiguous measurement scope are more likely to survive review.
- **Complexity:** lowest initial complexity; verification relies more heavily on agents following instructions.
- **Best practice:** a useful pilot if runtime work must wait, with a weaker reproducibility contract.
- **Maintainability:** fewer runtime files, with greater continuing review effort and more scope for brief drift.

**C. A calibrated leveling engine with learned difficulty models and licensed providers.** Train or integrate predictors and a constrained revision service.

- **Time:** several weeks or longer plus dataset, calibration and provider work; benefit is delayed.
- **Risk:** substantial calibration, semantic-loss, licensing and domain-shift risk; stronger-looking scores can encourage unsupported certification.
- **Complexity:** high: datasets, model/version management, provider boundaries and separate evaluations.
- **Best practice:** justified only by demonstrated demand and representative calibration data; premature for the current request.
- **Maintainability:** ongoing model/data/provider maintenance and revalidation across domains and audiences.

## Authoring workflow

### Teaching

1. Establish the learner, prior knowledge and an observable goal: explain, distinguish, interpret, calculate or apply something. Obtain required source material or disclose missing evidence.
2. Choose the unit size. An explanation needs a useful conceptual connection and illustration; a lesson or chapter also needs suitable orientation, practice/feedback and a recap. Do not force every device into every section.
3. Sequence concepts by prerequisites. Explain mechanisms and why steps work. Connect abstract ideas to concrete examples, then make the underlying principle explicit.
4. Define necessary terms near first meaningful use. Retain disciplinary precision, uncertainty and evidence. Introduce misconceptions only when relevant, and explain the correction.
5. Choose learner address and tone for the context. Neither second person, friendliness, rhetorical questions, a fixed sentence cap nor removal of passive voice is mandatory.
6. Review whether the example demonstrates the stated principle and whether practice can be answered from the taught material. Supply correct feedback separately from the learner's attempt.

For example, research prose might state, “Enzyme activity varied with temperature under the tested conditions.” A teaching passage could first ask what happens as temperature changes, define enzyme activity, explain the observed pattern using supplied evidence, and guide the reader through a new case. A shorter version must not turn that bounded observation into “Heat always makes enzymes work faster.” This is an invented illustration, not a scientific source claim.

### Reading-level drafting or adaptation

1. Capture a reader brief. “Grade 6” alone is a requested band, not evidence about a reader's age, knowledge or language proficiency. If the user supplies no profile, propose an assumption and label it.
2. For a rewrite, preserve the original and inventory the claims, conditions, quantities, terminology, citations and questions that must survive. For a new draft, build the same inventory from supplied sources and the task.
3. Adjust access to the ideas: familiar precise words, explicit referents and causal links, manageable clauses, contextual definitions and useful examples. More explanatory words can be appropriate even when they raise a formula score.
4. Measure the candidate, then review it against the original inventory and questions. Numerical movement never waives fidelity review.
5. Allow one initial draft and at most two revision passes before reporting a remaining target/content/length conflict. This cap is a workflow convention; every pass compares against the original, not just the previous revision.
6. Deliver the prose and a short review report separating requested target, diagnostic, fidelity review, qualitative audience judgment and actual reader testing. Mark every unperformed check as such.

The report states whether a review was by the drafting agent, an independent reviewer, an educator or intended readers. It does not describe an agent simulating a child as a learner study.

## Metadata contract

Keep Markdown and existing `audience`, `register` and length `target` semantics. Introduce a distinct `reader` object; do not reinterpret a string `audience` or add a grade to the length target.

Natural-language requests such as “write this for an average U.S. high school freshman” are a supported authoring goal. Resolve this to a typical U.S. ninth-grade audience with explicit subject-prerequisite assumptions. Record school placement separately from a numerical text-level request: it must not silently become a demand for an exact FK score of 9. Optional `reader.schoolGrade` (integer 4–12) preserves that distinction; `readingLevel` can remain absent. The agent reviews vocabulary, explanations, connections, examples and intellectual demand against the audience brief, and discloses whether intended readers actually tested it.

```yaml
---
form: textbook
register: academic
target: 800 words
teaching:
  unit: lesson
  goals:
    - Explain how concentration affects the rate of diffusion.
  prerequisites:
    - Particles move randomly.
reader:
  language: en-US
  schoolGrade: 7
  ageGroup: adolescent
  priorKnowledge: Knows particles; has not studied concentration gradients.
  readingLevel:
    scale: us-grade
    range: [6, 8]
  essentialTerms: [diffusion, concentration gradient]
---
```

- `teaching` is required for the new `textbook` form. It is a strict object: `unit` is `explanation | lesson | chapter`; `goals` is a nonempty list of nonempty strings; `prerequisites` is an optional string list. Other forms do not acquire teaching requirements. A `teaching` object on another form is rejected with a useful `/teaching` schema pointer.
- `reader` is optional on Markdown forms. When present, `language` is required as a nonempty BCP 47 language tag. Optional fields are `schoolGrade` (U.S. grade 4–12 integer), `ageGroup` (`child | adolescent | adult | mixed`), `priorKnowledge` (nonempty description), `readingLevel`, and `essentialTerms` (nonempty strings). School grade does not imply an FK target or an assessed reading ability. Unknown keys and malformed values produce `E_SCHEMA` at the offending pointer.
- `readingLevel`, when supplied, is a strict object with `scale: us-grade` and an inclusive ordered integer range from 4 through 12. A single requested grade uses equal endpoints. This proposed input range reflects the owner's scope, not a calibrated population range.
- Earlier-grade requests are outside the proposed v1 range and receive a useful schema error if encoded as a typed target. The skill explains that grade labels do not establish phonics-controlled decodability. Early-literacy review and any taught phonics sequence are separate requirements.
- Other language/proficiency scales may be described in the brief, but the v1 typed target accepts only `us-grade`. Do not silently convert CEFR, Lexile, age or course year. Non-English tags are valid reader metadata; English formula comparison is unavailable for them.
- Language validation checks [RFC 5646](https://www.rfc-editor.org/rfc/rfc5646.html) syntax and duplicate variants/extension singletons, not registry registration. Use Intl canonicalization when available; accepted grandfathered, extlang and private-use alternatives otherwise receive ASCII-lowercase normalization without Preferred-Value mappings. Reject non-ASCII before case folding. Raw document metadata remains unchanged.
- The metadata records intended readers, not inferred diagnoses or demographics. No automatic profile inference or project-wide inheritance is introduced in this release.

## Runtime behavior

### Teaching form and routing

Add Markdown `textbook` to `craft/forms.json`, mapped to a new `teaching-prose` family in `craft/guides/families.json`. It is a read form with no speech-rate default. Reuse the existing parser and IR; add no pedagogical block schema or chapter renderer.

The teaching guide follows the existing guide section structure. Its rules list separates measurable input validation from judgement: goal alignment, prerequisite bridges, sound explanations/examples, suitable practice/feedback, respectful tone and supported claims. These judgement items must never be marked passed merely because lint ran.

Add only appropriate factual-prose rules to the form. Do not inherit `formal.bluf` or imperative procedure rules. Preserve purposeful term repetition; do not make repeated domain terms a failure. Existing supported-claim guidance applies, but newly inferred teaching requirements are marked `derived: true` with cited rationale.

`prose-reading-level` is cross-cutting. Its detailed guidance lives in one directly linked skill reference, not a second guide-family mapping for every form. Both entrypoints remain below the repository's existing skill size limit. Update neighboring skill descriptions so a textbook request routes to teaching and “rewrite for grade 6” routes to adaptation without capturing unrelated editing tasks.

### Transparent reading diagnostic

Keep `style.readingGrade`, its current input semantics and its 30-word minimum unchanged for compatibility. Add a separate top-level `readability` result, null without `reader` metadata. The two values may differ because their input policies differ; explain that difference rather than comparing them as a before/after improvement.

The new report is opt-in and contains:

- method `flesch-kincaid-grade`, method version, language, input-policy version and heuristic syllable-count label;
- eligible word/sentence/paragraph counts and eligible source lines;
- exclusions and coverage limits;
- an estimate or an explicit unavailable reason;
- the declared target and `below | within | above | not-requested | unavailable` comparison;
- the statement that the estimate does not establish comprehension or audience suitability.

Use the documented FK coefficients and existing English token/syllable helpers. Freeze their behavior under a named version for this report. The v1 input consists of Markdown paragraph blocks, excluding headings, lists/steps, block quotes and notes. Code fences and tables are already absent from the existing parser's measurement view. Exclude paragraph sections under case-insensitive headings `References`, `Bibliography`, `Works cited`, `Answer key`, and `Instructor notes`, until the next heading at the same or a higher level. Do not claim a percentage of the original document was assessed when the parser discarded material.

Inline code and mathematical content retained in paragraph text can distort this heuristic. Report that limit, and require qualitative review for symbol-heavy passages; do not claim the formula measures mathematics, table accessibility, listening difficulty or decodability. No unseen blocks, images or dropped text are counted as reviewed.

Require at least 100 eligible words and five sentence units before returning the new estimate or target comparison. This conservative sample floor is explicitly a maintainer convention, not a validated cutoff. Below it, return `insufficient-sample`, while retaining the counts. Non-English declared language returns `unsupported-language`; verse returns `unsupported-genre`. No automatic language detector is implied.

Keep a one-decimal diagnostic for reproducibility, but present it as “approximately grade N,” never “suitable for every Nth grader.” Compare the unrounded value with the inclusive requested interval; a boundary difference is a review prompt, not evidence of a meaningful learning difference. Do not average different readability formulas or invent a statistical confidence interval.

### Lint and review boundaries

Malformed new metadata is an ordinary schema error. Formula position relative to the target is informational and must not change `lint.ok`, block `set check`, or drive an automatic rewrite. If the new reader report exists, use it for the human-facing grade information instead of presenting an unlabeled competing legacy grade.

Essential terms are a declared preservation checklist. Normalize NFKC Unicode, lower case and repeated whitespace, then match whole phrases at word boundaries; retain spelling and hyphens and do not stem words. Report presence and missing phrases as informational observations, with source lines when present. Presence does not establish definition, correct usage or retained meaning; inflection/renaming requires reviewer judgment.

The revision report is editable Markdown, not a new authoritative validation schema. It records coverage of the required claims/questions, changed examples, missing information and reviewer identity. No semantic grader, generation API, paid service, model weights or automatic rewrite command is added to the deterministic CLI.

## Implementation seams

1. Add the two skill directories and linked resources. Add the teaching guide and reference fragment; put references used by rules in `craft/references.json` under existing uniqueness rules. Refresh skill inventory, README, routing descriptions and generated reference/guide outputs.
2. Add a focused reader/teaching metadata validator invoked by document loading. Reuse current `ProseError` pointers. Existing documents without these keys retain their behavior.
3. Add a focused readability module and integrate it through `src/measure/index.ts`. Leave general style measurements and taste feature extraction unchanged. Section filtering uses existing heading metadata and paragraph line locations.
4. Integrate information/judgement through current lint rules/evaluators. Teaching judgement rules apply only to `textbook`; cross-cutting qualitative reading review stays in the skill/report rather than being injected into every untargeted lint result. Automatic reader diagnostics return no findings without the opt-in metadata. Add no error-level audience-fit rule or hidden dependence on a model. Confirm all automatic rules have evaluators under the existing invariant.
5. Package the new resources through the existing managed-runtime mechanism. Document the minimum release for `textbook` and typed reader metadata; older installations must update rather than silently pretending those features ran.

No code is required to render ordinary teaching Markdown. No reading-page redesign, voice-bible schema change, manuscript migration or project-settings extension is included.

## Acceptance and evaluation

### Deterministic checks

- Valid/invalid reader and teaching metadata exercise precise pointers, range ordering, unknown keys and unsupported scale handling. Existing string `audience` and length `target` remain unchanged.
- A new textbook example parses, appears in capabilities, resolves its guide and receives the intended rule set without procedure/BLUF findings.
- Hand-check FK arithmetic independently of the implementation. Cover boundary sample sizes, heading-section filtering, abbreviations, empty/fragment-heavy input, essential-term normalization, unsupported language/verse and out-of-scope grade targets.
- Existing `style.readingGrade`, voice/taste features and untargeted lint behavior do not change. Informational out-of-band estimates cannot reject variants.
- Reference checks, relevant tests and typecheck pass; an isolated managed install includes both skills and runs the documented parse/measure/lint/guide examples. Required Ubuntu and Windows CI run during implementation, not during this documentation task.

### Fixed behavioral cases

Run the same source packet and tasks with and without the new skills, record model/settings, and have an independent reviewer compare anonymized outputs in shuffled order:

1. Teach a grade 4–5 science concept with necessary technical vocabulary and a worked application.
2. Teach a grade 11–12 disciplinary concept while retaining its uncertainties and source distinctions.
3. Adapt a grade 7–8 explanation while preserving an important condition, quantity and causal connection.
4. Produce two reading-demand variants with identical required claims and learning goal; include a temptation to delete an essential term or causal link.

Near misses cover a scholarly abstract, device-reset steps, a grade-1 decodable-reader request, a short notice, a non-English request and a poem. Assess routing separately from output quality. Include one target that conflicts with content/length and verify explicit unresolved reporting rather than endless revision.

Score each applicable dimension 0 absent/incorrect, 1 partial, 2 clear/correct: (a) goal and reader fit, (b) conceptual explanation and connections, (c) required meaning/qualifications, (d) necessary vocabulary support, (e) examples/practice/feedback, (f) age-respectful voice, (g) honest measurement and verification reporting. Mark genuinely inapplicable dimensions rather than awarding points. This is a maintainer rubric, not a validated learning scale.

For each task, require at least 80% of applicable points and no applicable dimension scored 0. Fabricated facts, lost required conditions/quantities, incorrect answer keys, altered uncertainty, or false claims of testing/certification fail regardless of total. The paired results must show a concrete benefit or preserve an already strong baseline; do not claim superiority from a score alone or ship extra instructions that systematically worsen outputs. Investigate failures before accepting the capability.

An educator review and intended-reader pilot are separate checks. A pilot should use matched content, counterbalanced variants, prior-knowledge information, comprehension and a new application task. Set sample/power requirements before making an efficacy claim. Until actually run, reports say “not learner-tested”; engineering and agent evaluations establish workflow behavior, not educational effectiveness.

## Delivery order and boundaries

The initial version for Approach A is 0.10.0. The two skills, shared contract, diagnostic, teaching form/guide and reference excerpts are packaged through the existing managed runtime. Update the plugin and run prose-setup before using the new form or reader diagnostics. Keep separate roadmap items so either capability can be assessed independently.

The [evaluation archive](../../research/2026-10-20-teaching-reading-level/README.md) records the paired tasks, strong control outputs, independent review and limitations. The informal comparison found both arms usable; it did not establish a prose-quality or learning advantage. Actual educator/learner testing and grade calibration remain unperformed. Included references distinguish a study-assessed CEFR example, standards-selected public-domain excerpts and new original demonstrations.

Deferred work includes multilingual/CEFR support, calibrated difficulty models, certified Lexile output, phonics-sequence/decodability validation, learner assessment, LMS integration and adaptive-course sequencing. These are distinct evidence and product problems, not implied by a grade-band input.
