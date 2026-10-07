# Professional webinar production

Templates and schedules are maintainer conventions. Platform facts below were verified on 2026-10-07; recheck official documentation and the actual account before operating controls.

## Roles and controls

Stanford distinguishes host, backup co-host, stage manager/timekeeper, moderator and chat/technical support, and recommends rehearsals and an early soundcheck. Map responsibilities to the available people rather than assuming five separate staff. [Stanford production guidance](https://osep.stanford.edu/planning/virtual-and-hybrid-event-planning/virtual-event-team-roles-presenter-tips-and).

Convention: a two-person team can give the presenter content/demo and the moderator host controls, questions, time and backup switching. Do not assign the moderator simultaneous lengthy tasks. Use a short private cue channel and prepared assets. Name a backup owner for host absence as well as presenter failure.

Zoom-specific distinctions: a co-host cannot initially start a webinar; an alternative host can. Starting the webinar and starting the broadcast from practice are different controls. Panelist sharing/video permissions may be disabled. Verify the backup's identity and actual rights. [Zoom webinar roles](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065551).

Zoom practice excludes attendees until the live transition. Panelists need their unique link or the matching signed-in identity. With automatic recording enabled, computer recording starts in practice; cloud recording starts when practice ends. Never promise that backstage rehearsal is unrecorded merely because attendees cannot join. [Zoom practice session](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062566).

For another platform, verify the equivalent behavior with its current official docs. Do not translate Zoom role names into assumed permissions. Keep private join links, passwords and credentials in the team's existing secure channel, not public audience materials.

## Run sheet and event budget

Convention: these rows demonstrate a 45-minute customer session, not a universal format:

| Elapsed | Owner | Purpose | Production cue |
|---|---|---|---|
| 00:00–03:00 | Moderator | Promise, access/recording notice, question route | Confirm audience can hear and access captions/resources |
| 03:00–08:00 | Presenter + moderator | Identify the audience problem, opening interaction | Read prompt; debrief or use the prepared no-response bridge |
| 08:00–20:00 | Presenter | Framework and supported example | Moderator tracks time and question queue |
| 20:00–28:00 | Presenter | Demo, including loading and recovery | Moderator calls backup and the hard stop |
| 28:00–33:00 | Presenter | Application and next action | Optional second example is the first cut |
| 33:00–42:00 | Moderator + presenter | Selected Q&A | Read questions aloud; log unanswered ones |
| 42:00–45:00 | Presenter + moderator | Recap, resource and close | Keep the closing action even after an overrun |

In the actual run sheet, add specific asset/slide ids, exact audience prompts, private cues, a recovery action and any optional cut. Each cut must identify content actually supplied in the package. Keep live cues compact and supporting preparation details in separate sections. The demo slot includes its narration; do not add it twice. The planning script budget is the total slot minus unscripted/interactive time, loading, pauses, handoffs and contingency. Fixed speech rate is a planning assumption; rehearsal checks the full elapsed schedule.

## Interaction and Q&A

Convention: use interaction to inform the next explanation, practice a task or check understanding. Do not insert a poll on a fixed engagement timer. Specify the exact question/options, purpose, launch/close owner, response window, accessible equivalent, and how the presenter uses the result. If no one responds or the control fails, give a prepared example and continue without attributing it to attendees.

For Q&A, set the route, moderation owner and response plan. Prepare a few useful seed questions with supported answers for an empty queue, labeled as prepared questions rather than audience submissions. Group duplicates and prioritize relevance over popularity alone. The moderator reads written questions aloud and avoids exposing names or details contrary to the event's anonymity promise. Admit an unknown answer and assign an owner/date; do not improvise financial or product claims. Give panelists directed prompts and time cues, then synthesize disagreements honestly.

WAI notes that polls and rapid activities may be inaccessible to some participants; accessible copies and visual descriptions support people who cannot use screen sharing. [WAI checklist](https://www.w3.org/WAI/teach-advocate/accessible-presentations/). Section508.gov recommends accommodation request routes, accessible interactive controls, reading written questions aloud and rehearsing accommodations. It is guidance in a federal-agency context, not a legal determination for every webinar. [Accessible meetings](https://www.section508.gov/create/accessible-meetings/).

## Demo and connection recovery

Convention: prepare a short scenario with its initial state, verified capability and expected outcome. Have the same story available in labeled screenshots or a captioned recording. Specify a bounded wait/retry, the private switch cue, fallback owner and hard stop; choose thresholds based on the slot and demonstrated platform behavior. Prepare an abbreviated fallback for late failure: show the essential state/outcome within the remaining time rather than restarting a longer backup sequence. If the wait or playback would exceed the hard stop, skip directly to that short version and transition on time.

Example recovery: if a prepared demo makes no useful progress for 30 seconds, the moderator cues “backup”; the presenter switches by 60 seconds rather than repeatedly retrying. Say: “The live environment is taking longer than expected. I'll use the prepared capture of this scenario.” Describe its essential visuals. These seconds are a rehearsal convention, not a sourced performance guarantee.

If sharing fails, the designated backup shares the deck/assets; if presenter connectivity fails, the moderator bridges to backup material or the next segment. Stanford recommends a communicated failure plan, contact route and dial-in instructions; audio-only or dial-in can help poor connectivity. [Stanford troubleshooting](https://osep.stanford.edu/planning/virtual-and-hybrid-event-planning/virtual-event-team-roles-presenter-tips-and). A full platform outage needs the team's agreed status/contact path and reschedule owner; drafting a message does not send it.

## Spoken file example

Use a separate script for prepared narration, not the full run sheet. Put each speaker label in a heading and each direction in a separate bracketed paragraph, with blank lines before and after. A line break alone does not separate a direction from narration. An inline bracket or plain `MODERATOR:` label is counted as spoken text.

```md
---
form: speech-recorded
wpm: 130
target: 0.2 minutes
---

## Moderator — Opening

[Confirm captions and the resource link.]

Welcome. Today we will examine one handoff and its delay.
Please send questions as we go. We will discuss them before closing with a practical next step.
```

This formatting example has 27 spoken words (about 0.21 minutes at 130 wpm). It is not a full webinar script. For a full draft, use its planned narration allowance as the target. Choose a speech form matching the delivery and keep all presenter and moderator narration in the measured budget.

## Rehearsal and readiness

Convention: check access from an attendee view as well as the team's view. Test presenter and backup controls, slide/media sharing with sound, links, captions and technical names, question/poll routes and accessible alternatives. Confirm record/start/stop behavior and the backstage-to-live transition. Suppress unrelated notifications and use appropriate demo data. Rehearse forced failures and a late segment, applying a written cut order.

Record actual narration and total elapsed time, failure switch time, broken controls and owners for fixes. If no live rehearsal happened, label the package production-ready only after those checks are performed; until then it is a drafted production plan. Platform documentation and a script measurement cannot establish account configuration or rehearsal success.

## Follow-up and reporting

Convention: the close names one next action and where resources will be available. The follow-up package can include accessible deck/handout, edited recording with checked captions/transcript, answered/unanswered question log and a feedback prompt. Name owners and deadlines. Review recorded content and asset availability before distribution; do not silently promise a recording or send an email.

For each metric record definition, numerator, denominator, observation window, deduplication/exclusions and missing data. Example: live attendance rate = unique eligible live attendees / eligible registrants for this event, excluding team/test accounts. Poll participation = unique valid respondents / attendees who could access that poll during its response window. Report an unavailable denominator instead of fabricating a rate. Replay viewers use a separately defined window and population.

Microsoft documents attendance intervals and logged actions, with policies that can disable reporting, exclude attendees, allow opt-outs or omit timings. Check availability before promising a report. [Teams attendance and engagement reporting](https://learn.microsoft.com/en-us/microsoftteams/teams-analytics-and-reports/meeting-attendance-report). Inference: attendance, reaction counts and poll clicks alone do not establish attention, comprehension, causation or revenue. Use a relevant task/knowledge check or separately supported business outcome when that is the objective.
