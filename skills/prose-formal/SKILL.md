---
name: prose-formal
description: Write and check academic and professional prose with agent-prose - abstracts, papers, reports, proposals, memos and professional email - with the main result first, only supported claims, explicit numbers or placeholders, and checks for sentence length, promotional words and AI-tell vocabulary.
when_to_use: Use when asked for an abstract, paper section, research summary, report, executive summary, proposal, memo, briefing, cover letter or professional email, or when prose lint reports formal.*, ai.* or style.* findings on a professional or academic draft. User instructions are prose-instruct; speeches are prose-speech. Asking whether text sounds like AI, or to rewrite it to sound less like AI, is prose-audit.
---
# prose-formal

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.

## Set up the file

Write `<name>.md` with frontmatter `form: academic` or `form: professional`, plus
`target: 200 words` (or whatever length you were given) so lint checks it.

## Lead with the result

Put the main result, finding or request in the first or second sentence. Background gets one
sentence at most before it. Readers who stop early still get the point.

## Claim only what the data supports

- Report the numbers you were given, with units and the comparison ("build cost fell 38% over
  six months across 1,200 repositories").
- When a value you need was not given — a before/after rate, a sample size, a confidence
  interval — write a visible placeholder (`flake rate [X%] → [Y%]`) and list the placeholders in
  your reply. Never smooth over a missing number with "no measurable change" unless that is what
  you were told.
- Do not generalize past the sample, and do not promise sections, analyses or results the author
  did not mention. In particular, do not close an abstract with "We describe…", "We report…" or
  "We discuss…" unless the author listed those parts of the paper; end on the result or its
  implication instead.
- Prefer plain claims to promotional ones: no "groundbreaking", "substantial", "pivotal",
  "renowned", "low-risk" without evidence.

## Sentences

- Keep sentences under about 25 words; experts read 15–20-word sentences fastest too.
- Put the subject and verb early and close together; old information first, new information last.
- Active voice where the actor matters; passive is fine when it does not. Lint reports passive,
  it does not ban it.
- Define a term inline the first time ("flake rate, the share of failures that do not reproduce").

## Check, then report

1. Run `prose lint <file>`. Fix errors and warnings; AI-tell findings are style notes, never a
   verdict on who wrote the text — fix the word, do not argue about authorship.
2. Work through the `judgement` list (`formal.bluf`, `formal.supported-claims`).
3. Report the measured word count against the target and every `[placeholder]` still to fill.
   If the CLI cannot run in this environment, count the words yourself and say so.

## Keep

Inline definitions, "we" as the subject, an explicit research question, close adherence to the
requested length.
