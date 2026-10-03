# agent-prose — design

Date: 2026-10-02 · Status: M1–M2 shipped as 0.1.0; M3–M4 planned

## Purpose

A writing-craft plugin for coding agents, built as a full sibling of agent-beeps, agent-vids,
agent-sprites and agent-meshes. Agents draft writing in native formats, a CLI measures what is
measurable, cited craft rules lint each form, and the owner judges variants on a LAN reading page
whose verdicts train a taste model.

Scope covers registers (academic, professional, instructional, comedic, dramatic,
entertainment/conversational) and forms (game quest dialogue, NPC barks, branching conversation,
user instructions, technical docs, academic paper, professional writing, sitcom, TV drama, stage
play, YouTube script, speeches to small and large audiences).

## Decisions taken

| Decision | Choice | Rejected |
|---|---|---|
| Scope of v1 | Full sibling spine: measure, lint, render, owner reading page, taste model | Lint-only CLI first; skills-only library |
| First deep wave | All four: game dialogue, instructions/professional, speeches, scripts | — |
| Read-aloud | Browser Web Speech by default; OpenAI TTS opt-in per render (`--tts openai`) | Browser only; OpenAI always; none |
| Draft storage | Native formats parsed to one IR | One JSON schema; Markdown everywhere |

## 1. Shape

- **CLI `prose`**, sibling conventions: Node ≥ 24 running TypeScript directly (no build), commander,
  zod, pinned dependency versions, JSON on stdout (`--pretty` to indent), errors as
  `{"error":{code,message,pointer?,hint?}}` on stderr with exit 1 (usage errors exit 2).
- **Managed runtime** copied from the sibling pattern: `scripts/setup.js`, `managed-runtime.js`,
  `run-managed.js`; releases under `~/.agent-prose/releases/<version>-<fp>-<platform>-<arch>-<abi>`;
  `AGENT_PROSE_HOME` override; version sync across `package.json`, `plugin.json`,
  `package-lock.json`. Chromium is installed for PDF renders (from M4).
- **Project state** in `.agent-prose/`: `project.json` (defaults), `voices/`, `sets/`,
  `taste/verdicts.jsonl`, `exports/`; per-user logs in `~/.agent-prose/taste/` (`verdicts.jsonl`, `predictions.jsonl`).
- **Voice bibles** (`.agent-prose/voices/<id>.yaml`, schema `prose/voice@1`): a character, brand or
  speaker. Fields: `register`, `description`, `samples[]`, `banned[]`, `catchphrases[]`, and
  `targets` (measured stylometric ranges, e.g. mean sentence length, contraction rate). Every
  speaker in a draft resolves to a voice or is reported as unvoiced.
- **Plugin stands alone**: cites primary sources in `craft/references.json`, never the maintainer's private notes.

## 2. Draft formats and the IR

| Forms | Format | Parser |
|---|---|---|
| Sitcom, TV drama, stage play | Fountain (`.fountain`), stage plays use Fountain with title-page `Form: stage-play` | Fountain parser (title page, scene headings, action, character, parenthetical, dialogue, transitions, sections, notes, boneyard) |
| Speeches, instructions, technical docs, academic, professional, YouTube script | Markdown with YAML frontmatter (`form`, `register`, `audience`, `target`) | Markdown block parser; YouTube scripts mark spoken lines vs on-screen notes |
| Game dialogue, barks, branching conversation | `prose/dialog@1` YAML: `nodes{id, speaker, text, choices[{text, to, condition?}], next?}`, `barks{pool, context, lines[], cooldown}` | zod-validated graph loader |

All parse to one **IR**: an ordered list of blocks `{kind, text, speaker?, line, col, meta}` where
`kind ∈ scene | action | line | parenthetical | transition | heading | paragraph | step | list-item |
choice | bark | note`. Every measurement and finding carries the source line so it points back at
the draft. A new form = a parser binding (often reused) + a form pack.

