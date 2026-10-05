# Source dialogue round trips

Import static JSON, YAML or supported JavaScript module literals without executing the game:

```sh
prose init --dir <project>
prose dialog import <source> --root <source-root> --out <project>/review.dialog.yaml --manifest <project>/source.manifest.json
prose dialog review <project>/review.dialog.yaml --manifest <project>/source.manifest.json --id <slot-id> --directions drier,warmer
```

Inspect the manifest's `slots` for the exact ID. Authored IDs are preserved; slots without one have
snapshot-derived identities which are valid only for that unchanged source. Unsupported dynamic
expressions are reported and refuse import. Do not run source code to make an import succeed.

The generated graph is a review surface, not a replacement for the game's dialogue engine. Its sidecar
keeps source paths, hashes, literal positions, identities, conditions, effects, tiers, once flags and
other context. Different slot types carry different character limits. Re-import when source changes.

Agree and confirm the brief through `prose set brief <set-id> ... --confirmed`. Rewrite only the
designated node's `text` in each candidate. Keep speakers, IDs, variants and all other fields intact.
Then follow prose-review: check, seal a prediction, show the reading page and record the owner's pick.
A short line's direction score is an uncertain proxy; zero does not establish bad writing.
Send-back `set new --redo` and refine `set new <champion> --brief-from <previous-set>` carry the source
binding forward. Keep the original imported draft unchanged; apply checks it against the manifest.

```sh
prose dialog apply --manifest <project>/source.manifest.json --sets <set-id>,<another-id> --dir <project>
prose dialog apply --manifest <project>/source.manifest.json --sets <set-id>,<another-id> --dir <project> --confirm <digest>
prose dialog undo --id <apply-id> --dir <project>
prose dialog recover --id <apply-id> --mode complete --dir <project>
```

The first apply is a dry run. Show the exact changes and validation to the owner before applying
the returned digest. It binds the source, manifest, recorded picks and plan. Changed source,
changed winners, duplicate slots or protected edits refuse. Apply writes a recovery journal;
undo restores exact originals while the output still matches. Recovery can `complete` prepared
writes or `restore` originals, and refuses unrelated edits. These checks do not replace the game's
own contract validators: run them on the changed game before shipping it.
Journals retain original source text in `.agent-prose/dialog-applies/`. New projects ignore that
directory; add `dialog-applies/` to an existing project's `.agent-prose/.gitignore`.

Use `prose dialog repetition <draft-or-manifest> <another-file> --dir <project>` to find repeated
lines across files and speakers. Voice bibles can keep negative guidance (`voice new --avoid`);
that guidance appears in the brief and requires judgement. Fitted numerical ranges are provisional
observations and do not define personality.
