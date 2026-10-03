# agent-prose

A writing-craft toolkit for coding agents. agent-prose covers game dialogue (quest conversations, barks
and branching), user instructions and technical docs, academic and professional prose, multi-camera and
single-camera sitcom, TV drama, stage plays, YouTube scripts and speeches, each with its own register.
Agents draft in native formats — Fountain for screen and stage, Markdown with frontmatter for speeches,
instructions, documents and YouTube scripts, and a typed YAML graph for game dialogue — and the `prose`
CLI parses, measures and lints each draft against cited craft rules for its form.

Every command prints JSON (except `--help` and `--version`); failures print `{"error":{code,message,...}}` to stderr and exit non-zero. `lint` exits 0 even when it finds errors — check its `"ok"` field.

## Install

```
/plugin marketplace add ehartye/hartye-claude-plugins
/plugin install agent-prose@hartye-plugins
/agent-prose:prose-setup
```

Run `/agent-prose:prose-setup` after every install or update; it installs the managed runtime
(Node 24+ required). From a clone, `node scripts/setup.js` does the same.

## Skills

| Skill | Job |
|---|---|
| `prose-setup` | Install, check and repair the managed `prose` runtime |
| `prose-dialog` | Game dialogue: quest conversations, branching choices, barks and ambient lines as a checked YAML graph |
| `prose-instruct` | User instructions, how-to procedures, troubleshooting, help articles and technical docs |
| `prose-formal` | Academic and professional prose: abstracts, papers, reports, proposals, memos, email |
| `prose-script` | Sitcom (multi- and single-cam), TV drama, stage play in Fountain; YouTube scripts in Markdown |
| `prose-speech` | Toasts, eulogies, keynotes, talks and remarks, timed to a target length |
| `prose-comedy` | Jokes, alternate lines and punch-up passes with distinct comic mechanisms |
| `prose-review` | Variant sets for choosing between rewrites: checked for sameness, a sealed guess of the owner's pick, the pick recorded |
| `prose-voice` | Voice bibles for characters, brands and speakers, fitted from samples and checked on every draft |
| `prose-poetry` | Poems and verse forms (free verse, sonnet, haiku, limerick, ballad, villanelle, sestina) and words to a given meter, checked for syllables, rhyme and form |
| `prose-songwriting` | Song lyrics (verse-chorus, AABA, lullaby, hymn text, words to a melody): labelled sections, matched line lengths, refrains, syllables per beat |

## Commands

| Command | Does |
|---|---|
| `prose capabilities` | formats, forms, rule count, commands, error codes |
| `prose parse <file>` | the block IR with source line numbers |
| `prose measure <file>` | style, lexicon, spoken, script, dialog and per-speaker features |
| `prose lint <file>` | errors, warnings, info and the judgement rules for the draft's form |
| `prose scan <file> [--form <id>] [--text] [--words]` | syllables, stress, rhyme scheme and meter of a verse draft (US English pronunciations; JSON, or `--text` for a table) |
| `prose pronounce <word...>` | the dictionary pronunciation, syllables, stress and rhyme key of each word, with its source (dict, affix or guessed) |
| `prose rules [--form <id>]` | the cited rules, optionally for one form |
| `prose init [--dir <dir>]` | create `.agent-prose/` (project.json, voices/ and a `.gitignore` for sets and taste data); safe to rerun; reports `shadows` when inside another project, whose voices drafts here no longer see |
| `prose voice list [--dir <dir>]` | the voice bibles of the project found from a directory upward |
| `prose voice fit <file> --speaker <name> --id <id> [--name <name>]` | measure one speaker and write `.agent-prose/voices/<id>.yaml` with ranges around the measurements |
| `prose set new <draft> --directions <list> [--count <n>] [--id <id>]` | start a variant set: base copy plus one file per variant to rewrite |
| `prose set list`, `prose set show <id>`, `prose set annotate <id> <n>` (each takes `--dir <project>`) | list sets; show every variant's text, status and the kept ones; record a variant's angle label or note |
| `prose set check <id> [--dir <project>]` | reject unchanged, near-duplicate and lint-failing variants; verify each moved in its direction |
| `prose predict --set <id> --pick <n> [--shortlist <list>] --why <text> [--dir <project>]` | seal a guess of the owner's pick (kept variants only; freezes what is shown and a hash of each variant file) |
| `prose set pick <id> --pick <n> [--tags <list>] [--no-predict] [--dir <project>]` | record the owner's choice as taste verdicts and reveal whether the guess hit |
| `prose taste stats [--all-projects] [--dir <project>]` | how often sealed predictions matched the owner's pick, and how many verdict rows the logs hold |
| `prose set duel <id> --a <n> --b <n> --outcome a\|b\|tie\|bothBad` | record a head-to-head from the reading page as one taste verdict (the page calls it; it never ships the set) |
| `prose serve [--local] [--port <n>] [--foreground] [--stop] [--status]` | start or reuse the LAN reading server and print its link (the link carries the access token) |
| `prose reading open --set <id> [--no-predict] [--prompt <text>] [--dir <project>]` | put a checked, predicted set on the reading page: freezes what is shown, registers the project, prints the link |
| `prose reading wait --id <id> [--timeout <s>]` | block until the owner asks to refine, ships or abandons; prints champion, directions, notes with the unit text, and what to do next |
| `prose reading round --id <id> --set <new-set>` | answer a refine request with a new set; its survivors join the session against the pinned champion |
| `prose reading status\|list\|close` | the folded session state (and the reveal once shipped), the project's sessions, abandon an open session |

