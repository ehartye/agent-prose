# YouTube scripts

## File shape

```md
---
form: youtube
target: 60 seconds
---

## 0:00–0:08

VISUAL: A fork in a microwave throws sparks.

VO: You've been told never to do this. But the inside of your microwave is already metal.

## 0:08–0:20

VO: ...
```

- A heading or paragraph that starts with `m:ss–m:ss` opens a segment; lint measures each
  segment's spoken words per minute and warns above 180.
- `VISUAL:`, `B-ROLL:`, `ON SCREEN:`, `SFX:`, `MUSIC:`, `TEXT:` lines are directions, not speech.
- `VO:`, `NARRATOR:`, `HOST:` labels are stripped before counting.
- A paragraph wrapped in `[...]` is an on-screen note.

## Opening

- YouTube's own retention report reads the first 30 seconds as whether the opening matched the
  title and thumbnail. Show or say the promise at 0:00 and pay it off (or visibly start paying it
  off) before 0:30.
- Hooks that work: a question, a cold open into the action, telling viewers what they will see in
  the first five seconds. Branded intros and logo cards cost the most viewers; keep them to a
  second or cut them.
- For explainers, name the common wrong idea first, then correct it — viewers who only see the
  clean explanation keep their misconception.

## Pace and structure

- Narration usually runs 130–180 words per minute; plan at 150–160 and check per segment.
- In long videos, re-engage every few minutes with a new question or stakes, and never signal the
  ending before the payoff.
- Every claim in the title must be delivered in the video; curiosity gaps are fine only if the
  video closes them.
