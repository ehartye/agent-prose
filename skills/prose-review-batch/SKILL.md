---
name: prose-review-batch
description: Put many lines in front of the owner at once with agent-prose: one reading-page session over up to 50 variant sets, a queue the owner walks, choosing one draft per set and sending the picks together, each pick recorded like any other.
when_to_use: Use when the owner has many lines to judge in one sitting - a dialog pass, a batch of barks, a script's worth of speeches, "review all of these", "give me the whole set of options" - or when sets are waiting for a pick and the owner wants to clear them from a phone or laptop. A single line or one set is prose-review; writing the drafts is prose-dialog, prose-script or the form's own skill.
---
# prose-review-batch

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.
Commands find the project from the current directory: run inside the project or pass `--dir <project>`.

A batch is one link for many sets. The owner sees a queue down the left (on a phone, a strip across the
top): each item is a character and a line, waiting, picked or skipped. They choose one draft per item,
or none, and press **Send picks** once. Each item is an ordinary session over its own set, so every pick
is recorded exactly as `prose set pick` records it and your sealed predictions reveal per set.

## The order

1. For each line, follow prose-review up to the prediction: `prose set new <draft> --lines <refs>
   --character ... --context ... --brief-confirmed --directions ...`, write the variants, `prose set check`,
   then `prose predict --set <id> ...`. The brief must be confirmed by the owner before any variant
   is written. Seal every guess before the page opens.
2. Open the batch, with the exposure notice said to the owner first (anyone on the network with the link can read
   the drafts, delete lines and record picks; `--local` keeps it on this machine):
   `prose reading open --sets a,b,c --local` for chosen sets, or `prose reading open --pending` for every
   set that has a sealed prediction and no pick (`--limit <n>`; at most 50 per batch, so split larger work).
   `--sets` is all or nothing: one bad set fails the batch and lists every failing set. Give the owner
   BOTH links from the output, the machine-name link and the IP link (phones often cannot resolve the name).
3. Run `prose reading wait --id <queue id> --since <cursor>`, starting at `--since 0`, and pass back the
   `cursor` each answer prints. Picks arrive when the owner presses Send picks (together, once they settle),
   each with its set, the draft chosen, its label and the reveal of your sealed guess. Act on each as it arrives:
   if the owner wants it, copy the chosen variant over the draft (`file` is its path). Loop until the answer is
   `event: done`.
4. `done` has a reason: `all-picked` (every set has a pick), `finished` (the owner pressed Finish) or `closed`
   (you ran `prose reading close --id <queue id>`). `unpicked` lists sets without a pick: they stay sealed
   and unpicked, and `prose reading open --pending` offers them again.

## What the owner can do

- **Choose** a draft in an item: staged, not sent. They can change it until they press Send picks. Picks cannot be
  changed once sent. A staged choice is not a pick and `reading status` does not report it.
- **Skip** an item: it goes to the end of the queue and comes back. A skipped or waiting item never ends the batch
  by itself.
- **Finish** ends the review: sets without a pick are left as they are. **Not chosen** means exactly that.
- A batch item is a quick pick: no duel and no refine round, and no notes. For that, open the set alone with
  `prose reading open --set <id>` (each item also links to its own session). A batch gives pick rows, not duel rows.

## Do not

- Do not read a set's `prediction.json` or `model-prediction.json` before its pick; the batch keeps each set sealed until
  its own pick, and your guess must stay independent.
- Do not run `prose set pick` yourself for a set in an open batch; the page notices and shows it as picked outside the
  page, but the owner's choice is the point.
- Do not call `reading round` on a batch item: there are no rounds in a batch.
- Do not report a pick you have not seen in a `wait` or `reading status --id <queue id>` answer.

`prose reading status --id <queue id>` shows each item and, for sent ones only, the pick and its reveal.
`prose reading list` lists sessions and queues. `prose reading close --id <queue id>` stops a batch you no longer need;
picks already sent stay.
