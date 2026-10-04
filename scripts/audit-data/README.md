# Audit measurement data

The style audit (`prose audit`) reports, beside each family it finds, how common that family is in human writing. Those rates are measured on two public samples and stored as aggregates in `craft/audit-rates.json`. This directory holds the scripts that collect the samples again. **No text from any sample is committed to this repository**; the scripts write outside it, into the OS temp directory by default.

Neither script runs in the test suite (the tests make no network request). Both accept `--help` and `--dry-run`, which parse the arguments and print the plan without any request.

## What each script fetches

- `fetch-arxiv.mjs`: human-written arXiv abstracts created from 2018 to 2021, before public chat models, through the arXiv OAI-PMH interface (`https://oaipmh.arxiv.org/oai`). Eight sets (cs.CL, cs.CV, cs.LG, stat.ML, physics.comp-ph, math.PR, q-bio.NC, econ.EM), four date windows each, 13 abstracts drawn per window with a seeded shuffle, at most 50 per set. Kept: 80 to 400 words, mostly Latin letters, and an English check (stop words above a quarter of the words). Requests are spaced 5 seconds apart; `Retry-After` is honoured on 503 and 429 responses (30 s and 120 s when none is sent); four attempts per request. Writes `human/<id>.txt`, `manifest.json` and `titles.tsv`.
- `fetch-wikiintro.mjs`: pairs of a Wikipedia introduction from before 2023 and an introduction generated for the same title by GPT "Curie" (`text-curie-001`), from the public Hugging Face dataset https://huggingface.co/datasets/aadityaubhat/GPT-wiki-intro through the datasets-server API. Five 100-row batches at seeded random offsets; kept: both texts 60 to 400 words, each title once, at most 350 pairs. Writes `human/wNNNN.txt`, `model-plain/wNNNN.txt` (the directory name `audit-measure.mjs` expects) and `manifest.json`. The dataset card gives a non-specific license (`cc`).

```
node scripts/audit-data/fetch-arxiv.mjs --out <dir>
node scripts/audit-data/fetch-wikiintro.mjs --out <dir>
```

## Seeds behind the committed numbers

| Sample | Seed | Detail |
|---|---|---|
| arXiv abstracts | 20240607 | Harvested 2026-10-03; 351 abstracts, ids in `docs/research/2026-10-03-ai-audit-sample-ids.txt`. |
| Wikipedia introductions | 20261003 | Fetched 2026-10-03; offsets 7383, 1293, 88824, 37592, 130492; 350 pairs. |
| Split of ids into calibration and held-out halves (`audit-measure.mjs`) | 20261003 | Only the older single-directory report uses it. |

The committed numbers came from the Python collection scripts that these ports replace. Python's random generator and the one used here (mulberry32, in `common.mjs`) draw different numbers from the same seed, so a fresh run of the arXiv script with seed 20240607 gives a comparable sample (same sets, windows, filters and sizes), not the same 351 abstracts; arXiv's contents also move over time. The Wikipedia script can reproduce the committed sample's offsets exactly: pass `--offsets 7383,1293,88824,37592,130492`. Rates measured on a fresh sample will differ a little from the committed ones; the interval on each rate in `craft/audit-rates.json` says how much to expect.

## Model samples

The model texts are not fetched by these scripts.

- **Plain** (Claude, one abstract per arXiv title, 351): "Write the abstract of a research paper with that title in that field, as it would appear on arXiv, between 150 and 250 words, plain text with no title and no markdown."
- **Careful** (Claude, 120 of those titles): the plain prompt plus "Write it the way a careful human researcher would: concrete, specific claims; no stock phrases that sound like a generic AI assistant; no empty statements about how important or significant the work is."
- **Older GPT** (Wikipedia introductions): the dataset's own generated introductions, as published in the dataset linked above, from a prompt asking for a 200-word Wikipedia-style introduction seeded with the first seven words of the real text.

Put model texts, one file per title with the same id as the human file, in `<dir>/model-plain/` (and `<dir>/model-clean/` for the careful prompt).

## Rerunning the harness and regenerating the rates

Each data directory holds `human/` and `model-plain/`. With the arXiv directory `A` (human files from `fetch-arxiv.mjs`, model files you generated) and the introductions directory `W`:

```
node scripts/audit-measure.mjs --data arxiv=A --data wikiintro=W --write-rates craft/audit-rates.json
```

This writes the per-family share of texts with a finding (with a Wilson 95% interval), the 95th percentile of three-item lists per 1,000 words (texts of 100 words or more) and the medians of the measured values, for the human and the model texts of each sample. Aggregates only. `triplet-density` reads its threshold from this file (the larger human 95th percentile, rounded up to one decimal), and its own rate depends on that threshold, so after the threshold moves, run the command a second time and keep the second file. The older report (calibration and held-out halves, paired comparison) is `node scripts/audit-measure.mjs <dir> [--seed N] [--json]`. The findings are in `docs/research/2026-10-03-ai-audit-measurement.md`.
