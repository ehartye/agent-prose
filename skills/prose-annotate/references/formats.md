# Annotation files and adapters

All examples here are synthetic format examples, not research-validated learning materials.
Commands use the `prose` launcher defined in the skill. Sources and registries must stay within
the sidecar's content root (`annotation init --root <directory>` when the default is too narrow).
Paths in saved records are relative; init generates a stable document UUID. Keep that identity.

## Persistent concepts

`prose concepts init --file concepts.yaml --project example --language en-US` creates a registry.
Keep its generated `uid` when adding entries. There is no concept-add command in v1; edit this
file, or regenerate it from its declared external authority, and run `concepts check --file`.

```yaml
schema: prose/concepts@1
project: example
language: en-US
concepts:
  - id: diffusion
    label: diffusion
    aliases: [diffuse]
    definition: The net movement of particles from higher to lower concentration.
    definitionSource: author-supplied
lists:
  core: [diffusion]
```

Concept `id` values are persistent handles, not labels to regenerate each session. Optional fields
include `uid`, `sources` (HTTP(S) URLs), `definitionSource`, `cedRef`, and `related` concept IDs.
Retired entries can carry `retired: true` and a `replacement` ID; they cannot be accepted, and
retirement or alias changes make used accepted entries stale. Do not silently substitute a
replacement in existing annotations.
For an adapter-owned vocabulary snapshot add `authority: {mode: external, source: "<authority>"}`;
its upstream source owns definitions and aliases. The annotations reference this snapshot rather
than create a competing glossary. `lists` is a record of list IDs to arrays of concept IDs.

## Proposal array

Each proposal requires `kind` and **exactly one** of `candidate` or `target`. Prefer the snapshot-
bound candidate ID from `locate`; a target selector is for adapters and explicit manual bindings.
Proposal files contain an array, including when there is only one proposal.

| Field | Contract |
|---|---|
| `id` | Optional stable annotation handle; otherwise generated |
| `kind` | `highlight`, `vocabulary`, `concept`, `definition`, `explanation`, or `link` |
| `candidate` | Exact ID returned by `annotation locate` for the current source |
| `target` | `quote`, `fragment`, whole `block`, or complete `start`/`end`, with optional `prefix`/`suffix` and ordered `blocks` refinements; selectors must agree |
| `concept` | Saved concept ID; required for vocabulary/concept entries |
| `lists` | List IDs; vocabulary requires at least one, and the referenced concept must belong to each |
| `body` | Plain text in v1; required for definition/explanation entries |
| `destination` | Required for links: `{url: "https://example.org/..."}` or `{document: "<handle-or-UUID>", target: "<passage-id>"}` / `fragment: "<fragment-id>"` |
| `sources` | Optional HTTP(S) URLs supporting the annotation |
| `origin` | `{type: supplied|assistant|deterministic, agent?, model?, sources?}` |

`target` positions are Unicode code-point offsets in the canonical text projection, not raw file
characters, UTF-16 indexes or bytes. Never invent them. Source maps retain raw/UTF-16/byte or
structured-field locations. A body containing Markdown or HTML remains literal plain text.

```json
[
  {"id":"term-diffusion","kind":"vocabulary","candidate":"<term-candidate>","concept":"diffusion","lists":["core"],"origin":{"type":"supplied"}},
  {"id":"process-note","kind":"explanation","candidate":"<sentence-candidate>","body":"Particles continue moving in both directions after the concentrations become equal.","origin":{"type":"assistant"}},
  {"id":"process-focus","kind":"highlight","candidate":"<sentence-candidate>","origin":{"type":"supplied"}}
]
```

Use actual locate output in place of the placeholders. Run `annotation propose <sidecar> --in
proposals.json --expect <revision>`. The revision is an opaque snapshot covering source, registry,
sidecar and used destination dependencies, not a sidecar file hash. A conflict means reread state
and reconsider the write;
do not blindly retry with a fresh revision. `--event <unique-id>` supports idempotent retries of
the same mutation. `check` and `locate` print revisions, and writes return updated state.

## Internal destinations

A cross-document destination needs the target sidecar registered in the origin sidecar's
`references` record, for example `references: {related: related.annotations.yaml}`. The key is
its document handle or UUID. A named passage is declared in the target sidecar's `targets` array:

```yaml
targets:
  - id: main-idea
    target: {quote: "An exact sentence in the target document.", block: explanation-1}
```

Use a real block ID from the target projection, or omit `block` if the quote is unique. Source
fragments are an alternative to named targets. Validate both sidecars after edits; accepted links
become stale if the used destination changes. Do not substitute a generated component DOM ID.

## Source profiles

- **Markdown:** CommonMark prose blocks, emphasis, links, and optional `[text]{#fragment}` spans.
  The span is a supported extension, not standard CommonMark. Code, images, tables and unsupported
  regions are not targets; inspect diagnostics. Matching uses displayed text without delimiters.
  A leading `---` frontmatter region is excluded from targets and publication, with raw source
  offsets preserved; the closing delimiter starts at column zero, so indented YAML block-scalar
  markers remain metadata. An unclosed region is rejected. Metadata does not declare publication language.
