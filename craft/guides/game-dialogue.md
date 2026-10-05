---
family: game-dialogue
title: Game dialogue
forms: [quest-dialog, barks, conversation]
reviewed: "2026-10-03"
sources: [short-conversation-design, freed-branching-1, freed-branching-2, freed-branching-3, inkle-writing-with-ink,
  short-beyond-branching, short-dynamic-dialogue-2012, yarn-saliency, hamilton-enemy-barks, slabinski-8-principles,
  green-sasko-quest-design, rennick-roberts-2021, pingatore-fallout4-voice, gag-subtitles, xag-104,
  szarkowska-two-or-three-lines, igda-locsig, short-bowls-of-oatmeal, padmakumar-diversity, sela-distinctiveness]
---
# Game dialogue: a craft reference

Read the section you need, not the whole guide: `prose guide game-dialogue --section <name>`.
How the text is marked: a number in brackets, such as [3], points to the Sources list at the end.
"Convention:" marks a habit of the trade that no source tested. "Maintainer judgement:" marks advice
with no source behind it. "Measured here:" marks a number from one project audited with this plugin;
it shows that a problem happens, not how often.

## What it is and who reads or hears it

Game dialogue is text the player meets while doing something else. Three forms share this guide.

- **Quest dialogue** (`quest-dialog`) gives the player a job, checks on it and closes it: an offer, a
  hint, a turn-in, a refusal. It is read once or twice, usually by someone who wants to know what to
  do next.
- **Conversation** (`conversation`) is a longer exchange the player steers with replies: a hub of
  topics, a negotiation, a confession. It is the form where structure matters most.
- **Barks** (`barks`) are short lines a character says unprompted in reaction to the game: "Grenade!",
  "Rain again.", "Not on my watch." They are heard the most and noticed the least, until they repeat.

One line has up to four readers, and each wants something different.

1. **The player** wants the point quickly and a character who sounds like a person. Maintainer
   judgement: assume the player is in the middle of something.
2. **The voice actor and director** need lines that can be spoken, in an order they can record. Freed
   notes that voiced lines must be written differently from text: a monologue that works on the page
   can turn "implausible and dull when spoken" [3].
3. **The translator** needs context for every line and room in the box [17].
4. **The engine and the tools** need a graph that cannot get stuck: every node reachable, every path
   ended, every state handled.

Two ideas run through the whole guide.

- **Dialogue is partly procedure.** Emily Short puts it this way: the craft "is only partly about
  choosing the right words. It's also about choosing the right procedures" [1]. What happens when a
  topic is asked twice, who changes the subject, and which line is chosen from a pool decide how the
  writing feels as much as the words do.
- **Game dialogue is feedback as well as speech.** A creative director's column, quoted in a
magazine article, argues that game dialogue, unlike film dialogue, indicates that "a game state has
changed" [9]. A bark that
  tells the player a guard has lost them is doing the job of a status display.

Most sources here are working writers describing their own practice, plus accessibility guidelines and
one peer-reviewed argument. None measures what a writer's choices do to players, so treat the advice as
informed craft opinion.

## Anatomy and conventions

### Quest dialogue: states and tiers

Convention: a quest conversation has to hand over a small set of facts, in the order a player needs
them. For every quest state, the player should leave knowing who wants what, what to do, where to go
and what happens next.

| State | The line has to do | The player should leave knowing |
|---|---|---|
| Not started | Offer | The problem, the task, the stake (reward or consequence) |
| Offered, refused | Re-offer | That the NPC remembers the refusal |
| Active, not done | Hint | Where to go next, in the character's words |
| Active, done | Turn-in | That the work was seen and what it changed |
| Complete | After | That the world kept moving |
| Failed or abandoned | Recovery | That there is a way back in, or a cost |

Maintainer judgement: build every quest conversation from this table, and give every state a path in
and an unconditional fallback so the NPC always has something to say. The `dialog.graph.exit` and
`dialog.choices.fallback` rules check the second half of that.

One game project audited with this plugin sorted topics into three tiers in a fixed order: the active
story quest, other quests, general information. Measured here: some "story" rungs in that audit could
never be reached by any game state. Convention: compute the tier from quest state instead of placing it by
hand, and treat an unreachable tier as a bug.

What the quest line says, and what it leaves out, matters more than its length. A CD Projekt quest
director, as reported by a journalist, advises delivering important information "in focused, isolated
moments", putting lesser talk during other actions such as walking to a place, and cutting the
conversations where several characters recap events, "sometimes to superior creative effect" [11].
Slabinski's example, invented for his post, cuts a 62-word wolf-quest request to 20 words that still
give the task and the reward [10]. Maintainer judgement: if you delete a sentence and the player can
still do the job, the sentence was not part of the offer.

