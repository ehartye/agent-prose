# Batch passage assessment implementation plan

**Goal:** Evaluate ten passages against one reader profile and browse their individual reports in the shared review UI.

**Architecture:** Immutable source/report snapshots in a small validated store; the existing authenticated ReadingServer and proof-desk shell provide the viewer. The agent authors qualitative assessments; deterministic tools validate, store and present them.

- [x] Inspect existing assessment guidance, shared UI/server patterns and relevant project evidence. Create an isolated feature worktree; install from the lockfile and verify a focused baseline.
- [x] Write failing behavior tests for ten-passage storage, exact evidence binding, pending reports and contained state paths. Implement `src/assessment.ts` to pass them.
- [x] Write failing HTTP/browser tests for authenticated assessment viewing and ten-item selection. Add `src/commands/assessment.ts`, register commands, extend ReadingServer and its shared assets, and register the new mode in `app.js`.
- [x] Implement `runtime/reading/assessments.js` with shared queue/disclosure/notice primitives; extend only `runtime/reading/style.css` for the three-pane composition and narrow layout. Verify navigation, per-passage scroll, URL selection, overview, pending/error states and shared settings.
- [x] Surface the workflow and exact input example through the existing reading-level skill and README. Preserve the individual-report workflow and all grade-certification limits. Run paired skill checks before claiming the new guidance works.
- [x] Create a ten-passage local demo. Inspect light/dark/phone screenshots and correct material layout or content issues. Obtain independent implementation review and fix material findings.
- [x] Run focused storage/HTTP/UI/skill tests, typecheck, generated-reference checks and the full suite. Inspect public content for machine/private-project references. Document as-built behavior and verification in the project documentation.
- [x] Commit the completed feature on its branch and provide the working demo and handoff. Publication and a new release are separate from this local implementation request.

Verification: the full suite passed 150 files / 2,903 tests with two existing skips. Typecheck,
generated references and whitespace checks passed. After adding keyboard-scroll and 320px-width
coverage, the focused storage/workbench tests passed again. Independent review found no remaining
material issue after the mobile fragment regression was corrected. Paired skill checks are recorded
in `docs/research/2026-10-22-assessment-batch-yoda.md`; they do not establish learner outcomes.
