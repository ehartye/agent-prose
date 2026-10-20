---
family: teaching-prose
title: Textbook teaching
forms: [textbook]
reviewed: "2026-10-20"
sources: [bccampus-textbook-outline, ccss-text-complexity, ies-study-learning, northwestern-textbook-authors, ginns-conversational-text, lupo-text-support, mac-readability-rct, barayan-readability-control, agrawal-answerability]
---
# Textbook teaching

## What it is and who reads or hears it

Teaching prose helps a learner understand and use an idea. Its audience may share a school year
without sharing topic knowledge. Declare the learner, the prerequisite assumptions and a goal that
can be demonstrated. Audience and course context guide authoring choices [1, 2].

Research prose establishes or examines supported claims; textbook prose also builds the background
and explanations its learners need. Both preserve evidence and uncertainty. Procedures help someone
complete a task. Those purposes overlap, but they do not justify applying imperative steps or a
research-result-first rule to every lesson. **Maintainer judgement:** `textbook` is the product's
form boundary for explanations, lessons and chapters; it is not an experimentally validated taxonomy.

## Anatomy and conventions

**Convention:** save teaching Markdown with `form: textbook`, a `teaching.unit`, nonempty goals,
and optional prerequisites. A reader profile can record school placement without a numerical
text-level target. “Average U.S. high school freshman” gives a useful grade-9 starting audience.

Choose supports that serve the goal: orientation, a prerequisite bridge, connected explanation,
a concrete or worked example, a suitable attempt with feedback, and a recap [1]. The IES guide
assigns moderate evidence to worked-example/problem alternation and abstract/concrete connections,
and strong evidence to re-exposure through quizzes and deep explanatory questions [3]. It does not
require all these devices in every paragraph or establish a single optimal chapter sequence.

Make reasoning visible and acknowledge relevant difficulties without blaming the learner [4].
Introduce an essential term in context, then keep its meaning consistent. Repetition of a precise
term may be useful; a synonym is not automatically an improvement.

```md
---
form: textbook
teaching:
  unit: explanation
  goals: [Explain why diffusion has net movement down a concentration gradient.]
  prerequisites: [Particles in fluids move randomly.]
reader:
  language: en-US
  schoolGrade: 9
  essentialTerms: [diffusion, concentration gradient]
---
# Why does diffusion have a direction?

Particles in a fluid move randomly. Each particle can move in either direction across an open
boundary. The particles do not choose where to go. Yet the total movement can have a direction.

A concentration gradient is a difference in concentration between places. Suppose one side of
a container has many more coloring particles than the other. Particles cross in both directions,
but more start on the crowded side. More therefore tend to cross from that side during the same
time interval. Diffusion is the resulting net movement from higher concentration to lower concentration.

“Net” means the balance after movement in opposite directions is taken into account. At dynamic
equilibrium, particles continue moving, but the movements balance and there is no net flow.

Under otherwise identical conditions, a steeper concentration gradient increases the net diffusion
rate. Temperature, distance and medium also matter. Keeping them the same lets us compare gradients.
```

This is an original illustration based on a supplied fact packet, not a passage tested with students.
For a full lesson, add a new situation to explain and a checked answer. For this short explanation,
do not claim that merely adding a question would demonstrate learning.

## Length and timing

Use the requested length and the learning goal. The read form has no speech-rate default.
**Convention:** `target` retains the existing word/page/time semantics; it never names a school grade.
If required reasoning cannot fit, disclose the conflict and offer a concrete adjustment.

Linguistic difficulty and intellectual demand are distinct. The Common Core framework includes
qualitative and reader/task analysis as well as quantitative measures [2]. A short formula score
does not establish that a lesson is suitable, complete or easy to understand.

## What good looks like

A learner can follow how the explanation connects its ideas, see why the example works, and use
the concept in an appropriate new situation. Necessary terminology and qualifications remain intact.
The source's claims are distinguishable from an author's illustration or inference [3, 4].

Conversational-style research reports average retention and transfer benefits with limits, including
instructional duration [5]. This supports trying learner address when useful, not a compulsory friendly
voice. A ninth-grade classroom study found similar comprehension for most readers of easier and
challenging texts under its supports, with a small subgroup benefiting from easier versions [6].
It does not establish that all students need the same version or that difficulty never matters.

