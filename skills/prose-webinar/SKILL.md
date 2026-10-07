---
name: prose-webinar
description: Plan and revise professional webinars with timed run sheets, presenter and moderator cues, audience interaction, demo recovery and follow-up. Use for customer, training, thought-leadership or panel webinars and production-readiness reviews.
when_to_use: Use when asked to create a professional webinar, prepare a webinar production package or run of show, script a moderator, plan webinar polls and Q&A, or rehearse webinar demos and recovery. Slide content uses prose-presentation; standalone recorded narration uses prose-script or prose-speech.
---
# prose-webinar

Build a webinar package the production team can execute. Distinguish written assets, tested controls and an actually rehearsed session; none implies the event has been scheduled, broadcast or distributed.

## Brief and format

Read the supplied source material. Establish audience, useful outcome, live/on-demand/panel format, total slot, presenter team, platform if known, recording intent and requested deliverables. Carry explicit evidence gaps rather than inventing claims or customer stories. Infer reasonable planning choices and label them; ask only for missing information that changes the package.

Read [production, interaction and recovery](references/webinar-production.md) when authoring the run sheet, roles, rehearsal, live-demo fallback or follow-up. Check current official platform documentation before specifying actual controls or account permissions. A platform-independent plan can remain useful without choosing a service for the user.

## Prepare the production package

Supply editable files or clearly separated sections for the audience promise, timed run sheet, team responsibilities, presenter/moderator cues, interaction and Q&A plan, recovery, rehearsal and follow-up. Include promotional or registration copy only when requested. For slides, use prose-presentation's authoring record; for an actual deck file, use the available presentation tool.

Each run-sheet row identifies elapsed start/end, owner, content/asset, audience action, private cue and recovery or cut. Add the rows and check they fit the total slot. Reserve time for questions and the close; budget loading, handoffs, activities and contingency separately from scripted narration. A two-person team can combine roles, but show who runs controls and timing while the presenter speaks.

For each interaction, state its purpose, exact prompt, owner, allotted response time, accessible alternative, debrief and no-response fallback. The moderator triages questions, reads them aloud, protects privacy/anonymity promises and records unanswered items with a follow-up owner. A panel needs introductions, directed questions, handoffs and an equitable time plan.

## Recovery and rehearsal

For a live demo, define the scenario, prepared state, expected visible result and backup assets. Agree a failure trigger, who calls the switch, audience wording and a hard stop. Include an abbreviated fallback for a failure near the slot's end. A screenshot or recorded fallback must be labeled and explain the same point; do not present it as a live result. Preserve Q&A and the closing action by cutting optional material.

Assign ownership for presenter permissions, attendee view, captions/interpreting, audio/video, screen sharing, media sound, recording, live transition and links. Test the backup person's actual permissions. Practice mode may record; confirm recording state and avoid exposing rehearsal material. Rehearse the full schedule and force a demo/share/connection failure. Record actual times and outstanding checks. Mark an unperformed test as untested.

## Narration and completion

Keep production tables and speaker labels out of narration files. For requested scripts, use supported speech forms and the formatting example in the reference. `prose` means `node "<plugin-root>/scripts/run-managed.js"`, with the root two directories above this file. On `E_RUNTIME_MISSING`, use prose-setup.

Run `prose lint <script.md>` and inspect `ok` and findings; run `prose measure <script.md>` and report words, rate and estimated narration duration. If unavailable, manually count only spoken text and disclose that limitation. Neither CLI exit status nor a word-rate estimate verifies a complete webinar schedule.

Provide accessible materials directly, describe essential visuals, test captions and offer equivalent participation when a poll or chat is inaccessible. Review recording/transcript accessibility before proposed distribution. Define post-event measures with numerator, denominator, time window and exclusions; distinguish participation from learning or business impact.

Hand over assets and a readiness list showing what was drafted, measured, checked and rehearsed, with unresolved evidence and configuration. Draft follow-up resources and replies when requested. Creating invitations, sending messages, changing platform settings, starting a broadcast or publishing recordings follows the user's actual authorization and available tools.
