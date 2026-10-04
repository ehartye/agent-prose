# Line review (brief, existing line, strikes) — design

Status: draft for the 0.5.0 line. Builds on the owner loop (0.2.0 sets, sealed predictions, `prose/verdict@2`), the reading page (0.3.0) and the taste model (0.4.0). Five milestones, each independently shippable (see "Milestones"). Nothing here is implemented yet.

## Goal

Review is line-shaped work (a bark, a quest line, a speech beat), and three things are missing. The owner cannot see **who is speaking and where the line lands**, so a rewrite is judged without its brief. The owner cannot see **the line as it stands**, so a revision is judged without its baseline. The owner cannot say **"this line should not exist"**, so the only answer to a bad line is another rewrite. This spec adds a brief on a set, the original line beside the variants, and a strike cycle (record, review, apply, undo) usable end to end from the reading page.

## Principles

1. **The CLI is the only editor of the draft.** The reading server never writes a draft. Every page write shells out to `prose` (the existing rule), so locks, atomic writes, event-id dedupe and stale checks live in one place. Striking a line records a decision; only `prose strike apply` removes text.
2. **Nothing is deleted without the exact text on screen.** Apply is two steps in the CLI and in the page: a plan that lists every removed line, then a confirm that carries the plan's digest. A digest mismatch (the draft or the strikes changed meanwhile) refuses and shows the new plan.
3. **Every removal is reversible from the log.** The apply row stores the removed raw lines and the line numbers they came from; undo re-inserts them and is verified by hash.
4. **A removal must provably remove only what was shown.** After simulating removal, the re-parsed draft must contain exactly the old units minus the struck ones, in order (text equal). Any other result writes nothing and says why. This one invariant is what makes four formats safe.
5. **Stale means refused.** A strike is bound to the draft hash it was made against. If the draft changed, strikes are shown as stale and cannot be applied; they can be cleared and made again.
6. **Additive formats.** Every new field is optional and every existing `set.json` and log reads unchanged. The set stays `prose/set@1` (see "Compatibility" for the one-way door).
7. **Brief, original and strikes are not taste signals yet.** No verdict row changes. Strike reasons are queryable (`prose strike list --reason`) and that is all.
8. **Draft text is untrusted data in the browser.** textContent only, no inline style, same CSP. Struck text and notes are rendered the way notes are today.

## Design

### 1. Brief (milestones 1 and 5)

**Schema** (`src/owner/sets.ts`). One new optional field on `SetSchema`; the set stays `strictObject`.

```ts
const BriefText = (max: number) => z.string()
  .transform(s => s.replace(/\r\n?/g, '\n').trim())
  .pipe(z.string().min(1).max(max).refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s), 'no control characters'));
export const BriefSchema = z.strictObject({
  character: BriefText(600).optional(),                 // personality summary (inline text, or the snapshot of a profile in M5)
  characterRef: z.string().regex(ID_RE).max(64).optional(), // RESERVED: written only by milestone 5; parsed and shown from milestone 1
  context: BriefText(400).optional(),                   // where and how the lines are delivered
  confirmedAt: z.string().optional(),                   // the owner confirmed this brief (ISO time)
}).refine(b => b.character !== undefined || b.context !== undefined || b.characterRef !== undefined, 'a brief needs a character or a context');
// SetSchema: brief: BriefSchema.optional()
```

`characterRef` exists from milestone 1 so milestone 5 changes no set format: M5 writes `{ characterRef: 'jane', character: <profile summary at that moment> }`. Readers always display `character`, so a set is reproducible if the profile later changes, and a milestone-1 reader shows an M5 set correctly. Per-set `context` stays on the set always.

**CLI.**
- `prose set new <draft> [--character <text>] [--context <text>] [--brief-confirmed] [--brief-from <set-id>]`. `--brief-from` copies another set's brief (used for refine rounds; copies `confirmedAt` too). Giving it with `--character` or `--context` is E_USAGE.
- `prose set brief <id> [--character <text>] [--context <text>] [--clear-character] [--clear-context] [--confirmed]`, under `withSetLock`, via `writeSet`. Editing text clears `confirmedAt` unless `--confirmed` is passed again, because the owner confirmed other words. Emptying both fields removes `brief`. A picked set refuses (E_CONFLICT): the owner already chose with the old brief on screen.
- `prose set show` gains `brief: { character, characterRef, context, confirmed } | null`; `prose set list` rows gain `brief: boolean`. `set new` output echoes the brief and says `confirmed: false` when the flag was not passed.
- `set check` adds a set-level warning `brief-unconfirmed` (it is a warning, not a rejection: the check judges variants, and the owner's confirmation cannot be verified by a tool, the same honesty limit as the sealed prediction's independence).

