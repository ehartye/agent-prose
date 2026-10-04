---
family: instruction-docs
title: Instructions and technical docs
forms: [instructions, tech-doc]
reviewed: "2026-10-04"
sources: [diataxis-how-to, diataxis-reference, nng-how-users-read, nng-f-pattern, google-global-audience,
  google-accessible-docs, google-docguide-practices, pinker-curse, williams-farkas, uddin-robillard-2015,
  eiler-1997, graham-2000, microsoft-steps, google-procedures, google-notices, google-voice-tone,
  microsoft-formatting, osha-1910-145, diataxis-tutorials, sre-troubleshooting, diataxis-explanation,
  google-api-comments, google-code-samples, google-readmes, wtd-docs-as-code, digitalgov-principles,
  nng-plain-language-experts, gov-uk-25-words, mac-readability-rct, language-portal-readability,
  nng-five-users]
---
# Instructions and technical docs: a craft reference

Read the section you need, not the whole guide: `prose guide instruction-docs --section <name>`. How the
text is marked: a number in brackets, such as [3], points to the Sources list at the end. "Convention:"
marks a habit of the trade that no source tested. "Maintainer judgement:" marks advice with no source
behind it. "Measured here:" marks a number from a run of this plugin on the guide's own examples; it shows
that a problem happens, not how often.

## What it is and who reads or hears it

Instructions and technical docs are read by someone who is trying to do something. Two forms share this
guide. Both are Markdown read forms; nothing in them is spoken, so no spoken-time rule applies.

- **Instructions** (`instructions`) tell one person how to get one thing done: a setup, a reset, a how-to,
  a troubleshooting page, a runbook. The reader has the task open in another window or in their hands.
- **Technical docs** (`tech-doc`) cover what surrounds the task: reference for an API or a command, an
  explanation of a design, a README, a tutorial. Diátaxis sorts them into four kinds by what the reader is
  doing (learning, doing, consulting, understanding) and says not to mix them [1][2].

One page often has several readers.

1. **The person doing the task** wants the next action and a way to tell that it worked. NN/g reported in
   1997 that 79 percent of its test users always scanned a new page and 16 percent read word by word [3].
   That was a short early test, but later eyetracking agrees: with no strong cues, readers scan [4].
2. **The person consulting** wants one fact fast: "One hardly *reads* reference material; one *consults*
   it" [2].
3. **The translator and the screen-reader user** need plain structure: short sentences, consistent terms,
   real headings and link text that makes sense out of context [5][6].
4. **The maintainer** inherits the page: "A small set of fresh and accurate docs is better than a large
   assembly of 'documentation' in various states of disrepair" [7].

Two ideas run through the whole guide.

- **One page, one job.** A page that teaches, directs and describes at once fails all three readers.
  Diátaxis names the four jobs and what each keeps out [1]. It is a framework argued from principle; none
  of its pages cites a study of readers.
- **The author is the worst tester.** Pinker calls the curse of knowledge "the chief contributor to opaque
  writing": writers forget that readers lack "the intermediate steps that seem to them to be too obvious
  to mention" [8]. Williams and Farkas say the same of manuals: "authors inadvertently leave out key
  assumptions" because they know the software too well [9].

How far to trust the sources. Most are house style guides (Google, Microsoft), a practitioner framework
(Diátaxis) and practitioner articles: specific and mostly in agreement, but none tested on readers of
instructions. The studies are small or secondhand: NN/g's own eyetracking and usability tests, one survey
of staff at a single company [10], and minimalism research reached through a critique and two secondary
reviews [11][12]. No source tests whether warnings change what readers do, and none is about writing
runbooks.

### Using the plugin

- Start the file with front matter `form: instructions` or `form: tech-doc`. Steps are a numbered list.
- `prose lint <file>` runs the rules in the table at the end. `procedure.step.imperative` flags a step
  whose opening word, after any short location phrase, is on a short list of non-verbs (You, The, A, This,
  It, Please and a few more); it does not parse verbs. `procedure.filler` knows five phrases: please,
  simply, it's easy, quickly, at this time. It misses "just" and a bare "easy".
- Lint does not check one action per step, order, missing prerequisites, or whether a warning comes before
  the step it governs. Those are for you, and the sections below say how.
- `prose measure <file>` reports words, sentences, the longest sentence, passive count and a reading grade
  (reported, never a target). `procedure.recovery` and `formal.supported-claims` are judgement rules: lint
  lists them and you decide. The `prose-instruct` skill writes and checks both forms.

## Anatomy and conventions

### Instructions: the parts of a procedure

**Title.** Diátaxis rates "How to integrate application performance monitoring" good, "Integrating
application performance monitoring" bad and "Application performance monitoring" very bad [1]. Microsoft
asks for task headings in parallel phrasing, such as "Create a profile" [13]. They differ on the verb form
and agree that a bare noun is not a task.

