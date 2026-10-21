# Passage Suitability Assessment Implementation Plan

**Goal:** Add an evidence-linked, source-preserving assessment mode to the existing reading-level skill and release it.

**Architecture:** The agent performs qualitative review from a direct skill reference. Existing `measure` and `lint` remain optional diagnostic tools; Markdown is the report format. Rewrites use the existing comparison workflow when requested.

**Tech stack:** Agent Skills Markdown, existing Node CLI, Vitest, GitHub Actions and plugin manifests.

## 1. Establish evidence and baseline

- [x] Inspect existing guidance and readability scope; run focused baseline tests.
- [x] Complete five discovery lenses; select and capture relevant official tools, scholarly critique and worked commentary.
- [x] Run the same three realistic assessment tasks with the current skill and without skills, dispatched together, before editing instructions. Preserve exact reports and disclose fixture correction separately from skill behavior.
- [x] Finish the named-source ingest and verify provenance, catalog, scoped commit and synchronization.

## 2. Implement guidance

- [x] Update `skills/prose-reading-level/SKILL.md` capability and triggers for assessment, suitability ratings and proposed changes. Route assessments directly to `references/assessment.md`; retain adaptation and comparison entrypoints.
- [x] Create `skills/prose-reading-level/references/assessment.md` with intake, six dimensions, five support labels, four overall recommendations, evidence-linked actions, no aggregate grade score, source preservation, optional diagnostic procedure and original worked example.
- [x] Scope `references/reading-level.md`'s short-note default to drafting/adaptation so it does not contradict requested rubric reports.
- [x] Update the README skill row and teaching/reader section with the natural assessment request, output and validation limits.

## 3. Evaluate behavior

- [x] Repeat the three task packet with amended skill versus no skill, dispatched together. Source bytes must stay unchanged; record actual tools and diagnostic statuses.
- [x] Give anonymous report pairs and the original task/source packet to a separate reviewer. Evaluate six concrete concerns: audience/task, evidence, consistent anchors, useful retained challenge, proposal fidelity, and truthful diagnostic/review limits. Report local findings, not calibrated student outcomes or causal improvement claims.
- [x] Inspect metadata routing on assessment, adaptation, comparison, lesson, annotation, setup, poetry and unsupported-certification prompts. Record overlap and limits.
- [x] Preserve sanitized prompts, exact reports, reviewer output and mapping under `docs/research/2026-10-21-reading-assessment/`; include reproduction notes and a neutral result summary.

## 4. Verify packaging

- [x] Apply compatible patch releases for `markdown-it` and transitive `vite`; run `npm audit --json` and inspect lockfile scope.
- [x] Set 0.12.0 consistently in package and plugin manifests and lockfile root entries. Describe the assessment capability in plugin discovery text.
- [x] Run `npx vitest run tests/skills.test.ts tests/readability.test.ts tests/teaching.test.ts --reporter=dot --maxWorkers=3`, `npm run typecheck`, `npm run refs:check`, and `npm test -- --reporter=dot --maxWorkers=3`. Inspect the actual summaries.
- [x] Check all new resource links and recursively scan public text and nested evaluation archives for local paths, private project names and development-only dependencies. Inspect invisible Unicode controls in changed skill text.
- [x] Obtain independent review against this spec; fix material findings and rerun affected checks.

## 5. Ship and release

- [ ] Fetch and rebase the unpublished feature branch onto latest default; commit scoped files, push, and open a source PR using a body file.
- [ ] Verify both OS CI jobs at the final head, mergeability and review; squash merge without bypasses. Confirm merge state before remote branch deletion. Fast-forward the main checkout while preserving unrelated local files.
- [ ] Verify merged and reviewed trees match. Create annotated `v0.12.0` at the merge, publish the GitHub release and attach the sanitized research evidence archive. Verify downloaded asset hash.
- [ ] Verify the tagged managed runtime in an isolated home and npm prefix, without replacing the normal global CLI.
- [ ] In a sibling marketplace worktree, update only the Agent Prose entry and README row to the exact tag/merge SHA. Review, squash merge and fast-forward the marketplace checkout.
- [ ] Update project architecture, assessment reference and roadmap state, record release evidence, and complete scoped documentation synchronization.
- [ ] Audit every requirement before reporting completion.
