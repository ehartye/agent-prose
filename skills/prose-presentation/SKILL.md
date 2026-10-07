---
name: prose-presentation
description: Plan and revise professional presentations with slide briefs, speaker notes and rehearsal plans. Use for executive decision decks, customer presentations, conference talks or training sessions; slide-file construction uses the available presentation tool.
when_to_use: Use when asked to plan a professional presentation, structure a slide deck, prepare an executive briefing or pitch, write slide-by-slide speaker notes, or rehearse a presentation. Standalone speeches use prose-speech; webinar production uses prose-webinar; formatting an existing slide file uses the presentation tool.
---
# prose-presentation

Create an authorable, deliverable presentation around what this audience needs to decide, understand or do. Keep supporting evidence and uncertainty visible. A polished outline alone does not establish a finished deck or a rehearsed delivery.

## Establish the brief

Read the supplied draft, sources and brand/template requirements. Establish audience and prior knowledge, occasion, desired outcome, total slot, discussion allocation, delivery mode and requested files. Infer routine choices and label assumptions; ask only for information that changes the argument or deliverable. When data is absent, draft a useful structure with explicit evidence gaps. Never invent customer results, quotes, financial returns or supporting citations.

Read [presentation craft and delivery](references/presentation-craft.md) when building the slide plan, reviewing evidence, budgeting narration or preparing rehearsal. Its slide record and decision/training patterns are conventions, not mandatory slide counts.

## Build the message and slide plan

For a decision meeting, state the exact approval, scope, owner and next gate early; distinguish the case for a test from evidence for full rollout. For training, state a task participants can perform and include a practice or comprehension check. For a customer or conference talk, connect the audience's problem to an evidenced explanation and useful next action.

Use one defensible message per substantive slide, with the evidence that supports it and the implication for this audience. Select charts, diagrams, screenshots or text for the actual claim. Preserve source, date, units, population and material limitations. Put backup analysis in an appendix or supporting document where compression would hide uncertainty. Adapt text support to the audience; do not enforce a universal words-per-slide or slides-per-minute rule.

Deliver an editable slide plan with stable slide ids and, for each slide, message, on-slide content, visual instructions, evidence/status, speaker notes, allotted time, transition and essential visual description. Make the opening, closing and decision or learning check concrete. Size the package to the request; a small edit does not need a new strategy document.

## Budget and rehearse

Subtract discussion, activities, demos, transitions and contingency from the event slot before budgeting scripted narration. Keep the slide plan and production notes separate from the text actually spoken. When writing a script, use the supported `speech-small`, `speech-large` or `speech-recorded` form described in the reference; there is no `presentation` form.

`prose` means `node "<plugin-root>/scripts/run-managed.js"`, with the root two directories above this file. If it returns `E_RUNTIME_MISSING`, use prose-setup. Run `prose lint <script.md>` and inspect `ok` and findings, then `prose measure <script.md>`. Report spoken words, rate, estimated narration duration and unresolved findings. If the CLI is unavailable, count only narration manually and disclose the method. This measures the script, not slide quality or total event duration.

Provide a timed rehearsal plan covering transitions, visual narration, audience questions and a deliberate overrun. Mark optional cuts in order; preserve the core evidence and closing ask. Record actual elapsed time and changes after a rehearsal when supplied or performed. Until then, identify timing and readiness as proposed or untested.

## Create and verify the requested files

When the user requests PowerPoint or Google Slides, use the available presentation skill/tool for file creation and its rendering checks. If unavailable, provide the editable slide plan and say the requested deck file remains outstanding. Do not claim a Markdown plan is a PowerPoint deck. Preserve the user's chosen tool and template.

Check source support, schedule arithmetic, readability at the delivery size, chart labels, contrast, reading order, meaningful image descriptions and accessible supporting materials. Describe essential visual information in the spoken notes. Check exported slides with the file tool when one was used; an accessibility checklist is not a conformance certification.

Hand over the requested files, evidence gaps, measured versus rehearsed timing, cut order and remaining readiness checks. Publishing or distributing the presentation follows the user's existing authorization.
