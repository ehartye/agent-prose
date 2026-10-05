# Remaining roadmap: craft fixes, render/export, and dialogue round trips

Date: 2026-10-04
Status: approved by the owner to proceed; implementation and release requested on 2026-10-05.
Baseline: `18d16349e69451a91158fa82cdbf17ef1d56aa58` (0.6.0).

## Scope and success

The owner requested the remaining render/export, craft-guide fixes, and game-dialogue integration items. CLI-capable skill evals in CI are excluded. Existing unit-test CI remains the verification gate. This work produces three independently reviewable increments, in this order: correctness/reference fixes, render/export, and dialogue round trips. No existing draft, voice bible, set, prediction, or verdict requires migration.

Success means the known craft defects have regression coverage; supported drafts produce usable offline print/reading artifacts; a game line can be extracted, reviewed, and applied to its exact source occurrence without changing gameplay metadata. Conflicts must be reported before source edits. Documentation and the maintainer's project notes describe the resulting behavior, with remaining evidence gaps explicitly labeled.

The space2grow testbed supplies fixtures and real source contracts. This scope builds the integration and demonstrates it on copies. It does not invent the owner's unrecorded picks or silently rewrite game dialogue. Any later content pilot uses the working integration and the owner's recorded choices.

## Approach and tradeoffs

| Approach | Time | Risk | Complexity | Best practice | Maintenance |
|---|---|---|---|---|---|
| Recommended: three increments; preserve game structure in a source manifest and edit text leaves | More initial work than a replacement script; each increment can be reviewed independently | Low risk for fixes, moderate for print layout and source writes; snapshots, preflight, and recovery bound failures | Focused render modules and one manifest/patch protocol; no game runtime in prose | Versioned artifacts, preserved identities, regression tests, explicit external audio | Source adapters stay small; existing formats continue working |
| Make prose own the complete game dialogue runtime and migrate the game | Longest; blocks integration on game migration | High: quest selection, once-only behavior and effects could change | Adds state evaluation, engine semantics, and a migration | Appropriate only if prose is intended to become the game's runtime, which has not been requested | Two projects must coordinate future schema/runtime changes |
| Export strings and replace matching text after review | Fastest initially; repeated manual repairs later | High when identical strings occur more than once or the source changes | Small script, but hidden identity assumptions | Useful only as a temporary pilot tool | Becomes fragile as dialogue moves or conditional variants grow |

The owner requested implementation and shipment on October 5, 2026. Work remains on a feature branch until verification and review, then ships through a squash merge, tagged release and marketplace version update.

## A. Craft-guide findings

Each code defect starts with a regression reproducing the reported behavior. The following dispositions cover the numbered plugin/repository findings in `prose-guide-findings.md`.

