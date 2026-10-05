---
family: youtube
title: YouTube scripts
forms: [youtube]
reviewed: "2026-10-04"
sources: [ferreira-2023, youtube-key-moments, youtube-clickbait, guo-kim-rubin-2014, schorn-2022,
  youtube-hook-tips-2014, wistia-retention, kim-dropouts-2014, mrbeast-memo, velho-2020,
  beautemps-bresges-2021, veritasium-clickbait-2021, muller-sharma-misconceptions, youtube-end-screens,
  youtube-chapters, kurzgesagt-about, crs-speechwriting, ruzi-2021, wcag-captions, bbc-subtitles, dcmp-rate,
  ftc-disclosures-101, youtube-branded-content, youtube-fair-use, copyright-office-fair-use,
  youtube-made-for-kids, wingrove-ted]
---
# YouTube scripts: a craft reference

Read the section you need, not the whole guide: `prose guide youtube --section <name>`. How the text is
marked: a number in brackets, such as [3], points to the Sources list at the end. "Convention:" marks a habit
of the trade that no source tested. "Maintainer judgement:" marks advice with no source behind it. "Measured
here:" marks a number from a run of this plugin on the guide's own examples; it shows that a problem happens,
not how often.

## What it is and who reads or hears it

A YouTube script is a narrated video on paper: what the viewer hears, what the viewer sees, and when. One
form, `youtube`, covers it. It is a Markdown file with timestamped segments, and the plugin measures it as
spoken text, at a planning rate of 160 words per minute that is this plugin's choice, not a source's.

Four people use one script. The **viewer** hears it once, at the narrator's pace, having met the title and
thumbnail first; they can leave at any second and may be reading captions with the sound off. The **narrator**
has to say it, so a sentence that cannot be said in one breath fails here. The **editor** cuts picture to the
words and needs each beat's time, what is on screen, and whether the footage exists, must be shot or needs a
licence [1]. The **platform** measures what happens after the click: its retention report reads the first 30
seconds against the title and thumbnail [2], and it removes some packaging whose promise the video never keeps
[3].

Three kinds of video share the form, and they pull the script in different directions.

- **Tutorials** teach a task. Viewers skim and rewatch them: in one large set of online course videos they
  watched about 2 to 3 minutes of a tutorial whatever its length, and the authors advise designing for
  skimming and rewatching [4]. The picture often carries the steps, and the narration names each action.
- **Explainers** answer one question. A review of short explainers describes them as one to three minutes,
  voiced over, informal, and built in three acts: a brief introduction, a problem or question, and a
  resolution. The same review says a research-based classification of explainer structures is still pending
  [5]. Those features describe short explainers, not long video essays.
- **Commentary and essays** argue or tell a story. No source in this guide covers them as a genre. Maintainer
  judgement: use the promise-and-payoff and spoken-language advice below, and treat structure advice as
  untested.

**What the evidence is.** Say this plainly before using any advice about hooks or retention: there is no
credible controlled evidence in this guide that any hook, structure or length raises retention. What exists is
YouTube's own definition of a 30-second "Intro" measure [2], anecdotal creator advice [6], vendor benchmarks
[7], one analysis of online-course dropouts [8], an unauthenticated leaked memo [9], and surveys and
observational studies that measure stated preference or views per day, not retention [10] [11]. Treat every
number below as one source's report, and every hook rule as practitioner opinion.

## Anatomy and conventions

### The file the plugin reads

A script is Markdown with `form: youtube` in the front matter and an optional `target:`. A heading or
paragraph that begins `m:ss–m:ss` opens a segment, and the words that follow, up to the next segment, are that
segment's words.

```markdown
---
form: youtube
---

# Why your glasses come out cloudy

## 0:00–0:06

VISUAL: Two glasses under a lamp. One is clear. One is hazy.

VO: Same dishwasher, same shelf, same load. One glass is fine. The other is ruined.

<!-- This note is not spoken and is not counted. -->
```

- **Directions are not speech.** A line that starts with `VISUAL:`, `B-ROLL:`, `ON SCREEN:`, `SFX:`, `MUSIC:`,
  `TEXT:`, `GRAPHIC:`, `SHOT:` or `CUT TO:` is dropped from the word count. The cue must be in capitals at the
  start of the line.
- **Labels are stripped.** `VO:`, `NARRATOR:`, `HOST:` and `VOICEOVER:` come off before counting.
- **Notes and titles are not counted.** A paragraph that is only `[text in brackets]`, an HTML comment and a
  `#` heading are not speech.
- **Ranges accept minutes or hours.** `0:00–0:06`, `75:00–76:00` and `1:02:00–1:03:00` work with an en dash,
  em dash or hyphen. Seconds and hour-format minutes must be 00–59. Malformed ranges get a source-line
  warning, and timestamps are stripped from spoken text. Check the segments in `prose measure`.

