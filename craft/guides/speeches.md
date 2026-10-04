---
family: speeches
title: Speeches
forms: [speech-small, speech-large, speech-recorded]
reviewed: "2026-10-04"
sources: [unc-speeches, lumen-oral-written, crs-speechwriting, toastmasters-toast, toastmasters-eulogies, w3c-wai-events, tedx-speaker-guide, bull-2016, zebregs-2015, hayati-2010, wingrove-ted, liu-2017-applause, lapakko-93, bps-obama-romney, aristotle-rhetoric-1, gettysburg-bliss, chaudron-richards, ucf-monroe-withdrawn, mcgraw-warren-2010, npr-marking-scripts, wcag-122, gernsbacher-2015, bbc-subtitles, dcmp-presentation-rate, sorensen-big-think, un-gender-inclusive, strong-attention-span, guo-2014]
---
# Speeches: a craft reference

Read the section you need, not the whole guide: `prose guide speeches --section <name>`. How the text is
marked: a number in brackets, such as [3], points to the Sources list at the end. "Convention:" marks a
habit of the trade that no source tested. "Maintainer judgement:" marks advice with no source behind it.
"Measured here:" marks a number from a run of this plugin on the guide's own examples; it shows that a
problem happens, not how often.

## What it is and who reads or hears it

A speech is written to be heard once, by people who cannot go back. UNC puts it plainly: listeners "have
only one chance to comprehend the information as you read it" [1]. Three forms share this guide.
All three are Markdown drafts timed in words at 130 words per minute, and the plugin's arithmetic is the same for
each; they differ in the room.

- **Small room** (`speech-small`): toasts, eulogies and short remarks to people who came for the occasion,
  not for the speech. Judged on whether it fits the moment: short, about one person or event, and ending
  where the room can answer.
- **Large hall** (`speech-large`): keynotes, talks and ceremonial addresses to a seated audience, usually with
  a microphone, a time slot and sometimes a screen. Judged on whether the audience can follow it and carry
  one thing out of the room.
- **Recorded** (`speech-recorded`): an address to a camera, read from a script or prompter and heard later,
  possibly with captions. Judged on whether it sounds like speech to someone who is alone with it and can
  pause, replay or read along.

The people on the other side behave differently.

1. **The listener who cannot re-read.** Oral communication has "a higher level of immediacy and a lower level
   of retention" than written [2]. CRS tells speechwriters to "write aloud" and to write a speech "to be
   heard, not read" [3].
2. **The room that came for something else.** Of ritual occasions CRS quotes Wiethoff: such speeches "do not
   need clarification in order to be understood", and people "are dissatisfied if the events do not take
   place as expected" [3]. A toast or eulogy is built on one person and one moment [4][5].
3. **The hall, and the viewer elsewhere.** CRS says a large audience and a formal occasion "usually call for
   greater formality in language and delivery, lengthier remarks, and greater reliance on some of the classical
   rhetorical practices"; for a broadcast or webcast the writer must serve the people in the room and the
   "perhaps thousands" watching, and it offers no technique for doing both [3].
4. **The listener who needs more than the words.** Some of any audience cannot see, hear, move, speak or
   take in information presented in some ways, and often a speaker will not know who [6].

Two ideas run through the guide. **One idea the listener can carry out**: CRS says "Stick to no more than
three major points", TEDx asks for an idea that fits in one or two sentences, and Toastmasters asks a toast to
"stick to one main idea" [3][7][4]. **Write what a voice can carry**: short units, plain
words, repetition on purpose, and breath where the speaker needs it.

How far to trust the sources. Nearly all of it is advice. CRS, TEDx, UNC and Lumen are practitioner and
teaching texts with no experiments [3][7][1][2]. The Toastmasters toast and eulogy pages are two short tip
pages with no evidence, and the eulogy page gives no length [4][5]. The firmest items are Bull's
review of applause research, which is observational and political [8]; one meta-analysis of statistics
against stories, from written health messages [9]; and small second-language studies of speaking rate
[10]. Three are abstract only [11][12][13], one is a news write-up of a study [14], and Aristotle is Book I
only [15]. There is no source on teleprompter layout, camera delivery or large-hall acoustics beyond a
W3C checklist, so those parts below are Maintainer judgement and say so.

### Using the plugin

- Start the file with front matter `form: speech-small`, `speech-large` or `speech-recorded` and a target such
  as `target: 3 minutes` (or `target: 400 words`). `--form` on `parse`, `measure` and `lint` overrides the form.
- `prose lint <file>` runs the rules in the table at the end. `spoken.sentence.max` flags each sentence over
  16 words; `spoken.duration.report` says how long the draft reads at the planning rate; `length.target` warns
  when the draft is more than 10 percent off the target and says how many words to cut or add.
- `prose measure <file>` gives `spoken.words`, `minutes`, the `wpm` used and the longest breath unit. A breath
  unit is the words between punctuation marks or line breaks, so splitting a line is how you shorten one.
  `prose parse <file>` shows what the plugin counts as speech.
- Only speech is counted. Headings, a `<!-- note -->` on its own line and a `[bracketed cue]` on its own line are not. A bracket
  inside a sentence is counted and listed as a placeholder. Put each cue on its own line.
- All three forms plan at 130 words per minute. To use the speaker's own pace, set `wpm` in the draft's front
  matter, per form under `forms.<id>` in `.agent-prose/project.json`, or for the project; the most specific wins.
  A bad value stops the run with an error.