## 3. Register × form

**Form packs** (`craft/forms/<form>.json`) declare: parser, applicable measurements, default
targets (WPM, length, page→minute factor, box size), the rule ids that apply, and render targets.
**Registers** adjust rule values as overrides with a required `reason`; overrides are reported as
info, following the agent-vids flavor pattern. Initial forms: `quest-dialog`, `barks`,
`conversation`, `instructions`, `tech-doc`, `academic`, `professional`, `sitcom-multicam`,
`sitcom-singlecam`, `tv-drama`, `stage-play`, `youtube`, `speech-small`, `speech-large`,
`speech-recorded`. YouTube channel styles (e.g. explainer, essay, vlog, tutorial) are presets on
the `youtube` form.

## 4. Measurement

`prose measure <draft>` returns features, all per draft and per speaker where speakers exist:

- **Universal:** word/sentence counts, sentence-length mean/variance/distribution (rhythm),
  passive rate, nominalization rate, hedge rate, contraction rate, n-gram echo (repeated phrasing
  within the draft), cliché and AI-tell hits (a curated list in `craft/lexicon/`), reading grade
  (**reported, never a target**: rewriting to hit a grade does not improve comprehension).
- **Spoken forms:** duration at the form's WPM (overridable), longest breath unit (words between
  pauses), time to first hook.
- **Scripts:** Fountain page count (form-specific layout) → minutes; scene and speech lengths; act
  break positions; dialogue/direction ratio (stage).
- **Game dialogue:** characters per line vs project box size; choice counts; graph checks
  (unreachable nodes, dead ends, missing fallback, dangling `to`); bark-pool near-repeats.
- **Voice drift:** per-speaker distance from the speaker's voice targets.
- **Instructions:** imperative-first steps, actions per step, result statements present.

Measurements are deterministic, dependency-light text analysis (no ML models, no network).

## 5. Craft rules

