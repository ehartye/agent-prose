# Skill baselines — no-skill agent, graded 2026-10-02

Raw outputs and the measurement script are kept in the maintainer's local working notes.

| Baseline | Verdict | Top failures (verbatim evidence) |
|---|---|---|
| dialog | adequate | No 'complete'/fallback branch at entry though bark_05 tests state != 'complete'; revisit nodes (reoffer, refuse_again, in_progress) single line each; line breaks split phrases ("Twenty more" / "I have."); 4/5 barks proximity-only, no salience; invented schema, no line IDs/translator comments; write-only var `haggled`. Strengths: ≤38 chars/≤2 lines, all reachable, choice text predicts reply. |
| script (multicam cold open) | adequate | No multi-cam conventions (mixed-case action, single-spaced dialogue, no lettered scenes/char list); `# COLD OPEN` section doesn't print; `> END OF COLD OPEN` is a transition not centered; 924 words ≈ 9+ multicam pages vs 2–6 norm, no estimate; title-page misuse; tangent joke. Strengths: clear premise, character jokes, runner payoff, valid Fountain cues. |
| speech (5-min toast) | adequate | Claims "~750 words, ~5 minutes" — 746 words = 5.7 min at 130 wpm before laughs; suggested cut saves ~38 words; 19/44 sentences >16 words, 12 >25 (34-word example); stock closer "as deep as the ocean, as full as a well-stocked kitchen", "A chef will tell you… A marine biologist will tell you…", triples; puffery; ear-ambiguous "content". Strengths: honest placeholders, real-story advice, direct address, delivery notes. |
| instruct | strong | Recovery incomplete ("Check the password and try again" — where to resume?; no blue light / no green timeout); no results on steps 2–5; `>` menu path screen-reader caution. Strengths: prerequisites, location-first, imperative, no filler, red-blink case separated. |
| formal (abstract) | weak | 38% result buried in sentence 7/11; invented generalization ("results apply beyond any single project or language ecosystem") and invented sections ("We also describe migration practices… threats to validity"); 3 sentences >25 words; no numbers/placeholders for flake rate; "substantial". Strengths: inline definition, active "we", ~200 words, no tell vocabulary. |
| comedy (punch-up ×5) | adequate | 4/5 options same angle (breakup self-pity); premise drift ("left me on read" — she was dumped; "eight slices" vs last slice); stock "pizza still committed to me"; 17–22-word spoken lines; no register labels. Strengths: violation/benign notes, funniest word last on 3 & 5, good staging. |
| youtube (first 60 s) | adequate | 175 words in 60 s; segments at 186/198/231 wpm; at 155 wpm runs ~68 s; payoff at 0:43, past the 30-s intro window; 3-s title card; closing re-promise. Strengths: misconception-first hook, thumbnail promise at 0:00, no greeting, correct physics. |
| voice (Grimble + rival) | adequate | Grimble 10/10 lines same setup→twist template; Lirael stock cheerful elf, every line "!", "dear heart"; stock skeleton gag; Lirael lines 85–104 chars vs 2×40 box; no voice guide. Strengths: distinct voices, situational, good specific jokes, exact counts. |

## Cross-cutting (ranked)
1. Unverified numeric claims/limits — states compliance instead of computing it.
2. Sentences too long for the medium (spoken pieces, abstract); tell-word/em-dash hygiene already good (zero em dashes in 8 files).
3. Stock material and convergent variants (regression to the mean).
4. Shallow format conventions (multicam, Fountain printing, engine schema).
5. Edge/recovery gaps (dialog states, instruction restarts).
6. Invented/generalized claims in factual prose; buried lede.
7. Line-break quality in hand-broken game text.

## Skill implications (from the grader)
- Shared: measure before finishing (words, time at form rate, chars/line, longest sentence, count over cap) and report numbers; visible [placeholder] for missing facts; variants each with a named distinct angle; avoid stock closers/formulas; keep current em-dash/tell hygiene.
- prose-dialog: real engine format or declared schema with line IDs + translator comments; walk the graph incl. states referenced elsewhere, unconditional fallback, no write-only vars; ≥2 rotating variants on revisitable nodes; break at phrase boundaries; barks specific→general with fallback, ≥half state-reactive.
- prose-script (TV/stage): detect multicam → CAPS action, double-spaced dialogue, lettered scenes, char list; `#` doesn't print — use centered >COLD OPEN<; `!` before CAPS action above dialogue; estimate pages vs slot norms; jokes on the premise; real title-page keys.
- prose-script (YouTube): budget ~150–160 wpm per timestamped segment; payoff within 30 s; title card ≤1 s; spoken sentences ≤16 words; end on a forward question.
- prose-speech: minutes = words/130 (+laugh allowance), size cuts to overage; 8–16 avg, cap 25; no stock closers/triples, end on a specific image; keep placeholders/real-story prompt/delivery notes; check ear-ambiguous words.
- prose-instruct: every failure says where to resume; cover "nothing happens" with time or [time]; give system reaction after state-changing steps; keep current strengths.
- prose-formal: result in sentence 1–2; only supported claims, no invented sections; value or [value] for every result; ≤25 words, avg 15–20; strip promotional words.
- prose-comedy: honor premise facts; each option a distinct named mechanism; generate ~3×, dedupe stock, select; name violation + benign route; spoken punch-ups ≤~12 words; label register.
- prose-voice: voice guide first (register, 5 signature words, sentence shape, habit, motive); vary shapes (no template >~1/3 of lines); rival needs an edge, limit "!"; avoid genre stock; check box limits; keep swap-test distinctiveness.
