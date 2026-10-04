---
family: screen-stage
title: Screen and stage scripts
forms: [sitcom-multicam, sitcom-singlecam, tv-drama, stage-play]
reviewed: "2026-10-04"
sources: [final-draft-sitcom, wgf-primer-20, dg-formats, bbc-medium-format, nicholl-format,
  bbc-stage-formats, fountain-syntax, wgf-primer-1, bbc-three-camera, wgaw-comedy-rooms,
  wells-lassagne-2015, provine-1992, wgf-serialized-drama, espenson-book-of-acts, thompson-gurus,
  dg-templates, bbc-scenes, bbc-beginnings, bbc-dialogue, sela-distinctiveness, forabosco-2008,
  toplyn-workshop, august-desperate-punchlines, mcgraw-warren-2010, espenson-unfunny,
  jentzsch-kersting-2023, gorenz-schwarz-2024, follows-page-minute, august-long-scripts]
---
# Screen and stage scripts: a craft reference

Read the section you need, not the whole guide: `prose guide screen-stage --section <name>`. How the text is
marked: a number in brackets, such as [3], points to the Sources list at the end. "Convention:" marks a habit of
the trade that no source tested. "Maintainer judgement:" marks advice with no source behind it. "Measured here:"
marks a number from a run of this plugin on the guide's own examples; it shows that a problem happens, not how
often.

## What it is and who reads or hears it

A script is a plan for other people's work. Four forms share this guide, all written in Fountain plain text and
all timed by the page.

- **Multi-camera sitcom** (`sitcom-multicam`) is written for a stage with a live studio audience and several
  cameras. Its page looks unlike the others: description in capitals, dialogue double-spaced [1][2].
- **Single-camera comedy** (`sitcom-singlecam`) is shot like a film, with no live audience. Final Draft says the
  name is a misnomer, since such shows often use more than one camera [1].
- **Hour drama** (`tv-drama`) covers network, cable and streaming episodes, serialized or not. It uses the same
  basic layout as single-camera comedy and the feature screenplay [1].
- **Stage play** (`stage-play`) is a script for performance in a room, laid out so readers can approximate its
  running time from the page [3].

A script has several readers, and each wants something different.

1. **The reader of the spec** (executive, competition reader, showrunner) decides in the first pages whether to
   go on. The BBC says a correct format "makes an executive's life easier" [4]; an Academy guide says studio
   readers are said to skip long description and read only dialogue [5].
2. **The actor and director** turn the page into behaviour. They need what is said and done; they find the
   feeling.
3. **The audience,** who never see the page. A multi-cam audience is in the room, and the script must leave it
   room to laugh.

Two ideas run through the guide. First, a script describes what can be seen and heard; the BBC's stage format
says action must not stray into "novelistic" text about thoughts or backstory [6]. Second, page counts are
rough: everything here that turns pages into minutes is an estimate with wide error bars, and the sources
disagree on the numbers.

How far to trust the sources. Most are practitioners and institutions describing their own practice: Writers
Guild Foundation primers, a vendor blog, one broadcaster's pages, showrunners' blogs. The measured evidence is
thin: one 2,520-script study of feature films, one magazine joke count quoted second-hand, a few small
psychology experiments, two papers I could read only as abstracts. No source here covers how a multi-camera week
runs (table read, rehearsal, taping), writers' room practice beyond one mentor's column, rule of three,
callbacks, the number of sets, or how long a play runs, so those points are Maintainer judgement.

### Using the plugin

- Name the form on the Fountain title page (`Form: sitcom-multicam`) or pass `--form`, and declare a length
  (`Target: 3 pages`, `Target: 22 minutes`).
- `prose parse <file>` shows how each line was read: scene, action, line (dialogue), parenthetical, centered,
  transition, section, note. Use it when a line reads wrongly. `prose measure <file>` reports estimated pages,
  minutes and range, scene count, dialogue and action words, each scene's length and the longest speech;
  `script.runtime.report` prints the page and minute figures in lint.
- `prose lint <file>` runs the rules in the table at the end. They check format and length; `comedy.premise`,
  `comedy.serious-moments` and `voice.distinct` are judgement rules that lint only lists.
- The `prose-script` skill writes and checks the four forms; `prose-comedy` writes and punches up jokes. For
  rewrites the owner will choose between, use a variant set (`prose set new`): it checks that variants differ,
  not which is funnier.

## Anatomy and conventions

### Fountain and what the plugin reads

Fountain's golden rule is "make it look like a screenplay": the parser infers each element from the shape of a
line and the blank lines around it [7].

| Element | Write it as |
|---|---|
| Scene heading | `INT. KITCHEN - NIGHT` with blank lines around it; a leading `.` forces any line |
| Action, parenthetical | Plain paragraphs (`!` forces action); `(beat)` on its own line inside a speech |
| Character cue | A capitals line, blank line before, dialogue straight after; `@` forces mixed case |
| Transition, centered | A capitals line ending `TO:` or a leading `>`; `>COLD OPEN<` centers |
| Section, synopsis, note | `#`, `=` and double-bracket text never print; `/* */` is dropped; `===` breaks the page |