- `prose set new <file> --directions <list>` writes several rewrites of a passage for the owner to choose
  between, `prose set check` verifies each moved in its direction, and the `prose-review` skill covers the rest.
  Use it for a line the speaker will say aloud and may want in more than one register.
- The `prose-speech` skill writes and checks these forms; `prose guide speech-small --section rules` prints
  the table. Lint cannot hear: whether a line sounds like the speaker, or lands, is for reading it aloud.

## Anatomy and conventions

### Shared: sentences for the ear

CRS gives the only number in the sources read: "The average spoken sentence runs from eight to 16 words; anything longer is
considered more difficult for listeners to follow by ear", against "written sentences of up to 30 words". Both
figures are "generally accepted limitations" taken from style authorities, not measured results [3]. UNC advises
"shorter, simpler sentence structures", few subordinate clauses and subject near verb, with no number and no
experiment [1]. Convention: `spoken.sentence.max` flags any sentence over 16, the top of CRS's average. CRS
describes an average and the plugin applies it to each sentence, so a flag is a prompt to say it aloud, not
a fault.

Measured here: the Bliss copy of the Gettysburg Address [16], 272 words, trips the flag on 8 of its 10
sentences. They average 27.2 words, and the last, with its dashes, counts as 82. The flag is a prompt to read
aloud, not a verdict.

- **Test by breath.** CRS: "punctuate according to the ear and not the eye", and declaim a long sentence "as if
  one were speaking to an audience"; if it is taxing for the lungs, shorten it or repunctuate [3].
- **Fragments and sentences opening with *and* or *but* are fine.** Lumen lists "shorter thought units", fragments and thoughts
  that begin with *and* or *but* as oral style [2]. CRS warns the other way too: "exclusive use of the
  active voice can impart a choppy, juvenile cadence" [3]. Vary the length; do not make every sentence short.
- **Name things; limit "it", "this" and "they".** Listeners "may have a hard time remembering or figuring out
  what 'it,' 'they,' or 'this' refers to" [1]. Keep a key term constant instead of swapping synonyms.
- **Plain, familiar words.** Lumen: oral style uses "familiar words based on audience understanding", and
  expert terms "will cruise over the heads of most audience members" [2]. CRS names trendy words and clichés to
  avoid [3]. TEDx: "Don't use too much jargon, or explain new terminology" [7].
- **We, you and I.** Lumen favours the inclusive *we*; CRS warns against "I" strain and against calling
  yourself *we* or *he* [2][3]. They address different uses of the word.

### Shared: rhythm, repetition and the rule of three

CRS: "repetition with variation is a basic speechwriting tool", with King, Churchill and Lincoln's "we can not
dedicate—we can not consecrate—we can not hallow—this ground" as examples; it also lists triads, parallelism,
anaphora, antithesis and suspension for climax, "provided the device is not overused" [3][16]. UNC: repeat
crucial points and keep key terms constant [1]. This is why `style.echo` does not run on speeches.

The rule of three, honestly. Atkinson's seven applause constructions, as relayed by a news write-up of Bull and
Miskinis, include the three-part list and the contrast [14]. Bull's review explains why lists of three are
common: the end of a list can signal the end of a turn, and "such lists in conversation typically consist of
three items" [8]. Heritage and Greatbatch coded all 476 speeches televised from the 1981 British party
conferences: contrasts went with 33.2 percent of the incidents of collective applause and lists with 12.6 percent
(Bull reports these second-hand) [8]. A TED study identifies 24 devices as triggers of applause, abstract only
[12]. What none of it shows: that three beats two or four, or that a list aids recall or persuasion. It is
about when applause comes in political speeches. Use a triad when the thought has three parts; do not present it
as a persuasion finding.

### Shared: structure and signposting

CRS: a theme, "Stick to no more than three major points" ("This pudding has no theme"), an introduction, body and
conclusion, the theme restated at the close [3]. TEDx gives four steps (make them care, explain the idea, give
evidence and how it could be used, say how it could affect them) and says "Your structure should be invisible
to the audience", "don't talk about how you're going to talk" [7]. UNC states the thesis early, previews and
summarises, and closes by restating the main points without repeating them [1].

These conflict, and no source tests them. CRS and UNC restate; TEDx says "Don't use your conclusion to simply
summarize". CRS lists spoken signposts ("secondly", "as a result"); TEDx forbids announcing the plan [3][7]. Maintainer
judgement: they fit together. Use linking words between points, skip the preview in a short talk, and end
with the idea plus what follows from it. Chaudron and Richards studied discourse markers and lectures, but only
the abstract was captured, with no finding [17]. A withdrawn record on Monroe's motivated sequence tested reading,
not listening, and found no attitude difference, so this guide does not rely on it [18].

### Shared: persuasion, stories and statistics

Aristotle names three modes of persuasion "furnished by the spoken word": "the personal character of the
speaker", "putting the audience into a certain frame of mind", and "the proof, or apparent proof, provided by the
words of the speech itself". The words ethos, pathos and logos are not in the translation read here [15]. UNC uses them as
teaching labels and asserts that the most effective speeches "usually present a combination" without evidence [1].
Nothing read here tests whether the framework improves speeches.

