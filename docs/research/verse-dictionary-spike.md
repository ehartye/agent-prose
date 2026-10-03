# Verse dictionary spike

Date: 2026-10-03. Gate for the verse-engine milestone (design: `docs/superpowers/specs/2026-10-03-verse-engine-design.md`, "Spike first"). Reproduce with `npx vitest run tests/verse-spike.test.ts --disable-console-intercept`.

## Decision: PROCEED

The dictionary path beat the heuristic on both gated metrics, the gzip file is 0.92 MB (limit 2 MB) and the first load takes about 108 ms (limit 500 ms). The sample is small and the labels were written by an AI, so read the margins with that in mind (see Limits).

## Method

- Gold set: `tests/fixtures/verse/gold.json`, 76 lines from 15 public-domain passages whose structure is independently known: Amazing Grace (common meter 8.6.8.6, abab), Shakespeare Sonnets 18, 71 and 116 (iambic pentameter), two Lear limericks (AABBA), a 5/7/5 haiku, two Ancient Mariner ballad stanzas, Annabel Lee, Ode to the West Wind (opening), Dickinson's "There is no Frigate like a Book" (8.6.8.6), My Last Duchess (couplets), a Marlowe couplet and A Psalm of Life. The plan asked for about 30 lines; the set grew to 76 to cover the hard words, so n is larger than planned but still small.
- Labels were fixed in `gold.json` before any dictionary output was looked at. Syllable counts are the author's reading of each line as the published form scans it. 4 lines are marked `uncertain` and excluded from syllable scoring (the Amazing Grace "hour" line, the Lear "He awoke in the night" line, the Mariner "glittering eye" line, the West Wind "fleeing" line). Their rhyme groups still count, because the groups come from the published scheme, not from the syllable reading.
- The haiku is the author's plain 5/7/5 rendering of Basho's original, not a quoted translation, so there is no copyright question.
- Path (a), heuristic: the existing `syllables()` summed over `words()`; rhyme key = last vowel group plus the tail of the letters, after dropping a silent final `e` (without that the baseline calls date/temperate/fate/late all the same key `e` and is unusably weak, so this is the kinder baseline).
- Path (b), dictionary with fallback: first CMUdict variant (vowel phones counted), the heuristic for words the file lacks (after retrying without apostrophes); rhyme key = phones from the last stressed vowel to the end, stress digits removed. A guessed word against a dictionary word is judged on letters. No affix rule yet (that is Task 2), so plurals such as "slumbers" and "Coursers" fall back to the heuristic here.
- Rhyme-pair accuracy is scored in three groups. Poem pairs: every pair of end words that carry a `group` letter within one poem, rhyming when the letters match (31 rhyming, 96 non-rhyming pairs, 127 total; these are correlated, not 127 independent samples). Lexical pairs: 6 word pairs (love/dove, love/move, heaven/seven, fire/choir, wind/sinned, wind/find). Eye-or-weak pairs: 4 pairs the published form calls rhymes (or the author calls non-rhymes) that are not perfect rhymes in modern US English (temperate/date, love/remove, move/love, away/Poetry).

## Results

| Metric | Heuristic | Dictionary + fallback |
|---|---|---|
| Syllables exact per line (72 scored lines) | 61/72 (84.7%) | 71/72 (98.6%) |
| Rhyme pairs, poem pairs (127) | 113/127 (89.0%) | 127/127 (100.0%) |
| Rhyme pairs, lexical (6) | 2/6 (33.3%) | 4/6 (66.7%) |
| Rhyme pairs, eye-or-weak (4) | 4/4 (100%) | 1/4 (25.0%) |

The gate is the first two rows; both favour the dictionary. The last row favours the heuristic and is a real cost, explained below.

### What each path got wrong

Heuristic syllable misses (11): appear ("precious"), temperate, "eyes can see", vildest, opened, stopp'st, many/ago line, being, Coursers, Poetry, Chariot (lines with endings or vowel pairs the vowel-group rule miscounts, such as opened, precious, being and Poetry).

Dictionary syllable misses (1): "Thou art more lovely and more temperate" got 9, gold 10. CMUdict lists the two-syllable "temperate" (T EH1 M P R AH0 T) first and the three-syllable one second (variant 2); Shakespeare scans it as three. This is a genuine disagreement between a reading of the word and the dictionary's first variant, and it is the case the `ambiguous` tag is for.

Words missing from the dictionary on scored lines (11): ow'st, wander'st, grow'st, vildest, May'st, stoppeth, stopp'st, Coursers, Fra, Pandolf's, slumbers. They are archaic forms, a name, and regular inflections (slumbers, Coursers) that Task 2's affix rule should recover. The fallback got every one of those lines right here.

Heuristic rhyme misses on poem pairs (14): me/see, dead/fled, so/woe, beard/feared, Peru/shoe, Peru/true, shoe/true, three/me, ago/know, sea/Lee, being/fleeing, Toll/soul, dream/seem (letters differ where sounds match). Dictionary: none.

Dictionary lexical misses: wind/sinned and wind/find. The first variant of "wind" is the verb (W AY1 N D), so it rhymes with "find" and not "sinned". This is a heteronym the flat file cannot resolve; the design already flags `variants > 1` and never resolves them, so the engine must show this as ambiguous rather than certain. The heuristic misses love/move, fire/choir, wind/sinned and wind/find.

Dictionary eye-or-weak misses: temperate/date (stress differs), love/remove and move/love (eye rhymes). The dictionary calls these non-rhymes, which is correct for modern US speech and means `verse.form.rhyme-scheme` will warn on Sonnet 116 and Sonnet 18 as written, so those findings must be worded as "not a perfect rhyme in US English" and may need the `nearScheme` route. The heuristic "wins" these only because it also treats love/move as the same ending.

## Size and speed

- Entries: 126,052 distinct words (135,166 pronunciations including variants; comment lines stripped, inline `# ...` tails left in the file and ignored by the loader).
- Raw: 3,618,488 bytes (3.45 MiB). Gzip level 9: 918,337 bytes (0.88 MiB).
- Load: about 108 ms for gunzip and parse on first call (three runs, 106 to 109 ms, Node 24.18, Windows 11, warm file cache), plus about 23 ms to import the module. Cached calls take about 0.01 ms.

## Limits

n is small: 72 scored lines, and the rhyme pairs are heavily correlated, so the percentages carry wide uncertainty and the 100% poem-pair figure should not be read as a property of the dictionary. The author is an AI and so are the labels; they come from published forms and unambiguous readings, 4 lines the author was unsure of were excluded, and a human with a different reading of "temperate", "hour" or "fire" would move a count. The set favours the dictionary in one way (several lines contain words with silent-e or vowel-pair patterns the heuristic is known to handle badly) and favours the heuristic in another (the eye rhymes). Common words dominate; a lyric corpus with slang, dropped g's and invented words would lean on the fallback more. US English only. "fire", "hour" and "heaven" have no scored line because their count depends on the reading.

## Follow-ups for later tasks

- Task 2 affix rule should be checked against slumbers, Coursers and stoppeth.
- Heteronyms (wind, read, lead) and variant syllable counts (temperate) must surface as `ambiguous`.
- Decide how `verse.form.rhyme-scheme` treats eye rhymes and unstressed rhymes before wording that rule.
