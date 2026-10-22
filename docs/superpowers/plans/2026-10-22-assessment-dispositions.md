# Suggestion disposition implementation plan

**Goal:** Save accept/reject/defer/pending decisions and review notes for every batch suggestion.

**Architecture:** Keep assessment snapshots immutable; store current decisions in a hash-bound review
sidecar using the existing locks and atomic writes. Extend the current CLI, authenticated server and
proof-desk controller. No source edits are applied.

- [x] Inspect current worktree, assessment contract, shared controls and project guidance. Reuse the existing isolated feature branch and review theme.
- [x] Write and observe failing storage/CLI/HTTP tests for persistence, reset, notes, revision conflicts, snapshot preservation and identities.
- [x] Add derived proposal identities, separate validated review state and compound revisions in `src/assessment.ts`; add the CLI and POST route; bump the server API.
- [x] Write and observe failing browser tests. Add shared accept/reject/defer/reset controls, optional notes, progress, retained drafts and reload/conflict behavior in `assessments.js` and the shared stylesheet.
- [x] Update the directly linked skill contract and examples. Run paired guidance checks and independent implementation review.
- [x] Verify focused/full checks, typechecking, reference generation, portable content and the updated demo. Update project documentation and commit locally. Release remains separate.

Verification: 150 test files / 2,911 passed with two existing skips; typecheck and generated references
pass. Independent review's hidden-competing-note finding was reproduced and fixed with an inspectable
saved-note comparison and Use saved note control. A separate regression prevents a present empty
review file from silently appearing unreviewed. Light/dark/320px previews retain the shared theme.
The local demo includes current controls; source/report snapshots remain unchanged. Paired skill
results are in `docs/research/2026-10-22-assessment-batch-yoda.md`.
