# Professional webinar and presentation skills

## Problem and scope

The existing speech skill measures scripts and gives delivery advice. The installed presentation tool builds slide files. Neither owns the complete planning package for a professional presentation or the production package for a webinar. Add `prose-presentation` and `prose-webinar` to agent-prose, reusing speech measurements and the user's available slide tools. Ship release 0.9.0 and update its marketplace entry.

## Design

`prose-presentation` owns audience outcome, evidence-backed message, slide-by-slide authoring briefs, speaker notes, decision or learning checks, accessibility and rehearsal. `prose-webinar` owns session format, timed run sheet, host/moderator/presenter responsibilities, interaction, demo recovery and follow-up. A webinar needing slides uses the presentation reference for the deck component; a standalone spoken script continues to use `prose-speech`. A request to edit an existing slide file uses the available presentation tool without automatically rebuilding its content plan.

Each entrypoint stays under the existing 150-line limit. Conditional detail lives in one directly linked reference per skill. References distinguish source-supported guidance, platform-specific behavior and maintainer conventions. Neither skill requires a new runtime command, form, diagram schema, deck renderer, or webinar service integration.

Outputs are editable Markdown planning documents and separate speech-form script files when narration is requested. Run sheets and slide tables are not spoken scripts. Script targets budget only planned spoken minutes; demos, polls, Q&A and contingency consume separate event time. Runtime word-rate estimates never certify total event duration or accessibility. A full timed rehearsal checks the schedule, cut order, transitions and recovery.

## Evidence before implementation

The baseline customer-webinar package rejects the unsupported 30% claim and includes a timed run sheet and demo fallback. The baseline executive presentation separates waiting time from cash savings and specifies a bounded pilot. Preserve those strengths. The webinar output omits captions and accessible activity/material alternatives, recording readiness and post-event reporting definitions. The presentation output omits a rehearsal/cut plan and per-slide accessible visual descriptions. These observed omissions justify the narrow operational instructions; they do not establish that a generic agent is bad at presentation writing.

## Acceptance and verification

- Both skills appear in the skill inventory, README and plugin description and are included with their linked resources in managed installation.
- Existing speech routing distinguishes full decks/webinars from standalone presentation scripts.
- Examples use supported speech frontmatter and exclude speaker labels and production notes from measured speech. Parse and measure the actual documented examples.
- Two realistic tasks are run with and without the skills in the same evaluation round. An independent reviewer compares artifacts against the fixed rubric below, without trusting the writer's self-assessment.
- Near misses cover wedding toasts, YouTube scripts, a slide-file formatting edit and a tagline. Report discovery coverage separately from output quality.
- All repository tests, TypeScript checks and reference freshness checks pass. Ubuntu and Windows PR CI pass before squash merge.
- Release versions agree across package, lockfile and plugin manifests; the release tag resolves to the merged commit. An isolated managed setup contains both skills and runs the documented measurement commands. The shared marketplace entry advertises 0.9.0 after its own reviewed PR is merged.

## Fixed behavioral rubric

For the customer webinar: (1) schedule sums to 45 minutes with protected close and Q&A; (2) named production responsibilities and backstage-to-live checks; (3) demo failure trigger, fallback, owner and audience wording; (4) accessible materials, captions, visual narration and interaction alternatives; (5) unsupported claims stay visibly unresolved; (6) follow-up artifacts and metrics identify denominator/window; (7) rehearsal, cut order and readiness distinguish checked from proposed.

For the executive presentation: (1) a specific bounded approval ask; (2) per-slide message, evidence status, visual and presenter notes; (3) 12-minute budget separates narration, discussion and decision; (4) finance can distinguish measured operational value from unproved savings; (5) accessible visuals/materials; (6) timed rehearsal, cut order and hard stop; (7) unresolved inputs and actual validation status are explicit.

Score each item 0 absent, 1 partial, 2 actionable. No fabricated data or implied platform actions are allowed regardless of total score. This small evaluation is evidence about these tasks, not proof of universal skill benefit or live-event readiness.

## Alternatives and tradeoffs

Extending only `prose-speech` takes less implementation time but conflates script timing with slide and event production; later routing and maintenance become harder. A new deck/webinar runtime would take substantially longer, introduce platform/API risk and duplicate existing tools. Two small skills with references fit the current plugin architecture and make production omissions reviewable, at the cost of maintaining two additional metadata entries and periodically rechecking platform sources.
