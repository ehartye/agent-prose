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

## Commands

| Command | Does |
|---|---|
| `prose capabilities` | formats, forms, rule count, commands, error codes |
| `prose parse <file>` | the block IR with source line numbers |
| `prose measure <file>` | style, lexicon, spoken, script, dialog and per-speaker features |
| `prose lint <file>` | errors, warnings, info and the judgement rules for the draft's form |
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

## Choosing between variants

1. Write the draft, then `prose set new` with a direction per variant (punchier, drier, warmer...).
2. Rewrite each variant file in place with a different angle; `prose set check` rejects sameness.
3. Finish checking, then seal a guess with `prose predict`; never edit variant files afterwards.
4. Show the kept variants, then record the owner's choice with `prose set pick`.

Directions are measured proxies for style, not for quality. The owner's pick is the judgement;
sealed predictions and `prose taste stats` show how well the agent has learned it.

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

`prose rules` lists 40 rules, each tied to a source. Citations are in [REFERENCES.md](REFERENCES.md)
and the reasoning behind each topic in [craft/GUIDE.md](craft/GUIDE.md).

## Honesty notes

- AI-tell findings (vocabulary, promotional words, structural patterns) are style notes about
  how a draft reads, not verdicts on who or what wrote it. The tells shift between model eras.
- Thresholds are conventions drawn from the cited guidance, not laws. Where a number is derived
  by this project rather than quoted from a source, the rule says so.
- Lint reports measurements; judgement rules are for the writer or agent to weigh.

## Roadmap

Planned next: the LAN reading page with duels and read-aloud, and a learned taste model, then PDF and
reading-copy rendering. See [the design spec](docs/superpowers/specs/2026-10-02-agent-prose-design.md).

## License

MIT
