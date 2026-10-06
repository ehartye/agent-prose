# Editable storyboard format

Use UTF-8 JSON with `schema: "prose/storyboard@1"`, `title` and nonempty `scenes`. Optional `summary`, `notes` and `characters` appear in the reading copy.

Each scene has:

| Field | Meaning |
|---|---|
| `id`, `title` | Stable link id (letters, numbers, underscore, hyphen) and sequence name |
| `status` | `playable`, `established`, `drafted` or `proposed`; only use playable when verified in the actual game |
| `act` | Optional grouping name |
| `cast` | Optional array of character names |
| `stake`, `outcome` | Optional personal/practical need and changed situation |
| `sources` | Optional array of HTTPS/HTTP source URLs or local paths relative to the board |
| `panels` | Nonempty array with unique `id` and nonempty `visual`; optional `image`, `shot`, `action`, `change`, `dialogue` |
| `choices` | Optional array of `{text, to}`; `to` names a scene id |
| `next` | Optional array of scene ids; loops and optional horizons are allowed |

`visual` describes the shot's visible content; `action` identifies player or character participation; `change` explains the consequence. `dialogue` is optional authored speech, not an invented transcript. Local `image` paths are relative to the board directory and must resolve inside it. PNG, JPEG, WebP and SVG images are embedded in the HTML. An omitted image gets a clearly labeled text-only frame; a specified missing image is an error. A visual deliverable needs actual inspected images, not those empty frames.

Optional characters have `id`, `name`, and nonempty `quests: [{scene, action, change}]`; each quest references an existing scene. Optional `board` links a dedicated character storyboard by scene id. `status`, `desire` and `payoff` can distinguish existing people from proposed characters and describe the development. Character tracks are writing proposals unless their outcomes are already established.

```json
{
  "schema": "prose/storyboard@1",
  "title": "A repaired crossing",
  "scenes": [{
    "id": "arrival",
    "title": "Discover the closed crossing",
    "status": "drafted",
    "panels": [{
      "id": "arrival-wide",
      "image": "art/arrival-wide.png",
      "shot": "Wide at the berth",
      "visual": "The crew meets a keeper beside a failed guide.",
      "action": "Arrive and ask what happened.",
      "change": "The obstruction becomes known here."
    }]
  }]
}
```

The helper validates structure, link targets and file existence, not narrative quality, implementation state, completeness of canon or correspondence between a caption and its image. Keep original drafts intact. Source reading and visual review establish those boundaries.
