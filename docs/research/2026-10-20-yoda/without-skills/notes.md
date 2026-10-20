# Authoring notes

Drafted the three requested texts from `prompts.json` using ordinary writing ability. No skill files, implementation, specifications, prior evaluation outputs, other comparison arms, or external sources were read. No prose CLI commands were run. No human reader or educator testing took place.

The Markdown texts are in `01.md`, `02.md`, and `03.md`. Actual check results are stored separately in `checks-word-counts.json` and `checks-measure-object.json`. Word counts use the tokenization described in the JSON; the additional PowerShell check counts all whitespace-separated tokens in `01.md`, including headings and Markdown symbols.

## Operations performed

1. Read the supplied task packets with:

```powershell
Get-Content -Raw -LiteralPath 'docs/research/2026-10-20-yoda/prompts.json'
```

2. Wrote `01.md`, `02.md`, and `03.md` with `apply_patch`.

3. Ran this command to create the word-count record:

```powershell
$outputDir = 'docs/research/2026-10-20-yoda/without-skills'
$counts = foreach ($id in @('01', '02', '03')) {
    $content = Get-Content -Raw -LiteralPath (Join-Path $outputDir "$id.md")
    $body = ($content -split '\r?\n' | Where-Object { $_ -notmatch '^#{1,6}\s' }) -join [Environment]::NewLine
    $body = $body -replace '(?m)^\s*(?:\d+\.|-)\s+', ''
    $words = [regex]::Matches($body, "[\p{L}\p{N}]+(?:[’'/-][\p{L}\p{N}]+)*").Count
    [pscustomobject]@{ file = "$id.md"; body_words = $words }
}
$result = [pscustomobject]@{
    check = 'body_word_counts'
    method = 'Exclude Markdown heading lines and list markers; count letter/number tokens, keeping internal apostrophes, hyphens, and slashes.'
    counts = @($counts)
}
$json = $result | ConvertTo-Json -Depth 5
Set-Content -LiteralPath (Join-Path $outputDir 'checks-word-counts.json') -Value $json -Encoding utf8
$json
```

The command returned empty stdout. The resulting JSON file was then read successfully with:

```powershell
Get-Content -Raw -LiteralPath 'docs/research/2026-10-20-yoda/without-skills/checks-word-counts.json'
```

4. Ran this additional word-count command:

```powershell
Get-Content -Raw -LiteralPath 'docs/research/2026-10-20-yoda/without-skills/01.md' | Measure-Object -Word
```

It reported 281 words. The result is preserved in `checks-measure-object.json`.

5. Wrote this note and the second check record with `apply_patch`.