The spec warns of one ambiguity: an all-caps action line followed at once by another line parses as a cue and
dialogue unless it starts with `!` [7]. The plugin adds its own guard: a line is a cue only if it has five words
or fewer and does not end in `.`, `!`, `?`, `:`, `;` or `,`. So `THE DOOR SLAMS.` stays action, and `THE DOOR
SLAMS` above a line of dialogue becomes a cue. A blank line inside a speech or a note must hold two spaces.

Fountain has no syntax for show-specific layout: lettered scenes, per-scene character lists, bold `SFX:` lines,
CHYRON notes, flashback headings [2][8]. Write them as action or centered lines. Convention: centered lines
(`>COLD OPEN<`, `>END OF ACT ONE<`) for act markers, because `#` sections do not print, which
`script.unprinted-marker` reports.

### Multi-camera sitcom

**The page.** Final Draft calls multi-cam "the black sheep of format": description in capitals, character names
underlined on first appearance, entrances, exits and effects often underlined, dialogue double-spaced [1]. The
Writers Guild Foundation's list overlaps: capitals, double spacing, scenes lettered (SCENE B), the scene's
characters in brackets under each heading, sound effects in bold [2]. They agree on capitals and double spacing
and differ on underline against bold. Convention: capitals and double spacing are the signature, emphasis is
house style. The BBC's three-camera sample adds a teaser, lettered scenes inside acts, FADE OUT. and END OF ACT
at each act's end, each scene on a new page and a transition at every scene's end [9].

**Teaser, acts, tag.** Call Me Kat has a cold open of 4 to 4.5 pages and four acts of roughly 5 to 19 pages; its
first season had a cold open, three acts and a tag. Will & Grace has three acts [2][8]. The Foundation says its
ranges are "just a range" [2]. Maintainer judgement: open on the premise and end each act on a turn.

**Live-studio conventions.** The BBC asks that a script say whether it is for live studio recording, and that
sitcom episodes are always 30 minutes [4]; its taped-sitcom sample leaves wide margins for studio cues [9]. One
WGA West mentor says joke writers matter on show night, jumping in "on the fly" when a line fails before the
audience [10]. Maintainer judgement: write so a joke can be swapped without breaking its neighbours, and leave a
beat after the button for the laugh.

**Laughs and joke density.** Wells-Lassagne repeats a 2014 magazine count of jokes per minute for twelve shows.
The five highest are single-camera (30 Rock 7.44, New Girl 7.11, Parks and Recreation 6.97, The Office 6.65,
Brooklyn Nine-Nine 6.59); the three multi-camera shows are lower (Friends 6.06, The Big Bang Theory 5.80,
Frasier 4.09). She offers that "a laugh track automatically slows down the pace" and that a lower figure "does
not necessarily mean that it is less successful", since Friends and The Big Bang Theory had the biggest
audiences [11]. Read this as an illustration, not a finding: a magazine count with no counting rule I could see,
three multi-camera data points, and shows that differ in era and style too. A mentor says multi-cams "need to
have a certain number of hard jokes per page" and gives no number [10]; no source gives a target, so the plugin
sets none. In the one experiment on recorded laughter, most of 128 students laughed or smiled at the first
playback and by the tenth only 3 laughed; it used no jokes [12]. A footnote quotes a writer saying the Friends
producers preferred three storylines to the usual two [11]: one show, second-hand.

### Single-camera comedy

The layout is the screenplay's: mixed-case description, no doubled dialogue. Final Draft puts an episode at 22
to 32 pages, sometimes 35, for about 22 minutes after commercials [1]. Observed: The Wonder Years 26 to 31
pages, a cold open of 2 to 6 and three acts of 6 to 12; PEN15 31 pages, a cold open of 1 to 2, acts of 6 to 10
and a one-page tag [2][8]. The BBC separates the traditional sitcom from the more serial comedy series, often
shot on location [4]. With no audience in the room the joke can be a cut or a glance, and
`script.multicam.caps-action` does not apply.

### Hour drama: teaser, acts and act-outs

**Acts and act headings are different things.** Almost every TV show "is broken into acts, even if those acts
are not spelled out on the page", and a spec should carry act breaks only if the show it imitates does [13]. Of
ten shows in the Foundation's first primer, seven showed no acts; PEN15 had four, Will & Grace three and You six
[8].

**How many.** Espenson, in 2007, said most hours had moved to five acts, some to six, because networks want more
commercial breaks and a longer hook: "Look at how many times it turns, and number your acts accordingly" [14].
The Foundation, in 2021, says a serialized episode "typically includes four acts or four acts and a teaser",
four being the standard [13]. Different markets and years; neither measures prevalence, and Superman & Lois has
six [2]. The guide takes no side.

**Lengths and act-outs.** Early acts run longer: Superman & Lois goes from 9 to 13 pages in act one to 5 or 6 in
acts four and five; You's six acts run about 8 to 15 pages, the first longest; Espenson has seen first acts over
twenty pages and last acts of five or six, and calls the reverse "a bit strange" [2][8][14]. Acts end on "act
outs", turns that bring the viewer back after the break [13]; Espenson puts the main problem at the first
act-out and "all is lost" at the penultimate one [14].

