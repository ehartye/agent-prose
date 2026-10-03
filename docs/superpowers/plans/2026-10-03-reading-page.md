# LAN Reading Page (M3b) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A token-guarded LAN server and a plain-JS page where the owner reads, hears and compares variants, with every write going through the CLI and every judgement landing in the taste log.

**Architecture:** An append-only session event log folded by a pure function; a Node `http` server (no framework, no build) that serves a fixed set of page files and a JSON API and shells out to `prose` for writes; CLI commands for the agent hand-off. Pattern source: agent-beeps' audition server (the sibling agent-beeps repository: `src/audition/*`, `runtime/audition/*`); read it for routes, address ranking and page structure, but adapt to text and to the rules below.

**Tech Stack:** Node 24 running TypeScript directly, `node:http`, zod, commander, vitest (all existing); plain JS/HTML/CSS for the page. No new dependency.

Design: `docs/superpowers/specs/2026-10-03-reading-page-design.md` (source of truth for names, routes, events and security rules). Related: `docs/superpowers/specs/2026-10-02-agent-prose-design.md`, the owner-loop code in `src/owner/*` and `src/commands/set.ts`.

**Working agreements for every task**
- Branch `reading-page`; never commit to `main`. TDD: write the failing test, quote the failing line, then implement. Never weaken a test silently; list every changed expectation.
- Match the surrounding code (comment density, naming, `ProseError` codes, JSON by default). Read `src/owner/{sets,pick,prediction,verdicts,fsutil,paths,check}.ts`, `src/commands/set.ts`, `src/commands/taste.ts`, `src/errors.ts` and the beeps files named above before writing.
- Run `npx vitest run` (three times at the end of a task that touches processes or ports), `npm run typecheck` and `npm run refs:check` before each commit; commit style `feat: ...`/`test: ...`; end commits with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Tests never touch the real home or a fixed port: use `useTempHome()`/`tmpProject()` helpers and port 0 (ephemeral). Servers started in tests are always closed in `afterEach`.
- No private paths, owner names or notes references in any committed file (a test enforces it).

---

### Task 1: Session model, fold and units (pure)

**Files:** Create `src/reading/session.ts`, `src/reading/units.ts`, `tests/reading-session.test.ts`, `tests/reading-units.test.ts`.

- [ ] Event union (zod, discriminated on `type`): `play {index, mode}`, `lineup {kept: number[], duds: number[], order: number[]}` (order = the randomised display order), `duel {a, b, outcome: 'a'|'b'|'tie'|'bothBad', position: 'ab'|'ba', eventId}`, `note {index, unit: number, text <= 500}`, `peek {index}` (the owner opened "what changed?"), `refine {champion, directions: Direction[<=4], like: number|null}`, `round {n, setId, candidates}` (agent only; the planned `refineFailed` event was dropped, nothing emitted it), `ship {champion}`, `abandon`. Every stored event gets `at` and `seq`. `CLIENT_EVENTS` = play, lineup, duel, note, peek, refine, ship, abandon.
- [ ] `SessionSchema` (`prose/session@1`): id, setId, project, form, register, prompt, createdAt, `shown` (the set's frozen shown indexes), `hashes` (index -> sha256 frozen at predict time), `target` (minutes or words, from the draft's declared target, nullable), `wpm`, `candidates: [{index, name, direction, round}]`.
- [ ] `foldSession(session, events) -> SessionState` (pure): stages `lineup | duel | refine | waiting | shipped | abandoned`, round, candidates, lineup, kept, duds, shortlist (the pinned champion after round 0 plus kept), duels, champion (by duel score with shortlist-order tie-break), pendingRefine, shipped, notes, event count. Mirror beeps' `foldSession` semantics (read it) with the tie/bothBad rules from the spec: `tie` scores nothing, `bothBad` scores both down by one.
- [ ] `checkTransition(state, event)`: which event is accepted in which stage; normalises lineup marks (indexes outside the lineup dropped); rejects with `ProseError('E_CONFLICT', ...)` and a hint. `nextPair(state)`: the least-compared pair among the shortlist, deterministic given the state, never a pair already asked.
- [ ] File I/O helpers in the same file: `openSession`/`readSession`/`readEvents`/`appendEvent` (append with one `appendFileSync`, validating against the transition table AFTER folding the current log), under the project's `.agent-prose/sessions/<id>/`; ids via the existing id helpers; atomic writes for `session.json` and `reveal.json`. Tolerant reader: bad JSONL lines are skipped and counted, like the verdict readers.
- [ ] `src/reading/units.ts`: `unitsOf(variantText, format): string[]` splitting prose into sentences (existing `sentences()`), verse/dialog/script into lines, keeping a stable index so a note's `unit` refers to the same unit on every load; tests with Markdown, Fountain and a dialog YAML variant, and an empty variant.
- [ ] Tests: the fold on a scripted event log for each stage; transitions (lineup before duel, duel only between shortlist members, no events after ship); `nextPair` determinism and exhaustion; reader tolerates garbage lines; notes and peeks do not change the stage; unit splitting stable across calls.
- [ ] Commit.

