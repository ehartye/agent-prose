# Annotation skill evaluation

These development runs exercised the annotation engine through fresh CLI processes, first without the new skills and then with `prose-annotate` and `prose-annotation-review`. Both agents completed the CLI tasks. This small evaluation does **not** establish a measurable advantage from the skills.

Task A supplied a short Markdown lesson, a definition of diffusion and a `core` concept list. The agent had to bind the first term occurrence, highlight the second sentence, propose an explanation, reload the saved list in a new process and start a preview. All three annotations remained drafts and the source bytes were unchanged in both runs.

Task B supplied an intentionally incorrect definition, “particles stop moving at equilibrium,” and asked for rejection without a replacement. Both runs preserved that supplied text, recorded rejection and left the source unchanged. The no-skill agent used a 37-byte host sentence; the skill-assisted agent used the supplied term alone as its 10-byte host source. These are behavior checks, not identical experimental fixtures or an accuracy benchmark.

The no-skill run discovered the interface through README, command help, capabilities and schema/source inspection. Its execution harness took 7.945 seconds; discovery time was not measured. The with-skill run also checked two near-miss requests: rewriting for a ninth-grade audience belongs to the writing/reading-level workflow, and choosing alternate phrasing belongs to `prose-review`.

Both preview servers started and closed. The no-skill run checked HTTP and state responses. The with-skill run could not open a browser because the computer-use environment exposed no browser provider. Separate Playwright workbench and consumer tests exercise the actual browser interface; these transcripts alone do not prove visual quality. Neither run accepted annotations, executed export or published externally.

The companion JSON summaries and command transcripts retain successful results and limitations. Filesystem roots are replaced with `<tmp>` and `<repo>`, preview URLs/tokens with `<preview-url>`, and process/port numbers with `0`. These substitutions preserve decisions, ranges, content and exit statuses. Ephemeral session identities and source hashes are retained. The records describe development behavior before the final integration fixes; automated regression tests cover the final implementation.

- [Without skills: summary](without-skill.json) and [transcript](without-skill.txt)
- [With skills: summary](with-skill.json) and [transcript](with-skill.txt)
