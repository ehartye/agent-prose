# agent-prose M3a — Variant Sets, Predictions and Recorded Picks

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development, h-superpowers:team-driven-development, or h-superpowers:executing-plans to implement this plan (ask user which approach). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give agent-prose the front half of agent-beeps' owner loop through the CLI alone: the agent writes several variants of a draft along named directions, `prose set check` rejects near-duplicates and verifies that each variant actually moved the way it claims, the agent seals a prediction of the owner's pick, and `prose set pick` records the owner's choice as taste verdicts and reveals whether the prediction hit. Release as 0.2.0 with a ninth skill, `prose-review`.

**Architecture:** A set is a directory `.agent-prose/sets/<id>/` holding `set.json` (`prose/set@1`), a copy of the base draft, and one file per variant. Every variant is measured as a 12-number style feature vector (`src/owner/features.ts`); a direction is a weighted sum of feature movement from the base (`src/owner/directions.ts`); near-duplicates are found by n-gram overlap (`src/owner/similarity.ts`). Predictions are sealed with a SHA-256 so a later edit is detectable. Owner picks append `prose/verdict@1` rows (feature vectors frozen at judging time) to a project log and a per-user log under `AGENT_PROSE_HOME`; those rows are the training data for the taste model in M3c. The reading page (M3b) will read and write the same files.

**Tech Stack:** unchanged (Node ≥ 24, TypeScript 7, commander, zod, yaml, vitest). No new dependency.

**Evidence base:** the beeps owner loop mapped on 2026-10-03 (set/session/prediction/taste design), the M0 research findings on sameness (`docs/research/2026-10-02-m0-findings.md`) and the graded baselines (`docs/research/2026-10-02-skill-baselines.md`: 4 of 5 punch-up options on one angle).

**Where to work:** a worktree branched from `main`, branch `feat/m3-owner-loop`. Never commit to `main`.

**Conventions:** as before — `.ts` import extensions, `import type`, no enums or parameter properties, TDD (write the test, run it, quote the failing line, then implement), stage specific files, Conventional Commits ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Tests never write to the real home directory: they use the helpers in Task 1 (`useTempHome`, `tmpProject`). After each task: `npx vitest run`, `npm run typecheck`, `npm run refs:check` green.

**What this plan deliberately leaves out** (each gets its own plan after this one ships): the LAN server and reading page with duels, refine rounds and read-aloud (M3b); the Bradley-Terry taste model, ranking and the model's own predictions (M3c). Direction scores are *proxies* — they verify that a variant moved in measured style, never that it is better writing.

---

## File map

| File | Responsibility |
|---|---|
| `src/owner/paths.ts` | ids, set and taste directories, `AGENT_PROSE_HOME` |
| `src/owner/features.ts` | the 12 style features, scales, centering, distance |
| `src/owner/directions.ts` | direction → feature weights, scoring, validation |
| `src/owner/similarity.ts` | n-gram Jaccard between two texts |
| `src/owner/sets.ts` | `prose/set@1` schema, create, read, write, list |
| `src/owner/check.ts` | `checkSet`: rejections, warnings, movement |
| `src/owner/prediction.ts` | sealed predictions |
| `src/owner/verdicts.ts` | `prose/verdict@1` rows and logs |
| `src/owner/pick.ts` | `recordPick`: verdicts, reveal, prediction ledger |
| `src/owner/stats.ts` | prediction hit-rate statistics |
| `src/commands/set.ts` | `prose set …` and `prose predict` |
| `src/commands/taste.ts` | `prose taste stats` |
| `src/project.ts` (modify) | export `needProject`; `init` writes `.agent-prose/.gitignore` |
| `skills/prose-review/SKILL.md` | the ninth skill |
| `tests/owner-helpers.ts`, `tests/owner-*.test.ts` | tests and shared fixtures |

---

### Task 1: Paths, project ignore file, and test helpers

**Files:**
- Create: `src/owner/paths.ts`, `tests/owner-helpers.ts`
- Modify: `src/project.ts` (add `needProject`, write `.agent-prose/.gitignore`), `src/commands/project.ts` (import `needProject`)
- Test: `tests/owner-paths.test.ts`

