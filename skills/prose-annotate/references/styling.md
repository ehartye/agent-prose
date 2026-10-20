# Annotation presentation and consumer styling

The native `prose/annotation-bundle@1` JSON is the portable contract. Color names are optional
presentation hints; applications own their palette and components. Keep content identity, meaning
and approval independent of appearance. A color change does not accept an annotation or alter its
text. Web Annotation interchange omits these hints and reports the loss.

## Categories, members and modes

Categories are annotation kinds: `highlight`, `vocabulary`, `concept`, `definition`, `explanation`
and `link`. A member is a referenced concept, or an individual annotation without a concept.
Supported color tokens are `yellow`, `green`, `blue`, `purple`, `pink` and `orange`; arbitrary CSS,
URLs and style declarations are not accepted as colors.

| Mode | Color resolution |
|---|---|
| `category` | Category override, then the built-in category color |
| `member` | Annotation override, document concept override, then project concept color; otherwise no fill |
| `hybrid` (default) | Member color when assigned; otherwise category color |

The built-in category colors, in the order above, are yellow, green, blue, purple, orange and pink.
In member mode, unassigned passages retain an underline and their annotation controls.
Hybrid selects one color for a passage; it does not mix category and member colors.

A project concept can declare a reusable default in its concept registry:

```yaml
concepts:
  - id: diffusion
    label: Diffusion
    definition: Net spreading through random particle motion.
    color: green
```

A document sidecar can declare overrides:

```yaml
appearance:
  mode: hybrid
  categories:
    concept: blue
    explanation: orange
  concepts:
    diffusion: purple
  annotations:
    process-note: pink
```

The workbench gear contains mode and category controls. The detail column contains the selected
concept or annotation's member color. These controls save document overrides, including when a
concept registry is externally maintained; they do not edit the external registry. Removing an
override restores the project default or mode fallback. Writes use the current revision and are
recorded in the sidecar journal. Reload before retrying a conflict.

In published JSON, each document's optional `appearance` has this shape, but concept and annotation
map keys become their public UUID URNs/IRIs. Unpublished member overrides are omitted. A published
concept may retain `color`. Never match published identities against private authoring handles.

## Use the existing planner and resolver

`src/annotation/render.ts` exports browser-compatible helpers with no Node or framework dependency:

```ts
import {
  planAnnotationRuns, resolveHighlightColor, annotationHighlightCSS,
} from './render.ts';

const document = bundle.documents.find(d => d.id === documentId);
if (!document) throw new Error('Unknown document');
const blocks = planAnnotationRuns(bundle, documentId, {context: 'reading'});
for (const block of blocks) {
  for (const run of block.runs) {
    const annotation = run.annotations[0];
    const concept = bundle.concepts.find(c => c.id === annotation?.concept);
    const color = annotation
      ? resolveHighlightColor(annotation, concept, document.appearance)
      : undefined;
    // Render run.text as text, retain run.marks and run.href, and attach color
    // and all run.annotations to your component. Never inject source HTML.
  }
}
// Include annotationHighlightCSS through the host's stylesheet/build pipeline.
```

Keep all overlapping annotation identities on the run. The supplied publication renderer chooses
the first annotation in bundle order as the visible color; the workbench gives the selected
annotation priority for inspection. Neither choice drops the other notes. A host can offer a
chooser for overlapping notes using the same run metadata. Use `context: 'assessment'` to suppress
annotation hints and separately enforce the host's assessment policy.

## CSS and HTML

Prefer semantic data attributes and a stylesheet over stored style strings or inline event
handlers. The HTML export emits attributes like these on a span or mark, alongside separate,
keyboard-accessible note links:

```html
<span data-prose-annotations="urn:uuid:…"
      data-prose-category="concept" data-prose-color="blue">Diffusion</span>
```

Use the exported `annotationHighlightCSS` for the same six-color palette as the workbench. A
minimal host-specific alternative is:

```css
:root { --annotation-blue: #d5e5ff; --annotation-purple: #e8dcfa; }
[data-prose-color="blue"] { --annotation-fill: var(--annotation-blue); }
[data-prose-color="purple"] { --annotation-fill: var(--annotation-purple); }
[data-prose-annotations] {
  background: var(--annotation-fill, transparent);
  color: inherit;
  border-bottom: 2px solid currentColor;
  box-decoration-break: clone;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) { --annotation-blue: #263f68; --annotation-purple: #49345f; }
}
:root[data-theme="dark"] { --annotation-blue: #263f68; --annotation-purple: #49345f; }
@media (forced-colors: active) {
  [data-prose-annotations] { background: Canvas; color: CanvasText; border-color: CanvasText; }
}
```

Add the other four token mappings if using this reduced example. Test contrast with the host's
actual text, link and focus colors in each theme. Preserve textual category/member labels, note
controls and a selection outline; color alone must not communicate meaning or approval.
See [W3C's Use of Color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

For Markdown, keep the sidecar/native bundle and apply annotations after the host's Markdown
parser. Plain CommonMark has no standard attribute syntax. A host may generate the HTML above,
but must configure its sanitizer to retain the specific `data-prose-*` attributes it uses. Do not
interpolate annotation bodies into raw HTML. For structured content, render the planner's runs
inside the application's own components, preserving stable block IDs and existing formatting.

## Workbench layout and theme

The shared review shell owns the gear, settings dialog and palette. System is the default and
responds to live OS changes. Light/Dark overrides use a persistent host-only preference cookie so
review links on changing ports remember the choice. Different hostnames/devices keep separate
preferences. Clearing browser site data removes the override; System removes it explicitly.
The cross-port behavior is described in [RFC 6265, section 8.5](https://www.rfc-editor.org/rfc/rfc6265#section-8.5);
the cookie contains only the appearance preference, never review tokens or decisions.

On desktop widths above 1150 CSS pixels, the queue, source and details each have their own scroll
container. The layout constrains the desk to the viewport, lets flex/grid children shrink with
`min-height: 0`, and applies `overflow: auto` plus `overscroll-behavior: contain` to the columns.
Narrow screens stack the panes and use normal document scrolling. Focusable, labeled containers
support keyboard scrolling; no JavaScript wheel interception is needed.