## Choosing between variants

1. Write the draft, then `prose set new` with a direction per variant (punchier, drier, warmer...).
2. Rewrite each variant file in place with a different angle; `prose set check` rejects sameness.
3. Finish checking, then seal a guess with `prose predict`; never edit variant files afterwards.
4. Put the kept variants in front of the owner on the reading page (below), or show them in chat, then record the
   choice with `prose set pick` (the page records it for you).

Directions are measured proxies for style, not for quality. The owner's pick is the judgement;
sealed predictions and `prose taste stats` show how well the agent has learned it.

## Reading page

The owner can read, hear and compare the variants on a phone or laptop on the home network instead of in the
terminal. `prose serve` runs a small web server and the agent hands the owner a link. What the owner sees:

- **Lineup.** Each draft, one per card in a random order, to keep or pass on. Tapping a sentence (a line in verse,
  scripts and dialog) leaves a note on it. Scripts and dialog show who speaks each line.
- **Duels.** Head-to-head pairs of the kept drafts, sides randomised; the owner can call a tie or reject both.
- **Refine.** Pick the champion and up to four directions, and the request goes back to the agent, who answers with
  a new round shown against the champion. "What changed?" shows a draft's direction only when asked.
- **Read aloud and timing.** Play reads a draft with the device's own voice (the browser's speech synthesis; no
  audio leaves the machine) and highlights the current sentence or line, with an estimate against the declared target.
- **Ship.** The owner chooses the winner; the page then reveals the agent's sealed prediction and whether it matched.

Every judgement lands in the same taste log as `prose set pick`. Nothing the page shows lets the owner edit a draft;
every write goes through the `prose` CLI.

**Exposure.** By default the server listens on the whole network, and anyone on it who has the link can read the drafts
in the projects registered with the server (traffic is plain HTTP; the link carries a random token). Tell the owner
before opening a session, and use `prose serve --local` to keep the server on this machine (the page then works only
on this computer). Windows Firewall may block the first connection from a phone; the command prints the port to allow.

The agent's sequence:

1. `prose set check <id>`, then `prose predict --set <id> --pick <n> --shortlist ... --why ...`.
2. `prose reading open --set <id>`; give the owner the link (a machine-name link and an IP link, since phones
   often cannot resolve the name) and say who else can see it.
3. `prose reading wait --id <id>`; on a refine request write a new set from the champion toward the directions and
   notes (`prose set new <champion draft> --directions ...`), then `prose reading round --id <id> --set <new-set>` and wait again.
4. On a ship, `prose reading status --id <id>` shows the reveal; apply the winner to the draft if the owner wants it.

`prose serve --status` shows whether the server answers. `prose serve --stop` ends the server but keeps its token and
the registered projects, so the link the owner was given works again after the next `prose serve`. (The page removes `?t=` from the address bar once it has loaded, so a bookmark made from the address bar afterwards has no token; keep the original link.) `prose serve` replaces a running server of the other bind (`--local` or not), and `reading open` reuses whatever is running.

**Where state lives.** Each session is a folder in the project, `.agent-prose/sessions/<id>/` (`session.json`, an
append-only `events.jsonl`, `reveal.json`). The per-user `server.json` in `~/.agent-prose` holds the access token and
the registered projects (`AGENT_PROSE_HOME` moves it).