- [ ] **Step 1: Write the shared test helpers** (no test yet exercises them; Task 1's tests do)

`tests/owner-helpers.ts`:
```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeEach } from 'vitest';
import { initProject } from '../src/project.ts';

const made: string[] = [];

/** A fresh temp directory, removed after the test file finishes. Call useTmp() once per file. */
export function tmp(prefix = 'prose-owner-'): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  made.push(d);
  return d;
}
export function useTmp(): void {
  afterAll(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });
}

/** A prose project in a temp directory (its "home" is a separate temp directory, so nothing touches the real one). */
export function tmpProject(): { project: string; write: (name: string, text: string) => string } {
  const home = tmp('prose-home-');
  const project = tmp('prose-proj-');
  initProject(project, { home });
  return {
    project,
    write: (name, text) => {
      const file = join(project, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      return file;
    },
  };
}

/** Point AGENT_PROSE_HOME at a fresh temp directory for each test, restoring it afterwards. */
export function useTempHome(): { home: () => string } {
  let home = '';
  let prior: string | undefined;
  beforeEach(() => { prior = process.env.AGENT_PROSE_HOME; home = tmp('prose-taste-home-'); process.env.AGENT_PROSE_HOME = home; });
  afterEach(() => { if (prior === undefined) delete process.env.AGENT_PROSE_HOME; else process.env.AGENT_PROSE_HOME = prior; });
  return { home: () => home };
}

const header = '---\nform: speech-small\n---\n\n';
export const BASE = `${header}We built the bridge in the rain, in the dark, and in the long months when nobody believed us. It took four years, two floods, and more coffee than the town had ever seen. Today it carries a thousand people a day.\n`;
export const SHORT = `${header}We built the bridge in the rain and the dark. A thousand people cross it every day.\n`;
export const WARM = `${header}We didn't just build a bridge, you know. We built it in the rain, in the dark, when nobody believed we could. And look: a thousand of you cross it every day.\n`;
export const WARM_DUP = WARM.replace('every day', 'every single day');
export const PUNCHY = `${header}Four years. Two floods. One bridge. Nobody doubts it now.\n`;
```

- [ ] **Step 2: Write the failing tests**

`tests/owner-paths.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { globalTasteDir, newId, projectTasteDir, proseHome, setDir, setsDir, validId } from '../src/owner/paths.ts';
import { initProject, needProject } from '../src/project.ts';
import { tmp, useTempHome, useTmp } from './owner-helpers.ts';

useTmp();
const { home } = useTempHome();

describe('ids', () => {
  it('builds sortable ids from the UTC time and a random suffix', () => {
    expect(newId('set', new Date(Date.UTC(2026, 9, 3, 15, 30)), () => 'ab12')).toBe('set-20261003-1530-ab12');
  });
  it('rejects ids that could escape a directory', () => {
    expect(() => validId('../x')).toThrow(ProseError);
    expect(() => validId('Has Caps')).toThrow(/lower-case/);
    expect(validId('set-1')).toBe('set-1');
  });
});

describe('directories', () => {
  it('keeps sets and taste data under .agent-prose', () => {
    expect(setsDir('/p')).toBe(join('/p', '.agent-prose', 'sets'));
    expect(setDir('/p', 'a-1')).toBe(join('/p', '.agent-prose', 'sets', 'a-1'));
    expect(projectTasteDir('/p')).toBe(join('/p', '.agent-prose', 'taste'));
    expect(() => setDir('/p', '../../etc')).toThrow(ProseError);
  });
  it('uses AGENT_PROSE_HOME for per-user data', () => {
    expect(proseHome()).toBe(home());
    expect(globalTasteDir()).toBe(join(home(), 'taste'));
  });
});

describe('project ignore file', () => {
  it('init ignores sets and taste data but never overwrites an edited file', () => {
    const dir = tmp('prose-ign-');
    initProject(dir, { home: tmp('prose-home-') });
    const file = join(dir, '.agent-prose', '.gitignore');
    expect(readFileSync(file, 'utf8')).toBe('sets/\ntaste/\n');
    writeFileSync(file, 'sets/\n');
    initProject(dir, { home: tmp('prose-home-') });
    expect(readFileSync(file, 'utf8')).toBe('sets/\n');
  });
  it('needProject finds the project or says how to make one', () => {
    const dir = tmp('prose-need-');
    expect(() => needProject(dir)).toThrow(/prose init/);
    initProject(dir, { home: tmp('prose-home-') });
    expect(existsSync(needProject(dir))).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/owner-paths.test.ts`
Expected: FAIL — `Cannot find module '../src/owner/paths.ts'`.

- [ ] **Step 4: Implement**

`src/owner/paths.ts`:
```ts
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProseError } from '../errors.ts';
import { PROJECT_DIR } from '../project.ts';

export const ID_RE = /^[a-z0-9-]+$/;

/** Ids become directory names, so they are checked before any path is built. */
export function validId(id: string, what = 'id'): string {
  if (!ID_RE.test(id)) throw new ProseError('E_USAGE', `${what} "${id}" must be lower-case letters, digits and hyphens`);
  return id;
}

/** `<prefix>-<yyyymmdd>-<hhmm>-<4 hex>` from the UTC time; sorts by creation time. */
export function newId(prefix: string, now: Date = new Date(), rand: () => string = () => randomBytes(2).toString('hex')): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}-${rand()}`;
}

export const setsDir = (project: string) => join(project, PROJECT_DIR, 'sets');
export const setDir = (project: string, id: string) => join(setsDir(project), validId(id, 'Set id'));
export const projectTasteDir = (project: string) => join(project, PROJECT_DIR, 'taste');

/** The per-user directory. It is also the managed runtime's home, so tests must override AGENT_PROSE_HOME. */
export const proseHome = () => resolve(process.env.AGENT_PROSE_HOME || join(homedir(), PROJECT_DIR));
export const globalTasteDir = () => join(proseHome(), 'taste');
```

In `src/project.ts` add the `needProject` helper after `initProject`, and make `initProject` write the ignore file. Replace the line `if (created) writeFileSync(file, …)` block with:
```ts
  if (created) writeFileSync(file, JSON.stringify({ schema: 'prose/project@1' }, null, 2) + '\n');
  // Sets and taste data are working files; voice bibles and project.json stay trackable.
  const ignore = join(root, PROJECT_DIR, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, 'sets/\ntaste/\n');
```
and append:
```ts
/** The project at or above `from`, or an E_PROJECT error that says how to create one. */
export function needProject(from: string): string {
  const project = findProject(from);
  if (!project) throw new ProseError('E_PROJECT', `No prose project at or above ${resolve(from)}`, { hint: 'Run prose init in the project root' });
  return project;
}
```
In `src/commands/project.ts` delete the local `needProject` constant and import it: `import { findProject, initProject, needProject } from '../project.ts';` (drop `findProject` from the import only if it is no longer used there).

- [ ] **Step 5: Run the tests, typecheck, commit**

Run: `npx vitest run` — expected: all pass. `npm run typecheck` — exit 0.
```bash
git add src/owner/paths.ts src/project.ts src/commands/project.ts tests/owner-helpers.ts tests/owner-paths.test.ts
git commit -m "feat: owner-loop paths, project ignore file and test helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Style features

Twelve deterministic numbers describe a draft's style. Distances and direction scores are measured in "scale units": one unit is roughly one perceptible change (the scales are this plugin's choice and can be tuned).

**Files:**
- Create: `src/owner/features.ts`
- Test: `tests/owner-features.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/owner-features.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { FEATURES, SCALES, centered, distance, featureVector, toScaledArray } from '../src/owner/features.ts';
import { tmp, useTmp } from './owner-helpers.ts';

useTmp();
const doc = (body: string) => {
  const f = join(tmp(), 'd.md');
  writeFileSync(f, `---\nform: speech-small\n---\n\n${body}\n`);
  return loadDocument(f);
};

describe('featureVector', () => {
  const v = featureVector(doc("You can't stop now! Why would you? We keep going."));

  it('describes length, rhythm and word shape', () => {
    expect(v.length).toBeCloseTo(Math.log2(10), 5);
    expect(v.sentence).toBeCloseTo(Math.log2(3.33), 2);
    expect(v.wordLen).toBeCloseTo(3.7, 5);
    expect(v.variety).toBeCloseTo(9 / Math.sqrt(10), 5);
  });

  it('measures voice: contractions, you, exclamations, questions', () => {
    expect(v.contractions).toBeCloseTo(100, 5);
    expect(v.secondPerson).toBeCloseTo(200, 5);
    expect(v.exclaim).toBeCloseTo(1 / 3, 5);
    expect(v.question).toBeCloseTo(1 / 3, 5);
  });

  it('is all zeros for a draft with no prose', () => {
    const z = featureVector(doc(''));
    for (const f of FEATURES) expect(z[f]).toBe(0);
  });
});

describe('scaling', () => {
  it('has a positive scale for every feature', () => {
    for (const f of FEATURES) expect(SCALES[f]).toBeGreaterThan(0);
  });
  it('centres a pool so each dimension sums to zero', () => {
    const xs = centered([featureVector(doc('One two three.')), featureVector(doc('Four five six seven eight nine.')), featureVector(doc('Ten.'))]);
    for (let i = 0; i < FEATURES.length; i++) expect(xs.reduce((a, x) => a + x[i], 0)).toBeCloseTo(0, 9);
  });
  it('measures distance in scale units, symmetrically', () => {
    const a = featureVector(doc('Short one.'));
    const b = featureVector(doc("We didn't think you would come, but you did, and that's lovely."));
    expect(distance(a, b)).toBeGreaterThan(0);
    expect(distance(a, b)).toBeCloseTo(distance(b, a), 9);
    expect(distance(a, a)).toBe(0);
    expect(toScaledArray(a)).toHaveLength(FEATURES.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/owner-features.test.ts`
Expected: FAIL — cannot find `../src/owner/features.ts`.

- [ ] **Step 3: Implement**

`src/owner/features.ts`:
```ts
import type { Doc } from '../ir.ts';
import { PROSE_KINDS } from '../kinds.ts';
import { measureStyle } from '../measure/style.ts';
import { sentences, words } from '../text.ts';

/**
 * Twelve style features. Raw values are in natural units; SCALES convert movement into comparable "scale units"
 * (about one perceptible change). The scales are this plugin's choice, not a source's.
 */
export const FEATURES = ['length', 'sentence', 'rhythm', 'wordLen', 'variety', 'contractions', 'hedges', 'passive', 'exclaim', 'question', 'secondPerson', 'nominal'] as const;
export type Feature = typeof FEATURES[number];
export type FeatureVector = Record<Feature, number>;

export const SCALES: FeatureVector = {
  length: 0.5,        // log2 words: 0.5 is a 41% change
  sentence: 0.4,      // log2 mean sentence length
  rhythm: 0.15,       // sentence-length variation (sd / mean)
  wordLen: 0.3,       // mean characters per word
  variety: 1.5,       // types per sqrt(tokens)
  contractions: 10,   // per 1,000 words
  hedges: 5,          // per 1,000 words
  passive: 0.1,       // share of sentences
  exclaim: 0.1,       // share of sentences
  question: 0.1,      // share of sentences
  secondPerson: 10,   // you/your per 1,000 words
  nominal: 1.5,       // nominalizations per 100 words
};

const SECOND = new Set(['you', 'your', 'yours', 'yourself', 'yourselves', "you're", "you've", "you'll", "you'd"]);
const ENDS_EXCLAIM = /!["'”’)\]]*$/;
const ENDS_QUESTION = /\?["'”’)\]]*$/;

export function featureVector(doc: Doc): FeatureVector {
  const prose = doc.blocks.filter(b => PROSE_KINDS.has(b.kind));
  const style = measureStyle(prose);
  const tokens = prose.flatMap(b => words(b.text)).map(w => w.toLowerCase().replaceAll('’', "'"));
  const sents = prose.flatMap(b => sentences(b.text));
  const n = tokens.length;
  const share = (re: RegExp) => (sents.length ? sents.filter(s => re.test(s)).length / sents.length : 0);
  const mean = style.sentenceLength.mean;
  return {
    length: Math.log2(Math.max(n, 1)),
    sentence: Math.log2(Math.max(mean, 1)),
    rhythm: mean > 0 ? style.sentenceLength.sd / mean : 0,
    wordLen: n ? tokens.reduce((a, t) => a + t.length, 0) / n : 0,
    variety: n ? new Set(tokens).size / Math.sqrt(n) : 0,
    contractions: style.contractions.per1000,
    hedges: style.hedges.per1000,
    passive: style.passive.rate,
    exclaim: share(ENDS_EXCLAIM),
    question: share(ENDS_QUESTION),
    secondPerson: n ? (tokens.filter(t => SECOND.has(t)).length * 1000) / n : 0,
    nominal: style.nominalizations.per100,
  };
}

export const toScaledArray = (v: FeatureVector): number[] => FEATURES.map(f => v[f] / SCALES[f]);

/** Scaled vectors with the pool mean removed, so weights are relative to the other candidates. */
export function centered(vs: FeatureVector[]): number[][] {
  const xs = vs.map(toScaledArray);
  const mean = FEATURES.map((_, i) => xs.reduce((a, x) => a + x[i], 0) / (xs.length || 1));
  return xs.map(x => x.map((c, i) => c - mean[i]));
}

/** Euclidean distance in scale units. */
export function distance(a: FeatureVector, b: FeatureVector): number {
  return Math.sqrt(FEATURES.reduce((s, f) => s + ((a[f] - b[f]) / SCALES[f]) ** 2, 0));
}
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run tests/owner-features.test.ts` — expected: PASS. If `variety` or `wordLen` is off, print the token list: `words()` keeps apostrophes inside a token (`can't` is one token).
```bash
git add src/owner/features.ts tests/owner-features.test.ts
git commit -m "feat: twelve style features with scales, centering and distance

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Directions

**Files:**
- Create: `src/owner/directions.ts`
- Test: `tests/owner-directions.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/owner-directions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDocument } from '../src/document.ts';
import { DIRECTIONS, KNOWN_DIRECTIONS, MOVE_MIN, assertDirections, directionScore } from '../src/owner/directions.ts';
import { featureVector } from '../src/owner/features.ts';
import { ProseError } from '../src/errors.ts';
import { BASE, PUNCHY, SHORT, WARM, tmp, useTmp } from './owner-helpers.ts';

useTmp();
const vec = (text: string) => { const f = join(tmp(), 'd.md'); writeFileSync(f, text); return featureVector(loadDocument(f)); };

describe('directions', () => {
  it('names the directions writers ask for', () => {
    expect(KNOWN_DIRECTIONS).toEqual(expect.arrayContaining(['punchier', 'warmer', 'drier', 'shorter', 'longer', 'plainer', 'more-formal', 'less-formal', 'weirder']));
    for (const d of Object.keys(DIRECTIONS)) expect(Object.keys(DIRECTIONS[d]).length).toBeGreaterThan(0);
  });

  it('validates a list and names the known ones when one is wrong', () => {
    expect(assertDirections(['warmer', 'drier'])).toEqual(['warmer', 'drier']);
    expect(() => assertDirections(['spicier'])).toThrow(ProseError);
    expect(() => assertDirections(['spicier'])).toThrow(/warmer/);
  });

  it('scores movement from the base: shorter and warmer rewrites move as claimed', () => {
    const base = vec(BASE);
    expect(directionScore(base, vec(SHORT), 'shorter')).toBeGreaterThan(MOVE_MIN);
    expect(directionScore(base, vec(SHORT), 'longer')).toBeLessThan(0);
    expect(directionScore(base, vec(WARM), 'warmer')).toBeGreaterThan(MOVE_MIN);
    expect(directionScore(base, vec(PUNCHY), 'punchier')).toBeGreaterThan(MOVE_MIN);
  });

  it('scores "weirder" as distance from the base, and an unchanged draft as zero', () => {
    const base = vec(BASE);
    expect(directionScore(base, base, 'weirder')).toBe(0);
    expect(directionScore(base, vec(PUNCHY), 'weirder')).toBeGreaterThan(MOVE_MIN);
    expect(directionScore(base, base, 'warmer')).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/owner-directions.test.ts`
Expected: FAIL — cannot find `../src/owner/directions.ts`.

- [ ] **Step 3: Implement**

`src/owner/directions.ts`:
```ts
import { ProseError } from '../errors.ts';
import { distance, SCALES, type Feature, type FeatureVector } from './features.ts';

/**
 * Direction → signed weights on style features. These are PROXIES: they check that a rewrite moved in measured
 * style (shorter sentences, more contractions...), never that it is funnier, warmer or better.
 */
export const DIRECTIONS: Record<string, Partial<Record<Feature, number>>> = {
  punchier: { sentence: -1, hedges: -0.5, passive: -0.5 },
  shorter: { length: -1 },
  longer: { length: 1 },
  warmer: { contractions: 1, secondPerson: 0.5, wordLen: -0.3 },
  drier: { exclaim: -1, question: -0.3 },
  'more-formal': { contractions: -1, nominal: 0.5, secondPerson: -0.3 },
  'less-formal': { contractions: 1, nominal: -0.5 },
  plainer: { wordLen: -1, nominal: -1, passive: -0.5 },
  livelier: { rhythm: 1, exclaim: 0.5, question: 0.5 },
};

/** Directions scored by distance from the base instead of by feature weights. */
export const NOVELTY_DIRECTIONS: ReadonlySet<string> = new Set(['weirder']);

export const KNOWN_DIRECTIONS: string[] = [...Object.keys(DIRECTIONS), ...NOVELTY_DIRECTIONS].sort();

/** A variant "moved" when its score is at least this many scale units (this plugin's choice). */
export const MOVE_MIN = 0.1;

export function assertDirections(list: string[]): string[] {
  for (const d of list) {
    if (!KNOWN_DIRECTIONS.includes(d)) throw new ProseError('E_USAGE', `Unknown direction "${d}"`, { hint: `Known directions: ${KNOWN_DIRECTIONS.join(', ')}` });
  }
  return list;
}

/** Signed movement of `child` from `base` along `direction`, in scale units. */
export function directionScore(base: FeatureVector, child: FeatureVector, direction: string): number {
  if (NOVELTY_DIRECTIONS.has(direction)) return distance(base, child);
  const weights = DIRECTIONS[direction];
  if (!weights) throw new ProseError('E_USAGE', `Unknown direction "${direction}"`);
  return (Object.entries(weights) as Array<[Feature, number]>).reduce((s, [f, w]) => s + (w * (child[f] - base[f])) / SCALES[f], 0);
}
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run tests/owner-directions.test.ts` — expected: PASS (4 tests). If `punchier` on `PUNCHY` fails, print the feature vectors: `PUNCHY` has a much smaller mean sentence length (about 2.75 words vs about 14) so `sentence` should move strongly negative.
```bash
git add src/owner/directions.ts tests/owner-directions.test.ts
git commit -m "feat: style directions as scored feature movement

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Text similarity

**Files:**
- Create: `src/owner/similarity.ts`
- Test: `tests/owner-similarity.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/owner-similarity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DUPLICATE_AT, SIMILAR_AT, similarity } from '../src/owner/similarity.ts';

describe('similarity', () => {
  it('is 1 for the same words and 0 for none shared', () => {
    expect(similarity('Quiet night on the wall.', 'quiet night on the wall')).toBe(1);
    expect(similarity('alpha beta', 'gamma delta')).toBe(0);
  });

  it('uses single words for short texts: a one-word addition is a duplicate', () => {
    expect(similarity("I can't believe you ate the last slice.", "I can't believe you ate the last slice, again.")).toBeGreaterThanOrEqual(DUPLICATE_AT);
  });

  it('keeps different takes on one setup apart', () => {
    expect(similarity("I can't believe you ate the last slice of pizza.", "Even the pizza didn't wait for me.")).toBeLessThan(SIMILAR_AT);
  });

  it('uses three-word phrases once both texts reach 30 words', () => {
    const a = 'We built it in the rain, in the dark, when nobody believed we could, and look: a thousand of you cross it every day, rain or shine, year after year.';
    const b = 'Rain or shine, year after year, a thousand of you cross it every day, and look: nobody believed we could, in the dark, in the rain, when we built it.';
    expect(similarity(a, b)).toBeLessThan(SIMILAR_AT); // same words, rearranged phrases
  });

  it('treats two empty texts as different, not identical', () => {
    expect(similarity('', '')).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/owner-similarity.test.ts`
Expected: FAIL — cannot find `../src/owner/similarity.ts`.

- [ ] **Step 3: Implement**

`src/owner/similarity.ts`:
```ts
import { round2, words } from '../text.ts';

/** At or above this, a variant adds nothing over an earlier one (this plugin's choice). */
export const DUPLICATE_AT = 0.85;
/** At or above this, two variants are close enough to warn about. */
export const SIMILAR_AT = 0.6;
/** At or above this, a variant is barely a rewrite of the base. */
export const BARELY_CHANGED_AT = 0.95;
/** Both texts need this many words before three-word phrases are compared instead of single words. */
const PHRASE_MIN_WORDS = 30;

/** Jaccard overlap of word sets (short texts) or three-word phrases (longer texts); 0..1. */
export function similarity(a: string, b: string): number {
  const wa = words(a).map(w => w.toLowerCase());
  const wb = words(b).map(w => w.toLowerCase());
  const n = Math.min(wa.length, wb.length) >= PHRASE_MIN_WORDS ? 3 : 1;
  const grams = (w: string[]) => {
    const s = new Set<string>();
    for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(' '));
    return s;
  };
  const A = grams(wa);
  const B = grams(wb);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return round2(inter / (A.size + B.size - inter));
}
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run tests/owner-similarity.test.ts` — expected: PASS (5 tests).
```bash
git add src/owner/similarity.ts tests/owner-similarity.test.ts
git commit -m "feat: n-gram similarity for near-duplicate variants

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The set model

**Files:**
- Create: `src/owner/sets.ts`
- Test: `tests/owner-sets.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/owner-sets.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { basePath, createSet, listSets, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { setDir } from '../src/owner/paths.ts';
import { BASE, tmpProject, useTmp } from './owner-helpers.ts';

useTmp();
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

describe('createSet', () => {
  it('copies the draft into a base file and one file per variant, assigning directions round-robin', () => {
    const p = tmpProject();
    const draft = p.write('toast.md', BASE);
    const set = createSet(p.project, draft, { directions: ['punchier', 'drier'], count: 4, id: 'demo', now: new Date(Date.UTC(2026, 9, 3, 12, 0)) });
    expect(set).toMatchObject({ schema: 'prose/set@1', id: 'demo', form: 'speech-small', format: 'markdown', source: 'toast.md', base: 'base.md', directions: ['punchier', 'drier'] });
    expect(set.variants.map(v => [v.index, v.file, v.direction])).toEqual([[1, 'v1.md', 'punchier'], [2, 'v2.md', 'drier'], [3, 'v3.md', 'punchier'], [4, 'v4.md', 'drier']]);
    expect(readFileSync(basePath(p.project, set), 'utf8')).toBe(BASE);
    expect(readFileSync(variantPath(p.project, set, set.variants[3]), 'utf8')).toBe(BASE);
    expect(existsSync(join(setDir(p.project, 'demo'), 'set.json'))).toBe(true);
  });

  it('defaults to three variants, or one per direction up to six, with no direction when none is named', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    expect(createSet(p.project, draft, { id: 'a' }).variants.map(v => v.direction)).toEqual([null, null, null]);
    expect(createSet(p.project, draft, { id: 'b', directions: ['warmer', 'drier', 'plainer', 'shorter'] }).variants).toHaveLength(4);
  });

  it('uses the format of the draft for file names', () => {
    const p = tmpProject();
    const draft = p.write('scene.fountain', 'Title: T\nForm: tv-drama\n\nINT. ROOM - DAY\n\nShe waits.\n');
    expect(createSet(p.project, draft, { id: 'f' }).variants[0].file).toBe('v1.fountain');
  });

  it('refuses bad input with usable errors', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    expect(code(() => createSet(p.project, draft, { count: 1 }))).toBe('E_USAGE');
    expect(code(() => createSet(p.project, draft, { count: 7 }))).toBe('E_USAGE');
    expect(code(() => createSet(p.project, draft, { directions: ['spicier'] }))).toBe('E_USAGE');
    expect(code(() => createSet(p.project, draft, { count: 2, directions: ['warmer', 'drier', 'plainer'] }))).toBe('E_USAGE');
    expect(code(() => createSet(p.project, draft, { id: '../x' }))).toBe('E_USAGE');
    createSet(p.project, draft, { id: 'dup' });
    expect(code(() => createSet(p.project, draft, { id: 'dup' }))).toBe('E_CONFLICT');
  });

  it('records a draft outside the project by file name only', () => {
    const p = tmpProject();
    const outside = join(tmpProject().project, 'x.md');
    writeFileSync(outside, BASE);
    expect(createSet(p.project, outside, { id: 'o' }).source).toBe('x.md');
  });
});

describe('readSet, writeSet, listSets', () => {
  it('round-trips a set, lists newest first, and explains missing or damaged sets', () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    createSet(p.project, draft, { id: 'older', now: new Date(Date.UTC(2026, 9, 1)) });
    const newer = createSet(p.project, draft, { id: 'newer', now: new Date(Date.UTC(2026, 9, 2)) });
    expect(listSets(p.project).map(s => s.id)).toEqual(['newer', 'older']);
    writeSet(p.project, { ...newer, picked: 2 });
    expect(readSet(p.project, 'newer').picked).toBe(2);
    expect(code(() => readSet(p.project, 'missing'))).toBe('E_NOT_FOUND');
    writeFileSync(join(setDir(p.project, 'older'), 'set.json'), '{"schema":"nope"}');
    expect(code(() => readSet(p.project, 'older'))).toBe('E_SCHEMA');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/owner-sets.test.ts`
Expected: FAIL — cannot find `../src/owner/sets.ts`.

- [ ] **Step 3: Implement**

`src/owner/sets.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { loadDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import { FORMATS } from '../kinds.ts';
import { assertDirections } from './directions.ts';
import { newId, setDir, setsDir, validId } from './paths.ts';

export const MIN_VARIANTS = 2;
export const MAX_VARIANTS = 6;
export const DEFAULT_VARIANTS = 3;

const EXT = { fountain: '.fountain', markdown: '.md', dialog: '.dialog.yaml' } as const;

export const VariantSchema = z.strictObject({
  index: z.number().int().min(1),
  file: z.string().min(1),
  direction: z.string().nullable(),
  /** The angle or mechanism this variant takes (e.g. "understatement"); two variants with one label are flagged. */
  label: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});

export const SetSchema = z.strictObject({
  schema: z.literal('prose/set@1'),
  id: z.string().regex(/^[a-z0-9-]+$/),
  createdAt: z.string(),
  form: z.string().min(1),
  format: z.enum(FORMATS),
  /** The draft the set was made from, relative to the project when inside it. */
  source: z.string().min(1),
  base: z.string().min(1),
  directions: z.array(z.string()),
  variants: z.array(VariantSchema).min(MIN_VARIANTS).max(MAX_VARIANTS),
  picked: z.number().int().optional(),
  pickedAt: z.string().optional(),
});

export type Variant = z.infer<typeof VariantSchema>;
export type PromptSet = z.infer<typeof SetSchema>;

const setFile = (project: string, id: string) => join(setDir(project, id), 'set.json');
export const basePath = (project: string, set: PromptSet) => join(setDir(project, set.id), set.base);
export const variantPath = (project: string, set: PromptSet, v: Variant) => join(setDir(project, set.id), v.file);

function relSource(project: string, draft: string): string {
  const rel = relative(project, resolve(draft));
  return (rel.startsWith('..') || isAbsolute(rel) ? basename(draft) : rel).split(sep).join('/');
}

export interface CreateOptions { directions?: string[]; count?: number; now?: Date; id?: string }

/** Copy `draft` into a new set: a base file and one identical variant file per slot for the agent to rewrite. */
export function createSet(project: string, draft: string, opts: CreateOptions = {}): PromptSet {
  const directions = assertDirections(opts.directions ?? []);
  const doc = loadDocument(draft);
  const count = opts.count ?? Math.min(MAX_VARIANTS, Math.max(DEFAULT_VARIANTS, directions.length));
  if (!Number.isInteger(count) || count < MIN_VARIANTS || count > MAX_VARIANTS) {
    throw new ProseError('E_USAGE', `--count must be a whole number from ${MIN_VARIANTS} to ${MAX_VARIANTS}`);
  }
  if (directions.length > count) {
    throw new ProseError('E_USAGE', `${directions.length} directions but only ${count} variants`, { hint: `Raise --count (at most ${MAX_VARIANTS}) or name fewer directions` });
  }
  const id = opts.id ? validId(opts.id, 'Set id') : newId('set', opts.now);
  const dir = setDir(project, id);
  if (existsSync(dir)) throw new ProseError('E_CONFLICT', `Set ${id} already exists`);
  const ext = EXT[doc.format];
  const text = readFileSync(draft, 'utf8');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `base${ext}`), text);
  const variants: Variant[] = Array.from({ length: count }, (_, k) => {
    writeFileSync(join(dir, `v${k + 1}${ext}`), text);
    return { index: k + 1, file: `v${k + 1}${ext}`, direction: directions.length ? directions[k % directions.length] : null };
  });
  const set = SetSchema.parse({
    schema: 'prose/set@1', id, createdAt: (opts.now ?? new Date()).toISOString(), form: doc.form, format: doc.format,
    source: relSource(project, draft), base: `base${ext}`, directions, variants,
  });
  writeFileSync(setFile(project, id), JSON.stringify(set, null, 2) + '\n');
  return set;
}

export function readSet(project: string, id: string): PromptSet {
  const file = setFile(project, id);
  if (!existsSync(file)) throw new ProseError('E_NOT_FOUND', `No set ${id} in ${project}`, { hint: 'prose set list shows the sets' });
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { throw new ProseError('E_SCHEMA', `${file} is not valid JSON: ${(e as Error).message}`); }
  const parsed = SetSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProseError('E_SCHEMA', `${file}: ${issue.message}`, { pointer: '/' + issue.path.join('/') });
  }
  return parsed.data;
}

export function writeSet(project: string, set: PromptSet): void {
  writeFileSync(setFile(project, set.id), JSON.stringify(SetSchema.parse(set), null, 2) + '\n');
}

/** Every readable set, newest first. */
export function listSets(project: string): PromptSet[] {
  const root = setsDir(project);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => readSet(project, e.name))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run tests/owner-sets.test.ts` — expected: PASS.
```bash
git add src/owner/sets.ts tests/owner-sets.test.ts
git commit -m "feat: prose/set@1 variant sets on disk

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `prose set new | list | show | annotate`

**Files:**
- Create: `src/commands/set.ts`
- Modify: `src/cli.ts`
- Test: `tests/owner-set-commands.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/owner-set-commands.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { BASE, tmpProject, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
const fail = async (...args: string[]) => { try { await run(...args); } catch (e) { return e as ProseError; } throw new Error('expected an error'); };

describe('prose set new', () => {
  it('scaffolds a set next to the project of the draft and says what to do next', async () => {
    const p = tmpProject();
    const draft = p.write('talks/toast.md', BASE);
    const out = await run('set', 'new', draft, '--directions', 'shorter,warmer', '--count', '3', '--id', 'demo');
    expect(out).toMatchObject({ set: 'demo', form: 'speech-small', base: 'base.md' });
    expect(out.variants).toEqual([
      { index: 1, file: 'v1.md', direction: 'shorter' }, { index: 2, file: 'v2.md', direction: 'warmer' }, { index: 3, file: 'v3.md', direction: 'shorter' },
    ]);
    expect(out.dir).toBe(join(p.project, '.agent-prose', 'sets', 'demo'));
    expect(out.next).toMatch(/prose set check demo/);
  });

  it('needs a project and names the unknown direction', async () => {
    const p = tmpProject();
    expect((await fail('set', 'new', p.write('t.md', BASE), '--directions', 'spicier')).code).toBe('E_USAGE');
  });
});

describe('prose set list, show, annotate', () => {
  it('lists sets, shows variant text, and records a label and note', async () => {
    const p = tmpProject();
    const draft = p.write('t.md', BASE);
    await run('set', 'new', draft, '--id', 'one');
    const list = await run('set', 'list', '--dir', p.project);
    expect(list.sets).toEqual([expect.objectContaining({ id: 'one', form: 'speech-small', variants: 3, picked: null })]);

    const shown = await run('set', 'show', 'one', '--dir', p.project);
    expect(shown.variants).toHaveLength(3);
    expect(shown.variants[0]).toMatchObject({ index: 1, text: BASE, direction: null });
    expect(shown.prediction).toBe(false);

    const noted = await run('set', 'annotate', 'one', '2', '--label', 'understatement', '--note', 'dry', '--dir', p.project);
    expect(noted.variant).toMatchObject({ index: 2, label: 'understatement', note: 'dry' });
    expect((await run('set', 'show', 'one', '--dir', p.project)).variants[1].label).toBe('understatement');
  });

  it('annotate needs something to change and an existing variant', async () => {
    const p = tmpProject();
    await run('set', 'new', p.write('t.md', BASE), '--id', 'one');
    expect((await fail('set', 'annotate', 'one', '1', '--dir', p.project)).code).toBe('E_USAGE');
    expect((await fail('set', 'annotate', 'one', '9', '--label', 'x', '--dir', p.project)).code).toBe('E_USAGE');
    expect((await fail('set', 'show', 'nope', '--dir', p.project)).code).toBe('E_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/owner-set-commands.test.ts`
Expected: FAIL — `error: unknown command 'set'` surfaced as a thrown `CommanderError`.

- [ ] **Step 3: Implement**

`src/commands/set.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { ProseError } from '../errors.ts';
import { needProject } from '../project.ts';
import { assertDirections } from '../owner/directions.ts';
import { setDir } from '../owner/paths.ts';
import { createSet, listSets, readSet, variantPath, writeSet } from '../owner/sets.ts';

const csv = (s: string | undefined) => (s ? s.split(',').map(x => x.trim()).filter(Boolean) : []);

export function registerSetCommands(program: Command, io: Io): void {
  const set = program.command('set').description('Variant sets: several rewrites of one draft, checked for diversity and direction');

  set.command('new')
    .description('Start a set from a draft: copies it into a base and one file per variant for you to rewrite')
    .argument('<draft>', '.fountain, .md or .dialog.yaml draft inside a prose project')
    .option('--directions <list>', 'comma-separated directions, assigned to variants in turn (e.g. punchier,drier)')
    .option('--count <n>', 'number of variants, 2-6 (default: one per direction, at least 3)')
    .option('--id <id>', 'set id (default: generated)')
    .action((draft: string, opts: { directions?: string; count?: string; id?: string }) => {
      const project = needProject(dirname(resolve(draft)));
      const s = createSet(project, draft, {
        directions: csv(opts.directions),
        ...(opts.count !== undefined ? { count: Number(opts.count) } : {}),
        ...(opts.id ? { id: opts.id } : {}),
      });
      io.emit({
        set: s.id, dir: setDir(project, s.id), form: s.form, base: s.base,
        variants: s.variants.map(v => ({ index: v.index, file: v.file, direction: v.direction })),
        next: `Rewrite each variant file in place (keep the format and header), then run: prose set check ${s.id}`,
      });
    });

  set.command('list')
    .description('The sets of a project, newest first')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      io.emit({
        project,
        sets: listSets(project).map(s => ({ id: s.id, form: s.form, createdAt: s.createdAt, variants: s.variants.length, picked: s.picked ?? null })),
      });
    });

  set.command('show')
    .description('A set with the text of every variant, ready to present')
    .argument('<id>', 'set id')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, opts: { dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const s = readSet(project, id);
      io.emit({
        set: s.id, project, form: s.form, directions: s.directions, picked: s.picked ?? null,
        prediction: existsSync(`${setDir(project, id)}/prediction.json`),
        variants: s.variants.map(v => ({ index: v.index, direction: v.direction, label: v.label ?? null, note: v.note ?? null, file: v.file, text: readFileSync(variantPath(project, s, v), 'utf8') })),
      });
    });

  set.command('annotate')
    .description("Record a variant's angle (label) or a note; two variants with one label are flagged by set check")
    .argument('<id>', 'set id')
    .argument('<index>', 'variant number')
    .option('--label <text>', 'the angle or mechanism, e.g. understatement')
    .option('--note <text>', 'a short note for the owner')
    .option('--direction <name>', 'change the direction this variant aims at')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, index: string, opts: { label?: string; note?: string; direction?: string; dir?: string }) => {
      if (opts.label === undefined && opts.note === undefined && opts.direction === undefined) {
        throw new ProseError('E_USAGE', 'Nothing to change', { hint: 'Pass --label, --note or --direction' });
      }
      const project = needProject(opts.dir ?? process.cwd());
      const s = readSet(project, id);
      const v = s.variants.find(x => x.index === Number(index));
      if (!v) throw new ProseError('E_USAGE', `Set ${id} has no variant ${index}`, { hint: `Variants: ${s.variants.map(x => x.index).join(', ')}` });
      if (opts.direction !== undefined) v.direction = assertDirections([opts.direction])[0];
      if (opts.label !== undefined) v.label = opts.label;
      if (opts.note !== undefined) v.note = opts.note;
      writeSet(project, s);
      io.emit({ set: id, variant: v });
    });
}
```
In `src/cli.ts` add `import { registerSetCommands } from './commands/set.ts';` and call `registerSetCommands(program, io);` after `registerRuleCommands(program, io);`.

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run` — expected: all pass (including the existing `capabilities` tests, which only use `arrayContaining`). `npm run typecheck` — exit 0.
```bash
git add src/commands/set.ts src/cli.ts tests/owner-set-commands.test.ts
git commit -m "feat: prose set new, list, show and annotate

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The set check

**Files:**
- Create: `src/owner/check.ts`
- Modify: `src/commands/set.ts` (add `check`)
- Test: `tests/owner-check.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/owner-check.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { checkSet } from '../src/owner/check.ts';
import { createSet, readSet, variantPath, writeSet } from '../src/owner/sets.ts';
import { BASE, PUNCHY, SHORT, WARM, WARM_DUP, tmpProject, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();

function setWith(texts: string[], directions: string[] = []) {
  const p = tmpProject();
  const set = createSet(p.project, p.write('toast.md', BASE), { id: 'demo', count: texts.length, directions });
  set.variants.forEach((v, k) => writeFileSync(variantPath(p.project, set, v), texts[k]));
  return { ...p, set };
}

describe('checkSet', () => {
  it('rejects an untouched variant and keeps real rewrites that moved as claimed', () => {
    const { project, set } = setWith([BASE, WARM, SHORT], ['shorter', 'warmer', 'shorter']);
    const r = checkSet(project, set);
    expect(r.variants[0]).toMatchObject({ index: 1, status: 'rejected', reasons: ['unchanged'] });
    expect(r.variants[1]).toMatchObject({ index: 2, status: 'ok' });
    expect(r.variants[1].movement).toMatchObject({ direction: 'warmer', moved: true });
    expect(r.variants[2].movement).toMatchObject({ direction: 'shorter', moved: true });
    expect(r.keep).toEqual([2, 3]);
    expect(r.ok).toBe(true);
  });

  it('rejects a near-duplicate of an earlier variant and names it', () => {
    const { project, set } = setWith([WARM, WARM_DUP, PUNCHY]);
    const r = checkSet(project, set);
    expect(r.variants[1]).toMatchObject({ status: 'rejected', reasons: ['duplicate-of #1'] });
    expect(r.keep).toEqual([1, 3]);
  });

  it('warns, but keeps, a variant that did not move the way it claimed', () => {
    const { project, set } = setWith([WARM, SHORT], ['longer', 'longer']);
    const r = checkSet(project, set);
    expect(r.variants[1]).toMatchObject({ status: 'ok' });
    expect(r.variants[1].warnings.some(w => w.startsWith('weak-direction'))).toBe(true);
    expect(r.variants[1].movement).toMatchObject({ direction: 'longer', moved: false });
  });

  it('rejects a variant that introduces a lint error, but not one the base already had', () => {
    const bad = `${PUNCHY.trim()} :contentReference[oaicite:1]{index=1}\n`;
    const { project, set } = setWith([WARM, bad]);
    const r = checkSet(project, set);
    expect(r.variants[1].status).toBe('rejected');
    expect(r.variants[1].reasons[0]).toMatch(/^lint-error: ai\.artifact/);
  });

  it('flags two variants that claim the same angle', () => {
    const { project, set } = setWith([WARM, SHORT, PUNCHY]);
    set.variants[0].label = 'Understatement';
    set.variants[2].label = ' understatement ';
    writeSet(project, set);
    const r = checkSet(project, readSet(project, set.id));
    expect(r.variants[2].warnings).toContain('same-angle-as #1 ("understatement")');
  });

  it('reports a variant that no longer parses, and says when too few variants are left', () => {
    const { project, set } = setWith([WARM, '---\nform: [unclosed\n']);
    const r = checkSet(project, set);
    expect(r.variants[1].status).toBe('rejected');
    expect(r.variants[1].reasons[0]).toMatch(/^parse-error:/);
    expect(r.ok).toBe(false);
    expect(r.next).toMatch(/at least 2/);
  });
});

describe('prose set check', () => {
  it('runs the check from the CLI', async () => {
    const { project, set } = setWith([BASE, WARM, PUNCHY]);
    const out = await run('set', 'check', set.id, '--dir', project);
    expect(out.keep).toEqual([2, 3]);
    expect(out.rejected).toEqual([{ index: 1, reasons: ['unchanged'] }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/owner-check.test.ts`
Expected: FAIL — cannot find `../src/owner/check.ts`.

- [ ] **Step 3: Implement**

`src/owner/check.ts`:
```ts
import { readFileSync } from 'node:fs';
import { loadDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import type { Doc } from '../ir.ts';
import { PROSE_KINDS } from '../kinds.ts';
import { lint } from '../lint/lint.ts';
import { MOVE_MIN, directionScore } from './directions.ts';
import { distance, featureVector, type FeatureVector } from './features.ts';
import { BARELY_CHANGED_AT, DUPLICATE_AT, SIMILAR_AT, similarity } from './similarity.ts';
import { basePath, variantPath, type PromptSet } from './sets.ts';
import { MIN_VARIANTS } from './sets.ts';
import { round2 } from '../text.ts';

export interface VariantCheck {
  index: number;
  file: string;
  direction: string | null;
  label: string | null;
  status: 'ok' | 'rejected';
  reasons: string[];
  warnings: string[];
  words: number | null;
  movement: { direction: string; score: number; moved: boolean } | null;
  vsBase: { similarity: number; distance: number } | null;
}

export interface CheckResult {
  set: string;
  ok: boolean;
  keep: number[];
  rejected: Array<{ index: number; reasons: string[] }>;
  variants: VariantCheck[];
  next: string;
}

const proseText = (doc: Doc) => doc.blocks.filter(b => PROSE_KINDS.has(b.kind)).map(b => b.text).join('\n');
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

interface Loaded { doc: Doc; text: string; vec: FeatureVector }

export function checkSet(project: string, set: PromptSet): CheckResult {
  const baseDoc = loadDocument(basePath(project, set), { form: set.form });
  const baseText = proseText(baseDoc);
  const baseVec = featureVector(baseDoc);
  const baseErrors = new Set(lint(baseDoc).errors.map(f => f.rule));

  const loaded = new Map<number, Loaded>();
  const variants: VariantCheck[] = set.variants.map(v => {
    const out: VariantCheck = {
      index: v.index, file: v.file, direction: v.direction, label: v.label ?? null,
      status: 'ok', reasons: [], warnings: [], words: null, movement: null, vsBase: null,
    };
    let doc: Doc;
    try {
      doc = loadDocument(variantPath(project, set, v), { form: set.form });
    } catch (e) {
      out.status = 'rejected';
      out.reasons.push(`parse-error: ${e instanceof ProseError ? e.message : String(e)}`);
      return out;
    }
    const text = proseText(doc);
    const vec = featureVector(doc);
    loaded.set(v.index, { doc, text, vec });
    out.words = Math.round(2 ** vec.length);
    const sim = similarity(baseText, text);
    out.vsBase = { similarity: sim, distance: round2(distance(baseVec, vec)) };
    if (norm(text) === norm(baseText)) out.reasons.push('unchanged');
    else if (sim >= BARELY_CHANGED_AT) out.reasons.push('barely-changed');
    const fresh = lint(doc).errors.filter(f => !baseErrors.has(f.rule));
    for (const f of fresh) out.reasons.push(`lint-error: ${f.rule}${f.at.line !== null ? ` at line ${f.at.line}` : ''} - ${f.message}`);
    if (v.direction) {
      const score = round2(directionScore(baseVec, vec, v.direction));
      out.movement = { direction: v.direction, score, moved: score >= MOVE_MIN };
      if (!out.movement.moved && out.reasons.length === 0) out.warnings.push(`weak-direction: ${v.direction} moved ${score} (needs at least ${MOVE_MIN})`);
    }
    if (out.reasons.length) out.status = 'rejected';
    return out;
  });

  // Pairwise: a later variant that repeats an earlier surviving one is rejected or warned about.
  const byLabel = new Map<string, number>();
  for (const v of variants) {
    if (v.status === 'rejected') continue;
    const mine = loaded.get(v.index)!;
    for (const earlier of variants) {
      if (earlier.index >= v.index || earlier.status === 'rejected') continue;
      const sim = similarity(loaded.get(earlier.index)!.text, mine.text);
      if (sim >= DUPLICATE_AT) { v.status = 'rejected'; v.reasons.push(`duplicate-of #${earlier.index}`); break; }
      if (sim >= SIMILAR_AT) v.warnings.push(`similar-to #${earlier.index} (${sim})`);
    }
    if (v.status === 'rejected') continue;
    if (v.label) {
      const key = norm(v.label);
      const first = byLabel.get(key);
      if (first !== undefined) v.warnings.push(`same-angle-as #${first} ("${key}")`);
      else byLabel.set(key, v.index);
    }
  }

  const keep = variants.filter(v => v.status === 'ok').map(v => v.index);
  const rejected = variants.filter(v => v.status === 'rejected').map(v => ({ index: v.index, reasons: v.reasons }));
  const ok = keep.length >= MIN_VARIANTS;
  return {
    set: set.id, ok, keep, rejected, variants,
    next: ok
      ? `Seal your guess before the owner sees anything: prose predict --set ${set.id} --pick <n> --why "..."; then present the kept variants (${keep.join(', ')})`
      : `Only ${keep.length} variant(s) survive; a set needs at least ${MIN_VARIANTS}. Rewrite the rejected ones (${rejected.map(r => r.index).join(', ') || 'none'}) and run prose set check ${set.id} again`,
  };
}
```
In `src/commands/set.ts` add the import `import { checkSet } from '../owner/check.ts';` and, after `annotate`, register:
```ts
  set.command('check')
    .description('Reject unchanged, duplicate and lint-failing variants and verify each moved in its direction')
    .argument('<id>', 'set id')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, opts: { dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      io.emit(checkSet(project, readSet(project, id)));
    });
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run tests/owner-check.test.ts` — expected: PASS (7 tests). If the duplicate test fails, print `similarity(WARM-prose, WARM_DUP-prose)`: both texts have more than 30 words, so three-word phrases are compared; the expected value is about 0.91.
```bash
git add src/owner/check.ts src/commands/set.ts tests/owner-check.test.ts
git commit -m "feat: prose set check rejects duplicates and verifies direction

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sealed predictions

**Files:**
- Create: `src/owner/prediction.ts`
- Modify: `src/commands/set.ts` (add `predict`)
- Test: `tests/owner-prediction.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/owner-prediction.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { readPrediction, sealValid, writePrediction } from '../src/owner/prediction.ts';
import { setDir } from '../src/owner/paths.ts';
import { createSet, readSet, writeSet } from '../src/owner/sets.ts';
import { BASE, tmpProject, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

function newSet() {
  const p = tmpProject();
  const set = createSet(p.project, p.write('t.md', BASE), { id: 'demo', count: 4 });
  return { ...p, set };
}

describe('writePrediction', () => {
  it('stores the guess with a seal and reads it back', () => {
    const { project, set } = newSet();
    const p = writePrediction(project, set, { pick: 2, shortlist: [3, 2, 3], why: 'driest', now: new Date(Date.UTC(2026, 9, 3)) });
    expect(p).toMatchObject({ schema: 'prose/prediction@1', set: 'demo', pick: 2, shortlist: [2, 3], why: 'driest', at: '2026-10-03T00:00:00.000Z' });
    expect(p.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(readPrediction(project, 'demo')).toEqual(p);
    expect(sealValid(p)).toBe(true);
  });

  it('notices an edit after the fact', () => {
    const { project, set } = newSet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'first instinct' });
    const file = join(setDir(project, 'demo'), 'prediction.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"pick": 1', '"pick": 3'));
    expect(sealValid(readPrediction(project, 'demo')!)).toBe(false);
  });

  it('checks the picks, allows one prediction per set, and none after the pick', () => {
    const { project, set } = newSet();
    expect(code(() => writePrediction(project, set, { pick: 9, shortlist: [], why: 'x' }))).toBe('E_USAGE');
    expect(code(() => writePrediction(project, set, { pick: 1, shortlist: [8], why: 'x' }))).toBe('E_USAGE');
    expect(code(() => writePrediction(project, set, { pick: 1, shortlist: [], why: '' }))).toBe('E_USAGE');
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    expect(code(() => writePrediction(project, set, { pick: 2, shortlist: [], why: 'y' }))).toBe('E_CONFLICT');
    const other = createSet(project, join(project, 't.md'), { id: 'done', count: 2 });
    writeSet(project, { ...other, picked: 1 });
    expect(code(() => writePrediction(project, readSet(project, 'done'), { pick: 1, shortlist: [], why: 'late' }))).toBe('E_CONFLICT');
  });
});

describe('prose predict', () => {
  it('seals a guess from the CLI', async () => {
    const { project } = newSet();
    const out = await run('predict', '--set', 'demo', '--pick', '2', '--shortlist', '3,4', '--why', 'driest and shortest', '--dir', project);
    expect(out).toMatchObject({ set: 'demo', pick: 2, shortlist: [3, 4] });
    expect(out.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(out.next).toMatch(/prose set pick demo/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/owner-prediction.test.ts`
Expected: FAIL — cannot find `../src/owner/prediction.ts`.

- [ ] **Step 3: Implement**

`src/owner/prediction.ts`:
```ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ProseError } from '../errors.ts';
import { setDir } from './paths.ts';
import type { PromptSet } from './sets.ts';

export const PredictionSchema = z.strictObject({
  schema: z.literal('prose/prediction@1'),
  set: z.string(),
  pick: z.number().int().min(1),
  shortlist: z.array(z.number().int().min(1)),
  why: z.string().min(1),
  at: z.string(),
  /** SHA-256 over the fields above, so an edit after the owner's pick is detectable. */
  seal: z.string().regex(/^[0-9a-f]{64}$/),
});
export type Prediction = z.infer<typeof PredictionSchema>;

const sealOf = (p: Pick<Prediction, 'set' | 'pick' | 'shortlist' | 'why' | 'at'>) =>
  createHash('sha256').update(JSON.stringify({ set: p.set, pick: p.pick, shortlist: p.shortlist, why: p.why, at: p.at })).digest('hex');

export const sealValid = (p: Prediction) => p.seal === sealOf(p);
const file = (project: string, id: string) => join(setDir(project, id), 'prediction.json');

export function writePrediction(project: string, set: PromptSet, input: { pick: number; shortlist: number[]; why: string; now?: Date }): Prediction {
  const known = new Set(set.variants.map(v => v.index));
  const bad = [input.pick, ...input.shortlist].find(i => !known.has(i));
  if (bad !== undefined) throw new ProseError('E_USAGE', `Set ${set.id} has no variant ${bad}`, { hint: `Variants: ${[...known].join(', ')}` });
  if (!input.why.trim()) throw new ProseError('E_USAGE', 'Say why: --why "..."', { hint: 'The reason is what lets the guess be checked against the owner\'s pick' });
  if (set.picked !== undefined) throw new ProseError('E_CONFLICT', `Set ${set.id} was already picked; predictions come first`);
  if (existsSync(file(project, set.id))) throw new ProseError('E_CONFLICT', `Set ${set.id} already has a sealed prediction`);
  const base = {
    set: set.id, pick: input.pick, shortlist: [...new Set(input.shortlist)].sort((a, b) => a - b),
    why: input.why.trim(), at: (input.now ?? new Date()).toISOString(),
  };
  const prediction = PredictionSchema.parse({ schema: 'prose/prediction@1', ...base, seal: sealOf(base) });
  writeFileSync(file(project, set.id), JSON.stringify(prediction, null, 2) + '\n');
  return prediction;
}

export function readPrediction(project: string, id: string): Prediction | null {
  const f = file(project, id);
  if (!existsSync(f)) return null;
  const parsed = PredictionSchema.safeParse(JSON.parse(readFileSync(f, 'utf8')));
  if (!parsed.success) throw new ProseError('E_SCHEMA', `${f}: ${parsed.error.issues[0].message}`);
  return parsed.data;
}
```
In `src/commands/set.ts` add the import `import { writePrediction } from '../owner/prediction.ts';` and register at the end of `registerSetCommands`'s file scope (top level, not under `set`):
```ts
  program.command('predict')
    .description("Seal your guess of the owner's pick before they see the set (revealed when the pick is recorded)")
    .requiredOption('--set <id>', 'set id')
    .requiredOption('--pick <n>', 'the variant you expect the owner to choose')
    .option('--shortlist <list>', 'other variants you expect them to like, comma-separated')
    .requiredOption('--why <text>', 'why you expect that')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { set: string; pick: string; shortlist?: string; why: string; dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      const s = readSet(project, opts.set);
      const p = writePrediction(project, s, { pick: Number(opts.pick), shortlist: csv(opts.shortlist).map(Number), why: opts.why });
      io.emit({ set: s.id, pick: p.pick, shortlist: p.shortlist, why: p.why, at: p.at, seal: p.seal, next: `Present the set to the owner, then record their choice: prose set pick ${s.id} --pick <n>` });
    });
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run tests/owner-prediction.test.ts` — expected: PASS.
```bash
git add src/owner/prediction.ts src/commands/set.ts tests/owner-prediction.test.ts
git commit -m "feat: sealed predictions with a tamper-evident hash

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Recorded picks, the reveal and hit-rate statistics

**Files:**
- Create: `src/owner/verdicts.ts`, `src/owner/pick.ts`, `src/owner/stats.ts`, `src/commands/taste.ts`
- Modify: `src/commands/set.ts` (add `pick`), `src/cli.ts` (register taste)
- Test: `tests/owner-pick.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/owner-pick.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProseError } from '../src/errors.ts';
import { FEATURES } from '../src/owner/features.ts';
import { setDir, globalTasteDir, projectTasteDir } from '../src/owner/paths.ts';
import { writePrediction } from '../src/owner/prediction.ts';
import { recordPick } from '../src/owner/pick.ts';
import { createSet, readSet, variantPath } from '../src/owner/sets.ts';
import { predictionStats } from '../src/owner/stats.ts';
import { readVerdicts } from '../src/owner/verdicts.ts';
import { BASE, PUNCHY, SHORT, WARM, tmpProject, useTempHome, useTmp } from './owner-helpers.ts';
import { run } from './helpers.ts';

useTmp();
const { home } = useTempHome();
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ProseError).code; } return 'none'; };

function readySet(id = 'demo') {
  const p = tmpProject();
  const set = createSet(p.project, p.write('t.md', BASE), { id, count: 3, directions: ['shorter', 'warmer', 'shorter'] });
  [SHORT, WARM, PUNCHY].forEach((text, k) => writeFileSync(variantPath(p.project, set, set.variants[k]), text));
  return { ...p, set };
}

describe('recordPick', () => {
  it('writes one verdict per other variant, with frozen feature vectors, to the project and per-user logs', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 2, shortlist: [3], why: 'warm wins weddings' });
    const r = recordPick(project, set, 2, { tags: ['warm'] });
    expect(r.verdicts).toBe(2);
    const rows = readVerdicts(join(projectTasteDir(project), 'verdicts.jsonl')).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ schema: 'prose/verdict@1', set: 'demo', kind: 'pick', form: 'speech-small', tags: ['warm'] });
    expect(rows[0].winner.index).toBe(2);
    expect(rows.map(x => x.loser.index).sort()).toEqual([1, 3]);
    expect(rows[0].weight).toBeCloseTo(1 / 3, 6);
    expect(rows[0].winner.x).toHaveLength(FEATURES.length);
    expect(readVerdicts(join(globalTasteDir(), 'verdicts.jsonl')).rows).toHaveLength(2);
    expect(readSet(project, 'demo')).toMatchObject({ picked: 2 });
  });

  it('reveals whether the sealed guess hit, and logs it for the statistics', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 2, shortlist: [3], why: 'x' });
    const r = recordPick(project, set, 3, {});
    expect(r.reveal).toMatchObject({ agent: { pick: 2, hit: false, shortlistHit: true, sealValid: true } });
    expect(JSON.parse(readFileSync(join(setDir(project, 'demo'), 'reveal.json'), 'utf8')).agent.hit).toBe(false);
  });

  it('refuses a pick without a sealed prediction unless told so, and then reveals nothing', () => {
    const { project, set } = readySet();
    expect(code(() => recordPick(project, set, 1, {}))).toBe('E_PREDICTION_REQUIRED');
    const r = recordPick(project, set, 1, { noPredict: true });
    expect(r.reveal).toBeNull();
  });

  it('refuses a second pick, an unknown variant and a rejected one', () => {
    const { project, set } = readySet();
    expect(code(() => recordPick(project, set, 9, { noPredict: true }))).toBe('E_USAGE');
    recordPick(project, set, 1, { noPredict: true });
    expect(code(() => recordPick(project, readSet(project, 'demo'), 2, { noPredict: true }))).toBe('E_CONFLICT');
    const q = readySet('other');
    writeFileSync(variantPath(q.project, q.set, q.set.variants[0]), BASE); // unchanged → rejected by the check
    expect(code(() => recordPick(q.project, readSet(q.project, 'other'), 1, { noPredict: true }))).toBe('E_USAGE');
  });

  it('flags a prediction edited after sealing', () => {
    const { project, set } = readySet();
    writePrediction(project, set, { pick: 1, shortlist: [], why: 'x' });
    const f = join(setDir(project, 'demo'), 'prediction.json');
    writeFileSync(f, readFileSync(f, 'utf8').replace('"pick": 1', '"pick": 2'));
    expect(recordPick(project, set, 2, {}).reveal?.agent.sealValid).toBe(false);
  });
});

