---
name: prose-storyboard
description: Create or revise visual storyboards for a game, script, quest arc or full campaign when asked for storyboard panels, scene progression or character quest tracks. Use for visual storytelling plans; prose-dialog handles dialogue graphs and prose-script handles the script itself.
when_to_use: Use when asked to storyboard a game, script, quest or campaign, illustrate scene progression, or connect character development quests to a visual story plan. A dialogue graph alone is prose-dialog; a screenplay alone is prose-script.
---
# prose-storyboard

Build a reviewable visual sequence with editable story data and readable panels. A chapter list alone is not a storyboard. Keep established material, existing drafts and new staging proposals visibly distinct; storyboard completion does not imply playable implementation.

## Scope and source

Read the supplied script, game chapters and canonical story notes first. For a whole-game request, include the opening, major turns, escalation, resolution and any requested continuing play. Preserve discovery timing: characters cannot act on information they have not yet learned. Record unresolved canon instead of inventing an established answer.

Read [the board format](references/board-format.md) when authoring the editable JSON. Its sources, links, choices and character tracks retain context that a contact sheet loses. Use only the fields the request needs; character tracks are useful when personal development is part of the assignment.

## Draw the story

For each sequence, choose panels that show the need, consequential participation and a changed situation. Vary framing where it helps communicate action. Show cultivation, assembly, travel, testing and correspondence as actual events; a line of dialogue is not evidence that these happened. Represent meaningful choices and where they converge, without pretending that a high-level board exhausts a dialogue graph.

Carry significant character arcs through specific quests and later behavior. A resource request should serve a personal stake; link its payoff to what the character did or learned. Keep the main plot's resolution separate from optional personal quests unless the source explicitly requires them.

Use actual scene images or newly authored sketches, with framing and action captions. When agent-sprites is available, read its sprite-composition storyboard-panel reference and use its managed named-shape workflow for editable blocking art. Keep panel ids stable across art and story. Its generic example panels illustrate stage/type only; their captions do not direct the drawing. Inspect mismatches and disclose roughness rather than presenting them as exact scene art. Other visual tools can suit the task; do not make agent-sprites mandatory when unavailable or inappropriate.

## Review and deliver

This skill's helper uses Node built-ins and needs no managed prose runtime:

```powershell
node "<skill-directory>/scripts/board.mjs" validate "<board.json>"
node "<skill-directory>/scripts/board.mjs" render "<board.json>" --out "<new-storyboard.html>"
```

Resolve the skill directory from this file. The renderer embeds local images into a standalone offline HTML board with scene navigation, choices, source links and optional character tracks. It refuses existing output paths; choose a fresh revision or intentionally remove only your own generated output before rebuilding. It never edits the script, game or image sources.

Check coverage against the request, inspect rendered art and review desktop/phone reading. Follow the source links, choice links and character payoffs; resolve broken references. Hand over the HTML and editable JSON with a concise statement of what is complete, what remains proposed, and any visual limitations. Publishing follows the user's existing scope and hosting workflow; this skill does not grant extra sharing authority.
