# Ten-passage assessment demonstration

`input.json` contains ten original fictional passages and illustrative agent editorial assessments
for an average U.S. high school freshman. It demonstrates ready, supported, revise and
insufficient-context recommendations, local before/after edits, support proposals, and requests for
missing content. It is not a set of validated grade exemplars or a learner-tested intervention.

The six criteria and support anchors come from the reading-level skill's evidence-grounded
assessment guidance. The wording and judgments here are original illustrations, not excerpts from
the cited research. No numerical diagnostic was run on these short passages.

From a development checkout with dependencies installed:

```text
node scripts/prose.mjs init --dir <demo-project>
node scripts/prose.mjs assessment create docs/examples/assessment-batch/input.json --dir <demo-project>
node scripts/prose.mjs assessment open <returned-id> --dir <demo-project>
```

Use the URL returned by `open`. Select any passage on the left; its source and report appear beside
it. Accept, Reject or Defer a suggestion, optionally save a note, or reset it to pending. These
decisions persist separately from the source/report snapshot. Use Batch overview for a cross-passage
list without an averaged grade. The gear uses the shared
System/Light/Dark appearance preference. Source and reports are snapshots; proposing a change does
not edit or certify the passage. To revise reports, create a new batch from updated input.
