import type { Doc } from '../ir.ts';
import { SPOKEN_KINDS } from '../kinds.ts';
import type { Form } from '../forms.ts';
import { round2, words } from '../text.ts';

export interface SpokenStats { wpm: number; words: number; minutes: number; longestBreathUnit: { words: number; line: number } | null }

// Case-sensitive on purpose: script cues are written in capitals, so "Text: the first rule..." stays spoken.
const DIRECTION = /^(?:\*\*|__)?(?:VISUAL|VISUALS|B-ROLL|ON SCREEN|ON-SCREEN|SFX|MUSIC|TEXT|GRAPHIC|SHOT|CUT TO)(?:\*\*|__)?\s*:/;
const LABEL = /^(?:\*\*|__)?(?:VO|V\.O\.|NARRATOR|HOST|VOICEOVER)(?:\*\*|__)?\s*:(?:\*\*|__)?\s*/;
const RANGE = /^\[?\(?\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*\]?\)?\s*/;
const SEPARATORS = /^[\s—–\-:|]*/;

export interface SpokenOptions { /** Drop on-screen direction lines (VISUAL:, B-ROLL: ...); true for YouTube scripts. */ directions: boolean }

/** The words a listener hears, line by line: direction lines removed (when asked), speaker labels stripped. */
export function spokenText(text: string, opts: SpokenOptions): string {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => !(opts.directions && DIRECTION.test(l)))
    .map(l => l.replace(LABEL, ''))
    .join('\n');
}

const optsFor = (doc: Doc): SpokenOptions => ({ directions: doc.form === 'youtube' });

const secondsOf = (t: string) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };

export interface Segment { start: string; end: string; seconds: number; words: number; wpm: number; line: number }

/**
 * Timestamp-ranged segments and their spoken pace. A block of any kind whose text starts with
 * m:ss-m:ss opens a segment; only spoken kinds add words (those after the timestamp).
 */
export function measureSegments(doc: Doc): Segment[] {
  const out: Array<Segment> = [];
  const spoken = SPOKEN_KINDS[doc.format];
  const opts = optsFor(doc);
  for (const b of doc.blocks) {
    const m = b.text.match(RANGE);
    if (m) out.push({ start: m[1], end: m[2], seconds: secondsOf(m[2]) - secondsOf(m[1]), words: 0, wpm: 0, line: b.line });
    const seg = out.at(-1);
    if (seg && spoken.includes(b.kind)) seg.words += words(spokenText(b.text.replace(RANGE, '').replace(SEPARATORS, ''), opts)).length;
  }
  return out.map(s => ({ ...s, wpm: s.seconds > 0 ? Math.round((s.words * 60) / s.seconds) : 0 }));
}

export function measureSpoken(doc: Doc, form: Form): SpokenStats | null {
  if (!form.spoken || !form.wpm) return null;
  let total = 0;
  let longest: { words: number; line: number } | null = null;
  // Speeches are often set one phrase per line, so there a line break is a pause too (and the line number is exact).
  const lineBreaks = form.lineBreakPauses === true;
  for (const b of doc.blocks.filter(x => SPOKEN_KINDS[doc.format].includes(x.kind))) {
    const text = spokenText(b.text, optsFor(doc));
    total += words(text).length;
    const chunks = lineBreaks ? text.split('\n') : [text];
    chunks.forEach((chunk, k) => {
      for (const unit of chunk.split(/[,;:.!?…—–()]+|\s-\s/)) {
        const n = words(unit).length;
        if (n > 0 && (!longest || n > longest.words)) longest = { words: n, line: b.line + k };
      }
    });
  }
  return { wpm: form.wpm, words: total, minutes: round2(total / form.wpm), longestBreathUnit: longest };
}