Stories against statistics has one test. A meta-analysis found statistical evidence stronger on beliefs and
attitude and narrative evidence stronger on intention, with small mean effects and the attitude and intention
differences only marginally significant; it studied written health messages [9]. The speech guides agree on caution with numbers: CRS says "a speech
filled with statistics becomes a statistical abstract, not a speech" and "never use a quotation that cannot be verified in an
authoritative source" [3]; TEDx says "Don't open with a string of stats" but also "Use empirical evidence, and limit
anecdotal evidence" [7]. Maintainer judgement: choose by the goal. Use a story when you want the room to act
or feel, and a number when you want it to believe, and give each its own sentence.

Humour. CRS says self-deprecating or gentle humour "is usually more effective than satire or ridicule" and
to avoid jokes aimed at personal lives or at religious and ethnic groups [3]; Toastmasters says a toast is
not "the time to roast, embarrass, or overshare" [4]. McGraw and Warren's theory says a joke needs a violation seen as
benign, tested on small samples with moral scenarios [19]. No source tests humour in speeches. Maintainer
judgement: a joke the whole room cannot follow, or that the subject would wince at, is not benign to that room.

### Small room: toasts and eulogies

- **Toast.** Toastmasters: "Short (2-3 minutes)", say who you are and how you know the honoree, one brief story
  or quality, and "a clear toast invitation" such as "To [Name]!" [4]. It also asks the speaker to settle the
  purpose and theme first. At 130 words per minute, 2 to 3 minutes is about 260 to 390 words
  (arithmetic on two sources). Skip inside jokes; "stick to one main idea".
- **Eulogy.** "Limit a eulogy to two or three main points. A eulogy should not be the chronology of a life but a
  tribute to it"; use "meaningful stories, anecdotes and quotes"; keep gestures restrained [5]. It names no
  length. The nearest figure is CRS's "five to 10 minutes" for ritual remarks by a guest, written for civic
  appearances, so no eulogy length is stated here as fact [3]. Maintainer judgement: choose the length the family and
  the service allow, and plan words from it at the speaker's own pace.
- **Notes or text.** The toast page says notecards and bullets; the eulogy page says write it out in detail
  [4][5]. Neither gives a reason. Maintainer judgement: a speaker who may be moved should have the full text,
  large type and a marked last line; a toast speaker who knows the person can work from cues.
- **Purpose.** UNC names the eulogy as the speech that invites feeling rather than thought or action [1].
  Aristotle's ceremonial oratory "either praises or censures somebody" [15]; a toast and a eulogy are
  speeches of praise, and other points serve that end.

### Large hall

Structure and signposting above carry most of it; here is what is hall-specific. CRS ties size to formality
and "lengthier remarks" [3]. TEDx: under 18 minutes ("Because it works"), one idea, no pitch at the close ("Avoid ending
with a pitch") [7]. Slides: "if your audience is reading, they are not listening", so use as little text as possible
and make no slide carry more than one point [7]; W3C adds: say "all of the information that is on each slide",
and describe visible responses such as raised hands [6].

**Opening and close.** TEDx: start with something the audience cares about, "Get your idea out as quickly as possible",
and end with how the idea could affect them, adding a call to action if it fits [7]. UNC: a hook (an anecdote,
a question, a statistic), then "Get to the point"; a call to action should be specific and realistic [1].

Applause and response, as an observed phenomenon. In a news write-up of 11 US campaign speeches, the two
candidates used implicit constructions about twice as often as explicit requests for applause, and drew 2.57
and 2.23 positive responses a minute [14]. The write-up says the study "doesn't present evidence that usage
of rhetorical devices causally influences elections" [14]. Bull's review reports an argument that delivery (gesture,
breath) tells the audience whether a list is an invitation [8]. Maintainer judgement: plan a pause after a line you
want the room to answer, mark it in the script, and do not count on applause. Explicit asks that suit a rally
may break a talk's rule against ending with a pitch.

Microphone and room are pointers only. W3C: wireless lapel microphones are often best so speakers can move,
repeat audience questions into the microphone, and be visible in good light [6]. No source here covers hall
acoustics or stage practice.

### Recorded speeches

Everything under writing for the ear applies. Maintainer judgement: the viewer is alone and can stop and replay, so
the opening has less room to warm up. There is no source on
teleprompter layout, line length, prompter pace, eye contact with a lens, or take-by-take editing, and
none on corporate or presidential practice. What follows is Maintainer judgement; the nearest practitioner
source is NPR's script marking, and its transfer to a prompter is an inference [20].

- **Pacing.** Maintainer judgement: record at the speaker's comfortable pace and set `wpm` from a rehearsal.
  The 130 planning figure is CRS's rule of thumb for a live speech [3]; a recorded one is not shown to differ.
- **Layout.** Maintainer judgement: one phrase per line, short lines, cues on their own lines, and a blank
  line where a breath or retake can start. A phrase per line also shortens the plugin's breath unit.
- **Retakes.** Maintainer judgement: end each paragraph on a finished thought, so a bad take is re-recorded
  from a paragraph start, and keep the same words in every take.
- **Captions.** A prerecorded video with speech needs captions under WCAG 2.2 Level A, with speaker identification
  and meaningful sounds, and synthetic speech counts as audio [21]. More than 100 studies find captions improve
  comprehension, attention and memory [22]. Caption reading rates bound what a viewer can read, not what a speaker can say:
  BBC subtitles run verbatim up to about 160 to 180 words per minute and are edited above that, and DCMP caps
  educational captions at 130, 140 or 160 by level [23][24]. YouTube narration belongs to the youtube guide.