**Introduction and prerequisites.** An introductory sentence "shouldn't just repeat what the heading says"
[13]. Google drops it if the heading says it all, and does not introduce steps with a partial sentence the
steps complete: "To customize the buttons, follow these steps:" is right and "To customize the buttons:"
is not [14]. What the reader needs before a step belongs before the step, not in a note [15]. Convention:
before step 1, say what the reader needs (software, access, time) and who the page is for.

**One action per step, in order.** Google asks for one step per action, except that sequential menu
selections may share a step (**File > New > Document**), and splits a step that feels too long [14].
Microsoft adds the completing action ("OK", "Apply") and "Try to fit all the steps on the same screen"
[13]. Diátaxis orders steps by logical sequence and the reader's flow of thought [1].

**Location, goal, action, result.** Google puts the location first ("In Google Docs, click ..."), the goal
before the action ("To start a new document, click ..."), the result after the action, and any
justification after that. Where "To ..." could make a required step look optional, it uses an imperative
with a colon ("Sort the data by date:") [14]. Diátaxis recommends conditional imperatives: "If you want x,
do y" [1]. Maintainer judgement: put a condition before the action ("If the light is red, hold the
button"), because a reader who acts on the first words of a line will otherwise act before reading it.

**Imperative, plain, no filler.** Each step is a complete sentence in the imperative, unless a brief
location phrase comes first [13]. Google avoids *simply*, *It's that simple*, *It's easy* and *quickly* in
a procedure, and calls *please* "overdoing the politeness" [16]. Maintainer judgement: a reader who fails
at a step marked "simply" takes it as their own fault.

**Numbered, bulleted, formatted.** Google and Microsoft number a multi-step procedure and give a single
step a bullet [14][13]. Convention: number steps when order matters or the text points back to them;
bullet unordered requirements. Optional steps start "Optional:", and a repeated procedure is linked, not
copied [14]. Inside steps, describe the action rather than naming the interface element, bold a label that
must appear, and put typed commands in code style and placeholders in italics [17]. A menu path may use
`>`, but screen readers may skip the brackets and read "Menu Go To Folders" [13]; Maintainer judgement:
for a path that matters, also say it in words.

### Warnings, cautions and notes

