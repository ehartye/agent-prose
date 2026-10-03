---
name: prose-review
description: Put a real choice between rewrites in front of the owner with agent-prose - variant sets along named directions, checked for near-duplicates and for whether each variant moved the way it claims, with a sealed prediction of the owner's pick and the pick recorded so the system learns their taste.
when_to_use: Use when the owner should choose between versions - asked for several options, alternatives, "give me a few takes", a punch-up pass with options, or a pick between tones - or when someone asks what the owner usually prefers or how often the agent guessed their pick. Writing a single draft is prose-script, prose-speech, prose-dialog, prose-instruct or prose-formal; joke quality inside an option is prose-comedy; checking one draft is prose lint.
---
# prose-review

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.
Every command except `set new` finds the project from the current directory: run inside the project or pass `--dir <project>`. `taste stats` needs a project unless `--all-projects`.

Left alone, you converge: options come back as variations on one idea, and every judgement of
taste is yours. This skill puts the choice with the owner and makes the options measurably differ.

## The loop

1. **Make the base.** Write or find the draft (in the format its skill describes) inside a prose
   project (`prose init` once). Lint it and fix errors.
2. **Open a set.** Name the directions, one per variant:
   `prose set new <draft> --directions punchier,drier,warmer --count 4`
   Directions: punchier, shorter, longer, warmer, drier, more-formal, less-formal, plainer,
   livelier, weirder. They are measured proxies for style (sentence length, contractions, "you",
   exclamations, word length...), not judgements of quality. Directions are assigned to variants
   in turn, so with `--count` above the list some repeat; change one with
   `prose set annotate <id> <n> --direction <name>`.
3. **Rewrite each variant file in place** (`.agent-prose/sets/<id>/v1.md` and so on). Keep the
   format and header. Each variant takes a *different angle*, not a different wording of one: for
   comedy use different mechanisms (understatement, misdirect, avoidance, escalation, callback);
   for other forms, a different structure or emphasis. Record the angle:
   `prose set annotate <id> 2 --label understatement --note "pointed silence"`.
4. **Check.** `prose set check <id>`. It rejects unchanged, near-duplicate and lint-failing
   variants, and warns when a variant did not move in its direction or shares a label with another.
   Rewrite what it rejected and check again until at least two (ideally all) survive. Do not argue
   with a rejection by tweaking one word.
5. **Finish before you seal.** Rewriting and checking are done by now: `prose predict` runs the
   check itself, accepts only kept variants, and freezes the text the owner will see together with
   a hash of every variant file. Never edit a variant file after predicting; `prose set pick` then
   fails with `E_CONFLICT` ("changed after the prediction was sealed").
6. **Seal your guess before the owner sees anything:**
   `prose predict --set <id> --pick <n> --shortlist <a,b> --why "..."`. A real guess, with a
   reason, not a hedge.
7. **Present** only the kept variants: `prose set show <id>` returns every variant with its
   `status` and a `next` line naming the kept ones. Show them numbered, each with its angle in a few
   words. No ranking, no recommendation: your guess is already sealed. Ask which they prefer and,
   if they say, why.
8. **Record the choice:** `prose set pick <id> --pick <n> --tags drier,shorter`. The output
   reveals whether your guess hit; tell the owner, briefly. A pick needs at least two surviving
   variants and an untampered prediction. If the set was never predicted, or the prediction was
   refused as tampered or stale, record it with `--no-predict` rather than editing anything. A pick whose
   sealed prediction was discarded is recorded as a miss (voided), so never use `--no-predict` to dodge a miss.
9. **Apply** the chosen variant over the draft only if the owner wants it.

If the owner declines to choose, do not invent a pick: `prose set pick` is for real choices.

## What gets learned

Each pick is stored with its measured style, per project and per user. A pick among N shown
variants counts as one duel in total: each variant it beat gets weight 1/(N-1). `prose taste stats`
(for the current project; add `--all-projects` for every project) shows how often your sealed
guess matched the owner's pick. If the hit rate is low you are guessing from your own taste, not
theirs: offer more contrast, not more variants.

## Keep it honest

- Never present variants the check rejected, and never report a direction as achieved without the
  check's `movement` numbers.
- Report the numbers: variants kept of variants written, each movement score, similarity warnings.
- A set is for a choice that matters; for a one-line fix, just fix it.