### Structure of a conversation

Freed names two foundations [3].

- **Hub and spoke.** The player picks a topic at a hub, hears that branch, and returns to the hub. At
  best it makes the player feel "clever and in charge"; at worst it turns NPCs into "information
  vending machines" where the player feels obliged to press every button [3].
- **Waterfall.** The player never goes back, and a choice not taken is gone. It reads like a good linear
  scene on every path, but the writer must make sure every path carries the information the player
  needs, because it is "easy to accidentally 'bury' key topics" under choices that may not be taken [3].

Freed advises one structure used consistently: a blend adds game-like seams, more noticeable with
voice-over [3]. That is opinion from experience, not a finding.

**Start from the critical path.** The critical path is what every player sees. Freed advises knowing
it, at least in outline, before building the rest, and treating it as the core all branches return to.
Writing "organically" and checking coverage afterward "will make life far more difficult" [4]. Each
branch also costs: "every time you branch you're writing for a smaller segment of your Player base",
so a long side branch should earn its place [4].

**What to do with a used topic.** Short lists four options and their costs [1].

1. Remove the used topic. This is a problem if it carried vital information, unless the game journals
   it.
2. Leave it in place. She calls this "stiff and unrealistic".
3. Write repetition variants. This can double the writing and the recording.
4. Remove it and offer a consolidated "remind me" topic. This needs a summary that may not suit
   recorded voice.

She notes that easy recall matters most where NPCs dispense information and quests, and unrepetitive
dialogue matters most where relationships carry the story [1]. Rennick and Roberts make the same point
from conversation analysis: a hub that offers the same options on every visit, answered as if for the
first time, shows "apparently infinite patience" that a real speaker would not have [12]. Their paper is
an argument from the literature and says outright that which fix players prefer is "an empirical
question".

The ink language shows what a tool can enforce. Choices there are once-only by default, so options
vanish in a loop until the flow runs out, and the fix is a fallback choice that is never shown and is
taken when nothing else is available [5]. In lint terms: a loop of once-only topics needs an exit, which
is `dialog.graph.exit`.

**Who has the initiative.** Short warns that "a 1:1 ratio of comment and response makes for an exchange
that feels a bit mechanical", and that characters show character in how they steer: a pushy NPC nags about
one topic, a flighty one changes the subject, a reticent one volunteers little [1]. Maintainer judgement:
in a hub, let the NPC close a thread now and then instead of always asking "Anything else?".

**State-aware lines.** Use a `condition` on a choice to decide whether a topic exists (no turn-in before
the player has the item). Use `variants` to reword a node the player can hear again (the second greeting,
the third refusal). Convention: variants rotate and do not know why they were chosen; if a line must
change because of something the player did, put it behind a condition on a different node.

### Replies, player voice and menu-speak

The player's replies are where the writing is easiest to get wrong, because two things have to be true
at once: the player must know what the option does, and the character must still sound like someone.

**Show enough to predict the line.** Freed lists the choices: full lines, symbols, paraphrases, or
layers of them. Short labels are quick to read, but a player who cannot tell what a symbol means "may
find it time-consuming (and frustrating!) to guess at the writer's intent" [3]. Full lines avoid
surprises but remove the pleasure of hearing the character say it a little differently. One player's
complaint about a paraphrased four-option wheel is the failure case: the sarcastic option "rarely
conveyed what I was thinking" [13]. That is a single opinion, but it matches Freed's warning.
Convention: the text of an option should predict the spoken line closely enough that the player is not
surprised in a way they would object to.

**Put tone in a stable place.** Freed recommends putting the same attitude in the same position each
time, and Rennick and Roberts describe wheel layouts that map positions to a kind of response, so players
know the flavour in advance [3][12]. Maintainer judgement: if the format carries a tone label, keep the
order of tones the same at every choice.

**Voice-over changes the choice.** Freed says literal menu lines "play poorly with Player voiceover":
the player has already read the line in the character's voice, so hearing it again adds little [3].
Maintainer judgement: if the game is voiced, paraphrase; if it is text, write the line the player will say.

**How many replies.** Freed: "Most dialogue-heavy games tend to go with 3-4 options for most Player
choices"; two feels limiting, more than four slows the player, and the count should be consistent so a
player trained on four does not rebel at two [3]. This is one practitioner's observation about
role-playing games, not a limit. Maintainer judgement: for a small project, two or three replies per
choice is usually enough, and every reply must lead somewhere different or say something different.