**Serialized or procedural.** A serialized episode is "like a chapter in a book"; the Foundation describes a
pilot's four acts as an ordinary world ending in a catalyst, a new situation pursued, commitment to the series'
main task, and an ending that begins the series [13]. No source here describes procedural structure or A and B
stories. Maintainer judgement: in a procedural, put the case's turns in the act-outs and the character thread
between them; a second story earns its place when it meets the first at a turn and has its own want.

**Structure models.** Thompson, from ten films studied in detail and ninety timed by part, argues for four parts
of about half an hour against the three acts she attributes to Syd Field, and allows exceptions [15]. Features
are not episodes: use a model as a lens for a sagging middle, not a template.

### Stage play

**Layouts disagree.** The Dramatists Guild calls its formats "guidelines, not requirements", serving easy
reading and an approximate performance time: 12-point Courier, a character breakdown page after the title page,
clear page, act and scene citations, a 1.5-inch binding margin and 1 inch elsewhere, and "no right or wrong way"
to mark the end of a scene [3]. Its templates differ from each other and from the BBC's [16][6].

| Layout | Character name | Dialogue | Stage directions |
|---|---|---|---|
| Guild, modern | Capitals at page centre | Single-spaced from 1.5 inches | Centre to right margin |
| Guild, traditional | Capitals at page centre | Single-spaced from 1.5 inches | In parentheses, 3 inches in |
| Guild, general guide | Centred or at 3.5 inches | Double-spaced between speeches | Three indents in |
| BBC, UK | At the left margin | Starts on the same line | In capitals, set and events only |
| BBC, US | About mid-page | Directly beneath | In round brackets, mixed case |

The general guide is from a submission desk of unstated origin, and warns that screenwriting software defaults
are "not necessarily standard play format" [16]. The BBC pages were extracted without indents [6]. Several
layouts are accepted. Convention: pick one, keep it, and give each character one consistent name, which every
BBC format asks [6].

**What the plugin reads.** `stage-play` is Fountain: the cue goes on its own line above the dialogue, and a
direction is an action paragraph. A BBC-UK line with name and speech together reads as action, not dialogue;
round-bracket directions read as action unless they sit under a cue, where they read as a parenthetical. Force
headings with a dot (`.ACT ONE, SCENE ONE`). The plugin does not check a cast page, margins or type size. The
BBC wants stage action limited to the set and what happens on stage [6]. Maintainer judgement: leave blocking
beyond the necessary, tone of voice, design and lighting to the director, actors and designers; a cast list
before the first heading counts as action, toward pages.

**Running time.** The Guild says its format lets readers estimate run time and gives no ratio; no other stage
source here does [3][16]. The plugin plans a stage page at one minute, a placeholder its own form definition
calls a derived approximation, and counts a screenplay page, not a stage page. Maintainer judgement: time a play
by a reading with pauses and business, and treat one-act or full-length norms as the venue's rule.

### Scenes, dialogue and subtext

The BBC Writers pages are the only scene and dialogue sources here: advice, with no data.

**A scene is a change.** Where things are "just explained or related" there is no scene, only exposition;
something must happen, "however cataclysmic, or however tiny and subtle". Ask what the scene does to the
character, to later events, to the story's world and below the surface, and if neither its purpose in the story
nor in the drama or comedy can be stated, whether it is needed. Scenes should differ in purpose and feel [17].
The BBC advises opening with characters in action and making them "want something and pursue it" [18] but gives
no want-obstacle-turn model, and no source here says "enter late, leave early". Maintainer judgement: write down
what the point-of-view character wants, what is in the way and what has changed at the end; start as late as the
audience can follow and leave when the change has happened.

**Dialogue is not conversation.** The BBC says it is shaped and purposeful and includes "the space between the
words"; the commonest fault is "being 'on the nose' and being expositional", and if a line exists only to tell
the audience something, "think again" [19]. Subtext is what a line does that its words do not say: the
characters discuss the trailer and mean the sale.

**Voice.** Each character needs an individuated voice, not a mouthpiece. Show an accent once, then by specific
words, because phonetic spelling throughout "can be impossible to read" [19]. Voice distinctiveness can be
measured: a 2023 study proposes two measures over 3,301 characters from 2,324 works, which I read only as an
abstract, with no threshold [20]. `voice.distinct` is the swap test. No source here limits speech length; `prose
measure` reports the longest speech and its line as information.

**For the actor and the reader.** Maintainer judgement: write what an actor can play, an action, an obstacle, a
line, not what a character feels: "she folds the letter smaller and smaller", not "she is devastated". Describe
in the order a viewer would learn it, in short paragraphs; description "rarely goes over three lines" in Big
Mouth, Mindhunter and Succession [8], and the Academy guide calls manner-of-speech parentheticals "frowned upon
these days" [5].

### Comic craft: how jokes are built

**Premise first.** Nastaran Dibai, a sitcom writer answering a WGA West question, says you can go joke to joke,
"but the scenes will be naturally funnier if there's a comic premise to the scene" [10]. One mentor's view,
which she says depends on the room; it is behind `comedy.premise`.

