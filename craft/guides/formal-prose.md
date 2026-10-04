---
family: formal-prose
title: Academic and professional prose
forms: [academic, professional]
reviewed: "2026-10-04"
sources: [mensh-kording-2017, icmje-manuscript, unc-grant-proposals, nng-how-users-read, unc-business-writing, liang-gpt-detectors-bias, kojima-popiel-2023, nng-plain-language-experts, gopen-swan-1990, pinker-curse, pautasso-2013, hartley-2014, writing-commons-executive-summary, niaid-research-plan, sollaci-pereira-2004, millar-budgell, mac-readability-rct, unc-abstracts, stricker-2020, unc-argument, ar-25-50, digitalgov-writing-understanding, unc-literature-reviews, fiorillo-confabulated-references, niaid-specific-aims, nng-f-pattern, purdue-memo-parts, purdue-memo-audience, writing-commons-progress-reports, writing-commons-proposals, digitalgov-principles, gov-uk-25-words, language-portal-readability]
---
# Academic and professional prose: a craft reference

Read the section you need, not the whole guide: `prose guide formal-prose --section <name>`. How the text is
marked: a number in brackets, such as [3], points to the Sources list at the end. "Convention:" marks a
habit of the trade that no source tested. "Maintainer judgement:" marks advice with no source behind it.
"Measured here:" marks a number from a run of this plugin on the guide's own examples; it shows that a
problem happens, not how often.

## What it is and who reads or hears it

Academic and professional prose is written to be read, then acted on. Two forms share this guide. Both are
Markdown read forms; nothing in them is spoken, so no spoken-time rule applies.

- **Academic** (`academic`): abstracts, papers, literature reviews and the aims page of a grant application,
  for reviewers, editors and other researchers. It is judged on whether its claims hold.
- **Professional** (`professional`): memos, reports, proposals, executive summaries, status updates and
  email, for a colleague, manager or client who has to decide or do something. It is judged on whether the
  reader can act after reading the top.

The readers behave differently.

1. **The reader who stops early.** The abstract is "for most readers, the only part of the paper that will
   be read" [1]; many databases index only it, and "information in abstracts often differs from that in the
   text" [2]. A grant reviewer "may not read every word" [3]. Memos and reports are scanned for purpose and
   decision; a 1997 NN/g test found most users scanned a new page [4].
2. **The non-native reader and writer.** UNC asks whether idioms need local knowledge [5]. Plain wording is
   not a flaw: Liang and colleagues report that detectors "consistently misclassify non-native English
   writing samples as AI-generated" and caution against using them to evaluate people [6]. Kojima and Popiel
   write for non-native researchers, from examples in manuscripts they edited [7]. Maintainer judgement: do
   not swap a plain word for a more academic one to sound expert; keep sentences short, terms consistent and
   claims calibrated.
3. **The expert.** NN/g's expert participants "crave succinct information that is easy to scan"; the
   evidence is participant quotes [8].

Two ideas run through the guide. **Put what the reader needs where the reader looks**: the abstract, the
opening of a memo, the end of a sentence [9]. **Claim what the evidence supports, in words that show how
strongly**: abstracts should state limitations and "not overinterpret findings" [2]. Pinker's curse of
knowledge is why writers miss both in their own drafts [10].

How far to trust the sources. Most are advice, not tests. Gopen and Swan (1990) is an expert essay with
rewrites the authors judged themselves [9]; Mensh and Kording and Pautasso are practitioner rules [1][11];
Kojima and Popiel has no data on how readers judge hedges [7]; Hartley's review calls itself non-systematic
and an opinion piece [12]. UNC, Purdue and Writing Commons are teaching guides, and Writing Commons is used
only to name genre parts [13]. NIAID says some content is no longer updated [14]. The firmest numbers are a
count of four medical journals [15], one passive-voice experiment with students [16] and one readability
trial [17].

### Using the plugin

- Start the file with front matter `form: academic` or `form: professional` and a `target: 150 words`, so
  `length.target` checks the length. `--form` on `prose lint` overrides the form.
- `prose lint <file>` runs the rules in the table at the end. `ai.vocabulary` and `ai.promotional` flag
  generic or promotional wording: style findings about phrasing, never a judgement of who wrote the text.
  `formal.bluf` and `formal.supported-claims` are judgement rules; lint lists them and you decide.
- Lint cannot check that a claim matches its data, that a citation exists, that new information sits last in
  the sentence, or that a hedge is calibrated; the sections below say how to check those by reading.
- `prose measure <file>` reports words, longest sentence, passives, nominalizations (hidden verbs), hedges
  and a reading grade: where to look, never a target. `prose audit <file> --text` lists stock-phrasing
  hallmarks with a direction for each, as a revision aid for generic wording; it is not a detector.
- The `prose-formal` skill writes and checks both forms; `prose guide academic --section rules` prints the
  table.

## Anatomy and conventions

### Academic: the abstract as a unit

An abstract is "a self-contained, short, and powerful statement that describes a larger work", serving
selection and indexing, so the terms searchers use must appear [18]. Three shapes appear.