**Forced player lines.** Filler such as "Keep going." keeps an exchange moving and spares the player a
dozen unimportant choices, but every forced line risks leaving the player feeling distant from the
character [3]. Maintainer judgement: keep forced lines to agreement and continuation, never a decision
the player did not make.

**A defined protagonist has a narrower range.** One player argues that a single actor cannot swing from a
heartfelt line to a sadistic one, so a voiced protagonist gets fewer kinds of reply [13]; Freed lists a
fixed player character with a fixed arc as a poor fit for open branching [2]. The quest director quoted
above advises offering choices both the player and the character would expect, with the stakes set up
first [11].

**Menu-speak.** A flat line that reads like interface copy is menu-speak: "Ask about the lighthouse.",
"Accept quest.", "I have a question." The player did not say any of those things; the game did.
Convention: write a reply as the character would say it, and keep the label a short form of the same
words. Write the spoken line first and derive the label, so the two cannot drift apart [13]. Measured
here: flat menu-copy lines were among the problems found in one project audit.

### Barks

A bark has a trigger (what the game saw), a speaker (who says it) and a line (what they say). A bark pool
holds the lines for one trigger, so the same trigger does not always produce the same words.

**One fact per bark.** A writer on several Ubisoft games says "each bark should convey
one piece of information – 'We're flanking' or 'Grenade' or 'I've been hit'", because packing in more
means writing variants of each part, which "gets really awkward – and really long – really fast" [9].
Another writer disagrees in degree: a good bark can carry several things at once, such as what the enemy
is doing, that he has lost the player and that he is afraid [10]. These two are not far apart: one is a
situation seen from three sides, the other is a stack of separate facts. Maintainer judgement: one
situation, one message.

**Clear before clever.** A lead designer on a stealth game says being too clever "can actually make the
barks less useful", because it makes them vague or makes them "stand out in a weird, obtrusive way" [9].
The same article warns that the cartoony register ("I'm coming for you!") gets out of hand in a deep pool,
and that the last variants are the worst because the good lines are gone [9]. Convention: write the plain
version first, then vary the wording, not the information.

**Specific, then general.** Short's review of Valve's dynamic-dialogue talk describes the rule: the system
"applies the most specific one it can find, using less-specific ones as fall-backs" [7]. Her own example
writes broad default lines first and adds more specific ones for particular situations, so "you're never
committed to having uniform coverage for every possible situation" [6]. Yarn Spinner makes specificity a
number and picks the best-matching line that was heard least recently [8]. In a data file with one pool
per trigger, the same idea means: order lines from the most specific context to the general one, and end
each speaker's set with a line that is always true.

**Tie barks to state.** Short, writing about generated text in general, argues that it is "purely
decorative unless it is tightly correlated with gameplay", and that players "start looking past it" [18].
Maintainer judgement: the same holds for bark pools, and at least half of a pool should react to something the game knows (time, quest stage, what the player just did),
not only to where the player stands.

**Cooldowns and frequency.** One writer says a bark's effect depends on "how often they're said": the
more often a trigger fires, the faster the pool cycles, so a line fine for a couple of hearings becomes
memorable when it plays a dozen times in a level [9]. The same article describes more than 130 distinct
lines containing one character name in a stealth game, and the writer's reply, that "You just heard the
ones that did have it a lot" [9]. No source gives a cooldown or a pool size. Maintainer judgement: a
trigger that can fire every few seconds needs a deep pool and a cooldown; a line heard once per quest can
live in a pool of two. The lint rule `dialog.barks.variety` only requires more than one line and no
near-repeats.

### Subtitle and box limits

The two accessibility sources agree on the baseline: no more than 40 characters per line and two lines per
subtitle, with a third only in exceptional cases [14][15]. The platform guideline adds that long lines are
harder to read "especially when the dialogue is fast", and that line breaks should be entered by hand "to
ensure that breaks occur at editorially sensible points" [15]. A localization guide from 2012 takes the
opposite position, preferring automatic wrapping because hand breaks cause overflow bugs and
translation work [17]. The two serve different goals (one language read well, or many languages kept
safe), so pick one policy per project.

A peer-reviewed eye-tracking study of film subtitles at 40 characters per line found that three-line
subtitles raised cognitive load, comprehension did not change, and viewers preferred two lines [16]. It
used two short clips, says its findings need replication, and film is not a game.

