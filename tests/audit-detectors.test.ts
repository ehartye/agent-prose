import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from '../src/document.ts';
import { buildReport, EVIDENCE_WORDS, LIMITS, renderText } from '../src/audit/report.ts';
import { AUDIT_SOURCES, FAMILIES, MEASURED_NOTES, TRIPLET_DENSITY_PER_1000, type Finding } from '../src/audit/detectors.ts';
import { REFERENCES } from '../src/craft/rules.ts';

const report = (text: string, name = 'draft.md', form?: string) => buildReport(parseDocument(name, text, form ? { form } : {}), text);
const all = (r: ReturnType<typeof report>) => [...r.tiers.hard, ...r.tiers.soft];
const famOf = (text: string, family: string, name = 'draft.md') => all(report(text, name)).filter(f => f.family === family);

/** Passages for the density family: 14 filler sentences (112 words) plus triplet sentences of 6 words, so the rate is known. */
const FILLER = 'We met on Tuesday and walked home together. ';
const TRIPLET_SENTENCE = 'We bought apples, pears, and plums. ';
const passage = (triplets: number, filler = 14) => (FILLER.repeat(filler) + TRIPLET_SENTENCE.repeat(triplets)).trim();

/** Each family: texts it must flag, near-misses it must not, and ordinary human writing it must not. */
const CASES: Record<string, { hit: string[]; miss: string[]; human: string[] }> = {
  // hard
  artifact: {
    hit: ['See the report. :contentReference[oaicite:3]{index=3}', 'Read more at https://example.com/?utm_source=chatgpt.com today.', 'Dear [Your Name], thanks.'],
    miss: ['See the report [3] and the appendix.', 'Read more at https://example.com/?utm_source=newsletter today.'],
    human: ['We opened the garden in March with twelve beds.'],
  },
  'chat-residue': {
    hit: ['The steps are above. I hope this helps!', 'Certainly! Here is the draft.', 'Would you like me to expand the second section?', 'As an AI language model, I cannot say.', 'Let me know if you want changes.'],
    miss: ['I hope the weather helps us on Saturday.', 'He certainly knows the road.', 'She let me know it was fine.'],
    human: ['We will meet at nine and walk to the lot together.'],
  },
  'knowledge-cutoff': {
    hit: ['As of my last knowledge update, the rule was in force.', 'As of my knowledge cutoff the library was open.'],
    miss: ['As of last week the library is open.', 'My knowledge of the rule is limited.'],
    human: ['As of March the library opens at nine.'],
  },
  // soft
  vocabulary: {
    hit: ['We delve into the data.', 'The result was pivotal and the garden vibrant.'],
    miss: ['The pivot table was ready.', 'She delivered the results on time.', 'The key landscape is valuable.'],
    human: ['The committee reviewed the budget and approved it on Tuesday.'],
  },
  'copula-avoidance': {
    hit: ['The library serves as a meeting hall.', 'It functions as an archive for the town.'],
    miss: ['The server serves assets quickly.', 'She stands as tall as her sister.', 'The tool operates as expected.'],
    human: ['The library is a meeting hall.'],
  },
  promotional: {
    hit: ['A groundbreaking lab opened.', 'The inn is nestled in the hills.'],
    miss: ['The ground broke open after the rain.', 'Her fame was wide.'],
    human: ['The lab measured the soil in March.'],
  },
  'undue-significance': {
    hit: ['The garden stands as a testament to patience.', 'Water plays a pivotal role in growth.', 'The evolving landscape of retail worries owners.', 'In today’s fast-paced digital world, shops close.', 'It left an indelible mark on the town.'],
    miss: ['She plays the violin and a minor role in the play.', 'In today’s meeting we discussed the world cup.', 'The old testament was read aloud.'],
    human: ['The landscape architect planted maples along the road.'],
  },
  'trailing-participle': {
    hit: ['The plant closed, highlighting the scale of the problem.', 'Sales rose in May, underscoring its importance to the region.'],
    miss: ['Highlighting the problem, the plant closed.', 'She was reflecting on the day.', 'The plant closed, and sales fell.'],
    human: ['The plant closed in March, and sales fell.'],
  },
  'negative-parallelism': {
    hit: ['It is not a bug, it is a feature.', 'This is not just a tool but a movement.', 'It isn’t a dashboard; it’s a diagnosis.', 'It’s not noise — it’s signal.', 'The work is not only fast but humane.'],
    miss: ['It is not clear whether he left.', 'It was not the butler but the gardener.', 'It is not raining, so we walked.'],
    human: ['The meeting is not on Tuesday but on Thursday.'],
  },
  'weasel-attribution': {
    hit: ['Experts argue that the policy failed.', 'Some say the plan is unwise.', 'Studies suggest the effect is large.', 'Observers have noted a shift in tone.'],
    miss: ['Experts argue that the policy failed [3].', 'Studies suggest the effect is large (Lee, 2020).', 'Critics say it works, per [the report](https://example.com/r).', 'Some of the apples are red.'],
    human: ['Dr. Okoye argues that the policy failed.'],
  },
  'despite-challenges': {
    hit: ['Despite its popularity, the town faces challenges such as housing.', 'Despite their success, the company continues to face challenges.'],
    miss: ['Despite the rain, we walked home.', 'Despite its age, the bridge carries 40,000 cars a day.'],
    human: ['Despite the rain, the match went ahead.'],
  },
  'closing-opener': {
    hit: ['First point.\n\nOverall, the garden is a success.', 'First point.\n\nIn conclusion, the plan works.'],
    miss: ['First point.\n\nOverall the budget grew.', 'First point.\n\nThe overall result was a draw.', 'First point, and in conclusion, a second.'],
    human: ['First point.\n\nWe finished the report on Friday.'],
  },
  'inline-header-bullets': {
    hit: ['- **Speed:** fast\n- **Cost:** low\n- **Size:** small\n- **Weight:** light', '- **Efficiency**: fast\n- **Scalability**: wide\n- **Security**: tight'],
    miss: ['- **Note:** one item only', '- Speed: fast\n- Cost: low', '- **Fast** and cheap\n- **Cheap** and fast', '- **Speed:** fast\n- **Cost:** low', '- **Speed:** fast\n- **Cost:** low\n- **Size:** small'],
    human: ['- eggs\n- milk'],
  },
  'emoji-lead': {
    hit: ['## \u{1F680} Getting started', '- ✅ Tests pass'],
    miss: ['## Getting started \u{1F680}', 'A plain \u{1F680} paragraph.'],
    human: ['## Getting started'],
  },
  'title-case-heading': {
    hit: ['## Understanding the Role of Technology in Modern Education', '### Key Takeaways and Future Directions', '## Key Takeaways And Next Steps For Your Team', '## How To Build A Great Team Culture'],
    miss: ['## Alice Walker Memorial Hospital', '## Alice Walker Memorial Hospital Annual Report', '## The Treaty of Westphalia and Its Aftermath', '## Introduction', '## Q3 Results', '## Mary Ann Evans', '## Understanding the role of technology', '# Understanding the Role of Technology in Modern Education', '## Getting Started'],
    human: ['## How we fixed the build'],
  },
  'mechanical-bold': {
    hit: ['**One** thing, **two** things and **three** things.', 'Use **a**, then **b**, then **c**, then **d**.'],
    miss: ['Use the **--force** flag once.', '**One** and **two**.'],
    human: ['Some **bold** word and nothing else.'],
  },
  // group 1: openers and announcements (reader-reported)
  'stock-opener': {
    hit: ['Every team makes hundreds of decisions each quarter.', 'In an era of cheap storage, nobody deletes anything.', 'Imagine a kitchen where nothing is labelled.', 'Have you ever wondered why bread rises?', 'In a world where shops close daily, owners worry.', 'In today’s market, tools change quickly.'],
    miss: ['Soil samples were dried at 60 C for 24 hours.\n\nEvery sample was weighed twice.', 'Every Monday we meet at the pool.', 'We tested the model.\n\nImagine the result.', 'The first line is plain. Have you ever wondered why?'],
    human: ['Soil samples were dried at 60 C for 24 hours.\n\nEvery model was tested twice.'],
  },
  'announcement-filler': {
    hit: ['We’re excited to share some news about the studio.', 'I am thrilled to announce our new office.', 'We are so proud to introduce the new line.', 'I\'m delighted to unveil the plan.'],
    miss: ['We’re excited about the trip.', 'I’m excited to see you on Saturday.', 'We are proud to serve the town since 1950.'],
    human: ['I am pleased to report that the test passed on the second try.'],
  },
  'roadmap-sentence': {
    hit: ['In this post, we’ll look at what a record contains.', 'In this guide I will walk through the setup.', 'Below is a breakdown of the options.', 'Here’s what we’ll cover.', 'Below we walk through the steps.'],
    miss: ['In this paper, we propose a method for sorting.', 'In this section, we show that the bound holds.', 'Below is the wiring table.', 'Here’s what happened next.'],
    human: ['In this chapter the author argues that the harbour failed.'],
  },
  'dive-in': {
    hit: ['Let’s dive in.', 'Let’s unpack the problem.', 'This is a deep dive into the budget.', 'The talk dives into pricing.', 'Let’s delve into the data.'],
    miss: ['She dove into the pool.', 'The divers dive into the quarry at noon.', 'He dived into the lake.'],
    human: ['The kids jumped into the lake and swam to the raft.'],
  },
  // group 2: phrasing patterns
  'whether-youre': {
    hit: ['Whether you’re a seasoned pro or a complete beginner, this guide helps.', 'Whether you are building a startup or running a large team, tools matter.', 'We help everyone. Whether you’re new to the city or a lifelong resident, we welcome you.'],
    miss: ['Whether you’re coming or not, we start at nine.', 'I wonder whether you’re a member or a guest.', 'Whether we win or lose, the picnic is on Saturday.'],
    human: ['Please tell me whether you are free on Friday or Saturday.'],
  },
  'from-to-range': {
    hit: ['We serve clients from startups to enterprises.', 'From small startups to global enterprises, teams rely on it.', 'The course suits learners from beginners to experts.'],
    miss: ['Prices rose from 5 to 10 percent.', 'The train runs from Paris to Lyon.', 'Look from the left to the right.', 'Samples were moved from vials to plates.'],
    human: ['Transfer the cookies from trays to racks and let them cool.'],
  },
  'worth-noting': {
    hit: ['It’s worth noting that the rule changed.', 'It is also worth mentioning the delay.', 'It’s important to remember that costs vary.', 'It is important to understand that results differ.'],
    miss: ['It is important to read the label before use.', 'It is worth the trip.', 'The notes are worth reading.'],
    human: ['Note that the valve must stay closed while the tank fills.'],
  },
  'marketing-verbs': {
    hit: ['We leverage our data to grow.', 'The tool streamlines onboarding.', 'A seamless checkout is the goal.', 'Unlock the full potential of your team.', 'It will elevate your brand.', 'We empower teams.', 'This is a game-changer.', 'They harness the power of wind.', 'Navigating the complexities of tax law is hard.', 'A cutting-edge lab opened.', 'We offer best-in-class support.'],
    miss: ['The lever gave us leverage over the bolt.', 'Unlock the door and enter.', 'Elevate the patient’s legs on a pillow.', 'The board is empowered to sign.', 'A leveraged buyout closed.', 'Seamless steel pipe was used.', 'The cutting edge of the saw is sharp.'],
    human: ['Unlock the door with the brass key and leave the lights off.'],
  },
  'restating-closer': {
    hit: ['First point.\n\nIn summary, the plan works.', 'First point.\n\nUltimately, the garden is a success.', 'Point one.\n\nAt the end of the day, it comes down to trust.', 'Point one.\n\nTo sum up, we agree.', 'Point one.\n\nIn short, it works.', 'Point one.\n\nIn essence, the town agreed.'],
    miss: ['In summary, we agree.\n\nThe next point follows.', 'First point.\n\nThe result was, in short, a draw.', 'First point.\n\nIn conclusion, the plan works.', 'In summary, the plan works.'],
    human: ['Thanks again for the lamp.\n\nSee you on Sunday.'],
  },
  // group 3: density
  'triplet-density': {
    hit: [passage(2), passage(3), passage(2, 16)],
    miss: [passage(1), passage(0), passage(3, 2), 'Mix flour, sugar, and salt. Add eggs, milk, and butter. Stir well. Bake for forty minutes.'],
    human: ['We dried the soil at 60 C for 24 hours. Each sample was weighed twice on the same balance, and the readings agreed to 0.01 g. The cores came from three plots, which we sampled in March, and the log lists plots, depths, and dates. Nothing else changed between runs.'],
  },
};

