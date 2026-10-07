# Professional Events Implementation Plan

> Execute inline under the existing authorization; behavioral evaluations use independent agents under the skill-authoring workflow. Track the steps below.

**Goal:** Release two evidence-backed skills for professional presentation planning and webinar production.

**Architecture:** Short skill entrypoints route to focused references. Existing speech forms measure separate narration files; available presentation tools create deck files. No new CLI or service adapter.

**Tech Stack:** Markdown, JSON manifests, Node 24, Vitest, GitHub CLI.

## 1. Research and baseline

- [x] Inspect skills, speech measurement, packaging, release and installation patterns.
- [x] Run baseline customer-webinar and executive-presentation tasks without skills; preserve their complete output.
- [x] Finish primary-source discovery, verify source claims, capture and ingest the named source set.
- [x] Run the unmodified repository test suite in the feature worktree.

## 2. Author and integrate

- [x] Change the existing skill inventory expectation to include `prose-presentation` and `prose-webinar`; run `npx vitest run tests/skills.test.ts` and confirm the inventory fails before adding the skills.
- [x] Add each `SKILL.md` and its directly linked reference. Implement the artifact requirements and evidence boundaries in the design.
- [x] Update the speech routing text, README skill table and plugin description. Keep the existing eight craft guide families and 24 forms unchanged.
- [x] Verify packaged skill references and parse/measure the documented narration examples in `tests/professional-events.test.ts`.
- [x] Run `npx vitest run tests/skills.test.ts tests/professional-events.test.ts tests/version.test.ts`.

## 3. Behavior and release

- [x] Run the same two tasks with and without skills in one paired round; archive artifacts and obtain an independent rubric review. Exercise near-miss metadata routing. Correct demonstrated failures only.
- [x] Bump package, root lockfile version, lockfile root-package version, plugin version and local marketplace entry to 0.9.0.
- [x] Run `npm test`, `npm run typecheck`, `npm run refs:check`, and `git diff --check`.
- [x] Run isolated `node scripts/setup.js --json`, verify version and packaged references, and exercise the narration example through `scripts/run-managed.js`.
- [ ] Commit only task files, fetch/rebase on the latest default branch, push and create a concrete PR. Review diff and both OS CI results, then squash merge using the current head SHA.
- [ ] Publish `v0.9.0` from the verified merged commit and verify the release/tag.
- [ ] Change only agent-prose's shared marketplace version/description on its own feature branch; PR, review and squash merge. Preserve other plugin entries.
- [ ] Update project architecture, design decision and shipped roadmap state in the knowledge vault; validate links/catalogs, commit on main through operation tooling and push.