**Why the limit is 40 by 2 here.** The `quest-dialog`, `barks` and `conversation` forms use that box by
default because the two accessibility sources agree on it. If your game's box differs, set
`boxChars` and `boxLines` per form in `.agent-prose/project.json`; lint then measures against the real
box.

**Room for translation.** The localization guide says to size boxes for translations 30 to 40 percent
longer than English [17]; by arithmetic a 40-character line grows to about 52 to 56. Convention: do not
write English to the edge of the box if the game will be translated.

## Length and timing

**Per line.** Keep each line inside the box: 40 characters by 2 lines unless your project says otherwise.
Arithmetic: 80 characters is about 14 words at ordinary word lengths, so a full box is about 5 to 6
seconds of speech at the plugin's planning rate of 150 words per minute. That rate is this plugin's
choice, not a source's. Real actors and real players differ, and the rate can be set per project.

**Players read faster than actors speak.** Freed notes that a typical player reads much faster than a
voice actor speaks, so voiced conversations must give the player a reason to sit through the audio [3].
Maintainer judgement: if the game voices a line the player has already read, cut the line or cut the voice.

**Per kind of line.** One box does not fit every surface. A project audited with this plugin capped a
story beat at 150 characters, a bubble at 96, a menu label at 30, a reply label at 22 and a headline at
24. Measured here: those are that project's own limits, tuned to its screens, and none comes from a
source. The plugin checks one box per form, so keep per-kind limits in your own contract and test them
there.

**Quest lines and conversations.** No source gives a limit for either. Slabinski's offer runs 20 words [10].
Maintainer judgement: if an offer needs more than two boxes, split it across two nodes. Each branch of a
conversation serves fewer players than the one before it [4]; if you cannot say what the player learns or
decides in a branch, cut it.

**Barks.** No source gives a length. Maintainer judgement: most barks should fit one 40-character line,
because they are heard in the middle of action, and the pool should be sized by how often its trigger can fire, not by how many lines the writer
enjoyed. `prose measure` also reports the recorded minutes of a file at the form's rate; it is an estimate.

## What good looks like

The examples are written for this guide. Each YAML file passes `prose lint` with no errors or warnings.

### A quest conversation that covers its states

The conversation opens in any quest state. The conditions choose the topic, "Never mind" is the
unconditional way out, and the offer is split so each line fits one box.

```yaml
form: quest-dialog
start: entry
nodes:
  - id: entry
    speaker: IDA
    text: Ferry's not running. Ask me why.
    variants:
      - Still no ferry. Any news?
    choices:
      - text: Why isn't it running?
        to: offer
        condition: quest == none
      - text: I have your rudder pin.
        to: turn_in
        condition: quest == active && has_pin
      - text: Where could I find a pin?
        to: hint
        condition: quest == active && !has_pin
      - text: How is the crossing?
        to: after
        condition: quest == done
      - text: Never mind.
        to: leave
  - id: offer
    speaker: IDA
    text: The rudder pin snapped mid-river.
    next: offer_task
  - id: offer_task
    speaker: IDA
    text: The smith at Dunmere has spares. Fetch one?
    choices:
      - text: I'll bring one back.
        to: accepted
      - text: Not today.
        to: refused
  - id: accepted
    speaker: IDA
    text: Dunmere is east, past the weir. Go.
    end: true
  - id: refused
    speaker: IDA
    text: The river will keep.
    variants:
      - Ferry's still dead, if you change your mind.
    end: true
  - id: hint
    speaker: IDA
    text: Dunmere, east past the weir. Ask for the smith.
    end: true
  - id: turn_in
    speaker: IDA
    text: That's the one. Hop aboard, the toll is mine.
    end: true
  - id: after
    speaker: IDA
    text: Busy. Folk crossing both ways again.
    end: true
  - id: leave
    speaker: IDA
    text: Mind the planks.
    end: true
```

What to notice. Every state has a way in. No line is longer than one box. The hint repeats the direction
in the character's words, not the quest log's. The refusal has a variant, so a player who says no twice
hears a different line (`dialog.revisit.variety`). Add a `comment` wherever a translator would not know
what a node is for.

### The same offer, written badly

<!-- not YAML on purpose: this is the failure case, and it would not lint clean -->

```text
IDA: Greetings, traveller. I am Ida, a ferrywoman in service to the Saltmarsh crossing. A calamity has
befallen my ferry: the rudder pin has snapped, and without it I cannot steer. There is a smith in the
town of Dunmere, which lies to the east beyond the weir, who may have a spare. If you bring me one, I
will reward you with the toll of passage. Will you accept this quest?
  [1] Accept quest.
  [2] Decline quest.
```