- **HTML:** Static prose in the body, supported containers and inline markup, with `id` fragments.
  Scripts, styles, hidden and unsupported regions are excluded; no JavaScript or CSS is executed.
  It cannot infer arbitrary browser-computed visibility or annotate a live DOM. Declare an exact
  tag or `#id` with `annotation init page.html --content-root "#reading"`; the default is the body.
  Ordered and unordered lists retain their structure; reversed, alphabetic and per-item ordinal
  reset HTML lists are unsupported rather than silently renumbered.
- **Structured:** Inert JSON snapshots, not JavaScript imports or a framework component tree.
  The application adapter selects content fields, preserves stable document/block IDs and parses
  formatting into runs. Select a document explicitly when the snapshot has several.

Unsupported content produces barriers or parse failures instead of guessed locations. Inspect the
projection/diagnostics in `annotation check` before promising full-format coverage. No general
round trip or arbitrary Markdown/HTML fidelity is promised.

## Structured source contract

```json
{
  "schema":"prose/structured-source@1",
  "adapter":{"id":"lesson-content","version":"1.0.0","sourceSchema":"lesson@1","projectionVersion":"1","inlineDialect":"runs"},
  "documents":[{"id":"lesson-1-full","language":"en-US","blocks":[
    {"id":"explanation-1","kind":"paragraph","runs":[{"text":"Diffusion","marks":["strong"]},{"text":" moves particles down a concentration gradient."}]}
  ]}]
}
```

```text
prose annotation init snapshot.json --profile structured --document lesson-1-full --out lesson.annotations.yaml --concepts concepts.yaml
```

Blocks support `paragraph`, `heading`, `list-item`, `blockquote`, or `excluded` with a `reason`.
Runs hold `text`, optional `marks: [strong, em]` and `href`; a separate `{break: "hard"}` run adds
a hard break. Block `context` may contain `headingPath`, heading `level` (1–6), and `listDepth`.
List-item context also supports `listType: ordered|unordered`; ordered lists may carry a safe
integer `listStart`. An optional `listItem` handle groups several paragraphs inside one item;
reuse it for an outer continuation after a nested list, but never for a later unrelated item.
These list/heading values are preserved in publication and consumer blocks.
Optional block/run `source` and top-level `extraction` metadata record upstream provenance;
annotation locations map to JSON fields. Raw host source strings are not executed.

Documents may declare `language` and `dir` (`ltr`, `rtl`, `auto`); undeclared language is `und`.
HTML inherits language/direction from the selected root or its ancestors. These values travel with
the publication and participate in review dependencies.

Keep full and abbreviated readings as distinct document IDs. Exclude assessment items and protected
quotes as appropriate to the host's policy. An adapter migration must account for renamed/split
blocks and changed inline parsing; do not derive stable identities only from array indexes or text
hashes. Adapter/projection versions participate in review dependencies.

## Consumer boundary and publication

For category/member color hints, the three highlighting modes, shared workbench settings and
copyable HTML/CSS implementation guidance, read [presentation and consumer styling](styling.md).

Use `annotation export <sidecar> --to json --out publication.json` for the native
`prose/annotation-bundle@1` bundle with projection `prose/annotation-text@1`. Only accepted current
annotations publish. Draft, rejected and deferred entries are omitted; stale accepted entries block
export until reviewed. Reports identify omitted entries and unsupported/lossy conversions.
Published concepts use stable public IRIs (generated as UUID URNs); lists use stable UUID URNs,
not authoring handles. `listLabels`
maps list URNs back to author labels; `lists` retains authoritative member order for the concepts
included in the bundle. Consumers must not assume the bundle contains the whole project registry.

`src/annotation/render.ts` exports pure browser-compatible `planAnnotationRuns(bundle, documentId,
{context: 'reading'|'assessment'})` and `renderPublication(bundle, options)`. The planner composes
overlapping annotation ranges with strong/emphasis and existing links; a host renders its own
components, styles, accessible controls and navigation. `assessment` suppresses annotation hints;
the host must choose the correct context and separately enforce its original formatting policy.

`--to html` emits one escaped, combined HTML document with in-page passage links and notes.
Original included fragment links are namespaced per document. Original relative/private links
without a public or included fragment destination are omitted and reported; publish actual URLs
or annotation destinations when those links must survive. Private source-reference metadata is
omitted from reader delivery, and source identifiers/adapter declarations must be portable.
`--to web-annotation` emits a package `{page, representations, report}`: **only `page` is W3C Web
Annotation JSON-LD**; companion representations supply exact canonical text for its selectors.
Their UUID URNs identify included snapshots, not fetchable URLs. Keep the companions with the page.
This is a bounded interchange export, not a complete external
annotation service. Every export requires a new output path and never overwrites an existing file.

The host must match source/projection digests, keep stable target identities, resolve internal
navigation and open/focus folded content. It owns CSS, reading/assessment visibility and delivery.
No external application's integration is qualified merely by producing this bundle.
