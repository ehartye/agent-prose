# Assessment notes

## Materials and method

Read tasks.md and source-1.md through source-3.md as supplied. Assessed each task independently using ordinary editorial judgment, the declared grade and prior knowledge, the reading setting, and the instructional purpose. Treated all three as fictional evaluation material; assessed source-2.md as literature despite its academic parser container. No source text was edited.

Used the provided direct Node executable for the prose CLI. Ran the general help command, measure help, and one measure command for each source. No setup was performed. No lint was run: the academic parser container was not used as a substantive genre requirement. No skills, craft guides, rules, specifications, plans, external reference sources material, web sources, other evaluation outputs, or other agents were consulted.

Used PowerShell Get-Content to read the inputs, Get-FileHash to verify source preservation, and apply_patch to write the four requested Markdown files. The initial shell help invocation emitted PowerShell profile XML errors but also returned the CLI help successfully. Subsequent shell calls disabled profile loading. These errors did not affect the input files or measurement results.

## Measurement results and limits

| Source | Tool word / sentence-unit counts | Dedicated readability result |
|---|---:|---|
| source-1.md | 149 / 10 | Estimated Flesch–Kincaid grade 9.4 |
| source-2.md | 118 / 10 | Estimated Flesch–Kincaid grade 3.6 |
| source-3.md | 34 / 4 | Insufficient sample; estimate null |

The supplied executable was preverified as version 0.11.0; no separate version check was run. The tool used its Markdown paragraph policy and English spelling-based syllable heuristic. Paragraph labels remain in the measurement input and affect sentence counts; no cleaned files were created. Headings and metadata do not represent prose comprehension demands in these results. The legacy style readingGrade field for source-3.md was 10.3, but its dedicated readability result correctly withheld an estimate under the tool's own sample convention. The report identifies that distinction rather than assigning the legacy value as a reading level.

Ratings are editorial judgments for the specified tasks, not validated measures of reader performance. No students or other human readers tested these passages. No factual verification of a real study or real classroom event was applicable to this fictional material. No additional scientific explanation was supplied for source-3.md.

## Source preservation

SHA-256 values recorded before writing the reports and checked afterward:

- source-1.md: 735C7BB9D651F9E21001D7E65BC73A4412B46643FE05F7A3604D795EA5F6BF5C
- source-2.md: AE7E0F9BA9A900E7337B4C2F2E704B9021DBFC95A87B6FD5B22C94CD9AC300A2
- source-3.md: 28061A7006E1B48078B9579C3148E3CDD0F298D2F398D6C6CCE2B745BEB21663
