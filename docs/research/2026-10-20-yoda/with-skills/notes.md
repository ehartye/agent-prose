# Authoring notes

## Scope and audience

The only content sources were the three fictional source passages in `../prompts.json`. No external research was used. I did not read specifications, runtime implementation, prior evaluations, or the other comparison arm.

The lesson and research summary assume a typical U.S. ninth grader. The lesson assumes familiar fractions and no prior conditional-probability knowledge. The summary assumes no research-methods knowledge. The ResetLab procedure assumes a typical U.S. sixth grader and no specialist knowledge. School placement was recorded without imposing a numerical reading-grade band.

The requested prose is in `01.md`, `02.md`, and `03.md`; these notes and diagnostic files are separate.

## Files and guide sections read

- `docs/research/2026-10-20-yoda/prompts.json`: the conditions, all three tasks, and the supplied rubric.
- `skills/prose-teach/SKILL.md`: all sections.
- `skills/prose-reading-level/SKILL.md`: all sections.
- `skills/prose-reading-level/references/reading-level.md`: all sections.
- `skills/prose-formal/SKILL.md`: all sections, for the research summary.
- `skills/prose-instruct/SKILL.md`: all sections, for the procedure.
- CLI guide `teaching-prose`, section `anatomy`.
- CLI guide `formal-prose`, section `anatomy`.
- CLI guide `instruction-docs`, section `anatomy`.

The example-reference file was not needed and was not read. The guide references supplied writing guidance; they were not used as additional sources for the fictional content.

## Drafting review and limits

I compared the lesson's three fractions, changing denominators, and separate practice answer with the supplied club data. The practice answer uses the 30 sports players who do not play an instrument, out of 60 sports players. I compared the summary with the supplied recruitment, assignment, completion, scoring, interview, and limitation statements. I compared the procedure with the supplied saving condition, labels, timing, warning, and two recovery paths. No unresolved preservation issue was identified in this drafting review. No placeholders remain.

The procedure has five numbered steps followed by two conditional paths. The confirmation step requires `Copy saved` before continuing. The recovery paths cover `Ready` returning within 20 seconds and `Busy` remaining after 20 seconds. No unsupplied troubleshooting steps were invented.

This authoring process included drafting-agent review only. No independent review informed these drafts. No educator, intended reader, or human learner tested these texts. The diagnostic estimates are not grade certifications or comprehension tests. No prose-quality scores were assigned here. Any later review arranged by the orchestrator is separate from this authoring record.

## Checks and operational issues

The first lint and measure attempts for `01.md` and `02.md` failed with exit code 1. The range-valued frontmatter targets (`250-350 words` and `160-210 words`) were rejected with `E_SCHEMA` at `/target`. Each failed command emitted this exact JSON on stderr:

```json
{"error":{"code":"E_SCHEMA","message":"target must look like \"5 minutes\", \"90 seconds\", \"200 words\", \"4 pages\" or {minutes: 5}","pointer":"/target"}}
```

The exact stderr JSON is preserved in `01-lint-initial.json`, `01-measure-initial.json`, `02-lint-initial.json`, and `02-measure-initial.json`. The original stdout files were empty on those failed attempts. The final checks replaced those empty files after metadata correction.

I changed the two target values to the requested upper limits, `350 words` and `210 words`. During the same revision pass, I changed the summary's wording about graders to describe the absence of blinding without claiming that every grader actually knew assignments. No later prose revisions were made.

All six completed lint/measure checks exited 0. Their raw stdout JSON is preserved in the six `01`–`03` lint/measure JSON files. Lint reported no errors. `01` and `03` retain `length.target` warnings: the checker treats a single target as an exact aim and recommends adding words. The actual requests specify a range or maximum; padding is unnecessary. `02` has no lint warnings. The judgement lists are review prompts, not checks the CLI performed.

The measure command reports 294, 191, and 107 words respectively. A separate body-token count, excluding frontmatter, headings, list markers, bold markers, and standalone mathematical operators, reports 286, 191, and 107. Fractions count as single body tokens. All are within the requested limits; the counts and counting method are preserved in `body-word-counts.json`.

The readability report uses the named Flesch–Kincaid method on eligible Markdown paragraphs only. It returned estimates of 7.5 and 8.3 for `01` and `02`; those figures do not establish suitability. For `03` it returned `insufficient-sample`: only 28 words and four sentence units were eligible because procedural lists are excluded. The legacy style grade was not substituted for this unavailable estimate.

## Actual commands and file operations

All shell commands ran from the repository root. All prose CLI calls used the repository entry point; no managed/global install was used or changed.

Initial reads:

```powershell
Get-Content -Raw 'docs/research/2026-10-20-yoda/prompts.json'; Get-Content -Raw 'skills/prose-teach/SKILL.md'; Get-Content -Raw 'skills/prose-reading-level/SKILL.md'
Get-Content -Raw 'skills/prose-reading-level/references/reading-level.md'
Get-Content -Raw 'skills/prose-formal/SKILL.md'
Get-Content -Raw 'skills/prose-instruct/SKILL.md'
node scripts/prose.mjs guide teaching-prose --text --section anatomy
node scripts/prose.mjs guide formal-prose --text --section anatomy
node scripts/prose.mjs guide instruction-docs --text --section anatomy
New-Item -ItemType Directory -Force -Path 'docs/research/2026-10-20-yoda/with-skills' | Out-Null
```

Initial diagnostics (each command was run once; the first four exited 1 and the last two exited 0):

```powershell
node scripts/prose.mjs lint 'docs/research/2026-10-20-yoda/with-skills/01.md' > 'docs/research/2026-10-20-yoda/with-skills/01-lint.json'
node scripts/prose.mjs measure 'docs/research/2026-10-20-yoda/with-skills/01.md' > 'docs/research/2026-10-20-yoda/with-skills/01-measure.json'
node scripts/prose.mjs lint 'docs/research/2026-10-20-yoda/with-skills/02.md' > 'docs/research/2026-10-20-yoda/with-skills/02-lint.json'
node scripts/prose.mjs measure 'docs/research/2026-10-20-yoda/with-skills/02.md' > 'docs/research/2026-10-20-yoda/with-skills/02-measure.json'
node scripts/prose.mjs lint 'docs/research/2026-10-20-yoda/with-skills/03.md' > 'docs/research/2026-10-20-yoda/with-skills/03-lint.json'
node scripts/prose.mjs measure 'docs/research/2026-10-20-yoda/with-skills/03.md' > 'docs/research/2026-10-20-yoda/with-skills/03-measure.json'
```

After correcting metadata, the four `01`/`02` diagnostic commands above were each run a second time and exited 0. The `03` checks were not repeated. Tool sessions that exceeded the initial wait were polled with `write_stdin` to obtain their final exit codes and stderr.

Read and summarized actual diagnostic outputs:

```powershell
Get-ChildItem 'docs/research/2026-10-20-yoda/with-skills/*.json' | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }
Get-ChildItem 'docs/research/2026-10-20-yoda/with-skills/*-lint.json' | ForEach-Object { $checkResult = Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json; [pscustomobject]@{file=$_.Name; ok=$checkResult.ok; errors=$checkResult.errors; warnings=$checkResult.warnings; judgement=$checkResult.judgement} | ConvertTo-Json -Depth 8 }; Get-ChildItem 'docs/research/2026-10-20-yoda/with-skills/*-measure.json' | ForEach-Object { $measureResult = Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json; [pscustomobject]@{file=$_.Name; words=$measureResult.style.words; placeholders=$measureResult.placeholders; readabilityStatus=$measureResult.readability.status; readabilityEstimate=$measureResult.readability.estimate} | ConvertTo-Json -Depth 8 }
```

Body-count command:

```powershell
$bodyCounts = foreach ($draftId in @('01','02','03')) { $draftPath = "docs/research/2026-10-20-yoda/with-skills/$draftId.md"; $draftText = Get-Content -Raw -LiteralPath $draftPath; $bodyText = $draftText -replace '(?s)\A---\r?\n.*?\r?\n---\r?\n','' -replace '(?m)^#+ .*\r?\n?','' -replace '(?m)^\d+\.\s+','' -replace '(?m)^-\s+','' -replace '\*\*',''; $bodyTokens = @($bodyText -split '\s+' | Where-Object { $_ -and $_ -notmatch '^[=−]+$' }); [pscustomobject]@{file="$draftId.md"; bodyWords=$bodyTokens.Count; method='Whitespace-separated body tokens; frontmatter, headings, list markers, bold markers and standalone mathematical operators excluded; fractions counted as single tokens.'} }; $bodyCounts | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 'docs/research/2026-10-20-yoda/with-skills/body-word-counts.json'; $bodyCounts | ConvertTo-Json -Depth 4
```

The final file inventory was checked with:

```powershell
Get-ChildItem 'docs/research/2026-10-20-yoda/with-skills' | Select-Object Name,Length | ConvertTo-Json
```

`apply_patch` created the three prose files, corrected the two metadata values and one grader sentence, preserved the four exact error JSON records, and wrote these notes. A final notes-only edit clarified the scope of drafting review after the orchestrator froze the prose. All changes were confined to this assigned output directory. No commits were made.