**Confirmation flow (skills must say so).** The agent drafts the brief from the draft in conversation (who speaks, how they talk, where the line is heard), shows it to the owner, and only after the owner agrees runs `set new ... --brief-confirmed` and writes variants. Writing variants against an unconfirmed brief is the failure the skill names.

**Page.** `session.brief` in the payload: the brief of the latest round's set that has one, else the round-0 set's. It renders above the variants on every screen (lineup, duel, refine) as a `<details open>` block "The brief": a Character paragraph and a Context paragraph, plus the muted line "Not confirmed with you yet" when `confirmedAt` is absent. It is read live from set.json through the stat-keyed set cache, so an edit appears on the next poll (the render signature gains the draft/brief revision, see section 4).

### 2. Existing line (milestone 2)

**Choice.** An explicit selection, not inference. `prose set new <draft> --lines <refs>` (comma list of line refs, section 3 defines refs) marks the set as a revision of those lines. Without `--lines` nothing is recorded and the page shows nothing, which is exactly "a new line shows nothing". Inference ("does the draft already contain it?") has no reliable signal because a set copies the whole draft whether or not the line is new.

**Snapshot at creation.** The refs are resolved to units by the same span module the strikes use, and the set records the text then:

```ts
original: z.strictObject({
  source: SourcePath,                                   // same value as set.source
  draftHash: z.string().regex(/^[0-9a-f]{64}$/),        // textHash of the draft at creation
  lines: z.array(z.strictObject({
    ref: z.string().regex(/^\d+(-\d+)?$/),
    speaker: z.string().min(1).optional(),
    text: z.string().min(1).max(2000),                  // the unit text exactly as the page shows units
  })).min(1).max(20),
}).optional()
```

A snapshot (not a live read of the draft) because the draft will change when strikes are applied or a winner is copied over it, and the comparison must stay what the owner was actually asked to improve. The base file already holds the whole draft, but base is a file with no addressing; `original` is the addressed, displayable subset. `draftHash` lets the page and `set show` say `stale: true` ("the draft has changed since this set was made") by comparing with the current source hash.

**Rules.** `--lines` refs must be addressable units (not necessarily strikable) and must not be currently struck (E_CONFLICT naming the strike). `set check` gains a warning `outside-selection-changed` when a variant altered units that are not in the selection (base units minus selected must all still appear in the variant, compared by normalised text); it never rejects.

**Duels and refine rounds.** The original is context, never a contestant: it is not a candidate index, appears in no verdict row, and has no "keep current" outcome (open question 3). Round sets (`set new <champion file>`) record no `original`; the page shows the round-0 set's snapshot on every screen of the session, because the question the owner is answering ("is any of this better than what is there?") does not change between rounds. Screens: lineup shows it as a `<details open>` block "The current line" above the cards; duel shows it above the duel grid (full width, two columns at 900 px and up are unchanged below it); refine shows it above the champion. Lines render with `Speaker: ` prefix as units do, text only, no tap handlers, no notes. `reading wait` output gains `original` so the agent has it when it writes the next round.

`prose set show` gains `original: { source, lines, stale } | null`.

### 3. Strikes (milestones 3 and 4)

#### 3.1 Line refs, per format

A ref is **a source line number or an inclusive range of source line numbers** of the draft file as the owner's editor and `prose lint` show them (1-based, after the same CRLF/BOM normalisation as `parseDocument`): `12` or `12-13`. `--line 12` may name any line inside a span and resolves to that span; the stored ref is always the canonical `start` or `start-end`.

A new pure module `src/strike/spans.ts` maps units to spans **without changing the IR** (adding `endLine` to `Block` would break the parser tests that `toEqual` whole blocks). It reuses `layoutOf`'s grouping so a unit means what the page means, and returns for each unit `{ unit, ref, start, end, text, speaker?, strikable, why? }`.