1. **Multi-camera first scene:** centered pre-scene markers consume their printed lines but do not trigger a new full page before the first scene. Explicit page breaks still do. Later scenes still start new pages. Modify `src/measure/script.ts`; test preamble markers, later scenes, and explicit breaks.
2. **YouTube times:** accept both `m:ss` (including minutes above 99) and `h:mm:ss`; validate seconds/minutes components rather than silently ignoring malformed time ranges. Parsed durations, stripped spoken text, and finding locations agree. Test hour boundaries, Unicode range separators, invalid components, and reversed/zero ranges in `tests/segments.test.ts`.
3. **Meter length:** warn when a form's known meter cannot fit the measured syllable count even without a declared `syllables` pattern. Reuse the existing meter-fit rules, including tolerated variation; do not replace scansion with an exact-ten-syllables rule. Explicit declared patterns take precedence. Uncertain dictionary readings retain their caveat. Cover both sonnet forms and limerick line-specific feet.
4. **Timing honesty:** keep stage-play timing visibly provisional; do not replace its rate with an unsupported figure. Where runtime is inferred from script pages, minute-target findings use the existing 20 percent timing band rather than the generic 10 percent target tolerance. A measured rehearsal remains the recommended check. Explicit user settings remain supported and visible.
5. **Hymn/lyric notation:** normalize unambiguous common-meter aliases (`CM`, `8686`, `8.6.8.6`) and double-meter notation (`8.7.8.7.D`) into the existing syllable pattern representation. Preserve numeric-array inputs. Add an optional declared textual meter using the existing foot vocabulary; it drives advisory text scansion, never a claim about alignment with music. Distinguish Pattison's related-coda family-rhyme convention from vowel-only assonance using the captured primary examples, and retain pronunciation uncertainty.
6. **YouTube sourcing:** label the default WPM range as a maintainer estimate unless captured evidence supports it. Remove unsupported source attribution from `forms.json` and the script references. Keep the already-corrected BBC subtitle figure separate from speech rate.
7. **Shared references:** move cross-guide sources into the existing common `craft/references.json` and remove duplicate definitions from guide fragments. Keep citation IDs stable and regenerate guides/`REFERENCES.md` using existing scripts. No new reference registry.
8. **Bibliographic discrepancies:** resolve Mac's publication year and Liang's figures against actual captured primary evidence; distinguish preprint date from journal publication where relevant. Correct the repo and maintainer notes only as the evidence supports.
9. **Windows flakes:** replace load-sensitive tick counts and latency thresholds in the three named tests with controlled holds/barriers that verify another operation completes while a lock or load is pending. Keep the behavioral assertion that the server/event loop remains responsive. Do not merely increase thresholds or delete the assertions.
10. **Review skill length:** move procedural detail into a one-level reference when adding round-trip guidance; retain the existing 150-line skill limit and trigger behavior.

The backlog's later sourcing list is evidence work, not permission to invent new automatic rules. Discover and ingest sources needed for these changes; unresolved standards/paywalls and unrelated craft questions remain explicitly documented as research gaps. Neither a universal speech WPM nor a text-only stress-to-musical-beat correctness rule follows from the current evidence.

## B. Render and export (M4)

### CLI and artifacts

Add `prose render <file> --to <pdf|html|md|json> --out <path> [--form <id>]`. Supported combinations:

- Fountain screenplay/TV/multi-camera/stage-play: PDF or standalone HTML, with layouts chosen by form.
- Speech Markdown: PDF or standalone HTML reading copy with large type, existing emphasis, breath-unit boundaries, and a per-page estimated spoken duration.
- Other Markdown/verse: standalone HTML, PDF, or a faithful Markdown copy.
- Dialog YAML: validated JSON plus `<out>.manifest.json`; JSON contains document data and excludes parser-only source-line lookup tables.

The command returns JSON with artifact paths, form, source hash, and relevant estimates/warnings. It refuses unsupported combinations, input/output aliases, or existing output files. This initial command does not need a force-overwrite option. Stage all artifacts first; a failure publishes none, and interruption recovery must not overwrite user files.

### Rendering

Use the existing parsed IR for script/reading layouts and a pinned Markdown renderer with raw HTML disabled for Markdown inline formatting. Escape text and labels. Fonts are local vendored assets; generated HTML is self-contained. PDF rendering disables JavaScript and denies network access, so draft markup or links cannot fetch remote assets. Wait for fonts before printing. Preserve speaker grouping, explicit page breaks, dual dialogue, and the form's capitalization/spacing conventions.

Use a pinned Playwright runtime package with its paired Chromium headless shell. `node scripts/setup.js --pdf` explicitly installs the browser into the managed home; ordinary CLI use does not download it. PDF without the paired browser returns `E_BROWSER_MISSING` with the repair command. HTML/Markdown/JSON work without a browser. Linux system prerequisites are documented separately from browser installation.

Print CSS fixes paper size/margins and controls scene/cue/speech breaks. Use `preferCSSPageSize` and tagged PDF output. PDF layout is distinct from the existing approximate script-runtime measurement: emitted physical pages do not silently redefine those estimates. A printed speech page reports its own words and estimated duration using the selected WPM. Breath marks are presentation aids based on existing punctuation/line breaks; they do not alter the original or claim to be authored performance direction.

### Optional cloud audio

