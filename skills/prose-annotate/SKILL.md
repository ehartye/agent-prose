---
name: prose-annotate
description: Add source-bound highlights, vocabulary references, definitions, explanations and links with agent-prose when asked to annotate Markdown, static HTML or structured content, using supplied notes or assistant proposals and a persistent concept list.
when_to_use: Use when asked to annotate a passage, define terms in a lesson, attach a core concept or vocabulary list, add explanatory notes or cross-references, or prepare portable annotations for an application. Review decisions on existing annotations use prose-annotation-review; rewriting the source uses its writing skill.
---
# prose-annotate

`prose` means `node "<plugin-root>/scripts/run-managed.js"`; `<plugin-root>` is two directories
above this file. If it prints `E_RUNTIME_MISSING`, use prose-setup first.

Keep source wording intact unless the user also requested editing. Annotations live in a sidecar;
the concept registry persists across sessions. The CLI locates and validates; the agent writes or
refines bodies. It makes no model calls and does not certify learning or reading level.

## Prepare and locate

Find the existing sidecar and concept registry before creating another. Read
[formats and proposals](references/formats.md) for the actual registry/proposal schema, passage
links, or a structured-content adapter. For a new source:

```text
prose concepts init --file concepts.yaml --project example --language en-US
prose annotation init lesson.md --out lesson.annotations.yaml --concepts concepts.yaml
prose annotation locate lesson.annotations.yaml --quote "the exact visible passage"
```

Skip registry creation when none is needed. To add concepts, edit the registry's `concepts` array
and `lists` record, then run `prose concepts check --file concepts.yaml`. For a registry marked
`authority.mode: external`, change its authoritative source and regenerate its snapshot instead.
Read the saved registry each session: `prose concepts show --file concepts.yaml --list core`.

`locate` accepts exactly one of `--quote`, `--concept <id>` or `--list <id>`. Inspect candidate
context and choose the intended occurrence; repeated wording is not permission to annotate all
matches. Use the returned candidate ID, never calculate offsets from raw Markdown or HTML.
If the source changes, locate again. Missing or unsupported targets require a different exact
selection or an adapter change, not approximate attachment.

## Propose and present

Write a JSON/YAML **array** to a proposal file. For example, after replacing the candidate ID
with one returned by `locate`:

```json
[{"kind":"explanation","candidate":"<candidate-id>","body":"An explanatory note.","origin":{"type":"assistant"}}]
```

Run `prose annotation propose lesson.annotations.yaml --in proposals.json --expect <revision>`
using the latest revision printed by a read. `highlight` needs no body; `vocabulary` and
`concept` require a saved concept ID, and `vocabulary` also requires a named list membership.
Overlapping highlight and explanation are separate entries.
Preserve supplied bodies and mark their origin `supplied`; mark generated bodies `assistant`.
For factual additions, retain appropriate HTTP(S) source URLs and distinguish an original example
from a research excerpt. Registry definitions and aliases need their own source review.

Run `prose annotation check lesson.annotations.yaml`, then
`prose annotation preview lesson.annotations.yaml --local`. It returns promptly with `session`
and `localUrl`; it does **not** open a browser. Open that URL with the available browser when the
user asked for a preview, and include the link in the handoff. Only the local computer can reach it.
Use prose-annotation-review for feedback and publication. Proposals remain drafts; if the user
already requested publication of specified content, accept and export within that authorization.

Report the sidecar, concept registry if used, counts, unresolved selections and preview link.
Do not report a proposal or preview as published content.