describe('predictionStats', () => {
  it('counts hits and shortlist hits across sets, and per project', () => {
    const a = readySet('a');
    const b = readySet('b');
    writePrediction(a.project, a.set, { pick: 2, shortlist: [], why: 'x' });
    recordPick(a.project, a.set, 2, {});
    writePrediction(b.project, b.set, { pick: 1, shortlist: [3], why: 'x' });
    recordPick(b.project, b.set, 3, {});
    const all = predictionStats({});
    expect(all).toMatchObject({ sessions: 2, agent: { predicted: 2, hits: 1, shortlistHits: 2, rate: 0.5 } });
    expect(predictionStats({ project: a.project })).toMatchObject({ sessions: 1, agent: { hits: 1, rate: 1 } });
    expect(predictionStats({ project: '/nowhere' })).toMatchObject({ sessions: 0, agent: { predicted: 0, rate: null } });
    expect(home()).toBeTruthy();
  });
});

describe('prose set pick and prose taste stats', () => {
  it('records the pick from the CLI and shows the hit rate', async () => {
    const { project, set } = readySet();
    await run('predict', '--set', set.id, '--pick', '2', '--why', 'warm', '--dir', project);
    const out = await run('set', 'pick', set.id, '--pick', '2', '--dir', project);
    expect(out).toMatchObject({ set: 'demo', picked: 2, verdicts: 2, reveal: { agent: { hit: true } } });
    expect(out.file).toBe('v2.md');
    expect(out.next).toMatch(/apply|copy/i);
    expect((await run('taste', 'stats', '--dir', project)).agent).toMatchObject({ predicted: 1, hits: 1, rate: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/owner-pick.test.ts`
Expected: FAIL — cannot find `../src/owner/pick.ts`.

- [ ] **Step 3: Implement**

`src/owner/verdicts.ts`:
```ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

const Side = z.strictObject({ index: z.number().int().min(1), x: z.array(z.number()) });

/** One owner judgement. `x` is the variant's scaled style vector, centred on its set, frozen at judging time. */
export const VerdictSchema = z.strictObject({
  schema: z.literal('prose/verdict@1'),
  at: z.string(),
  project: z.string(),
  set: z.string(),
  kind: z.enum(['pick']),
  form: z.string(),
  register: z.string().nullable(),
  voices: z.array(z.string()),
  winner: Side,
  loser: Side,
  /** An unexplained pick among several is weaker evidence than a head-to-head duel (weight 1). */
  weight: z.number().positive(),
  tags: z.array(z.string()),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export function appendJsonl(path: string, row: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(row) + '\n');
}

/** Valid rows, plus a count of lines that were skipped. */
export function readVerdicts(path: string): { rows: Verdict[]; malformed: number } {
  if (!existsSync(path)) return { rows: [], malformed: 0 };
  const rows: Verdict[] = [];
  let malformed = 0;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = VerdictSchema.safeParse(JSON.parse(line));
      if (parsed.success) rows.push(parsed.data); else malformed++;
    } catch { malformed++; }
  }
  return { rows, malformed };
}
```

`src/owner/pick.ts`:
```ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDocument } from '../document.ts';
import { ProseError } from '../errors.ts';
import { loadVoices, voiceFor } from '../voice.ts';
import { checkSet } from './check.ts';
import { centered, featureVector } from './features.ts';
import { globalTasteDir, projectTasteDir, setDir } from './paths.ts';
import { readPrediction, sealValid } from './prediction.ts';
import { variantPath, writeSet, type PromptSet } from './sets.ts';
import { appendJsonl, type Verdict } from './verdicts.ts';

/** Weight of one loser in an unexplained pick (a duel's weight is 1). */
export const PICK_WEIGHT = 1 / 3;

export interface Reveal {
  agent: { pick: number; shortlist: number[]; why: string; hit: boolean; shortlistHit: boolean; sealValid: boolean };
}

export interface PickResult { set: string; picked: number; file: string; verdicts: number; reveal: Reveal | null; next: string }

export function recordPick(project: string, set: PromptSet, pick: number, opts: { tags?: string[]; noPredict?: boolean; now?: Date }): PickResult {
  const now = opts.now ?? new Date();
  if (set.picked !== undefined) throw new ProseError('E_CONFLICT', `Set ${set.id} was already picked (variant ${set.picked})`);
  if (!set.variants.some(v => v.index === pick)) throw new ProseError('E_USAGE', `Set ${set.id} has no variant ${pick}`, { hint: `Variants: ${set.variants.map(v => v.index).join(', ')}` });
  const prediction = readPrediction(project, set.id);
  if (!prediction && !opts.noPredict) {
    throw new ProseError('E_PREDICTION_REQUIRED', `Seal a prediction before recording the pick for ${set.id}`, {
      hint: `prose predict --set ${set.id} --pick <n> --why "..." (or --no-predict to record the pick without a guess)`,
    });
  }
  const check = checkSet(project, set);
  if (!check.keep.includes(pick)) {
    throw new ProseError('E_USAGE', `Variant ${pick} was rejected by the set check, so the owner should not have seen it`, { hint: check.rejected.map(r => `#${r.index}: ${r.reasons.join('; ')}`).join(' | ') });
  }
  const shown = check.keep;
  const docs = shown.map(i => loadDocument(variantPath(project, set, set.variants.find(v => v.index === i)!), { form: set.form }));
  const xs = centered(docs.map(featureVector));
  const side = (i: number) => ({ index: i, x: xs[shown.indexOf(i)] });
  let voices: string[] = [];
  try {
    const bibles = loadVoices(project);
    voices = [...new Set(docs.flatMap(d => d.blocks.map(b => b.speaker).filter((s): s is string => !!s)).map(s => voiceFor(bibles, s)?.id).filter((v): v is string => !!v))];
  } catch { voices = []; }
  const register = docs[0].register ?? null;

  const rows: Verdict[] = shown.filter(i => i !== pick).map(loser => ({
    schema: 'prose/verdict@1' as const, at: now.toISOString(), project, set: set.id, kind: 'pick' as const, form: set.form, register, voices,
    winner: side(pick), loser: side(loser), weight: PICK_WEIGHT, tags: opts.tags ?? [],
  }));
  for (const row of rows) {
    appendJsonl(join(projectTasteDir(project), 'verdicts.jsonl'), row);
    appendJsonl(join(globalTasteDir(), 'verdicts.jsonl'), row);
  }

  let reveal: Reveal | null = null;
  if (prediction) {
    reveal = {
      agent: {
        pick: prediction.pick, shortlist: prediction.shortlist, why: prediction.why,
        hit: prediction.pick === pick, shortlistHit: prediction.pick === pick || prediction.shortlist.includes(pick),
        sealValid: sealValid(prediction),
      },
    };
    writeFileSync(join(setDir(project, set.id), 'reveal.json'), JSON.stringify({ schema: 'prose/reveal@1', picked: pick, at: now.toISOString(), ...reveal }, null, 2) + '\n');
    appendJsonl(join(globalTasteDir(), 'predictions.jsonl'), { at: now.toISOString(), project, set: set.id, form: set.form, picked: pick, ...reveal });
  }

  writeSet(project, { ...set, picked: pick, pickedAt: now.toISOString() });
  const file = set.variants.find(v => v.index === pick)!.file;
  return {
    set: set.id, picked: pick, file, verdicts: rows.length, reveal,
    next: `Apply the choice if the owner wants it: copy ${join(setDir(project, set.id), file)} over ${set.source}`,
  };
}
```

`src/owner/stats.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globalTasteDir } from './paths.ts';

export interface PredictionStats {
  sessions: number;
  agent: { predicted: number; hits: number; shortlistHits: number; rate: number | null };
  recent: { window: number; agentRate: number | null };
}

const rate = (hits: number, n: number) => (n ? Math.round((hits / n) * 1000) / 1000 : null);

/** How often the agent's sealed pick matched the owner's, across all projects or one. */
export function predictionStats(opts: { project?: string; window?: number }): PredictionStats {
  const window = opts.window ?? 10;
  const file = join(globalTasteDir(), 'predictions.jsonl');
  const rows: Array<{ project: string; agent: { hit: boolean; shortlistHit: boolean } }> = [];
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r?.agent && (!opts.project || r.project === opts.project)) rows.push(r);
      } catch { /* skip a torn line */ }
    }
  }
  const hits = rows.filter(r => r.agent.hit).length;
  const recent = rows.slice(-window);
  return {
    sessions: rows.length,
    agent: { predicted: rows.length, hits, shortlistHits: rows.filter(r => r.agent.shortlistHit).length, rate: rate(hits, rows.length) },
    recent: { window, agentRate: rate(recent.filter(r => r.agent.hit).length, recent.length) },
  };
}
```

`src/commands/taste.ts`:
```ts
import type { Command } from 'commander';
import type { Io } from '../io.ts';
import { findProject } from '../project.ts';
import { predictionStats } from '../owner/stats.ts';