Use reference excerpts for a stated purpose, with their attribution and evidence type. A
standards-selected historical text can show knowledge demands; a study-assessed sentence can expose
a metric limitation. Neither is a certified model of every grade-appropriate textbook paragraph.

## Common failures and the habits behind them

- **Simplifying away the lesson.** Deleting a condition, essential term or causal connection can
  reduce a metric while changing the meaning. Formula-focused changes did not improve knowledge
  in the adult health-information trial [7]; that does not show all adaptations are ineffective.
- **Treating a grade as an assessed student profile.** School placement does not specify topic
  knowledge or independently measured reading ability. Declare assumptions and review the task [2].
- **Adding devices mechanically.** Headings, questions and summaries are useful only if their content
  serves the goal. Authoring guidance gives a menu, not a mandatory paragraph template [1, 3].
- **Replacing precise terminology to chase a classifier.** Human and classifier difficulty judgments
  can diverge when a specialist term is explained [8]. Keep useful definitions and review understanding.
- **Assuming similarity proves fidelity.** Retained support for comprehension questions is a separate
  concern from surface similarity; questions themselves sample only some content [9].

## How to revise

First review what must survive: the goal, claims, conditions, quantities, terminology and uncertainty.
Then locate the point at which a learner must infer an unstated prerequisite or relationship.
Repair that gap, and recheck whether the example and answer key still follow from the explanation.

For a reading-demand adaptation, use prose-reading-level. Its opt-in report distinguishes requested
school placement, an optional numerical target and the diagnostic. The CLI reports counts and scope;
it does not perform the teaching judgement checks below. An independent agent review can identify
defects, but it is not a test with the intended students.

**Maintainer judgement:** compare every revision with the original content inventory. Use actual
student/educator evaluation before claiming classroom effectiveness. A bounded paired agent exercise
establishes workflow behavior only. **Convention:** after two revision passes, disclose unresolved
conflicts rather than iterating indefinitely toward a grade number.

## Rules that apply

The table below is generated from the rule catalog. Judgement entries are prompts for review;
they are not completed by lint. No universal sentence cap or phrase-repetition rule is added here.

<!-- generated:rules begin (npm run guides) -->
| Rule | What it checks | Severity | Threshold | Threshold basis | Run by |
|---|---|---|---|---|---|
| `readability.grade.report` | Reading grade is reported, never targeted. | info | none | n/a | lint |
| `style.passive.report` | Passive voice is counted and reported, not banned. | info | none | n/a | lint |
| `ai.copula-avoidance` | 'serves as', 'stands as', 'functions as' in place of is/are are flagged. | info | none | n/a | lint |
| `ai.artifact` | No leaked chatbot markup or unfilled placeholders. | error | none | n/a | lint |
| `draft.placeholders` | Bracketed placeholders are listed until filled. | info | none | n/a | lint |
| `ai.promotional` | Promotional words (groundbreaking, renowned, nestled, profound ...) are flagged in factual forms. | info | none | n/a | lint |
| `ai.vocabulary` | Three or more distinct era-tagged AI vocabulary terms in one draft are flagged. | warn | 3 distinct terms | This plugin's choice (derived) | lint |
| `formal.supported-claims` | Every claim is supported by the data given; missing values are [placeholders], never invented. | warn | none | n/a | judgement |
| `length.target` | A draft with a declared target lands within ±10% of it; page-derived script minute targets use the provisional ±20% timing band. | warn | 0.1 fraction | This plugin's choice (derived) | lint |
| `voice.targets` | Each voiced speaker's measured style stays inside the voice bible's target ranges. | warn | none | n/a | lint |
| `voice.bible-valid` | Every voice bible in the project loads: valid YAML and schema, id matching the file name, unique ids, and each speaker claimed by one bible. | error | none | n/a | lint |
| `voice.banned` | A speaker never uses a word their voice bible bans. | warn | none | n/a | lint |
| `voice.unvoiced` | In a project with voice bibles, every speaker resolves to one. | info | none | n/a | lint |
| `teaching.goal-alignment` | The explanation and learner task serve the declared learning goal. | warn | none | n/a | judgement |
| `teaching.prerequisites` | Bridge missing prerequisite knowledge and explain necessary terminology in context. | warn | none | n/a | judgement |
| `teaching.reasoning` | Explanations and examples make the reasoning accurate, supported and visible. | warn | none | n/a | judgement |
| `teaching.practice` | Choose suitable practice and correct feedback for the unit and learning goal. | warn | none | n/a | judgement |
| `reader.essential-terms` | Declared essential-term presence is reported without certifying definition or meaning. | info | none | n/a | lint |
<!-- generated:rules end -->