The offer is 71 words, in a register no ferrywoman has, and the replies are menu labels. Cut it to the
problem, the task and the stake, let the character speak, and make the replies things a person would
say. Slabinski's cut of a similar request from 62 to 20 words is the same operation [10].

### A conversation hub with a closed thread

The NPC closes a topic after it has been covered, and the hub leads to an ending even when no topic is
available. Used topics are removed by splitting the hub into nodes that lead on.

```yaml
form: conversation
start: hub
nodes:
  - id: hub
    speaker: TOBIN
    text: Lamp's lit. What do you want?
    variants:
      - You again. Make it quick.
    choices:
      - text: Who keeps the light?
        to: keeper
      - text: What's out on the water?
        to: water
      - text: Nothing. Goodnight.
        to: leave
  - id: keeper
    speaker: TOBIN
    text: Me. Thirty winters. Nobody else wants it.
    variants:
      - Me, as I said. Thirty winters.
    next: hub
  - id: water
    speaker: TOBIN
    text: Wrecks, mostly. Ask me nothing more.
    end: true
  - id: leave
    speaker: TOBIN
    text: Goodnight, then. Mind the stairs.
    end: true
```

What to notice. The `water` topic ends the conversation instead of returning: the NPC takes the
initiative, which keeps the hub from turning into a vending machine [1][3]. The hub has a variant
because the player can return to it.

### Barks that react to state

A pool holds the lines for one situation. The format has no per-line tag, so use one pool per context and
name the context. The last pool is the unconditional fallback.

```yaml
form: barks
barks:
  - pool: ferry-dead-idle
    speaker: IDA
    context: idle, quest == none
    cooldown: 20
    lines:
      - Can't steer her without the pin.
      - Another day of looking at the water.
      - Dunmere's smith would sort this in an hour.
  - pool: ferry-dead-sees-player-with-pin
    speaker: IDA
    context: player in range, has_pin
    lines:
      - Is that a pin in your hand?
      - That looks like the right size. Over here!
  - pool: ferry-running-idle
    speaker: IDA
    context: idle, quest == done
    cooldown: 20
    lines:
      - Both banks busy today.
      - Fine weather for the crossing.
      - Mind the planks, folks.
  - pool: ferry-fallback
    speaker: IDA
    context: always
    cooldown: 30
    lines:
      - Water's high.
      - Quiet out there.
```

What to notice. Each line reports one thing. Each pool answers a game fact (no pin, has pin, done), and the
last pool answers none, so the selector always has a line. Two lines in a pool differ in what they say, not
in a word (`dialog.barks.variety`). The `cooldown` (a bare number in the format; read it as seconds) is
this author's choice; no source gives one.

A pool of near-copies fails the same test: "Quiet night on the wall." and "Quiet night on the wall
again." are one line twice. The rewrite changes the information (what the guard sees, wants or fears),
not the words, and `dialog.barks.variety` catches the overlap.

## Common failures and the habits behind them

Each failure below has a habit that produces it; fixing the habit prevents the next instance. The
habits are Maintainer judgement unless a source is cited.

### Recap and information dumps

Failure: the NPC states the plot, the world and the reward in one speech, and another NPC repeats it
later. Habit: writing to inform the reader instead of to be heard. Fix: put the facts the player needs in
one place, once, and let other characters react instead of restating [11]. Keep lore where the player can
skip it, such as an optional topic or a codex entry [10].

### Menu-speak

Failure: replies and NPC lines read like interface text ("Ask about X."). Habit: filling a menu from a
task list. Fix: write each reply as speech and keep the label a short form of it. See the replies section.

### The endlessly patient NPC

Failure: a hub that repeats the same topics with the same enthusiasm, however often the player asks.
Habit: designing for coverage, not for the character. Fix: the used-topic choices above, variants on
revisits, and an NPC who closes a thread now and then [1][12].

### One rule leaking into the whole cast

Failure: a style rule meant for one character, such as a robot that never uses contractions, spreads to
every voice that shares the same prompt or template. Measured here: in one project audit, the "no
contractions" rule written for the robot crew appeared in all twelve ambient speakers, including a child,
while the same project's human lines elsewhere ran 8 to 35 contractions per thousand words. Habit: putting
a character rule in a shared instruction instead of the character's own voice file. Fix: keep one voice
description per speaker, test with the swap test (could this line be said by anyone else?), and compare
contraction rates per speaker with `prose measure`. Distinctiveness between characters is measurable in
published drama [20], but no source gives a threshold for game lines.

### A catchphrase that takes over