export function registerTasteCommands(program: Command, io: Io): void {
  const taste = program.command('taste').description("What the owner's picks say, and how well the agent has predicted them");

  taste.command('stats')
    .description("How often the agent's sealed predictions matched the owner's pick")
    .option('--all-projects', 'count every project, not only the current one')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((opts: { allProjects?: boolean; dir?: string }) => {
      const project = opts.allProjects ? undefined : findProject(opts.dir ?? process.cwd()) ?? undefined;
      io.emit({ project: project ?? null, ...predictionStats(project ? { project } : {}) });
    });
}
```

In `src/commands/set.ts` add imports `import { recordPick } from '../owner/pick.ts';` and register under `set`:
```ts
  set.command('pick')
    .description("Record the owner's choice: appends taste verdicts and reveals whether your sealed prediction hit")
    .argument('<id>', 'set id')
    .requiredOption('--pick <n>', "the variant the owner chose")
    .option('--tags <list>', 'why they chose it, comma-separated (e.g. drier,shorter)')
    .option('--no-predict', 'record the pick even though no prediction was sealed')
    .option('--dir <dir>', 'where to start looking for the project (default: the current directory)')
    .action((id: string, opts: { pick: string; tags?: string; predict: boolean; dir?: string }) => {
      const project = needProject(opts.dir ?? process.cwd());
      io.emit(recordPick(project, readSet(project, id), Number(opts.pick), { tags: csv(opts.tags), noPredict: opts.predict === false }));
    });