- `craft/rules.json` (schema `prose/rules@1`) following the agent-vids shape: `id` (dotted by topic),
  `topic`, `statement`, `value`, `unit`, `forms[]`, `registers[]`, `check: auto | judgement`,
  `severity: error | warn | info`, `sources[]` (reference ids), `derived` (true when the threshold
  is this plugin's choice), `rationale`.
- `craft/references.json`: `{id, authors, year, title, url, kind, note}` with `kind ∈ standard |
  peer-reviewed | review | platform-doc | style-guide | practitioner | book`. `REFERENCES.md` is
  generated and checked in CI (`npm run refs:check`).
- `craft/GUIDE.md`: the reasoning per topic, quoting rule ids.
- `prose lint <draft>` returns `{errors, warnings, info, judgement[]}`. Each finding:
  `{rule, severity, message, at:{line, speaker?}, measured, fix}`. Rules with no evaluator are
  listed as judgement on every run, never silently skipped.
- Every rule cites at least one source; research for M0 supplies them.
- **Rule interactions are explicit.** M0 research found rules that pull against each other:
  AR 25-50 bans "There is/There are" while avoiding plain is/are is a documented AI tell;
  classic style removes hedges while human text hedges more than LLM text. Rules carry
  `conflicts: [{rule, note}]`; lint reports the trade-off instead of letting one fix silently
  create another finding, and a test fails if a declared conflict is not reciprocal.
- **AI-tell rules are style findings, never authorship verdicts.** Automated detectors are
  unreliable and biased against non-native writers; tell lexicons are tagged by model era
  because the tells shift (see `docs/research/2026-10-02-m0-findings.md`).

## 6. Owner loop

- **Variant sets:** `prose set new <draft> --directions punchier,warmer,...` scaffolds a set; the
  agent writes 3–6 variants; `prose set check` measures them, and rejects lint errors and near-
  duplicates (feature distance + n-gram overlap below a threshold), addressing the documented
  sameness failure of LLM-generated story text.
- **Directions:** punchier, warmer, drier, more formal, less formal, shorter, longer, weirder,
  plainer, more like #k. Each maps to the features it is expected to move, so `set check` reports
  whether a variant actually moved that way.
- **Sealed prediction:** `prose review open` fails with `E_PREDICTION_REQUIRED` until
  `prose predict --set <id> --pick <k> --shortlist ... --why "..."` is recorded; revealed at ship.
- **LAN reading page** (`prose serve`, token-guarded URLs, state in `~/.agent-prose/server.json`):
  lineup (keep/dud), duel (A vs B, randomized sides, next pair where the model is least sure),
  refine (choose directions), line-anchored notes, ship. Read-aloud uses the browser's Web Speech
  API with a timing bar against the form's target length. `prose render --tts openai` produces
  high-fidelity audio on request only (requires `OPENAI_API_KEY`; sends text to OpenAI).
- **Taste model:** Bradley-Terry over measured text features (no free-text taste notes, which
  cannot rank or predict — agent-beeps ADR), with global, per-project (≥ 15 verdicts) and
  per-voice layers. `prose taste show` writes a plain-words summary.

## 7. Render and export

- Fountain → screenplay PDF and stage-play PDF (industry layouts via Chromium print).
- Speech → reading copy (HTML/PDF): large type, breath and emphasis marks, per-page timing.
- Dialog graph → validated JSON + manifest sidecar for game projects.
- Markdown forms → Markdown/HTML.

## 8. Skills

Written with the yoda method: `description` (capability) + `when_to_use` (triggers, starting
`Use when|before|after`), body ≤ 150 lines, references one level deep, enforced by
`tests/skills.test.ts`. Each skill gets paired-run evals (with/without) plus negative cases.

| Skill | Fires on |
|---|---|
| `prose-setup` | first run, `E_RUNTIME_MISSING`, version mismatch |
| `prose-dialog` | quest dialogue, NPC lines, barks, branching conversation |
| `prose-script` | sitcom, TV drama, stage play, screenplay, YouTube script |
| `prose-speech` | speeches, toasts, keynotes, talks, small room or large hall |
| `prose-instruct` | user instructions, how-to, technical docs, help articles |
| `prose-formal` | academic papers, abstracts, reports, proposals, professional email |
| `prose-comedy` | jokes, punch-up, comic timing in any form |
| `prose-voice` | voice bibles; "doesn't sound like X"; voice consistency |
| `prose-review` | reading page, duels, predictions, taste |

Short interface microcopy is routed to the existing `design:ux-copy` skill; `prose-instruct`'s
`when_to_use` says so. Negative evals include a code-comment request that should fire nothing.

## 9. Research and project notes

M0 fills evidence gaps found in the maintainer's research-notes survey (2026-10-02): screenwriting and teleplay format,
stage-play format, comedy construction, speechwriting and audience size, technical documentation
(Diátaxis, docs style guides), UX writing research, academic prose, prose style and editing, game
dialogue craft (barks, branching, Ink/Yarn practice), character voice, story structure, creator
YouTube scripting. Also ingest four already-captured writing-instruction clippings. Project docs
live in the maintainer's project notes (overview, architecture, roadmap, ADRs for native formats,
read-aloud split, taste features).

## 10. Milestones

1. **M0 Research** — discover and capture sources for the gaps; author overview and architecture notes.
2. **M1 Engine** — scaffold, managed runtime, IR + three parsers, measure, lint framework,
   references, tests.
3. **M2 Forms** — four waves, each a rules pack + skills + evals: dialogue → instructions and
   professional → speeches → scripts; comedy and voice skills land with the waves that need them.
4. **M3 Owner loop** — variant sets, predict, reading page with read-aloud, taste model.
5. **M4 Render** — PDFs, reading copy, dialog export, OpenAI TTS opt-in.
6. **M5 Release** — PR to the `hartye-plugins` marketplace (confirm with owner first).

## Error handling