`prose parse <file>` shows how each block was classified and on which line; `prose measure <file>` shows the
spoken words, the estimated runtime and, per segment, the start, end, seconds, words and words per minute.

### The promise and the payoff

The title and thumbnail make a promise before the script starts. The first seconds either keep it or break it,
so the promise is part of the script's job.

- **The platform reads the opening that way.** YouTube defines Intro as the share of viewers still watching
  after the first 30 seconds, and lists as a reason for a high one that the first 30 seconds matched the
  viewer's expectation of the thumbnail and title [2]. That is the company's definition of its own report, not
  a study of what causes retention.
- **Broken promises are removed.** YouTube defines egregious clickbait as a title or thumbnail with "promises
  or claims that aren't delivered within the video itself". It targets broken promises, not curiosity or
  enticing packaging in general [3].
- **Enticing and honest can go together.** Derek Muller of Veritasium argues that clickable packaging often
  describes a video better than a plain topic label, which reaches only people who already know the topic. His
  evidence is his own channel's uncontrolled results [12]. A leaked memo says packaging sets expectations, and
  a video that misses them makes viewers "feel like you were lied to and click off" [9]; it is unauthenticated
  advice for large-budget challenge videos.
- **Viewers say they dislike the broken kind.** In a survey of more than 5,000 viewers of German science
  channels, 69% called clickbait annoying or very annoying: self-reported, from self-selected fans [11].

Maintainer judgement: before writing, list every concrete claim in the title and thumbnail text, and put each
one in the script, the first inside the first 30 seconds. The plugin cannot do this: the thumbnail is not in
the file and the title may not be. `youtube.promise-delivery` is a judgement rule that lint prints for you to
answer, and nothing checks the answer.

### The opening and hooks

What is measured about the start differs by source, and the measures do not agree on how long "the start" is:
YouTube's Intro is the first 30 seconds [2]; Wistia, a video-hosting vendor, calls the first 2% the nose and
reports an average nose drop of 4.9% for 1-to-2-minute videos and 17.3% for 5-to-10-minute ones, with no
sample or method disclosed [7]; in online-course lectures 36.6% of dropouts came within the first 3% of the
video, and the authors note autoplay may inflate that [8]; the memo says the first minute has the most loss
[9]. They agree that viewers leave fastest at the start. YouTube adds that audience sizes typically decrease
over a video, so compelling content that comes late should move earlier [2].

**Hook types.** A 2014 YouTube creator post names four openings: a question, a branded flourish, telling
viewers what they will see so that "within the first five seconds the viewer knows exactly what this video
will be", and a cold open that jumps right into action [6]. The post is anecdotal and gives no data.

**What the sources do not show.** No source here compares hook types or tests that any of them raises
retention. Convention: the four types are what working creators reach for. Maintainer judgement: a question
hook needs a video that answers the question, and a cold open needs to lead quickly to the promised subject,
so choose the hook the promise suggests and judge it by whether the first 30 seconds contain the first real
payoff, not by its type.

**Tell, then show.** The 2014 post says tell viewers what they will see; the memo says to stop telling and
start showing by minutes 1 to 3 [9]. Maintainer judgement: these do not conflict. A short statement of the
promise comes first and a demonstration follows it.

**Open on the wrong idea, for explainers.** Muller and Sharma report that showing students common
misconceptions in multimedia, even without interaction, can help them overcome them. Only their abstract was
available: it gives no effect sizes, materials or conditions [13]. Maintainer judgement: for a teaching video,
state the common wrong answer, show it fails, then give the right one.

**Branding.** The 2014 post recommends an energetic branded opening; Wistia advises testing the removal of
intro graphics and logo sequences [7]. Both are weak sources. Maintainer judgement: show the subject before
any logo card, and keep any brand mark small.

### Structure, segments and chapters

A script is a list of segments. A segment is one beat: one idea, one stretch of picture, one time window.

**The middle.** The memo, unauthenticated and tuned to challenge entertainment, puts "re-engagements" around
minutes 3 and 6 and calls the back half a lull where long explanations can go [9]. In the online-course data,
61% of the interaction peaks (spikes of pausing or replaying) in a sample of 80 videos involved a visual
transition, and the authors advise avoiding abrupt ones [8]. Maintainer judgement: in a long video give each
few minutes its own question, reveal or change of scene, and write the change into a segment so that it is
planned.

**The ending.** Two pieces of advice conflict. The memo wants abrupt endings with no signal that the video is
ending [9]. YouTube's end screens fill the last 5 to 20 seconds of a video, need a video of at least 25
seconds, and the help page says to consider the last 20 seconds when editing [14]. The memo's aim is watch
time and the end screen's is the next click. Maintainer judgement: if end screens are planned, leave the last
20 seconds free of new information, and do not announce a summary before the payoff.

