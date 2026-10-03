# AI style audit — design

Status: draft for the 0.4.0 line. Builds on the `ai.*` lint rules and era-tagged lexicons shipped in 0.1.0. Evidence base: the maintainer's research notes on AI prose tells, detector reliability and style homogenisation (summarised below; sources cited in `craft/references.json`).

## Goal

Help a writer revise prose that reads like default model output: generic, evenly promotional, formulaic. The audit reports where the text shows known habits, why each reads generic, and which direction a revision could take. It is a revision aid. It never says who wrote a text.

## What the evidence allows (and so what we will not build)

- A single document cannot be reliably attributed from style. Detector tools err in both directions; they misclassify non-native human writing as machine-written; untrained readers score about chance. A panel of heavy LLM users does far better, but that signal is not codifiable.
- Three tiers of tell, by strength: **hard artifacts** (leaked chatbot markup, tracking parameters, unfilled placeholders, chat residue), **clustered soft tells** (era-specific vocabulary, a few sentence shapes, chat-style formatting) that count only together, and **weak or false tells** (perfect grammar, formal register, isolated transition words, "robotic" prose) that must not be flagged at all.
- Tells are dated and model-specific (a once-famous word faded within two years; the em dash rate runs from 0.0 to 9.1 per 1,000 words across models). Every entry carries an era tag and the list needs a review date.
- Removing tells is cheap and defeats detectors more easily than experienced readers. A clean report proves nothing about authorship.

So: **no score, no probability, no "AI-written" label.** Findings are tied to spans, with the claim "this reads like default model prose here", and the output states its limits every time.

## Principles

1. **Findings, not verdicts.** The words "likely AI", "AI-generated" or any percentage never appear as a conclusion about a text. A report says `reads like default model prose in N places` only when a cluster is present, and `no cluster of default-model habits found; this does not show a person wrote it` otherwise.
2. **Weak tells are not flagged.** Perfect grammar, formal register, plain or constrained wording, isolated transitions, "robotic" tone: never. The report says that plain wording and non-native writing trigger some detectors in published research and that this audit does not treat them as findings.
3. **Hard artifacts first, as defects.** They are defects in finished text whoever wrote it, so they are reported as errors with the exact span and no inference about authorship.
4. **Soft tells count together.** One or two are coincidence; the cluster rule needs several distinct families. The threshold is a convention set from measured human false-positive rates on a held-out sample (see "Measuring it"), not taken from a source.
5. **Revision, not evasion.** The audit points at generic spans and suggests specific directions (add the fact, name the source, cut the formula). It says nothing about passing a detector and the skill never promises that.
6. **Versioned and dated.** Every lexicon entry has an era or model tag; the structural patterns carry their source; the report prints the lexicon's review date.

## The audit

`prose audit <file> [--text] [--form <id>]` parses the draft like `measure` and reports:

| Tier | Families | Evidence note |
|---|---|---|
| `hard` | leaked chatbot markup and tracking parameters, unfilled placeholders, chat residue (*I hope this helps*, *Certainly!*), knowledge-cutoff disclaimers | Reuses the `ai.artifact` patterns and adds chat residue and cutoff disclaimers |
| `soft` | era-tagged vocabulary (existing lexicon, exact words only), copula avoidance (*serves as*, *stands as*), promotional wording, undue-significance phrases (*stands as a testament*, *plays a pivotal role*, *evolving landscape*), trailing participle analysis (`, highlighting its importance.`), negative parallelism (*it is not X, it is Y*, *not just X but Y*), weasel attribution (*experts argue*, *observers have noted* with no source), the fixed "Despite ... faces challenges" conclusion, a closing "Overall," or "In conclusion," paragraph opener, inline-header bullets (`- **Term:** text`), emoji at the start of headings or bullets, Title Case headings, mechanical boldface | Wikipedia's field guide for most of these (descriptive, not a study, informational writing); vocabulary from the corpus studies it cites (abstract-only in our notes) |
| `measured` (reported, never flagged) | em dashes per 1,000 words (model-dependent: say so), sentence-length variation, triplet lists ("A, B, and C") per 1,000 words, `is/are` rate | Reported as context; no source gives a threshold |

