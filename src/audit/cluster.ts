import type { Finding } from './detectors.ts';

export interface Threshold {
  /** Distinct soft families that must appear. */
  minFamilies: number;
  /** Soft findings per 1,000 words. */
  minPerThousand: number;
  /** A shorter text is too short to say anything and never meets the cluster. */
  minWords: number;
}

/**
 * The cluster rule's defaults, in one place. They are conventions, checked against a measured sample on 2026-10-03
 * (scripts/audit-measure.mjs; method and limits in docs/research/2026-10-03-ai-audit-measurement.md).
 *
 * Sample: 351 arXiv abstracts from 2018 to 2021 and Claude abstracts written for the same titles (plain prompt, 351;
 * careful-human prompt, 120), split by seed 20261003 into a calibration half (176 ids) and a held-out half (175).
 * Calibration half, 3 families / 4 per 1,000 words / 100 words: human 0/176 (0.0%, Wilson 95% 0.0 to 2.1%), plain
 * model 0/176, careful-prompt model 0/60. Held-out half, same setting: human 0/175 (0.0%, 0.0 to 2.1%), plain model
 * 0/175 (0.0%, 0.0 to 2.1%), careful-prompt model 0/60 (0.0%, 0.0 to 6.0%).
 *
 * Provenance: the shipped values are the Task 1 starting values. Nothing was tuned on any data. The held-out half WAS
 * looked at, once, after the choice to keep the starting value, while a literal sweep optimum was being rejected.
 *
 * Choice: the sweep's literal optimum (1 family, 5 per 1,000 words) flags a single finding in a short abstract,
 * contradicts the rule that one or two soft tells are coincidence, and on the held-out half flagged more human
 * abstracts (12.6%) than plain model ones (4.0%). Among settings that keep the "several distinct families" rule (3 or
 * more), every setting tied at 0% human and 0% plain-model on the calibration half, so the Task 1 values stay (the
 * tie-break is: keep the existing setting when it is in the tied set). No soft family flagged more than 15% of human
 * abstracts, so none is dropped from the family count. The rule is nearly inert on this genre: it does not fire on
 * these samples at all, and that says nothing about other genres or other models.
 */
export const DEFAULT_THRESHOLD: Threshold = { minFamilies: 3, minPerThousand: 4, minWords: 100 };

export interface Cluster {
  met: boolean;
  families: string[];
  softPerThousand: number;
  threshold: Threshold;
}

/** Whether soft findings gather across enough families and densely enough to read as one habit. Hard findings are not counted. */
export function clusterOf(findings: Finding[], words: number, threshold: Threshold = DEFAULT_THRESHOLD): Cluster {
  const soft = findings.filter(f => f.tier === 'soft');
  const families = [...new Set(soft.map(f => f.family))];
  const perThousand = words ? (soft.length * 1000) / words : 0;
  return {
    met: words >= threshold.minWords && families.length >= threshold.minFamilies && perThousand >= threshold.minPerThousand,
    families,
    softPerThousand: Math.round(perThousand * 100) / 100,
    threshold,
  };
}