**Chapters.** Chapters are a list in the video description. The rules are mechanical: the first timestamp must
be `00:00`, the list needs at least three timestamps in ascending order, and each chapter must be at least 10
seconds long. A list you write overrides automatic chapters, which not every video gets [15]. The help page
gives no advice on chapter length and no source reports whether chapters change retention. Segments can become
chapters if the three rules hold, but a segment under 10 seconds cannot stand alone, so merge short beats. The
plugin does not check a chapter list; read the start times from `prose measure` and check the rules by hand.

### The script grid

The working form of a narration-led script is a grid of timed beats. One team that made a short science video
built a table with columns for the question, time, text, keywords and scenes, timed each row at 150 spoken
words per minute, and asked of each row whether its footage exists, must be shot or needs a licence. They
rehearsed the narration aloud and recorded two to three takes of each paragraph [1]. That is one project's
method; it shows a workable layout, not that the layout improves videos, and none of this guide's sources
defines a standard two-column "AV script". In this plugin the grid is the segment: a time heading, a `VISUAL:`
line and the `VO:` lines. Kurzgesagt says it records narration first and times the animation to it, and that a
script can take about a dozen drafts [16]; that is a self-description with no outcome data. Maintainer
judgement: when the picture is expensive, fix the words and their timing first.

### Spoken language for scripts

A viewer cannot re-read. A Congressional Research Service guide for speechwriters gives the rules that carry
over to narration [17].

- **Short sentences.** It puts the average spoken sentence at 8 to 16 words and says longer ones are harder to
  follow by ear. These are cited style authorities' figures, not tested limits. `spoken.sentence.max` warns
  above 16 words for this form too, and that threshold is this plugin's choice.
- **Simple connections and repetition.** Complex sentences "can be clarified by repeating key words and using
  simple connections", such as *and*, *for*, *because* and *but*, and the speaker "states, restates, and
  states again in different ways" the central themes. In a video that is signposting: say what is coming, say
  it, and say what it meant.
- **Punctuate for breath.** It says to punctuate for the lungs and to declaim each long sentence aloud. `prose
  measure` reports the longest breath unit, the longest run of words between marks such as commas, as a proxy
  for that test. The same guide calls "Dick-and-Jane simplicity" an extreme to avoid.

Convention: use contractions and plain words, as a person speaking would. Maintainer judgement: write second
person for tutorials, name each on-screen action as it happens, avoid idioms a captioner would have to
explain, and spell interface labels as the interface does. `style.echo` flags a three-word phrase repeated
three times and does not exempt deliberate repetition in this form; it is an info finding, so decide whether
the echo is a refrain or a habit.

### Voice-over and on-camera

**Voice-over** lets the words be written and timed to the picture; the risk is narration that describes what
the viewer can already see. Maintainer judgement: say what the picture cannot show. **On-camera** puts a
person in the picture. In a randomised experiment with 515 participants, a scientist presenting their own
research was rated more expert than a third-party presenter, and viewers more often recalled a person; only
the abstract was read, and it does not test hooks [18]. Maintainer judgement: if the speaker has a real stake
in the subject, say so early, and write on-camera lines the way the host speaks.

### Captions and accessibility

Captions are required for prerecorded audio in WCAG 2.2 success criterion 1.2.2 (Level A), including
meaningful sounds and speaker identification. The guidance says audio may be synthetic, so a text-to-speech
track needs captions too [19]. A script is the best source for the captions: they come from known words and
not from recognition.

Caption speed is a different quantity from speech speed, and the difference matters to this plugin. The BBC
recommends subtitles at 160 to 180 words per minute (about 0.33 to 0.375 seconds a word). That is a reading
speed for subtitles, not a measure of how fast people speak, and the BBC says viewers tend to prefer verbatim
subtitles, so the rate may be adjusted to the programme; above about that speed some editing is expected [20].
The Described and Captioned Media Program caps educational captions at 130, 140 and 160 words per minute by
level [21].

The plugin's pace rule uses the BBC figure only as a reference: the cap of 180 is this plugin's choice, so
that spoken segments can be captioned legibly (see Length and timing). No source gives 180 as a limit on
speech.

### Sponsor reads and disclosures

A sponsor read is an endorsement, and the disclosure belongs in the script. Pointers only; none of this is
legal advice, and the rules differ outside the United States.

- **US regulator staff guidance.** Disclose any financial, employment, personal or family relationship with a
  brand, including free products. The disclosure should be "placed with the endorsement message itself" and
  hard to miss. For video it "should be in the video and not just in the description", and viewers are more
  likely to notice disclosures made in both audio and video. Plain words such as "ad" or "sponsored" work;
  "sp", "spon" and "collab" do not [22]. The page is staff guidance, not a statute.
- **The platform label is an addition.** YouTube's paid promotion setting adds a label at the start of the
  video and leaves the creator responsible for applicable legal requirements [23]. The regulator's page says
  not to rely on a platform tool alone [22].
