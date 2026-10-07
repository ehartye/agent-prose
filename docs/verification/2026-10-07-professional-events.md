# Professional event skills verification

## Repository and installation

Baseline: 133 test files passed, 2,593 tests passed, two skipped. Release changes: 134 files passed, 2,599 tests passed, two existing skips, using `npm test -- --maxWorkers=4`. TypeScript and generated reference/guide checks passed. Inventory, metadata, reference resolution and packaged narration examples pass focused integration checks. Both examples lint without errors or warnings and measure only spoken text: 26 words/0.2 minutes and 27 words/0.21 minutes at 130 wpm.

An isolated managed installation reported plugin and CLI version 0.9.0, packaged both skill entrypoints/references and ran both examples through the checked launcher. The runtime fingerprint covers source, so it changes after reference edits; the final installed source is checked again before release handoff.

## Behavioral comparison

Two fresh agents received the same customer-webinar and executive-presentation prompts in the same round. A used general knowledge; B read only the relevant new skill and its directly linked references. Neither was given the rubric or expected answer. Separate reviewers read each output pair without the skill files or A/B instruction mapping and used the fixed design rubric. This is a small, qualitative evaluation of these tasks, not a statistically established universal improvement or a real production rehearsal.

| Deliverable | Without skill (A) | With skill (B) | Practical difference |
|---|---:|---:|---|
| 45-minute customer webinar | 10/14 | 14/14 | Explicit backstage/live checks, accessible participation, metric definitions, cut order and readiness evidence |
| 12-minute executive presentation | 12/14 | 14/14 | More complete visual/material accessibility and explicit validation status |

Both versions kept the unsupported 30% claim and missing financial data unresolved; no fabrication or claimed platform-action override occurred. The control outputs were already strong on evidence and bounded pilots. The skilled webinar was about 61% longer by the reviewer's whitespace-token count. The presentation control reserved more discussion time. Full rubric coverage does not mean every deliverable detail was flawless.

Concrete webinar findings: the initial skilled package proposed a roughly three-minute backup within a demo slot that could fail late; its cut list referenced an unauthored second example, and it lacked substantive seed questions for an empty Q&A queue. The reference now specifies a short late-slot fallback, cuts tied to supplied material, prepared seed questions and compact live cues. A focused forward test at 25:30 in a slot ending 27:00 skips the three-minute recording, assigns screenshot sharing and narration over 90 seconds, discloses the fallback and missing performance evidence, and preserves the next segment and hard stop. The original paired scores remain unchanged; the forward test is separate evidence.

A metadata-only routing check covered eight prompts: wedding toast, YouTube tutorial, formatting an existing PowerPoint, tagline alternatives, board-decision plan, webinar run sheet, standalone keynote and customer PowerPoint creation. The new skills handled planning and production, supported file creation when needed and did not capture the near misses. This checks selection from frontmatter; it is not an automated end-to-end trigger test in an installed agent host.

## Review and limits

Independent implementation review found no critical or major blockers and verified that the shared marketplace change touches only agent-prose's version and description. It found that bracketed stage directions require blank-line paragraph separation; both references now state this correctly. The shipped examples already used that formatting.

The first PR commit passed Ubuntu and Windows CI. Final-head CI, merge, tag and marketplace publication are verified through the release workflow. Actual PowerPoint/Google Slides export, live platform configuration, captions, rehearsal, customer data and distribution were not part of these simulated planning tasks and are not claimed as tested.

Full paired outputs, independent reviews, routing output and the late-demo result are retained in the release's `professional-events-evaluation.zip` artifact. The source research and original pre-authoring baseline remain in the repository.
