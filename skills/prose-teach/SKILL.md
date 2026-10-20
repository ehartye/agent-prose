---
name: prose-teach
description: Write textbook lessons, chapters and educational explanations for declared learners, including U.S. grades 4–12. Use for textbook voice, teaching a concept, or explaining how and why something works with examples and practice.
when_to_use: Use when asked to write a textbook chapter, lesson or educational explanation, teach a concept, or turn scholarly material into instructional prose. Procedures and task documentation use prose-instruct; research reporting uses prose-formal. A reading-level rewrite without a teaching task uses prose-reading-level.
---
# prose-teach

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. On `E_RUNTIME_MISSING`, use prose-setup. If the CLI does not list
`textbook` in capabilities, install the runtime from this updated plugin before claiming its checks ran.

## Establish the learner and goal

Treat “an average U.S. high school freshman” as a usable brief: a typical ninth-grade audience,
with topic prerequisites stated as assumptions. Do not require the user to supply a numeric score.
Use prose-reading-level when language adaptation is requested; school grade and text-level targets
are separate. Keep disciplinary precision and intellectual ambition appropriate to the learning goal.

Read `prose guide teaching-prose --text --section anatomy` before drafting a lesson or chapter;
use `failures` or `revise` for an existing draft. The guide distinguishes research from conventions.
[Reference excerpts](references/examples.md) contain actual research material and standards-selected
texts with attribution and evidence limits. Read the relevant example when a model text is useful.

## Draft to teach

1. Name what the learner should be able to explain or do, and the source material that supports it.
   If evidence is missing, disclose it; do not invent experiments, numbers, citations or certainty.
2. Build the needed prerequisite bridge. Define essential terms near their first meaningful use,
   connect causes and consequences, and explain why the example or worked step demonstrates the idea.
3. Choose supports for the unit: a short explanation can be brief; a lesson or chapter normally
   needs orientation, an example, appropriate practice with correct feedback, and a useful recap.
   Keep the answer separate from the initial attempt. Do not impose every device on every paragraph.
4. Preserve qualifiers and disciplinary distinctions. When teaching a scholarly source, distinguish
   its claims from the teaching commentary. Learner address is optional; avoid condescension and filler.

For a saved Markdown draft use `form: textbook`, plus:

```yaml
teaching:
  unit: lesson
  goals: [Explain why diffusion has net movement down a concentration gradient.]
  prerequisites: [Particles move randomly.]
reader:
  language: en-US
  schoolGrade: 9
```

`unit` is `explanation`, `lesson` or `chapter`; goals are required. Add a `readingLevel` only when
the user explicitly requests a numerical text-level band. Existing `target` still means length/time.
Use `target` for an approximate point length. For a word range or hard cap, keep the bounds in the
brief, omit `target` from new draft metadata, and check the requested body text separately. Ranges
are not valid target syntax; scalar target tolerance does not enforce a range or maximum.
For an inline answer, use the same brief without creating an unsolicited document.

## Verify what was taught

- Run `prose lint <file>` and `prose measure <file>` for saved drafts. Fix actual errors; grade
  position and term-presence observations are information, not proof of suitability or correctness.
- Review the goal against the explanation, prerequisites, example and practice. Check the answer key
  against the supplied sources. Lint lists these judgement checks; it does not perform them.
- Report unresolved source/reader assumptions and who reviewed the work. Distinguish your content
  review from an educator review or intended-reader test. State when learner testing was not performed.

Keep the reader-facing lesson prominent. Put authoring diagnostics in a short separate note.