- **How it sounds.** The memo says a sponsor segment read flatly shows as a crater in the retention graph and
  an integrated one makes a smaller dip [9]; it is anecdotal. Maintainer judgement: say the disclosure in the
  first sentence of the sponsored segment, show it on screen, say what you did with the product, and keep the
  read in your own voice.

### Fair use and made for kids

Two pointers, nothing more. YouTube explains US fair use in four factors and says credit to the owner, "no
infringement intended" and "for entertainment purposes only" do not by themselves make a use fair, and that
Content ID cannot decide fair use [24]. The US Copyright Office states the same factors, says fair use is
decided case by case and gives no individual advice [25]. Maintainer judgement: a script that quotes someone's
work should add its own commentary and not only replay the work. Every creator must declare whether content is
made for kids; YouTube may override the choice and says not to rely on its systems to set it [26]. Its test
for what counts is in another article this guide does not cover: read it, or ask counsel, if children may be
in the audience.

## Length and timing

**Words to seconds.** The plugin plans a `youtube` script at 160 words per minute. That is its choice, a
little above the two figures nearest to it: one production team planned at 150 words per minute [1], and
online-course speakers averaged 156 with a spread from 48 to 254 [4]. The speechwriting guide's rule of thumb
for live speeches is about 130 words per minute, with speakers ranging from 115 to 175 [17]. Scripted talks
run faster than lectures: a comparison of 49 TED talks and 28 lecture series found TED speech significantly
faster, in an abstract that gives no mean rates [27]. So a rate is a planning figure, and a person's own
recorded pace is better than any of them.

At 160 words per minute, 10 seconds holds about 27 words and a minute holds 160; at the 180 cap, 30 and 180.

**Set the pace to the real narrator.** `wpm` can be set in the draft's front matter (`wpm: 140`), in
`.agent-prose/project.json` for a form (`forms.youtube.wpm`) or for the whole project (`wpm`), and the most
specific wins. It changes the runtime estimates and `length.target`, and does not change the pace cap, which
stays at 180. An invalid value stops the run with an error, because every figure after it would be wrong.

**What `youtube.segment.pace` does.** For each timestamped segment it divides the spoken words by the
segment's seconds and warns above 180 words per minute, saying how many words to cut. A segment whose end is
not after its start gets a warning that it has no duration. Source lines accept `m:ss` (minutes may exceed 99)
or `h:mm:ss`; seconds and hour-format minutes must be 00–59, and malformed ranges warn at their source line.
Timestamps and directions are not counted. The BBC recommends
subtitles at 160 to 180 words per minute [20]; that is a subtitle reading speed, and the 180 cap on spoken
segments is this plugin's own choice, made so that they can be captioned legibly. The rule does not say a
segment is too slow, and passing it does not make a segment speakable: 170 words per minute in long sentences
can still be unsayable. Maintainer judgement: for a segment with new visuals or a demonstration, plan well
under the cap and leave the picture room.

**Declared length.** `target: 45 seconds` (or minutes, or words) is compared with the runtime estimated from
spoken words at the form's `wpm`, within a tolerance of 10% that is this plugin's choice. It is not compared
with the last timestamp. A script with timestamps to 0:45 and 113 spoken words is estimated at 42 seconds at
160 words per minute, and the two figures can disagree; report both.

**How long a video should be.** The evidence is thin and measures other things. Across 441 Brazilian science
videos, views per day were unrelated to length (r = 0.005); this is observational and one language [10]. In
online-course videos, median engagement was at most 6 minutes whatever the video's length [4]. In a survey of
more than 5,000 viewers of science channels, 84% put the ideal length between 7 and 15 minutes, which is
stated preference from self-selected fans [11]. A review describes explainers as one to three minutes [5].
These do not agree and do not need to. Maintainer judgement: set the length by what the promise takes to
deliver, and cut anything that does not serve it.

## What good looks like

The examples are written for this guide; the household facts in them are illustrative, and the sponsor is made
up. Each Markdown example passes `prose lint` with `--form youtube` with no errors and no warnings. A bad
example is shown as plain text, with the warning count that `prose lint` gave it.

### A cold open that keeps the promise

A video titled "Why your glasses come out cloudy" promises a cause and a fix. The bad opening below is the
usual one: a greeting, the topic, a request, and a stall.

<!-- bad example, on purpose: the guide's tests lint it as youtube and expect 0 warnings -->

```text
## 0:00–0:20

VISUAL: Channel logo animation.

VO: Hey everyone, welcome back to the channel. Today I'll be talking about cloudy glasses. Before we start,
please like and subscribe. A lot of you have asked me about this, so let's get into it.
```

Measured here: `prose lint` reports no warnings. Every sentence is short and the pace is 105 words per minute,
so the checks pass. After 20 seconds the viewer still has no cause and no fix, and the first 30 seconds are
what YouTube's Intro measure counts [2]. Lint cannot see this: only `youtube.promise-delivery` asks the
question, and it is a judgement.

