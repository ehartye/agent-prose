# prose/voice@1 voice bibles

Voice bibles live in `<project>/.agent-prose/voices/<id>.yaml`. `prose init` creates the folder;
lint finds the project by walking up from the draft's directory.

## Schema

| Key | Required | Meaning |
|---|---|---|
| `schema` | yes | `prose/voice@1` |
| `id` | yes | lowercase id, also the file name |
| `name` | yes | display name |
| `speakers` | yes | speaker names this bible covers (case-insensitive), e.g. `[GRIMBLE, GRIMBLE (O.S.)]` |
| `register` | no | e.g. `gruff transactional`, `warm formal` |
| `description` | yes | who they are, what they want, how they talk |
| `bio` | no | personality and background, at most 600 characters; no lint rule reads it, `set new --character <id>` snapshots it into a review brief |
| `samples` | no | real lines in the voice (3–10); empty when the bible was made with `prose voice new` |
| `banned` | no | words or phrases the character never says |
| `catchphrases` | no | lines or phrases they repeat on purpose |
| `targets` | no | measured ranges: `sentenceMean`, `contractionsPer1000`, `hedgesPer1000`, `exclaimPer100`, each `[min, max]` |

`prose voice new --id ID --name NAME --speaker NAME [--bio TEXT]` writes a bible with no draft: no samples, no targets.
`prose voice fit <draft> --speaker NAME --id ID` writes a bible with up to five samples and each
target set to the measured value ±25%. Ranges from a handful of lines are noisy — widen them by
hand until you have about 50 words of the character.

## Example

```yaml
schema: prose/voice@1
id: grimble
name: Grimble
speakers: [GRIMBLE]
register: gruff, transactional, suspicious
bio: Goblin merchant who lost a family shop to a creditor and now trusts no one with a coin.
description: >
  Goblin merchant. Wants coin and nothing else; treats every customer as a probable thief.
  Clipped sentences, dark deadpan, prices everything — including insults.
samples:
  - Coin first. Questions never.
  - That sword? Belonged to a hero. Past tense.
  - You break it, you bought it. You look at it funny, you also bought it.
banned: [friend, please, sorry, gladly]
catchphrases: [Coin first.]
targets:
  sentenceMean: [2, 7]
  exclaimPer100: [0, 10]
```

## What lint checks

| Rule | Fires when |
|---|---|
| `voice.targets` | a speaker's measured style leaves a target range |
| `voice.banned` | a speaker uses a banned word or phrase |
| `voice.unvoiced` (info) | the project has bibles but a speaker matches none |
| `voice.distinct` (judgement) | listed every run: apply the swap test |