- **Speaker and prompter.** Lumen: reading from a teleprompter or manuscript takes "a lot of practice" to sound
  natural, and writing in a style that sounds like speech takes more [2]. W3C: do not face away from the webcam to
  read projected material [6].

### Manuscript, notes and marking a script

CRS: "dependence on a manuscript can deaden the delivery, just as the excessive use of notes or cards can
stimulate verbosity" [3]. TEDx wants a script that "feels natural to you" and rehearsal that sounds like "speaking
to just one person in a spontaneous one-way conversation" [7]. UNC: read the draft to a friend or in a mirror and ask where
listeners lose the thread and whether it fits the time [1]. For a ghostwritten speech, Sorensen describes years of learning
the speaker's way of speaking, and a speaker who changed drafts until he was "comfortable with the words"
[25]; CRS says the best ghostwriters are invisible [3].

NPR's marking copy [20]: use a slash only where a breath or a beat helps ("If the line already flows? Let it
roll"); underline the words you would lean on in conversation; break a dense paragraph into lines; add private
tone cues; spell hard names as you will say them; use `>` to speed up and `<` to slow down, and "slow down
when introducing new or important information". In this plugin only a line break or punctuation changes the
breath unit; a slash, bold or italic does not change the count, and a cue goes on its own line.

### Accessible and inclusive speaking

W3C asks speakers to speak clearly and "avoid speaking too fast", "pause between topics", give interpreters and
captioners their material in advance with terms and names explained, say what is on each slide, avoid or explain
jargon and idioms ("raising the bar" can be taken literally), and repeat questions into the microphone [6]. It gives no rate and
no pause length, and sign language is not word-for-word, which is why advance material matters [6]. Maintainer
judgement: for an interpreted or captioned event, plan below 130 words per minute; the number is mine, not W3C's. The UN guidelines cover "oral or written"
communication and give gender-neutral wording, plural pronouns and dropping the gendered word, chosen by context
[26]. UNC asks "What might offend or alienate them?" [1]. Gaps: nothing read covers race, disability or age
language, and no source shows these practices change comprehension. Lapakko is why this guide quotes no 93 percent
figure: the 7-38-55 formula rests on two 1967 studies with serious limitations [13].

### Where the rules pull apart

- **Short sentences, or the sentence the idea needs.** CRS gives an average; the plugin flags each over 16
  [3]. Maintainer judgement: a long sentence works when its phrases carry the breath, as the dashes do in
  Gettysburg's last one; otherwise break it.
- **Repeat, or do not.** Repetition is a device in speech and a fault in prose; `style.echo` is off here.
- **Restate the theme, or do not summarise.** CRS and UNC restate; TEDx does not [3][1][7]. Restate and add.
- **Preview, or an invisible structure.** Use signposts between points, not a table of contents.
- **Applause lines, or no pitch.** A rally invites; an idea talk does not [8][7].

## Length and timing

**Planning rate.** CRS: speakers range "from 115 to 175 words a minute" and "an often-cited rule-of-thumb is
that the average 20-minute speech contains about 2,600 words, or, about 130 per minute" [3]. 130 is CRS's planning
figure, a rule of thumb and not a measurement; nothing read shows it is better than another rate. The same 2,600
words would run from about 15 to about 23 minutes across CRS's range (arithmetic). Budget: minutes times 130.

| Minutes | 2 | 3 | 5 | 10 | 18 | 20 |
|---|---|---|---|---|---|---|
| Words at 130 | 260 | 390 | 650 | 1,300 | 2,340 | 2,600 |

**How the plugin estimates it.** `spoken.duration.report` adds the words of every speech block and divides by the
form's `wpm`; the Gettysburg Address (272 words) reads in 2.09 minutes at 130. It does not count
headings, notes or cues, and it adds nothing for pauses, laughter, applause, slides or a long silence, so Maintainer
judgement: add time for each, and prefer the speaker's measured pace. `length.target` compares the minutes with
the target and warns past ten percent, a threshold this plugin chose.

**Limits.** CRS: "20 minutes should be the upward limit" because "most listeners tune out, perceptibly or not,
after that period", and "five to 10 minutes" for ritual or *pro forma* remarks by a guest; only inaugurals and
State of the Union messages regularly run over [3]. TEDx: under 18 minutes, "it wouldn't be a TEDx Talk" otherwise,
and "Shorter talks are not lesser talks" [7]. Toastmasters: toasts 2 to 3 minutes [4]. These are conventions. CRS calls its
figure conventional wisdom and TEDx says "Because it works"; neither offers attention data. A widely repeated
eight-second attention span has no traceable source [27]. Do not state a hard attention limit.

**Spread and uncertainty.** Wingrove compared one-minute samples of TED talks and of university lectures and found TED speech
significantly faster in words per minute; only the abstract was captured, with no means [11]. Guo and colleagues measured
48 to 254 words per minute (mean 156) in recorded course videos and found faster speakers more engaging there [28].
Hayati's 62 second-language students improved with natural-rate and slow-rate practice, natural more; his review
calls the rate literature "mostly contradictory", and it covers second-language listeners, not natives [10]. W3C says to go slower
for interpreters, with no number [6]. So set `wpm` from the speaker when you know it.

## What good looks like