Failure: one character uses the same word or opening in a large share of their lines. Measured here: one
character used a single word in 41 percent of its lines, and another opened with the same adverb in 14
percent. Habit: a character note that says "uses the word X" gets applied to every line. A published
case from a stealth game is the same problem at scale: more than 130 lines naming the protagonist, as
counted by the article's author; the game's writer replied that players heard only the few lines they
heard [9]. No source measures which view is right. Fix: count each speaker's first word and favourite
word, and keep a trait to a small share of lines. Maintainer judgement: a word in more than a few lines
in ten is the character's tic and no longer the character.

### Template reuse across speakers

Failure: several characters share one line frame with a word changed. Measured here: one project had a
"Lights low" frame in three speakers' pools, and one line verbatim in three files. Habit: copying a pool
to the next speaker. Fix: write each pool from the speaker's own voice and check for identical lines.

### A bark that fails in a context nobody thought of

Failure: a line that makes sense in the case the writer pictured and not in another case that triggers it.
A stealth-game designer reports a guard who said "Guess I'm just imagining things" when a light was
broken, and so said it while staring at the broken light [9]. Habit: writing a bark against its main
trigger only. Fix: list every game event that can fire the pool and read each line against each.

### Generated pools that all sound alike

Failure: a pool written in one pass by a language model has the same sentence shapes and the same favourite
words. A controlled study of essay writing found that writing with an instruction-tuned model lowered
lexical and content diversity across authors, while the writers' own text was unchanged [19]. It tested
essays, not barks, and I could check only its abstract, so applying it to pools is an inference. Fix: generate or write per speaker with their own voice
description, then run the repetition checks above on the pool as a whole.

## How to revise

Revise in this order. The earlier steps change what the player can do, and the later ones change how it
sounds, so fix the early ones first.

1. **Check the structure.** Run `prose lint <file>`. Fix every error. The errors are dangling targets and
   dead ends, which stop a game. Then read each warning: an unreachable node, no unconditional choice, a
   trapped loop. Fix it or say why it stays. The `dialog.*` rules are in the table below.
2. **Walk every state by hand.** For each quest state, start at the entry and follow every path to an
   ending. Check that the player can always leave, that vital information is on every path, and that each
   state has a way in. Lint cannot know which states your game can reach.
3. **Cut.** For each line, ask whether the player loses anything if it goes. Cut recaps and repeated
   facts; an offer gives the task, the place and the stake, once.
4. **Check the box.** `prose lint` flags lines that need more than two lines at the box width, and
   `prose measure <file>` lists the overflowing lines. If a line is long because it holds two messages,
   split it into two nodes.
5. **Check repetition.** For each speaker, list the first word and the most common content word of their
   lines and read the share. Look for lines shared between speakers and frames reused with a word swapped.
   `prose measure <file>` gives per-speaker features, so a leaked voice rule shows up as the wrong rate.
6. **Check each speaker's voice.** Read one speaker's lines in a row, then swap a line with another speaker's:
   if nobody would notice, the voice is missing. `prose voice fit <file> --speaker <name> --id <id>` writes a
   voice file from lines that already work; `prose lint` then checks later drafts against its ranges.
7. **Check each bark against its triggers.** For each pool, list the events that fire it. Read each line in
   each context, and add a line or a pool for any trigger that has none.
8. **Offer alternatives only where a choice is real.** If the owner is choosing between rewrites, make a set
   with `prose set new <file> --directions <list>` and use the review skill. If a line is wrong, record a
   strike with `prose strike` instead of editing by hand.
9. **Report numbers.** Say how many nodes and choices, how many pools and lines, which lines overflow the
   box, and the voice-over minutes. Do not write "every line fits" without the lint run to show it.

## Rules that apply

The table is generated from `craft/rules.json` for `quest-dialog`, `barks` and `conversation`. The
`dialog.*` rules check a dialogue file; the rest apply to its text as to any text. A threshold marked
"This plugin's choice" is not a source's figure. The checks measure structure and surface; whether a line
is funny, in character or worth hearing twice is for the writer and the owner.