describe('detectors', () => {
  it('covers every family in the table', () => {
    expect(Object.keys(CASES).sort()).toEqual(FAMILIES.map(f => f.id).sort());
  });

  for (const [family, c] of Object.entries(CASES)) {
    describe(family, () => {
      for (const text of c.hit) it(`flags ${JSON.stringify(text)}`, () => {
        const found = famOf(text, family);
        expect(found.length).toBeGreaterThan(0);
        for (const f of found) {
          expect(f.text.length).toBeLessThanOrEqual(120);
          expect(f.line).toBeGreaterThanOrEqual(1);
          expect(f.why.length).toBeGreaterThan(10);
          expect(f.direction.length).toBeGreaterThan(10);
        }
      });
      for (const text of [...c.miss, ...c.human]) it(`does not flag ${JSON.stringify(text)}`, () => {
        expect(famOf(text, family)).toEqual([]);
      });
    });
  }

  it('puts hard families in the hard tier and the rest in the soft tier', () => {
    const r = report('Certainly! Here is the draft. The garden stands as a testament to patience.');
    expect(r.tiers.hard.map(f => f.family)).toEqual(['chat-residue']);
    expect(r.tiers.soft.map(f => f.family)).toContain('undue-significance');
    expect(r.tiers.hard.every(f => f.tier === 'hard')).toBe(true);
    expect(r.tiers.soft.every(f => f.tier === 'soft')).toBe(true);
  });

  it('tags vocabulary with its eras and names the line of the span', () => {
    const f = famOf('First line.\n\nWe delve into it.', 'vocabulary');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ text: 'delve', line: 3, eras: ['gpt-4'] });
  });

  it('reports the line inside a hard-wrapped paragraph', () => {
    const f = famOf('We looked at the data and\nit stands as a testament to patience.', 'undue-significance');
    expect(f[0].line).toBe(2);
  });

  it('reports one finding where overlapping patterns see the same span', () => {
    const r = report('It stands as a testament to patience.');
    expect(r.tiers.soft.map(f => f.family).sort()).toEqual(['undue-significance']);
    const t = report('Sales rose, highlighting its importance.');
    expect(t.tiers.soft.map(f => f.family)).toEqual(['trailing-participle']);
  });

  it('keeps every direction a revision direction, never a replacement phrase', () => {
    for (const f of FAMILIES) {
      expect(f.direction, f.id).not.toMatch(/\b(?:replace|swap|use)\b.*["“]/i);
      expect(f.direction.length, f.id).toBeLessThan(160);
    }
  });

  it('ignores fenced code, inline code and block quotes', () => {
    const text = [
      'We looked at the data.', '',
      '```', 'It stands as a testament. I hope this helps!', '```', '',
      'Use `delve` and `serves as a` in code.', '',
      '> It stands as a testament to patience. Certainly! We delve in.', '',
    ].join('\n');
    expect(all(report(text))).toEqual([]);
  });

  it('runs only hard artifacts and vocabulary on Fountain drafts, and reads no chat residue there', () => {
    const text = 'Title: T\nForm: tv-drama\n\nINT. GARDEN - DAY\n\nIt stands as a testament, and it serves as a hub. We delve in. Certainly! **A** **B** **C**\n';
    const r = report(text, 'garden.fountain');
    expect(new Set(all(r).map(f => f.family))).toEqual(new Set(['vocabulary']));
  });

  it('runs only hard artifacts and vocabulary on dialog drafts, and reads no chat residue there', () => {
    const text = 'form: quest-dialog\nstart: a\nnodes:\n  - id: a\n    speaker: GUARD\n    text: It stands as a testament, we delve in, and it serves as a gate. As an AI language model I wave.\n    end: true\n';
    const r = report(text, 'gate.dialog.yaml');
    expect(new Set(all(r).map(f => f.family))).toEqual(new Set(['vocabulary']));
  });

  it('runs no formatting detectors on non-Markdown input but does on Markdown', () => {
    const body = '## \u{1F680} Understanding the Role of Technology in Modern Education\n\n- **Speed:** fast\n- **Cost:** low\n- **Size:** small\n- **Weight:** light\n';
    expect(all(report(body)).map(f => f.family)).toEqual(expect.arrayContaining(['emoji-lead', 'title-case-heading', 'inline-header-bullets']));
    expect(all(report('Title: T\nForm: tv-drama\n\nINT. GARDEN - DAY\n\n' + body.replace(/^## /, '') , 'g.fountain')).filter(f => ['emoji-lead', 'title-case-heading', 'inline-header-bullets', 'mechanical-bold'].includes(f.family))).toEqual([]);
  });

  it('skips verse forms with a note and reports nothing', () => {
    const r = report('---\nform: sonnet-shakespearean\n---\nIt stands as a testament to patience, and we delve in.\n');
    expect(r.tiers).toEqual({ hard: [], soft: [] });
    expect(r.skipped).toMatch(/verse/i);
    expect(r.summary).toMatch(/skipped/i);
  });

  it('lets --form override the declared form into a verse form', () => {
    const text = 'It stands as a testament to patience, and we delve in.\n';
    expect(report(text).tiers.soft.length).toBeGreaterThan(0);
    const r = report(text, 'draft.md', 'limerick');
    expect(r.form).toBe('limerick');
    expect(r.skipped).toBeDefined();
  });
});

describe('dive-in does not double-report the vocabulary word', () => {
  it('leaves a bare "delve into" to the vocabulary family only', () => {
    expect(all(report('We delve into the data.')).map(f => [f.family, f.text])).toEqual([['vocabulary', 'delve']]);
  });
  it('reports "Let’s delve" once, as dive-in, not also as vocabulary', () => {
    expect(all(report('Let’s delve into the data.')).map(f => [f.family, f.text])).toEqual([['dive-in', 'Let’s delve']]);
  });
  it('reports "In today’s fast-paced world" once, as undue-significance, not also as stock-opener', () => {
    expect(all(report('In today’s fast-paced digital world, shops close.')).map(f => f.family)).toEqual(['undue-significance']);
  });
});

describe('group 2 interactions', () => {
  it('does not report restating-closer where closing-opener already reports the paragraph', () => {
    for (const t of ['First point.\n\nIn conclusion, the plan works.', 'First point.\n\nOverall, the plan works.'])
      expect(all(report(t)).map(f => f.family), t).toEqual(['closing-opener']);
  });
  it('never reports a marketing verb on a span that vocabulary or promotional already reports', () => {
    const text = 'We leverage a seamless, groundbreaking and vibrant platform. It will streamline and elevate your brand, and harness the pivotal power.';
    const found = all(report(text));
    const m = found.filter(f => f.family === 'marketing-verbs').map(f => f.text);
    const others = found.filter(f => ['vocabulary', 'promotional'].includes(f.family)).map(f => f.text);
    expect(m.length).toBeGreaterThan(1);
    expect(others.length).toBeGreaterThan(1);
    for (const x of m) for (const o of others) expect(x.includes(o) || o.includes(x), `${x} / ${o}`).toBe(false);
  });
});

describe('triplet-density', () => {
  it('keeps the threshold in one exported constant, initially 9 per 1,000 words', () => {
    expect(TRIPLET_DENSITY_PER_1000).toBe(9);
  });
  it('reports nothing just below the threshold and one finding just above it, in a passage of about 120 words', () => {
    const below = passage(1); // 118 words, one list: 8.47 per 1,000
    const above = passage(2); // 124 words, two lists: 16.13 per 1,000
    expect(report(below).words).toBeGreaterThanOrEqual(100);
    expect(report(above).words).toBe(124);
    expect(report(below).measured.tripletListsPer1000).toBeLessThan(TRIPLET_DENSITY_PER_1000);
    expect(report(above).measured.tripletListsPer1000).toBeGreaterThan(TRIPLET_DENSITY_PER_1000);
    expect(famOf(below, 'triplet-density')).toEqual([]);
    expect(famOf(above, 'triplet-density')).toHaveLength(1);
  });
  it('says how many lists there are and the rate, and marks the first list only', () => {
    const [f] = famOf(passage(2), 'triplet-density');
    expect(f.text).toBe('We bought apples, pears, and plums');
    expect(f.why).toMatch(/2 three-item lists/);
    expect(f.why).toMatch(/16\.1 per 1,000 words/);
  });
  it('reads the same quantity as the measured value', () => {
    const r = report(passage(3));
    const [f] = r.tiers.soft.filter(x => x.family === 'triplet-density');
    expect(f.why).toContain(`${r.measured.tripletListsPer1000!.toFixed(1)} per 1,000 words`);
  });
  it('needs 100 words: a short passage dense with lists reports nothing', () => {
    const t = passage(3, 2);
    expect(report(t).words).toBeLessThan(100);
    expect(report(t).measured.tripletListsPer1000).toBeGreaterThan(TRIPLET_DENSITY_PER_1000);
    expect(famOf(t, 'triplet-density')).toEqual([]);
  });
  it('does not run on Fountain drafts', () => {
    const text = 'Title: T\nForm: tv-drama\n\nINT. GARDEN - DAY\n\n' + passage(3) + '\n';
    expect(all(report(text, 'g.fountain')).filter(f => f.family === 'triplet-density')).toEqual([]);
  });
});

describe('new hallmark families on whole drafts', () => {
  const BLOG = [
    'Every team makes hundreds of decisions each quarter. Which vendor to choose, how to structure a database, whether to delay a launch for one more round of testing. Most of these choices are made in meetings or chat threads, and within a few months almost nobody can say exactly why they were made.',
    'A decision record is a short note kept next to the work. It is worth noting that it does not need to be long, and that a paragraph is usually enough. Whether you’re running a team of five or a department of fifty, the same problem shows up.',
    'Our own records began as a single shared page that we filled in after each meeting. In this post, we’ll look at what a useful decision record contains, how to keep the habit light enough that people actually follow it, and what we’ve learned from doing it ourselves.',
  ].join('\n\n');
  const POST = [
    'We’re excited to share some news: Harbor & Pine, our small design studio, has launched a brand-identity service built specifically for local restaurants.',
    'The package covers a logo, a colour palette, and a menu layout, and it leverages everything we have learned from logos to storefronts over the years. Prices start at $900 and a first draft takes two weeks.',
    'In short, we would love to work with you. Send us a message or comment below, and let’s make your brand taste as good as your food.',
  ].join('\n\n');
  const PLAIN = 'The boiler was serviced on 12 March, and the engineer replaced the pressure valve. The flat has been warm since. Mina wants the radiators bled before November; I will do the two upstairs on Saturday and leave the kitchen one for her. The bill was $214, which the landlord has agreed to split with us.';
  const NEW = ['stock-opener', 'announcement-filler', 'roadmap-sentence', 'dive-in', 'whether-youre', 'from-to-range', 'worth-noting', 'marketing-verbs', 'restating-closer', 'triplet-density'];
  const families = (t: string) => [...new Set(all(report(t)).map(f => f.family).filter(f => NEW.includes(f)))];

  it('finds several new families, with the expected spans, in the blog introduction', () => {
    const fams = families(BLOG);
    expect(fams).toEqual(expect.arrayContaining(['stock-opener', 'worth-noting', 'whether-youre', 'roadmap-sentence']));
    expect(famOf(BLOG, 'stock-opener').map(f => f.text)).toEqual(['Every team']);
    expect(famOf(BLOG, 'roadmap-sentence').map(f => f.text)).toEqual(['In this post, we’ll look at']);
  });
  it('finds several new families in the announcement post', () => {
    const fams = families(POST);
    expect(fams).toEqual(expect.arrayContaining(['announcement-filler', 'marketing-verbs', 'from-to-range', 'restating-closer']));
    expect(famOf(POST, 'announcement-filler').map(f => f.text)).toEqual(['We’re excited to share']);
  });
  it('finds none in a plain human paragraph', () => {
    expect(all(report(PLAIN))).toEqual([]);
  });
});

describe('inline-header bullets, narrowed', () => {
  const list = (...labels: string[]) => labels.map(l => `- **${l}:** text`).join('\n');
  const hits = (text: string) => famOf(text, 'inline-header-bullets').length;

  it('exempts the labels Note, Warning, Tip, Caution, Important and Example, however many bullets', () => {
    for (const label of ['Note', 'Warning', 'Tip', 'Caution', 'Important', 'Example']) {
      expect(hits(list(label, label, label, label, label)), label).toBe(0);
    }
    expect(hits(list('Note', 'Warning', 'Tip', 'Caution'))).toBe(0);
  });

  it('flags four or more adjacent bullets with any labels, each bullet once', () => {
    expect(hits(list('Speed', 'Cost', 'Size', 'Weight'))).toBe(4);
    expect(hits(list('Speed', 'Cost', 'Size', 'Weight', 'Color'))).toBe(5);
  });

  it('flags three adjacent bullets only when the labels are all different abstract labels', () => {
    expect(hits(list('Efficiency', 'Scalability', 'Security'))).toBe(3);
    expect(hits(list('Community', 'Education', 'Sustainability'))).toBe(3);
    expect(hits(list('Efficiency', 'Efficiency', 'Security'))).toBe(0);
    expect(hits(list('Efficiency', 'Scalability', 'Cost'))).toBe(0);
    expect(hits(list('Speed', 'Cost', 'Size'))).toBe(0);
  });

  it('does not count an exempt label toward a run', () => {
    expect(hits(list('Efficiency', 'Note', 'Scalability', 'Security'))).toBe(0);
  });

  it('does not join bullets separated by a paragraph', () => {
    expect(hits(`${list('Efficiency', 'Scalability')}\n\nA paragraph.\n\n${list('Security', 'Quality')}`)).toBe(0);
  });
});

/** Exact spans per soft family: what is highlighted, not only that something was. */
const SPANS: Array<[family: string, text: string, spans: string[]]> = [
  ['vocabulary', 'We delve into the data.', ['delve']],
  ['vocabulary', 'The result was pivotal and the garden vibrant.', ['pivotal', 'vibrant']],
  ['copula-avoidance', 'The library serves as a meeting hall.', ['serves as']],
  ['copula-avoidance', 'It functions as an archive for the town.', ['functions as']],
  ['promotional', 'A groundbreaking lab opened.', ['groundbreaking']],
  ['promotional', 'The inn is nestled in the hills.', ['nestled']],
  ['undue-significance', 'The garden stands as a testament to patience.', ['stands as a testament']],
  ['undue-significance', 'Water plays a pivotal role in growth.', ['plays a pivotal role']],
  ['trailing-participle', 'The plant closed, highlighting the scale of the problem.', [', highlighting the scale of the problem.']],
  ['negative-parallelism', 'This is not just a tool but a movement.', ['not just a tool but']],
  ['negative-parallelism', 'It is not a bug, it is a feature.', ['It is not a bug, it is']],
  ['weasel-attribution', 'Experts argue that the policy failed.', ['Experts argue']],
  ['weasel-attribution', 'Some say the plan is unwise.', ['Some say']],
  ['despite-challenges', 'Despite its popularity, the town faces challenges such as housing.', ['Despite its popularity, the town faces challenges']],
  ['closing-opener', 'First point.\n\nOverall, the garden is a success.', ['Overall, the garden is a success.']],
  ['inline-header-bullets', '- **Speed:** fast\n- **Cost:** low\n- **Size:** small\n- **Weight:** light', ['**Speed:** fast', '**Cost:** low', '**Size:** small', '**Weight:** light']],
  ['emoji-lead', '- ✅ Tests pass', ['✅ Tests pass']],
  ['title-case-heading', '## Understanding the Role of Technology in Modern Education', ['Understanding the Role of Technology in Modern Education']],
  ['mechanical-bold', 'Use **a**, then **b**, then **c**, then **d**. We met on Tuesday and walked home together.', ['**a**, then **b**, then **c**, then **d**']],
  ['triplet-density', passage(2), ['We bought apples, pears, and plums']],
  ['whether-youre', 'Whether you’re a seasoned pro or a complete beginner, this guide helps.', ['Whether you’re a seasoned pro or a complete beginner']],
  ['whether-youre', 'Whether you are building a startup or running a large team, tools matter.', ['Whether you are building a startup or running a large team']],
  ['from-to-range', 'We serve clients from startups to enterprises.', ['from startups to enterprises']],
  ['from-to-range', 'From small startups to global enterprises, teams rely on it.', ['From small startups to global enterprises']],
  ['from-to-range', 'The course suits learners from beginners to experts.', ['from beginners to experts']],
  ['worth-noting', 'It’s worth noting that the rule changed.', ['It’s worth noting that']],
  ['worth-noting', 'It is also worth mentioning the delay.', ['It is also worth mentioning']],
  ['worth-noting', 'It’s important to remember that costs vary.', ['It’s important to remember that']],
  ['marketing-verbs', 'We leverage our data to grow.', ['leverage']],
  ['marketing-verbs', 'The tool streamlines onboarding.', ['streamlines']],
  ['marketing-verbs', 'A seamless checkout is the goal.', ['seamless']],
  ['marketing-verbs', 'Unlock the full potential of your team.', ['Unlock the full']],
  ['marketing-verbs', 'It will elevate your brand.', ['elevate your brand']],
  ['marketing-verbs', 'We empower teams.', ['empower']],
  ['marketing-verbs', 'This is a game-changer.', ['game-changer']],
  ['marketing-verbs', 'They harness the power of wind.', ['harness the']],
  ['marketing-verbs', 'Navigating the complexities of tax law is hard.', ['Navigating the complexities']],
  ['marketing-verbs', 'A cutting-edge lab opened.', ['cutting-edge']],
  ['marketing-verbs', 'We offer best-in-class support.', ['best-in-class']],
  ['restating-closer', 'First point.\n\nIn summary, the plan works.', ['In summary, the plan works.']],
  ['restating-closer', 'First point.\n\nAt the end of the day, it comes down to trust. We met on Tuesday.', ['At the end of the day, it comes down to trust.']],
  ['stock-opener', 'Every team makes hundreds of decisions each quarter.', ['Every team']],
  ['stock-opener', 'Imagine a kitchen where nothing is labelled.', ['Imagine']],
  ['stock-opener', 'In an era of cheap storage, nobody deletes anything.', ['In an era of']],
  ['stock-opener', 'Have you ever wondered why bread rises?', ['Have you ever wondered']],
  ['stock-opener', 'In today’s market, tools change quickly.', ['In today’s']],
  ['announcement-filler', 'We’re excited to share some news about the studio.', ['We’re excited to share']],
  ['announcement-filler', 'I am thrilled to announce our new office.', ['I am thrilled to announce']],
  ['roadmap-sentence', 'In this post, we’ll look at what a record contains.', ['In this post, we’ll look at']],
  ['roadmap-sentence', 'Below is a breakdown of the options.', ['Below is a breakdown']],
  ['roadmap-sentence', 'Here’s what we’ll cover.', ['Here’s what we’ll cover']],
  ['dive-in', 'Let’s dive in.', ['Let’s dive in']],
  ['dive-in', 'This is a deep dive into the budget.', ['deep dive']],
  ['dive-in', 'The talk dives into pricing.', ['dives into']],
  ['dive-in', 'Let’s delve into the data.', ['Let’s delve']],
];

describe('matched spans', () => {
  it('has a span case for every soft family', () => {
    expect(new Set(SPANS.map(s => s[0]))).toEqual(new Set(FAMILIES.filter(f => f.tier === 'soft').map(f => f.id)));
  });
  for (const [family, text, spans] of SPANS) {
    it(`${family} highlights ${JSON.stringify(spans)} in ${JSON.stringify(text)}`, () => {
      expect(famOf(text, family).map(f => f.text)).toEqual(spans);
    });
  }

  it('reports no span longer than 120 characters or equal to a whole multi-sentence paragraph', () => {
    const filler = ' We met on Tuesday and walked home together.';
    const long = readFileSync(new URL('./fixtures/audit/model-like.md', import.meta.url), 'utf8');
    const inputs = [long, ...Object.values(CASES).flatMap(c => c.hit.map(t => t + filler)), ...SPANS.map(s => s[1] + filler)];
    let checked = 0;
    for (const input of inputs) {
      const paragraphs = input.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => p.replace(/\s+/g, ' ').trim());
      for (const f of all(report(input))) {
        checked++;
        expect(f.text.length, f.family).toBeLessThanOrEqual(120);
        if (['inline-header-bullets', 'emoji-lead', 'title-case-heading'].includes(f.family)) continue; // one block is one line
        expect(paragraphs.includes(f.text), `${f.family} spans a whole paragraph: ${f.text}`).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(30);
  });
});

describe('formatting checks without raw text', () => {
  const NOTE = 'Formatting checks were skipped for lack of raw text.';
  const BULLETS = '- **Speed:** fast\n- **Cost:** low\n- **Size:** small\n- **Weight:** light\n';
  it('adds a note and skips formatting detectors when the raw re-parse does not line up', () => {
    const r = buildReport(parseDocument('d.md', BULLETS, {}), 'One unrelated paragraph.');
    expect(r.measured.notes).toContain(NOTE);
    expect(r.tiers.soft.filter(f => f.family === 'inline-header-bullets')).toEqual([]);
  });
  it('adds the same note when no source text is given for a Markdown document', () => {
    expect(buildReport(parseDocument('d.md', 'A paragraph.', {})).measured.notes).toContain(NOTE);
  });
  it('adds no note when the raw text lines up, and leaves the shared notes list alone', () => {
    const r = report(BULLETS);
    expect(r.measured.notes).not.toContain(NOTE);
    expect(r.tiers.soft.filter(f => f.family === 'inline-header-bullets')).toHaveLength(4);
    expect(MEASURED_NOTES).not.toContain(NOTE);
  });
  it('adds no note for a non-Markdown document', () => {
    expect(report('Title: T\nForm: tv-drama\n\nINT. GARDEN - DAY\n\nHe waits.\n', 'g.fountain').measured.notes).not.toContain(NOTE);
  });
});

describe('measured values', () => {
  const text = 'One — two. Three — four, five, and six. The garden is small and the beds are full. It serves as a hub.';
  it('reports em dashes, sentence variation, triplets and the is/are share without flagging them', () => {
    const r = report(text);
    expect(r.measured.emDashesPer1000).toBeGreaterThan(0);
    expect(r.measured.sentenceLengthVariation).toBeGreaterThan(0);
    expect(r.measured.tripletListsPer1000).toBeGreaterThan(0);
    expect(r.measured.isAreShare).toBeCloseTo(2 / 3, 1);
    expect(all(r).some(f => /dash|triplet|variation/.test(f.family))).toBe(false);
    expect(r.measured.notes.join(' ')).toMatch(/model/);
  });
  it('is null where the share cannot be computed', () => {
    expect(report('Rain fell.').measured.isAreShare).toBeNull();
  });
});

describe('summary, limits and forbidden wording', () => {
  const drafts = ['model-like.md', 'human-plain.md'];
  const read = (n: string) => report(readFileSync(new URL(`./fixtures/audit/${n}`, import.meta.url), 'utf8'));

  const HEAD = 'phrasing or structure hallmarks some readers associate with AI-generated text';
  const TAIL = 'Human writers use these patterns too; this shows nothing about who wrote the passage.';
  const NONE = 'No such hallmarks found. This shows nothing about who wrote the passage.';
  it('has no cluster field and no cluster wording in the summary', () => {
    for (const d of drafts) {
      const r = read(d);
      expect(r).not.toHaveProperty('cluster');
      expect(r.summary).not.toMatch(/cluster/i);
    }
  });
  it('says exactly one headline: a count in families, or none found', () => {
    const m = read('model-like.md');
    const fams = [...new Set(m.tiers.soft.map(f => f.family))];
    expect(m.summary).toBe(`${m.tiers.soft.length} ${HEAD}, in ${fams.length} families (${fams.join(', ')}). ${TAIL}`);
    expect(read('human-plain.md').summary).toBe(NONE);
  });
  it('uses the singular for one hallmark in one family', () => {
    const r = report('It stands as a testament to the garden and its people. ' + 'We met on Tuesday and walked home together. '.repeat(12));
    expect(r.words).toBeGreaterThanOrEqual(100);
    expect(r.tiers.soft).toHaveLength(1);
    expect(r.summary).toBe(`1 ${HEAD.replace('hallmarks', 'hallmark')}, in 1 family (undue-significance). ${TAIL}`);
  });
  it('adds the hard-findings sentence, then the short-text sentence, after the headline', () => {
    const long = report('Certainly! Here is the draft. ' + 'We met on Tuesday and walked home together. '.repeat(15));
    expect(long.summary).toBe(`${NONE} 1 hard artifact found; these are defects in finished text whoever wrote it.`);
    const short = report('Certainly! Here is the draft.\n\nWe met on Tuesday.');
    expect(short.summary).toBe(`${NONE} 1 hard artifact found; these are defects in finished text whoever wrote it. The passage is under 100 words, so there is little to find.`);
  });
  it('says the passage is short when under 100 words, and not otherwise', () => {
    const r = report('It stands as a testament, serves as a hub, and is a vibrant, groundbreaking, pivotal place.');
    expect(r.summary).toMatch(/ The passage is under 100 words, so there is little to find\.$/);
    expect(read('model-like.md').summary).not.toMatch(/under 100 words/);
  });
  it('keeps the skipped summary for a verse form', () => {
    expect(report('A line.\n', 'p.md', 'limerick').summary).toBe('Skipped: verse forms are not audited.');
  });
  it('writes "1 family" and "N families" in the summary', () => {
    expect(report('It stands as a testament to the garden and its people. We met on Tuesday.').summary).toMatch(/in 1 family \(/);
    expect(report('It stands as a testament, serves as a hub, and is a vibrant, groundbreaking place. Experts argue so.').summary).toMatch(/in [2-9] families \(/);
  });
  it('states the standing limits', () => {
    const { limits } = read('human-plain.md');
    expect(limits).toMatch(/hallmarks some readers associate with AI-generated text/);
    expect(limits).toMatch(/authorship/);
    expect(limits).toMatch(/does not/);
    expect(limits).toMatch(/clean result proves nothing/);
    expect(limits).toMatch(/non-native/);
    expect(limits).toMatch(/conventions/);
  });
  it('never emits a verdict, a probability or a score in any string', () => {
    const extra = ['Certainly! As an AI language model, I hope this helps! It stands as a testament.', 'Plain text.', '---\nform: limerick\n---\nA line.\n'];
    const strings: string[] = [];
    const walk = (v: unknown) => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    for (const d of drafts) walk(read(d));
    for (const e of extra) walk(report(e));
    walk(FAMILIES);
    walk(LIMITS);
    walk(MEASURED_NOTES);
    expect(strings.length).toBeGreaterThan(50);
    expect(bannedIn(strings)).toEqual([]);
  });

  /** Every phrase that states or implies authorship, a probability or a score. */
  const BANNED = /likely AI|AI-generated|AI-written|written by (?:an? )?(?:AI|person|human)|human-written|AI-ness|probab|\bscore\b|\d\s*%|\bdetectors?\b/i;
  /** The one sentence about detectors the audit may print: it says they misjudge plain and non-native writing, and claims nothing about a text. */
  const DETECTOR_LIMIT = 'Plain wording and non-native writing trigger some detectors in published research; this audit does not flag them.';
  /** The only place the phrase 'AI-generated text' may appear (the singular is allowed for the one-hallmark headline). */
  const HALLMARKS = 'hallmarks some readers associate with AI-generated text';
  const bannedIn = (strings: string[]) => strings
    .map(s => s.replace(DETECTOR_LIMIT, '').replace(new RegExp(HALLMARKS.replace('hallmarks', 'hallmarks?'), 'gi'), ''))
    .filter(s => BANNED.test(s) && !/^As an AI language model/.test(s));

  describe('every output surface', () => {
    const cli = join(import.meta.dirname, '..', 'scripts', 'prose.mjs');
    const prose = (...args: string[]) => {
      const home = mkdtempSync(join(tmpdir(), 'prose-audit-words-'));
      try {
        const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, AGENT_PROSE_HOME: home } });
        return `${r.stdout}\n${r.stderr}`;
      } finally { rmSync(home, { recursive: true, force: true }); }
    };
    const lines = (text: string) => text.split('\n');
    const texts = [
      readFileSync(new URL('./fixtures/audit/model-like.md', import.meta.url), 'utf8'),
      readFileSync(new URL('./fixtures/audit/human-plain.md', import.meta.url), 'utf8'),
      'Certainly! As an AI language model, I hope this helps! It stands as a testament to patience.\n\nThe plan is [here](https://example.com/?utm_source=chatgpt.com).',
      'Plain text.',
      '---\nform: limerick\n---\nA line.\n',
    ];

    it('renderText has no authorship, probability or score wording for a model-like draft, a plain one, hard findings and a skipped form', () => {
      for (const t of texts) {
        const out = renderText(report(t));
        expect(bannedIn(lines(out)), t.slice(0, 40)).toEqual([]);
      }
    });
    it('--text, the error JSON and --help print none of it either', () => {
      const dir = mkdtempSync(join(tmpdir(), 'prose-audit-words-'));
      try {
        const file = join(dir, 'model.md');
        writeFileSync(file, texts[0]);
        const outputs = [
          prose('audit', file, '--text'), prose('audit', file),
          prose('audit', join(dir, 'missing.md')), prose('audit', file, '--form', 'nonsense'),
          prose('audit', '--help'), prose('--help'),
        ];
        for (const o of outputs) expect(bannedIn(lines(o)), o.slice(0, 60)).toEqual([]);
        expect(outputs[0]).toMatch(/Hallmarks some readers associate with AI-generated text/);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
    it('the guard catches the new phrases', () => {
      for (const s of ['This is human-written.', 'It was written by a person.', 'Written by a human.', 'The detector says so.', 'Detectors flag it.'])
        expect(bannedIn([s]), s).toHaveLength(1);
      expect(bannedIn([DETECTOR_LIMIT])).toEqual([]);
      expect(bannedIn([`These are ${HALLMARKS}.`])).toEqual([]);
      for (const x of ['This reads as AI-generated text.', 'It is likely AI.', 'A probability of 80%.', 'AI-generated hallmarks.', 'Written by AI.']) expect(bannedIn([x]), x).toHaveLength(1);
    });
  });
  it('prints the lexicon review date', () => {
    expect(read('human-plain.md').lexicon.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/** The v2 families that rest on readers and our baseline audits, not on a published source. Grows by group. */
const READER_REPORTED = ['stock-opener', 'announcement-filler', 'roadmap-sentence', 'dive-in', 'whether-youre', 'from-to-range', 'worth-noting', 'marketing-verbs'];

describe('evidence tiers', () => {
  const read = (n: string) => report(readFileSync(new URL(`./fixtures/audit/${n}`, import.meta.url), 'utf8'));
  it('gives every family an evidence tier', () => {
    for (const f of FAMILIES) expect(['corpus', 'field-guide', 'reader-reported'], f.id).toContain(f.evidence);
  });
  it('assigns vocabulary to corpus studies, the v1 families to the field guide and the v2 hallmarks as listed', () => {
    expect(FAMILIES.filter(f => f.evidence === 'corpus').map(f => f.id)).toEqual(['vocabulary']);
    expect(FAMILIES.filter(f => f.evidence === 'reader-reported').map(f => f.id)).toEqual(READER_REPORTED);
    expect(FAMILIES.filter(f => f.evidence === 'field-guide')).toHaveLength(FAMILIES.length - 1 - READER_REPORTED.length);
  });
  it('says in plain words that a reader-reported family has no published source', () => {
    expect(EVIDENCE_WORDS['reader-reported']).toMatch(/no published source/);
  });
  it('lists evidence and sources for each family that has findings in a top-level families map', () => {
    const r = read('model-like.md');
    const found = [...new Set([...r.tiers.hard, ...r.tiers.soft].map(f => f.family))];
    expect(Object.keys(r.families)).toEqual(found);
    for (const id of found) {
      const def = FAMILIES.find(f => f.id === id)!;
      expect(r.families[id]).toEqual({ evidence: def.evidence, sources: def.sources });
    }
    expect(r.families.vocabulary.evidence).toBe('corpus');
    expect(read('human-plain.md').families).toEqual({});
  });
  it('states the evidence on one line per family in the text output', () => {
    const out = renderText(read('model-like.md'));
    expect(out).toMatch(/Evidence: corpus studies/);
    expect(out).toMatch(/Evidence: field guide \(Wikipedia's descriptive, informational writing\)/);
    const families = Object.keys(read('model-like.md').families).length;
    expect(out.split('\n').filter(l => /^ {4}Evidence: /.test(l))).toHaveLength(families);
  });
});

describe('sources', () => {
  it('cites only known references from every family, and the limits and measured notes', () => {
    const ids = new Set(REFERENCES.map(r => r.id));
    for (const entry of AUDIT_SOURCES) {
      const def = FAMILIES.find(f => f.id === entry.id);
      // A reader-reported family has no published source; every other entry cites at least one.
      if (def?.evidence !== 'reader-reported') expect(entry.sources.length, entry.id).toBeGreaterThan(0);
      for (const s of entry.sources) expect(ids, `${entry.id} -> ${s}`).toContain(s);
    }
    for (const f of FAMILIES) expect(AUDIT_SOURCES.map(e => e.id)).toContain(f.id);
  });
});