Extend render with `--tts openai --audio-out <path.wav> [--voice <id>]`. Only this explicit flag permits a speech request. Require `OPENAI_API_KEY`, name the external text send in the result/help, and never log the key. Use an official speech endpoint and a fixed documented model, with supported voices checked locally.

Extract the text a listener should hear (including speakers as appropriate; excluding directions already classified as non-spoken). Split long input at units/sentences, with a Unicode-safe fallback and bounds satisfying both the endpoint character cap and the selected model's token limit. Request PCM, verify compatible complete samples, concatenate in order, and emit one WAV header. Document possible prosody seams. Bound request duration, retries, response size and total export size; provider failure returns `E_TTS` and leaves no completed audio artifact.

The audio manifest carries model/voice, source hash, chunk count and the disclosure `AI-generated voice`. A companion reading copy displays that disclosure when audio was requested. No cloud service is called by tests or ordinary render.

### Verification

Run CLI integration tests for every target, missing browser, overwrite refusal, hostile markup, and failure cleanup. Use real Chromium locally to inspect multi-page script/stage/speech fixtures, dual dialogue, page breaks, fonts, and speech-page timing. Record screenshots/inspection in a repository verification note. Provider tests use a local fake HTTP server to cover limits, Unicode, failures, chunk ordering, WAV validity, disclosure, and no request without opt-in. Existing CI runs ordinary render tests; a new skill-eval workflow is excluded.

## C. Game-dialogue integration

### Preserve the authority boundary

The game owns conditions, effects, quest/tier rules and runtime selection. Prose owns review text and measurements. Use a versioned `prose/dialog-manifest@1` sidecar describing source slots, their immutable context, and the original document snapshot. Do not evaluate imported game JavaScript.

Each slot contains a unique stable `id`, source file relative to the declared source root, a typed locator, original text, exact source-file hash, context hash, speaker, line kind, optional group/topic identity, and character limit. A game-authored ID is retained. A data-path identity is permitted when the source has no ID and is explicitly labeled snapshot-derived; reordering or source edits require re-export. Equal strings in two slots remain different identities.

JSON/YAML locators are structural paths. Static JavaScript data uses AST-identified string literal ranges and structural identities; dynamic expressions or interpolated templates are unsupported and reported. Preserve quote escaping, BOM, line endings and all bytes outside the selected string literals. No general-purpose JavaScript evaluation or text-search replacement fallback.

### Commands and review

Add `prose dialog import <source> --out <draft.dialog.yaml> --manifest <path>` for supported JSON/YAML/static-data JavaScript, with the space2grow bridge/ambient shape as the first concrete adapter. Emit an explicit report for unsupported structures rather than omit them silently. Source roots and paths are explicit; all output is offline.

Add `prose dialog review <draft> --manifest <path> --id <slot-id>` to create a normal line-scoped set carrying an optional `sourceRef`. Existing `set`, reading queue, prediction and pick protocols remain intact. `sourceRef` is sealed along with the reviewed content/context; a candidate can change the designated text only. The sidecar retains the game's protected payload (tiers, quest IDs, once flags, effects, conditioned variants, reply tones, headlines, tags) and associates it with the exact slot. Preserve state-selected variants as separate conditioned slots, never style-rotation variants.

The current reading page already handles per-line sets, side-by-side originals, batch queues and rejection feedback; reuse them. Small-edit direction scores remain measurements rather than a taste or quality verdict. When selected text is too short for a reliable directional score, report that uncertainty instead of rejecting a distinct edit merely for a zero score. Preserve the sealed feature/prediction compatibility of existing sets.

### Limits and repetition

Source slot limits override generic form-box guidance for that slot. Read limits from the adapter's actual source contract: the live space2grow bridge uses 150 characters; its newer contract uses 160. Bubble, label, reply-label, headline and topic-path limits remain distinct. Validate replacement limits and the affected whole-topic/path budget before apply; conditions are conservatively retained, not simulated by prose.

Independent topic/exchange entries and bark-only files need no synthetic graph root. Add optional entry-point metadata for multiple conversations and explicit revisit policy for intentional hubs; graph integrity still checks dangling links and endings within each entry. Do not blanket-suppress graph findings.

