# Reading page: real-browser verification (M3b task 7)

## Environment

- Chromium driven by the Playwright MCP tools, viewports 390x844 (phone) and 1280x800 (desktop), light colour scheme, a Windows host with system speech voices (3 voices present).
- A throwaway home (`AGENT_PROSE_HOME`) and a project in the OS temp directory (named `orchard-project`), outside the repository. The server ran `prose serve --local --port 0` (127.0.0.1 only); the fixed-port check reused an ephemeral port that the first run had chosen. The real `~/.agent-prose` was never touched (it holds only `releases`, before and after). The default port 47311 was never used. The server was stopped (`prose serve --stop`) at the end.
- Seeds, each with a sealed prediction (`prose predict`) and three variants: a Markdown speech (`speech-small`, `target: 2 minutes`; variant B holds `<script>window.__pwn=1</script>`, `<img src=x onerror="window.__pwn=2">` and a 272-character unbroken word), a `sonnet-shakespearean` verse draft, and a Fountain scene. Refine rounds were answered from a shell with `prose reading wait`, `prose set new` (rewritten variants) and `prose reading round`.

## Checks

| # | Check | Result |
|---|---|---|
| 1 | Lineup at phone and desktop: keep two, pass one | PASS |
| 2 | A note on a sentence (saved, marked, listed) | PASS |
| 3 | "What changed?" on one draft (direction and disclaimer shown only once opened) | PASS |
| 4 | Duel outcomes: left, right (speech), tie (sonnet), neither (Fountain); each recorded as a verdict row (8 decisive, 1 tie, 1 bothBad over the run) | PASS |
| 5 | Refine with two directions; `reading wait` printed the request with the note; `set new` and `reading round` brought round 2 to the open page without a reload | PASS |
| 6 | Round 2 duel including the pinned champion against a new variant (cross-set); rows land in the challenger's set | PASS |
| 7 | Ship asks for confirmation ("Not yet" cancels), then the reveal; before the ship `/reveal` is 404 and no payload contains the sealed text | PASS |
| 8 | Reveal with a sealed prediction (sonnet, speech round 0) and without one (a ship from a later round says nothing was sealed) | PASS after fix 3 |
| 9 | Hostile variant renders as visible text; `window.__pwn` stays undefined; the page has exactly one `<script>` (app.js) and no `<img>` | PASS |
| 10 | Console: no CSP violation and no page error; only expected network errors while the server was deliberately killed or the token deliberately wrong | PASS after fix 1 |
| 11 | The visible URL has no token after load (history.replaceState) | PASS |
| 12 | Wrong token shows a clear message ("missing or wrong token (the link carries ?t=...)"); the heading says "missing its key" even when the token is wrong | PASS (wording noted) |
| 13 | Server killed mid-session: the reconnecting banner shows and the content stays; restarted on the same port (token kept in server.json) the banner clears by itself | PASS |
| 14 | Read-aloud: Play, Pause, Resume and Stop exist and work, the current unit is highlighted; with `speechSynthesis` absent the "isn't available" note shows and Play is hidden, no exception | PASS after fix 4 |
| 15 | Timing bar: an estimate against the 2:00 target ("About 2:46 to read - 360 words - 0:46 over the 2:00 target") | PASS |
| 16 | No horizontal overflow at 390 px on lineup, duel (including the unbroken word) and refine | PASS after fix 2 |
| 17 | Every button, select and input is at least 44x44 px at 390 px; sentence and line units (tappable for notes) were 26 px tall | PASS after fix 7 (units now 41 px or more) |
| 18 | Sonnet and Fountain variants show one unit per line with stanza and block gaps, not one paragraph | PASS after fix 5 |
| 19 | Desktop duel puts the two drafts side by side with the header aligned to the content | PASS after fix 6 |
| 20 | Phone duel: the choice is reachable without scrolling (sticky bottom bar: Draft A, Draft B, Tie, Neither works, each 51 px tall, bar bottom = viewport bottom 844; the in-card buttons are hidden); at 1280 px the bar shows only Tie and Neither works and the cards keep "This one" | PASS after fix 8 |

## Defects found and fixed