**Setup, misdirection, punch.** Forabosco's review calls incongruity "a necessary, though not sufficient" part
of humour, and says that when it is completely resolved "no humor appreciation ensues", so some cognitive
tension must stay [21]. It reviews jokes and puns, not scripts. Maintainer judgement: the pattern comedy writers
use fits it. The setup builds a reading, the misdirection lets the audience commit to it, and the punch supplies
a second reading. Specifics beat generalities. Toplyn's workshop posts pair a news item with a twist built from
"topic handles" with many associations; every breakdown I read is cut off, so his method is not here [22].

**Where the funny word goes.** Convention: hard jokes end on the funniest word; no source here states it.
Espenson, quoted by John August, reports a showrunner who "told us not to put the funniest word at the end of
the line, but to make sure the line continued past it", wanting "casual, easy, 'thrown away' funny, not needy
rim-shot comedy" [23]. One unnamed showrunner, second-hand. Maintainer judgement: the button suits a studio
audience and the thrown-away line a quieter show. The cold open below uses the second.

**Why it is funny.** McGraw and Warren propose that humour needs a violation that is also benign, at once:
benign through another norm that permits it, weak commitment to the norm, or distance. Each route was tested in
a small study (36 to 80 people, campus samples, moral-violation scenarios) [24]. That says nothing directly
about wordplay, and no study here sets it against incongruity. Use both as questions: what norm does the line
break, and what makes it safe?

**Stop joking when the stakes peak.** Espenson: "when the going gets really serious, the joking should stop",
because jokes undercut emotion; a joker who suddenly stops is noticed, since "Playing it straight can be
mesmerizing". Three kinds can stay because they show pain: a coping joke that fails, bitter self-deprecation
while baring one's heart, and trying to make an angry person laugh. She says the list is incomplete [25]. That
fits the benign-violation account (the harm is too close), though no source says so. Runners, callbacks and the
rule of three have no source here; Maintainer judgement: plant early, pay once.

**Model-written jokes.** Asked for jokes without constraints, ChatGPT produced a result its authors summarise as
"Over 90% of 1008 generated jokes were the same 25 Jokes", in a paper I read only as an abstract [26]. A later
study with example jokes and explicit constraints found its jokes rated above most laypeople's and, for
headlines, not significantly different from The Onion's, with 20 tries per prompt against one per human and a
warning that "more ambiguous prompts" may do worse [27]. Prompt, judges and baseline differ, so they do not
contradict each other. Maintainer judgement: give a model the premise, the character and the facts the joke must
respect, ask for many options by different mechanisms, and select hard.

## Length and timing

