---
name: prose-script
description: Write and check scripts with agent-prose - multi-camera and single-camera sitcom, TV drama and stage play in Fountain, and YouTube scripts in Markdown with timestamped segments - measured for pages, runtime, per-segment pace and format conventions against cited rules.
when_to_use: Use when asked for a sitcom, TV pilot, teleplay, cold open, teaser, scene, screenplay, stage play, sketch, or a YouTube or video script, intro, hook or narration, or when prose lint reports script.* or youtube.* findings. Punching up jokes is prose-comedy; game dialogue trees are prose-dialog; spoken speeches are prose-speech.
---
# prose-script

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.

## Craft guide

Craft guide: `prose guide screen-stage --text --section <name>` prints one section of the reference guide for
multi-camera and single-camera sitcoms, TV drama and stage plays. Read the section you need, not all of it:
`anatomy` before formatting a script or choosing a form, `length` before promising a runtime, `good` for worked
examples, `failures` and `revise` when a draft is being fixed, `rules` for what lint checks. Run `prose guide`
to list every guide.

## Pick the form first

| Request | File | Form |
|---|---|---|
| Multi-camera sitcom (studio audience, "multi-cam") | `.fountain` | `sitcom-multicam` |
| Single-camera comedy | `.fountain` | `sitcom-singlecam` |
| Hour drama, teleplay, feature scene | `.fountain` | `tv-drama` |
| Stage play | `.fountain` | `stage-play` |
| YouTube / video script | `.md` | `youtube` |

Declare it in the file (`Form:` on the Fountain title page, `form:` in Markdown frontmatter) and
declare the length you were given (`Target: 3 pages`, `target: 60 seconds`). Lint compares the
draft to that target; never estimate length yourself.

Read the matching reference before writing:
[references/screen-and-stage.md](references/screen-and-stage.md) for Fountain, multi-cam and stage
conventions; [references/youtube.md](references/youtube.md) for segments, hooks and pace.

## Screen and stage

- Multi-cam is its own format: action in ALL CAPS, dialogue double-spaced in print, lettered
  scenes, act markers as centered lines (`>COLD OPEN<`). `#` sections do not print.
- Fit the slot: a multi-cam cold open runs about 2–5 pages; single-cam acts and hour-drama acts
  have their own norms in the reference. Trim to the target, then re-lint.
- Every joke grows from the scene's comic premise and never contradicts its facts; cut tangent
  jokes. Keep runners and callbacks that pay off.
- Stop joking when a scene turns genuinely serious; a joke that stays keeps the pain visible.
- Fill the title page with real keys (`Title`, `Credit`, `Author`, `Draft date`, `Form`,
  `Target`); never leave `[Writer]` placeholders in a finished draft.

## YouTube

Craft guide: `prose guide youtube --text --section <name>` prints one section of the reference guide for YouTube
scripts. Read the section you need, not all of it: `anatomy` before writing a script, `length` for pace and
`youtube.segment.pace`, `failures` and `revise` when a draft is being fixed, `rules` for what lint checks.

- Write timestamped segments (`## 0:00–0:08`). Keep `VISUAL:` / `B-ROLL:` lines separate from
  spoken lines; prefix narration with `VO:` if it helps.
- The first 30 seconds confirm the title and thumbnail promise; deliver the first real payoff
  inside that window. Cut or shorten title cards.
- Budget each segment before writing it: words ≈ seconds × 2.5–2.7 (150–160 wpm; lint plans at 160), ±15%. A 60-second
  script carries about 140–165 spoken words; a 10-second segment about 25. Lint warns above
  180 wpm, but a script far under budget also wastes the viewer's time on silence.
- Spoken sentences stay short — one idea each.
- Open on the viewer's misconception when explaining; end the window on a forward question,
  not a re-promise of what you just covered.

## When the owner will choose between rewrites

Write the brief first (prose-review): the character is how the speaker talks and what they want in
the scene; the context is the scene and who is listening. A speaker with a voice bible can supply the character: `--character <voice-id>`
(prose-voice). Confirm it with the owner before
`prose set new ... --brief-confirmed`.
For many lines to judge in one sitting, use the prose-review-batch skill.

## Check, then report numbers

1. Run `prose lint <file>`. Fix errors; fix each warning or say why it stays.
2. Work through the `judgement` list lint prints, one rule at a time.
3. Run `prose measure <file>` and report the measured figures: pages and minutes with their
   range for scripts; total seconds and each segment's words-per-minute for YouTube.

Never claim a runtime, page count or pace you did not measure. If the CLI cannot run in this
environment, count each segment's spoken words by hand against its budget and say so.