| Format | Unit (page, `units.ts`) | Span | Strikable |
|---|---|---|---|
| Fountain | one unit per block: scene, action, speech, parenthetical, transition, centered, lyric | `block.line` to the last non-blank line before the next block's start (notes and sections are blocks, so they bound it) | yes. A speech removed so that no dialogue or parenthetical remains under its cue also removes the cue line, listed in the plan as `kind: 'cue'` |
| Markdown, prose | a sentence | not exact below the block, so the strike target is the **block** (paragraph, list item, step, quote, heading): `block.line` to the line before the next block, blanks trimmed. The page puts the control on the paragraph | yes, at block level (open question 1) |
| Markdown, verse and lyric forms | one source line | `block.line + k` for the k-th non-blank line of a paragraph (labels and directions occupy lines but are not units; a list item or quote spanning lines is one unit over its lines) | yes |
| Dialog YAML | one line of a node `variants` entry, a `choices` entry, or a bark `lines` entry; a node's main `text` | the YAML node range from the `yaml` document (`LineCounter` plus the scalar's `range`), widened to whole lines, block-style only | variants, choices and bark lines yes. A node's main `text`, a bark pool's last remaining line, and anything in flow style (`[a, b]`) are `strikable: false` with `why` ("a node needs its text; strike a variant, or rewrite it"). Striking every choice of a node is allowed (the node then continues via `next` or ends: parse and schema validity decide) |

**Every span is verified, not trusted.** At strike time and again at apply time (principle 4) the module simulates removal on the normalised text and checks that the re-parse equals the old unit list minus the struck units and that, for dialog, the schema still parses. A span that fails (a markdown paragraph that swallowed a fence, a YAML scalar that is really a block scalar) is reported `strikable: false` with the reason; it never reaches a write. Blank-line hygiene: removing a span that sits between two blank lines also removes one adjacent blank line, so the file keeps single-blank separation; that blank line is listed in the plan as `kind: 'blank'`.

`strike --line` on a non-strikable span is E_USAGE with the reason and the nearest strikable refs. A ref that matches no unit is E_USAGE with `Units: 3, 5-6, ...` in the hint (capped at 20).

#### 3.2 Storage

Per draft, in the project: `.agent-prose/strikes/<key>/`, where `<key>` is `<slug of the file name, at most 40 chars>-<first 8 hex of sha256 of the project-relative source path, lower-cased on Windows>` (matches `ID_RE`, so `validId` and the lock code apply unchanged).

```
draft.json          { schema: 'prose/strike-draft@1', source, createdAt }   written once, atomically
events.jsonl        append-only strike log (below)
apply.pending.json  { schema: 'prose/strike-pending@1', kind: 'apply'|'undo', id, before, after, at }   only while a write is in flight
.lock/              the existing directory lock (noun 'strikes')
```

One directory per draft keeps lock contention to one draft and keeps the log small enough to fold on every request. `initProject` adds `strikes/` to the `.agent-prose/.gitignore` it creates (existing projects keep theirs; the log holds struck text, so the README says to ignore it). A small change to `attempt()` in `fsutil.ts` makes the ENOENT hint generic (today it says `reading list` for any noun that is not `set`); the store creates its directory before locking so that path is not reached.

#### 3.3 Event log and fold

`src/strike/store.ts`. One zod discriminated union on `type`, every stored row carrying `schema: 'prose/strike-event@1'`, `at`, `seq` (like the session log: a torn or unknown line is skipped and counted in `problems`, never thrown):