The rewrite shows the problem in the first seconds, names the promise, runs the test on screen, and gives the
first payoff before the 30-second mark. It is a misconception-first explainer: the common answer, then why it
is sometimes wrong.

```markdown
---
form: youtube
target: 45 seconds
---

# Why your glasses come out cloudy

## 0:00–0:06

VISUAL: Two glasses under a lamp. One is clear. One is hazy.

VO: Same dishwasher, same shelf, same load. One glass is fine. The other is ruined.

## 0:06–0:15

VISUAL: A hand lowers the hazy glass into a bowl of white vinegar.

VO: Here's a ten-second test. It tells you which kind of cloudy you have, and whether you can fix it.

## 0:15–0:26

VISUAL: The glass comes out of the bowl. The haze is gone.

VO: Most people blame the soap. Sometimes that's right. Here, the haze was minerals from the water. They dry
on the glass as a film, and vinegar dissolves it.

## 0:26–0:36

VISUAL: A second glass comes out of the bowl, still hazy.

VO: If the haze stays, it isn't a film. The glass itself is etched. Too much detergent in soft water can do
that. Etching can't be wiped off.

## 0:36–0:45

VISUAL: A detergent dispenser with its fill line marked.

VO: So the fix depends on the test. Film means vinegar, or a softener. Etching means less detergent. Next, how
to read your water report.
```

Measured here: this script is 113 spoken words in 45 seconds of timeline, between 133 and 162 words per minute
in every segment, and `prose lint` estimates it at 0.71 minutes at 160 words per minute, inside the 10%
tolerance of the 45-second target. The promise is named at 0:06 and the first payoff arrives at 0:15.

### A segment too dense for its time

<!-- bad example, on purpose: the guide's tests lint it as youtube and expect 2 warnings -->

```text
## 0:00–0:10

VISUAL: Two glasses under a lamp.

VO: Cloudy glasses come from either mineral deposits left by hard water or from etching caused by too much
detergent in soft water, and the way to tell the two apart is a simple vinegar soak that takes about ten
seconds, which I'll show you now.
```

Measured here: `prose lint` reports 2 warnings. `youtube.segment.pace` says 45 words in 10 seconds is 270
words per minute, over the cap of 180, and suggests cutting about 15 words. `spoken.sentence.max` says one
sentence has 46 words, over the limit of 16. Splitting at each clause fixes the second warning, and moving the
rest to a later segment fixes the first.

```markdown
---
form: youtube
---

## 0:00–0:08

VISUAL: Two glasses under a lamp. One is hazy.

VO: Cloudy glasses have two causes. Hard water leaves a mineral film. Too much detergent etches the glass.

## 0:08–0:18

VISUAL: A hand lowers the hazy glass into a bowl of white vinegar.

VO: A ten-second vinegar soak tells them apart. Watch the glass.
```

Measured here: this version has 28 spoken words across 18 seconds and no warnings. The viewer gets one idea
per sentence and the test is shown on screen.

### A sponsor read with its disclosure

<!-- bad example, on purpose: the guide's tests lint it as youtube and expect 0 warnings -->

```text
## 0:42–1:00

VO: Speaking of water, this video is made possible by Clearwater Test Strips. Their strips are amazing, and I use them every single week. Click the link below and get your own.

## 9:40–9:48

VO: Thanks again to Clearwater for sponsoring this video.
```

Measured here: `prose lint` reports no warnings. The disclosure is a thank-you at 9:40, which the regulator
guidance says is likely to be missed when it appears only at the end of a video [22]. Lint cannot detect a
missing or late disclosure. The good read says it first, shows it, and says what the sponsor did.

```markdown
---
form: youtube
---

## 0:42–1:00

VISUAL: A test strip dipped in tap water. The strip turns a darker colour.

TEXT: Ad. Sponsored by Clearwater Test Strips.

VO: This part is an ad. Clearwater Test Strips paid for this segment and sent me the strips. I used them for
the water test you just saw. The strip turns darker as the water gets harder. I'd have bought the same kind,
but you can judge that for yourself.
```

### A chapter list

The first list fails the platform's rules, and nothing in the plugin catches it.

<!-- bad example, on purpose: the guide's tests lint it as youtube and expect 0 warnings -->

```text
## Chapters

- 0:05 Intro
- 0:12 The test
- 0:20 Results
```

Measured here: `prose lint` reports no warnings, because it does not read chapter lists. By the platform's
rules [15] the list fails three ways: it does not start at 00:00, the first two chapters are shorter than 10
seconds, and "Intro" says nothing about the content. Read the starts from `prose measure`, merge short beats
into one chapter, and name each chapter for what the viewer will get.

```markdown
---
form: youtube
---

## Chapters

- 00:00 Same dishwasher, one ruined glass
- 00:40 The ten-second vinegar test
- 02:15 Why hard water leaves a film
- 04:30 Why soft water etches glass
- 06:50 How to read your water report
- 09:10 How much detergent to use
- 11:20 What to buy and what to skip
```