Error codes: `E_USAGE`, `E_SCHEMA` (with JSON pointer or line), `E_PARSE` (Fountain/Markdown with
line), `E_NOT_FOUND`, `E_PROJECT`, `E_RENDER`, `E_BROWSER_MISSING`, `E_RUNTIME_MISSING`,
`E_SERVER`, `E_PREDICTION_REQUIRED`, `E_CONFLICT`, `E_TTS` (missing key or provider failure).

## Testing

Vitest, tests mirroring `src/`. Parser fixtures per format (including Fountain edge cases), golden
measurement fixtures, one test per auto rule (passing and failing sample), managed-runtime and
skills tests from the sibling pattern, server route tests, taste model fit tests. Evals in
`evals/<case>/` run with `claude plugin eval`.

## Out of scope for v1

Long-form fiction and novels as forms (registers still apply to prose passages); Ink/Yarn
exporters (the YAML graph is the contract; exporters are a later backlog item); ML-based metrics.

## M1 implementation notes (2026-10-02)

- Form packs live in one file, `craft/forms.json`, instead of `craft/forms/<form>.json`.
- The IR adds `centered`, `lyric`, `section`, `synopsis`, `page-break` and `quote` block kinds.
- Error codes add `E_INTERNAL` for unexpected failures.
- Fountain character cues (unless forced with `@`) must be at most five words without terminal
  punctuation, so multi-cam ALL CAPS action is not read as dialogue.
- Deferred to M2: `prose init` and project overrides, voice bibles and voice drift, time to first
  hook (YouTube wave), instruction step checks (instructions wave), cliché lexicon (needs a source),
  and, recorded at the M1 whole-branch review:
  - `craft/GUIDE.md`.
  - Scene and speech lengths and act-break positions. These need a speech index in the IR: the
    Fountain parser stamps `meta.speech` on `line` and `parenthetical` blocks, and the script
    layout groups on it.
  - A words-per-minute override.
  - A CI workflow running `test`, `typecheck` and `refs:check`.
  - Golden `parse`/`measure`/`lint` snapshots and per-auto-rule pass/fail tests.
  - A resolved-settings step for project, voice and target settings.
- The managed runtime omits Chromium until PDF rendering (M4).

Changes approved during M1 review:

- Input: CR-only and CRLF line endings are supported; the loader strips a leading BOM.
- Fountain notes (`[[...]]`) are extracted before line splitting: a truly empty line ends a note,
  notes never nest, and lines holding only a note are transparent to the surrounding structure.
- Fountain scene headings without a following blank line are accepted only when ALL CAPS.
- Fountain lines of exactly two spaces continue dialogue.
- Multi-cam scenes start on a new page in the page estimate.
- Dialog duration is reported as total recorded voice-over.
- Lint findings are sorted by line.
- Extra rule `script.unclosed-note` flags a Fountain note that is never closed.
- Text utilities: abbreviations match case-sensitively (uppercase titles are protected), wrap
  width is at least 1, intra-word underscores are kept, and syllable heuristics are improved.
- Deferred to M2: `dialog.graph.exit` (no unconditional path to an ending).

## M2 implementation notes

Shipped in 0.1.0:

- Engine: length targets (`target` in frontmatter or dialog YAML, warning beyond 10%), per-segment
  YouTube pacing with segments, multi-cam format checks, procedure step checks, dialog revisit
  variety, graph exit and trapped-loop checks, placeholder and promotional-word rules, and voice
  rules (speakers checked against voice bibles).
- Projects and voice bibles: `prose init`, `.agent-prose/project.json`, `prose/voice@1` YAML,
  `prose voice list` and `prose voice fit`.
- Settings resolution (form, then project, then document) including the `wpm` override, and the
  speech index (`meta.speech`) used by script layout and scene and speech lengths.
- Quality gates: golden `parse`/`measure`/`lint` snapshots, a per-rule pass/fail table test, the
  stands-alone test (now also covering `docs/`), and CI running `test`, `typecheck` and `refs:check`.