Each finding: `{ tier, family, line, text (span, at most 120 characters), eras?, why, direction }`. `why` is one plain sentence on what makes the span generic (for example "A trailing clause that comments on the sentence instead of adding a fact"). `direction` is a revision direction, never a replacement phrase ("add the specific fact or cut the clause", "name the source or cut the attribution", "say what happened instead of that it matters").

Report summary: counts by tier and family; `softPerThousand`; `cluster: { met, families, threshold }`; the measured values; the lexicon review date; and the standing limits text. `--text` prints a readable list grouped by family, with the limits at the end.

Forms: the structural soft tells apply to prose forms (Markdown, plain text blocks). Formatting tells apply only to Markdown. Fountain and dialog drafts report hard artifacts and vocabulary only (dialogue and stage directions read differently). Verse forms are skipped with a note, as the prose style rules are.

`prose lint` is unchanged: its `ai.*` rules stay as they are (hard artifacts as errors, the rest advisory). The audit is a separate, deeper report so lint does not get noisier.

## Measuring it

Before the audit is described as useful, measure what it flags.

- **Human sample:** arXiv abstracts from 2018 to 2021 (before public chat models), several hundred across fields, a population that includes many non-native writers (the group published research says detectors misjudge). Public text, used only for measurement; nothing from it is stored in the repository except aggregate numbers and the arXiv ids.
- **Model sample:** abstracts written by Claude for the same titles with a plain prompt, and a smaller set with an instruction to avoid model clichés and write like a careful human (to show how far surface tells can be removed).
- **Split:** half for calibrating the cluster threshold, half held out. The report publishes, on the held-out half: per-family flag rates for the human and model samples, the human false-positive rate of the cluster rule (the share of human abstracts that meet it), the share of plain-prompt model abstracts that meet it, and the same for the clean-prompt set. A threshold is chosen so the human false-positive rate on the calibration half is at most 5%, and that rate is then reported honestly on the held-out half, with confidence intervals. The model samples come from one model family, so the detection numbers say nothing about other models.
- The write-up states plainly what the audit cannot do: it does not identify authors, a low flag rate does not show a human wrote a text, and the numbers are for academic abstracts only.

## Skill

`prose-audit`: when the owner asks whether text "sounds like AI", wants it "less AI", "more natural" or "more human", or asks for an audit of a draft for generic or model-sounding prose. The skill runs `prose audit`, revises by span with the direction each finding names (adding the specific fact, naming the source, cutting the formula), keeps the owner's facts and voice, reports before and after counts, and never states or implies authorship or detector outcomes. It refuses to promise that text will pass a detector and says why in one sentence. When the draft is too thin to revise (no facts to add), it asks for the missing specifics rather than inventing them.

## Testing

Pure tests for each detector (matches, near-misses, a human-writing counter-example per family, markdown versus plain text, code blocks and quotations excluded), the cluster rule, the tier output shape, the `--text` rendering and the standing limits text (a test asserts the words "authorship" and "does not" appear and that no verdict phrases do). A golden audit of a model-like paragraph and of a human abstract. The measurement harness is a script plus the published numbers, not a unit test of the data.

## Out of scope

Authorship probabilities, any numeric "AI-ness" score, detecting a specific model, fiction-specific tells, non-English text, multi-document corpus statistics (a possible later mode), automatic rewriting by the tool (the agent rewrites; the tool only reports), and keeping findings out of `lint`.

## Risks

- **Misuse as an accusation.** Mitigated by wording, the standing limits text and the cluster rule; not removable. The report must be unattractive as evidence.
- **Goodhart.** Writers (and agents) can chase the findings and produce new tells. The skill says to add specifics and cut formulas, not to swap words, and the report says a clean result proves nothing.
- **Decay.** Vocabulary and formatting habits move with each model generation. Era tags and the review date make staleness visible; the threshold is recalibrated with the sample when the lexicon changes.
- **Narrow measurement.** One text genre, one model family for the model sample. Stated in the write-up.