**Not included.** No cloud text-to-speech (the browser's voice only; cloud audio belongs to the planned render command),
and pairs are chosen by least-compared, not by a learned taste model yet.

`prose init` writes `.agent-prose/.gitignore` so sets and taste data stay out of version control;
voice bibles stay trackable. Per-user taste logs live under `~/.agent-prose/taste` (override with
`AGENT_PROSE_HOME`). `AGENT_PROSE_HOME` moves both the managed runtime and the taste logs; to reinstall,
remove `releases/<key>`, not the directory: it also holds your taste history.

## Where things are stored

- `.agent-prose/` in the project: `project.json`, `voices/`, `.gitignore`.
- `.agent-prose/sets/<id>/`: `set.json`, `base.*`, `v1.*`..., `prediction.json`, `reveal.json`, `pick.pending.json` (only while a pick is interrupted), `.lock` (only while a command runs).
- `.agent-prose/taste/verdicts.jsonl` per project; `~/.agent-prose/taste/verdicts.jsonl` and `predictions.jsonl` per user.

Trimmed output of the set commands (paths and long fields shortened):

```jsonc
// prose set show demo
{ "set": "demo", "form": "speech-small", "picked": null, "prediction": false, "keep": [1, 2, 3],
  "variants": [{ "index": 1, "direction": "shorter", "file": "v1.md", "status": "ok", "reasons": [], "text": "..." }] }
// prose predict --set demo --pick 2 --shortlist 1 --why "warm, second person"
{ "set": "demo", "pick": 2, "shortlist": [1], "shown": [1, 2, 3], "why": "...", "seal": "4231..." }
// prose set pick demo --pick 2 --tags warmer
{ "set": "demo", "picked": 2, "file": "v2.md", "verdicts": 2, "appended": 2, "skipped": 0,
  "reveal": { "agent": { "pick": 2, "hit": true, "shortlistHit": true, "sealValid": true } } }
// prose taste stats
{ "sessions": 1, "agent": { "predicted": 1, "hits": 1, "shortlistHits": 1, "voided": 0, "rate": 1 },
  "recent": { "window": 10, "agentRate": 1 }, "verdicts": { "project": { "rows": 2 }, "global": { "rows": 2 } } }
```

## Draft formats

Fountain (`.fountain`; set `Form:` on the title page):

```
Title: Pilot
Form: sitcom-multicam
Target: 3 pages

INT. KITCHEN - DAY

MARA
You burned the toast again.
```

Markdown with frontmatter (`.md`; `form`, a length `target` and a reading rate `wpm` are optional):

```md
---
form: speech-small
target: 5 minutes
wpm: 120
---
Thank you all for coming.
```

`prose/dialog@1` YAML (`.dialog.yaml`):

```yaml
form: quest-dialog
nodes:
  - id: entry
    speaker: BRANNOC
    text: Forge is hot. State your business.
    end: true
```

## Verse

Poems and song lyrics are Markdown too: one line of text per verse line, a blank line between stanzas.
Set `form` in the frontmatter to one of nine verse forms: `free-verse`, `haiku`, `limerick`, `ballad`,
`sonnet-shakespearean`, `sonnet-petrarchan`, `villanelle`, `sestina` or `song`. `prose measure` and
`prose lint` then add syllables, stress, rhyme scheme and form checks.

`prose scan <file>` shows each line's syllables, stress, rhyme letter and meter flags (`--text` prints a table):

```
line    syl  stress       rh  end word   text                                               flags
   6     10  ??01???10?   a   day        Shall I compare thee to a summer's day?
   7   9/10  ???10??10    b   temperate  Thou art more lovely and more temperate:           ambiguous:temperate meter:10
```

`prose pronounce <word...>` shows how a word is read:

```jsonc
// prose pronounce temperate zxqvt (trimmed)
{ "word": "temperate", "source": "dict", "syllables": 2, "syllablesAlt": 3, "stress": "10", "rhymeKey": "EH M P R AH T" }
{ "word": "zxqvt", "source": "guessed", "syllables": 1, "stress": "?", "rhymeKey": "zxqvt" }
```

Every word carries a trust tag: `dict` (found in the dictionary), `affix` (a regular ending on a dictionary
word) or `guessed` (not found; a spelling estimate, so syllable, stress and rhyme results on that line are weaker).
Pronunciations are US English only. Meter findings are advisory, because scansion is contested: only a
polysyllable's dictionary stress against its slot counts, and lines with guessed words are skipped.

Markdown caveat: a verse line that starts with `- `, `1. ` or `> ` is read as a list item, step or quote;
lint reports it (`verse.format.markup`) and the line is still measured. A line starting with `#` becomes a
heading (a section label) and is not counted as verse. Start such a line with a word, or escape the marker.

Song forms (`song`) also read plain and bold lines as structure, so `**Verse 1**` works like `## Verse 1` and
`[Verse 1]`. A line that is only a section label is a label, not a lyric: `Verse 1`, `Chorus (x2)`, `Bridge`,
`Pre-Chorus:` (a trailing colon is fine; the words are verse, chorus, pre-chorus, bridge, intro, outro, refrain,
hook, interlude, solo, instrumental, tag, coda and break, with an optional number or letter and an optional
bracketed note), or one capital letter A to D with an optional note (`A`, `B (bridge, rise a little)`) for AABA
drafts. The label names the section for the stanzas after it, so the chorus and like-section checks apply. A line
wholly in one parenthesised phrase (`(hum softly)`; `(Ooh) take me home (ooh)` is sung), a line of up to twelve words
with a bpm figure (`90 bpm`), or a line of up to six words with a stand-alone time signature (`4/4`; `I love you
24/7` is sung), is a direction. It is never counted or scanned as a lyric, `prose scan` and `prose measure` list it under
`directions`, and lint reports each one as `verse.format.direction` (info) so a sung line is never lost silently.
A poem is not affected: there a parenthesised line stays a verse line.

Words written for an existing tune or hymn meter can declare the tune's pattern in the frontmatter, in any verse
form. `syllables` is the per-stanza count, repeated for every stanza: a list `[8, 6, 8, 6]` or a string `8.6.8.6`,
`8 6 8 6` or `8,6,8,6`. `scheme` is one letter per line (`x` marks a line that is not constrained to rhyme). Either
accepts a map by section label (`verse`, `chorus`, `bridge`) instead, for songs whose sections differ; a key that matches no
section of the draft, or a map on a draft with no section labels, is a lint warning. The declared
pattern overrides the form's own for the check, a line misses it only when its syllable range (a word such as
"every" counts two or three) does not include the target, and a stanza of the wrong length is reported once.
A malformed value stops with an `E_SCHEMA` error that shows the accepted forms.