**How the plugin counts.** It lays the script out in lines and divides by 55 per page. Description wraps at 60
characters, dialogue at 35, parentheticals at 25 (the plugin's own constants); a speech costs two lines for the
blank and the cue; a scene heading costs two. Notes, sections and synopses do not print and are not counted. In
`sitcom-multicam` dialogue lines count double, a heading costs three and every scene starts a new page. Minutes
are pages times a rate: 0.45 multi-cam, 0.92 single-cam and hour drama, 1.0 stage. The range is plus or minus 20
percent, and the rate cannot be set per project.

**Where the rates come from.** Follows matched 2,520 US feature screenplays to theatrical running times: the
average page was "about 55 seconds", only 18.2 percent of scripts fell within 5 percent of one page a minute,
and he proposed "give or take 20%" [28]. That is practitioner data, not peer-reviewed, and it is about films:
comedies ran 52 seconds a page, short scripts ran long and long scripts short. Applying it to episodes is an
extrapolation. August says the rule "barely works in aggregate but isn't very predictive for any given project",
that page caps push writers into "tiny edits with the goal of moving page breaks", and that the script
supervisor's scene-by-scene timing is better [29].

**Multi-cam page counts conflict.** Final Draft puts a roughly 22-minute multi-cam episode at 52 to 58 pages
[1]; the Foundation's observed scripts run shorter, Will & Grace 40 and Call Me Kat 42 to 45 [8][2]. Neither
tests why. The plugin's 0.45 minute per page is derived from the 40 to 58 span, so treat a multi-cam estimate as
a planning figure. The BBC says a single TV drama runs 60 to 90 minutes [4]. Observed scripts run from 28 pages
(Shrill) to 75 (The Marvelous Mrs. Maisel, said to run long because of "rapid-fire dialogue"), with no runtimes
given, and from 6 to 10 scenes (Will & Grace) to 84 (The Crown) [8].

**Targets.** Lint compares `Target: 3 pages` with measured pages and `Target: 22 minutes` with estimated
minutes, and warns outside plus or minus 10 percent, this plugin's own tolerance (`length.target`). That is
narrower than the estimate's own 20 percent, so a miss is a prompt to check, not a failure. Measured here: a
centered marker such as `>COLD OPEN<` above the first scene heading adds a whole page to the multi-cam estimate,
because the heading starts a new page; the cold open below measures 0.76 pages without the marker and 1.76 with
it. Subtract a page, or read `scenesDetail` in `prose measure`, which leaves it out. Maintainer judgement: for a
hard length, read the script aloud with pauses for business and laughs.

## What good looks like

The examples are written for this guide. Each lints with no errors or warnings under `prose lint`, with the form
on its title page, except those marked as failures, whose counts are shown.

### Dialogue with something under it

The failure says what each character feels. Measured here: lint reports 0 warnings on it, since nothing in the
plugin checks for this. The rewrite has the same quarrel and talks about a boat slip.

<!-- bad example: expect 0 warnings -->

```fountain
Form: tv-drama

INT. HARBOUR OFFICE - DAY

MARA, 40s, stands at the counter. Her brother OWEN, 30s, files papers behind it.

MARA
You sold Dad's boat without asking me, and I feel hurt and betrayed.

OWEN
I sold it because I was scared of the debt, and I feel you look down on me.
```

```fountain
Form: tv-drama

INT. HARBOUR OFFICE - DAY

MARA, 40s, reads the slip list pinned by the counter. Her brother OWEN, 30s, files papers and does not look up.

MARA
Slip fourteen's empty.

Owen squares a stack of forms against the desk. Squares it again.

OWEN
Somebody wanted it. Cash.

MARA
Dad would've held out.

OWEN
Dad held out for eleven years.

Mara unpins the slip list and tucks it into his shirt pocket.
```

Nobody names a feeling; each line has a surface subject (the slip, the cash) and a real one (the sale, the
years), and the action is what a camera sees [19].

### A joke with a setup and a misdirection

The failure announces the joke and explains it. Measured here: it draws 1 warning from
`script.multicam.caps-action`, since its description is not in capitals.

<!-- bad example: expect 1 warnings -->

```fountain
Form: sitcom-multicam

INT. PRIYA AND DEV'S KITCHEN - NIGHT

Priya checks her watch. Dev stands over a pot.

PRIYA
My boss is here in ten minutes. Did you make the curry?

DEV
I did not make it. I bought it and I'll say I made it, which is lying, and that is funny.
```

The rewrite is a cold open. The premise (Dev is pretending to have cooked) is in the first exchange, every joke
grows from it, the misdirection is "the part before the stirring", and the last line calls back to it.

```fountain
Form: sitcom-multicam

>COLD OPEN<

INT. PRIYA AND DEV'S KITCHEN - NIGHT

(PRIYA, DEV)

PRIYA CHECKS HER WATCH. DEV GUARDS A STEAMING POT. A TAKEOUT BAG STICKS OUT OF THE RECYCLING BIN.

PRIYA
My boss is here in ten minutes. Is the curry done?

DEV
Done. I've stirred it a lot.

PRIYA
And the part before the stirring?

DEV
That part was quick. A man on a scooter did most of it.

THE DOORBELL RINGS. DEV DROPS THE BAG IN THE OVEN. PRIYA OPENS THE DOOR. MR. ALBRECHT, 60S, HOLDS A GOLDEN LOTUS BAG OF HIS OWN. SMOKE CURLS OUT OF THE OVEN.

ALBRECHT
Dessert. Something's burning.

DEV
That's the part I did.

>END OF COLD OPEN<
```

What to notice. "A man on a scooter" lands mid-line and the line goes on, the thrown-away placement [23]. The
scene stays inside its premise [10], and the short lines leave room to laugh. Measured here: it runs 0.76 pages
(1.76 with the marker) and plans at 0.34 minute, well short of the 4 to 4.5 pages observed for Call Me Kat, so
it is a shape to copy and not a length [2].

### A scene entered late

The failure arrives, greets and sits before the point. The rewrite starts at the point. Lint reports 0 warnings
on both; the advice is Maintainer judgement, in the spirit of the BBC's test that a scene must change something
[17].

<!-- bad example: expect 0 warnings -->

```fountain
Form: sitcom-singlecam

INT. LAW OFFICE - DAY

RUTH, 60s, comes in from the rain, shakes out her umbrella and greets the RECEPTIONIST. After a minute KELLER, 50s, comes out and shakes her hand.

KELLER
Ruth. Good to see you. So, you wanted to talk about Frank's will.

RUTH
I did.
```

```fountain
Form: sitcom-singlecam

INT. LAW OFFICE - DAY

Rain on the window. KELLER, 50s, turns a page of the will to face RUTH, 60s, who has not taken off her coat.

RUTH
Read that line again.

KELLER
"To my sister Ruth, the contents of the garage."

RUTH
He signed this before or after he came to dinner?

Keller checks the date and says nothing for a moment too long.
```

The coat still on says she did not come to stay, and something changes: Ruth learns a thing and suspects why.

### A stage direction that tells feelings and one that shows action

Lint reports 0 warnings on both. The first asks the actor to play an emotion and a memory. The second gives what
can be seen, and the feeling is in how it is played.

<!-- bad example: expect 0 warnings -->

```fountain
Form: stage-play

.ACT ONE, SCENE ONE

A KITCHEN. EVENING. GRETA, 50s, stands at the stove, overwhelmed by sadness and shame, trying not to cry because her sister has never forgiven her.

GRETA
(sadly, remembering their mother)
I made tea.
```

```fountain
Form: stage-play

.ACT ONE, SCENE ONE

A KITCHEN. EVENING. Two cups on the table, one chipped. GRETA, 50s, lifts the kettle, finds it empty and sets it down.

GRETA
I made tea.

NELL, 50s, sits with her coat on and turns the chipped cup so the chip faces Greta.

NELL
Thanks.

Neither of them drinks.
```

"Neither of them drinks" is playable; "sadly, remembering their mother" cannot be played without guessing [6].

## Common failures and the habits behind them

Each failure below has a habit that produces it; fixing the habit prevents the next instance. The habits are
Maintainer judgement unless a source is cited.

### Characters say what they feel, or the scene explains

Failure: a speech states the feeling or backstory; nothing changes between the first and last line; or any line
could move to another character. Habit: writing the idea of the scene as dialogue, and starting where the notes
start. Fix: give each character something to want and something in the way, put the information in an action or
an argument about something else [19], ask the four BBC scene questions [17], and apply the swap test.

### Jokes that announce themselves, repeat or joke through the climax

Failure: the joke is explained, or the same angle is run three ways; or a hurt character trades quips and the
scene deflates. Habit: writing joke to joke, and keeping the register of the rest of the script. Fix: state the
scene's comic premise in one sentence, drop jokes that could sit in any scene [10], ask a model for options by
different mechanisms [26], and at the peak either stop or use one of Espenson's three pain-showing kinds [25].

### Formatting for the wrong mode

Failure: multi-cam description in lower case (`script.multicam.caps-action`); act markers written as `#`
headings that do not print (`script.unprinted-marker`); an all-caps action line read as a character; act
headings in a script for a show that has none [7][13]; a `[[` note left open, which turns note text into script
text and inflates every count (`script.unclosed-note`). Habit: copying the last script's layout. Fix: pick the
form first, run `prose lint`, and `prose parse` any line that reads strangely.

### Long description and unplayable directions

Failure: paragraphs readers skip, directions about thoughts and backstory, or a runtime promised from pages.
Habit: writing the novel's version, and treating a page as a minute. Fix: one to three lines of what can be seen
or heard [8][5][6], and the range, said to be an estimate [29][28].

## How to revise

Revise in this order. The earlier steps change what the story does, and the later ones change how it reads.

1. **Name the form, the target and the reader.** Set `Form:` and `Target:`.
2. **Run `prose lint <file>`.** Fix every error and warning, or say why one stays, and read the judgement rules
   it lists.
3. **Check each scene's change.** Write one sentence for what changes. If you cannot, cut the scene or move its
   one useful line [17]. Then enter late and leave early (Maintainer judgement).
4. **Check the subtext.** Mark every line that names a feeling or recites known facts; rewrite it as an action,
   an argument about something else, or silence [19].
5. **Check the jokes.** State the comic premise. List each joke's mechanism; if two share one, drop the weaker.
   Stop jokes where the stakes peak. For options, write a variant set and let the owner pick.
6. **Swap test.** Move a line to another character. If nobody would notice, rewrite it from that character's
   wants and words [20]. Trim description and directions to what can be seen or heard [8].
7. **Measure and report.** `prose measure <file>` gives pages, minutes, range and the longest speech. Say the
   range, the scenes, which rules ran, and that the runtime is an estimate; for a stage script, read it aloud
   and time it. Do not claim a runtime you did not measure.

## Rules that apply

The table is generated from `craft/rules.json` for `sitcom-multicam`, `sitcom-singlecam`, `tv-drama` and
`stage-play`. A threshold marked "This plugin's choice" is not a source's figure. The checks measure format and
length; whether a scene changes anything, a line carries subtext or a joke works is for the writer and the
owner.

<!-- generated:rules begin (npm run guides) -->
| Rule | What it checks | Severity | Threshold | Threshold basis | Run by |
|---|---|---|---|---|---|
| `readability.grade.report` | Reading grade is reported, never targeted. | info | none | n/a | lint |
| `style.passive.report` | Passive voice is counted and reported, not banned. | info | none | n/a | lint |
| `ai.copula-avoidance` | 'serves as', 'stands as', 'functions as' in place of is/are are flagged. | info | none | n/a | lint |
| `ai.artifact` | No leaked chatbot markup or unfilled placeholders. | error | none | n/a | lint |
| `draft.placeholders` | Bracketed placeholders are listed until filled. | info | none | n/a | lint |
| `ai.vocabulary` | Three or more distinct era-tagged AI vocabulary terms in one draft are flagged. | warn | 3 distinct terms | This plugin's choice (derived) | lint |
| `script.runtime.report` | Scripts report estimated pages and runtime with a ±20% band. | info | none | n/a | lint |
| `script.unclosed-note` | Every Fountain double-bracket note ([[ … ]]) is closed with ]]. | warn | none | n/a | lint |
| `comedy.serious-moments` | Stop joking when a scene turns genuinely serious; a joke that stays should keep the pain visible. | warn | none | n/a | judgement |
| `comedy.premise` | Jokes grow from the scene's comic premise. | warn | none | n/a | judgement |
| `length.target` | A draft with a declared target lands within ±10% of it. | warn | 0.1 fraction | This plugin's choice (derived) | lint |
| `script.multicam.caps-action` | Multi-cam action and description are written in ALL CAPS. | warn | none | n/a | lint |
| `script.unprinted-marker` | Act markers (COLD OPEN, ACT, TAG, END OF ...) are centered >text<, not # sections. | info | none | n/a | lint |
| `voice.targets` | Each voiced speaker's measured style stays inside the voice bible's target ranges. | warn | none | n/a | lint |
| `voice.bible-valid` | Every voice bible in the project loads: valid YAML and schema, id matching the file name, unique ids, and each speaker claimed by one bible. | error | none | n/a | lint |
| `voice.banned` | A speaker never uses a word their voice bible bans. | warn | none | n/a | lint |
| `voice.unvoiced` | In a project with voice bibles, every speaker resolves to one. | info | none | n/a | lint |
| `voice.distinct` | Swap test: no line could be given to another character without anyone noticing. | warn | none | n/a | judgement |
<!-- generated:rules end -->

