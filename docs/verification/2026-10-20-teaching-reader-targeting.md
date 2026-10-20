# Teaching and reader targeting — 0.10.0 verification

Release candidate: nineteen skills, twenty-five forms and nine craft families.
The two capabilities compose textbook teaching with reader adaptation; ordinary
freshman requests record school grade 9 without an inferred numerical FK target.

## Local release checks

Windows, Node 24.18.0:

- `npm ci --ignore-scripts`: locked dependencies installed; audit reported no vulnerabilities.
- `npm test`: 137 files passed; 2,781 tests passed and two existing tests skipped.
- `npm run typecheck` and `npm run refs:check`: passed.
- Isolated managed 0.10.0 setup with a separate npm prefix: passed. The installed
  launcher parsed, measured and linted the teaching guide example, resolved
  `guide textbook`, included all four skill/reference resources and retained the
  Yoda range/cap guidance. School grade 9 had no numerical target.
- Managed source fingerprint: `e38b3ad828cbdb6aa64f6f28079e2c5c2c384e664901c27e07a7c3f35eb734f4`.
- Package, lockfile, plugin and local marketplace versions agree at 0.10.0.

Ubuntu and Windows PR CI must pass on the final source head before integration.
The annotated release tag must resolve to the tested merge commit. Release and
marketplace publication are verified separately from these local checks.

## Evidence and limits

The [initial archive](../research/2026-10-20-teaching-reading-level/README.md)
and [Yoda audit](../research/2026-10-20-yoda/README.md) preserve prompts, outputs,
tool records, independent review and source/setting limits. The concealed-arm
three-task review found both writing arms correct, without establishing a quality
advantage. A fresh paired regression check verified the range/cap instruction fix.

Reference excerpts distinguish a licensed study-assessed CEFR output, attributed
public-domain standards exemplars and original demonstrations. They do not certify
school grades. No educator/intended-reader comprehension test, classroom trial,
grade calibration or learning-effectiveness study occurred. Native length ranges
and hard caps remain a separate enhancement; scalar `target` retains its tolerance.
