# Taste Model (M3c) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Bradley-Terry taste model over the twelve style features, a plain-words profile, a sealed model prediction scored beside the agent's, and uncertainty-based duel selection.

**Architecture:** Pure model code (fit, layers, summary) separate from file loading; the sealed model prediction is its own file so the agent's prediction schema is untouched; the reading server consumes a cached model off the request path. Pattern source: agent-beeps `src/taste/{model,select,summary}.ts` (read them; adapt, do not copy beeps feature names).

**Tech Stack:** Node 24 running TypeScript directly, zod, commander, vitest (all existing). No new dependency.

Design: `docs/superpowers/specs/2026-10-03-taste-model-design.md` (source of truth for rules, file shapes and names).

**Working agreements for every task**
- Branch `taste-model`; never commit to `main`. TDD: failing test first, quote the failing line, then implement. Never weaken a test silently; list every changed expectation.
- Match surrounding style. Read `src/owner/{verdicts,features,stats,pick,duel,prediction,fsutil,paths}.ts`, `src/commands/{taste,set}.ts`, `src/reading/{server,session}.ts` before writing the parts you touch.
- Run `npx vitest run` (twice where processes or ports are involved), `npm run typecheck`, `npm run refs:check` before each commit; commit style `feat:`/`test:`/`docs:`; end commits with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Tests never touch the real home or a fixed port; servers started in tests are closed in `afterEach`; no private paths or notes references in committed files (a test enforces it).

---

### Task 1: The model, its layers, the loader and the summary (pure plus file loading)

**Files:** Create `src/taste/model.ts`, `src/taste/load.ts`, `src/taste/summary.ts`, `tests/taste-model.test.ts`, `tests/taste-load.test.ts`, `tests/taste-summary.test.ts`.

- [ ] `model.ts`: port of beeps' Bradley-Terry fit (`fitBT`, `utility`, `pWin`, `standardErrors`, `rank`) over `FEATURES` from `src/owner/features.ts` (DIM = 12). Pair building follows the spec table (pick/duel as written, tie skipped, `bothBad` as two half-weight losses to the zero vector). `PROJECT_LAYER_MIN = VOICE_LAYER_MIN = 15`. `fitLayered({ globalRows, projectRows, voiceRows? })` returns `{ w, cov, n, layers: Array<{ name: 'global'|'project'|'voice'; pairs: number }>, usable: boolean }` where `usable` is false when the fitted pairs are zero. Guard degenerate input (all-identical vectors, singular Hessian): never NaN; return the prior with a large covariance and `usable: false`.
- [ ] `load.ts`: `loadTaste({ project, voice? })` reads the project log (`<project>/.agent-prose/taste/verdicts.jsonl`) and the global log with the existing tolerant readers (`readVerdicts`), keeps rows with `features === 'v1'` only and counts `{ skippedVersion, malformed, unknownVersion }`, excludes the current project's rows from the global set (compare with `projectKey`), selects voice rows (`row.voices` includes the voice id), and returns `{ model, layers, counts }`. `resolveVoice(project, set)` returns the single resolved voice id of a set's base draft or `null` (zero or several): reuse the voice resolution code that `recordPick`'s `docsContext` uses rather than copying it.
- [ ] `summary.ts`: `summarize(model, counts) -> { preferences, markdown, enough }` with the twelve feature word pairs from the spec (length: longer/shorter; sentence: longer sentences/shorter sentences; rhythm: more varied sentence rhythm/more even rhythm; wordLen: longer words/shorter words; variety: richer vocabulary/more repetition; contractions: more contractions/fewer contractions; hedges: more hedging/less hedging; passive: more passive voice/less passive voice; exclaim: more exclamations/fewer exclamations; question: more questions/fewer questions; secondPerson: more direct address ("you")/less direct address; nominal: more noun-heavy phrasing/plainer verbs), confidence strong/weak/unknown (|w|/se above 2 / above 1 / else), sorted by confidence, the layers and pair counts, the sentence that these are style tendencies in the owner's choices and not rules or quality, and an honest "not enough judgements yet" text when `usable` is false or no feature is above unknown.
- [ ] Tests (red first, quote the failing line): synthetic data generated from known weights (seeded) is recovered within a stated tolerance and the recovered sign of each large weight is right; no data gives the neutral prior and `usable: false`; the project layer engages at exactly 15 pairs (14 does not) and its weights sit between the global weights and the project-only fit for small project data; the voice layer likewise; ties are ignored (a log of only ties is unusable); a `bothBad` row yields two half-weight losses to the zero vector (assert through the fitted direction); rows with `features: 'v2'` are skipped and counted; torn and garbage lines are tolerated and counted; the current project's rows are excluded from the global fit; a degenerate log produces no NaN; the summary orders by confidence, uses the right word for each sign, and says so when there is not enough data; a fit over 2,000 rows completes in well under a second (loose bound).
- [ ] Commit.

