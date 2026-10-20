# Yoda audit: teaching and reader adaptation

Public archive note: local working-directory paths are normalized to repository-relative
paths or described as the repository root. External skill handles are anonymized where
present. Recorded metrics, generated drafts and review outcomes are unchanged; historical
metadata character counts describe the original, pre-redaction text.

Audited `prose-teach` and `prose-reading-level` at commit `97838bb`, with all
nineteen skill descriptions checked for overlap and references. One authoring
instruction gap was corrected. The paired writing review found no prose-quality
advantage or critical regression on these tasks. Grade suitability, comprehension
and learning outcomes remain untested.

## Findings

**Corrected: word ranges and hard caps could become misleading point targets.**
The skill-assisted run initially wrote `target: 250-350 words` and `target:
160-210 words`. Four lint/measure calls failed with `E_SCHEMA` at `/target`; exact
errors are retained in `with-skills/*-initial.json`. The author corrected these to
upper bounds. All final calls succeeded, but a valid 286-word lesson inside its
250–350 range then received advice to add words. The 107-word procedure also
received padding advice despite its 130-word maximum.

The CLI implements approximate point targets, including tolerance, rather than
ranges or maximums. The behavior follows its existing contract; the new skills
did not explain that distinction. Both entrypoints now say to omit `target` from
new draft metadata for a word range/hard cap, retain the actual bounds in the
brief and check the requested body separately. Runtime semantics were not changed.

**Advisory: an existing microcopy route depends on an external skill.**
The audited `prose-instruct` named an external UX-writing skill, absent from this catalog. The
original project design intentionally delegates microcopy outside agent-prose.
The selection probe identified the missing local route. This is a portability
dependency, not proof that the external skill is retired or a reason to make
the new teaching skill own interface copy. The original audit left that route unchanged.
In the portability patch, the current skill uses a generic UX-writing scope
exclusion with no dependency on another installed plugin.

**Evidence limit: prose benefit remains unestablished.** Both arms earned ceiling
scores from the independent reviewer. The examples support competent writing and
preserved qualifications in this small sample, not superiority, equivalence or
a validated grade assignment. Explicit profiles, recorded review and scoped
diagnostics are observable workflow differences. Their educational benefit has
not been measured.

## Inspection

`static-inspection.json` preserves the pre-fix measurements for every skill:

| Entry point | Description characters | With `when_to_use` | Body lines before fix |
|---|---:|---:|---:|
| `prose-teach` | 226 | 540 | 56 |
| `prose-reading-level` | 217 | 565 | 54 |

All nineteen names matched their directories; direct Markdown reference links
resolved. No dollar-digit/argument placeholder or scanned invisible-codepoint
match was found in the entrypoints. Combined metadata measured 11,635 characters
across the library. These are source measurements, not a claim that every host
loads the entire catalog or applies an identical metadata budget. The fix adds
three body lines per target skill without changing descriptions.

The two entrypoints put triggers in metadata, the authoring workflow in the body
and detailed evidence/examples behind direct links. The source-backed example
reference is optional when a model text is useful; no example text was needed
or copied for these fictional-source tasks. Inspection and a narrow Unicode scan
do not certify safety or instruction compliance.

The [selection probe](routing.md) used names/descriptions only and covered twelve
requests. It kept research summaries, procedures, verse and slide plans with their
genre skills and composed audience adaptation. It recognized distinct first-grade
decoding support and unsupported Spanish scoring. This was a fresh agent's
selection exercise, not an actual host automatic-activation test.

## Paired writing comparison

Two fresh agents were spawned in the same orchestration turn with the exact
tasks/source packets in `prompts.json`. One read the target skills, their needed
reference/guide sections, and the existing formal/instruction skills. The other
read no skills or guides. Both had the same local CLI access. Thus this compares
the composed skill-assisted workflow with ordinary writing; it does not isolate
the contribution of either new skill from the neighboring genre guidance.

Both agents inherited the parent model with no override. The interface exposed
no reproducible model snapshot, seed or sampling settings. No external content
research occurred: club counts, the research pilot and ResetLab were supplied
fictional material. The author's self-review was not used as the quality score.

Before review, frontmatter was removed and independent random assignments placed
each case's two bodies under labels M/Q. The reviewer received only those six
files and the preregistered requests/rubric. It did not receive the arm mapping,
skill text, tool records or authoring notes. `review-mapping.json` preserves the
assignment and source/body SHA-256 hashes; all six source hashes were checked.
Writing style can still suggest exposure, so concealment is not perfect blinding.

The [independent review](blind-review.md) found all six bodies within their
requested lengths, with every applicable rubric dimension scored 2/2 and no
critical failure. After revealing the mapping:

| Task | Skill-assisted body words | Ordinary body words | Concrete tradeoff |
|---|---:|---:|---|
| Freshman conditional probability | 286 | 266 | More fraction support versus tighter connection among calculations |
| Freshman research summary | 191 | 190 | Result/caution first versus easier tracing of participant flow |
| Sixth-grade procedure | 107 | 99 | Separated actions versus more compact recovery structure |

Both research accounts retain attrition, missing outcomes, evidence limits and
the single-school boundary. Both lessons have correct worked fractions and
practice feedback. Both procedures retain exact labels, timings, warning,
save-confirmation prerequisite and recovery/password conditions.

Only after body review did the orchestrator inspect process notes. The skill arm
ran actual diagnostics, recorded profiles without inferred numerical grade targets,
and correctly reported the short procedure's unavailable paragraph estimate.
The ordinary arm checked word counts without running the prose CLI. Its lack of
CLI errors is therefore not a comparable runtime success rate. Neither arm
claimed teacher/student testing or grade certification.

## Post-fix check

After the instruction change, another fresh same-turn pair repeated the range
lesson and capped procedure using `post-fix-prompts.json`. Outputs/notes are
under `post-fix/`. This was a targeted authoring/length regression check, not a
second blind rubric study.

The orchestrator independently parsed, measured and linted all four final drafts
and counted their bodies with the declared reviewer-style token policy. The
skill-assisted texts had 294 and 94 body words; the ordinary texts had 289 and 95.
Both pairs meet the range/cap. All four omitted `target`, parsed successfully and
had no lint errors, warnings or `length.target` findings. The skill-assisted drafts
retained textbook/instructions forms and grades 9/6; their paragraph estimates
remained separate from audience placement. See `post-fix/independent-checks.json`.
The orchestrator also checked the new worked answer and retained procedure
conditions against the supplied packets. Different tokenization explains small
differences from the authors' own word counts.

This is evidence that the clarified instructions avoided the observed target
misrepresentation in one fresh run. It is not an estimated reliability rate or
proof that the skills improve writing. Educator and intended-reader evaluation,
subject transfer and actual host activation remain open.

Verification after the final instruction/artifact edits: all 38 tests in
`tests/skills.test.ts` passed, and the staged whitespace check passed. No runtime
code or craft data changed, so the runtime suite was not repeated for this audit.
