---
name: prose-reading-level
description: Assess grade-level suitability for one passage or a batch, with rubric ratings, evidence and proposed changes. Use for a passage selection panel, suggestion dispositions, or writing, adapting and comparing U.S. grades 4–12 prose, including an average U.S. high school freshman audience.
when_to_use: Use when asked to evaluate ten passages, jump between passage assessments, assess a passage against a reading rubric, suggest changes for specified reader proficiency, write for a school grade or reading profile, or compare step-down/step-up versions. Teaching also uses prose-teach; an abstract or procedure keeps its genre skill. Grade-one decodability and CEFR or Lexile certification need distinct support.
---
# prose-reading-level

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. On `E_RUNTIME_MISSING`, use prose-setup. Reader diagnostics require
the updated runtime; never report them as run when the installed CLI lacks this feature.

## Resolve the request without an unnecessary interview

“Write this for an average U.S. high school freshman” means a typical ninth-grade audience.
Use that as the starting profile, state any important topic-prerequisite assumption and write.
Do not translate it automatically into an exact Flesch-Kincaid score of 9. Preserve a teenage tone
and the intellectual goal. Age, school placement, reading demand and prior knowledge are distinct.

For evaluating a passage's reading suitability or giving reader-specific rubric ratings and changes, read
[the assessment reference](references/assessment.md). Assess before rewriting; an assessment request
leaves the source unchanged. Report six evidence-linked criteria, anchored support needs, a conditional
recommendation and prioritized proposals. These are editorial judgments, not a validated grade score.
Do not total or average them into grade placement. Save a report only when requested.

For multiple passages or a passage selection panel, read [the batch assessment workflow](references/assessment-batch.md)
as well. Assess each passage independently against the shared reader/task, then use `prose assessment`
to open the reports in the shared review workbench. A requested workbench authorizes its local snapshots;
ordinary inline assessments do not need files. The agent supplies judgments; the CLI validates and displays them.
The same workbench saves accepted/rejected/deferred dispositions and optional notes per suggestion.
Acceptance records intent; it does not apply an edit or change the assessment. Read saved decisions with
`prose assessment show` before proposing a follow-up revision.

Read [the adaptation reference](references/reading-level.md) before drafting or revising.
[Source-backed examples](../prose-teach/references/examples.md) show actual assessed material and
standards-selected text; use their stated purpose rather than copying a score or tone blindly.

When asked to compare grade-level versions, use the [source-and-adaptations workbench](references/comparison.md).
Prepare one to three separate adaptations, then let the owner read, edit and choose in the shared review UI.
The comparison records a choice without overwriting the source or adding a taste-model verdict.

## Preserve, adapt, review

1. For a rewrite, keep the original and identify required claims, quantities, conditions, uncertainty,
   citations and essential terms. For a new draft, take that inventory from the sources and task.
2. Adjust access to the ideas: familiar precise words, clear referents, manageable clauses,
   explicit connections and contextual definitions. Explain necessary terminology rather than deleting
   it to improve a score. Added explanation may be useful even when a formula score rises.
3. Review the candidate against the original inventory. Check that important questions still have
   correct, supported answers. Keep examples accurate and label any newly invented illustration.
4. Make at most two revision passes after the first draft, comparing each with the original.
   If content, length and the requested demand still conflict, report the specific conflict.

When saving Markdown, add `reader` metadata without changing the original form:

```yaml
reader:
  language: en-US
  schoolGrade: 9
  priorKnowledge: Typical ninth-grade audience; no specialist knowledge of this topic assumed.
  essentialTerms: [association, cause]
```

A numerical request may additionally set `readingLevel: {scale: us-grade, range: [6, 8]}`.
The supported U.S. grade range is 4–12. `target` remains the existing length/time target.
Use `target` for an approximate point length. For a word range or hard cap, keep the bounds in the
brief, omit `target` from new draft metadata, and check the requested body text separately. Ranges
are not valid target syntax; scalar target tolerance does not enforce a range or maximum.
Non-English profiles can be described, but this release does not supply their reading-grade estimates.
For inline responses, use the brief without creating an unsolicited file.

## Check and report honestly

For a saved draft run `prose measure <file>` and `prose lint <file>`. The opt-in `readability`
report names its method, paragraph scope and unavailable reasons. A short draft may have no estimate.
The legacy style grade can differ because it measures a different text view; do not mix the two.

Deliver the requested prose, followed by a short note stating the audience assumption, any unresolved
preservation issue, actual checks run, and verification limits. Distinguish drafting-agent review,
independent review, educator review and intended-reader testing. Do not claim a grade certification
or learner test. Informational grade comparisons and term matches never replace meaning review.