```markdown
---
form: free-verse
syllables: 8.6.8.6
scheme: xaxa
---
The morning breaks upon the hill
And wakes the sleeping town
The river runs with silver light
Where all the shadows drown
```

```markdown
---
form: song
syllables:
  verse: [7, 7, 7, 5]
  chorus: [7, 7, 8]
scheme:
  verse: xaxa
  chorus: aab
---
```

`prose scan` and `prose measure` report the pattern as `declared` (null when none), and `scan --text` adds a `want`
column: `8 ok`, `8 +2` (two syllables over the declared 8) or `8 -1`.

A song that declares `tempo` (and optionally `beatsPerLine`, default 4) also gets syllables per beat (syllables divided
by beats per line): `scan` JSON has `syllablesPerBeat` (`tempo`, `beatsPerLine`, `perLine`, `mean`; null when not declared),
and `--text` adds a trailing `spb` column and a `Syllables per beat: ...` note. Both outputs carry a `legend` (in `--text`,
the last note lines) saying how to read the stress column, the inferred `Scheme` (perfect and identity rhymes; `near` adds
slant rhymes) and any declared pattern.

## Settings

Measurements start from the form's defaults (`prose capabilities` lists the forms). A project
can override them in `.agent-prose/project.json`, and a draft can override the reading rate in
its own metadata; the most specific wins (form, then project, then document):

```json
{ "schema": "prose/project@1", "wpm": 140, "forms": { "quest-dialog": { "boxChars": 50, "boxLines": 3 } } }
```

`wpm` applies to forms timed by words per minute (speeches, YouTube, dialog), and `boxChars` /
`boxLines` to dialog forms. A draft sets `wpm: 120` in its frontmatter or dialog YAML; scripts
are timed by pages, so `wpm` there is an error. A bad `project.json` is `E_SCHEMA` with a pointer to the field.

## Rules and citations

`prose rules` lists 55 rules, each tied to a source. Citations are in [REFERENCES.md](REFERENCES.md)
and the reasoning behind each topic in [craft/GUIDE.md](craft/GUIDE.md).

## Honesty notes

- AI-tell findings (vocabulary, promotional words, structural patterns) are style notes about
  how a draft reads, not verdicts on who or what wrote it. The tells shift between model eras.
- Thresholds are conventions drawn from the cited guidance, not laws. Where a number is derived
  by this project rather than quoted from a source, the rule says so.
- Lint reports measurements; judgement rules are for the writer or agent to weigh.

## Roadmap

Shipped: the LAN reading page with duels and read-aloud. Planned next: a learned taste model that chooses the pairs,
then PDF and reading-copy rendering. See [the design spec](docs/superpowers/specs/2026-10-02-agent-prose-design.md).

## Acknowledgements

The verse engine's pronunciation data is a comment-stripped copy of the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict)
(copyright 1993-2015 Carnegie Mellon University), vendored in `craft/data/cmudict.dict.gz` with its licence in
`craft/data/CMUDICT-LICENSE.txt`, as the CMU notice requests. The accuracy measurement is in
[docs/research/verse-dictionary-spike.md](docs/research/verse-dictionary-spike.md).

## License

MIT