```
In `src/cli.ts` add `import { registerTasteCommands } from './commands/taste.ts';` and call `registerTasteCommands(program, io);`.

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run` — expected: all pass. If the unrejected-pick test fails, remember that `readySet`'s variant 1 is overwritten with `BASE` (`unchanged`), so `checkSet` must reject it and `recordPick` must refuse that pick with `E_USAGE`.
```bash
git add src/owner/verdicts.ts src/owner/pick.ts src/owner/stats.ts src/commands/taste.ts src/commands/set.ts src/cli.ts tests/owner-pick.test.ts
git commit -m "feat: record owner picks as taste verdicts and reveal the sealed prediction

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The `prose-review` skill and its evals

Author with `@hartye-skills:yoda`. The baseline failure this skill answers is in `docs/research/2026-10-02-skill-baselines.md`: the agent converged on one angle (4 of 5 punch-ups on the breakup joke), and every value-laden choice (dry or warm, which line lands) was the agent's alone.

**Files:**
- Create: `skills/prose-review/SKILL.md`, `evals/review-options/prompt.md`, `evals/review-options/graders/prose-review-fired.md`, `evals/review-options/graders/options-differ.md`
- Modify: `tests/skills.test.ts` (nine skills), `evals/neg-docstring/graders/` and `evals/neg-microcopy/graders/` (add `prose-review-quiet.md`)

- [ ] **Step 1: Update the skills test first**

In `tests/skills.test.ts` change the expected list to `['prose-comedy', 'prose-dialog', 'prose-formal', 'prose-instruct', 'prose-review', 'prose-script', 'prose-setup', 'prose-speech', 'prose-voice']` and the test title to `'ships the nine skills'`.
Run: `npx vitest run tests/skills.test.ts` — expected: FAIL (`prose-review` missing).

- [ ] **Step 2: Write the skill**

`skills/prose-review/SKILL.md`:
```md
---
name: prose-review
description: Offer the owner a real choice between rewrites with agent-prose - variant sets along named directions, checked for duplicates and for whether each variant moved the way it claims, with a sealed prediction of the owner's pick and the pick recorded so the system learns their taste.
when_to_use: Use when the owner should choose between versions - asked for several options, alternatives, "give me a few takes", a punch-up pass, or to pick between tones - or when someone asks what the owner usually prefers or how often the agent guessed their pick. Writing a single draft is prose-script, prose-speech, prose-dialog, prose-instruct or prose-formal; checking one draft is prose lint.
---
# prose-review

