# Reading-comparison workflow evidence

Two fresh agents received the same supplied source and three adaptations, the same preverified
runtime and isolated project/home directories. Both were started in the same parent turn. One read
the updated reading-level skill and its comparison/adaptation references; the control used CLI
discovery without skill files. Model snapshot, seed and sampling settings were not exposed.

This tests an authoring workflow over supplied texts. It does not compare generated prose quality,
automatic skill activation, grade calibration or learner outcomes. Inputs are original demonstrations,
not assessed or certified textbook material. The source declares a grade-9 audience; the versions
declare grades 6, 9 and 12. None requests a numerical reading-level interval.

## Tasks and observed results

Both arms created and opened the comparison, verified HTTP 200 and retrieved its state without
choosing for the owner. In an explicitly authorized isolated simulation, both saved the same body
sentence replacement using a current revision, chose version 1, then detected that the choice became
outdated after an external append. Source bytes and all four frontmatter byte sequences remained
unchanged. Both stopped only their isolated server. Neither performed browser inspection; separate
actual Chromium tests and screenshots establish interface behavior.

| Text | Intended school grade | FK estimate | Eligible words / sentences / paragraphs |
|---|---:|---:|---|
| Source | 9 | 11.2 | 196 / 14 / 3 |
| Version 1 | 6 | 7.2 | 200 / 23 / 4 |
| Version 2 | 9 | 10.3 | 210 / 18 / 4 |
| Version 3 | 12 | 16.2 | 209 / 11 / 3 |

Both arms distinguished those audience briefs from the paragraph-only heuristic. The returned
diagnostic target was null and its band comparison was `not-requested`. A score does not certify
these audience choices. The higher version's estimate also illustrates why the labels and measures
must not be treated as interchangeable. No educator or intended-reader review occurred.

The control recorded 18 CLI invocations and one recovered failure. The exposed arm recorded 32,
all successful, including extra parse/measure/lint checks. These counts are not a controlled speed
comparison, and both arms succeeded. They establish no skill superiority or writing/learning gain.
Both rejected Lexile certification and routed a poem without a reader brief away from grade adaptation.

## Path-help correction

The control initially supplied `project/source.md` while also specifying `--dir project`, which
resolves to a doubled project prefix. Its actual failure was:

```json
{"error":{"code":"E_NOT_FOUND","message":"A comparison document is unavailable","hint":"Restore the supplied source and adaptation files"}}
```

Retrying source/adaptation basenames relative to the project succeeded. Command help and the guide
now explicitly state creation paths are project-relative; `--text-file` resolves from the current
working directory. This clarification followed the pair and was not itself a new paired trial.

## Preserved evidence and limits

[The evidence archive](comparison-workflow-evidence.zip) contains the four identical supplied Markdown
inputs and both agents' command/result journals. Paths, review origins, tokens, process ids and
ports are normalized; prose, measurements, preservation hashes, failure codes and outcomes remain.
No installed client files, global npm link or ordinary user project were changed by the evaluation.
These are engineering and instruction-use checks, not a human usability study.