Add explicit multi-file dialogue repetition reporting with source/slot locations. Exact duplicates and catchphrase occurrence rates are observations; intentional shared references and refrains remain identifiable. Catchphrase thresholds are optional per voice and labeled as owner settings, not universal craft facts. Voice bibles gain optional negative character constraints as brief/guidance text, without pretending semantic enforcement. Fitted numerical ranges stay visibly provisional, avoid pathological near-zero widths, and leave semantic descriptions for the author.

### Guarded writeback

`prose dialog apply --manifest <path> --sets <ids>` defaults to a dry run returning old/new text, exact source identities, validation results, and a digest. Only recorded picks for the matching slots are eligible. `--confirm <digest>` repeats all checks before writing. Source hash, protected context, locator, old text and picked variant hash must still match. Missing/duplicate identities, stale source, unsupported expressions, invalid contract or length overflow abort the entire preflight.

Prepare all changed files and a journal before replacing originals. Reuse the existing atomic-write/lock patterns and the strike apply recovery discipline. Multi-file apply is a journaled operation, not a claim of filesystem-wide atomicity: on interruption, recovery either completes the same plan or restores originals after verifying hashes. `prose dialog undo --id <apply-id>` refuses changed output and restores exact original bytes. No half-applied result is reported as success.

### Verification

Fixtures cover conditioned variants, topic/effect/once metadata, replies, ambient tags, duplicate text in distinct slots, both space2grow limit contracts, and malformed IDs/paths. Test extract -> line-scoped review -> sealed prediction -> recorded pick -> dry run -> apply -> undo on copies of real source. Assert protected metadata and unrelated bytes never change. Test stale source, moved/reordered slots, out-of-root paths, symlinks, oversized text, structural candidate edits, concurrent apply, partial failure, and crash recovery. Run the game's existing contract validator/tests against resulting fixture data; no actual unreviewed game content is replaced.

## Files and compatibility

Expected implementation boundaries: `src/render/` and `src/commands/render.ts`; `runtime/print/`; `src/dialog/` and `src/commands/dialog.ts`; targeted changes to parser/IR slot metadata, sets/source snapshots, measurements, voice bibles and lint. Setup/error/capabilities registrations and existing skills/docs are updated with each increment. Keep existing defaults and output shapes unless an additive field is necessary; opt-in rich metadata does not require migrations. New manifest/artifact schemas are versioned from their first release.

All increments run `npm test`, `npm run typecheck`, and `npm run refs:check`. New regression tests verify the behavior, not implementation details. The final report distinguishes local checks from CI and live provider calls. Update the maintainer's architecture notes as-built, backlog dispositions, roadmap, and any accepted ADRs in the same completion operation. Correct the stale review-workspace W4 entry separately from feature status.

## Evidence

- Existing approved M4 intent: `docs/superpowers/specs/2026-10-02-agent-prose-design.md`, section 7, and the owner's decision for local browser speech by default with cloud audio opt-in.
- Existing targeted findings: the numbered craft-guide defects and dialogue testbed gaps reproduced in sections A and C above.
- Actual game contracts: space2grow `src/bridge-dialog.mjs`, `src/dialog-contract.mjs`, and `docs/dialog-contract.md`; the two beat limits are intentionally distinct.
- [Playwright Page PDF API](https://playwright.dev/docs/api/class-page#page-pdf) and [browser installation](https://playwright.dev/docs/browsers): print media, CSS page size, tagging, package/browser coupling and headless-shell setup.
- [OpenAI speech API](https://developers.openai.com/api/reference/typescript/resources/audio/subresources/speech/methods/create) and [TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech): request bounds, PCM format and listener disclosure. Recheck selected model limits during implementation.
- [Yarn Spinner localization](https://docs.yarnspinner.dev/yarn-spinner-for-unity/assets-and-localization/inbuilt-localisation): line IDs, source metadata and change locks are a precedent for the proposed round-trip manifest, not a requirement to adopt Yarn.

The architecture choices in this document were accepted for implementation. Sources establish API constraints and precedents; regression tests, real-browser inspection and source round-trip verification establish the implementation evidence.
