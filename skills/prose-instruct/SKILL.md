---
name: prose-instruct
description: Write and check user instructions with agent-prose - how-to procedures, setup and reset steps, troubleshooting, help articles and technical docs - checked for imperative steps, one action per step, recovery paths, filler words and sentence length against Google, Microsoft and plain-language guidance.
when_to_use: Use when asked to write user instructions, a how-to, setup or reset steps, a troubleshooting guide, a help or support article, onboarding steps or technical documentation, or when prose lint reports procedure.* findings. Short interface microcopy (button labels, toasts, empty states) is design:ux-copy; academic or business prose is prose-formal.
---
# prose-instruct

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.

## Set up the file

Write `<name>.md` with frontmatter `form: instructions` (task steps) or `form: tech-doc`
(reference and explanation). Steps are a numbered list; a single step is a bullet.

## Write

- Title the task: "How to reset the thermostat's Wi-Fi", not "Wi-Fi reset" or "Resetting Wi-Fi".
- Start with prerequisites and the goal in one or two sentences.
- One action per step. Lead with the verb, or with a short location then the verb:
  "On the thermostat, press and hold the button for 10 seconds."
- State what the user sees after any step that changes the screen or the device:
  "The light blinks blue."
- No "please", "simply", "just", "easy" or "quickly" — they add nothing or blame the reader.
- Write menu paths as words or with `>`, but know screen readers may skip `>`.

## Every failure has a way back in

The baseline drafts were clean on the happy path and silent at the edges. For each failure state:

- Say what the user sees, why it happens, and **exactly where to resume** ("Go back to step 4"
  or "Start again from step 1").
- Cover "nothing happens": no light, no screen change, no confirmation. Give a time limit
  ("If the light does not turn green within 2 minutes…") or a visible `[time]` placeholder when
  you do not know it — never invent one.
- If a step can be skipped or is optional, say so at the start of the step: "Optional: …".

## Check, then report

1. Run `prose lint <file>`. Fix errors and warnings (step openings, filler, long sentences).
2. Work through the `judgement` list — `procedure.recovery` is the one the CLI cannot check.
3. Report the step count, the failure states you covered, and any `[placeholders]` the owner
   still has to fill.

## Keep

Prerequisites first, location before action, imperative steps, error cases set apart so they
can be scanned.
