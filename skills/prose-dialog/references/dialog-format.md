# prose/dialog@1

A dialogue file is YAML with the extension `.dialog.yaml` (any `.yaml` / `.yml` is read as dialog).

## Schema

| Key | Type | Meaning |
|---|---|---|
| `form` | `quest-dialog` \| `barks` \| `conversation` | Picks the rules and the text box (40×2 by default; override per form in `.agent-prose/project.json`). Default `conversation`. |
| `wpm` | number | Optional speaking rate for the voice-over estimate (default 150). |
| `register` | string | Optional register label. |
| `target` | `"90 seconds"`, `"300 words"` or `{minutes: 2}` | Optional length target; lint warns outside ±10%. |
| `start` | node id | First node. Defaults to the first node in the file. |
| `nodes[]` | list | Conversation nodes (below). |
| `barks[]` | list | Ambient line pools (below). |

Node:

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | Unique id. |
| `speaker` | yes | Character name; matches voice bibles case-insensitively. |
| `text` | yes | The line. |
| `variants` | no | Alternate lines rotated on repeat visits. |
| `comment` | no | Context for translators and voice actors. |
| `choices[]` | no | `{text, to, condition?, menu?, comment?}` — `text` is what the player says; `menu` is shorter menu text if different. |
| `next` | no | Node to continue to without a choice. |
| `end` | no | `true` when the conversation ends here. |

Bark pool: `{pool, speaker, context, cooldown?, lines[]}`.

## What lint checks

| Rule | Fires when |
|---|---|
| `dialog.graph.dangling` (error) | a `to`, `next` or `start` names a missing node, or two nodes share an id |
| `dialog.graph.dead-end` (error) | a node has no choices, no `next` and no `end` |
| `dialog.graph.unreachable` | a node cannot be reached from `start` |
| `dialog.graph.exit` | no path of unconditional links reaches an ending (the player can be trapped) |
| `dialog.choices.fallback` | every choice in a set has a condition |
| `dialog.revisit.variety` | a node reachable twice (two incoming links or a loop) has no `variants` |
| `dialog.line.box` | a line needs more than 2 lines at 40 characters |
| `dialog.barks.variety` | a pool has one line, or two lines share 60%+ of their words |

## Example

```yaml
form: quest-dialog
start: entry
nodes:
  - id: entry
    speaker: BRANNOC
    text: Forge is hot. State your business.
    choices:
      - text: About your hammer...
        to: offer
        condition: quest == none
      - text: I found your hammer.
        to: turn_in
        condition: quest == active && has_hammer
      - text: Just looking.
        to: goodbye
  - id: offer
    speaker: BRANNOC
    text: Thieves took my father's hammer. Bring it back.
    comment: The hammer is a family heirloom; "thieves" is plural.
    choices:
      - text: I'll find it.
        to: accepted
      - text: Not my problem.
        to: refused
  - id: accepted
    speaker: BRANNOC
    text: The old mill. Start there.
    end: true
  - id: refused
    speaker: BRANNOC
    text: Then stop blocking my light.
    variants:
      - Still here? The light, friend.
    end: true
  - id: turn_in
    speaker: BRANNOC
    text: That's her. Forty years at this anvil.
    end: true
  - id: goodbye
    speaker: BRANNOC
    text: Mind the sparks.
    variants:
      - Back again? Mind the sparks.
    end: true
barks:
  - pool: forge-idle
    speaker: BRANNOC
    context: idle
    lines:
      - Iron doesn't wait.
      - Hammer's gone and the orders keep coming.
```

## Ink and Yarn

If the project uses Ink or Yarn Spinner, write the conversation in this format first, lint it,
then translate: a node becomes an Ink knot or a Yarn node; `choices` become `*` / `->` options with
conditions; `variants` become Ink sequences `{&...|...}` or Yarn line groups; bark pools become Yarn
line groups (salience picks the most specific line, least recently heard first).
