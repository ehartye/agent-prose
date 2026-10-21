# Reading-Level Comparison Implementation Plan

> Use the team-development workflow in this session for the independent publication repair, comparison core and shared UI; preserve the existing feature worktree and review each against the specification before final quality review.

**Goal:** Repair publication note navigation and let authors read, edit and choose among up to three grade-level adaptations beside their immutable source.

**Architecture:** Reuse the shared proof-desk shell and authenticated ReadingServer. A small project-local manifest and compound-revision store own comparison edits and choices; they do not use the frozen taste/prediction workflow. Existing reader metadata and readability diagnostics remain authoritative for their separate purposes.

**Tech stack:** Existing TypeScript/Node, Commander/Zod, atomic writes/project locks, plain shared browser JS/CSS and Playwright/Vitest. No new dependencies.

## Tasks and ownership

- [x] Publication repair (`runtime/reading/annotations.js`, `tests/annotation-workbench.test.ts`): reproduce a real note click navigating to the parent URL, add a failing click regression, then change the embedded preview's fragment links to `about:srcdoc#…`. Keep exports and sandbox unchanged; test annotation notes and an internal destination plus theme parity.
- [x] Comparison core (`src/comparison.ts`, `src/commands/compare.ts`, `src/reading/server.ts`, `src/reading/assets.ts`, `src/cli.ts`, core/server tests): implement create/inspect/edit/choose with contained distinct files, source hash, revision checks, preserved frontmatter and stale-choice reporting. Add the existing server's `/c/<id>` page and `/api/comparison/<id>` state/edit/choose routes; advance its API level for managed process replacement. Register CLI discovery and produce the state contract below. Observe boundary failures before implementing the store.
- [x] Comparison UI (`runtime/reading/comparisons.js`, `index.html`, `app.js`, `style.css`, `tests/comparison-workbench.test.ts`, exact asset-list tests): register a mode using shared `ProseReview` primitives. Render an immutable source and one to three readable-width versions, editing body text and choosing via revision-checked APIs. Block decisions while any edits are unsaved, preserve edits on reload/conflict, show stale source/choice, and keep columns independently scrollable. Exercise actual save/choose/reopen and phone/light/dark rendering.
- [x] Integration and skills (reading-level/review references, generated references, canonical documentation): describe supplied-file comparison and agent-written adaptations with requested audience separate from diagnostics. Run focused checks, typecheck, references, independent spec then quality review, and full suite once integrated. Refresh the annotation demo without changing its sidecar; provide a new source/three-variation demo. Commit/push feature work and update the draft PR; do not merge or release.

## Shared state and transport contract

```ts
type ComparisonDocument = {
  id: string; path: string; label: string; body: string; hash: string;
  reader: Reader | null; readability: ReadabilityReport | null;
  blocks: Array<{ kind: string; text: string; line: number; meta?: Record<string, unknown> }>;
  words: number;
};
type ComparisonState = {
  id: string; title: string; revision: string; sourceChanged: boolean;
  source: ComparisonDocument; variants: ComparisonDocument[];
  choice: { variant: string; hash: string; at: string } | null;
  choiceCurrent: boolean;
};
```

The source document id is `source`; adaptation ids are `1`, `2`, `3`. Labels prefer an explicit reader target, otherwise the file stem. API GET `/api/comparison/<id>` returns `ComparisonState`; POST `/api/comparison/<id>/edit` takes `{variant, body, expectedRevision}`, and `/choose` takes `{variant, expectedRevision}`. Both return fresh `ComparisonState`. HTTP auth, Host/Origin policy and error envelopes are those of ReadingServer. The page is `/c/<id>?t=<server-token>`. CLI `open` returns that URL; `show` returns current state. A manifest id is a validated UUID. All file paths exposed in state are project-relative.

## Verification commands

```sh
npx vitest run tests/annotation-workbench.test.ts tests/comparison.test.ts tests/comparison-workbench.test.ts tests/reading-page.test.ts tests/reading-skin.test.ts
npm run typecheck
npm run refs:check
npm test -- --reporter=dot
git diff --check
```

Before claiming completion, inspect the actual source-plus-three-column demo and click a publication annotation in the refreshed managed build. Preserve and disclose any unrelated timing failures; do not weaken production or test timeouts.

Integrated verification: 148 test files and 2,888 cases passed, with two existing skips. Spec and quality review approved after a failure-first safe Markdown fallback correction. Both same-turn instruction-evaluation arms completed the workflow; no skill superiority or learner outcome is claimed. Actual managed demos and preserved-source checks passed.
