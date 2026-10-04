---
name: prose-dialog
description: Write and check game dialogue with agent-prose - quest-giver conversations, branching choices, NPC barks and ambient lines as a prose/dialog@1 YAML graph that the prose CLI checks for dead ends, unreachable nodes, missing fallbacks, trapped loops, repeat visits without variants, text-box overflow and bark variety.
when_to_use: Use when asked for quest dialogue, NPC lines, a quest giver, barks, idle or ambient chatter, a dialogue tree, branching conversation or dialogue choices for a game, or when prose lint reports dialog.* findings. Keeping a character's voice consistent is prose-voice; cutscenes written as screenplays are prose-script.
---
# prose-dialog

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.

## Write a graph, not a transcript

Deliver `<name>.dialog.yaml` in the `prose/dialog@1` format. The engine loads it; the CLI checks it.
Read [references/dialog-format.md](references/dialog-format.md) before writing your first one: it has
the schema, a complete example, and how to map it to Ink or Yarn if the project uses those.

Every node has an `id`, a `speaker` and a `text`. A node continues (`next`), branches (`choices`),
or ends (`end: true`). Lines a player can hear twice get `variants`. Lines a translator needs
context for get a `comment`.

## Craft guide

Craft guide: `prose guide game-dialogue --text --section <name>` prints one section of the reference guide
for quest dialogue, conversations and barks. Read the section you need, not all of it: `anatomy` before
designing a conversation or a bark pool, `failures` and `revise` when a draft is being fixed, `rules` for
what lint checks. Run `prose guide` to list every guide.

## Before writing

1. **List the states the conversation can open in** — quest not started, offered, refused, active,
   complete, failed — including states other systems test (a bark that checks
   `state != complete` means `complete` is reachable). Every state needs an entry path, and the
   entry needs an unconditional fallback.
2. **Get the text box.** The default check is 40 characters × 2 lines. If the game's box differs, run `prose init` and set `forms.<form>.boxChars` and `boxLines` in `.agent-prose/project.json` (form = `quest-dialog`, `barks` or `conversation`) so lint
   measures against the real box.
3. **Write the brief if the owner will choose between rewrites** (prose-review). Character: how this
   speaker talks (register, habits, what they want from the player), in a sentence or two. Context: the
   trigger, the box size and how often it is heard (a bark heard every few seconds, a one-time quest line).
   If the speaker has a voice bible with a `bio`, `--character <voice-id>` uses it (prose-voice). Confirm both with the owner before `prose set new ... --brief-confirmed`.
4. **Decide what each revisit says.** Refusing, returning mid-quest and coming back after a
   refusal are revisits: each gets two or more `variants` so the NPC is not implausibly patient.

## Write

- Choice text predicts what the player character actually says (no paraphrase surprises).
- Break long lines at phrase boundaries, never between a preposition and its object.
- Keep exposition in one place; never have two characters recap the same events.
- Barks: per context, order lines from most specific condition to least, end with one general
  fallback, and make at least half of them react to game state (quest stage, time, player action),
  not just proximity. Two lines in a pool must differ in more than a word or two.
- Conditions are free-text strings for the engine; the format has no key for setting variables, so describe state changes in a node's `comment` and make sure every flag a condition tests is set somewhere in the game.

For many lines to judge at once, use the prose-review-batch skill.

## Check, then report numbers

1. Run `prose lint <file>`. Fix every error. Fix each warning or say why it stays.
2. Work through the `judgement` list lint prints, one rule at a time.
3. Run `prose measure <file>` and report: nodes, choices, bark pools, the longest line in
   characters against the box, and total recorded voice-over in minutes.

Never write "every line fits" or "all branches connect" without the lint run that shows it. If
the CLI cannot run in this environment, check by hand — count each line's characters against the
box, and walk every state from the entry to an `end` — and say the check was manual.

## Keep

Terse, specific lines; stakes that escalate inside a haggle; conditions kept in data.
