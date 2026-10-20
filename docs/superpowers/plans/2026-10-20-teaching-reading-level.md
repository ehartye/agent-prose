# Teaching voice and reader targeting implementation plan

> Use the subagent-driven-development workflow for bounded runtime tasks and independent reviews. Continue through validation within the authorized implementation scope.

**Goal:** Support textbook teaching and natural-language U.S. grades 4–12 audience requests, with a transparent optional reading diagnostic and reusable evidence-backed examples.

**Architecture:** Keep authoring judgement in two small skills. Add strict document metadata, one paragraph diagnostic and a textbook form/guide to the existing Markdown pipeline. School placement never implies a formula target. Existing style/taste values stay unchanged.

**Stack:** Node 24, TypeScript, zod, YAML, Vitest, existing managed runtime.

## 1. Baseline and skill observations

- [x] Create the isolated worktree and install locked dependencies.
- [x] Run baseline writing tasks before authoring skills; archive their exact outputs under `docs/research/2026-10-20-teaching-reading-level/`.
- [x] Restore baseline repository checks by removing private-reference text from the earlier draft; rerun `npm test -- tests/skills.test.ts`.
- [x] Preserve the baseline's sound explanations/qualifications. Add instructions for observable missing workflow evidence, rather than inventing writing failures.

## 2. Strict reader and teaching metadata

Files: create `src/reader.ts`, `tests/reader.test.ts`; modify `src/document.ts`.

- [x] Write failing document-loading tests for profile/target independence, invalid school grades and ranges, unknown keys, malformed language tags, and textbook goals/unit requirements. Example assertion:

```ts
const doc = parseDocument('lesson.md', '---\nreader: {language: en-US, schoolGrade: 9}\n---\nA passage.');
expect(readReader(doc.meta)?.schoolGrade).toBe(9);
expect(readReader(doc.meta)?.readingLevel).toBeUndefined();
```

- [x] Run `npm test -- tests/reader.test.ts`, observe the missing-feature failure, then implement `readReader(meta): Reader | null` and `validateLearningMetadata(meta, format, form): void` with schema pointers.
- [x] Reader keys: required `language`; optional `schoolGrade` 4–12, `ageGroup`, `priorKnowledge`, `readingLevel: {scale: 'us-grade', range: [lo, hi]}`, `essentialTerms`. Teaching keys: `unit`, nonempty `goals`, optional `prerequisites`; required for textbook only. Preserve legacy `audience`, `target` and raw metadata.
- [x] Rerun focused loading tests; do not add project defaults or a voice schema.

## 3. Reading report and informational lint

Files: create `src/measure/readability.ts`, `tests/readability.test.ts`; modify `src/measure/index.ts`, `src/lint/evaluators.ts`, relevant golden snapshots.

- [x] Write failing tests for independent hand-calculated FK arithmetic, 100-word/five-sentence floor, section boundaries, excluded block kinds, unsupported language/verse, natural-language profile with no inferred target, term boundaries and nonblocking lint.
- [x] Run `npm test -- tests/readability.test.ts`, observe the failure, then implement `measureReadability(doc): ReadabilityReport | null` using `readReader`.
- [x] Report method/version/input policy/language, reader profile, counts/lines, estimate/status, explicit target/comparison, term observations and coverage limits. Compare unrounded values; retain a one-decimal displayed estimate. Mark all thresholds as conventions.
- [x] Score only paragraph blocks outside References/Bibliography/Works cited/Answer key/Instructor notes sections. Term presence may use learner-facing headings and prose blocks outside excluded sections; presence is not definition or truth.
- [x] Keep `style.readingGrade` untouched. Replace human-facing legacy grade info only when a reader report exists. Add an opt-in term observation evaluator; no errors or variant rejection for level position.
- [x] Rerun focused tests and inspect any additive snapshot changes; no unrelated normalization.

## 4. Teaching form, craft guide and two skills

Files: `craft/forms.json`, `craft/rules.json`, `craft/references.json`, `craft/guides/families.json`, new `craft/guides/teaching-prose.md` and references fragment; new `skills/prose-teach/`, `skills/prose-reading-level/`; routing in existing instruction/formal/speech skills; README and plugin descriptions.

- [x] Add a textbook Markdown form and teaching family before integrating textbook-loading tests.
- [x] Create meaningful failing teaching integration tests: correct guide mapping, no procedure/BLUF rules, judgement stays unverified, documented examples execute, managed package contains linked resources.
- [x] Add source-backed judgement rules for goals, prerequisite support, explanation/example accuracy and suitable practice/feedback. Reuse factual support guidance. Do not add a universal sentence cap or repetition penalty.
- [x] Write short entrypoints grounded in observed baseline needs; put detailed references and exemplars one link from each entrypoint. Include the exact freshman request, optional numeric targets and honest verification reporting.
- [x] Run `npm run refs` and `npm run guides`; update the nineteen-skill inventory and generated tables.

## 5. Reusable reference examples and behavioral checks

- [x] Verify primary reuse terms before embedding excerpts. Label actual study material, standards-selected text and illustrative original writing separately; do not certify exemplar grade bands or reproduce proprietary leveled passages.
- [x] Run both skills against the same baseline tasks and add a grade 11–12 disciplinary task and a two-variant preservation task. Archive exact prompts, skill exposure, model/setting limits and outputs.
- [x] Use an independent reviewer with the fixed rubric and concealed exposure mapping; document that labels/layout were not fully blinded or shuffled. Record strong baselines, regressions and concrete workflow benefits; no claims of human learner testing.
- [x] Exercise near misses: research abstract, reset steps, grade-1 decodability, short notice, non-English and poem. Keep discovery/routing evidence separate from output scores.

## 6. Verification and completion

- [x] Run focused tests, then `npm test`, `npm run typecheck`, and `npm run refs:check` once after integration. Investigate actual failures before expanding checks.
- [x] Perform isolated managed setup and parse/measure/lint/guide checks using the shipped examples. Verify installed skill resources and no browser requirement for ordinary prose.
- [x] Complete spec and code-quality reviews; fix material findings and rerun affected checks.
- [x] Update maintained project architecture and roadmap through the documented operation/ownership workflow. Commit feature work on its branch, preserving the main checkout and user files. Publishing/release remains a separate action.