## Sources

The numbered references distinguish authoring guidance, standards and empirical work. The short
method limits in their notes are part of how the evidence should be used.

<!-- generated:sources begin (npm run guides) -->
1. Lauri M. Aesoph (BCcampus), 2018. [Textbook Outline](https://opentextbc.ca/selfpublishguide/chapter/textbook-outline/) (practitioner; id `bccampus-textbook-outline`). Publisher guidance: plan for students/course; choose aligned outcomes, contextual definitions, activities and summaries. Not a controlled learning study.
2. NGA Center and CCSSO, 2010. [Common Core ELA Appendix A: Text Complexity](https://achievethecore.org/content/upload/corestandards_appendix_a_text_complexity_ela.pdf) (standard; id `ccss-text-complexity`). Quantitative, qualitative and reader/task considerations jointly inform text selection; a formula alone does not establish suitability.
3. Pashler and colleagues (IES), 2007. [Organizing Instruction and Study to Improve Student Learning](https://ies.ed.gov/ncee/wwc/PracticeGuide/1) (review; id `ies-study-learning`). Moderate evidence for worked examples/problem alternation and abstract/concrete connections; strong for re-exposure quizzes and explanatory questions. Not a mandatory chapter template.
4. Sandoval-Lee and Womack (Northwestern Searle Center), 2026. [Inclusive Teaching for Textbook Authors](https://searle.northwestern.edu/resources/learning-teaching-guides/translating-principles-of-inclusive-teaching-for-textbook-authors.html) (practitioner; id `northwestern-textbook-authors`). Institutional authoring guidance: model reasoning, acknowledge difficulty and respect learners. Not an experimental effect estimate.
5. Ginns, Martin and Marsh, 2013. [Designing Instructional Text in a Conversational Style: A Meta-Analysis](https://eric.ed.gov/?id=EJ1036785) (peer-reviewed; id `ginns-conversational-text`). Abstract reports retention and transfer benefits, with a duration boundary. Does not validate universal friendliness or every textbook chapter.
6. Lupo, Tortorelli, Invernizzi, Ryoo and Strong, 2019. [An Exploration of Text Difficulty and Knowledge Support on Adolescents' Comprehension](https://ila.onlinelibrary.wiley.com/doi/10.1002/rrq.247) (peer-reviewed; id `lupo-text-support`). Publisher abstract: 293 ninth graders, 24 texts over 12 weeks with instructional supports. Most showed similar comprehension; a small substantially below-average subgroup benefited from easier versions. Not equivalence or independent-reading validation.
7. Mac, Ayre, McCaffery, Boroumand, Bell, Muscat, 2025. [The Readability Study: A Randomised Trial of Health Information Written at Different Grade Reading Levels](https://pmc.ncbi.nlm.nih.gov/articles/PMC12119439/) (peer-reviewed; id `mac-readability-rct`). Published online 20 December 2024; journal issue 2025, J Gen Intern Med 40(8):1820–1828. No comprehension difference between grade 8 and grade 14 versions.
8. Barayan, Camacho-Collados and Alva-Manchego, 2025. [Analysing Zero-Shot Readability-Controlled Sentence Simplification](https://arxiv.org/html/2409.20246v2) (peer-reviewed; id `barayan-readability-control`). COLING 2025; English CEFR sentence adaptation, with 90 outputs in human evaluation. Human/classifier ratings diverge; explained terminology may inflate predicted difficulty. No US-grade calibration.
9. Agrawal and Carpuat, 2024. [Do Text Simplification Systems Preserve Meaning? A Human Evaluation via Reading Comprehension](https://arxiv.org/html/2312.10126v2) (peer-reviewed; id `agrawal-answerability`). TACL; evaluates paragraph answer support separately from surface simplicity. Questions sample content rather than proving complete fidelity.
<!-- generated:sources end -->