---

### Task 2: Duel verdicts and `prose set duel`

**Files:** Modify `src/owner/verdicts.ts`, `src/owner/pick.ts` (or a new `src/owner/duel.ts`), `src/commands/set.ts`, `src/owner/stats.ts`; create `tests/owner-duel.test.ts`; update tests that pin the verdict `kind` enum (list them).

- [ ] `VerdictSchema.kind` becomes `z.enum(['pick','duel','tie','bothBad'])`; rows stay `prose/verdict@2`. Add optional `eventId` (string, strict object stays strict) to the schema. Dedupe key gains `kind` and `eventId` (a duel repeated with a new eventId is a new judgement; a retry with the same eventId is skipped). Existing @2 rows (kind `pick`, no eventId) must still parse and dedupe exactly as before (test with a row written by 0.2.0 code: keep a fixture).
- [ ] `recordDuel(project, setId, { a, b, outcome, eventId, position })` under the per-set lock (use `withSetLock` and heartbeats like `recordPick`): requires both variants in the set's frozen `shown` list when a prediction is sealed (else the check's `keep`), verifies the frozen hashes, builds rows with the existing vector code (`x` from `features.ts`, `FEATURE_SET_ID`), weight 1 for a decisive duel, and for `tie`/`bothBad` one symmetric row with `winner`/`loser` = a/b in shown order and weight 1 (document in the file header that M3c decides how to read them). Appends to the project and global logs with one `appendFileSync` each and dedupes by key. Returns `{ appended, skipped }`.
- [ ] CLI `prose set duel <id> --a <n> --b <n> --outcome a|b|tie|bothBad [--position ab|ba] [--event-id <id>]`; JSON like `set pick`; errors via the existing codes (`E_USAGE`, `E_CONFLICT`, `E_NOT_FOUND`).
- [ ] `prose taste stats` counts only `pick` rows for the hit rate (a duel is not a prediction test), reports duel counts separately; test.
- [ ] Tests (red first): decisive duel appends one row with weight 1; retry with the same eventId appends nothing; a different eventId appends; tie and bothBad rows shaped as above; a variant edited after sealing refuses the duel (`E_CONFLICT`); a 0.2.0-shaped row fixture still reads and dedupes; the three-process race on `set duel` yields exactly one append per eventId.
- [ ] Commit.

---

### Task 3: Server core (token, static pages, read API, addresses)

**Files:** Create `src/reading/server.ts`, `tests/reading-server.test.ts`, `tests/reading-addresses.test.ts`, placeholder page files `runtime/reading/index.html`, `runtime/reading/app.js`, `runtime/reading/style.css` (a minimal "hello" page; the real page is Task 6). Modify `scripts/managed-runtime.js` (`RUNTIME_FILES` gains `runtime`) and its test if it lists the files.

