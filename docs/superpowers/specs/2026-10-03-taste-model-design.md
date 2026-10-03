# Taste model (M3c) — design

Status: draft for the 0.4.0 line. Builds on the owner loop (0.2.0: variant sets, sealed predictions, `prose/verdict@2` rows) and the reading page (0.3.0: duels, ties, both-bad, cross-set duels). Pattern source: the sibling plugin agent-beeps' taste model (`src/taste/`); adapted to the twelve style features and to the prose logs.

## Goal

Learn which style directions the owner picks, from the verdicts already logged, and use that to (1) summarise the taste in plain words for the agent, (2) make a sealed model prediction beside the agent's own and score both, and (3) choose which pair to show in a duel. The model describes style the owner has chosen; it never claims what is good, and it never decides anything.

## Principles

1. **A proxy, stated as one.** The features are twelve measured style properties (`src/owner/features.ts`, `v1`). The model learns relative preferences along them. Humour, originality and quality are not measured, and the summary says so.
2. **Silent until it has data.** With no usable pairs the model abstains: no prediction, no summary claims, no duel preference. Abstentions are counted, not hidden.
3. **The two predictions stay independent, by discipline and detection, not secrecy.** The agent seals its guess; the model's guess is computed and sealed by `prose predict` itself. The tool never prints the model's pick or ranking before the owner picks, and a SHA-256 seal plus a marker file make an edit detectable at the pick. But the file is readable on disk, deleting both files hides the model's result for that set, and a forged file with a recomputed hash is not detectable (there is no key and none is planned), so independence rests on the agent not reading it. A crash between writing the agent's prediction and the model's leaves that set unscored for the model; `prose predict --set <id> --model-only` repairs it before the pick. There is no agent-facing "rank this set" command. The agent reads the plain-words summary before it drafts, which is the intended influence.
4. **Rows are relative.** Verdict vectors are centred on what the owner was shown (a set, or the pair for a cross-set duel), so weights mean "more of this than the alternatives in the choice". The model uses differences only.
5. **Versions are explicit.** Only rows with `features: 'v1'` are fitted. Rows of another version are counted and reported (`skippedVersion`), never silently dropped or mixed in.
6. **Never block, never crash.** A log with garbage lines, an unreadable file or a degenerate fit gives a reported problem and an abstention.

## The model

Bradley-Terry over feature differences: `P(a beats b) = sigmoid(w . (x_a - x_b))`, no intercept. Fit by Newton's method with backtracking line search and an L2 prior (neutral at zero until data arrives); the inverse Hessian at the optimum is the Laplace covariance, so every utility carries an uncertainty. Port of the beeps `model.ts`, with these prose rules for the pairs it is fitted on:

| Row kind | Pairs it contributes |
|---|---|
| `pick` | winner against each loser, weight as written in the row (`1/(n-1)` per loser) |
| `duel` | winner against loser, weight 1 |
| `tie` | none (kept in the log; fitting a tie biases differences toward zero while shrinking error bars) |
| `bothBad` | each of the two variants loses to the row's own centre (the zero vector), weight 0.5 each, so one judgement totals weight 1 |

Cross-set duel rows are fitted like any duel: their two vectors are comparable (shared feature definitions) and centred on the pair, and only the difference is used.

**Layers.** `global` (every project's rows except the current project's, so they are not counted twice), then `project` once the current project has at least 15 fitted pairs (prior = global weights, lambda 3), then `voice` once the draft's single resolved voice has at least 15 fitted pairs among the project's rows that name it (prior = the project layer, lambda 3). A draft with zero or several resolved voices uses no voice layer. Each result reports which layers applied and how many pairs each used. The 15-pair threshold and lambda values are conventions inherited from agent-beeps, not measured here.

## Commands

- `prose taste show [--voice <id>] [--dir <project>]`: the plain-words profile, JSON by default with a `markdown` field. Per feature: the direction in words ("shorter sentences", "more contractions"), the weight and standard error, confidence (`strong` at |w|/se above 2, `weak` above 1, else `unknown`), sorted by confidence, with the layers and pair counts and the sentence that these are style tendencies in the owner's choices, not rules and not quality. Says plainly when there is not enough data yet.
- `prose taste stats` extends to both predictors: for the agent and the model, predictions made, hits, shortlist hits, abstentions (model only), hit rate and a recent-window rate, plus how often the model beat, matched or lost to the agent on the same pick. The comparison uses the pick only (hit against miss); shortlist hits are counted only over sets of four or more variants (`shortlistEligible`), because a three-wide shortlist covers every variant of a smaller set. The model's recent window is its last N predicted rows, the agent's its last N rows. Duel counts stay separate.
- `prose predict` (existing) also computes the model prediction for the shown variants and seals it. `--model-only` (repair, before the pick) seals only the model's guess for an agent prediction already sealed.
- Taste data files live where they do now (`<project>/.agent-prose/taste/` and the per-user taste directory); nothing moves.