This list is for a longer version of the video. It starts at 00:00, has seven timestamps in ascending order
and no chapter under 10 seconds; the plugin checked none of that.

## Common failures and the habits behind them

### Throat-clearing

The habit is to start as a live talk starts: a greeting, the channel name, "in this video I will". Wistia
advises showing and proving the point rather than stating it, and not talking about yourself in the opening
[7]; the memo lists not front-loading interesting material as a cause of early loss [9]. No source gives a
word limit. Fix: delete everything before the first fact, image or question the promise needs.

### A promise the video does not keep

The habit is to write the title and thumbnail for clicks and the script for the topic. YouTube removes the
egregious cases [3], and the memo's own example is a "world's largest" claim the video does not establish [9].
Fix: for each claim in the packaging, find the second where the viewer sees it true.

### Written sentences, read aloud

The habit is to write an essay and read it: long sentences, written connectors, nowhere to breathe [17]. Fix:
read each long sentence aloud, split it at a clause, and let `spoken.sentence.max` find what is left.

### Filling the time

The habit is to treat a time window as a budget of words. The result is the dense segment above: no room for
the picture, and captions cannot keep up. Fix: plan each segment's words from its seconds before writing it,
and let a segment end on a silent shot when the picture is the point.

### Deciding by folklore

The habit is to repeat a number from a growth article: a hook length, a minute for a re-engagement, an ideal
length. The sources here are anecdote, vendor data and observational studies, and several measure views, not
retention [10] [7]. Fix: say where a number came from, and read drop-off on the real video when the channel's
analytics exist.

### A flat or hidden sponsor read, and invented support

The habit is to treat a read as an interruption and its disclosure as a formality; the regulator wants it with
the endorsement itself [22]. Fix: put it at the start of the segment, in the voice and on screen. A related
habit, especially in generated scripts, is a confident statistic or quote with no source. Fix: a script that
names a figure or quotes someone must be able to say where it came from, and that check is by hand.

## How to revise

Revise in this order. The earlier steps decide whether the video keeps its promise, and the later ones decide
how it sounds.

1. **Write down the promise.** List what the title and thumbnail claim. If you do not have them, ask the owner
   before drafting; the plugin cannot see them.
2. **Find the payoff.** Mark the first second where the viewer sees a promised thing. If it falls after 30
   seconds, move it earlier, and cut the preamble (greeting, channel name, "in this video") in front of it.
3. **Run `prose lint <file> --form youtube`.** Fix every error. Read each warning: a segment over the pace
   cap, a sentence over 16 words, a length off target. Fix it, or say why it stays. Then answer the judgement
   rule lint lists.
4. **Run `prose measure <file>`.** Read each segment's words per minute, not only the offenders. A run of
   segments near the cap is a script with no room for the picture.
5. **Read it aloud.** Say each sentence once at speaking pace, and rewrite every place you run out of breath
   or stumble.
6. **Check the disclosures and the quotes.** Every sponsor segment has a spoken and on-screen disclosure at
   its start, quoted material adds commentary, and every figure has a source.
7. **Check the ending and the chapters.** If end screens are planned, the last 20 seconds hold nothing new.
   Take chapter starts from `prose measure`, merge beats under 10 seconds, start at 00:00, and name each
   chapter for its content.
8. **Report numbers.** Say the spoken words, the estimated minutes and the wpm used, each segment's pace, and
   which warnings remain. Do not write "paced to fit" without a run to show it.

## Rules that apply

The table is generated from `craft/rules.json` for the `youtube` form. The pace and sentence rules check a
script's surface; whether the opening keeps the promise is for the writer and the owner. A threshold marked
"This plugin's choice" is not a source's figure.

<!-- generated:rules begin (npm run guides) -->
| Rule | What it checks | Severity | Threshold | Threshold basis | Run by |
|---|---|---|---|---|---|
| `spoken.sentence.max` | Spoken sentences over 16 words are flagged. | warn | 16 words | This plugin's choice (derived) | lint |
| `readability.grade.report` | Reading grade is reported, never targeted. | info | none | n/a | lint |
| `style.passive.report` | Passive voice is counted and reported, not banned. | info | none | n/a | lint |
| `style.echo` | A three-word phrase repeated 3 or more times is flagged. | info | 3 occurrences | This plugin's choice (derived) | lint |
| `ai.copula-avoidance` | 'serves as', 'stands as', 'functions as' in place of is/are are flagged. | info | none | n/a | lint |
| `ai.artifact` | No leaked chatbot markup or unfilled placeholders. | error | none | n/a | lint |
| `draft.placeholders` | Bracketed placeholders are listed until filled. | info | none | n/a | lint |
| `ai.vocabulary` | Three or more distinct era-tagged AI vocabulary terms in one draft are flagged. | warn | 3 distinct terms | This plugin's choice (derived) | lint |
| `spoken.duration.report` | Spoken drafts report read-aloud time at the form's planning WPM. | info | none | n/a | lint |
| `youtube.promise-delivery` | The first 30 seconds confirm the title and thumbnail promise, and the video delivers it. | warn | 30 seconds | A source's figure | judgement |
| `length.target` | A draft with a declared target lands within ±10% of it; page-derived script minute targets use the provisional ±20% timing band. | warn | 0.1 fraction | This plugin's choice (derived) | lint |
| `youtube.segment.pace` | No timestamped segment runs faster than 180 words per minute. | warn | 180 wpm | This plugin's choice (derived) | lint |
| `voice.targets` | Each voiced speaker's measured style stays inside the voice bible's target ranges. | warn | none | n/a | lint |
| `voice.bible-valid` | Every voice bible in the project loads: valid YAML and schema, id matching the file name, unique ids, and each speaker claimed by one bible. | error | none | n/a | lint |
| `voice.banned` | A speaker never uses a word their voice bible bans. | warn | none | n/a | lint |
| `voice.unvoiced` | In a project with voice bibles, every speaker resolves to one. | info | none | n/a | lint |
<!-- generated:rules end -->

