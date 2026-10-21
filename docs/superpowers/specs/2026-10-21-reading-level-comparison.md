# Reading-level comparison in the shared proof desk

Authors need to read a source beside one to three adaptations, edit those adaptations and choose a version. This extends the shared review shell; it does not introduce a separate theme, page application or preference system.

The source stays read-only. Each supplied Markdown adaptation has its own file and reader metadata. Requested U.S. school grade or reading-demand band is shown separately from the existing Flesch–Kincaid diagnostic. Missing metadata or an unavailable estimate stays explicitly unknown. A lower score is not a fidelity or comprehension judgment. The reading-level skill still owns content preservation and audience review.

The desktop header stays compact. Two to four equal reading columns occupy the remaining viewport and scroll independently. Each adaptation has Edit, Save/Discard and Choose controls; its source column has none. Narrow screens scroll horizontally through readable-width columns. Shared settings, palette, fonts, safe DOM primitives, notices and license disclosure remain common with other review modes.

The normal prose view uses the document's analytical blocks. If the body includes tables, fenced code, images or HTML that this view cannot represent completely, show the whole Markdown body as safe text with an explicit notice. Do not silently omit calculations or table values, execute markup or fetch image assets. Readability diagnostics retain their existing paragraph-only scope independently of this display fallback.

A project-local comparison manifest references distinct, root-contained Markdown files, stores the original source hash and records a chosen adaptation with its content hash. All writes check a compound revision under the existing project lock and use atomic file replacement. Edits preserve raw frontmatter and affect only the named adaptation body. A changed source blocks mutations until a fresh comparison is created. A choice becomes outdated if its adaptation changes. No choice writes the source, publishes content, or enters variant-set taste/prediction logs.

Commands: `prose compare create <source> <variants...> --dir <project>`, `compare show <id>`, `compare open <id>`, `compare edit <id> <variant> --text-file <body> --revision <revision>`, and `compare choose <id> <variant> --revision <revision>`. Creation accepts one to three adaptations. The preview uses the existing authenticated ReadingServer and shared static asset allowlist; it binds locally by default. There are no hidden model calls. The host agent prepares the adaptations before opening the comparison.

The independent publication fix rewrites fragment-only links to `about:srcdoc#…` only when embedding the compiled HTML in its sandboxed `srcdoc` preview. Browser tests click actual notes and internal destinations and verify their targets remain in-frame. Portable exported HTML keeps ordinary fragment links.

Verification covers file boundaries, frontmatter/source preservation, concurrent edits, stale source/choice, grade/diagnostic separation, real editing and choice persistence, independent scrolling, light/dark/phone rendering, and original review/annotation regressions. Educational effectiveness and grade certification are outside these engineering checks.
