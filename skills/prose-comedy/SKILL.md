---
name: prose-comedy
description: Write and punch up comedy with agent-prose - jokes, alternate lines, punch-up passes and comic scenes in any form - built from the scene's premise, with each option using a distinct comic mechanism, checked against benign-violation and comic-craft guidance rather than stock material.
when_to_use: Use when asked to punch up a line or scene, make something funnier, write jokes, alts, one-liners, a comic bit, banter or a funny toast line, or when lint lists comedy.* judgement rules. Formatting a whole sitcom script is prose-script; character voice consistency is prose-voice.
---
# prose-comedy

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.

Language models are measurably better at judging and editing humor than at generating it, and
left alone they converge on a few stock jokes. So: generate wide, then select hard.

## 1. Pin the premise

Write down the facts the joke must respect before writing any joke: who, what just happened,
what the speaker wants, what is at stake. ("Dana was dumped last night. Theo ate the last slice.
He is asleep.") Every option must be true to these facts — no "eight slices" when it was the
last slice, no "left me on read" when she was dumped.

## 2. Generate about three times what was asked

Draw each candidate from a different mechanism, and name it:

| Mechanism | Shape |
|---|---|
| Understatement | the reaction is far smaller than the event |
| Misdirect | the line sets up one meaning and lands another |
| Avoidance / subtext | the character pointedly does not say the real thing |
| Escalation | each beat raises the stakes of the last |
| Specificity | one exact, surprising detail does the work |
| Callback | pays off something set up earlier |
| Physical / action | the joke is what the character does |
| Status flip | the weaker party wins the exchange |

## 3. Select

- Drop any candidate that is stock (a familiar trope you could find in a thousand scripts —
  "even the pizza is more committed than him", the skeleton creditor, the nervous-speaker
  opener).
- Drop any two that share an angle; the final set must use different mechanisms.
- Check each survivor for a real violation that still reads as harmless (benign violation):
  too safe is not funny, too cruel stops being funny.
- When a scene is genuinely painful, prefer jokes that keep the pain visible — a coping line
  that fails, bitter self-deprecation, an attempt to appease — or no joke at all.
- Spoken punchlines are short: aim for about 12 words or fewer unless the length is the joke.
  Hard "button" jokes put the funniest word last; naturalistic "thrown-away" lines can run past it.

## 4. Deliver

For each option give the line, its mechanism, and its register (hard button or thrown away).
If the jokes live in a script file, run `prose lint <file>` and work through the
judgement rules it lists (`comedy.premise` on sitcom forms, `comedy.serious-moments` on sitcom, drama and stage forms).

## Keep

Staging that sells the line ("to the sleeping Theo, deadly calm"), jokes that come from
character, the funniest word last on hard buttons.
