# Professional presentation craft and delivery

Read the sections needed for the current presentation. Templates and schedules below are maintainer conventions; source-supported guidance is attributed at the point of use.

## Slide authoring record

For each substantive slide, supply:

| Field | What the author or presenter needs |
|---|---|
| Id and message | Stable id and a sentence stating the point; mark a hypothesis as a hypothesis |
| Visible content | Exact headline and necessary labels or text; keep detailed narration in notes |
| Evidence and status | Source/locator, date, units, population, comparison and caveat; distinguish observed, proposed, illustrative and unknown |
| Visual | What to draw or show, its labels and reading order; no decorative chart implying data exists |
| Speaker notes | What to say, explain and emphasize, including the essential information conveyed visually |
| Time and transition | Segment allowance, pause/activity allowance, next message and optional cut |

Penn State's authors report that, with the same narration, an assertion-evidence slide design improved understanding and retention of a technical subject compared with topic/bullet slides. This supports trying message headlines with explanatory visual evidence. It does not establish a universal effect for all audiences or isolate the headline from the other design changes. [Slide research](https://www.writing.engr.psu.edu/research.html).

Text density remains audience-dependent. Fenesi and colleagues found different learning results for younger and older participants with complementary images versus redundant text in one instructional experiment. Preserve helpful text support, accessible copies and captions rather than making “never repeat spoken text” a rule. [Primary study](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.01076/full).

## Executive decisions

Convention: organize the argument around decision → problem and evidence → options/tradeoff → recommendation → bounded next step. The number of slides follows the slot and information needs.

Make the ask actionable: what is approved, owner, scope, resources, timing, conditions and next decision. Show meaningful alternatives and their cost, risk and implementation burden when relevant. A proposed pilot has a hypothesis, baseline, measurement owner, success/stop criteria and review date. If no financial data was supplied, specify required inputs and how value will be tested. Reduced waiting time is not automatically saved labor or cash; mark the valuation as an assumption until supported.

Keep limitations beside the claim that depends on them. An appendix should let finance or technical reviewers trace inputs and assumptions; it should not be the only place a material uncertainty appears. Label example numbers and mockups visibly. Do not manufacture a success chart from placeholders.

## Training, customer and conference sessions

Convention: work backward from a usable audience outcome. Teach or demonstrate a concrete task; provide the context needed to understand the example. Include an application or comprehension check where learning is the objective. Poll popularity or applause alone does not demonstrate understanding.

For customers, separate demonstrated capabilities, staged examples and measured results. Give a next action that serves the stated objective. For a conference talk, explain what the evidence changes and where the interpretation remains uncertain. Tailor detail to prior knowledge rather than assuming professional audiences know every acronym.

## Timing and spoken files

Convention: a 12-minute decision slot might allow 8 minutes for prepared explanation, 3 for discussion and 1 for the decision. The actual schedule controls the script budget. At 130 words per minute, 8 scripted minutes would be about 1,040 words before subtracting planned pauses or other non-speech time. A timed run is the delivery check; rate-based duration is an estimate.

Keep the slide plan, evidence ledger, run sheet and rehearsal notes in separate planning files. Use speech frontmatter only in a file containing narration. Speaker/slide labels are headings; stage directions occupy their own bracketed line. Prose counts an inline bracket or a plain `PRESENTER:` label as speech.

This short script demonstrates formatting, not a complete 12-minute presentation:

```md
---
form: speech-small
wpm: 130
target: 0.2 minutes
---

## Slide 1 — Presenter

[Look up. Pause before the ask.]

We ask you to approve a small pilot today.
We will measure the delay and protect service quality.
Clear evidence must come before a wider rollout.
```

The example has 26 spoken words, estimated at 0.2 minutes. When adapting it, choose a target matching the actual narration allowance and resolve findings; do not change targets merely to silence a warning.

Choose `speech-large` for a hall and `speech-recorded` for an intentionally recorded address when appropriate. The form describes delivery, not the presence of a slide deck. Use a measured speaker-specific `wpm` when available; the default 130 is a convention.

## Accessible materials and delivery

WAI advises advance accessible materials, limited on-slide text, readable visuals, contrast and spoken descriptions of pertinent visual information. Screen sharing is not an accessible substitute for directly available materials. [WAI event checklist](https://www.w3.org/WAI/teach-advocate/accessible-presentations/).

Section508.gov adds accommodation request routes, accessible interactions and rehearsing caption/interpreter controls. Its legal context is federal agencies; the practical checks here do not assert that every professional event is legally subject to Section 508. [Accessible meetings](https://www.section508.gov/create/accessible-meetings/).

For a deck, verify meaningful titles, reading order, image descriptions, labels that do not depend on color alone and readable charts at the intended projection or attendee-window size. For delivery, describe the important chart relationship or demonstrated change, identify slide changes, speak clearly, repeat audience questions into the microphone, and allow processing time. Supply an adaptable handout or accessible source document when appropriate. Check captions and relevant names/technical terms during rehearsal. Automated checks do not establish full accessibility.

## Rehearsal and handoff

Convention: run the whole slot with the real presenter, transitions, activities and questions. Record narration and total elapsed time separately. Deliberately start a segment late and execute the cut order. Keep required evidence, any material caveat and the closing decision/action. Move optional examples or secondary analysis to backup material.

Ask a listener to restate the requested decision or task and the evidence behind it. Note confusing terminology, unreadable visuals and moments where the speaker reads dense slides. Test backup access to the deck and any demo assets. Provide a concise status table: file created, source checked, script measured, export inspected, accessibility reviewed and live rehearsal completed, each with actual evidence or “not yet checked.”