`prose` below means `node "<plugin-root>/scripts/run-managed.js"`, where `<plugin-root>` is two
directories above this file. If a command prints `E_RUNTIME_MISSING`, run the prose-setup skill first.

Left alone, you converge: options come back as variations on one idea, and every judgement of
taste is yours. This skill puts the choice with the owner and makes the options measurably differ.

## The loop

1. **Make the base.** Write or find the draft (in the format its skill describes) inside a prose
   project (`prose init` once). Lint it first and fix errors.
2. **Open a set.** Name 2–4 directions, one per variant you want:
   `prose set new <draft> --directions punchier,drier,warmer --count 4`
   Directions: punchier, shorter, longer, warmer, drier, more-formal, less-formal, plainer,
   livelier, weirder. They are measured proxies for style (sentence length, contractions, "you",
   exclamations, word length...), not judgements of quality.
3. **Rewrite each variant file in place** (`.agent-prose/sets/<id>/v1.md` and so on). Keep the
   format and header. Each variant takes a *different angle*, not a different wording of one: for
   comedy use different mechanisms (understatement, misdirect, avoidance, escalation, callback);
   for other forms, a different structure or emphasis. Record the angle:
   `prose set annotate <id> 2 --label understatement --note "pointed silence"`.
4. **Check.** `prose set check <id>`. It rejects unchanged, near-duplicate and lint-failing
   variants and warns when a variant did not move in its direction or shares an angle with
   another. Rewrite what it rejected and check again until at least two (ideally all) survive.
   Do not argue with a rejection by tweaking one word.