- Eight skills (setup, dialog, instruct, formal, script, speech, comedy, voice) with tier-3
  references, and paired with-skill and without-skill evals.

Remaining:

- M3b: the LAN reading page with duels, refine rounds and read-aloud.
- M3c: the Bradley-Terry taste model, ranking and the model's own predictions.
- M4 render: PDF, reading copy, dialog export and OpenAI TTS.

## M3a implementation notes

Shipped in 0.2.0: variant sets (`prose/set@1`, a base plus one file per variant), ten measured
directions, `prose set check` (rejections, warnings, movement), sealed predictions that freeze
what the owner will see and a hash of each variant file, picks recorded as `prose/verdict@2`
rows in project and per-user logs (each row carries the set's random uid, so a set id reused
after deletion never collides with the old one), `prose taste stats`, and the ninth skill,
prose-review.

Data integrity: every change to a set runs under a per-set lock (a `.lock` directory with
`owner.json` `{ pid, token, at }`). Holders heartbeat between steps; a waiter takes the lock over
only when its owner process is dead (after about 2 s) or it has not been heartbeated for 2 min, and
release removes only a lock that is still its own. `set.json`, predictions and reveals are written
atomically. A pick writes `pick.pending.json` before appending verdicts and `set.json` last, so a
retry after a crash must repeat the same pick and its appends are deduplicated. Variant hashes
ignore a BOM and line endings.

Deliberate differences from agent-beeps: no server yet; the agent writes the variants and the
tool verifies them, rather than generating them; one choice weighs about one duel, so each loser
in a pick counts 1/(shown-1); `prose init` writes `.agent-prose/.gitignore` so sets and taste data
stay out of version control.

### Data files and schemas (0.2.0)

- `prose/set@1` (`sets/<id>/set.json`): `id`, `uid` (random, survives id reuse), `createdAt`, `form`, `format`, `source`, `base`, `directions`, `variants[{index,file,direction,label?,note?}]`, and `picked`/`pickedAt` once chosen.
- `prose/prediction@1` (`prediction.json`): `set`, `pick`, `shortlist`, `why`, `at`, `shown` (the variants the owner will see, frozen), `hashes` (SHA-256 of each shown variant file, BOM and line endings ignored), `seal` (SHA-256 over the rest).
- `prose/reveal@1` (`reveal.json`): `picked`, `at`, `agent{pick,shortlist,why,hit,shortlistHit,sealValid}`.
- `prose/verdict@2` (one JSON line per loser, project and per-user logs): `at`, `project`, `set`, `setUid`, `kind`, `form`, `register`, `voices`, `winner{index,x}`, `loser{index,x}`, `weight`, `tags`, `features` (feature-set id), `shown`, `n`. `x` is the scaled feature vector centred on the shown set.
- `prose/ledger@1` (`~/.agent-prose/taste/predictions.jsonl`): `at`, `project`, `set`, `setUid`, `form`, `picked`, `agent{...}`. A prediction discarded at pick time (edited seal or changed variant) is recorded with `hit: false`, `sealValid: false` and `voided: 'edited' | 'variant-changed'`, and counts as a miss.
- `prose/pick-pending@1` (`pick.pending.json`): `pick`, `at`; exists only while a pick is interrupted.
- The 12 features, in vector order (feature set `v1`): length, sentence, rhythm, wordLen, variety, contractions, hedges, passive, exclaim, question, secondPerson, nominal.
- Weight rule: each loser in a pick among `shown` variants weighs 1/(shown-1), so one choice totals about one duel.

M3b notes: a server process must not call the synchronous lock/write functions from request handlers (they block the event loop); shell out to the CLI or add async variants; heartbeat between steps.

Remaining: M3b, the reading page with duels, refine rounds and read-aloud; M3c, the
Bradley-Terry taste model, ranking and the model's own predictions.