The examples are written for this guide; every person, place and number in them is invented. Each Markdown
example passes `prose lint` with no errors or warnings. The bad examples are plain text, with the warnings
lint counts on them.

### A toast opening

<!-- bad example, on purpose: the guide's tests lint it as speech-small and expect 1 warning -->

```text
Ladies and gentlemen, for those of you who do not know me, my name is Priya, and Webster's dictionary defines a friend as someone who is attached to another by affection, and while I could stand here and tell you that Dana has always been a wonderful, caring and generous person who has touched the lives of so many people in so many different ways, I thought tonight I would try to say something a little different, so please bear with me.
```

Measured here: `prose lint` reports 1 warning, a sentence of 82 words. It starts with a dictionary, apologises
("bear with me"; CRS says no speaker should apologise for the speech [3]), lists adjectives instead of one
quality, and never names a story. Rewritten:

```markdown
---
form: speech-small
---

I am Priya. Dana and I shared a flat for four years.

Every Sunday she made soup. Every Sunday I said I would help.
She never once held it against me.

That is Dana. She gives first and keeps no count.

[raise glass]

Please stand with me. To Dana.
```

Who she is, one small story, one quality, and the invitation. A line break is a pause for the speaker.

### A eulogy paragraph

<!-- bad example, on purpose: the guide's tests lint it as speech-small and expect 1 warning -->

```text
Harold was born in 1938 in Leeds, attended the local grammar school, joined the railway at sixteen, where he worked for forty-one years, married Edith in 1961, raised three children, and enjoyed many hobbies, including gardening, fishing and model trains, and he will be remembered by all who knew him as a kind, generous man who touched many lives.
```

Measured here: `prose lint` reports 1 warning, a sentence of 60 words. It is the chronology that Toastmasters
warns against [5], with a tribute that could fit anyone ("kind, generous"). Rewritten:

```markdown
---
form: speech-small
---

My grandfather kept a tin of seeds in the shed. Every March he gave out packets.
The neighbours got them. The postman got them. I got them, and I killed every one.

He never said a word about that. He just handed me another packet the next March.

I think that was his whole method. He gave people a second chance and called it gardening.

[pause]

Look at the beds on this street. Half of them are his.
```

One story, said plainly, with a closing image the room can see. It names the relationship in the first line,
and the last two lines point at something the room can see. The story is invented.

### A keynote opening

<!-- bad example, on purpose: the guide's tests lint it as speech-large and expect 2 warnings -->

```text
Good morning, everyone. Thank you so much to the organisers, to our sponsors, and to all of you for being here. It is a real honour. Before I begin, I would like to apologise, because I am a little nervous. Today I am going to talk about three things. First I will give some background on the history of regional bus services, second I will discuss the funding model, and third I will present our recommendations.
```

Measured here: `prose lint` reports 2 warnings, sentences of 18 and 27 words. Lint cannot see the real faults:
thanks first, an apology, a plan announced aloud, which TEDx says to avoid [7], and no idea until the
fifth sentence. Rewritten:

```markdown
---
form: speech-large
---

Last winter the 7:10 bus stopped coming.

Nobody told us. The sign still said 7:10. People stood under it in the dark and waited.

I want to argue one thing this morning. A bus line is a promise, and a town keeps or breaks it every day.
```

An image, then the one idea, in the first minute.

### A sentence too long for the ear

<!-- bad example, on purpose: the guide's tests lint it as speech-large and expect 1 warning -->

```text
The programme that the council approved last spring, after a consultation in which residents who had previously been sceptical about the proposed changes to the bus network were invited to comment, has, according to the report that was published on Tuesday, reduced waiting times for almost every route.
```

Measured here: `prose lint` reports 1 warning, a sentence of 48 words, with a 23-word breath unit; it is also
passive. Rewritten:

```markdown
---
form: speech-large
---

The council approved the programme last spring. Residents were asked first.
Many had been sceptical. On Tuesday the report came out.
It says waiting times fell on almost every route.
```

Each sentence is one breath, the breaks are where the speaker pauses, and the subject comes first.

### A script marked for pauses

<!-- bad example, on purpose: the guide's tests lint it as speech-large and expect 0 warnings -->

```text
The 7:10 bus stopped running in November. The sign still said 7:10. Forty people stood under it that week and nobody told them why. The council said the route was under review. A review is not an answer.
```

Measured here: `prose lint` reports no warnings, and `prose measure` counts 40 words with a 12-word longest breath
unit. Nothing is wrong that lint can see; the reader has no breaths, no stress and no hold. Marked:

```markdown
---
form: speech-large
---

The 7:10 bus stopped running in **November**.
The sign still said 7:10.

[hold]

*Forty* people stood under it that week
and nobody told them why.

The council said the route was under review.
A review is not an **answer**.
```

The marks follow NPR's method [20]: breaths at line breaks, stress in bold, a cue line. The count is still 40 words, so the
estimated runtime is unchanged, but Measured here the longest breath unit falls from 12 words to 8. Pauses add
real time that lint does not count.

### A recorded address opening

<!-- bad example, on purpose: the guide's tests lint it as speech-recorded and expect 1 warning -->

```text
Dear colleagues, I am pleased to share that, following a comprehensive review of our operations and in light of the feedback that was received from many of you in recent months, a number of changes to the way in which we organise our regional teams will be implemented from the first of March.
```

Measured here: `prose lint` reports 1 warning, a sentence of 53 words. It is a memo read aloud: "dear
colleagues", a passive, and the change at the very end. Rewritten:

```markdown
---
form: speech-recorded
---

[look at the lens]

Hello, everyone. I have one change to tell you about, and it starts on the first of March.

Our regional teams will report to one lead each. You asked for this, many times. We listened.

[slow down]

Here is what that means for you.
```

Maintainer judgement: the cues at the top and before the last line are a reader's marks for a prompter or a page,
not a source's layout; keep your own habit and measure the words.

## Common failures and the habits behind them

Fixing the habit behind a failure prevents the next one. The habits are Maintainer judgement unless cited.

### A written text read aloud

Long sentences, "it" and "this" with no noun, and every sentence the same length: the habit is writing at a
desk and checking only with the eye [3][1]. Fix: speak each paragraph aloud, shorten what takes a second breath, name the noun,
and let a few short sentences stand alone.

### Throat-clearing and the plan announced

Thanks first, an apology, "today I will talk about": the habit is writing the preface to calm the writer, not
the idea for the room [7][3]. Fix: open with the idea, the story or the person; thank later if the occasion needs it.

### The chronology and the list of adjectives

A eulogy that lists dates, a toast that lists virtues: the habit is that facts are easier to write than a
scene [5]. Fix: one story with a detail only this person had, then one sentence of what it showed.

### Stock closers and machinery

"May your life be as ... as ...", reflexive lists of three, "Webster defines": the habit is reaching for a form
because it sounds like a toast. Evidence on the rule of three is only about applause timing [8]. Fix: end on a specific image
from the subject's own life.

### Invented stories and numbers

Filling a gap with a plausible anecdote or a figure. CRS: never use a quotation that cannot be verified [3]; TEDx asks
speakers to fact-check statistics and anecdotes [7]. Fix: leave a visible `[placeholder]` and tell the speaker a real
story beats an invented one. `draft.placeholders` lists bracketed gaps.

### Length by guess

