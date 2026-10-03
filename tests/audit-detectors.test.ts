import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from '../src/document.ts';
import { buildReport, LIMITS, renderText } from '../src/audit/report.ts';
import { AUDIT_SOURCES, FAMILIES, MEASURED_NOTES, type Finding } from '../src/audit/detectors.ts';
import { REFERENCES } from '../src/craft/rules.ts';

const report = (text: string, name = 'draft.md', form?: string) => buildReport(parseDocument(name, text, form ? { form } : {}), text);
const all = (r: ReturnType<typeof report>) => [...r.tiers.hard, ...r.tiers.soft];
const famOf = (text: string, family: string, name = 'draft.md') => all(report(text, name)).filter(f => f.family === family);

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

  it('has no cluster field and no cluster wording in the summary', () => {
    for (const d of drafts) {
      const r = read(d);
      expect(r).not.toHaveProperty('cluster');
      expect(r.summary).not.toMatch(/cluster/i);
    }
  });
  it('adds a hard-findings sentence when there are hard findings', () => {
    const r = report('Certainly! Here is the draft. ' + 'We met on Tuesday and walked home together. '.repeat(3));
    expect(r.summary).toMatch(/1 hard artifact/);
  });
  it('writes "1 family" and "2 families" in the summary', () => {
    const one = report('It stands as a testament to the garden and its people. We met on Tuesday.');
    expect(one.summary).toMatch(/in 1 family/);
    expect(one.summary).not.toMatch(/1 families/);
    expect(report('We met on Tuesday and walked home together.').summary).toMatch(/0 families/);
  });
  it('states the standing limits', () => {
    const { limits } = read('human-plain.md');
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
  const bannedIn = (strings: string[]) => strings
    .map(s => s.replace(DETECTOR_LIMIT, ''))
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
        expect(outputs[0]).toMatch(/Soft findings by family/);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
    it('the guard catches the new phrases', () => {
      for (const s of ['This is human-written.', 'It was written by a person.', 'Written by a human.', 'The detector says so.', 'Detectors flag it.'])
        expect(bannedIn([s]), s).toHaveLength(1);
      expect(bannedIn([DETECTOR_LIMIT])).toEqual([]);
    });
  });
  it('prints the lexicon review date', () => {
    expect(read('human-plain.md').lexicon.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('sources', () => {
  it('cites only known references from every family, and the limits and measured notes', () => {
    const ids = new Set(REFERENCES.map(r => r.id));
    for (const entry of AUDIT_SOURCES) {
      expect(entry.sources.length, entry.id).toBeGreaterThan(0);
      for (const s of entry.sources) expect(ids, `${entry.id} -> ${s}`).toContain(s);
    }
    for (const f of FAMILIES) expect(AUDIT_SOURCES.map(e => e.id)).toContain(f.id);
  });
});
