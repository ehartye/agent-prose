# Compare a source with reading-level adaptations

Use this when the owner wants to read a source beside one to three versions for different audiences,
edit those versions and choose one. The same proof-desk shell, fonts, palette, settings gear and theme
preference are used by the other review modes. No model runs inside the CLI or browser.

## Prepare the texts

1. Keep the original Markdown file intact. Use the reading-level workflow to inventory its claims,
   quantities, conditions, citations and essential terminology.
2. Write one to three adaptations to separate Markdown files inside the same prose project. A lower
   or higher audience target changes access to the ideas, while retaining their meaning and purpose.
   Keep teaching support and topic prerequisites appropriate; do not inflate vocabulary for a higher
   grade or delete a required condition to lower a score.
3. Put an explicit `reader` profile in each adaptation. `schoolGrade: 9` means a ninth-grade audience;
   a numerical `readingLevel` interval is a different request. Do not infer a target for a source that
   has none. Label original demonstrations as demonstrations, not assessed or certified texts.
4. Run the ordinary measurement and meaning checks before opening. Show requested audience and
   formula diagnostics separately. A lower formula result does not establish a better adaptation.

Initialize a prose project once with `prose init --dir <project>`. All compared files must be distinct
Markdown files inside that project. Existing sealed variant-set files are not an editable comparison;
prepare independent adaptation files instead.

## Open the comparison

```text
prose compare create source.md grade-6.md grade-9.md grade-12.md --dir <project> --title "Power divided, power checked"
prose compare open <id> --dir <project>
```

Use the returned comparison id, and give the owner the exact returned review URL. One or two
adaptations work too. `open` uses the existing authenticated reading server with local access by
default. It does not open a browser implicitly or publish the documents.

The source is read-only. Each version has Edit, Save/Discard and Choose controls. Desktop columns
scroll independently. Narrow screens retain readable column widths and let the owner move across
the board. Theme overrides continue to use the shared gear. Formula details and their unavailable
reasons are secondary information, not an approval gate.

Normal prose uses the readable document view. Bodies with tables, code fences, images or HTML use
an explicitly labeled whole-body Markdown view so material is not silently omitted. Markup stays
safe text; images and HTML are not rendered or fetched. The formula still measures only its named
paragraph scope, not the fallback's full displayed content.

## Retrieve feedback or refine a version

```text
prose compare show <id> --dir <project>
prose compare edit <id> 1 --text-file revised-body.md --revision <revision> --dir <project>
prose compare choose <id> 1 --revision <revision> --dir <project>
```

`show` returns the current source, versions, compound revision and chosen version. Use the returned
revision for a write. The edit input is the Markdown body only; original frontmatter is preserved.
Source/adaptation paths at creation are relative to the project. `--text-file` resolves from the
current working directory; supply an explicit path when running outside the project.
An external file change causes a conflict. Reload and compare rather than retrying with an assumed
revision or discarding unsaved text. If the original source changes, create a fresh comparison so
the adaptations can be reviewed against the new source explicitly.

Choosing records the version and its current content hash. It does not copy it over the source,
publish it or affect the taste model. If that version changes later, the stored choice is visibly
outdated and needs review. Report the actual chosen file/hash and any unresolved fidelity issue;
never claim educator/learner testing or grade certification from the choice or diagnostic.