| Tier | Use it when | Basis |
|---|---|---|
| Note | The point is useful, not critical; skipping it still lets the reader succeed | [15] |
| Caution | The reader should proceed carefully (Google's example: do not use a broad 0.0.0.0/0 range) | [15]; OSHA's caution sign is for a possible hazard [18] |
| Warning | "Don't do this", or the step may be irreversible: permanent data loss, money, work or security | [15]; OSHA's top tier is *danger*, for immediate danger [18] |

What this rests on, honestly. Two sources: Google's style guide for software docs, and OSHA 1910.145, a US
regulation for workplace signs and tags, not for manuals. They agree that caution is the lower tier, and
they do not define the tiers identically (Google has no danger tier). The standards for product safety
labels and manuals, ANSI Z535 and ISO 3864, were not read for this guide; if the product ships with safety
labelling, those govern. No source tested whether a warning changes what readers do.

Placement and quantity. Information the reader must have to succeed belongs in the text flow, not in a
note; a whole step is never a note; and several notices together lose their force, so reorganise the text
instead of stacking them. Google also cites an NN/g article, not read here, for the claim that readers
skip offset elements [15]. Maintainer judgement: put a warning immediately before the step it governs, say
what is lost, and say what to do first. A warning after the step arrives after the damage. Keep warnings
rare, so that each one still stands out.

### Results, failure and recovery

Say what the reader should see after a step that changes something. Diátaxis asks tutorial steps for a
visible result, expected output and hints for likely failure ("If the output doesn't show ..., you have
probably forgotten to ...") [19]. Supporting error recognition and recovery is one of the minimalist
tenets Williams and Farkas accept [9]; Eiler and Graham report it, secondhand, among Carroll's and van der
Meij's principles [11][12]. Graham also gives a share of learner time spent on errors, attributed to the
source literature and unchecked, so it is not used here.

`procedure.recovery` is the plugin's rule: every failure state says where to resume ("Go back to step 4"),
and every "nothing happens" case gives a time limit or a check. If you do not know the time, leave a
visible `[time]` placeholder; never invent one.

A troubleshooting entry. Maintainer judgement: use five parts, adapted from the SRE chapter's
problem-report frame (expected behaviour, actual behaviour and, if possible, how to reproduce it [20]):
the symptom against what was expected, the check, the cause, the fix and how to confirm it worked.

### The four kinds of technical documentation

| Kind | The reader is | Its job | Keeps out |
|---|---|---|---|
| Tutorial | Learning, with a guide [19] | Teach by doing, with a visible result early | Explanation, options, alternatives: link out |
| How-to guide | Competent, with a goal [1] | Get one task done | Explanation and exhaustive reference |
| Reference | Consulting [2] | Describe the machinery, and only describe | Instruction, opinion, explanation |
| Explanation | Wanting to understand [21] | Context, reasons, alternatives, opinion | Instruction and technical description |

Tutorials and how-to guides are the pair people confuse most. How-to guides are "wholly distinct from
tutorials", and conflating them "is at the root of many difficulties that afflict documentation" [1]. A
tutorial should work "for every user, every time", and its flaws are found only by watching real users
[19]. Explanation tends to end up "scattered in small parcels in other sections" [21].

A competing view. Williams and Farkas note that few studies test minimalism and that brevity is confounded
with guided exploration in the ones they re-read; they favour steps that include "all the information that
the author reasonably feels the reader will want or need" [9]; Diátaxis says "practical usability is more
helpful than completeness" [1]. Maintainer judgement: keep concepts out of the step list and link to them,
but never skip a step because you find it obvious without testing it on a reader.

Maintainer judgement: cheap signs of mixed kinds are numbered steps in a reference page, "you should" in
reference, a tutorial that opens with pages of background, and a how-to that stops to explain the system.
Lint sees none of them.

### API reference

Google's rule for a complete API reference: describe every class, interface and struct, every constant,
field, enum and typedef, and every method with each parameter, the return value and any exceptions [22].
Its strong suggestions: a code sample of about 5 to 20 lines at the top of each unique page; API names in
code font and linked; a class description that opens with one sentence of purpose that the name and
signature cannot give; and "for example", not "e.g.", because some generators end the short description at
the first period. A method description opens with what the action is, then why and how, prerequisites,
exceptions and dependencies such as permissions [22]. Diátaxis adds standard patterns, the product's own
structure, and short examples that illustrate without instructing [2]. Google's docguide calls method
documentation "the contract of how your code must behave" and says documented behaviour should have a test
[7].

What goes wrong. In two surveys of IBM staff, incompleteness, ambiguity and incorrectness were among the
most pressing documentation problems, and respondents cared more about content than presentation [10]. It
is one company's survey, with a garbled table in the copy read, so no counts are quoted. Maintainer
judgement: the rules above mostly secure the two top problems, complete coverage and a purposeful first
sentence.

### Code samples and READMEs

Code samples: follow the language's own style; wrap at 80 characters or fewer; mark blocks as
preformatted; show an omission with a comment in the sample's language, not "..."; and introduce a sample
with a sentence [23]. Maintainer judgement: run every sample before it ships, because a sample that does
not run is a stale doc in waiting.

READMEs: Google defines a README as "a short summary of the contents of a directory", named `README.md`
and kept in the code directory, not the docs folder. A package README includes or points to what the
package is and is for; points of contact; status (deprecated, not for general release); how to use it,
with sample code or copyable commands; and links to further docs [24]. No source tests README layouts
against reader success. Convention: the first paragraph says what the thing is and who it is for; NN/g
advises putting the most important points in the first two paragraphs [4].

### Runbooks and incident pages

No source held for this guide is about writing runbooks. The nearest is the SRE chapter on how to
troubleshoot. It says that in a major outage the first job is to make the system work as well as it can,
not to find the root cause ("fly the airplane"); that tests should have mutually exclusive outcomes,
likely causes first; that active tests can have side effects; and that notes of ideas, tests and results
should be kept [20]. Everything else in this part is Maintainer judgement. A runbook page has: when to use
it (the alert or symptom); what access and tools the reader needs; stabilise first; numbered steps, each
with its check; decision points written as "If X, go to step n"; a verification step; the rollback; who to
escalate to, when, and with what notes; and an owner. The runbook example below shows the shape.

### Docs as code, freshness and ownership

Google's docguide: change the docs in the same change as the code; delete dead docs, starting with what
you are certain is wrong; link to a guide for a common technology instead of duplicating it; and treat
design docs as archives once the code ships [7]. Write the Docs defines docs as code as using the code's
tools (issue tracker, Git, review, automated tests); its claimed benefits are community claims without
outcome data [25]. In the IBM survey, obsolete content was among six problems rated a "Blocker" at least
once [10]. Maintainer judgement: give each page an owner and a date it was last checked against the
product, and treat a page nobody owns as a candidate for deletion.

### Audience and expertise

Digital.gov's first rule is "write for your audience", and it calls the idea that you have to "dumb down"
your content a myth [26]. NN/g's expert study found that even highly educated readers "crave succinct
information that is easy to scan" (the evidence is participant quotes), that jargon helps when an expert
group shares it, and that secondary explanations can sit in a separate layer such as a link [27]. Diátaxis
divides readers by what they are doing, not how expert they are [19][1]; in the IBM survey, experience
showed no statistically significant effect on the problems people saw [10]. Maintainer judgement: state
the assumed reader at the top ("You have installed the CLI and can open a terminal") and choose the kind
of page by what the reader is doing.

### Headings, scanning, accessibility and translation

NN/g's eyetracking found the F-pattern when text has little formatting, the reader wants to be efficient
and is not committed to every word. Its remedies are practitioner advice: key points in the first two
paragraphs; headings that start with the informative words, so the first two words give the gist; bold for
important words; bullets and numbers; informative link text; less text [4]. In the 1997 test, concise
text, scannable layout and objective language each beat a promotional control on measured usability, and
the three together by 124 percent; the page reports no participant count [3]. That is the case against
promotional words, which `ai.promotional` flags. Good access (index, contents, a page design that
separates concepts from steps) serves novices and experts alike [9].

**Accessibility and translation.** Google's accessibility page asks for keyboard access, a screen-reader
test, heading levels without gaps, meaningful link text, alt text with no new information only in an
image, no images of text or code, tables introduced in the text, and fewer than 26 words per sentence [6].
For translation: simple words, short sentences, no phrasal verbs, no more than two nouns stacked, "only"
beside what it modifies, active voice, present tense, consistent terms, clear pronouns [5]. One set of
plain rules serves all three readers; none of the rules was tested with them.

## Length and timing

**Sentences.** `style.sentence.max` warns above 25 words, GOV.UK's limit [28]; NN/g suggests 15 to 20 even
for experts [27], and Google's accessibility page says fewer than 26 [6]. Convention: 25 is a convention,
since GOV.UK's supporting figures are quoted secondhand in a blog post flagged as possibly out of date.
Steps should sit well below it.

**Steps and pages.** No source gives a maximum step count; Microsoft's test is that the steps fit on one
screen [13]. Maintainer judgement: a procedure of more than about ten steps, or one that changes tool or
place, is two procedures with their own headings. A README is "a short summary" [24]; a how-to guide
starts and ends "in some reasonable, meaningful place" [1]; reference aims at accuracy and completeness
[2]. For web text NN/g recommends fewer than half the words of print, with no cited derivation [27]. To
hold a draft to a size, declare `target: 300 words` in the front matter; `length.target` then warns
outside this plugin's ±10 percent.

**Reading level.** NN/g usually recommends grade 6 to 8 for general readers and 10 to 12 for experts [27].
But a randomised trial that rewrote health texts at grades 8, 10, 12 and 14, changing nothing else, found
no difference in knowledge [29], and plain-language researchers quoted in a Government of Canada blog say
formulas penalise lists and miss what makes text usable [30]. The trial tested health leaflets, not
instructions, and nothing below grade 8. So `readability.grade.report` reports and never targets.

## What good looks like

The examples are written for this guide; the products and numbers in them are invented. Each Markdown
example passes `prose lint` with no errors or warnings.

### Steps that can be followed

<!-- bad example, on purpose: the guide's tests lint it and expect 6 warnings -->

```text
1. You should empty the jug and then remove the lid by twisting it and pulling out the old cartridge.
2. The new cartridge needs to be soaked for 15 minutes, which is easy to forget.
3. Please simply push it in.
4. The jug is ready.
```

Measured here: `prose lint` reports 6 warnings on these four lines: three steps open with You or The, one
with Please, and step 3 holds two filler words. Lint cannot see the rest. Step 1 holds four actions, the
soak is stated as a fact and not as an instruction, a result is numbered as a step, and nothing says what
to do if the cartridge will not seat. Rewritten:

```markdown
---
form: instructions
---
# How to replace the cartridge in a water filter jug

Replace the cartridge every two months, or sooner if the jug fills slowly. You need a new cartridge and a
bowl. Allow 20 minutes, most of it soaking.

1. Empty the jug into the sink.
2. Twist the lid anticlockwise and lift it off.
3. Pull the old cartridge straight up and out.
4. Soak the new cartridge in a bowl of cold water for 15 minutes.
5. Push the new cartridge into the jug until it clicks.
   The cartridge now sits flat against the base.
6. Replace the lid.

If the cartridge will not click, lift it out, check that the rubber ring is in place, and go back to
step 5. If the jug leaks from the base when you refill it, press down on the centre of the cartridge.
```

What to notice. One action per step. The result sits under step 5, not in a step of its own, and the
failure paragraph says where to resume.

### A warning before the step it governs

The common failure is a vague note ("Note: Be careful here.") placed after the step it is about, with the
consequence in a bracket at the end ("(This deletes your profiles.)"). The tier is wrong (a note is for
what the reader can skip), the consequence comes after the action, and nothing says what to do first.
Rewritten:

```markdown
---
form: instructions
---
# How to restore the device to factory settings

1. In the companion app, go to Settings > Device > Export profiles.
2. Tap Export, then wait for the message "Export complete".

**Warning:** The next step deletes every saved profile and cannot be undone. Do not continue until step 2
has finished.

3. Press and hold the reset button for 10 seconds.
   The light blinks red, then white.
```

The warning names what is lost, says it cannot be undone, says what must be finished first, and comes
before the step it governs.

### A README opening

<!-- bad example, on purpose: not Markdown the guide lints -->

```text
# tidepool
Welcome to tidepool! tidepool is a powerful, groundbreaking toolkit that seamlessly empowers modern data
teams to unlock the full potential of their CSV files. Getting started is easy. Just install it!
```

It never says what the tool does, whether it is supported, who owns it or how to run it, and it uses
promotional words (`ai.promotional` flags "groundbreaking"; its word list is short and misses the rest).
Rewritten to Google's five points:

````markdown
---
form: tech-doc
---
# tidepool

tidepool checks a folder of CSV files against a schema and prints the rows that fail. Use it in CI to stop
bad data reaching the warehouse.

Status: stable. Version 2 is supported. Version 1 gets security fixes only.

Owner: the data-platform team (#data-platform).

## Use it

Install the package, then run it on a folder:

    pip install tidepool
    tidepool check data/ --schema schema.yaml

It exits with code 1 if any row fails and 0 if all rows pass.

More: [schema reference](docs/schema.md) and [how to add a custom check](docs/custom-check.md).
````

The opening says what it does and when to use it; status and owner take a line each; the commands are
copyable.

### An API reference entry

<!-- bad example, on purpose: not Markdown the guide lints -->

```text
parse_duration(text)
Parses a duration.
```

It repeats the name and gives no units, no return value and no errors. Rewritten:

```markdown
---
form: tech-doc
---
## parse_duration

Converts a duration string such as `1h30m` into a whole number of seconds.

    parse_duration("1h30m")        # 5400
    parse_duration("90s")          # 90
    parse_duration("1x")           # raises ValueError

    parse_duration(text, *, strict=False) -> int

Parameters:

- `text` (str): The duration. Units are `h`, `m` and `s`, written largest first, and each may appear once.
- `strict` (bool): If true, reject a string with no unit. If false, read a bare number as seconds.
  Default: false.

Returns the total number of seconds as an int. Fractions are not accepted.

Raises `ValueError` if `text` is empty, has an unknown unit, repeats a unit or lists units out of order.
```

The first sentence says what the name cannot. Every parameter, the return value and the exception are
covered, and the examples include the failure. Nothing in it instructs or opines.

### A runbook page

<!-- bad example, on purpose: not Markdown the guide lints -->

```text
1. Check the queue and fix it if needed.
2. Restart stuff.
3. Escalate if that doesn't work.
```

Which queue, what counts as fixed, what "stuff" is and when to escalate are all missing. Rewritten:

```markdown
---
form: instructions
---
# Runbook: the order queue is not draining

Use this when the alert `orders-queue-age` has been firing for more than 10 minutes. You need the
production console. Restore service first and look for the cause afterwards.

1. Open the queue dashboard.
2. Write down the oldest message's age and the number of workers running.
3. If fewer than 4 workers are running, run `scale orders-worker 8`.
   Workers show "ready" within 2 minutes. If they do not, page the platform on-call.
4. Wait 5 minutes.
5. Check that the oldest message is getting younger.
6. If its age is still rising, tell the on-call manager that new orders will stop.

**Warning:** Pausing intake stops all new orders. Do it only after step 5 has failed.

7. Run `pause orders-intake`.
8. Wait 10 minutes.
9. Check that the queue is draining.
10. Run `resume orders-intake` once the oldest message is under 1 minute old.

Verify: place a test order and watch it leave the queue within 1 minute.

Roll back: run `scale orders-worker 4` after the oldest message has stayed under 1 minute old for 30
minutes.

Escalate: if the oldest message is still getting older 30 minutes after step 3, page the platform on-call.
Give them the notes from step 2.
```

The page says when to use it and which job comes first. Each change has an expected result and a time to
wait, and verification, rollback and escalation get a line each. The structure is judgement, not a sourced
template; the figures belong to this made-up system.

## Common failures and the habits behind them

Each failure has a habit behind it; fixing the habit prevents the next one. The habits are Maintainer
judgement unless a source is cited.

### Several actions in one step, or a step that describes

Failure: a step that says do this, then that, then check the other; or "You open Settings" numbered as a
step. Habit: narrating the screen in one breath. Fix: one action per step, verb first, with the result in
an unnumbered sentence under it [14][13]. `procedure.step.imperative` sees only the opening word.

### The missing step

Failure: the procedure works only for someone who already knows the product. Habit: the curse of
knowledge, so the author cannot see which steps are too obvious to mention [8][9]. Fix: follow your own
steps cold in a clean environment, then have someone else do it.

### No result and no way back

Failure: the reader cannot tell whether a step worked, and a failure ends the page. Habit: writing only
the path that worked. Fix: a result after each changing step and a path back for each failure state
(`procedure.recovery`) [9].

### A warning in the wrong place

Failure: the warning follows the step, or every step carries one. Habit: adding a notice whenever
something feels risky. Fix: one warning, before the step, with the consequence [15].

### Filler and cheer

Failure: "Please simply click Next. It's easy!" Habit: politeness as padding. Fix: delete it [16]. Readers
in NN/g's 1997 test detested promotional "marketese" [3]; Maintainer judgement: keep it out of a
procedure.

### Thin reference, landing-page READMEs and stale pages

Failure: an entry that restates the name or skips a parameter; a README of slogans with no status, owner
or command; a page that was right two releases ago. Habit: writing from memory, for readers who have not
yet decided to use the thing, and documenting once. Fix: generate reference from code where you can and
check it for completeness; give the README its five points; change docs with the code, and give each page
an owner [2][22][10][24][7].

### Invented specifics

Failure: a button label, a flag or a time limit the writer could not have known. Habit: filling gaps with
what sounds plausible, which an agent writing about a product it cannot run is prone to. Fix: leave a
visible `[placeholder]` (`draft.placeholders` lists it) and say in the report what you did not run.
`formal.supported-claims` is the judgement rule behind it.

## How to revise

Revise in this order. The early steps change what the reader can do; the later ones change how it reads.

1. **Decide the kind and the reader.** Tutorial, how-to, reference or explanation? Write the assumed
   reader at the top, and move anything of another kind to its own page.
2. **Run `prose lint <file>`.** Fix every error and warning. `style.echo`, `plain.there-is` and
   `ai.promotional` are prompts to reword.
3. **Follow the steps yourself, literally.** Run every command and click every path in a clean
   environment, or hand the page to a fresh reader, or an agent without your context, and log where they
   stall. Pinker's remedy is a "representative reader" [8]. NN/g's finding that small tests find most
   problems comes from website interfaces, not instructions [31], so treat the count as a guide only.
4. **Walk every failure.** For each step ask what the reader sees if it fails and where they resume
   (`procedure.recovery`), and give every "nothing happens" a time limit or a check. Check that each
   warning sits before the step it governs, names the consequence, and that there are few.
5. **Cut.** Move explanation out of steps and link to it; delete copied procedures and out-of-date text
   [7]; cut what the heading already says.
6. **Measure.** `prose measure <file>` gives the longest sentence and the passive count. Split sentences
   above 25 words. Read the reading grade and do not chase it.
7. **Check access.** Heading levels do not skip, links say where they go, a menu path is also in words,
   terms are consistent, and nothing important lives only in an image [6][5].
8. **Report numbers.** Say how many steps, which failure states are covered, which `[placeholders]`
   remain, and which commands you ran and which you did not. Do not write "tested" without having run it.

## Rules that apply

The table is generated from `craft/rules.json` for `instructions` and `tech-doc`. The `procedure.*` rules
check steps; the `style.*`, `plain.*` and `ai.*` rules apply to the text as to any text; the `voice.*`
rules apply to every form but fire only in a project with voice bibles. A threshold marked "This plugin's
choice" is not a source's figure. Lint measures structure and surface; whether a step can be followed,
whether a page is complete and whether it is still true are for the writer and the reader.

<!-- generated:rules begin (npm run guides) -->
| Rule | What it checks | Severity | Threshold | Threshold basis | Run by |
|---|---|---|---|---|---|
| `style.sentence.max` | Written sentences over 25 words are flagged. | warn | 25 words | A source's figure | lint |
| `readability.grade.report` | Reading grade is reported, never targeted. | info | none | n/a | lint |
| `style.passive.report` | Passive voice is counted and reported, not banned. | info | none | n/a | lint |
| `style.echo` | A three-word phrase repeated 3 or more times is flagged. | info | 3 occurrences | This plugin's choice (derived) | lint |
| `plain.there-is` | Sentences opening with There is / There are are flagged. | info | none | n/a | lint |
| `ai.copula-avoidance` | 'serves as', 'stands as', 'functions as' in place of is/are are flagged. | info | none | n/a | lint |
| `ai.artifact` | No leaked chatbot markup or unfilled placeholders. | error | none | n/a | lint |
| `draft.placeholders` | Bracketed placeholders are listed until filled. | info | none | n/a | lint |
| `ai.promotional` | Promotional words (groundbreaking, renowned, nestled, profound ...) are flagged in factual forms. | info | none | n/a | lint |
| `ai.vocabulary` | Three or more distinct era-tagged AI vocabulary terms in one draft are flagged. | warn | 3 distinct terms | This plugin's choice (derived) | lint |
| `procedure.filler` | Instructions avoid please, simply, it's easy, quickly and at this time. | warn | none | n/a | lint |
| `formal.supported-claims` | Every claim is supported by the data given; missing values are [placeholders], never invented. | warn | none | n/a | judgement |
| `length.target` | A draft with a declared target lands within ±10% of it. | warn | 0.1 fraction | This plugin's choice (derived) | lint |
| `procedure.step.imperative` | Each step starts with an imperative verb, or a short location phrase and then the verb. | warn | none | n/a | lint |
| `procedure.single-step` | A procedure with one step is a bullet, not a numbered list. | info | none | n/a | lint |
| `procedure.recovery` | Every failure state says where to resume, and 'nothing happens' cases give a time limit or a check. | warn | none | n/a | judgement |
| `voice.targets` | Each voiced speaker's measured style stays inside the voice bible's target ranges. | warn | none | n/a | lint |
| `voice.bible-valid` | Every voice bible in the project loads: valid YAML and schema, id matching the file name, unique ids, and each speaker claimed by one bible. | error | none | n/a | lint |
| `voice.banned` | A speaker never uses a word their voice bible bans. | warn | none | n/a | lint |
| `voice.unvoiced` | In a project with voice bibles, every speaker resolves to one. | info | none | n/a | lint |
<!-- generated:rules end -->

## Sources

Numbers in brackets in the text refer to this list. Practitioner and house-style sources report their
authors' practice; they were not tested on readers.

<!-- generated:sources begin (npm run guides) -->
1. Daniele Procida. [How-to guides (Diátaxis)](https://diataxis.fr/how-to-guides/) (practitioner; id `diataxis-how-to`). Goal-oriented directions for a competent user; stay on the goal and link out instead of explaining; titles say 'How to ...'.
2. Daniele Procida. [Reference (Diátaxis)](https://diataxis.fr/reference/) (practitioner; id `diataxis-reference`). Describe and only describe; consistent, standard patterns that mirror the product; short examples.
3. Jakob Nielsen (Nielsen Norman Group), 1997. [How Users Read on the Web](https://www.nngroup.com/articles/how-users-read-on-the-web/) (practitioner; id `nng-how-users-read`). A short 1997 test: most users scanned; concise, scannable and objective text each improved measured usability.
4. Kara Pernice (Nielsen Norman Group), 2017. [F-Shaped Pattern of Reading on the Web: Misunderstood, But Still Relevant](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/) (practitioner; id `nng-f-pattern`). Eyetracking: with no strong cues readers scan; put the point first, start headings with the informative words.
5. Google. [Write for a global audience (Google developer documentation style guide)](https://developers.google.com/style/translation) (style-guide; id `google-global-audience`). Simple words, short sentences, no phrasal verbs or stacked noun modifiers, consistent terms, for translation.
6. Google. [Write accessible documentation (Google developer documentation style guide)](https://developers.google.com/style/accessibility) (style-guide; id `google-accessible-docs`). Keyboard and screen-reader rules, heading levels, link text, alt text, tables, fewer than 26 words per sentence.
7. Google. [Documentation best practices (Google style guides: docguide)](https://google.github.io/styleguide/docguide/best_practices.html) (style-guide; id `google-docguide-practices`). Small, fresh docs beat a large stale set; change docs with the code; delete dead docs; link rather than duplicate.
8. Association for Psychological Science (report of a Steven Pinker address), 2015. [The Curse of Knowledge: Pinker Describes a Key Cause of Bad Writing](https://www.psychologicalscience.org/observer/the-curse-of-knowledge-pinker-describes-a-key-cause-of-bad-writing) (practitioner; id `pinker-curse`). Classic style avoids hedges such as somewhat, nearly, relatively and apparently.
9. Williams & Farkas, 1992. [Minimalism Reconsidered](https://faculty.washington.edu/farkas/dfpubs/Williams-Farkas-MinimalismReconsidered.pdf) (peer-reviewed; id `williams-farkas`). Cutting information causes task failure; procedures need explicit steps and recovery.
10. Gias Uddin and Martin Robillard, 2015. [How API Documentation Fails](https://www.cs.mcgill.ca/~martin/papers/ieeesw2015.pdf) (peer-reviewed; id `uddin-robillard-2015`). Two surveys of IBM staff: incompleteness, ambiguity and incorrectness hurt most; content matters more than presentation.
11. Mary Ann Eiler, 1997. [Minimalism and Documentation Downsizing (review)](https://kairos.technorhetoric.net/3.1/reviews/eiler/minimal.html) (review; id `eiler-1997`). A secondary account of Carroll's minimalism, not research; minimalism is more than 'less text'.
12. Peter Graham, 2000. [Reconstructing minimalism (literature review)](https://static.aminer.org/pdf/PDF/000/591/907/reconstructing_minimalism.pdf) (review; id `graham-2000`). A student review reporting Carroll, van der Meij and Redish secondhand; its error-time figure is not checked.
13. Microsoft. [Writing step-by-step instructions (Microsoft Writing Style Guide)](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions) (style-guide; id `microsoft-steps`). Start each step with an imperative verb unless a short location phrase comes first.
14. Google. [Procedures (Google developer documentation style guide)](https://developers.google.com/style/procedures) (style-guide; id `google-procedures`). One action per step; first sentence of a step includes an imperative verb; a single-step procedure is a bullet.
15. Google. [Notes, cautions, warnings, and other notices (Google developer documentation style guide)](https://developers.google.com/style/notices) (style-guide; id `google-notices`). Note, caution and warning tiers; what must stay in the text flow; too many notices lose their force.
16. Google. [Voice and tone (Google developer documentation style guide)](https://developers.google.com/style/tone) (style-guide; id `google-voice-tone`). Avoid please, simply, it's easy, quickly and placeholder phrases such as at this time in instructions.
17. Microsoft. [Formatting text in instructions (Microsoft Writing Style Guide)](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/formatting-text-in-instructions) (style-guide; id `microsoft-formatting`). Bold UI labels, code style for typed commands, italic placeholders; describe the action rather than the element type.
18. US Occupational Safety and Health Administration. [1910.145: Specifications for accident prevention signs and tags](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.145) (standard; id `osha-1910-145`). Danger and caution tiers for workplace signs and tags. A regulation about signs, not a standard for product manuals.
19. Daniele Procida. [Tutorials (Diátaxis)](https://diataxis.fr/tutorials/) (practitioner; id `diataxis-tutorials`). A tutorial teaches by doing: visible results early, expected output, minimal explanation. A framework argued from principle, not a reader study.
20. Chris Jones (Google SRE book). [Effective Troubleshooting](https://sre.google/sre-book/effective-troubleshooting/) (practitioner; id `sre-troubleshooting`). How to troubleshoot, not how to write a runbook: problem report, triage, hypotheses, tests, notes.
21. Daniele Procida. [Explanation (Diátaxis)](https://diataxis.fr/explanation/) (practitioner; id `diataxis-explanation`). Understanding-oriented discussion with context and alternatives; closely bounded; no instruction or description creeping in.
22. Google. [API reference code comments (Google developer documentation style guide)](https://developers.google.com/style/api-reference-comments) (style-guide; id `google-api-comments`). What an API reference must describe; first sentence, member and method conventions.
23. Google. [Code samples (Google developer documentation style guide)](https://developers.google.com/style/code-samples) (style-guide; id `google-code-samples`). Indentation, 80-column wrapping, preformatted blocks, omissions marked by a comment, an introductory sentence.
24. Google. [READMEs (Google style guides: docguide)](https://google.github.io/styleguide/docguide/READMEs.html) (style-guide; id `google-readmes`). A README is a short summary of a directory; the minimum content of a package README.
25. Write the Docs. [Docs as Code](https://www.writethedocs.org/guide/docs-as-code/) (practitioner; id `wtd-docs-as-code`). Write docs with the tools used for code: version control, review, automated tests. Community claims, no outcome data.
26. Digital.gov (US General Services Administration), 2025. [Principles of plain language](https://digital.gov/guides/plain-language/principles/) (style-guide; id `digitalgov-principles`). Write for your audience; plain language is not dumbing down; test that readers understand.
27. Loranger (Nielsen Norman Group), 2017. [Plain Language Is for Everyone, Even Experts](https://www.nngroup.com/articles/plain-language-experts/) (practitioner; id `nng-plain-language-experts`). Experts also prefer plain text; no more than 15-20 words per sentence.
28. GOV.UK (Inside GOV.UK blog), 2014. [Sentence length: why 25 words is our limit](https://insidegovuk.blog.gov.uk/2014/08/04/sentence-length-why-25-words-is-our-limit/) (style-guide; id `gov-uk-25-words`). Break up or condense sentences over 25 words; supporting comprehension figures are second-hand.
29. Mac, Ayre, McCaffery, Boroumand, Bell, Muscat, 2025. [The Readability Study: A Randomised Trial of Health Information Written at Different Grade Reading Levels](https://pmc.ncbi.nlm.nih.gov/articles/PMC12119439/) (peer-reviewed; id `mac-readability-rct`). No comprehension difference between grade 8 and grade 14 versions.
30. Language Portal of Canada, 2024. [Readability formulas, programs and tools: Do they work for plain language?](https://our-languages.canada.ca/en/blogue-blog/readability-formulas-eng) (review; id `language-portal-readability`). Rewriting to lower a formula score does not raise comprehension.
31. Jakob Nielsen (Nielsen Norman Group), 2000. [Why You Only Need to Test with 5 Users](https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/) (practitioner; id `nng-five-users`). Small repeated tests find most problems; about website interfaces, not instructions.
<!-- generated:sources end -->
