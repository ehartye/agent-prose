# Batch passage assessment workbench

The owner wants to ask “Evaluate the grade-level appropriateness of these ten passages,” then jump between passages in a selection panel. The current reading-level skill produces individual reports but has no batch assessment screen. Add a mode to the existing proof-desk application.

## User experience

One shared reader profile and task apply to an ordered batch of independently assessed passages. This is not a curriculum-progression analysis. Each passage has its own six-criterion report, conditional recommendation, evidence and proposed changes. Pending reports are explicit. No aggregate grade score is computed.

Desktop uses three independently scrolling areas: a compact passage-selection rail; the selected source text; its assessment and proposed changes. Queue rows show passage titles, excerpts and recommendation/status, with a visible current selection. Previous/next controls and a batch overview offer additional navigation. The URL remembers the selected passage on reload, and switching restores that passage's reading position. Search filters the selector without discarding passages or ratings.

The existing shell, Courier Prime/Atkinson typography, palette, DOM helpers, queue components, notices, settings gear and System/Light/Dark persistence remain authoritative. Header height stays compact. On narrow screens the selector is a disclosure above the passage and assessment, with jump links rather than a page-wide overflow. Status is conveyed by text as well as color. No new framework, stylesheet tree or standalone review app is added.

## Content contract and workflow

The agent evaluates each supplied passage with `prose-reading-level`, then writes a structured batch input containing title, shared reader profile and passages. A passage has a stable local ID, title, full source text and either a report or `null`. Reports use the existing six dimensions and support anchors, an explained overall recommendation, located proposals, reported checks and limitations. An agent/provided origin distinguishes supplied analysis from agent assessment. Exact evidence quotations and local before-text must occur in the corresponding source; this verifies binding, not correctness or educational validity.

`prose assessment create <input.json> --dir <project>` validates and stores a new immutable snapshot under `.agent-prose/assessments/<uuid>.json`. `show <id>` reads it; `open <id>` registers the project and opens an authenticated local URL through the existing ReadingServer. “Open” returns a URL; it does not launch a browser implicitly. The CLI makes no model calls and never writes source passages or applies proposed changes. The skill handles supplied files, pasted passages and explicit boundaries before preparing input. V1 accepts 1–50 passages and at most 4 MiB of UTF-8 JSON, practical bounds rather than reading-science thresholds.

Stored records include source hashes and creation time and remain the exact text assessed. They do not pretend to track later edits to an external document. Root-contained state paths reject symbolic links and hardlink aliases. Inert text is rendered with safe DOM creation; markup and links in passages/reports do not execute or load external content. Formula diagnostics, if supplied as reported checks, remain separate from qualitative ratings. No automated grade placement or learner-testing claim is added.

## Architecture and verification

Add `src/assessment.ts` for validation and immutable storage, `src/commands/assessment.ts` for three commands, one authenticated GET endpoint and `/a/<uuid>` mode routing in ReadingServer, and `runtime/reading/assessments.js` registered with `ProseReview`. Extend the existing asset allowlist and shared stylesheet. Bump the reading-server API to avoid reusing an older daemon without these routes.

Test real ten-passage navigation, per-passage rubric/evidence/proposals, pending/malformed data, source binding, storage containment, auth/method behavior, selection persistence, independent scroll, narrow layout, shared appearance and inert hostile text. Reuse the existing assessment evidence and shared-UI decisions; the change adds browsing behavior, not a new scientific rubric. A local demo uses ten original passages with disclosed editorial assessments.

The selected approach keeps time focused on one viewer and a small data/CLI boundary. Its main risks are mismatched evidence and misleading assessment status; validation and explicit pending/snapshot labels address them. Complexity is limited to a new domain controller within the current application. Reusing shell and server boundaries follows the established architecture. Maintenance adds one input contract and controller, with no duplicated theme or navigation framework.