- **Structured.** Required for original research and systematic reviews: context, purpose, basic procedures,
  main findings with effect sizes where possible, principal conclusions, limitations [2]. Structured
  abstracts "are reported to help": Hartley reports they are longer, more informative and easier to read and
  search, and a five-site replication favoured them on completeness and clarity. But his review is
  non-systematic, the raters were mostly undergraduates, and no study compared whole papers [12].
- **Broad, narrow, broad.** Mensh and Kording: context narrowing to the gap, then "Here we" with method and
  result, then a conclusion with broader significance. The commonest mistake is "to talk about results
  before the reader is ready to understand them" [1].
- **Descriptive or informative.** The first says what the work covers, with no results; the second adds
  results and conclusions. Follow the publisher [18].

Maintainer judgement: give the context one sentence and put the main result in the second; that also meets
`formal.bluf`. The target journal's instructions override this; the author guides of Nature, Science and APA
were not read. A plain language summary is a separate text: in 103 psychology pairs the summaries scored
better on four readability indices, but comprehension was not tested [19].

**Titles.** "A distilled description of the complete article" [2]. Mensh and Kording want one central
contribution, because "papers that simultaneously focus on multiple contributions tend to be less convincing
about each" [1]. Maintainer judgement: name the finding, not only the topic.

### Academic: IMRaD, and where it does not fit

Original research is "usually divided into Introduction, Methods, Results, and Discussion", not "an
arbitrary publication format but a reflection of the process of scientific discovery". The editors'
contents: the introduction gives context, the purpose or hypothesis and only pertinent references, with no
data or conclusions; Methods are detailed enough to reproduce and name any AI use, with tool, version and
prompts; Results give the main findings first without repeating every table value; the Discussion opens with
a short summary and states limitations [2].

It is a convention that took decades to win: in 1,297 articles from four leading medical journals it began
in the 1940s and passed 80 percent in the 1970s; the authors warn against extrapolating [15]. No source here
compares it with alternatives. Meta-analyses, case reports, narrative reviews and editorials may use other
formats [2]; for reviews it "does not work or is rarely used" [11]. Reporting guidelines (the editors name
CONSORT, STROBE, PRISMA and STARD) set the detail for particular designs; only the editors' description of
them was read [2].

### Academic: the paragraph as a unit of argument

"Each unit of discourse, no matter what the size, is expected to serve a single function, to make a single
point" [9]. An academic argument is "a main idea, often called a 'claim' or 'thesis statement', backed up
with evidence that supports the idea" [20]. Convention: one claim per paragraph, its evidence close behind
and named (a number, a source, a figure). The claim "has to be supported by data and by a logic that gives
it credibility" [1]. Evidence norms are field-specific, and it is "usually better to consider one or two
serious counterarguments in some depth, rather than to give a long but superficial list" [20]. Mensh and
Kording add a scheme: a paragraph's first sentence gives context and its last the conclusion, and results
read as declarative statements each backed by a figure. It serves a patient reader; news-style,
most-exciting-first writing serves an impatient one [1].

### Academic: reader-expectation prose

Gopen and Swan argue that difficult scientific prose is often a structure problem: readers interpret from
where things sit. Their principles [9]: keep subject and verb close; start with what the sentence is about
and with linking old information (the topic position); end with the new or important information (the stress
position), because "Save the best for last"; put the action in the verb; give context before new material;
let emphasis match substance.

