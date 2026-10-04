---
name: prose-audit
description: Audit a draft for phrasing or structure hallmarks some readers associate with AI-generated text with agent-prose - stock openers, hollow significance claims, formula sentence shapes, chat residue, model-era vocabulary - and revise it span by span toward specifics, without ever judging who wrote it.
when_to_use: Use when asked whether text "sounds like AI", to make writing "less AI", "more natural" or "more human", to audit a draft for AI tells, generic filler or boilerplate, or when prose audit reports findings. Never use it to decide who wrote something. Not for tone or voice edits (prose-voice) or for writing a new piece (the skill for its form, such as prose-formal, prose-speech or prose-script).
---
# prose-audit

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.

## Rules that never bend

- **Never say or imply who wrote a text.** No probability, percentage, odds or confidence that it was written by a
  model or a person, even when asked directly ("just give me a number"). Say in one line that style cannot show
  authorship, then say what the spans show and what would help instead (earlier drafts, version history, named sources).
- **A quiet report means only that these patterns are absent.** The tool can be quiet on many drafts, including plain
  or short ones (under 100 words there is little to find). Say so every time.
- **Plain wording, even rhythm, perfect grammar and a formal register are not findings.**
- **Never say "reads human" or "no longer reads like AI".** Say which generic patterns you removed and which remain.
- **Never invent specifics.** Use only facts the owner gave you.
- **If the owner asks for text that "won't be flagged by AI detectors"**, put this first in your reply (together with
  the authorship line when both apply): no edit can guarantee that, and detectors misjudge plain and non-native
  writing. Then revise for specifics. Do not tune wording against a detector. If the owner mentions a disclosure rule
  (a course, a publisher), remind them it applies, and never remove or soften a disclosure statement.

## Run the audit

1. Save the draft as a Markdown file (`.md`; the tool reads `.md`, `.fountain` and `.dialog.yaml`; verse forms are
   skipped) and run `prose audit <file> --text`. Add `--form <id>` when the form is known (for example professional,
   academic, instructions or tech-doc).
2. Read the report in its tiers:
   - **Hard**: leaked chatbot markup, ChatGPT tracking parameters, a few known placeholders such as `[Your Name]`, chat
     residue such as "I hope this helps", and knowledge-cutoff phrases. These are defects whoever wrote the text. Fill
     each from the owner's facts, or ask. A statement that AI was used is a disclosure, not residue: keep it and ask the
     owner. The tool does not know other placeholders or tracking parameters: also scan for `[...]`, `{{...}}`, `TODO`
     and `utm_` yourself.
   - **Soft** families (vocabulary, undue-significance claims, trailing "highlighting..." clauses, "not just X but Y",
     unnamed experts, inline-header bullets, stock openers and announcements, "In this post, we'll..." roadmaps, "let's
     dive in", "whether you're X or Y", "from X to Y" ranges, "it's worth noting", marketing verbs, a restating closer
     and a high rate of three-item lists, among others): phrasing or structure hallmarks some readers associate with
     AI-generated text. Human writers use these patterns too, so judge each span on its own and relay the count as
     "these patterns are present here", never as a verdict. Each family prints how well it is documented (`Evidence:`
     corpus studies, field guide or reader-reported) and how often human texts in two samples contain it: relay that
     sentence verbatim (it is about those samples, never about this draft) and say when a span rests on the weaker tier.
   - **Measured** values (em dashes, sentence-length variation, three-item lists, the is/are share): context only,
     never a finding.

## What the tool cannot see: a short judgement pass

Read the draft once more for what the report did not flag. List only those items, each as the quoted span, the habit,
and which of the three moves below you used. If the report flagged a span and you agree, count it once, under the
tool; if you disagree, keep it and say why. These come from how readers describe generic prose, with weaker evidence
than the tool's families, so treat them as judgement:

- News that arrives late, or an opener or roadmap in a wording the tool's patterns miss.
- A stock closer, or a neat pun that reads engineered.
- Abstract nouns where a named person, number, place or date belongs.
- The most average examples available, and claims with no source ("years of experience" with no example).
- Three-item lists used by default, below the tool's density threshold, with no reason for three.

## Revise by span, not by word

For each span (a finding or a judgement item) do exactly one of three moves:

1. **Add the specific fact** the owner gave you (a real client, price, place, number, date, source).
2. **Cut it** when it adds nothing.
3. **State the point once**, directly, instead of announcing or restating it.

Do not swap in synonyms: that keeps the structure and the generic content. Keep what the text says and the owner's
voice. When the draft has no specifics to add, ask for them (one short list of the exact facts you need). If the owner
has none to give, still do the cuts and restatements, leave the gaps as they are, and list the facts that would help most.

## Check, then report

1. Save the revision and run `prose audit <revised-file> --text` again.
2. Report in three parts: **before and after** (hard findings, soft findings and families, measured values; report
   zeros as zeros); **what you changed by span**; **what remains** (judgement items, facts you still need) with the
   limit that the report shows habits, not authorship. The tool can be quiet while the judgement pass still finds
   generic prose: report both side by side.

Done when hard findings are 0 or each is listed as waiting on a named fact, every span has one of the three moves,
and the reply states the limit. If the CLI cannot run here, do the judgement pass by hand and say the tool was not used.