---

### Task 2: `prose taste show` and the extended `taste stats` shell

**Files:** Modify `src/commands/taste.ts`, `README.md`; create `tests/taste-cli.test.ts`.

- [ ] `prose taste show [--voice <id>] [--dir <project>]`: JSON `{ project, voice, layers, counts, enough, preferences, markdown }` using `loadTaste` and `summarize`; works outside a project with `--all-projects`-style behaviour only for the global layer (follow how `taste stats` handles `needProject`; outside a project it reports the global layer and says so). No project and no data gives a clear "no judgements yet" result, exit 0.
- [ ] Tests (CLI through the repo helper with a temp home; seed verdict logs by writing rows with the existing writers): show on empty logs; show with a seeded owner who prefers shorter sentences gives that preference as `strong` and the words are right; `--voice` with fewer than 15 pairs does not claim a voice layer; skipped-version rows are reported in `counts`.
- [ ] README: a short 'Taste' section (what it learns, what it cannot know, the commands).
- [ ] Commit.

---

### Task 3: The sealed model prediction, its reveal and the comparison in stats

**Files:** Create `src/taste/prediction.ts`, `tests/taste-prediction.test.ts`; modify `src/owner/prediction.ts` only if a shared helper must be exported, `src/owner/pick.ts`, `src/owner/verdicts.ts` (ledger schema), `src/owner/stats.ts`, `src/commands/set.ts` (predict output), `src/commands/taste.ts` (stats), tests that pin ledger rows or stats output (list each change).

- [ ] `writeModelPrediction(project, set, agentPrediction, options)`: called by the same code path that writes the agent's prediction (the `predict` command) after it succeeds. Loads the taste with the set's resolved voice, centres the shown variants' vectors the way `shownContext` does, ranks with `rank`, builds `prose/model-prediction@1` per the spec (ranking, pick, top-three shortlist or `pick: null` with an `abstained` reason, layers, weights, `features`, `seal` over the fields plus the agent prediction's `shown` and `hashes`) and writes `<set>/model-prediction.json` atomically under the set lock (reuse the lock context of the predict call; do not take a second lock). A failure to build the model prediction must never fail `prose predict`: write an abstention with the reason instead.
- [ ] `recordPick` reveal: read and verify the model prediction (seal valid, hashes and shown match the agent's frozen ones, features `v1`); score `hit`, `shortlistHit`, `abstained`, `sealValid`, `voided` (set when the file is missing, edited or mismatched while the agent's prediction exists; a model that abstained is not a miss); add an optional `model` object to the `prose/ledger@1` row (schema extended with an optional field, old rows still parse and dedupe exactly as before, write a test with a 0.3.0-shaped row). `reveal.json` and the CLI's pick output gain the model's pick beside the agent's, only after the pick is recorded.
- [ ] `predictionStats` returns `agent` and `model` blocks (predicted, hits, shortlistHits, voided, abstained for the model, rate, recent-window rate) and a `comparison` `{ both, modelBetter, same, agentBetter }` over sessions where both predicted; `prose taste stats` prints it. Existing agent fields keep their names and meaning (do not break the current output shape: add, do not rename).
- [ ] Tests (red first): predict with no verdicts writes an abstaining model prediction and the agent's prediction is unchanged; with a seeded log the model's pick follows the learned preference; the seal detects an edit; pick reveals both and scores them; a deleted or edited model file is a miss only when the model had predicted; a variant changed after sealing voids both as it does today; ledger rows without `model` still read; stats separate agent and model and compute the comparison; abstentions are counted and not scored; the model prediction is not readable through any agent-facing command before the pick (grep the command surface in a test: no `taste rank`, and `prose set show` never prints it).
- [ ] Commit.

