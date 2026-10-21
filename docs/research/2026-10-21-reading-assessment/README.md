# Paired passage-assessment evaluation

The amended reading-level skill produced the intended six-criterion assessment format across three
tasks. A separate blind reviewer found both amended-skill and unassisted reports adequate and no
substantive paired winner. This checks a small editorial workflow; it does not validate school-grade
placement, reader comprehension, inter-rater agreement or learning benefits.

## Method and artifacts

Two agents were dispatched together before implementation: one read the existing skill and relevant
references, and one used ordinary editorial judgment without skills. After implementation, a fresh
skill/control pair was dispatched together on the same corrected inputs. Each agent handled all
three tasks, so outputs within an arm are not independent samples. The agents inherited the same
parent model configuration; there was one run per arm, not a powered experiment.

- `eval/`: exact task packet and original fictional passages, covering independent grade 9 research
  reasoning, teacher-led grade 7 literary inference, and a short grade 6 passage with missing model context.
- `baseline/`: pre-change existing-skill and control reports. Both were useful; their task-specific
  scales and criteria differed, and the existing skill used an overall numeric rating. This motivated
  an explicit shared report contract rather than a claim that ordinary review failed.
- `post/`: exact amended-skill and control assessment reports. Harness notes normalize excluded
  external-resource names to generic language; assessment reports and passages are unchanged.
- `blind-review.md`: a separate review of anonymous post-change pairs against the task/source packet.
  `review-mapping.json` reveals the arm identities after review. Formatting can reveal likely arms;
  anonymization does not guarantee perfect blinding.
- `independent-diagnostics.json`: the maintainer's six rerun measurements/lints, with paths normalized
  to source filenames. They corroborate diagnostic values, not each author's tool execution history.
- `routing-prompts.json`, `routing.md` and `routing-final.md`: exact prompts and metadata-only selections on ten natural prompts and near misses.
  These inspect catalog discoverability, not the host's hidden invocation mechanism.
- `static-inspection.json`: listing/body budgets, direct resource resolution, hidden-control scan,
  public-text portability and dependency versions. Inspection is not a general safety certification.

The first fixture incorrectly used unsupported `form: report`. During the pre-change runs it was
corrected to `form: academic` before final diagnostics in both arms; visible prose stayed unchanged.
Both arms were explicitly told the form was a parser container and to assess the scene as literature.
The post-change pair started with corrected metadata. This harness error is not counted as a skill
failure. Paragraph labels also affect sentence-unit counts; the reports and receipts expose this.

All arms had the same preverified direct `node scripts/prose.mjs` executable available as a harness
override, avoiding runtime installation differences. The initial preflight was 0.11.0; the development
package version advanced to 0.12.0 during the post-change run, without changing diagnostic source code.
Compatible dependency patches were applied during development. Reproduced final diagnostics agree
with the values reported in both arms. This was not a frozen-container benchmark.

## Findings and limits

All post-change reports received adequate scores on the reviewer's six concerns: audience/task,
passage evidence, understandable anchors, retained challenge, proposal fidelity, and limited diagnostic
claims. The reviewer did not identify material defects or award a general-quality advantage. The
amended arm consistently used the six domains, evidence/reasoning and action columns, prioritized
proposals, and diagnostic separation. The control used five task-specific criteria and defined numeric
scales. Its outputs were also competent. The skill's labels were intelligible but less operationally
defined inside the reports than the control's explicit scale legends; the reference supplies full anchors.

Both arms preserved reported percentages and causal limits, left the fictional mystery unresolved,
and requested missing scientific content instead of inventing an explanation. The reader-aware
diagnostics were 9.4, 3.6, and insufficient-sample respectively. Those values did not decide the
suitability recommendations. A clean lint was not treated as conceptual readiness.

The passages are synthetic, the sample is small, and the reviewer is another agent. There was no
educator calibration or intended-reader test. Scores have a ceiling in this set. Repeated independent
ratings, expert disagreements and real reader tasks would be separate evaluation work.

## Reproduction

From the release checkout, run `node scripts/prose.mjs measure <source>` and `lint <source>` on
each file under `eval/` to reproduce scoped diagnostics. For behavioral replication, use two clean
agent contexts with identical tasks, inputs, tool availability and model settings; dispatch together,
let only one read `prose-reading-level` and its assessment reference, and preserve source bytes.
Blind an independent reviewer before exposing the mapping. Do not treat a single repeat as calibration.

The [specification](../../superpowers/specs/2026-10-21-reading-assessment.md) and
[assessment reference](../../../skills/prose-reading-level/references/assessment.md) distinguish
the editorial contract from research evidence and deterministic measurements.
