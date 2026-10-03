import type { Block } from '../ir.ts';
import { round2, sentences } from '../text.ts';
import { measureStyle } from './style.ts';

export interface SpeakerStats { blocks: number; words: number; sentenceMean: number; contractionsPer1000: number; hedgesPer1000: number; exclaimPer100: number }

/** Style figures per speaker — the raw material for voice bibles and their target checks. */
export function measureSpeakers(prose: Block[]): Record<string, SpeakerStats> {
  const groups = new Map<string, Block[]>();
  for (const b of prose) if (b.speaker) groups.set(b.speaker, [...(groups.get(b.speaker) ?? []), b]);
  const out: Record<string, SpeakerStats> = {};
  for (const [speaker, blocks] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const s = measureStyle(blocks);
    const sents = blocks.flatMap(b => sentences(b.text));
    // a sentence ends in "!" even when a closing quote or bracket follows it
    const exclaims = sents.filter(x => /!["'”’)\]]*$/.test(x)).length;
    out[speaker] = {
      blocks: blocks.length, words: s.words, sentenceMean: s.sentenceLength.mean,
      contractionsPer1000: s.contractions.per1000, hedgesPer1000: s.hedges.per1000,
      exclaimPer100: sents.length ? round2((exclaims * 100) / sents.length) : 0,
    };
  }
  return out;
}
