---
name: prose-voice
description: Define and keep character, brand and speaker voices with agent-prose - voice bibles (prose/voice@1) with samples, banned words and measured style ranges, fitted from existing lines and checked by prose lint wherever the speaker has attributed lines (Fountain scenes and dialog YAML).
when_to_use: Use when asked to write lines in a character's voice, extend an NPC or character's dialogue, make characters sound distinct, create a voice or style guide for a character, brand or narrator, or when someone says a line "doesn't sound like" a character, or when prose lint reports voice.* findings. Dialogue trees and barks are prose-dialog; scripts are prose-script.
---
# prose-voice

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.

## Voice guide first, lines second

Before writing new lines for a character, write (or load) their voice bible — even three lines
of samples are enough to start. The schema and a worked example are in
[references/voice-bible.md](references/voice-bible.md).

1. `prose init` once per project (creates `.agent-prose/`). `prose voice list` shows bibles.
2. If the character already has lines in a draft, fit a bible from them:
   `prose voice fit <draft> --speaker GRIMBLE --id grimble`. It records samples and measured
   ranges (sentence length, contractions, hedges, exclamations).
3. Edit the bible by hand: `register`, a one-paragraph `description` that names the character's
   motive and conversational habit (pushy, flighty, reticent, transactional), five signature
   words or phrases, and `banned` words the character would never use.

## Write in the voice

- Vary the sentence shape. A signature rhythm (setup → twist) is a seasoning, not a template:
  keep any single pattern to about a third of the lines.
- A rival or foil needs an edge expressed in their own voice — a motive, a grudge, a
  vocabulary — not just the opposite temperament. Ration exclamation marks.
- Avoid genre stock ("dear heart" elves, skeleton creditors, "you break it, you bought it").
- Swap test: no line could be given to another character without anyone noticing.
- If the lines will be subtitled in a game, they must still fit the text box (default 40 characters × 2
  lines by default) — check with prose-dialog's lint.

## Check, then report

1. Put the lines in a draft with speaker attribution — a `.dialog.yaml` (one node per line, or a bark pool) or a Fountain scene. Markdown has no speakers, so lines in a Markdown list are not checked; a brand voice in Markdown prose is checked by the judgement rules only. Run
   `prose lint <draft>`. `voice.targets` flags lines whose measured style
   leaves the bible's ranges; `voice.banned` flags banned words; `voice.unvoiced` lists speakers
   with no bible.
2. Work through the `voice.distinct` judgement (the swap test).
3. Report which bible each speaker matched, any out-of-range measures, and what you changed.