| type | fields | meaning |
|---|---|---|
| `strike` | `id` (`s<n>`), `ref`, `start`, `end`, `text`, `speaker?`, `reason` (`wrong-direction`, `faulty-premise`, `not-worth-rewrite`), `note?` (1-500), `draftHash`, `eventId?` | the decision, the struck text, the draft it was made against |
| `clear` | `strike`, `eventId?` | withdraws a pending strike (the page's per-line "Undo") |
| `apply` | `id` (`a<n>`), `strikes[]`, `before`, `after` (draft hashes), `removed[]` = `{ start, end, raw, kind: 'unit'|'cue'|'blank', strike? }`, `digest`, `eventId?` | the removal, with the raw removed lines and the pre-apply line numbers they came from |
| `undo` | `apply`, `before`, `after`, `eventId?` | the restore |

`foldStrikes(events, currentHash)` is pure and returns `{ pending, applied, history, problems }`:
- `strike` adds to `pending`; a second strike on an overlapping span while one is pending is refused at write time (E_CONFLICT, "already struck as s3; clear it first"). A pending strike is `stale` when its `draftHash` differs from `currentHash`.
- `clear` removes a pending strike. `apply` moves its `strikes` from pending to `applied` (kept forever). `undo` marks that apply undone and **returns its strikes to pending**: the restored draft has the hash they were made against, so they are valid again and the page shows them struck, as before the apply.
- Only the most recent un-undone apply can be undone, and only while the current draft hash equals its `after` (the draft is exactly as apply left it). Otherwise E_CONFLICT with a hint to read the removed text from `prose strike list --state applied`.
- Event-id dedupe: a stored row of the same `type` and `eventId` makes a retry a no-op answered `duplicate: true` (the duel rule).
- Caps: 200 pending strikes per draft; `text` stored up to 2000 chars (longer units are not strikable, `why: too long`).

Reasons are queryable but feed nothing: `prose strike list --reason faulty-premise --state all` returns rows across drafts with `--all`.

#### 3.4 CLI

New `src/commands/strike.ts`, registered in `cli.ts`; `capabilities` lists it. `strike` is a command group whose default subcommand is `add`, so `prose strike <draft> --line ...` works as specified and `prose strike apply` is a sibling. (A draft always has an extension, so `apply` can never collide with a file name.) The draft must be a file inside the project, not a symlink (apply renames over it) and not under `.agent-prose/`; otherwise E_USAGE.

| Command | Does | Output highlights |
|---|---|---|
| `prose strike [add] <draft> --line <ref> --reason <tag> [--note <text>] [--draft-hash <sha>] [--event-id <id>]` | records one strike (`--draft-hash`: the hash the caller saw; mismatch is E_CONFLICT, the page always sends it) | `{ strike: { id, ref, text, reason }, pending: n, next }` |
| `prose strike clear <draft> <strike-id>` / `--all` | withdraws pending strikes | `{ cleared, pending }` |
| `prose strike apply <draft> [--confirm <digest>] [--event-id <id>]` | without `--confirm`: **dry run**, prints the plan; with it: applies | `{ applied: false, digest, removed: [{ ref, start, end, text, reason, note, kind }], count, bytes, next }` then `{ applied: true, apply: 'a1', removed, ... }` |
| `prose strike undo <draft> [--event-id <id>]` | restores the latest un-undone apply | `{ undone: 'a1', restored: n }` |
| `prose strike list [<draft>] [--all] [--reason <tag>] [--state pending\|applied\|all]` | queries | rows with `stale`, counts by reason |

`apply` refuses (E_CONFLICT) when there are no pending strikes, when any pending strike is stale (listing them and the hint "clear and strike again"), or when the digest does not match the plan recomputed under the lock (the new plan is in the error's `details`, so the page can show it without another call).

#### 3.4a Atomic apply and undo

Under the strike lock (`withDirLock`, 5 s wait, heartbeat between steps, like `recordPick`):

1. Recover first: if `apply.pending.json` exists, compare the draft hash with its `before` and `after`. Equal to `after`: the write landed, append the missing apply row, delete the pending file, report it. Equal to `before`: delete the pending file and continue. Neither: E_CONFLICT (the draft changed during an interrupted apply; nothing is touched).
2. Read the draft's raw bytes. Hash the normalised text. Check every pending strike is current. Build the plan; verify principle 4; compute the digest; compare with `--confirm`.
3. Write `apply.pending.json`, heartbeat, build the new text by dropping whole lines **from the raw line list split on `\r\n|\r|\n` with the separators kept**, so each remaining line keeps its own line ending and a BOM is untouched.
4. Re-read the draft hash just before the write (narrows, does not close, the window against an editor saving at the same moment) and `writeFileAtomic(draft, newText)`.
5. Append the apply row, delete the pending file.

Undo is the same protocol with the inverse plan: current hash must equal the apply's `after`; re-insert each `removed[].raw` at its pre-apply line number in ascending order; the result's hash must equal the apply's `before` or nothing is written. Crash order is the one `set pick` uses (intent file first, mutation, log row last), and a retry finishes or abandons cleanly.

The draft is not covered by any lock another editor honours, so a concurrent edit by the owner's editor or another agent is possible; the hash checks make it a refusal, and the rename-over write is the only instant it could lose an edit. Stated as a risk.

### 4. Reading page (milestones 1-4)

**Payload.** `SessionPayload` gains `session.brief`, `session.original` (with `stale`) and `draft`:

```ts
draft: null | {
  source: string;               // project-relative
  hash: string;                 // normalised-text sha256 now
  rev: string;                  // hash of draft.hash + strikes + brief + original: the page re-renders when it changes
  editable: boolean;            // false once the session is shipped or abandoned, or the draft is unreadable
  lines: Array<{ ref, start, end, text, speaker?, strikable, why?, break?: boolean }>;  // at most 2000, `truncated: true` beyond
  strikes: Array<{ id, ref, reason, note?, at, stale }>;
  applied: null | { id, count, at };   // the latest un-undone apply, only while the draft still equals its `after`
}
```

`draft.source` comes from the session's round-0 set (`set.source`); it is realpath-checked to stay inside the registered project root, with an allowed extension, or `draft` is `null` and the Draft view says "The draft is not available". The page's `signature()` becomes `stage|round|events|draft.rev`. The server caches the spans per draft file with the existing stat-keyed `remember` pattern (a poll that finds nothing changed adds no read).

**Routes** (`SERVER_API` 1 to 2, so a running older server is replaced, as designed):

| Route | Does |
|---|---|
| `GET /api/session/<id>/strike/preview` | the apply plan computed in process (read only, no lock): `{ digest, count, removed: [...] }`, or 409 when there is nothing pending or a strike is stale |
| `POST /api/session/<id>/strike` | `{ ref, reason, note?, draftHash, eventId }`, runs `prose strike <draft> --line <ref> --reason <r> --note=<n> --draft-hash <h> --event-id=<e> --dir <root>` |
| `POST /api/session/<id>/strike/clear` | `{ strike, eventId }` |
| `POST /api/session/<id>/strike/apply` | `{ digest, eventId }`, runs `prose strike apply <draft> --confirm <digest> ...` |
| `POST /api/session/<id>/strike/undo` | `{ apply, eventId }` |

Each POST has a strict zod body (ref `^\d+(-\d+)?$`, reason from the enum, note at most 500 chars, digest and hash 64 hex, ids matching `EVENT_ID_RE`), the 64 KB body cap, the per-session `serial()` queue, and answers `{ ok, duplicate?, state }` with the fresh payload. They append nothing to the session log, and 409 when the session has ended. Argv is an array with `--note=<text>` in `=` form (a note starting with `-` stays a value); nothing goes through a shell. Errors keep the existing pass-through codes (E_CONFLICT 409, E_USAGE 400, E_SCHEMA 400, E_NOT_FOUND 404), so no new error code is needed.

**Screens and states.** All code stays in `app.js` and `style.css` (the page test pins three files and one `fetch(` call; the new calls go through the existing `request`/`post`).

- **Draft view.** A "Draft" button in the header (every stage except `shipped` and `abandoned`, where the view is read-only) toggles `ui.view = 'draft'`: it lists every `draft.lines` entry in order, `break` starting a new block, with `Speaker: ` prefixes. Each strikable line has a "Strike" button; a non-strikable line shows its `why` in muted text. A prose draft shows one control per paragraph.
- **Strike picker (inline, per line).** Tapping Strike opens a small panel under the line: three buttons "Wrong direction", "Faulty premise", "Not worth rewriting" (radio semantics, none preselected), an optional note textarea (500 chars), "Strike" (disabled until a reason is chosen) and "Cancel". 44 px touch targets like the rest. Sending is gated like a judgement (`data-gate`).
- **Struck line.** Stays in place with `.struck` (line-through, muted), a reason chip with the label, the note if any, and an "Undo" button (sends `clear`). Never removed from the view until a later apply lands.
- **Pending bar.** Sticky at the bottom of every screen (not only the Draft view): "3 lines struck" and "Review and apply". Shown when pending is non-empty. If any are stale: "The draft changed since 2 of these were struck. Undo them and strike again." with only Undo buttons enabled and Apply hidden.
- **Apply review.** "Review and apply" fetches the preview and shows a panel listing every removal in draft order, each with its line numbers, the exact text (as text), reason and note, and any `cue`/`blank` extras labelled ("also removes the speaker cue JANE"). Buttons "Remove 3 lines" (sends the digest) and "Not yet". If the digest is refused (409) the panel reloads the new preview and says why. Confirmation is explicit: there is no one-tap apply.
- **After apply.** The lines are gone from the Draft view; a bar reads "Removed 3 lines" with "Undo removal" (sends `undo`) for as long as `draft.applied` is present; once the draft changes it disappears and the log is the only record.
- **Failures** use the existing notice (message and hint); a 409 reloads the payload, as `send()` does.

Accessibility: buttons are real `button`s, the picker is a labelled group, the pending bar is `role="status"`, the review panel moves focus to its heading and returns it on close.

**Security.** The token, the Host check on a local bind and the Origin check on every POST already apply to the new routes unchanged; CSP, `no-store` and `no-referrer` are unchanged, no new page file. What changes is the **capability of the link**: today a link reads drafts and logs judgements; after this it can also remove lines from a draft file. Mitigations: apply needs the digest of the exact plan (a replayed or blind request fails once anything changed), removals are limited to units of the one draft behind the session, the file is rewritten whole lines at a time, and undo exists. The server notice and the `prose-review` skill say it plainly (the `NOTICE` and `LOCAL_NOTICE` strings and their tests change in milestone 3), and `--local` stays the recommended default for anything the owner cares about. The draft path never comes from the client: the page sends refs, ids and hashes; the server derives the file from set.json and re-validates it. Notes and struck text reach the log only through the CLI's zod validation.

### 5. Struck lines and sets (milestone 3)

"Struck lines are excluded from rewrite sets" is enforced in three places, none of which removes a line:
- `set new --lines` refuses a pending-struck line (E_CONFLICT, naming the strike).
- `set new` on a draft with pending strikes records `excluded: [{ ref, text }]` in set.json (new optional field, same strict rules as `original`). Variants are still full copies, so a pick copied over the draft cannot silently apply a strike.
- `set check` rejects a variant that **edits** an excluded line (reason `struck-line-edited`); a variant that leaves it alone is fine. The page marks an excluded line that appears in a variant with the `.struck` style, text only.

`prose set pick`'s `next` hint gains a `warnings` entry when the source draft's current hash differs from the set's base hash ("the draft has changed since this set was made, so copying the variant over it would undo those changes, including any applied strikes"). That check ships in milestone 4, when apply makes the situation real.

## Compatibility

- Existing `set.json` files read unchanged (`brief`, `original`, `excluded` are optional). Existing event logs are untouched; strikes have their own log. Existing `.gitignore` files are not rewritten.
- A set written with a new field cannot be read by an older runtime: `SetSchema` is `strictObject`, so the older runtime reports E_SCHEMA at that field. This is the one-way door, accepted because the version stays `prose/set@1` and downgrades are not supported. The plugin updates as a unit and the managed runtime is replaced with it.
- `characterRef` is in the schema from milestone 1 so milestone 5 changes no format.
- `SERVER_API` goes to 2 in milestone 3 (routes were added); `reading open` replaces a running older server and keeps its token and projects, as `ensureServer` already does.
- JSON outputs only gain fields.

## Skills

Limit per skill: 150 lines (`tests/skills.test.ts`).

- `prose-review` (110 lines now): add the brief step (draft, show, owner confirms, `--brief-confirmed`), `--lines` for revisions, `--brief-from` for rounds, and a short "strikes" pointer. The test that pins "the twelve skills" and the reading-page needles is updated.
- `prose-strike` (new, the thirteenth): when the owner strikes lines on the page or asks to drop lines; how to read pending strikes (`strike list`), never apply without the owner's confirmation of the exact text (the page does it; in chat show the dry-run), never edit a struck draft by hand while strikes are pending (they go stale), and what each reason means for the next rewrite.
- `prose-dialog`: a brief template for lines and barks (character: how they speak; context: trigger, box size, how often heard).
- `prose-script`: the same template for speeches (character; context: scene and who is listening).
- `prose-voice`: M5 only: character profiles versus voice bibles, which to write when.

## Milestones

Each ships on its own and leaves main green. Counts are additions to the current 1,737 tests.

| # | Ships | Changes | Tests (about) |
|---|---|---|---|
| 1 | Brief on sets, shown on the page and in `set show` | `BriefSchema`, `set new` flags, `set brief`, `set show`/`list`, `brief-unconfirmed` warning, page block, `prose-review`/`prose-dialog`/`prose-script` text | 30: schema (limits, controls, strict keys, reserved `characterRef`), old set reads, `set brief` edit/clear/confirm/picked refusal, CLI output, payload, page static and helper tests, skill needles |
| 2 | Existing line beside variants | `src/strike/spans.ts` (units and refs only; strike use comes in 3), `--lines`, `original`, `stale`, `outside-selection-changed`, page block on three screens, `reading wait` field | 35: spans golden per format, ref errors, snapshot at creation, stale, round carries round-0 original, duel and refine rendering, check warning |
| 3 | Strike record, CLI, page (no removal yet) | `src/strike/store.ts`, `commands/strike.ts` (`add`, `clear`, `list`), fold, routes (not apply/undo), `draft` payload, Draft view, picker, struck rendering, pending bar, `SERVER_API` 2, notice text, `excluded` and `struck-line-edited`, `prose-strike` skill | 75: store and fold (every row type and transition, torn lines, dedupe), CLI per subcommand, locking, server routes (token, Origin, size, schema, ended session, retry), payload, page, set integration |
| 4 | Apply and undo | `planApply`, `strike apply/undo`, atomic protocol with recovery, preview/apply/undo routes, review panel, undo bar, `set pick` warning | 55: golden before/after per format with CRLF and BOM variants, invariant refusals, crash injection at each step, stale and digest refusals, concurrent apply, page flow |
| 5 | Character profiles | `.agent-prose/characters/<id>.yaml` (`prose/character@1`: `id`, `name`, `summary`, optional `voice` linking a voice bible), `prose character list/show/new`, `--character` resolves a profile id to `characterRef` plus the snapshot, `set brief --refresh` | 25: schema, loader errors, resolution order, ambiguity warning, snapshot independence, M1 set unchanged |

Order is 1, 2, 3, 4, 5. Milestones 1 and 5 touch only the brief; 2 needs the span module that 3 reuses, which is why the module lands in 2 with units and refs only.

### Resolution rule for `--character` (milestone 5)

If the value matches `^[a-z0-9-]+$` and a profile of that id exists, it resolves: `characterRef` is the id and `character` is the profile's `summary` at that moment. Otherwise the value is inline text, exactly as in milestone 1 (so no milestone-1 command changes meaning). An id-shaped value with no profile is stored as inline text and the output carries a `notes` entry ("no character profile named jane; stored as inline text"), because a one-word summary is almost always a mistyped id and a refusal would break milestone-1 usage.

## Where data is destructive or user-visible

Destructive:
1. `prose strike apply` rewrites the draft file (milestone 4). Guards: dry run first, digest confirm, stale refusal, invariant check, hash-verified undo, atomic rename. Remaining exposure: an editor saving at the same instant, and a symlinked draft (refused).
2. `prose strike undo` rewrites the draft file again (milestone 4), refused unless the file is exactly as apply left it.
3. `prose set brief` overwrites brief text in place (milestone 1; set.json is a working file, the earlier text is not kept; open question 5).
4. New projects get `strikes/` in their `.agent-prose/.gitignore`; no existing file is rewritten.

User-visible:
- Everything on the reading page: brief, current line, Draft view, struck lines, pending bar, review panel, removed bar, the "Not confirmed with you yet" line, stale notices.
- `prose set show`/`list` output fields; `strike list`/`apply` JSON.
- The server notice now says the link can remove lines (milestone 3).
- The strike log keeps struck text (logs are gitignored for new projects).
- A set made after a strike carries `excluded` and a variant that edits an excluded line is rejected by `set check`.

## Testing

Pure: spans per format against golden fixtures in `tests/fixtures/strike/` (one `.fountain`, one `.md` prose, one `.md` lyric, one `.dialog.yaml`, each with CRLF and BOM copies): every unit's ref, span, `strikable`/`why`; the removal plan and the `after` file for chosen strikes; the apply-then-undo round trip equals the original bytes; orphan cue and blank-line cases; a paragraph followed by a fence; flow-style YAML; a node's only text; a bark pool's last line. Store and fold: every transition, torn and unknown lines counted, event-id dedupe, undo returns strikes to pending, stale detection. CLI (`tests/strike-cli.test.ts` in the style of `owner-set-commands`): each subcommand, flags and errors, dry run then confirm, digest mismatch carries the new plan, symlink and `.agent-prose` refusals, `capabilities` lists the commands. Crash injection (the `rename` hook of `writeFileAtomic`, as the pick tests do): a failure before the rename leaves the draft untouched and pending recoverable; a failure after leaves the draft changed and the next command completes the log row; two processes applying at once (the `lock-holder.mjs` helper) give one apply and one E_CONFLICT.

Server (`ReadingServer` on an ephemeral port, stubbed `runProse` and a real-CLI case): token, Origin and Host checks on each new route, oversize body, schema rejections, ended session 409, retry with the same event id does one write, payload shape and stat-key cache (a poll with nothing changed adds no read), `draft` is `null` for a source that escapes the project, the preview is read only and takes no lock, the event loop stays responsive while the strike lock is held. The static page test keeps its bans and adds new needles; the helper functions for the picker and the pending bar are exposed through `window.__reading` for node tests like the existing ones. A real-browser pass with the Playwright tools on a seeded dialog project at phone width and desktop: brief and current line on all three screens, strike with each reason, undo, stale state (edit the file), review, apply, undo removal, with screenshots.

Skills: needles for the confirm-before-variants rule, the apply-needs-confirmation rule, and the 150-line cap.

## Out of scope

Strikes or briefs as taste signals; learning from reasons; sentence-level strikes in prose drafts (open question 1); re-anchoring a stale strike automatically; striking inside a variant; editing the draft text from the page; a "keep current line" outcome in duels; a view-only link; per-form brief templates; bulk strike by pattern; translating strikes between drafts; CLI interactive prompts (the CLI is JSON in, JSON out, so confirmation is the digest).

## Risks

- **The link gains destructive power.** Anyone with the token on the LAN can strike and, with the preview digest, apply. Mitigated by the digest, scoping, undo and the notice; a view-only link would remove the risk (open question 4).
- **Span extraction is format-specific and the parsers carry only a start line.** Wrong spans are the realistic failure. The invariant (principle 4) turns them into refusals, and the golden set is the main defence; Markdown prose is deliberately block-level because sentence spans are not recoverable from `plain()` text.
- **A concurrent edit by another program can lose between the last hash check and the rename.** Narrowed by re-reading the hash right before the write; not closable without a lock the editor honours.
- **The one-way door of `strictObject`.** A newer set.json breaks an older runtime. Same posture as every earlier additive set change.
- **Brief confirmation is a discipline, not a proof.** The tool records `confirmedAt` and warns; it cannot know the owner agreed. Same limit as sealed-prediction independence.
- **Stale strikes frustrate.** Any edit to the draft, even elsewhere, invalidates every pending strike. This is the owner's rule; the cost is re-striking after an unrelated edit (open question 2).
- **Brief and original are not frozen in the session**, so editing the brief mid-session changes what the owner sees on the next poll. Accepted: the page shows it as it is, and the confirmed flag resets on edit.

## Open questions (with a recommendation)

1. **Sentence-level strikes in Markdown prose.** The page's units are sentences, but a sentence's source span cannot be recovered exactly from `plain()` text, so strikes are block-level there. Recommendation: ship block-level; revisit by exposing raw sentence offsets from `parseMarkdown` (its `rawOut` hook is a start) only if owners strike inside long paragraphs often. Verse, script and dialog are unaffected.
2. **Should an unrelated edit stale every strike?** The brief fixes "refused when the draft changed". A softer rule (valid while the struck unit's text is still unique at the same ref) would survive edits elsewhere. Recommendation: keep the strict rule now, record how often owners re-strike, and consider `strike refresh` (re-anchor by exact unit text) later.
3. **A "keep the current line" outcome in duels.** It would make the original a contestant and need a verdict kind. Recommendation: no; the owner can strike or ignore the set, and it keeps the taste model untouched.
4. **View-only versus edit links.** A second token that cannot reach the strike routes. Recommendation: not in this line; the link already exposes drafts, `--local` is the answer for sensitive work, and a second token doubles the notice and the test matrix.
5. **Keep a history of brief edits.** `set brief` overwrites. Recommendation: no; a brief is working notes, and the confirmed flag already marks that an edit needs owner agreement again.
6. **Strike a whole dialog node** (including its main text and every inbound `to`). Out of scope here because it needs graph repair, not line removal. Recommendation: a separate `prose dialog drop-node` command with reachability checks, if owners ask.
7. **Should `strike apply` also run `prose lint` and report new findings?** Removing a line can break rules the draft passed (a dialog dead end, a script's length target). Recommendation: yes, report only (an `after` block with the lint error count and new rule ids), never refuse; add in milestone 4 if the lint call is cheap enough in the review panel's path.
