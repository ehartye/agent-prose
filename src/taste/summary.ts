// The plain-words taste profile the agent reads before it drafts variants.
import { FEATURES, type Feature } from '../owner/features.ts';
import { standardErrors, type Model } from './model.ts';

/** [positive weight, negative weight] */
const WORDS: Record<Feature, [string, string]> = {
  length: ['longer', 'shorter'],
  sentence: ['longer sentences', 'shorter sentences'],
  rhythm: ['more varied sentence rhythm', 'more even rhythm'],
  wordLen: ['longer words', 'shorter words'],
  variety: ['richer vocabulary', 'more repetition'],
  contractions: ['more contractions', 'fewer contractions'],
  hedges: ['more hedging', 'less hedging'],
  passive: ['more passive voice', 'less passive voice'],
  exclaim: ['more exclamations', 'fewer exclamations'],
  question: ['more questions', 'fewer questions'],
  secondPerson: ['more direct address ("you")', 'less direct address'],
  nominal: ['more noun-heavy phrasing', 'plainer verbs'],
};

export type Confidence = 'strong' | 'weak' | 'unknown';
export interface Preference { feature: Feature; weight: number; se: number; words: string; confidence: Confidence }
export interface TasteCounts { skippedVersion: number; malformed: number; unknownVersion: number; rows: number }

const ORDER: Confidence[] = ['strong', 'weak', 'unknown'];
const round = (v: number) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0);
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

export function summarize(m: Model, counts: TasteCounts): { preferences: Preference[]; markdown: string; enough: boolean } {
  const se = standardErrors(m);
  const preferences = FEATURES.map((feature, i) => {
    const z = m.usable && se[i] > 0 && Number.isFinite(m.w[i]) ? Math.abs(m.w[i]) / se[i] : 0;
    const confidence: Confidence = z > 2 ? 'strong' : z > 1 ? 'weak' : 'unknown';
    return { feature, weight: round(m.w[i]), se: round(se[i]), words: m.w[i] >= 0 ? WORDS[feature][0] : WORDS[feature][1], confidence, z };
  }).sort((a, b) => ORDER.indexOf(a.confidence) - ORDER.indexOf(b.confidence) || b.z - a.z)
    .map(({ z: _z, ...p }) => p);

  const known = preferences.filter(p => p.confidence !== 'unknown');
  const enough = m.usable && known.length > 0;
  const lines = ['# Taste profile', ''];
  const used = m.layers.filter(l => l.pairs > 0 || l.name === 'global');
  lines.push(`Layers used: ${used.map(l => `${l.name} (${plural(l.pairs, 'pair')})`).join(', ')}.`, '');
  if (enough) {
    lines.push('Tends to choose, in order of confidence:');
    for (const p of known) lines.push(`- **${p.words}** (${p.feature}, ${p.confidence}, weight ${p.weight} ± ${p.se})`);
    const unknown = preferences.filter(p => p.confidence === 'unknown').map(p => p.feature);
    lines.push('', `Not clear yet: ${unknown.join(', ') || 'none'}.`);
  } else {
    lines.push("Not enough judgements yet to state a preference with confidence. Keep drafting varied options and recording the owner's choices; the profile fills in as they accumulate.");
  }
  lines.push('', "These are style tendencies in the owner's choices, relative to the other options they were shown. They are not rules, and they say nothing about quality: the owner is the judge.");
  const notes = [
    counts.skippedVersion && `${plural(counts.skippedVersion, 'judgement')} made with another feature version ${counts.skippedVersion === 1 ? 'was' : 'were'} left out`,
    counts.unknownVersion && `${plural(counts.unknownVersion, 'row')} from a newer log version ${counts.unknownVersion === 1 ? 'was' : 'were'} left out`,
    counts.malformed && `${plural(counts.malformed, 'line')} in the logs ${counts.malformed === 1 ? 'was' : 'were'} unreadable and skipped`,
  ].filter(Boolean);
  if (notes.length) lines.push('', `Skipped: ${notes.join('; ')}.`);
  return { preferences, markdown: lines.join('\n') + '\n', enough };
}
