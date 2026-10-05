# Interpreting taste results

Each pick is stored with its measured style, per project and per user. A pick among N shown
variants counts as one duel in total: each variant it beat gets weight 1/(N-1). `prose taste stats`
(for the current project; add `--all-projects` for every project) shows each predictor's hit rate,
the model's abstentions, and how often the model beat, matched or lost to your sealed guess.
That comparison concerns the pick only; shortlist hits mean something only for sets of four or more variants.
The reveal at the pick compares both. If your hit rate is low you are guessing from your own taste, not
theirs: offer more contrast, not more variants.
