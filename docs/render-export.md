# Render and export

`prose render <file> --to <html|pdf|md|json> --out <new-path> [--form <id>]` exports a native draft. The JSON command result records the source SHA-256, form, artifact paths, warnings and estimates. Output parent directories must exist. Existing files, symbolic links, hard links and duplicate output paths are refused; there is no overwrite flag.

| Draft | Targets | Result |
|---|---|---|
| Fountain | HTML, PDF | Screenplay, multi-camera or stage-play layout; grouped cues, dual dialogue and explicit page breaks |
| Speech Markdown | HTML, PDF, Markdown | Large-type reading copy with emphasis, suggested breath boundaries and estimated spoken time on each page; Markdown target preserves the original bytes |
| Other Markdown/verse | HTML, PDF, Markdown | Standalone document or original Markdown bytes |
| Dialog YAML | JSON | Validated document data plus `<out>.manifest.json`; parser line tables are excluded |

HTML includes the vendored fonts and print CSS. Raw Markdown HTML is escaped, images become their alternative text and links print their labels. Print artifacts cannot fetch remote content. Speech uses 20-point Courier Prime, 38-column rows and explicit pages so its per-page timing remains useful offline; headings are excluded from spoken duration. Breath boundaries are visual aids inferred from punctuation and existing line breaks. They do not change the draft or constitute authored performance directions. Script runtime measurements remain estimates from the existing measurement model; printed PDF page counts do not replace them. Stage-play timing remains provisional and needs a rehearsal.

Examples:

```sh
prose render drafts/keynote.md --to html --out exports/keynote.html
prose render drafts/pilot.fountain --form tv-drama --to pdf --out exports/pilot.pdf
prose render drafts/gate.dialog.yaml --to json --out exports/gate.json
```

The JSON sidecar uses `prose/render-manifest@1`; it records the source file/hash and output path. Graphs with missing targets, duplicate node IDs or unmarked endings are refused with `E_SCHEMA`; advisory graph findings remain warnings. The sidecar is an export receipt, separate from the `prose/dialog-manifest@1` used for guarded source writeback.

## Optional PDF browser

Ordinary setup and CLI use never download a browser. Install the pinned Playwright package's paired Chromium headless shell explicitly:

```sh
node scripts/setup.js --pdf
node scripts/setup.js --check --pdf --json
```

The browser lives under `<AGENT_PROSE_HOME>/browsers` (default `~/.agent-prose/browsers`). Missing paired Chromium returns `E_BROWSER_MISSING` and the repair command. HTML, Markdown and JSON work without it. On Linux, install the operating-system prerequisites separately using the managed release's Playwright CLI (`node node_modules/playwright/cli.js install-deps chromium`); this may require administrator privileges. See [Playwright browser installation](https://playwright.dev/docs/browsers#install-system-dependencies).

PDF rendering disables page JavaScript, blocks service workers and network requests, waits for embedded fonts, uses CSS paper dimensions and emits tagged PDFs. Tags improve document structure; they do not establish complete PDF accessibility conformance. Layout behavior follows the [Playwright PDF API](https://playwright.dev/docs/api/class-page#page-pdf).

## Explicit OpenAI audio

```sh
prose render drafts/keynote.md --to html --out exports/keynote.html \
  --tts openai --audio-out exports/keynote.wav --voice marin
```

Only `--tts openai` sends text to the OpenAI speech API. `OPENAI_API_KEY` is required and never included in output/errors. Audio needs a companion HTML or PDF copy. Script speech includes speaker names; classified directions are excluded from spoken input. The reading copy and `<audio-out>.manifest.json` disclose **AI-generated voice**. The sidecar records source hash, model, voice and chunk count.

The isolated provider pins `gpt-4o-mini-tts-2025-12-15`. The command warns about the announced January 6, 2027 speech-model deprecation; changing that model belongs in this provider module. Voices are validated locally. See [OpenAI text-to-speech](https://developers.openai.com/api/docs/guides/text-to-speech) for listener disclosure, voices and PCM format.

Input is split at sentence/line boundaries when possible and otherwise by Unicode code point. Each chunk is at most 1,800 UTF-8 bytes (also below 4,096 characters), conservatively bounding token input below 2,000 tokens. Requests ask for mono 24 kHz signed 16-bit little-endian PCM. Complete samples are joined in request order under one WAV header; prosody can change at chunk seams. Limits: 60 seconds per request, five minutes per audio export, 1,000 chunks, 10 MiB per response, 100 MiB total audio and 20 MiB source drafts. Automatic retries are disabled to avoid duplicate paid requests after ambiguous failures. A provider failure returns `E_TTS` and publishes no companion artifacts.

## Publication and recovery

All artifacts are built before publication. New files are hard-linked from flushed stage files without replacing existing targets. A publication conflict rolls back the files still owned by that operation while preserving concurrent owner files. Multiple files are a journaled operation, not a filesystem-wide atomic transaction.

An interrupted publication leaves `.prose-render-<id>` journals alongside outputs. Rendering again to a participating output recovers all directories in that operation: incomplete publication is rolled back only when inode identity and recorded content hashes still agree. Completed publication is preserved. An edited output causes `E_CONFLICT`; keep the journal and inspect it before retrying. Recovery never overwrites user files. A machine/filesystem that does not support hard links returns `E_RENDER` instead of attempting an unsafe overwrite fallback.

Offline and fake-provider tests run in ordinary unit-test CI. The real-browser integration tests run when the paired browser is already installed; they skip otherwise. No test makes a live paid speech request. Local visual inspection is recorded in [render verification](verification/2026-10-05-render.md).
