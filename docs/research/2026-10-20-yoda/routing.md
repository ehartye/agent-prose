# Description-only skill selection probe

A fresh agent received the names, descriptions and `when_to_use` fields of all
nineteen skills, without skill bodies, prior evaluations or writing outputs. The
following records its selections, not host automatic activation. No actual
activation rate, false-positive rate or runtime discovery result was measured.

| Prompt | Selected primary | Composition or limitation |
|---|---|---|
| Textbook conditional-probability lesson for a freshman | `prose-teach` | `prose-reading-level` |
| Rewrite a research abstract for ninth graders; retain genre | `prose-formal` | `prose-reading-level` |
| Sixth-grade reset help | `prose-instruct` | `prose-reading-level` |
| First-grade controlled decodable story | None | Distinct decoding support required |
| Measure Spanish lesson against U.S. grade 6 | `prose-reading-level`, closest match | Catalog does not establish Spanish scoring or grade conversion |
| Sonnet for ninth graders | `prose-poetry` | `prose-reading-level` |
| Forty-word closure notice for families | `prose-formal` | Family audience alone did not cause grade targeting |
| Ten slides and speaker notes for high-school biology | `prose-presentation` | Teaching/reader skills; separate tool needed for slide-file production |
| Journal discussion-section explanation | `prose-formal` | No teaching skill selected |
| Unchanged Gettysburg Address with freshman questions | `prose-teach` | Reader skill; preserve quoted source |
| Button label and error toast | None | Referenced [external UX-writing skill] is outside this catalog |
| Accessible sentence structure for an adult reader | `prose-reading-level` | Adult tone retained |

The excluded microcopy case exposes an existing external skill pointer in
`prose-instruct`. The original project design explicitly delegated microcopy to
that skill. Absence from this plugin does not prove the external skill is retired;
it does make that route conditional on another installation. It is an advisory
portability gap, not a demonstrated failure of the new capabilities.

For Spanish measurement the agent identified the unsupported demand, but chose
the closest skill. This supports recognizing the limit in this probe; it does not
validate multilingual measurement or guarantee the same selection in another host.
