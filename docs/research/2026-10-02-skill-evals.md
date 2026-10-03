# Skill evals (2026-10-02)

Paired runs with `claude plugin eval` (with plugin vs no-plugin baseline), 3 runs per arm,
10 cases: eight quality cases built on the graded baseline prompts
(`2026-10-02-skill-baselines.md`) and two negative cases. Each quality case is scored by five
single-criterion LLM judges reading the written draft.

**Environment limit.** On Windows, eval runs cannot be granted Bash (no OS sandbox), so the
agent could write drafts but could not run `prose lint`. These evals therefore measure the
skills' *guidance*; the CLI's measurement loop is covered by its own test suite. Count-based
criteria were removed from the judges after they unanimously failed drafts that `prose measure`
showed on target (156 and 145 words for 60 seconds, every segment under 168 wpm); numeric
targets are verified below with `prose measure` on the kept drafts instead.

## Triggering

| | Result |
|---|---|
| Right skill fired on its case | 24 / 24 runs |
| Any prose skill fired on a negative case (docstring, UI microcopy) | 0 / 12 runs |

## Judge scores (final run)

| Case | With skill | Without | Δ |
|---|---|---|---|
| instruct-thermostat | 0.72 | 0.39 | +0.33 |
| comedy-pizza | 1.00 | 0.72 | +0.28 |
| script-coldopen | 0.89 | 0.61 | +0.28 |
| dialog-blacksmith | 0.83 | 0.61 | +0.22 |
| formal-abstract | 0.61 | 0.50 | +0.11 |
| speech-toast | 0.83 | 0.72 | +0.11 |
| voice-grimble | 0.61 | 0.50 | +0.11 |
| youtube-microwave | 0.78 | 0.83 | −0.06 |

Mean Δ +0.14. The YouTube difference is one judge vote per criterion across three runs; the
measured numbers below favour the skill.

## Measured with prose (kept drafts, final run)

| Case | With skill | Without skill |
|---|---|---|
| YouTube, 60 s | 141–170 spoken words; max segment 150–176 wpm; 0 pace warnings | 241–265 counted words (partly inflated by visual text written inline); 4–5 pace warnings per draft |
| Toast, 5 min | 1–4 spoken sentences over 16 words; longest 21–30 | 13–16 over 16 words; longest 28–61 |
| Toast length | 439–626 words (3.4–4.8 min): short of target | 780–836 words (6.0–6.4 min): long |
| Abstract, 200 words | 201–207 words; 0–1 sentences over 25 | 192–206 words; 2–5 sentences over 25 |

## History

- Run 1 (single all-or-nothing judge, 2 runs): triggering perfect; quality gains hidden
  (e.g. instructions covering four failure states vs one both "failed").
- Revisions from measured drafts: explicit word budgets before drafting (speech, YouTube), a
  hand-count fallback when the CLI cannot run, no promised sections in abstracts,
  per-criterion judges, qualitative judges instead of counts.

## Open

- Toast length without the CLI still undershoots; in real use `prose lint` reports the gap.
- Re-run with Bash granted on Linux or WSL2 to exercise the full measure-and-fix loop.