- [ ] Port `ServerInfo`, `serverInfoFile` (under `proseHome()`), `readServerInfo`/`writeServerInfo` (atomic), `serverToken` (persisted 128-bit hex), `registerProject`, `rankAddresses`, `lanAddress`, `probe`, `SERVER_API`, `DEFAULT_PORT` (pick a free default distinct from beeps' 47301, e.g. 47311), `sameToken` (`timingSafeEqual`) from the beeps server, adapted to prose names (`x-prose-token`, `ProseError` with `E_SERVER`). `E_SERVER` moves from reserved to active codes (update `src/errors.ts` and the capabilities test; list the change).
- [ ] `ReadingServer` class: `listen()` (port 0 allowed), `close()`, `route()`. Security headers on every response: `Cache-Control: no-store` (API), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'`. Static files only from a fixed allow-list map (`/`→index.html, `/s/<id>`→index.html, `/app.js`, `/style.css`) read from `runtime/reading` next to the code; any other path 404s; never join a request path to the filesystem.
- [ ] API: `GET /api/health` (unauthenticated: `{ ok, authed, pid, api }`), `GET /api/sessions` (token required; sessions across registered projects, newest first), `GET /api/session/<id>` (the page payload: session, folded state, candidates with `units` for the display order recorded in the lineup event or a deterministic shuffle seeded by the session id before the lineup exists, `wpm`/`target`, NO prediction and NO direction/feature words unless a `peek` was recorded), `GET /api/session/<id>/reveal` (404 `E_NOT_FOUND` until shipped). 401 with `E_SERVER` and the link hint when the token is wrong. Ids `^[a-z0-9-]+$`; unknown project/session 404; method not allowed 405; malformed URL 400.
- [ ] Variant text for the payload is read by set id + variant index through `variantPath` (never a client path), each file's sha256 compared with the frozen hash; a changed variant is returned with `changed: true` and no choose affordance.
- [ ] Tests: wrong/missing token 401, health open; path traversal (`/..%2f..`, `/api/session/../x`, `%00`) rejected and never touches the disk outside the allow-list; static allow-list; security headers present; payload contains no prediction and no direction words before a peek; reveal 404 before ship; unknown ids 404; address ranking cases copied and adapted from beeps' tests (virtual adapters dropped, ordering); `server.json` token persists across a restart and a stale `SERVER_API` is replaced (unit-test the decision function).
- [ ] Commit.

---

### Task 4: Server events, shell-out writes, reveal, non-blocking

**Files:** Modify `src/reading/server.ts`; create `tests/reading-events.test.ts`, `tests/reading-nonblocking.test.ts`.

- [ ] `POST /api/session/<id>/event` (body <= 64 KB, JSON): only `CLIENT_EVENTS` accepted (403 for `round`); validate with the zod union; `checkTransition` against the folded state; then, for events that are judgements, run the CLI write FIRST and append the event only if it succeeds: `duel` -> `prose set duel ... --event-id <session>-<seq or uuid>`, `ship` -> `prose set pick <set> --pick <champion>` (the existing weighted rows plus the reveal); `play`, `lineup`, `note`, `peek`, `refine`, `abandon` append directly (no taste write). Shelling out: `process.execPath` + the same `scripts/prose.mjs` entry the tests use, via `execFile` (async, never `execFileSync`), `AGENT_PROSE_HOME` passed through, a timeout of 15 s, stdout parsed as JSON, an error mapped back to the page as the CLI's `{ error: { code, message, hint } }` with status 409 for `E_CONFLICT`, 400 `E_USAGE`, 500 otherwise. A retried POST with the same client `eventId` is idempotent (the CLI dedupe plus a check of the log).
- [ ] Sealed prediction rules: after a successful ship the reveal (prediction, whether it matched, the owner's pick, hit/miss from the CLI's reveal file) is written by the CLI and served by `/reveal`; before it, no response contains prediction text (a test fuzzes every GET after every event type).
- [ ] A `refine` event moves the session to `waiting`; it is satisfied only by the CLI `round` (Task 5).
- [ ] Non-blocking proof: a test holds the per-set lock from another process (the repo's `tests/lock-holder.mjs` helper), POSTs a duel (it must come back with a conflict error within the lock timeout, not hang the server), and while that request is pending a `GET /api/health` returns within 200 ms.
- [ ] Tests: each event type's happy path appends one event and, for duel/ship, one batch of verdict rows; a failing CLI write appends nothing and returns the CLI's error; double POST same eventId = one verdict row; transition violations 409; `round` from the page 403; oversize 413; invalid JSON 400; events after ship rejected; a note on an out-of-range unit rejected.
- [ ] Commit.

---

### Task 5: CLI commands (`serve`, `reading ...`)

**Files:** Create `src/commands/reading.ts`, `tests/reading-cli.test.ts`. Modify `src/cli.ts`, `src/commands/capabilities.ts`, `README.md` (command table).

- [ ] `prose serve [--local] [--port <n>] [--foreground] [--stop] [--status]`: idempotent start (probe the recorded server; reuse it when the API level matches, replace it otherwise), detached background process by default (copy the beeps spawn approach: `spawn(process.execPath, [script, 'serve', '--foreground', ...], { detached: true, stdio: 'ignore' })` and poll `probe` up to 15 s, `E_SERVER` with a hint (`prose serve --foreground`) on failure). Output JSON `{ url, token omitted from logs?, pid, port, host, addresses, notice }` where `notice` states plainly that anyone on the network with the link can read the drafts in registered projects (and that `--local` avoids it). Windows Firewall hint when the first LAN probe from another address cannot be tested: print the port and the allow-rule hint.
- [ ] `prose reading open --set <id> [--no-predict] [--prompt <text>]`: requires the set to pass its check; requires a sealed prediction (`E_PREDICTION_REQUIRED`, hint to run `prose predict ...` or `--no-predict`); freezes `shown`/`hashes` from the prediction (or the current keep list with a `--no-predict` session); starts the server if needed, registers the project, prints `{ id, url, ipUrls, wait: 'prose reading wait --id <id>' }`.
- [ ] `prose reading wait --id <id> [--timeout <s>]`: polls the event log (200 ms) until a `refine`, `ship` or `abandon` event arrives; prints the request with a `next` hint (champion, directions, like, notes grouped by variant with the note text and the unit's text) or `{ timeout: true }`; exit 0 either way.
- [ ] `prose reading round --id <id> --set <new-set>`: validates the new set against its check, appends the `round` event (server-side only event, allowed from the CLI), the candidates join the session with the pinned champion.
- [ ] `prose reading status|list|close`: status shows the folded state and, once shipped, the reveal; list shows sessions; close appends `abandon` if still open.
- [ ] Errors use the existing codes; `E_SERVER` for server problems. Capabilities lists the commands; README gets a short 'Reading page' section (what it is, the exposure notice, `--local`).
- [ ] Tests (CLI spawned with a temp home and port 0 where possible; use `--foreground` in-process via the class for most): open without a prediction fails with `E_PREDICTION_REQUIRED`; open with one prints a URL carrying the token; wait returns on a posted refine; round answers it; status after ship contains the reveal; list/close; `serve --stop` idempotent; `serve` twice reuses the running server; the notice text is present.
- [ ] Commit.

---

### Task 6: The page

**Files:** Replace the placeholder files in `runtime/reading/` (`index.html`, `app.js`, `style.css`); create `tests/reading-page.test.ts`.

- [ ] Mobile-first single page app in plain JS, no dependencies, no build, system fonts, no external requests, readable on a phone at arm's length (serif reading face for variants, 18px+ base, comfortable measure, high contrast, a dark scheme via `prefers-color-scheme`). Screens by stage from the payload: **lineup** (variants as cards A, B, C... in the recorded order, each with keep/dud, a Play button, a sentence/line-anchored note affordance and the timing bar), **duel** (two variants side by side on wide screens, stacked on a phone; buttons A / B / Tie / Both bad; sides randomised and `position` sent), **refine** (champion shown, direction chips from the payload's vocabulary, optional 'more like' variant, a Send to agent button, then a waiting state that polls), **shipped** (the reveal: the agent's sealed pick and shortlist, matched or not), **abandoned**.
- [ ] Read-aloud: Web Speech (`speechSynthesis`) per variant; highlight the current unit using `boundary` events with a fallback to unit-by-unit utterances when the voice emits no boundaries; Stop/Pause; a timing bar showing estimated minutes (from `wpm`, as measured by the CLI and sent in the payload) against the declared target (when there is one) and the measured on-device time after a full read; a clear message when `speechSynthesis` is unavailable.
- [ ] The 'what changed?' toggle sends a `peek` event and then shows direction words and the measured differences from the base; hidden by default.
- [ ] Safety: all draft text via `textContent`/`createTextNode` only; no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or inline handlers; the page sends the token from `?t=` or sessionStorage in the `x-prose-token` header and strips it from the visible URL with `history.replaceState` after load.
- [ ] Tests: a static test over `runtime/reading/*` fails on any of the banned APIs; a jsdom-free test that loads `app.js` in a `vm` sandbox with a minimal fake DOM is NOT required: instead the real-browser pass in Task 7 covers behaviour. Add a test that every file referenced by `index.html` exists, that the managed runtime copies `runtime/reading/*` (fingerprint changes when a page file changes) and that the CSP in the server allows exactly what the page uses (no inline script or style: `index.html` has none).
- [ ] Commit.

---

### Task 7: Real-browser verification (controller or an agent with Playwright MCP tools)

- [ ] Seed a temp project (Markdown speech draft with a target, a set with three variants, a sealed prediction), start the server on an ephemeral port with a temp home, open the session URL in Chromium via the Playwright MCP tools at 390x844 and 1280x800. Walk the whole flow: lineup (keep two, dud one, add a note on a sentence), duel (each outcome at least once across runs), refine with two directions (the CLI `wait` and `round` answer it from a shell), a second round, ship, reveal. Also: a variant whose text contains `<script>alert(1)</script>` and `<img src=x onerror=...>` renders as text; the wrong token shows a clear error; stopping the server mid-session shows a reconnect message; read-aloud buttons exist and the unavailable-speech message shows in a context without voices.
- [ ] Save screenshots under `docs/research/reading-page/` (phone and desktop, lineup/duel/refine/reveal), take the console log, and write `docs/research/reading-page-verification.md` with what passed, what failed and what was fixed. Fix defects found (new red tests first where logic is involved) and re-run until clean.
- [ ] Commit.

---

### Task 8: Skill, docs, full verification, review, merge

- [ ] `skills/prose-review/SKILL.md`: add the reading-page flow (predict, `prose reading open`, give the owner the link and say it is visible on the network, `prose reading wait`, answer refine requests with a new set and `prose reading round`, read the reveal), keeping the skill body short and the description trigger-focused; update the skills tests (frontmatter, trigger phrases) and the eval fixtures only if a test requires it. Run yoda-style checks on the changed skill (description length under 1,536, one-level references, no positional-parameter placeholders, behaviour baseline reasoning noted in the PR).
- [ ] README and `craft/GUIDE.md`: the reading page, the exposure notice, `--local`, what the page does and does not do; update the architecture/roadmap statements in the repo docs that say M3b is not built.
- [ ] Run the whole suite three times, `npm run typecheck`, `npm run refs:check`; confirm nothing under `~/.agent-prose` changed (only `releases`).
- [ ] Final whole-branch code review by a fresh reviewer (spec compliance first, then quality, then a security pass: token handling, header set, path handling, event-loop blocking, XSS, DoS limits, secrets in logs), then fix findings.
- [ ] Controller: squash onto a clean branch, leak-scan, PR with CI on Ubuntu and Windows, squash-merge, update the maintainer notes (status, architecture, roadmap), push. No version bump until the verse skills land (see the verse engine spec): release as 0.3.0 with them or as 0.4.0 if the reading page ships first.