---

### Task 4: Active duel selection in the reading server

**Files:** Modify `src/reading/session.ts` (`nextPair` takes an optional chooser), `src/reading/server.ts`, create `src/taste/select.ts`, `tests/taste-select.test.ts`, `tests/reading-taste.test.ts`; update tests that pin `nextPair` (list each change).

- [ ] `select.ts`: `nextDuel(candidates: Array<{ index; x }>, model, asked)` as in the spec (score `(1 - |2p - 1|) * (1 + sigma)`, deterministic tie-break by lowest index pair, never a pair in `asked`, null when exhausted).
- [ ] `session.ts`: `nextPair(state, pick?)` where `pick` is an optional function receiving the shortlist and the asked pairs; with no function, or when it returns null or throws, the existing least-compared rule runs. Every existing call keeps working unchanged.
- [ ] `server.ts`: a cached taste model per project keyed by the taste logs' `size:mtime`, loaded and fitted with async reads off the request path and refreshed when the key changes; candidate vectors computed once per candidate and cached by variant hash (parse the variant text, `featureVector`, `toScaledArray`); the duel pair in the page payload uses `nextDuel` when the model is usable and falls back otherwise. A failure anywhere logs one JSON line to stderr (no token, no paths) and falls back.
- [ ] Tests: `nextDuel` picks the uncertain pair over a near-certain one, is deterministic, skips asked pairs, returns null when done; `nextPair` falls back when the chooser is absent, returns null or throws; the server payload uses the model's pair for a seeded owner and the old rule with no data; the server stays responsive (health under 300 ms) while the model loads from a large seeded log; the cache is reused for an unchanged log and refreshed after a verdict is appended.
- [ ] Commit.

---

### Task 5: Skill, ADR text in the repo docs, end-to-end check, review

- [ ] `skills/prose-review/SKILL.md`: add the taste step (run `prose taste show` before drafting variants; read it as tendencies, not rules; keep your own prediction independent; the model's guess is sealed separately and compared at the end; say plainly when there is not enough data). Keep the skill within its limits and its tests green; update `tests/skills.test.ts` only as required (list changes).
- [ ] README and `craft/GUIDE.md`: the taste section is accurate to the shipped behaviour (layers, thresholds as conventions, the sealed model prediction, what stats report, limits).
- [ ] End-to-end test: a synthetic owner with a known preference (always picks the variant with shorter sentences and more contractions) makes 40 picks over generated sets through the real CLI path (`predict`, `pick`) against a temp home; assert that after the early sessions the model's hit rate on later sessions is above the agent's chance rate for the same sets, that `taste show` names the preference, and that `taste stats` reports both predictors. (This tests the plumbing and the learning loop, not human taste; say so in the test comment.)
- [ ] Run the whole suite three times, typecheck and refs:check; confirm `~/.agent-prose` holds only `releases`.
- [ ] Controller: independent whole-branch review, fixes, squash, leak-scan, PR with CI on both platforms, merge. Maintainer notes: ADR to accepted, backlog item shipped. No release until the other 0.4.0 items are done.