5. **Seal your guess before the owner sees anything:**
   `prose predict --set <id> --pick <n> --shortlist <a,b> --why "..."`. A real guess, with a
   reason, not a hedge. It is hashed, so it cannot be edited afterwards.
6. **Present** the kept variants (`prose set show <id>`): numbered, each with its angle in a few
   words. No ranking, no recommendation — your guess is already sealed. Ask which they prefer
   and, if they say, why.
7. **Record the choice:** `prose set pick <id> --pick <n> --tags drier,shorter`. The output
   reveals whether your guess hit. Tell the owner, briefly.
8. **Apply** the chosen variant over the draft only if the owner wants it.

If the owner declines to choose, do not invent a pick: `prose set pick` is for real choices.

## What gets learned

Each pick is stored with its measured style, per project and per user. `prose taste stats` shows
how often your sealed guess matched the owner's pick. Use it to calibrate — if the hit rate is low,
you are guessing from your own taste, not theirs; offer more contrast, not more variants.

## Keep it honest

- Never present variants the check rejected, and never report a direction as achieved without the
  check's `movement` numbers.
- Report the numbers: variants kept of variants written, each movement score, similarity warnings.
- A set is for a choice that matters; for a one-line fix, just fix it.
```

- [ ] **Step 3: Write the evals**

`evals/review-options/prompt.md`:
```md
---
tags: [trigger, prose-review]
runs: 2
max_turns: 15
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