In their experience misplaced old and new information is "the No. 1 problem in American professional writing
today", not a measured rate. They state limits: "None of these reader-expectation principles should be
considered 'rules.' Slavish adherence to them will succeed no better than has slavish adherence to avoiding
split infinitives or to using the active voice instead of the passive". On length they reject a fixed cap
(the formula-makers' favourite is 29 words), have seen 10-word sentences that are virtually impenetrable,
and call a sentence too long when it has "more viable candidates for stress positions than there are stress
positions available" [9].

### Academic: passive voice and "active is not always better"

AR 25-50 makes active voice one of two essential requirements of Army writing [21]; Digital.gov says the
passive "obscures who handles what" [22]; neither offers evidence. Millar and Budgell gave 161 students two
methods sections, original (mostly passive) and rewritten fully active: comprehension did not differ, word
counts barely moved, and readers rated passive sentences slightly clearer. They conclude the results "do not
support editorial guidelines that favor active voice over passive voice"; limits are non-randomised cohorts,
one institution and short biomedical texts [16]. UNC says the passive "can be a useful tool in
legally-sensitive writing" [5]. Gopen and Swan: "Pollen is dispersed by bees" is the better sentence in a
paragraph about pollen [9]. Maintainer judgement: use the active voice when the reader must know who did or
must do something (a method, a request, a limit of your own work), and the passive when the thing acted on
is the topic. `style.passive.report` counts passives so you look at each.

### Academic: hedging and certainty

Hedging expresses "tentativeness and possibility" (may, might, seem, suggest) and lets authors claim with
"appropriate accuracy, caution, and humility". Kojima and Popiel's examples: "To our knowledge" and "to
date" on a count of cases, "suggested" instead of "proved" ("prove" is "rarely used in scientific writing"),
"appear to" for a trend that is not universal. Where results make a statement a fact, leave it unhedged;
"excessive use of hedging may lead to suspicions on the credibility of statements" [7]. No source tests how
readers judge hedged against unhedged claims. Pinker's classic style avoids "soggy apologies and hedges"
such as somewhat, nearly and apparently, in a secondhand report [10]; the two address different readers.
Maintainer judgement: hedge the inference, not the measurement. State the number plainly, say once how far
it reaches, and never stack hedges on one claim. The hedge count in `prose measure` is a prompt, not a
quota.

### Academic: literature reviews and citations

A review "usually has an organizational pattern and combines both summary and synthesis"; it is organised
around ideas, not source by source, and says its organising principle [23]. "Reviewing the literature is not
stamp collecting": be critical, name gaps, and record the search terms [11].

**Verify every reference.** The editors ask authors to check references against a bibliographic source such
as PubMed, check for retracted articles, and "be able to attest that the references cited support the
associated statement" [2]. A language model can produce references that look right and do not exist: a 2026
editorial collects reported cases and notes that fabricated references "mimic the format" of genuine ones;
its figures are secondhand, so none is quoted [24]. Maintainer judgement: open every cited source and
confirm that it exists, that authors, year and title match, and that it says what your sentence claims. A
reference you cannot check does not go in; leave a visible placeholder and say so.

### Academic: grant aims

NIAID, for NIH applications: aims that can be finished in the funding period (four to five years for an
R01), with "clear endpoints reviewers can readily assess". Two to four aims are possible, many write three,
and the common mistake is being overly ambitious: "It's much better to think small". An aim shaped "Does A
cause B?" can end the project if A does not; a descriptive aim is "rarely a highly significant finding". A
central hypothesis anchors the aims [25]. The one page is "a capsule of your Research Plan" that every
reviewer reads: open with a sentence stating the goals and give at least half the page to rationale and
significance [14]. UNC adds: write for a colleague who knows the field but not your details, and predict the
reviewer's questions [3]. Check the current notice: NIAID says the review criteria were regrouped for
applications due on or after 25 January 2025 [14]. No NSF, European or foundation guide was read.

### Professional: the bottom line first

The Army standard says effective writing is "understood by the reader in a single rapid reading" and names
two essential requirements: the main point at the beginning, and the active voice. It gives no evidence
[21]. NN/g recommends the inverted pyramid and an explicit summary for longer texts [8], and the key points
in the first two paragraphs [26]. `formal.bluf` rests on the Army standard. Apply it to the abstract, the
cover letter, the summary and the opening of a memo: the answer or the decision wanted, in the first or
second sentence. Maintainer judgement: not to a Methods section, which IMRaD orders by process. The pyramid
principle was not read; no free source was available.

### Professional: memos, reports, proposals and summaries

**Memo.** Purdue: a heading (TO, FROM, DATE, SUBJECT); an opening with purpose, context and problem, and the
task; a summary only for memos over a page; discussion from most to least important; a courteous closing
that says the action wanted [27]. Send it only to those who need it, and use a call or meeting for what is
too sensitive to write [28]. UNC's pattern for any genre is OABC: Opening, Agenda, Body, Closing [5].
Neither states a bottom-line rule as such.

**Executive summary.** It "may be as long as 500 words while an abstract is limited to 150 to 200 words",
sits before the introduction, and tends to be written last [13]. Maintainer judgement: it is for the reader
who will not read the report, so it carries the recommendation, the evidence in a number or two, the cost or
risk, and the decision wanted. A list of what each section covers is a table of contents.

**Status update and proposal.** A progress report covers work completed, a plan for the rest, and challenges
[29]; a proposal sets out a problem, solutions and costs [30]. Both are genre definitions, not tested
advice. Maintainer judgement: open a status update with the status in a line (on track, at risk, blocked),
then done, next, risk and the decision you need, each with a date or number.

**Email and subject lines.** Purdue wants a subject "specific and concise": "Fall Clothes Line Promotion",
not "Clothes" [27]; AR 25-50 wants one subject in "10 words or less, if possible" [21]. Purdue's guide is
about print memos [28]. The rest is Maintainer judgement, since no source on email, politeness or length was
read: open an email like a memo, put the request and its deadline in the subject and first sentence, and
send one request per email:

```text
Weak:   Update
Weak:   Quick question
Better: Approve runner budget by 18 October
Better: Draft abstract attached: comments by Friday
```

### Professional: tone, scanning and plain language

UNC: "concise" does not mean "blunt" [5]. Digital.gov: "write for your audience"; the idea that you must
"dumb down" content is a myth [31]. In NN/g's 1997 test, concise text, scannable layout and objective
language each beat a promotional control, and the three together by 124 percent; the page gives no
participant count [4]. That is the case against promotional words, which `ai.promotional` flags. Scanning
cues help a reader who looks something up: key points first, headings that start with the informative words,
parallel lists [26]. Convention: use a list or heading only if the reader would scan this text. Hidden verbs
are a plain-language target ("We conduct an analysis" becomes "We analyze") [22]; `prose measure` counts
them, and the guidance is untested.

### Where the rules pull apart

- **Bottom line first, or context first.** A memo opens with the answer; an abstract opens with context and
  an IMRaD paper builds to its discussion [21][1]. Apply `formal.bluf` to the abstract, the cover letter,
  the summary and the memo, with one sentence of context at most.
- **Short sentences, or the sentence the idea needs.** The 25-word flag is a convention, and Gopen and Swan
  say length is not the problem [32][9]. Read a flagged sentence and split it only if it holds two points.
- **Cut hedges, or calibrate them.** Plain-language sources cut them and scientific advice calibrates them
  [10][7]. Cut the ones that carry no uncertainty.
- **Active voice, or the passive.** The evidence favours neither as a rule [16][9].

## Length and timing

**Sentences.** `style.sentence.max` warns above 25 words, GOV.UK's limit; NN/g suggests 15 to 20 even for
experts [32][8]; AR 25-50 asks for an average of about 15 [21]. Convention: 25 is a convention, since
GOV.UK's figures are secondhand in a blog post flagged as possibly out of date, and Gopen and Swan reject
any fixed cap [9]. Hold the flag lightly in academic prose: split a long sentence only if it holds more than
one point.

**Paragraphs, subjects, pages.** AR 25-50: paragraphs of "no more than 10 lines", subjects of "10 words or
less, if possible", one-page memos for most correspondence; policy with no evidence, and no lint rule checks
it [21]. Abstract lengths are rules of thumb: UNC guesses 100 to 120 words descriptive and 250 or more
informative [18]; Writing Commons gives 150 to 200 against 500 for an executive summary [13]. Journals and
funders set their own limits; check the current notice [14]. `length.target` warns outside ±10 percent of a
declared target.

**Reading level.** NN/g usually recommends grade 6 to 8 for general readers and 10 to 12 for experts [8]. A
randomised trial that lowered health texts to grades 8, 10, 12 and 14 found no difference in knowledge [17];
plain-language researchers say formulas penalise lists and miss what makes text usable [33]; Millar and
Budgell's active rewrites left Flesch scores almost unchanged [16]. So `readability.grade.report` reports
and never targets. The rule table below says which thresholds are a source's figure and which are this
plugin's choice (derived).

## What good looks like

The examples are written for this guide; the study, the project and every number in them are invented. Each
Markdown example passes `prose lint` with no errors or warnings. The bad examples are plain text, with the
warnings lint counts on them.

### An abstract

<!-- bad example, on purpose: the guide's tests lint it as academic and expect 2 warnings -->

```text
In this paper, we delve into the pivotal role of testing in the ever-evolving landscape of modern software
development. Flaky tests are a significant and groundbreaking challenge for teams, and a comprehensive
understanding of their impact is crucial. We analyse build logs and discuss the implications of our
findings, and we describe a tailored approach that was deployed in a number of repositories, and which, it is
hoped, may in some cases be of some benefit to teams. Results are discussed.
```

Measured here: `prose lint` reports 2 warnings: a sentence of 40 words, and three AI-era vocabulary terms
("crucial", "delve", "pivotal"). `prose audit` lists five stock-phrasing hallmarks. Lint cannot see that the
result is never stated and that the close promises "discussion" in place of an outcome. Rewritten:

```markdown
---
form: academic
target: 100 words
---

Flaky tests make teams rerun builds, but the share of build time this costs has not been measured. Across 1,200 repositories in six months, reruns used 38% of continuous integration compute, and a few flaky tests caused most of them. In a pilot in 40 repositories, quarantining the ten most frequent flaky tests in each cut rerun compute by about a third. The pilot had no control group, so the drop may have other causes. Teams can use the same counts to find their own short list, and a controlled trial would show whether quarantine is the cause.
```

Context and gap take one sentence, the result is second, the limit is stated, and the close says what to do
next.

### A paragraph with the new information in the stress position

<!-- bad example, on purpose: the guide's tests lint it as academic and expect 1 warning -->

```text
Quarantine was tried by us in 40 repositories. Rerun compute fell by about a third. A short list of flaky tests, which build logs from 1,200 repositories over six months had allowed us to identify, caused most reruns. Because most reruns came from so few tests, the quarantine, which removes a test from the set that blocks a merge without deleting it, could be applied to a short list.
```

Measured here: `prose lint` reports 1 warning, a sentence of 31 words. The faults are placement: the result
comes before the reader knows what was tested, "which ... had allowed us to identify" separates subject and
verb, sentences end on trailing clauses, and "quarantine" is used before it is defined. Rewritten:

```markdown
---
form: academic
---

Six months of build logs from 1,200 repositories showed that a short list of flaky tests caused most reruns. Those tests can be quarantined: removed from the set that blocks a merge, but not deleted. We quarantined the ten most frequent flaky tests in each of 40 repositories. Rerun compute then fell by about a third.
```

Each sentence ends on its news and the next starts from it ("Those tests"). The passive stays, because the
tests are the topic.

### A hedged claim

<!-- bad example, on purpose: the guide's tests lint it as academic and expect 0 warnings -->

```text
These results prove that quarantine removes the cost of flaky tests for every software team.

It could perhaps be suggested that quarantine might possibly tend to reduce rerun cost somewhat.
```

Measured here: `prose lint` reports no warnings, and `prose measure` counts 3 hedges in the second sentence.
The first overclaims (one pilot, no control, "prove", "every"); the second hedges until it says nothing.
Rewritten:

```markdown
---
form: academic
---

Quarantining the ten most frequent flaky tests cut rerun compute by about a third in 40 repositories. The pilot had no control group, so it suggests but does not show that quarantine caused the drop. Whether the effect holds in repositories with few flaky tests is untested.
```

The measurement has no hedge; one hedge sits on the causal inference.

### A specific-aims opening

<!-- bad example, on purpose: the guide's tests lint it as academic and expect 1 warning -->

```text
Urinary tract infection is a major problem in children worldwide. This innovative proposal will transform how infections are diagnosed and has the potential to change care. We will describe the microbiome of children in several settings and explore many aspects of diagnosis, and the results will be of great interest to the field.
```

Measured here: `prose lint` reports 1 warning, a sentence of 27 words. The text opens with background,
praises itself, and states no goal, hypothesis or endpoint; its aims are descriptive, which NIAID warns
against [25]. Rewritten as a capsule:

```markdown
---
form: academic
---

The goal of this project is to learn whether a rapid urine test can find urinary tract infections in children before antibiotics are started. Current practice waits two days for a culture, and children are often treated in the meantime. Our central hypothesis is that the rapid test agrees with culture in at least nine of ten children. We will test it in three aims.

Aim 1. Measure agreement between the rapid test and culture in 600 children seen in an emergency department. Outcome: the share of children whose results agree, with a confidence interval.

Aim 2. Find which results disagree. Outcome: the features linked to disagreement, so that we know when not to trust the test.

Aim 3. Compare antibiotic use before and after the test is introduced. Outcome: the change in children treated before a culture result, whichever way it moves.
```

The goal opens the page, one hypothesis anchors three aims, and each aim has an endpoint [25].

### A memo opening

<!-- bad example, on purpose: the guide's tests lint it as professional and expect 2 warnings -->

```text
SUBJECT: Update

As you know, over the past several months the platform team has been looking at various aspects of our build system in light of some concerns that were raised. After a good deal of discussion and a review of a number of options, it was felt that it might be worthwhile to bring the matter to your attention, and a decision on a possible way forward would be appreciated at your earliest convenience.
```

Measured here: `prose lint` reports 2 warnings, sentences of 29 and 44 words; `prose measure` counts 4
nominalizations. The subject names nothing, and the request has no date. Rewritten (FROM and DATE are left
out for length):

```markdown
---
form: professional
---

TO: Dana Ortiz, Director of Engineering

SUBJECT: Decision by 18 October: faster build runners

Please approve 4,800 dollars a month for faster build runners by 18 October. Builds now take 31 minutes, and the vendor's two-week trial brought them to 12. Approval by the 18th lets us switch before the November release freeze.

The cost is the only open question. The trial showed no change in test results, and switching takes one day.
```

The subject carries the decision and the date, and the first sentence is the request: Purdue's opening [27]
with the Army's bottom line first [21].

### An executive summary

<!-- bad example, on purpose: the guide's tests lint it as professional and expect 0 warnings -->

```text
This report describes the results of the build-time review. Section 2 gives the background, Section 3 covers the method, and Section 4 presents the findings. Section 5 discusses implications and Section 6 concludes.
```

Measured here: `prose lint` reports no warnings. It is a table of contents: it says what the report holds
and gives the reader nothing to act on. Rewritten:

```markdown
---
form: professional
---

We recommend moving the build system to faster runners, at a cost of 4,800 dollars a month, before the November release freeze. Builds now take 31 minutes. A two-week vendor trial brought them to 12 with no change in test results. Developers wait on builds about 40 minutes a day in total, so the saving is mostly time already paid for.

Two risks remain. The trial covered one team, and the vendor's price is fixed for one year only. We recommend a three-month review after the switch.

Decision needed: approve the spend by 18 October. Section 2 gives the trial data and Section 3 the cost model.
```

Recommendation, evidence, cost, risks and decision come first; section pointers come last.

### A status update

<!-- bad example, on purpose: the guide's tests lint it as professional and expect 0 warnings -->

```text
Worked on the migration this week. There were some issues but we are making progress. Will continue next week.
```

Measured here: `prose lint` reports no warnings (one info finding, for "There were"). It names no status,
count, problem or ask. Rewritten with the three parts Writing Commons names (work completed, plan,
challenges) [29]:

```markdown
---
form: professional
---

Status: on track for the 15 November cutover, with one risk.

Done this week: moved 14 of 22 services to the new cluster, and the migrated services passed their smoke tests.

Next week: move the remaining 8 services, starting with billing.

Risk: the billing service needs a database upgrade first. If the vendor patch is not out by Friday, the cutover slips by one week. We need a decision from Priya on Friday about whether to wait.
```

A reader can stop after the first line and know the state; the risk names its trigger, cost and decider.

## Common failures and the habits behind them

Fixing the habit behind a failure prevents the next one. The habits are Maintainer judgement unless cited.

### Background first, result last, new information buried

An abstract or memo spends its opening on why the topic matters, because the writer follows the order the
work happened in; sentences end on a trailing clause because the writer captures the new thought first [9].
Fix: context in one sentence, then the result or request [1][21]; move each sentence's new point to the end.
Lint cannot see either; read the first two sentences and the last three words of each.

### Stock phrasing, inflated claims and invented specifics

"Pivotal", "groundbreaking", "a comprehensive analysis", "prove", "every", a missing sample size filled with
a guess: the habit is writing to sound authoritative and filling gaps with what sounds plausible. Fix: say
what was found, with its number and scope; use a visible `[placeholder]` for a missing value
(`formal.supported-claims`, `draft.placeholders`). `ai.promotional`, `ai.vocabulary` and `prose audit` point
at the phrase, not the author, and plain wording is not a fault [6].

### Hedging until nothing is claimed, or not at all

Stacked modals ("might possibly tend to"), or "proves" on one pilot: the habit is protecting yourself
instead of informing the reader. Fix: decide fact or possibility for each statement [7].

### Citations nobody checked, reviews that list, aims that overreach

A reference that does not exist or does not say that; "Smith found X. Jones found Y."; five aims and no
endpoints. Fix: open each reference [2][24]; organise a review by theme and say the principle [23]; write
two to four aims, each with an endpoint [25].

## How to revise

Revise in this order: early steps change what the reader can do or believe, later ones how it reads.

1. **Decide the reader and the one thing they must do or believe.** Write it as one sentence. If you cannot,
   the draft is not ready to edit.
2. **Check the opening.** Is the result or request in the first or second sentence (`formal.bluf`), unless
   the genre builds to it? Does the title or subject line name it?
3. **Check every claim against the data you were given** (`formal.supported-claims`). Replace what you
   cannot support with a visible placeholder or cut it, and list the placeholders in your report.
4. **Verify every citation.** Open it, confirm that it exists and says what the sentence says [2].
5. **Run `prose lint <file>`, then `prose measure <file>`.** Fix every error and warning; `ai.*` findings
   are prompts to say the specific thing. Read the longest sentence, passives, nominalizations and hedges,
   then decide. `prose audit <file> --text` lists stock phrasing. Do not chase the grade [17].
6. **Read for position and calibration.** Is the new information last, the subject near its verb, and each
   claim marked fact or possibility? The principles are not rules; stop when it reads naturally [9].
7. **Cut, then test on a reader.** Delete sentences that only say what a section does. Pinker's remedy for
   the curse of knowledge is a representative reader [10]: give the draft to someone, or an agent without
   your context, and ask what they would do after the first paragraph.
8. **Report numbers.** Words against the target, remaining placeholders, which references you could and
   could not check, and which lint findings you left and why.

## Rules that apply

The table is generated from `craft/rules.json` for `academic` and `professional`. `formal.bluf` and
`formal.supported-claims` are judgement rules. The `ai.*` rules are style findings about phrasing, not
detectors; the `voice.*` rules fire only in a project with voice bibles. A threshold marked "This plugin's
choice" is not a source's figure. Whether a claim is true and a citation real is for the writer.

<!-- generated:rules begin (npm run guides) -->
| Rule | What it checks | Severity | Threshold | Threshold basis | Run by |
|---|---|---|---|---|---|
| `style.sentence.max` | Written sentences over 25 words are flagged. | warn | 25 words | A source's figure | lint |
| `readability.grade.report` | Reading grade is reported, never targeted. | info | none | n/a | lint |
| `style.passive.report` | Passive voice is counted and reported, not banned. | info | none | n/a | lint |
| `style.echo` | A three-word phrase repeated 3 or more times is flagged. | info | 3 occurrences | This plugin's choice (derived) | lint |
| `plain.there-is` | Sentences opening with There is / There are are flagged. | info | none | n/a | lint |
| `ai.copula-avoidance` | 'serves as', 'stands as', 'functions as' in place of is/are are flagged. | info | none | n/a | lint |
| `ai.artifact` | No leaked chatbot markup or unfilled placeholders. | error | none | n/a | lint |
| `draft.placeholders` | Bracketed placeholders are listed until filled. | info | none | n/a | lint |
| `ai.promotional` | Promotional words (groundbreaking, renowned, nestled, profound ...) are flagged in factual forms. | info | none | n/a | lint |
| `ai.vocabulary` | Three or more distinct era-tagged AI vocabulary terms in one draft are flagged. | warn | 3 distinct terms | This plugin's choice (derived) | lint |
| `formal.bluf` | The main result or request comes in the first or second sentence. | warn | none | n/a | judgement |
| `formal.supported-claims` | Every claim is supported by the data given; missing values are [placeholders], never invented. | warn | none | n/a | judgement |
| `length.target` | A draft with a declared target lands within ±10% of it. | warn | 0.1 fraction | This plugin's choice (derived) | lint |
| `voice.targets` | Each voiced speaker's measured style stays inside the voice bible's target ranges. | warn | none | n/a | lint |
| `voice.bible-valid` | Every voice bible in the project loads: valid YAML and schema, id matching the file name, unique ids, and each speaker claimed by one bible. | error | none | n/a | lint |
| `voice.banned` | A speaker never uses a word their voice bible bans. | warn | none | n/a | lint |
| `voice.unvoiced` | In a project with voice bibles, every speaker resolves to one. | info | none | n/a | lint |
<!-- generated:rules end -->

## Sources

Numbers in brackets in the text refer to this list. Most sources report their authors' practice and were not
tested on readers.

<!-- generated:sources begin (npm run guides) -->
1. Brett Mensh and Konrad Kording, 2017. [Ten simple rules for structuring papers](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1005619) (practitioner; id `mensh-kording-2017`). Practitioner rules, not tested: one central contribution in the title, context-content-conclusion at every scale, the abstract as broad-narrow-broad.
2. International Committee of Medical Journal Editors. [Preparing a Manuscript for Submission to a Medical Journal](https://www.icmje.org/recommendations/browse/manuscript-preparation/preparing-for-submission.html) (standard; id `icmje-manuscript`). Editors' standard for biomedical journals: what each IMRaD part and a structured abstract hold; authors must verify that references support their statements.
3. UNC Writing Center. [Grant proposals (or give me the money!)](https://writingcenter.unc.edu/tips-and-tools/grant-proposals-or-give-me-the-money/) (practitioner; id `unc-grant-proposals`). University handout: write for a colleague who knows the field, follow the guidelines exactly, expect selective reading.
4. Jakob Nielsen (Nielsen Norman Group), 1997. [How Users Read on the Web](https://www.nngroup.com/articles/how-users-read-on-the-web/) (practitioner; id `nng-how-users-read`). A short 1997 test: most users scanned; concise, scannable and objective text each improved measured usability.
5. UNC Writing Center. [Business writing](https://writingcenter.unc.edu/tips-and-tools/business-writing/) (practitioner; id `unc-business-writing`). University handout: audience questions, the OABC pattern, concise is not blunt; states no bottom-line-first rule.
6. Liang, Yuksekgonul, Mao, Wu and Zou, 2023. [GPT detectors are biased against non-native English writers](https://arxiv.org/abs/2304.02819) (peer-reviewed; id `liang-gpt-detectors-bias`). Patterns 4(7). Abstract-only in our notes: seven detectors misjudged non-native English essays as machine-written (61.3% average false-positive rate on 91 TOEFL essays) while classifying native essays accurately.
7. Takako Kojima and Helena A. Popiel, 2023. [Effective use of hedging in scientific manuscripts: advice to non-native English-speaking researchers](https://pmc.ncbi.nlm.nih.gov/articles/PMC10151619/) (practitioner; id `kojima-popiel-2023`). Advice with before-and-after examples; calibrate hedges to the evidence. No data on how readers judge hedged claims.
8. Loranger (Nielsen Norman Group), 2017. [Plain Language Is for Everyone, Even Experts](https://www.nngroup.com/articles/plain-language-experts/) (practitioner; id `nng-plain-language-experts`). Experts also prefer plain text; no more than 15-20 words per sentence.
9. George D. Gopen and Judith A. Swan, 1990. [The Science of Scientific Writing (American Scientist, reprint)](https://cseweb.ucsd.edu/~swanson/papers/science-of-writing.pdf) (practitioner; id `gopen-swan-1990`). Expert essay with author-judged rewrites, no experiment: put old information first and new information last, keep subject and verb close; the principles are not rules.
10. Association for Psychological Science (report of a Steven Pinker address), 2015. [The Curse of Knowledge: Pinker Describes a Key Cause of Bad Writing](https://www.psychologicalscience.org/observer/the-curse-of-knowledge-pinker-describes-a-key-cause-of-bad-writing) (practitioner; id `pinker-curse`). Classic style avoids hedges such as somewhat, nearly, relatively and apparently.
11. Marco Pautasso, 2013. [Ten simple rules for writing a literature review](https://pmc.ncbi.nlm.nih.gov/articles/PMC3715443/) (practitioner; id `pautasso-2013`). Practitioner rules, not tested: a review is critical, not stamp collecting; record the search; IMRaD rarely suits a review.
12. James Hartley, 2014. [Current findings from research on structured abstracts: an update](https://pmc.ncbi.nlm.nih.gov/articles/PMC4076121/) (review; id `hartley-2014`). A non-systematic, opinion-style review; structured abstracts are reported to be more complete and clear, judged mostly by undergraduates.
13. Writing Commons. [Executive summary](https://writingcommons.org/section/genre/executive-summary/) (practitioner; id `writing-commons-executive-summary`). Weak evidence, used only to name the genre: an executive summary conveys the essence, may run to 500 words, and tends to be written last.
14. National Institute of Allergy and Infectious Diseases (NIH), 2025. [Write your research plan](https://www.niaid.nih.gov/grants-contracts/write-research-plan) (style-guide; id `niaid-research-plan`). Funder guidance: the aims page is a capsule of the plan; the review framework changed in 2025, so check current limits.
15. Luciana B. Sollaci and Mauricio G. Pereira, 2004. [The introduction, methods, results, and discussion (IMRAD) structure: a fifty-year survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC442179/) (peer-reviewed; id `sollaci-pereira-2004`). A count of 1,297 articles in four medical journals, 1935 to 1985: IMRaD went from rare to universal in original papers; not to be extrapolated beyond those journals.
16. Millar & Budgell, 2019. [The passive voice and comprehensibility of biomedical texts: an experimental study with 2 cohorts of chiropractic students](https://pmc.ncbi.nlm.nih.gov/articles/PMC6417867) (peer-reviewed; id `millar-budgell`). Active rewrites changed neither length, readability nor comprehension.
17. Mac, Ayre, McCaffery, Boroumand, Bell, Muscat, 2025. [The Readability Study: A Randomised Trial of Health Information Written at Different Grade Reading Levels](https://pmc.ncbi.nlm.nih.gov/articles/PMC12119439/) (peer-reviewed; id `mac-readability-rct`). No comprehension difference between grade 8 and grade 14 versions.
18. UNC Writing Center. [Abstracts](https://writingcenter.unc.edu/tips-and-tools/abstracts/) (practitioner; id `unc-abstracts`). University writing-centre handout: selection and indexing; descriptive against informative abstracts; word counts are rules of thumb.
19. Stricker, Chasiotis, Kerwer and Gunther, 2020. [Scientific abstracts and plain language summaries in psychology: a comparison based on readability indices](https://pmc.ncbi.nlm.nih.gov/articles/PMC7117690/) (peer-reviewed; id `stricker-2020`). 103 pairs: plain language summaries scored better on four readability indices; comprehension was not tested.
20. UNC Writing Center. [Argument](https://writingcenter.unc.edu/tips-and-tools/argument/) (practitioner; id `unc-argument`). University handout: a claim backed by evidence; evidence norms differ by field; one or two serious counterarguments in depth.
21. Headquarters, Department of the Army, 2020. [Army Regulation 25-50: Preparing and Managing Correspondence](https://www.maine.gov/dvem/policies/documents/AR%2025-50%20(10%20October%202020).pdf) (standard; id `ar-25-50`). Army writing standard: bottom line up front, active voice, ~15-word average sentences, avoid opening with It is / There is / There are.
22. Digital.gov (US General Services Administration), 2025. [Writing for understanding](https://digital.gov/guides/plain-language/writing) (style-guide; id `digitalgov-writing-understanding`). Active voice, present tense and hidden verbs, with detection signals; house guidance without tests. The capture is partial.
23. UNC Writing Center. [Literature reviews](https://writingcenter.unc.edu/tips-and-tools/literature-reviews/) (practitioner; id `unc-literature-reviews`). University handout: summary plus synthesis, organised around ideas, with the organising principle stated.
24. Luca Fiorillo, 2026. [Confabulated references in the age of AI: contamination of the biomedical scientific literature](https://www.explorationpub.com/Journals/em/Article/1001385) (review; id `fiorillo-confabulated-references`). An editorial that collects reported cases of invented references; its figures are secondhand from a few small studies.
25. National Institute of Allergy and Infectious Diseases (NIH), 2023. [Draft specific aims](https://www.niaid.nih.gov/grants-contracts/draft-specific-aims) (style-guide; id `niaid-specific-aims`). Funder guidance: two to four aims, usually three, finishable in the funding period, with endpoints; do not be overly ambitious. Some NIAID content is no longer updated.
26. Kara Pernice (Nielsen Norman Group), 2017. [F-Shaped Pattern of Reading on the Web: Misunderstood, But Still Relevant](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/) (practitioner; id `nng-f-pattern`). Eyetracking: with no strong cues readers scan; put the point first, start headings with the informative words.
27. Purdue Online Writing Lab. [Parts of a memo](https://owl.purdue.edu/owl/subject_specific_writing/professional_technical_writing/memos/parts_of_a_memo.html) (practitioner; id `purdue-memo-parts`). University guide: heading, opening, summary, discussion, closing, attachments; a specific, concise subject line.
28. Purdue Online Writing Lab. [Audience and purpose (memos)](https://owl.purdue.edu/owl/subject_specific_writing/professional_technical_writing/memos/audience_and_purpose.html) (practitioner; id `purdue-memo-audience`). University guide: send a memo only to those who need it; use a call or meeting for what is too sensitive to write.
29. Writing Commons. [Progress reports](https://writingcommons.org/section/genre/progress-reports/) (practitioner; id `writing-commons-progress-reports`). Weak evidence, used only to name the genre: completed work, a plan for the rest, and challenges.
30. Writing Commons. [Proposals](https://writingcommons.org/section/genre/proposals/) (practitioner; id `writing-commons-proposals`). Weak evidence, used only to name the genre: a problem, solutions and costs, with qualifications and a budget.
31. Digital.gov (US General Services Administration), 2025. [Principles of plain language](https://digital.gov/guides/plain-language/principles/) (style-guide; id `digitalgov-principles`). Write for your audience; plain language is not dumbing down; test that readers understand.
32. GOV.UK (Inside GOV.UK blog), 2014. [Sentence length: why 25 words is our limit](https://insidegovuk.blog.gov.uk/2014/08/04/sentence-length-why-25-words-is-our-limit/) (style-guide; id `gov-uk-25-words`). Break up or condense sentences over 25 words; supporting comprehension figures are second-hand.
33. Language Portal of Canada, 2024. [Readability formulas, programs and tools: Do they work for plain language?](https://our-languages.canada.ca/en/blogue-blog/readability-formulas-eng) (review; id `language-portal-readability`). Rewriting to lower a formula score does not raise comprehension.
<!-- generated:sources end -->
