---
name: prose-reading-level
description: Draft or adapt prose for U.S. grades 4–12 or a specified reader profile, including an average U.S. high school freshman or ninth grader. Use for grade-level writing and reading-level rewrites while preserving meaning.
when_to_use: Use when asked to write for a school grade, average U.S. high school freshman, reading level or specified reader proficiency, or adapt language for those readers. Teaching a lesson also uses prose-teach. An academic abstract or procedure keeps its existing genre skill; grade-one decodability and CEFR or Lexile certification need distinct support.
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

Read [the adaptation reference](references/reading-level.md) before drafting or revising.
[Source-backed examples](../prose-teach/references/examples.md) show actual assessed material and
standards-selected text; use their stated purpose rather than copying a score or tone blindly.

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
