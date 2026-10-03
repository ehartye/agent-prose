# LAN reading page (M3b) — design

Status: draft for the 0.4.0 line (0.3.0 is the verse engine plus the poetry and songwriting skills). Builds on the owner loop shipped in 0.2.0 (variant sets, sealed predictions, `prose/verdict@2`). Pattern source: the sibling plugin agent-beeps' audition server, adapted for text.

## Goal

Let the owner read, hear, compare and choose between the agent's variants on a phone or laptop on the home network, and feed those judgements into the same taste log the CLI already writes. The agent stays in the loop through a small command set; the page never writes variants or code.

## Principles

1. **The page reads files the CLI already wrote, and every write goes through the CLI.** The server never calls the synchronous lock and write functions from a request handler (they block the event loop; the M3a reviews flagged this). It shells out to `prose` for writes, so locks, atomicity, dedupe and the sealed-prediction rules stay in one place.
2. **Reads take no lock.** The page can read while the CLI writes; the per-set lock only guards writes.
3. **Show what the agent froze.** The page offers exactly the set's `shown` variants with the hashes sealed at predict time, not a fresh check. A variant whose file changed since sealing is shown as changed and cannot be chosen (the CLI would refuse the pick anyway).
4. **The prediction is sealed until the owner commits.** The server never serves it (or any hint of the agent's pick) before the shipping event.
5. **Draft text is untrusted data in the browser.** The page uses `textContent` only, never `innerHTML`, and a strict Content-Security-Policy; a variant containing `<script>` renders as text.
6. **A proxy is not quality.** Direction words and feature descriptions are hidden by default (the owner judges the text); a "what changed?" toggle shows them and records that it was opened.

## What the owner does

1. **Lineup:** read each variant (A, B, C... in a randomised order recorded in the event), mark keep or dud. Plays and notes are engagement, not judgements.
2. **Duel:** head-to-head pairs among the kept variants, sides randomised and the position recorded; outcomes `a`, `b`, `tie` or `bothBad`. Pair choice is the least-compared pair until the taste model exists (M3c replaces it with uncertainty sampling).
3. **Refine:** pick the champion and up to four directions (the existing direction vocabulary, `src/owner/directions.ts`) and optionally a variant to be "more like". The agent receives the request, writes a new set, and the page shows the next round against the champion.
4. **Line-anchored notes:** tap a sentence (prose) or line (verse, dialog, script) in any variant and type a note. Notes travel with the refine request so the agent knows what to change.
5. **Ship:** choose the winner. The server records the pick through `prose set pick` (the existing weighted rows), then the page reveals the agent's sealed prediction and whether it matched.

Read-aloud: a play button per variant uses the browser's Web Speech API, highlights the current unit through `boundary` events, and shows a timing bar: estimated minutes from the form's words-per-minute (the measured value) against the declared target, plus the time the browser actually took on this device. OpenAI text-to-speech is not in this milestone: the accepted ADR puts cloud audio in `prose render --tts` (M4), so nothing in M3b leaves the network.

## Components

| Piece | Responsibility |
|---|---|
| `src/reading/session.ts` | `session.json`, append-only `events.jsonl`, the zod event union, the pure `foldSession`, the transition table, reveal. No I/O in the fold. |
| `src/reading/server.ts` | Node `http` server (no framework, no build): static page files, the token-guarded JSON API, health, address ranking, `server.json`. |
| `src/reading/units.ts` | Splits a variant into tappable units (sentences or lines) for notes and read-aloud, using the existing parsers and `sentences()`. |
| `src/commands/reading.ts` | CLI: `prose serve`, `prose reading open|wait|round|status|list|close`. |
| `runtime/reading/` | The plain-JS pages and CSS (mobile first, reading typography, system fonts, no external requests). |

Event and server state live in the per-user directory `~/.agent-prose/` (`AGENT_PROSE_HOME` relocates it, like the runtime and taste logs): `server.json`. Session state lives in the project: `.agent-prose/sessions/<id>/{session.json, events.jsonl, reveal.json}`.

## Server

- Default bind `0.0.0.0` so a phone can reach it, `--local` binds 127.0.0.1. `prose serve` replaces a running server of the other bind (it keeps the token and projects), so the printed link and notice always match the real bind; `reading open` takes whatever runs. The CLI prints, every time the server starts, that anyone on the network holding the link can read the drafts in registered projects, and the skill tells the agent to say so before opening a session. Traffic is plain HTTP on the LAN.
- A persistent random 128-bit token in `server.json`, compared with `timingSafeEqual`, accepted as `?t=` or `x-prose-token`. Links carry it, so the link you were given keeps working across server restarts. The page removes `?t=` from the address bar after it loads (the token stays in the tab's session storage), so a bookmark made from the address bar afterwards has no token and will not open the session: keep the original link. Mitigations for a token in a URL: `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on API responses, no third-party requests, CSP `default-src 'self'`.
- Routes: static page files (a fixed allow-list, never a path from the request), `GET /api/health`, `GET /api/sessions`, `GET /api/session/<id>` (the page payload), `GET /api/session/<id>/reveal` (404 until shipped), `POST /api/session/<id>/event`. The page may send only `play`, `lineup`, `duel`, `refine`, `note`, `peek`, `ship`, `abandon`; rounds come only from the CLI (there is no failure event: a refine request stays pending until a round answers it, and the agent says so in the conversation). Request bodies are capped at 64 KB; ids match `^[a-z0-9-]+$`; no CORS.
- Only registered project roots are served; a variant is read by set id and variant index, never by a client-supplied path.
- Idempotent start with a health probe; a running server of another `SERVER_API` level is replaced, not reused; `serve --stop`, `--status`, `--foreground`. Addresses are ranked physical LAN, other private, Tailscale, with virtual adapters (WSL, Hyper-V, Docker) dropped, and the link shows both a hostname and a phone-friendly IP link.
- Events go through one function that validates the transition table, then runs the CLI for writes. A failed CLI write returns an error to the page and appends nothing.

## Verdicts

Lineup keeps and duds, plays and notes are engagement events only. Duels and the ship become verdict rows: `prose/verdict@2` rows gain `kind` values `duel`, `tie` and `bothBad` beside `pick` (a duel has weight 1; a `tie` and a `bothBad` row hold the two variants in shown order and are symmetric, so M3c decides how to use them). Readers already count unknown kinds as malformed rather than crash, and rows from an older runtime stay readable. A new CLI write path records a duel (`prose set duel`, under the per-set lock, with an event id for idempotence so a retried POST does not double-count). The ship calls the existing `prose set pick`.

## Agent hand-off

- `prose reading open --set <id>` requires a sealed prediction (`E_PREDICTION_REQUIRED` with the existing hint, or `--no-predict`, which is recorded), registers the project, starts the server if needed and prints the session URL.
- `prose reading wait --id <id>` blocks until the owner asks to refine, ships or abandons, and prints the request (champion, directions, like, notes) plus a `next` hint.
- `prose reading round --id <id> --set <new-set>` answers a refine request with a new set; it joins the session against the champion.
- `prose reading status|list|close` as in the sibling. There is no hand-off mode in which the server writes variants itself: in this plugin the agent writes the rewrites and the tool verifies them.

## Testing

Pure tests: fold, transition table, event validation, pair selection, address ranking, units splitting. Server tests on an ephemeral port with a temp home: token required, wrong token 401, health unauthenticated, reveal 404 before ship and sealed prediction absent from every response, path and id traversal rejected, oversize body 413, page may not send `round`, a duel POST appends one row and a retry does not, ship records the pick and reveals, the event loop stays responsive while another process holds the set lock (a request during a held lock returns an error without blocking other requests). A static test greps the page code for `innerHTML`/`outerHTML`/`document.write`. A real-browser pass with the Playwright MCP tools on a seeded project: lineup, duel, refine, a note, ship, and the reveal, at phone width, with screenshots.

## Out of scope

OpenAI audio and PDF rendering (M4); the taste model and uncertainty-sampled duels (M3c); albums; accounts or HTTPS (the threat model is the home network and a link token; stated, not solved); multi-owner sessions; offline use; an editor in the page (the agent edits files, the owner reads and judges).

## Risks

- **A LAN server exposes drafts to anyone with the link.** Token plus an explicit notice on every start, `--local`, and the skill's instruction to tell the owner first. Not safe for drafts that must not be seen on a shared network; the notice says so.
- **Windows Firewall may block the first LAN connection.** The CLI says which port and how to allow it; the health probe and `--local` give a way to confirm the server itself works.
- **Web Speech voices vary by device**, so the on-device read time and delivery are indicative only (the ADR already accepts this).
- **Shelling out per write costs a process start (about 150 ms)**, which is fine for human-paced events and keeps every write rule in one place.