I want to choose between a few different punch-ups of this sitcom line, not just get one. The context: Dana comes home the night after being dumped and finds her roommate Theo asleep next to an empty pizza box. Her line: "I can't believe you ate the last slice of pizza." Tell me exactly how you'd put several options in front of me, step by step, including any commands, before you run anything.
```
`evals/review-options/graders/prose-review-fired.md`:
```md
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?prose-review"'
min: 1
arm: with-only
---
The prose-review skill is invoked.
```
`evals/review-options/graders/options-differ.md`:
```md
---
type: llm
---
The plan (a) produces several candidate options that differ in angle or mechanism rather than in wording, (b) checks objectively that the options actually differ or moved the way they claim (not only the agent's own judgement), (c) commits to a guess of which option the owner will prefer before showing them anything, and (d) leaves the choice and the reasons to the owner and records it. Fail if it presents one option as the answer, ranks them for the owner, or skips any objective check that the options are distinct.
```
For each of `evals/neg-docstring/graders/` and `evals/neg-microcopy/graders/` add `prose-review-quiet.md`:
```md
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?prose-review"'
min: 0
max: 0
arm: both
---
The prose-review skill is not invoked for this request.
```

- [ ] **Step 4: Run the skills test, then the library check**

Run: `npx vitest run tests/skills.test.ts` — expected: PASS (frontmatter, length ≤ 150 lines, listing ≤ 1,536 characters, no argument-substitution text, stands-alone).
Run: `grep -h '^when_to_use:' skills/*/SKILL.md` and confirm no two skills claim the same request: `prose-review` owns "several options / choose between"; the writing skills own a single draft; `prose-comedy` owns joke quality inside any option.

- [ ] **Step 5: Run the trigger eval and the negatives**

Run (PowerShell): `claude plugin eval . --case review-options --runs 2 --trust-plugin --no-publish --json evals/results/review.json`
Expected: `prose-review` fires in every with-skill run. Then `claude plugin eval . --case "neg-*" --runs 1 --ablation none --trust-plugin --no-publish` — expected: no skill fires. Record the numbers in `docs/research/2026-10-02-skill-evals.md` (append a short "prose-review" section). If the skill does not fire, fix its `when_to_use` before continuing.

- [ ] **Step 6: Commit**

```bash
git add skills/prose-review evals/review-options evals/neg-docstring/graders/prose-review-quiet.md evals/neg-microcopy/graders/prose-review-quiet.md tests/skills.test.ts docs/research/2026-10-02-skill-evals.md
git commit -m "feat: prose-review skill for choosing between measurably different variants

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Documentation, guide and release 0.2.0

**Files:**
- Modify: `README.md`, `craft/GUIDE.md`, `docs/superpowers/specs/2026-10-02-agent-prose-design.md`, `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `skills/prose-comedy/SKILL.md`
- Test: `tests/version.test.ts` (existing; enforces the four versions match)

- [ ] **Step 1: README**

Add to the commands table: `prose set new | list | show | annotate | check | pick`, `prose predict`, `prose taste stats`. Add a skills-table row for `prose-review`. Add a short section "Choosing between variants" with the eight-step loop in four lines and this honesty note: "Directions are measured proxies for style, not for quality. The owner's pick is the judgement; sealed predictions and `prose taste stats` show how well the agent has learned it." Add: "`prose init` writes `.agent-prose/.gitignore` so sets and taste data stay out of version control; voice bibles stay trackable." Change the roadmap sentence: the LAN reading page with duels and read-aloud, and a learned taste model, are next.

- [ ] **Step 2: Guide**

Append to `craft/GUIDE.md` a section "Variant sets and picks" explaining: why sets exist (the measured sameness failure: stock jokes in language-model output, loss of stylistic variety after model-assisted rewriting — cite the Padmakumar finding already in REFERENCES.md); what the check does and does not prove (movement in measured style, near-duplicate text, new lint errors; it cannot judge angle, so labels are the agent's claim and duplicates of a label are flagged); thresholds that are this plugin's choice (duplicate at 0.85 overlap, similar at 0.6, barely-changed at 0.95, moved at 0.1 scale units, feature scales); why predictions are sealed with a hash; why an unexplained pick weighs one third of a duel. No wikilinks.

- [ ] **Step 3: Comedy skill pointer and spec notes**

In `skills/prose-comedy/SKILL.md` section 4 ("Deliver"), add: "When the owner will choose between the options, put them in a set (prose-review) so near-duplicates are rejected and the choice is recorded." Keep the file ≤ 150 lines. Append "## M3a implementation notes" to the spec: what shipped (sets, directions, check, sealed predictions with hash, picks as verdicts, `taste stats`, the ninth skill), the deliberate differences from beeps (no server yet; agent-written variants verified rather than generated; implied-pick weight 1/3; `.agent-prose/.gitignore`), and what remains: M3b reading page with duels, refine rounds and read-aloud; M3c Bradley-Terry taste model, ranking and model predictions.

- [ ] **Step 4: Version bump**

Set `0.2.0` in `package.json` (`version`), `package-lock.json` (top-level `version` and `packages[""].version`), `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (`plugins[0].version`). Update the plugin description to mention nine skills and variant sets ("Nine skills: prose-setup, prose-dialog, prose-script, prose-speech, prose-instruct, prose-formal, prose-comedy, prose-voice, prose-review").
Run: `npx vitest run && npm run typecheck && npm run refs:check` — expected: all green (`tests/version.test.ts` fails if any of the four versions differs).

- [ ] **Step 5: Verify end to end through the managed runtime**

Run `node scripts/setup.js` (installs `0.2.0` into `~/.agent-prose/releases`; reversible), then in a scratch project outside the repo: `prose init`, `prose set new draft.md --directions shorter,warmer --count 3`, rewrite two variants, `prose set check`, `prose predict …`, `prose set pick …`, `prose taste stats`. Paste the key JSON in the commit body or the PR.

- [ ] **Step 6: Commit**

```bash
git add README.md craft/GUIDE.md docs/superpowers/specs/2026-10-02-agent-prose-design.md package.json package-lock.json .claude-plugin skills/prose-comedy/SKILL.md
git commit -m "docs: variant sets, picks and 0.2.0

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## After the plan

- Review the whole branch (`@h-superpowers:requesting-code-review`), squash-merge to `main`, push, tag `v0.2.0`, and publish the marketplace entry (version bump PR on `hartye-claude-plugins`, as for 0.1.0).
- Update the wiki: a backlog item for M3a (shipped), M3b and M3c items, and the architecture page.
- Write the M3b plan (LAN server, session event log, reading page with lineup, duel, refine, line-anchored notes and read-aloud) and the M3c plan (Bradley-Terry fit, global/project/per-voice layers, `taste show|fit`, model predictions and ranking, active duel selection) from the beeps map recorded in this session.
