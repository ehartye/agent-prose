---
name: prose-speech
description: Write and check speeches with agent-prose - toasts, eulogies, keynotes, talks and remarks for small rooms, large halls or recordings - written for the ear and measured for spoken duration, sentence length and breath units against cited speechwriting rules.
when_to_use: Use when asked for a speech, toast, wedding or best-man speech, eulogy, keynote, talk, remarks, an address, a presentation script or a TED-style talk, or when prose lint reports spoken.* or length.target findings. YouTube and video narration is prose-script; jokes inside a speech can use prose-comedy.
---
# prose-speech

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.

## Craft guide

Craft guide: `prose guide speeches --text --section <name>` prints one section of the reference guide for
toasts, eulogies, keynotes and recorded addresses. Read the section you need, not all of it: `anatomy`
before writing a toast, eulogy, talk or recorded address, `length` for word budgets and the 130 wpm basis,
`failures` and `revise` when a draft is being fixed, `rules` for what lint checks. Run `prose guide` to list
every guide.

## Set up the file

Write `<name>.md` with frontmatter:

```md
---
form: speech-small      # speech-small | speech-large | speech-recorded
target: 5 minutes       # the length you were asked for
---
```

Lint times the spoken text at about 130 words per minute (speakers range roughly 115–175) and
warns when the draft is more than 10% off the target, saying how many words to cut or add.
Headings, `[bracketed cues]` and `<!-- notes -->` are not counted as speech.

**Budget before you write.** Spoken words = minutes × 130. A 5-minute toast is about 650 words
(585–715); a 2-minute toast about 260. Split the budget across the sections you plan and draft
to it — undershooting is as common as overshooting.

## Write for the ear

- Average 8–16 words per spoken sentence; split anything a speaker cannot say in one breath.
  Lint flags spoken sentences over 16 words and reports the longest breath unit.
- Use "we", contractions and plain, sayable words. Read each line for words the ear could
  mishear ("content" the adjective vs the noun).
- Build from specifics the person gave you. When you need a story or detail you were not given,
  write a visible placeholder — `[a time she put the ocean before herself]` — and tell the speaker
  real stories beat invented ones. Never invent anecdotes as if they were true.
- Avoid stock toast machinery: "may your life be as X as Y" closers, "A chef will tell you… a
  marine biologist will tell you…" pairs, reflexive lists of three, nervous-speaker openers. End
  on one specific image from the couple's or subject's own details.
- Structure: open with the person or the moment (not throat-clearing), build, land one idea, then
  the ask or the toast. A conclusion may restate the core idea; it should not just summarize.
- Contrast and three-part lines draw applause in big rooms — use one or two, deliberately.

## Delivery notes

Add short delivery notes where they help: pauses for laughter in a large room, where to look up
for direct lines, which line to slow down. Put each one in `[brackets]` on its own line so it is
not timed (a bracket inside a sentence is counted as speech and listed as a placeholder).

## Check, then report numbers

1. Run `prose lint <file>`. Fix every warning or say why it stays.
2. Work through the `judgement` list lint prints, if any.
3. Run `prose measure <file>` and report: spoken words, minutes at the planning rate, the longest
   breath unit, and how the draft compares to the target. If you suggest cuts, size them to the
   measured overage.

Never write "about 5 minutes" without the measurement that shows it. If the CLI cannot run in
this environment, count the spoken words section by section yourself, check the total against
the budget, and say the count was done by hand.

## Keep

Honest placeholders, direct address to each person being honored, practical delivery notes, a
clear arc.