<!-- generated:rules begin (npm run guides) -->
| Rule | What it checks | Severity | Threshold | Threshold basis | Run by |
|---|---|---|---|---|---|
| `readability.grade.report` | Reading grade is reported, never targeted. | info | none | n/a | lint |
| `style.passive.report` | Passive voice is counted and reported, not banned. | info | none | n/a | lint |
| `ai.copula-avoidance` | 'serves as', 'stands as', 'functions as' in place of is/are are flagged. | info | none | n/a | lint |
| `ai.artifact` | No leaked chatbot markup or unfilled placeholders. | error | none | n/a | lint |
| `draft.placeholders` | Bracketed placeholders are listed until filled. | info | none | n/a | lint |
| `ai.vocabulary` | Three or more distinct era-tagged AI vocabulary terms in one draft are flagged. | warn | 3 distinct terms | This plugin's choice (derived) | lint |
| `spoken.duration.report` | Spoken drafts report read-aloud time at the form's planning WPM. | info | none | n/a | lint |
| `dialog.graph.dangling` | Every choice target, next pointer and start names an existing, unique node. | error | none | n/a | lint |
| `dialog.graph.dead-end` | Every node offers choices, a next node, or ends explicitly. | error | none | n/a | lint |
| `dialog.graph.unreachable` | Every node is reachable from the start node. | warn | none | n/a | lint |
| `dialog.choices.fallback` | A choice set includes at least one unconditional choice. | warn | none | n/a | lint |
| `dialog.line.box` | Each line fits the form's text box (default 40 characters × 2 lines). | warn | the form's text box | A source's figure | lint |
| `dialog.barks.variety` | Bark pools have more than one line and no near-repeats (word overlap ≥ 0.6). | warn | 0.6 jaccard | This plugin's choice (derived) | lint |
| `length.target` | A draft with a declared target lands within ±10% of it; page-derived script minute targets use the provisional ±20% timing band. | warn | 0.1 fraction | This plugin's choice (derived) | lint |
| `dialog.revisit.variety` | A node the player can reach more than once has rotating variants. | warn | none | n/a | lint |
| `dialog.graph.exit` | From the start, an ending is reachable without depending on any condition. | warn | none | n/a | lint |
| `voice.targets` | Each voiced speaker's measured style stays inside the voice bible's target ranges. | warn | none | n/a | lint |
| `voice.bible-valid` | Every voice bible in the project loads: valid YAML and schema, id matching the file name, unique ids, and each speaker claimed by one bible. | error | none | n/a | lint |
| `voice.banned` | A speaker never uses a word their voice bible bans. | warn | none | n/a | lint |
| `voice.unvoiced` | In a project with voice bibles, every speaker resolves to one. | info | none | n/a | lint |
| `voice.distinct` | Swap test: no line could be given to another character without anyone noticing. | warn | none | n/a | judgement |
<!-- generated:rules end -->

## Sources

Numbers in brackets in the text refer to this list. Practitioner and journalism sources report their
authors' experience; they were not tested.