## The sealed model prediction

`prose predict` writes `<set>/model-prediction.json` (`prose/model-prediction@1`): the model's ranking of the shown variants (index, utility, sigma), its pick and a top-three shortlist (or `null` and an abstention reason), the layers used with their pair counts, the model's weight vector, `features: 'v1'` and a SHA-256 seal over those fields plus the frozen shown list and variant hashes of the agent's prediction. The agent's `prose/prediction@1` file is untouched (no schema change). At `prose set pick` the model prediction is revealed and scored beside the agent's: the predictions ledger row (`prose/ledger@1`) gains an optional `model` object (`pick`, `shortlist`, `hit`, `shortlistHit`, `abstained`, `sealValid`, `voided`). A missing, edited or mismatched model-prediction file is a miss for the model, never an error for the owner's pick, exactly as for the agent. When the file parses, its own `abstained` field is authoritative; a marker (`model-prediction.seal.json`) that disagrees with it (the abstained flag or the seal) makes the prediction `voided: 'edited'`, so editing the marker cannot hide a miss. The marker alone decides only when the file is missing (predicted: a miss, voided `missing`; abstained: an abstention); with neither file the set was predicted by an older runtime and nothing is recorded. The ledger row also records `shownCount` so shortlist hits can be limited to sets of four or more. Old ledger rows without `model` still read.

## Active duel selection

The reading page's `nextPair` picks the least-compared pair today. With a model that has fitted pairs it picks the pair with the highest value of `(1 - |2p - 1|) * (1 + sigma)` among pairs not yet asked (p the model's probability that one beats the other, sigma the uncertainty of the difference): the comparison the model is least sure of. Without data, or on any error, it falls back to the current rule. The pick is deterministic given the model and the asked pairs. The server loads the model off the request path (cached by the taste logs' size, refitted only when a log's size changed, so a touch that moves only the modification time does not refit; read with async fs) so a duel request never blocks the event loop. Fitting costs time in proportion to the rows (about 0.4 s at 20,000 rows and 1.7 s at 100,000, measured), so the server fits the most recent rows only: it reads the last 4 MB of each log, drops a leading partial line, and fits the last 3,000 lines of each. The CLI (`taste show`, `predict`) fits all rows of both logs. A server model therefore reflects recent taste; the CLI profile reflects the whole history.

## Skill and docs

`prose-review` tells the agent to read `prose taste show` before it drafts variants, to treat it as the owner's tendencies and not as rules, to keep its own prediction independent of any ranking, and that the model's guess is sealed separately and compared at the end. README and the architecture notes describe the model and its limits. The ADR "Prose taste is Bradley-Terry over measured text features" moves from proposed to accepted with the layer rule recorded.

## Testing

Pure model tests: synthetic data with known weights is recovered within tolerance; the neutral prior with no data; the project and voice layers engage at exactly 15 pairs and shrink toward their parents; ties are ignored; `bothBad` becomes two half-weight losses to the centre; rows of an unknown version are counted and skipped; a log with torn or garbage lines is tolerated; a degenerate set of rows (all identical vectors) does not produce NaN. Summary tests on wording and confidence ordering. Sealed-prediction tests: sealing at predict, reveal at pick, an edited file is a miss, a variant changed after sealing voids as for the agent, old predictions and ledger rows without a model still work, the model abstains with no data. Stats tests: both predictors scored on the same pick, abstentions counted, the agent-versus-model comparison. Duel selection: prefers the uncertain pair, deterministic, falls back with no data or on error, never repeats an asked pair, and the reading server's request path stays non-blocking with a large log. An end-to-end CLI test on a synthetic owner with a known preference shows the model's hit rate rising above the agent's no-information baseline over sessions.

## Out of scope

Taste for non-style qualities (humour, originality, voice fit beyond the twelve features), re-measuring old verdicts when the features change (the version guard reports instead), shipping any model weights outside the owner's machine, an agent-facing ranking command, learning from engagement events (plays, notes), per-form layers, and verse features (the vector stays `v1`; verse variants use the prose features until a justified `v2`).

## Risks

- **Sparse data is the normal state.** Most owners will have tens of verdicts, not hundreds, so the model will abstain or show wide error bars for a long time. The summary and stats say so instead of overstating.
- **Features are coarse proxies.** A learned preference for "shorter sentences" can hide what the owner actually liked. The words say "tendency", and the owner's pick remains the judge.
- **The model can be gamed by the agent** if it can see the ranking before it drafts; hence no ranking command and a sealed, separate prediction.
- **Threshold and prior values are conventions.** They are inherited from agent-beeps and not tuned on prose; the spec records them as such and the stats let the owner see whether the model is any good.
