import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/document.ts';
import { buildReport } from '../src/audit/report.ts';
import { sentences } from '../src/text.ts';

const flags = (text: string, family = 'weasel-attribution') => {
  const r = buildReport(parseDocument('draft.md', text, {}), text);
  return [...r.tiers.hard, ...r.tiers.soft].filter(f => f.family === family);
};

describe('weasel attribution: a citation clears the claim', () => {
  const cited = [
    'Some historians suggest the fire began in a bakery (Smith et al. 1998).',
    'Some historians suggest the fire began in a bakery (Smith et al., 1998).',
    'Some historians suggest the fire began in a bakery (Smith 1998).',
    'As Smith (2020) argues, studies suggest the effect is large.',
    'As Smith et al. (2020) argue, studies suggest the effect is large.',
    'Experts argue this. [3]',
    'Experts argue this. [3, 4]',
    'Experts argue this.[^1]',
    'Experts argue this. [^1]',
    'Experts argue this. [^note]',
    'Experts argue [this](https://example.com/paper).',
  ];
  for (const text of cited) it(`does not flag ${JSON.stringify(text)}`, () => expect(flags(text)).toEqual([]));

  const uncited = [
    'Some historians suggest the fire began in a bakery.',
    'Experts argue this. Smith disagrees (2020).',
    'Experts argue this. The next sentence stands alone [3].',
    'Experts argue this.\n\nA new paragraph [3].',
  ];
  for (const text of uncited) it(`still flags ${JSON.stringify(text)}`, () => expect(flags(text).length).toBeGreaterThan(0));
});

describe('sentence splitting around abbreviations', () => {
  it('keeps et al., cf., Fig., Eq., approx., ca. and Inc. inside their sentence', () => {
    for (const s of [
      'Smith et al. 1998 found a bakery fire.',
      'See cf. Eq. 3 for the proof.',
      'The plot in Fig. 2 shows it.',
      'It cost approx. 40 dollars.',
      'It dates from ca. 1850 or so.',
      'Acme Inc. 2020 was founded then.',
    ]) expect(sentences(s), s).toHaveLength(1);
  });
  it('still splits after an ordinary sentence end', () => {
    expect(sentences('We left. Then it rained.')).toHaveLength(2);
    expect(sentences('He said no. 4 people left.')).toHaveLength(2);
  });
});
