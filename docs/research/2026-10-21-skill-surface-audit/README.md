# Skill surface and Yoda audit

Audited all 21 skill entrypoints against the annotation and reading-comparison workflows on
the unreleased 0.11.0 branch, starting at `6fd4ad5`. Two fresh agents started in the same parent
turn with identical synthetic Markdown, concept-registry and task packets. Both first selected
skills from the same metadata catalog. One then read the annotation/reading-level skills and
relevant references; the control used CLI discovery and implementation sources without skill
bodies. Model snapshot, seed and sampling settings were not exposed.

## Findings and fixes

- **Authoring metadata appeared in annotation publication.** Both arms found that the annotation
  Markdown parser passed YAML frontmatter to CommonMark as visible lesson text. The projection
  now excludes a leading `---` frontmatter region before parsing, preserving original UTF-16,
  byte and line offsets. An unclosed region fails explicitly. Five new regression cases failed
  before the fix, then passed, covering BOM, three line endings, Unicode and actual publication.
- **Native/HTML exports reported unrelated conversion losses.** Both arms saw Web Annotation
  loss warnings on successful native JSON and HTML exports. Common publication warnings and
  Web Annotation conversion warnings now have separate reports. The CLI returns the selected
  format's report; the workbench publication preview uses the common report. Regression
  assertions failed before the fix and passed afterward.
- **Grade comparison overlapped generic rewrite review in metadata.** One selection included
  both skills for the grade-comparison prompt; the other selected only `prose-reading-level`.
  The generic review description now explicitly covers stylistic choices and routes grade
  comparisons to reading-level. The reading-level trigger explicitly includes step-up/down
  comparison. This improves the stated boundary; automatic host activation was not tested.
- **Color/CSS guidance required a nested reference.** Both annotation entrypoints linked formats,
  which linked styling. Both now link styling directly, and annotation review names category/
  member highlighting in its listing and body. Both arms found the existing styling guidance;
  this is a disclosure improvement, not a demonstrated task failure.

## Observed task outcomes

Both arms reused the saved vocabulary registry, targeted only the first `Diffusion` occurrence
(the heading), accepted the two explicitly approved entries, left the assistant explanation as
a draft, exported two annotations, and verified/closed their own local HTTP preview. Each created
and inspected a source/adaptation comparison with `choice: null`. Source, adaptation and registry
hashes were unchanged. Both supplied accurate category/member/hybrid directions and consumer CSS.
The exposed arm also identified that the supplied adaptation omitted the unstirred-liquid claim;
neither arm rewrote it or chose for the owner.

Both completed the workflow. This small pair establishes no overall skill advantage, writing
quality improvement, grade calibration or learner benefit. Eight selection prompts covered
freshman adaptation, teaching, comparison, annotation, annotation appearance, comedy choices,
procedures and research reporting; this is model selection from supplied metadata, not installed
host activation. The short supplied texts correctly have unavailable paragraph-grade estimates.

After the fixes, the same agents ran targeted confirmations against new sidecars and output paths
using the current checkout. Both retained two accepted/one draft, published no frontmatter,
returned no native/HTML warnings and retained the three relevant Web Annotation warnings.
Source/registry/adaptation hashes remained unchanged. These confirmations were not fresh paired
trials. Markdown publication language remains `und`: authoring frontmatter is excluded, and its
reader profile does not declare annotation-publication language. The agents' initial language
observations are preserved, but no language-inference feature is claimed.

## Verification and preserved evidence

All 21 names match their directories; YAML metadata and direct Markdown targets resolve. All
descriptions fit the 1,024-character specification bound and the repository's combined-listing
bound. Bodies remain at most 150 lines. The scan found no dollar-argument placeholders or the
scanned invisible/tag codepoints in entrypoints. These checks do not certify safety or host loading.

At the initial audit handoff, targeted verification passed **148 tests across 11 files**, including real Chromium annotation,
independent-consumer and comparison workbench tests. Typecheck, generated references and whitespace
checks passed. The complete suite and CI had not been rerun at that handoff; release verification
is reported separately.

[The evidence archive](skill-surface-evidence.zip) retains identical inputs, the pre-edit catalog,
before/after metadata measurements, routing decisions, command/result journals, reports and relevant
artifacts. Filesystem roots, preview URLs/tokens and process/port numbers are normalized. The
parent's initial runner incorrectly invoked an export-only module; both arms' empty no-op calls
and the common entrypoint correction are retained as harness failures, not skill failures.

The paired runs checked HTTP serving and lifecycle, not interactive browser rendering. No browser
surface was available to the exposed agent. Separate automated Chromium tests cover the actual
workbenches. No ordinary user project, installed client cache or global launcher was changed.

## Pre-release review follow-up

Independent review reproduced a remaining edge case: an indented `---` inside a YAML block
scalar ended frontmatter masking early. Six failure-first assertions reproduced metadata leakage
or incorrect body/prefix handling across annotation projection/publication, comparison and the
general Markdown parser. Closing markers now start at column zero, with optional trailing spaces
or tabs. Regression fixtures retain the scalar and source bytes through publication and comparison
editing. The original paired archive remains unchanged and describes the earlier audit runs.