## Sources

Numbers in brackets in the text refer to this list. Practitioner and journalism sources report their authors'
experience; they were not tested.

<!-- generated:sources begin (npm run guides) -->
1. Final Draft. [Single-Camera vs. Multi-Camera TV Sitcom Scripts: What's the Difference](https://www.finaldraft.com/blog/differences-single-camera-multi-camera-tv-pilot-scripts) (platform-doc; id `final-draft-sitcom`). Single-cam 22-32 pages, multi-cam 52-58 pages for ~22 minutes; multi-cam double-spaces dialogue.
2. Writers Guild Foundation, 2022. [Formatting Your Spec Script, a Primer: Part 20](https://www.wgfoundation.org/blog/2022/3/24/formatting-your-spec-script-a-primer-part-20) (practitioner; id `wgf-primer-20`). Multi-cam: description in ALL CAPS, dialogue double-spaced, lettered scenes, character list under headings.
3. Dramatists Guild of America. [Free downloadable script formats for plays and musicals](https://www.dramatistsguild.com/script-formats) (style-guide; id `dg-formats`). Formats are guidelines, not requirements; 12-point Courier; character page; no right way to end a scene; no pages-per-minute figure.
4. BBC Writers. [Medium and Format](https://www.bbc.co.uk/writers/resources/medium-and-format) (style-guide; id `bbc-medium-format`). One broadcaster's submission norms: sitcom episodes are 30 minutes, say whether a script is for live studio recording.
5. Greg Beal (Academy of Motion Picture Arts and Sciences), 2014. [Screenplay format guide for the Nicholl Fellowships](https://www.oscars.org/sites/oscars/files/scriptsample.pdf) (style-guide; id `nicholl-format`). Feature layout; short description paragraphs; manner-of-speech parentheticals frowned upon; no absolute standard format.
6. BBC Writers (Matt Carless). [Sample script formats: stage, UK and US](https://www.bbc.co.uk/writers/documents/stage.pdf) (style-guide; id `bbc-stage-formats`). UK and US stage layouts (the US one is stageus.pdf); stage action limited to set and events, never character thoughts or backstory.
7. Fountain, 2014. [Fountain 1.1 Syntax](https://fountain.io/syntax) (standard; id `fountain-syntax`). Notes sit between [[ and ]]; a truly empty line ends a note; sections and synopses do not print.
8. Writers Guild Foundation (Lauren O'Connor), 2020. [Formatting Your Spec Script While Social Distancing: A Primer, Part 1](https://www.wgfoundation.org/blog/2020/3/19/formatting-your-spec-script-while-social-distancing-a-primer-part-1) (practitioner; id `wgf-primer-1`). Observed pages, scenes, acts and conventions of ten TV scripts; descriptive house style, some from one pilot.
9. BBC Writers (Matt Carless). [Sample script formats: three-camera sitcom and taped sitcom](https://www.bbc.co.uk/writers/documents/threecamera.pdf) (style-guide; id `bbc-three-camera`). Teaser, lettered scenes, capitals action, double-spaced dialogue; the taped-sitcom sample (bbctapedsitcom.pdf) leaves wide margins for studio cues. PDF text lost its indents.
10. Writers Guild of America West (Nastaran Dibai), 2022. [Ask a Mentor: Switching from Drama to Comedy Rooms](https://writtenby.com/career-craft/ask-a-mentor/2022/switching-from-drama-to-comedy-rooms) (practitioner; id `wgaw-comedy-rooms`). Scenes are funnier when the scene has a comic premise; jokes grow out of it.
11. Shannon Wells-Lassagne, 2015. [Short and sweet? Structuring Humor and Morality in American Sitcoms](https://journals.openedition.org/angles/2096) (peer-reviewed; id `wells-lassagne-2015`). Close reading of sitcom structure; quotes a 2014 magazine joke-per-minute count for twelve shows; the laugh-track pace reading is the author's interpretation.
12. Robert R. Provine, 1992. [Contagious laughter: Laughter is a sufficient stimulus for laughs and smiles](https://link.springer.com/content/pdf/10.3758%2FBF03330380.pdf) (peer-reviewed; id `provine-1992`). Four-page classroom experiment, 128 students: recorded laughter prompted laughing at first and wore out by the tenth playback; no jokes involved.
13. Writers Guild Foundation (Lauren O'Connor), 2021. [TV Format Fundamentals: Serialized Drama](https://www.wgfoundation.org/blog/2021/11/17/serialized-drama) (practitioner; id `wgf-serialized-drama`). Four acts or four plus a teaser; acts exist whether or not they are marked; match the show's page convention.
14. Jane Espenson, 2007. [The Book of Acts](https://janeespenson.com/082007/the-book-of-acts) (practitioner; id `espenson-book-of-acts`). Hour dramas moving from four to five acts; count the turns; early acts run longer than late ones.
15. Kristin Thompson, 2011. [Cognitive scientists 1, screenplay gurus 0](https://www.davidbordwell.net/blog/2011/06/09/cognitive-scientists-1-screenplay-gurus-0/) (practitioner; id `thompson-gurus`). Four-part model of classical Hollywood features against three acts; a shot-length study is reported second-hand.
16. Dramatists Guild of America. [Modern and traditional play format templates and the general formatting guide](https://www.dramatistsguild.com/sites/default/files/2020-01/General-SFI-Formatting-Guidelines-Complete.pdf) (style-guide; id `dg-templates`). Name and direction layouts differ between the two templates (modernformat-New.pdf, traditionalformat-New.pdf) and the general guide, which is of unstated origin.
17. BBC Writers. [Scriptwriting Essentials: 6. Scenes](https://www.bbc.co.uk/writers/resources/scriptwriting-essentials/6-scenes) (style-guide; id `bbc-scenes`). A scene is a significant change, not an explanation; four questions to ask of every scene.
18. BBC Writers. [Scriptwriting Essentials: 3. Beginnings (and Endings)](https://www.bbc.co.uk/writers/resources/scriptwriting-essentials/3-beginnings-and-endings) (style-guide; id `bbc-beginnings`). Open with characters in action; make them want something and pursue it.
19. BBC Writers. [Scriptwriting Essentials: 7. Dialogue](https://www.bbc.co.uk/writers/resources/scriptwriting-essentials/7-dialogue) (style-guide; id `bbc-dialogue`). Dialogue is not conversation; on-the-nose and expositional dialogue is the commonest fault; individuated voices; sparing dialect.
20. Šeļa, Eder et al., 2023. [From stage to page: language independent bootstrap measures of distinctiveness in fictional speech](https://arxiv.org/abs/2301.05659) (peer-reviewed; id `sela-distinctiveness`). Character voice distinctiveness is measurable; canonical playwrights' characters separate.
21. Giovannantonio Forabosco, 2008. [Is the concept of incongruity still a useful construct for the advancement of humor research?](https://www.degruyterbrill.com/document/doi/10.2478/v10016-008-0003-5/html) (review; id `forabosco-2008`). Theoretical review: incongruity is necessary but not sufficient; full resolution ends the humour.
22. Joe Toplyn, 2023. [Joke Writing Workshop](https://joetoplyn.com/category/joke-writing-workshop) (practitioner; id `toplyn-workshop`). Topical jokes with topic handles and associations; the capture is an index page with every breakdown cut off.
23. John August (quoting Jane Espenson), 2010. [Desperate punchlines](https://johnaugust.com/?p=4178) (practitioner; id `august-desperate-punchlines`). Second-hand: one showrunner's instruction not to end a line on its funniest word.
24. A. Peter McGraw and Caleb Warren, 2010. [Benign violations: Making immoral behavior funny](https://leeds-faculty.colorado.edu/mcgrawp/pdf/mcgraw.warren.2010.pdf) (peer-reviewed; id `mcgraw-warren-2010`). Five small studies (N 36 to 80) of moral-violation scenarios: amusement needs a violation seen as benign.
25. Jane Espenson, 2006. [How to write jokes that aren't funny](https://janeespenson.com/archives/00000219.php) (practitioner; id `espenson-unfunny`). Jokes undercut emotion; stop joking when things turn serious, or use jokes that keep the pain visible.
26. Sophie Jentzsch and Kristian Kersting, 2023. [ChatGPT is fun, but it is not funny! Humor is still challenging Large Language Models](https://aclanthology.org/2023.wassa-1.29) (peer-reviewed; id `jentzsch-kersting-2023`). Over 90% of 1008 generated jokes were the same 25; abstract only.
27. Drew Gorenz and Norbert Schwarz, 2024. [How funny is ChatGPT? A comparison of human- and A.I.-produced jokes](https://pmc.ncbi.nlm.nih.gov/articles/PMC11221738/) (peer-reviewed; id `gorenz-schwarz-2024`). Two pre-registered studies of ChatGPT 3.5 with example-rich prompts and blind lay ratings; model had 20 tries per prompt.
28. Stephen Follows, 2026. [Does one page of a screenplay really equal one minute of screen time?](https://stephenfollows.com/is-the-page-per-minute-rule-correct/) (practitioner; id `follows-page-minute`). Mean ~55 s per page; only 18.2% of scripts within ±5%; suggested rule 1 page ~ 1 minute ±20%.
29. John August, 2020. [Long scripts don't necessarily mean long movies](https://johnaugust.com/2020/how-accurate-is-the-page-per-minute-rule-2) (practitioner; id `august-long-scripts`). The page-per-minute rule barely works in aggregate and is not predictive for one project; script timing is better.
<!-- generated:sources end -->