<!-- generated:sources begin (npm run guides) -->
1. Emily Short. [Analysis: Conversation Design in Games](https://www.gamedeveloper.com/game-platforms/analysis-conversation-design-in-games) (practitioner; id `short-conversation-design`). Hub-and-spoke repetition makes an implausibly patient NPC; repeat visits need variants or summaries.
2. Alexander Freed, 2014. [Branching Conversation Systems and the Working Writer, Part 1: Introduction](https://www.gamedeveloper.com/design/branching-conversation-systems-and-the-working-writer-part-1-introduction) (practitioner; id `freed-branching-1`). Defines the branching conversation; when it fits and when it does not.
3. Alexander Freed, 2014. [Branching Conversation Systems and the Working Writer, Part 2: Design Considerations](https://www.gamedeveloper.com/design/branching-conversation-systems-and-the-working-writer-part-2-design-considerations) (practitioner; id `freed-branching-2`). Hub versus waterfall, paraphrased or literal options, forced player lines, 3-4 options, voice-over.
4. Alexander Freed, 2014. [Branching Conversation Systems and the Working Writer, Part 3: Building a Conversation Tree](https://www.gamedeveloper.com/design/branching-conversation-systems-and-the-working-writer-part-3-building-a-conversation-tree) (practitioner; id `freed-branching-3`). Critical path first; link rather than copy; each branch serves fewer players.
5. inkle. [Writing with ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md) (platform-doc; id `inkle-writing-with-ink`). Loose ends are errors (ran out of content); choice sets need fallbacks.
6. Emily Short, 2016. [Beyond Branching: Quality-Based, Salience-Based, and Waypoint Narrative Structures](https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/) (practitioner; id `short-beyond-branching`). Salience systems need broad fallbacks; used content is down-weighted for variety.
7. Emily Short, 2012. [GDC 2012 Talk on Dynamic Dialogue](https://emshort.blog/2012/03/16/gdc-2012-talk-on-dynamic-dialogue/) (practitioner; id `short-dynamic-dialogue-2012`). A short review of Elan Ruskin's talk: the most specific matching line wins, less specific lines are fallbacks, exchanges can be interrupted.
8. Yarn Spinner. [Saliency](https://docs.yarnspinner.dev/write-yarn-scripts/advanced-scripting/saliency) (platform-doc; id `yarn-saliency`). Line groups pick the most specific match and prefer least-recently-viewed lines.
9. Kirk Hamilton (interviewing Richard Dansky, Chris Dahlen and Nels Anderson), 2012. [Why Video Game Characters Say Such Ridiculous Things](https://kotaku.com/why-video-game-characters-say-such-ridiculous-things-5921878) (practitioner; id `hamilton-enemy-barks`). Journalism with named bark writers: one fact per bark, frequency decides repetition, context breaks lines.
10. Mark Slabinski, 2013. [8 Key Principles of Writing Effective Game Dialogue](https://www.gamedeveloper.com/game-platforms/8-key-principles-of-writing-effective-game-dialogue) (practitioner; id `slabinski-8-principles`). Blog post: concision, character, forced lore, barks; the worked examples are invented for the post.
11. Holly Green (reporting Paweł Sasko's GDC 2023 talk), 2023. [Key takeaways from the quest design of Cyberpunk 2077 and The Witcher 3](https://www.gamedeveloper.com/marketing/10-key-takeaways-from-the-quest-design-of-cyberpunk-2077-and-the-witcher-3) (practitioner; id `green-sasko-quest-design`). A journalist's paraphrase: cut recap conversations, isolate important information, make consequences visible.
12. Stephanie Rennick and Seán Roberts, 2021. [Improving video game conversations with trope-informed design](https://gamestudies.org/2103/articles/rennick_roberts) (peer-reviewed; id `rennick-roberts-2021`). An argument from conversation analysis, not a player study: repeated lines, an endlessly patient NPC, turn timing.
13. Nicholas Pingatore, 2018. [Fallout 4: The Problem with Voiced Protagonists](https://www.gamedeveloper.com/design/fallout-4-the-problem-with-voiced-protagonists) (practitioner; id `pingatore-fallout4-voice`). A player's opinion on four paraphrased options and a voiced protagonist; its line counts are unverified.
14. Game Accessibility Guidelines. [If any subtitles/captions are used, present them in a clear, easy to read way](https://gameaccessibilityguidelines.com/if-any-subtitles-captions-are-used-present-them-in-a-clear-easy-to-read-way/) (style-guide; id `gag-subtitles`). At most 40 characters per line and 2 lines per subtitle.
15. Microsoft. [Xbox Accessibility Guideline 104: Subtitles and captions](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/104) (platform-doc; id `xag-104`). Avoid lines over 40 characters; at most 2 lines on screen; label speakers.
16. Agnieszka Szarkowska and Olivia Gerber-Morón, 2019. [Two or three lines: a mixed-methods study on subtitle processing and preferences](https://discovery.ucl.ac.uk/id/eprint/10054421/3/Szarkowska_Two%20or%20three%20lines_a%20mixed-methods%20study%20on%20subtitle%20processing%20and%20preferences_plain_FINAL.pdf) (peer-reviewed; id `szarkowska-two-or-three-lines`). Film subtitles at 40 characters per line: three lines raised cognitive load, comprehension did not change, viewers preferred two.
17. IGDA Localization SIG, 2012. [Best Practices for Game Localization (v22)](https://igda-website.s3.us-east-2.amazonaws.com/wp-content/uploads/2021/04/09142137/Best-Practices-for-Game-Localization-v22.pdf) (practitioner; id `igda-locsig`). Character style guides should be concrete: period, region, register and real samples.
18. Emily Short, 2016. [Bowls of Oatmeal and Text Generation](https://emshort.blog/2016/09/21/bowls-of-oatmeal-and-text-generation/) (practitioner; id `short-bowls-of-oatmeal`). Generated text is decorative unless tied to gameplay; players learn to look past it.
19. Padmakumar & He, 2024. [Does Writing with Language Models Reduce Content Diversity?](https://arxiv.org/abs/2309.05196) (peer-reviewed; id `padmakumar-diversity`). Writing with an instruction-tuned model lowered lexical diversity and repeated model-supplied phrases.
20. Šeļa, Eder et al., 2023. [From stage to page: language independent bootstrap measures of distinctiveness in fictional speech](https://arxiv.org/abs/2301.05659) (peer-reviewed; id `sela-distinctiveness`). Character voice distinctiveness is measurable; canonical playwrights' characters separate.
<!-- generated:sources end -->
