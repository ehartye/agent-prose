# Assess a batch and jump between passages

Use for requests such as “evaluate the grade-level appropriateness of these ten passages and let
me jump between them.” This is independent passage assessment against one shared reader/task.
Use the six criteria and support anchors in the assessment reference linked by the skill. Do not
average ratings or infer a curriculum progression from passage order.

## Prepare and open

1. Preserve each supplied passage verbatim, including headings, tables and markup. Give it a stable,
   unique id and a recognizable title. State any missing material or topic prerequisites per report.
2. Establish one shared reader profile, prior knowledge, task and available supports. Assess each
   passage separately. Reuse the anchors, not another passage's evidence or verdict. If targets differ,
   create separate batches so the shared profile remains true.
3. Write one UTF-8 JSON input using the contract below. The agent or user supplies the assessments;
   the CLI does not call a model. Pending reports may be `null`; never fabricate a completed report.
4. Initialize a prose project if needed, create the batch, open it and give the owner the exact URL:

```text
prose init --dir <project>
prose assessment create assessment-input.json --dir <project>
prose assessment open <returned-id> --dir <project>
prose assessment show <returned-id> --dir <project>
```

`create` resolves the input file from the current working directory. It returns the new id and all
validated reports. `open` returns an authenticated local review link; it does not launch a browser
or publish the text. Anyone with that link on the same machine can read the supplied snapshots.
On `E_RUNTIME_MISSING` use prose-setup. If `assessment` is unknown, update the plugin/runtime;
do not substitute a style-variant queue or claim the workbench opened.

The left panel selects passages and filters by title or text. The center shows the exact passage;
the right shows its recommendation, six evidence-linked rubric rows, proposals, checks and limits.
All three desktop columns scroll independently. Previous/Next, a batch overview and a narrow-screen
passage picker provide additional navigation. Selection survives reload in the URL. Theme settings
are the same remembered System/Light/Dark gear used by the other review modes.

## Input contract

All objects are strict; unsupported keys are rejected. Use 1–50 passages and at most 4 MiB of UTF-8
JSON, including stored metadata. These are operational limits, not research-derived sample sizes.
`schema` is `prose/assessment-input@1`. Required top-level fields:

| Field | Value |
|---|---|
| `title` | Nonblank batch title, at most 200 characters. |
| `reader` | `{language: "en-US", schoolGrade: 9, profile: "Average U.S. high school freshman", priorKnowledge: "…", task: "…", supports: []}`; schoolGrade is an integer 4–12, the other text fields are nonblank. List actual available supports. |
| `passages` | Array of `{id, title, text, report}`. `id` is unique, 1–64 letters/digits/underscores/hyphens, starting with a letter or digit. Title is at most 200 characters; text at most 1,000,000 characters. |

`report` is `null` when pending; otherwise it has these required fields:

| Field | Value |
|---|---|
| `origin` | `agent` or `provided`; this is provenance, not independent verification. |
| `recommendation` | `ready`, `supported`, `revise`, or `insufficient-context`, with the meanings in the assessment reference. |
| `summary` | Conditional recommendation and deciding reason relative to the declared task. |
| `criteria` | Exactly six rows, once each: `vocabulary`, `syntax`, `organization`, `knowledge`, `reasoning`, `task`. |
| `proposals` | Ordered array; may be empty when no changes are needed. |
| `checks` | Array of checks actually performed or explicitly not run; may be empty. Diagnostics remain separate from editorial ratings. |
| `limits` | At least one statement of assessment limits and/or smallest useful next check. |

Each criterion row is `{criterion, rating, evidence, reason, action}`. `rating` is `ready`, `light`,
`substantial`, `major` or `not-assessed`. `evidence` is an array of exact, nonempty quotations from
that passage, at most 3,000 characters each. Every assessed row needs evidence. A `not-assessed`
row may use `[]` and must explain what is missing in `reason`. `action` gives a specific change
or explains what to retain. Quote only necessary material within the source's reuse limits.

Each proposal has `kind` (`text-edit`, `support`, `content-request`), `location`, `description`,
and optionally `criterion`. Supply `before` and `after` together when illustrating an edit;
both are required for `text-edit`. `before` must quote this passage exactly. Other text fields
are nonblank, usually limited to 6,000 characters; proposal examples allow 12,000. These limits
do not waive copyright limits. Exact matching verifies a binding, not an educational judgment.

A [complete ten-passage original example](../../../docs/examples/assessment-batch/input.json)
can be used as a structural reference. Its demonstration judgments have not been learner-tested.

## Snapshot and revision behavior

The workbench stores immutable source/report snapshots in `.agent-prose/assessments/<uuid>.json`
with schema `prose/assessment-batch@1`, a creation timestamp and each passage's SHA-256 `sourceHash`.
`show` adds recomputed completion counts, rubric labels, support anchors and recommendation labels.
Stored text is checked against its hash. That check does not authenticate the report author or
detect edits to an external source document; compare external sources explicitly before reuse.

Text and report content are rendered as inert text, including Markdown/HTML and table syntax.
The viewer does not fetch images, open embedded links or recover missing figures. Name missing
learner-facing material in the assessment rather than treating a filename as an inspected figure.

V1 browses supplied reports. It does not edit passages, apply proposals or record human approval.
For refinements, update the input and create a fresh batch; preserve the old review id when needed.
For actual rewritten versions, use the source-and-adaptations comparison workflow. Do not replace
the owner's original documents or turn editorial ratings into taste-model training events.