## Sources

Numbers in brackets in the text refer to this list. Practitioner and platform sources report their authors'
experience or rules; they were not tested.

<!-- generated:sources begin (npm run guides) -->
1. Miguel Ferreira et al., 2023. [Video abstract production guide](https://www.frontiersin.org/articles/10.3389/fcomm.2023.1060567/full) (practitioner; id `ferreira-2023`). One team's account of one short science video: a script table with time, text and footage columns, planned at 150 spoken words per minute.
2. YouTube Help. [Measure key moments for audience retention](https://support.google.com/youtube/answer/9314415) (platform-doc; id `youtube-key-moments`). The intro metric is retention at 30 seconds, read as whether the opening matched the title and thumbnail.
3. YouTube, 2024. [Strengthening enforcement against egregious clickbait on YouTube](https://blog.google/intl/en-in/products/platforms/strengthening-enforcement-against-egregious-clickbait-on-youtube/) (platform-doc; id `youtube-clickbait`). Titles and thumbnails must not promise what the video does not deliver.
4. Philip J. Guo, Juho Kim and Rob Rubin, 2014. [How Video Production Affects Student Engagement: An Empirical Study of MOOC Videos](https://pg.ucsd.edu/publications/edX-MOOC-video-production-and-engagement_LAS-2014.pdf) (peer-reviewed; id `guo-kim-rubin-2014`). Correlational MOOC data: median engagement at most 6 minutes whatever the length; tutorials watched 2 to 3 minutes; speaking rates from 48 to 254 wpm (mean 156).
5. Anna Schorn, 2022. [Online explainer videos: Features, benefits, and effects](https://www.frontiersin.org/articles/10.3389/fcomm.2022.1034199/full) (review; id `schorn-2022`). A mini review of short explainers (one to three minutes): informal, voiced over, with a three-act structure described rather than tested.
6. YouTube Creator Blog, 2014. [Four tips to hook your viewers on YouTube](https://blog.youtube/creator-and-artist-stories/four-tips-to-hook-your-viewers-on/) (practitioner; id `youtube-hook-tips-2014`). Anecdotal creator advice from 2014, with no data: open with a question, a branded flourish, a statement of what the video is, or a cold open.
7. Alyce Currier, Ezra Fishman and Lisa Marinelli (Wistia), 2020. [Understanding Audience Retention](https://wistia.com/learn/marketing/understanding-audience-retention) (practitioner; id `wistia-retention`). Vendor benchmarks with no disclosed sample or method: the first 2% of a video loses the most viewers.
8. Juho Kim et al., 2014. [Understanding In-Video Dropouts and Interaction Peaks in Online Lecture Videos](https://pg.ucsd.edu/publications/edX-MOOC-in-video-dropouts-peaks_LAS-2014.pdf) (peer-reviewed; id `kim-dropouts-2014`). edX lecture videos from 2012 with autoplay: 36.6% of dropouts came in the first 3% of a video; 61% of sampled interaction peaks involved a visual transition.
9. Jimmy Donaldson (MrBeast), as reproduced by Alexander Jarvis, 2024. [MEMO: How to succeed in MrBeast production](https://www.alexanderjarvis.com/memo-how-to-succeed-in-mrbeast-production/) (practitioner; id `mrbeast-memo`). A leaked internal memo that has not been authenticated; advice tuned to large-budget challenge entertainment, from internal analytics shown as screenshots.
10. Raphaela Martins Velho, Amanda Merian Freitas Mendes and Caio Lucidius Naberezny Azevedo, 2020. [Communicating Science With YouTube Videos: How Nine Factors Relate to and Affect Video Views](https://www.frontiersin.org/articles/10.3389/fcomm.2020.567606/full) (peer-reviewed; id `velho-2020`). Observational study of 441 Brazilian science videos: views per day were unrelated to video length (r = 0.005).
11. Jacob Beautemps and Andre Bresges, 2021. [What Comprises a Successful Educational Science YouTube Video? A Five-Thousand User Survey on Viewing Behaviors and Self-Perceived Importance of Various Variables Controlled by Content Creators](https://www.frontiersin.org/articles/10.3389/fcomm.2020.600595/full) (peer-reviewed; id `beautemps-bresges-2021`). Survey of more than 5,000 viewers of German science channels: stated preferences of self-selected fans, not measured behaviour.
12. Derek Muller (Veritasium), 2021. [Clickbait is Unreasonably Effective](https://www.youtube.com/watch?v=S2xHZPH5Sng) (practitioner; id `veritasium-clickbait-2021`). One creator's uncontrolled anecdotes: clickable packaging can describe a video better than a plain topic label does.
13. Derek A. Muller and Manjula D. Sharma. [Tackling misconceptions in introductory physics using multimedia presentations](https://openjournals.library.sydney.edu.au/IISME/article/view/6345) (peer-reviewed; id `muller-sharma-misconceptions`). Abstract only: showing students common misconceptions in multimedia, even non-interactively, can help them overcome them; no effect sizes were available.
14. YouTube Help. [Add end screens to videos](https://support.google.com/youtube/answer/6388789) (platform-doc; id `youtube-end-screens`). End screens fill the last 5 to 20 seconds, need a video of at least 25 seconds, and the help page advises leaving room in the last 20 seconds.
15. YouTube Help. [Video chapters](https://support.google.com/youtube/answer/9884579) (platform-doc; id `youtube-chapters`). A chapter list starts at 00:00, has at least three timestamps in ascending order, and each chapter is at least 10 seconds; a manual list overrides automatic chapters.
16. Kurzgesagt. [About our YouTube channel](https://kurzgesagt.org/youtube/) (practitioner; id `kurzgesagt-about`). A channel describing its own process: scripts take about a dozen drafts and the recorded narration times the animation; no outcome data.
17. Congressional Research Service, 2007. [Speechwriting in Perspective: A Brief Guide to Effective and Persuasive Communication (98-170)](https://www.everycrsreport.com/files/20070412_98-170_9a7487f68c4e6092a69af51d49414e4d8d654c3f.html) (review; id `crs-speechwriting`). Spoken sentences average 8-16 words; ~2,600 words per 20 minutes; speakers range 115-175 wpm.
18. Selina A. Ruzi, Nicole M. Lee and Adrian A. Smith, 2021. [Testing how different narrative perspectives achieve communication objectives and goals in online natural science videos](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0257866) (peer-reviewed; id `ruzi-2021`). Randomised online experiment (515 participants, abstract-level reading): a scientist presenting their own work was rated more expert than a third-party presenter.
19. W3C. [Understanding Success Criterion 1.2.2: Captions (Prerecorded)](https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html) (standard; id `wcag-captions`). Level A: captions for prerecorded audio in synchronized media, including speaker identification and meaningful sounds; synthetic speech counts as audio.
20. BBC. [BBC Subtitle Guidelines](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/) (style-guide; id `bbc-subtitles`). Recommended subtitle reading speed is 160-180 words per minute (a reading speed for subtitles, not a speech rate).
21. Described and Captioned Media Program. [Captioning Key: Presentation Rate](https://dcmp.org/learn/captioningkey/601) (style-guide; id `dcmp-rate`). Caps educational captions at 130, 140 and 160 words per minute by level.
22. US Federal Trade Commission, 2019. [Disclosures 101 for Social Media Influencers](https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers) (standard; id `ftc-disclosures-101`). Staff guidance for US law, not a legal opinion: disclose a brand relationship with the endorsement itself, in the video and not only the description.
23. YouTube Help. [Add branded content restrictions and disclosure labels](https://support.google.com/youtube/answer/154235) (platform-doc; id `youtube-branded-content`). The paid promotion setting adds a label at the start of the video; creators remain responsible for applicable legal requirements.
24. YouTube Help. [Fair use on YouTube](https://support.google.com/youtube/answer/9783148) (platform-doc; id `youtube-fair-use`). US fair use in four factors; credit, 'no infringement intended' and a disclaimer do not make a use fair; Content ID cannot decide fair use.
25. US Copyright Office. [Fair Use Index](https://www.copyright.gov/fair-use/) (standard; id `copyright-office-fair-use`). The four factors; fair use is decided case by case, and the Office gives no individual advice.
26. YouTube Help. [Set your channel or video's audience](https://support.google.com/youtube/answer/9527654) (platform-doc; id `youtube-made-for-kids`). Every creator must declare whether content is made for kids; YouTube may override the choice.
27. Wingrove, 2017. [How suitable are TED talks for academic listening?](https://research.chalmers.se/en/publication/547664) (peer-reviewed; id `wingrove-ted`). TED talks are significantly faster than lectures.
<!-- generated:sources end -->