1. **The favicon request logged a 404 console error on every load.** Red: `tests/reading-server.test.ts` "favicon > answers 204 with no body ..." failed with `AssertionError: expected [ 404, ... ] to deeply equal [ 204, '' ]`. The server now answers `GET /favicon.ico` with 204 (and the security headers).
2. **A phone duel scrolled sideways** when a draft held a long unbroken word (the grid column could not shrink below its content). Red: the CSP test in `tests/reading-page.test.ts` ("stays within the server CSP") now requires `.duel-grid` to use `minmax(0, 1fr)` and `.reading` to use `overflow-wrap: anywhere`; the overflow itself was found and re-checked in the browser (scrollWidth minus clientWidth, 0 after the fix).
3. **The reveal printed a literal "null"** (a missing part was passed to `append`). Red: `tests/reading-page.test.ts` "reveal text > lists the parts of a reveal and never yields null or an empty part" failed with `TypeError: r.revealParts is not a function`; the text is now built by a pure `revealParts`.
4. **Pressing Play while speech was still being detected threw** (`Cannot read properties of undefined (reading 'speak')`) when `speechSynthesis` existed as a property but was undefined. Red: "speech support > needs a real speechSynthesis object and an utterance constructor" failed with `TypeError: r.speechSupported is not a function`; support now needs the object and the constructor, so the note shows at once.
5. **Verse and script lines were not shown as lines** (the review defect). The payload now carries `layout: 'prose' | 'lines'` and `breaks: number[]` per candidate. `unitsOf` is unchanged in behaviour; a new `layoutOf(text, format, form)` adds the layout (verse forms, Fountain and dialog are lines; Markdown prose is prose; a parenthetical stays glued to its speech). The page groups at the breaks and sets one unit per line. Red: `tests/reading-server.test.ts` "payload layout > sends a sonnet as lines with its stanza break" failed with `AssertionError: expected { index: 1, label: 'A', ... } to match object { layout: 'lines', ... }`; `tests/reading-units.test.ts` "layoutOf" failed with `TypeError: layoutOf is not a function`; `tests/reading-page.test.ts` "groups units at the payload breaks" covers `paragraphsOf`. Changed expectations: the candidate key lists in `tests/reading-server.test.ts` gained `breaks` and `layout`.
6. **The desktop header was centred at 70ch while the wide duel content was not.** CSS only (`body:has(main.wide) .site-head`); checked by screenshot, no test.

7. **Tappable units were 26 px tall on a phone.** Padding only, under `@media (max-width: 899px), (pointer: coarse)`: `.reading .unit { padding: 0.5rem 0 }` (inline padding does not move lines) and `.reading.lines .unit { padding-block: 0.15rem }`. Re-measured at 390 px: the smallest unit is 41 px, the line height is unchanged (33.66 px) and there is no horizontal overflow. Red: "phone ergonomics > gives a tappable unit a touch target of at least 40 px" (static CSS check; the measurement is the browser pass).
8. **On a phone the duel's choice was below the fold.** The cards stack, so each card's "This one" is hidden under 900 px and the sticky bottom bar carries four buttons named by the cards' draft labels (`Draft C`, `Draft A`, then `Tie`, `Neither works`) via the pure `duelBar`. Deliberate difference from the brief: the bar says "Draft A/B", not "Left/Right", because stacked cards have a top and a bottom, not a left and a right. Red: "the duel action bar > names the two cards by their labels" failed with `r.duelBar is not a function`. `lineup-phone.png` and `duel-phone.png` were retaken (390x844, Chromium, throwaway home, `serve --local --port 0`, stopped afterwards).

## Screenshots (`docs/research/reading-page/`)

Phone: `lineup-phone`, `duel-phone`, `refine-phone`, `waiting-phone`, `reveal-phone`, `reconnecting-phone`, `wrong-token-phone`, `no-speech-phone`, `hostile-phone`, `lineup-sonnet-phone`, `lineup-fountain-phone`. Desktop: `lineup-desktop`, `duel-desktop`, `refine-desktop`, `waiting-desktop`, `reveal-desktop`, `lineup-round2-desktop`, `duel-crossset-desktop`, `ship-confirm-desktop`, `lineup-sonnet-desktop`, `duel-sonnet-desktop`, `lineup-fountain-desktop`, `duel-fountain-desktop`. All are viewport captures under 100 KB.

## Observations that are not defects

- `prose serve --stop` deletes `server.json`, so the next start has a new token and no registered projects: a page opened before an explicit stop then shows the "missing its key" screen. A killed server keeps `server.json`, which is why check 13 recovers. The existing CLI test pins this, so it was left as designed.
- Fountain units leave out speaker cues (the units contract), so a script variant shows lines without who speaks them. Readable for comparing rewrites, weak for dialogue-heavy scenes; changing it means a unit-shape and read-aloud decision.
- The hint "Tap any sentence to leave a note" also shows for verse and script, where units are lines.
- A ship from a later round with no prediction for that round's set says "No prediction was sealed for this set"; the earlier round's prediction is not compared.
- The serve notice says "Use --local" even when the server already is local.

## Not verified

- A phone on the LAN: the server was bound to 127.0.0.1 only; Windows Firewall behaviour and the hostname and IP links were not exercised.
- Safari, Firefox and real mobile browsers (touch, the iOS voice list, `speechSynthesis` boundary events); only Chromium with desktop voices.
- Audible speech quality: highlighting and control states were checked, not the sound.
- The dark colour scheme and `prefers-reduced-motion`.
- Screen-reader output beyond the accessibility snapshot.

## Resolved after this verification

- `prose serve --stop` now keeps `server.json` with the process fields cleared, so the token and registered projects survive a stop and a link opened before it works again after the next start.
- Script and dialog units now carry their speaker (`NAME: text`).
- The lineup hint says "line" for verse, script and dialog.
