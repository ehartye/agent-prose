# Reading demand and audience adaptation

Use a reader profile to make concrete authoring decisions. A grade label is a starting brief,
not a measured diagnosis of every student in that grade. Scope is U.S. grades 4–12, English prose.

## What to infer from a freshman request

Resolve freshman to U.S. grade 9. Assume a typical teenage audience, and state any important
prerequisite assumption that the topic requires. Specialized knowledge is not implied by schooling.
Teach necessary terms and relationships, retain the task's intellectual goal, and write without a
childish voice. Ask a question only when the missing subject/context would materially change the answer;
otherwise state a reasonable assumption and proceed.

The `reader.schoolGrade` field records placement. `reader.readingLevel` records a separately requested
numerical text-level interval; leave it absent for ordinary audience requests. A student can know a
subject well and need language support, or read fluently while lacking the topic background.

## Evidence that guides the workflow

The [Common Core text-complexity framework](https://www.thecorestandards.org/ELA-Literacy/standard-10-range-quality-complexity/measuring-text-complexity-three-factors/)
combines quantitative text features, qualitative analysis and reader/task considerations.
In [Lupo et al.'s ninth-grade study](https://ila.onlinelibrary.wiley.com/doi/10.1002/rrq.247), most
readers showed similar comprehension across easier/challenging versions under the studied supports;
a small substantially below-average subgroup benefited from easier versions. This does not establish
equivalence or an optimal difficulty for independent reading.

The [Mac et al. trial](https://pmc.ncbi.nlm.nih.gov/articles/PMC12119439/) found no knowledge difference
between its adult health-information grade conditions. That result concerns formula-focused changes
in that setting, not all adaptation or children's textbooks. [AHRQ's official guidance](https://www.ahrq.gov/talkingquality/resources/writing/tip6.html)
explains why formulas omit familiarity, coherence, organization and reader activity.

[Barayan et al.](https://arxiv.org/html/2409.20246v2) show disagreement between human and automated
CEFR judgments of English sentences, including explained technical terms. Their reported target
accuracy permits an adjacent CEFR level; it is not U.S. grade certification. [Agrawal and Carpuat](https://arxiv.org/html/2312.10126v2)
evaluate whether simplified paragraphs retain support for comprehension questions. Those questions
sample content; they do not establish exhaustive fidelity or learner benefit for this skill.

**Maintainer judgement:** retain essential meaning and test whether the intended questions remain
answerable. The research motivates that review; it does not validate this tool's particular checklist.

## Adaptation moves

- Replace an unnecessarily unfamiliar expression with a precise familiar one. Keep essential domain
  terms and explain them close to first use. Consistent repetition may support learning.
- Unpack embedded clauses when they obscure the actor, cause or condition. Preserve logical links;
  splitting every sentence can increase the reader's inference burden.
- Add a missing definition, explicit referent, connection or concrete example. Identify any example
  you invent, and check that it illustrates the source claim without expanding it.
- Preserve qualifiers such as *under these conditions*, *in the participating schools* and *may*.
  Concision never authorizes turning association into cause or a limited result into a universal one.

## The diagnostic's exact scope

`prose measure` adds `readability` when Markdown contains a valid reader profile. It uses the
[Flesch-Kincaid Grade Level formula](https://support.microsoft.com/en-us/word/get-your-document-s-readability-and-level-statistics-in-microsoft-word),
existing English spelling-based syllable counts and a named paragraph input policy. This is a heuristic,
not a validated calibration for this plugin. Report the method alongside any estimate.

Only paragraph blocks are eligible. Headings, lists/steps, block quotes and notes are excluded from
the grade calculation; the parser already omits code fences and tables. Paragraphs under References,
Bibliography, Works cited, Answer key or Instructor notes are excluded until the next heading at
the same or higher level. Eligible locations are block start lines. This does not assess an entire
document's dropped material, diagrams, accessibility, listening demand or mathematical reasoning.
Inline code or symbols left in paragraphs can distort the heuristic.

**Convention:** at least 100 eligible words and five sentence units are needed for a new estimate.
There is no universally validated short-sample cutoff in the evidence reviewed. Below the floor,
the report gives counts and `insufficient-sample`. Non-English and verse estimates are unavailable.
An estimate outside an explicitly requested band is informational and cannot reject a variant.

`style.readingGrade` retains its older scope and 30-word floor for compatibility. It is a different
text view; do not compare the two fields as evidence that a revision improved. Essential-term matching
is a separate phrase-presence observation over learner-facing text, including headings and lists.
A match does not prove definition, correct usage or preserved meaning.

## Final review note

Use an ordinary short note, not a formula pass/fail verdict:

> Audience: typical U.S. ninth grader; introductory topic knowledge assumed. Required conditions and
> uncertainty retained in drafting review. The diagnostic was run on eligible paragraphs only.
> No independent educator or intended-reader test was performed.

Change that example to report only checks actually performed. A reviewer agent can identify defects;
an agent playing the role of a teenager is not a human comprehension test. If a target remains
incompatible with retained content and length after two revision passes, state the conflict and
the smallest useful next adjustment. The revision cap is a workflow convention.
