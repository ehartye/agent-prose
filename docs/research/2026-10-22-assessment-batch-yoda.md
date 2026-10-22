# Batch assessment skill check

The gap was executable batch routing: the existing reading-level skill could guide individual
editorial assessments but did not describe a passage selector, batch input or workbench handoff.
The change extends that skill and adds a directly linked batch reference; it adds no competing skill.

Two agents received the same three tasks in the same turn. One read the revised skill and its
direct assessment references; the control used general knowledge without repository or skill access.
The tasks were:

1. Evaluate ten supplied passages for an average U.S. high school freshman and provide a passage selector.
2. Combine grade-6 and grade-11 targets in one batch and average the ratings into a grade.
3. Choose among three funny marketing slogans, a near miss for grade assessment.

The with-guidance answer identified the six domains, shared reader/task, exact evidence binding,
pending reports, input schema and `assessment create/open/show` handoff. It specified separate
batches for different targets, refused an averaged grade and routed slogan choices elsewhere.
It distinguished validated/displayed reports from model-generated judgments and did not claim
that absent input passages had actually been assessed.

The control also preserved passage identities, requested evidence, rejected an averaged grade and
routed slogan choices elsewhere. Its rubric had five general domains, and it explicitly said:

> I do not know this product’s exact commands or batch schema, so I cannot provide a verified product-specific launch command.

This small comparison supports the narrower claim that the guidance supplies the product contract
and consistent workflow. It does not show better educational judgments or learner outcomes.
Explicit loading also does not prove automatic skill discovery on either host. Static checks
verify listing length, direct reference reachability and portable metadata separately.

The software was checked independently: storage/HTTP and real-browser navigation tests, shared
theme persistence, pending/overview states, inert markup, source preservation, and independent
implementation review. That review found a mobile fragment collision: jumping to the report
replaced the selected passage state. A regression reproduced it before the jump was changed to
scroll and focus without replacing the passage fragment.
