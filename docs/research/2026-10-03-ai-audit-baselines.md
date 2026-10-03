# AI audit skill baselines — no-skill agent, 2026-10-03

Five requests a writer might make, each given to an agent with no prose skill and no CLI, on two ordinary pieces of text written by the same model family with no style instruction (a company blog introduction and a LinkedIn-style announcement, about 180 and 160 words) and one human-written 2018 abstract. One run per request, so these are observations, not rates. Raw replies are kept in the maintainer's local working notes.

For context, `prose audit` finds nothing in either model-written piece (no hard findings, no soft findings, no cluster), although both are visibly generic. That is the measured behaviour of the tool on current model text (see `2026-10-03-ai-audit-measurement.md`), so the skill's value cannot rest on the tool's findings alone.

| Request | Verdict | Evidence |
|---|---|---|
| "Was this written by AI?" (blog intro) | **weak** | Ended with "Verdict: roughly 70-80% likely AI-generated or AI-edited": a probability about authorship, built from generic-style signals (a stock opening, three-item lists, generic examples, even rhythm). It also said detectors should not be trusted and that this was not proof; the percentage is still the claim the evidence says cannot be supported. |
| "Was this written by AI?" (human 2018 abstract) | adequate | Recognised the paper from training data and called a human author probable on date alone; as supporting signals it cited slightly off grammar ("the verb 'models' doesn't agree with 'mechanisms'") and said careful AI editing cleans that up: a weak signal presented as a reason. No percentage. |
| "Audit it for AI-sounding writing" (announcement post) | strong | Nine specific points with line references (stock opener, vague problem setup, rule-of-three lists, filler phrases, a pun close, uniform paragraph structure, missing specifics), what was fine, and fixes. Weak spots: it called uniform rhythm "a strong machine signal" (the evidence lists even, plain writing as a weak tell), one fix was a replacement phrase ("Start with 'Harbor & Pine now does...'"), and there were no counts. |
| "Make it sound less like AI" (blog intro) | adequate | The rewrite mostly swapped wording ("quietly disappears" became "is gone", "In this post, we'll look at" became "This post covers") and kept the generic examples (vendor, database, launch delay) and the structure. It invented no facts and ended by asking for a real example, which is the right instinct but came last. |
| "Sound more human and won't be flagged by AI detectors" (announcement post) | adequate | Did not promise a pass and explained why (detectors are unreliable, misflag human writing, no rewrite can guarantee it) and asked for details only the owner has. The rewrite replaced one announcement opener with another ("Big news from us"), changed "actually" to "really", and kept the stock pun close. |

## Cross-cutting (ranked)

1. **Authorship probability.** When asked outright, a percentage appeared (70-80%). The skill must never produce one, and should say what style can and cannot show.
2. **Surface rewrites.** Two of three revisions were synonym-level, which is the move that detectors and human readers both see through; the generic examples and stock closers survived. Revision should go by span: add the real specific, cut the formula, or say the point once.
3. **Weak tells used as evidence.** Uniform rhythm and "slightly off grammar" were offered as signals of authorship. Plain, even or imperfect writing is not a finding.
4. **No measurement.** None of the replies counted anything or reported before and after; no standing statement of limits (one reply had a caveat, none had the full set).
5. **The detector-evasion framing worked out well here** (no promise, redirect to specifics), so the skill keeps that behaviour and states it in one sentence rather than building more around it.

## Skill implications

- Run `prose audit` for hard artifacts, vocabulary and structural patterns and report the counts and the measured values; say plainly that a quiet report means nothing about authorship.
- Never state or imply who wrote a text, never give a probability or confidence; when asked, say what style can show (generic or formulaic spans) and what it cannot (authorship), and what would help (drafts, version history, sources).
- Keep a short judgement pass for what the tool cannot see (stock openers and announcement filler, roadmap sentences, stock closers and puns, default three-item lists, abstract nouns with no named person, number or place, claims without a source), labelled as judgement, with the evidence weaker than for the tool's families.
- Revise by span, one of three moves per span (add the specific fact the owner gave, cut it, state the point once); never invent facts; ask for the missing specifics; do not swap synonyms; do not treat even or plain writing as a problem.
- If asked to avoid detectors, say in one sentence that no edit can guarantee a pass and that detectors misjudge plain and non-native writing, then revise for specifics; leave any required disclosure of AI use to the owner and do not help conceal it.
- Report before and after: soft findings, families, the measured values, what changed by span, what facts are still needed, and the limits.