Writing "a five-minute speech" without counting. Fix: words = minutes x the speaker's pace, then run `prose
measure`; the habit is trusting a feel for length when speakers range from 115 to 175 words a minute [3].

## How to revise

Revise in this order: early steps change what the room hears, later ones how it sounds.

1. **Decide the room and the one thing.** Write the idea in one or two sentences [7]. For an occasion, write who it is
   for and the one story. If you cannot, do not edit yet.
2. **Set the budget.** Minutes times the speaker's pace; set `target` and, if known, `wpm`.
3. **Check the opening and the close.** Idea or story in the first lines, no apology, a close that gives the
   room something to do or say.
4. **Check every story, quotation and number against what you were given.** Placeholders, not inventions.
5. **Run `prose lint <file>`, then `prose measure <file>`.** Read each flagged sentence aloud; split it or
   leave it if it carries breath. Report spoken words, minutes at the planning rate, the longest breath unit
   and the gap to the target; never write "about five minutes" without that.
6. **Read it aloud and mark it** [20]. Breaths at line breaks, stress, cues; time it with the speaker and replace the
   planning rate with the real pace.
7. **Cut, then test on a listener.** CRS suggests the speaker, the writer and a disinterested third party
   each review a draft [3]. Ask what they would repeat tomorrow.
8. **Report.** Words against the target, minutes and rate, placeholders left, lint findings you kept and why.

## Rules that apply

The table is generated from `craft/rules.json` for `speech-small`, `speech-large` and `speech-recorded`. The
`ai.*` rules are style findings about phrasing, not detectors; the `voice.*` rules fire only in a project with voice
bibles. A threshold marked "This plugin's choice" is not a source's figure. `style.echo` does not run on speeches,
because repetition is a device here. `readability.grade.report` runs but says little about speech: Measured here,
the toast opening above reads at grade 33.2 and its rewrite at 1.3; neither is a target. Whether a story is true
is for the writer.

<!-- generated:rules begin (npm run guides) -->
| Rule | What it checks | Severity | Threshold | Threshold basis | Run by |
|---|---|---|---|---|---|
| `spoken.sentence.max` | Spoken sentences over 16 words are flagged. | warn | 16 words | This plugin's choice (derived) | lint |
| `readability.grade.report` | Reading grade is reported, never targeted. | info | none | n/a | lint |
| `style.passive.report` | Passive voice is counted and reported, not banned. | info | none | n/a | lint |
| `ai.copula-avoidance` | 'serves as', 'stands as', 'functions as' in place of is/are are flagged. | info | none | n/a | lint |
| `ai.artifact` | No leaked chatbot markup or unfilled placeholders. | error | none | n/a | lint |
| `draft.placeholders` | Bracketed placeholders are listed until filled. | info | none | n/a | lint |
| `ai.vocabulary` | Three or more distinct era-tagged AI vocabulary terms in one draft are flagged. | warn | 3 distinct terms | This plugin's choice (derived) | lint |
| `spoken.duration.report` | Spoken drafts report read-aloud time at the form's planning WPM. | info | none | n/a | lint |
| `length.target` | A draft with a declared target lands within ±10% of it. | warn | 0.1 fraction | This plugin's choice (derived) | lint |
| `voice.targets` | Each voiced speaker's measured style stays inside the voice bible's target ranges. | warn | none | n/a | lint |
| `voice.bible-valid` | Every voice bible in the project loads: valid YAML and schema, id matching the file name, unique ids, and each speaker claimed by one bible. | error | none | n/a | lint |
| `voice.banned` | A speaker never uses a word their voice bible bans. | warn | none | n/a | lint |
| `voice.unvoiced` | In a project with voice bibles, every speaker resolves to one. | info | none | n/a | lint |
<!-- generated:rules end -->

## Sources

Numbers in brackets in the text refer to this list. Most sources report their authors' practice and were not
tested on listeners.

<!-- generated:sources begin (npm run guides) -->
1. UNC Writing Center. [Speeches](https://writingcenter.unc.edu/tips-and-tools/speeches/) (practitioner; id `unc-speeches`). University handout, no experiments: purpose as feeling, thinking or acting; state the thesis early; shorter sentences, fewer pronouns; previews and summaries; ethos, pathos and logos as teaching labels.
2. Anne Fleischer, Lumen Learning. [Oral versus Written Style](https://courses.lumenlearning.com/wm-publicspeaking/chapter/oral-vs-written-style/) (book; id `lumen-oral-written`). Open textbook chapter, no data: oral style uses more we, shorter thought units, repetition, contractions and familiar words; a speech is not a written text read aloud.
3. Congressional Research Service, 2007. [Speechwriting in Perspective: A Brief Guide to Effective and Persuasive Communication (98-170)](https://www.everycrsreport.com/files/20070412_98-170_9a7487f68c4e6092a69af51d49414e4d8d654c3f.html) (review; id `crs-speechwriting`). Spoken sentences average 8-16 words; ~2,600 words per 20 minutes; speakers range 115-175 wpm.
4. Toastmasters International. [How to Give a Toast](https://www.toastmasters.org/Resources/Public%20Speaking%20Tips/How%20to%20Give%20a%20Toast) (practitioner; id `toastmasters-toast`). Short tip page, no evidence: two to three minutes, one main idea, a brief story or quality, a clear invitation to drink, notecards and rehearsal. Its sample toasts are generic templates.
5. Toastmasters International. [Delivering Eulogies](https://www.toastmasters.org/resources/public-speaking-tips/delivering-eulogies) (practitioner; id `toastmasters-eulogies`). Five tip bullets, no evidence and no length: write it out and practise, two or three main points, a tribute and not a chronology, restrained gestures.
6. W3C Web Accessibility Initiative. [Making Events Accessible: Checklist for meetings, conferences, training, and presentations](https://www.w3.org/WAI/teach-advocate/accessible-presentations/) (standard; id `w3c-wai-events`). Official checklist, qualitative: speak clearly and not too fast, pause between topics, say what is on each slide, describe visible responses, explain jargon and idioms, repeat questions. Gives no rate and no pause length.
7. TEDx. [TEDx Speaker Guide](https://tedxbend.com/tedx/manuals/tedx_speaker_guide.pdf) (style-guide; id `tedx-speaker-guide`). Organiser's guide for TEDx speakers: under 18 minutes, one idea, an invisible structure, no pitch at the close, rehearse as one-to-one talk. Rules from the programme's experience, with no data.
8. Peter Bull, 2016. [Claps and Claptrap: The Analysis of Speaker-Audience Interaction in Political Speeches](https://jspp.psychopen.eu/index.php/jspp/article/download/4951/4951.pdf) (review; id `bull-2016`). Open-access review of applause research in political speeches, mainly British and American party and campaign speeches; observational. Reports Heritage and Greatbatch's counts second-hand.
9. Simone Zebregs, Bas van den Putte, Peter Neijens and Anneke de Graaf, 2015. [The differential impact of statistical and narrative evidence on beliefs, attitude, and intention: a meta-analysis](https://pure.uva.nl/ws/files/2680645/167737_497142.pdf) (peer-reviewed; id `zebregs-2015`). Meta-analysis, mostly written health-campaign messages and no live speeches: statistical evidence stronger on beliefs and attitude, narrative stronger on intention.
10. Abdolmajid Hayati, 2010. [The Effect of Speech Rate on Listening Comprehension of EFL Learners](http://www.scirp.org/journal/PaperDownload.aspx?paperID=3014) (peer-reviewed; id `hayati-2010`). Classroom experiment with 62 Iranian students of English as a foreign language, plus a literature review that reports earlier rate studies second-hand. Second-language listeners only; the captured tables are garbled, so no table figure is used.
11. Wingrove, 2017. [How suitable are TED talks for academic listening?](https://research.chalmers.se/en/publication/547664) (peer-reviewed; id `wingrove-ted`). TED talks are significantly faster than lectures.
12. Zhe Liu, Anbang Xu, Mengdi Zhang, Jalal Mahmud and Vibha Sinha, 2017. [Fostering User Engagement: Rhetorical Devices for Applause Generation Learnt from TED Talks](https://arxiv.org/abs/1704.02362) (peer-reviewed; id `liu-2017-applause`). arXiv preprint, abstract only: regression on transcripts of 2,135 TED talks identifies 24 rhetorical devices as triggers of applause. The devices and effect sizes were not captured.
13. David Lapakko. [Communication is 93% Nonverbal: An Urban Legend Proliferates](https://cornerstone.lib.mnsu.edu/ctamj/vol34/iss1/2) (peer-reviewed; id `lapakko-93`). Abstract only: the 7-38-55 formula derives from two 1967 studies with serious methodological limitations and is widely misused.
14. Alex Fradera (British Psychological Society Research Digest), 2015. [Comparing Obama's and Romney's speech styles and the way their audiences react](https://bps.org.uk/research-digest/comparing-obamas-and-romneys-speech-styles-and-way-their-audiences-react) (practitioner; id `bps-obama-romney`). Secondary news write-up of a study by Bull and Miskinis of 11 swing-state speeches in 2012: counts of claptraps and audience responses, correlational, and says outright that causation is untested. Figures here are the write-up's, not the paper's.
15. Aristotle, translated by W. Rhys Roberts. [Rhetoric, Book I](https://classics.mit.edu/Aristotle/rhetoric.1.i.html) (book; id `aristotle-rhetoric-1`). Primary text, Book I only: three modes of persuasion and three kinds of oratory. The labels ethos, pathos and logos do not appear in this translation.
16. Abraham Lincoln (Bliss copy, text from Wikisource), 1863. [Gettysburg Address (Bliss copy)](https://en.wikisource.org/wiki/Gettysburg_Address_(Bliss_copy)) (book; id `gettysburg-bliss`). Primary text, 272 words: used only for short checked excerpts and a sentence-length measurement.
17. Craig Chaudron and Jack Richards. [The Effects of Discourse Markers on the Comprehension of Lectureships](https://scholarspace.manoa.hawaii.edu/items/cd3514b8-4bb9-4cb4-927f-8b119167c1bc) (practitioner; id `chaudron-richards`). Working paper on foreign students and university lectures; only the abstract was captured and it reports no finding, so it is not evidence that signposts help or hurt.
18. UCF STARS. [A test of Monroe's Motivated Sequence for its effects on ratings of message organization and attitude change](https://stars.library.ucf.edu/facultybib2000/2702) (practitioner; id `ucf-monroe-withdrawn`). Withdrawn record, abstract only: participants read, and did not hear, a message in Monroe's order, reverse order or random order; no attitude difference. Listed so the guide can say it does not rely on it.
19. A. Peter McGraw and Caleb Warren, 2010. [Benign violations: Making immoral behavior funny](https://leeds-faculty.colorado.edu/mcgrawp/pdf/mcgraw.warren.2010.pdf) (peer-reviewed; id `mcgraw-warren-2010`). Five small studies (N 36 to 80) of moral-violation scenarios: amusement needs a violation seen as benign.
20. George Bodarky (NPR Training), 2025. [How marking scripts can help you sound more natural](https://www.npr.org/sections/npr-training/2025/09/29/g-s1-90460/how-marking-scripts-can-help-you-sound-more-natural) (practitioner; id `npr-marking-scripts`). Radio training article on marking copy: slashes for breaths, underlines for stress, arrows for pace, phonetic spellings. Written for studio reading; nothing is measured, and its use for a hall or a prompter is an inference.
21. W3C. [Understanding Success Criterion 1.2.2: Captions (Prerecorded)](https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html) (standard; id `wcag-122`). WCAG 2.2 Level A: captions for prerecorded audio in synchronised media, including speaker identification and meaningful sounds; synthetic speech is audio too.
22. Morton Ann Gernsbacher, 2015. [Video Captions Benefit Everyone](https://gernsbacherlab.org/wp-content/uploads/papers/1/Gernsbacher_Captions_2015.pdf) (review; id `gernsbacher-2015`). Review: more than 100 studies find that captions improve comprehension of, attention to and memory for video; verbatim captions are as effective as elaborated ones.
23. BBC. [BBC Subtitle Guidelines](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/) (style-guide; id `bbc-subtitles`). Recommended subtitle reading speed is 160-180 words per minute (a reading speed for subtitles, not a speech rate).
24. Described and Captioned Media Program. [Captioning Key: Presentation Rate](https://dcmp.org/learn/captioningkey/601) (style-guide; id `dcmp-presentation-rate`). Caption reading-rate caps for educational media of 130, 140 and 160 words per minute by level; these bound captions, not speech.
25. Ted Sorensen, 2008. [Ted Sorensen on Writing JFK's Speeches](https://bigthink.com/videos/ted-sorensen-on-writing-jfks-speeches/) (practitioner; id `sorensen-big-think`). A speechwriter's first-hand account in a recorded interview: years of learning the speaker's way of speaking, and a speaker who changed drafts until he was comfortable with the words. Not a technique.
26. United Nations. [Guidelines for Gender-Inclusive Language in English](https://www.un.org/en/gender-inclusive-language/) (style-guide; id `un-gender-inclusive`). Official guidelines for oral and written communication; gender only, and no evidence that the practices change comprehension or response.
27. Frank Strong, 2022. [Why we need to stop using that statistic about goldfish, brains and attention span](https://www.swordandthescript.com/2022/02/goldfish-attention-span/) (practitioner; id `strong-attention-span`). A marketing blog post that relays a BBC piece: the eight-second attention-span figure has no traceable source, and attention depends on the task. Used only to show that no hard attention limit can be quoted.
28. Philip J. Guo, Juho Kim and Rob Rubin, 2014. [How Video Production Affects Student Engagement: An Empirical Study of MOOC Videos](https://pg.ucsd.edu/publications/edX-MOOC-video-production-and-engagement_LAS-2014.pdf) (peer-reviewed; id `guo-2014`). Recorded lecture videos, not live speeches: speaking rates from 48 to 254 words per minute (mean 156, sd 31) and higher engagement with faster speakers in these courses.
<!-- generated:sources end -->
