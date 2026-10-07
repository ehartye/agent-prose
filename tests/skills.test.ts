import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const skillsDir = join(root, 'skills');
const skills = readdirSync(skillsDir);

describe('skills', () => {
  it('ships the seventeen skills', () => {
    expect(skills.sort()).toEqual(['prose-audit', 'prose-comedy', 'prose-dialog', 'prose-formal', 'prose-instruct', 'prose-poetry', 'prose-presentation', 'prose-review', 'prose-review-batch', 'prose-script', 'prose-setup', 'prose-songwriting', 'prose-speech', 'prose-storyboard', 'prose-strike', 'prose-voice', 'prose-webinar']);
  });

  for (const s of skills) {
    const text = readFileSync(join(skillsDir, s, 'SKILL.md'), 'utf8').replaceAll('\r\n', '\n');
    it(`${s} has name, description and when_to_use, and stays short`, () => {
      const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
      expect(fm).toMatch(new RegExp(`^name: ${s}$`, 'm'));
      expect(fm).toMatch(/^description: .{30,}$/m);
      expect(fm).toMatch(/^when_to_use: Use (when|before|after).{20,}$/m);
      const listing = (fm.match(/^description: (.*)$/m)?.[1] ?? '') + (fm.match(/^when_to_use: (.*)$/m)?.[1] ?? '');
      expect(listing.length).toBeLessThanOrEqual(1536);
      expect(text.split('\n').length).toBeLessThanOrEqual(150);
      expect(text).not.toMatch(/[$][0-9]|[$]ARG/);
    });
  }
});

describe('prose-review reading page', () => {
  const text = readFileSync(join(skillsDir, 'prose-review', 'SKILL.md'), 'utf8').replaceAll('\r\n', '\n');
  it('documents the whole hand-off and what not to do', () => {
    for (const needle of ['prose reading open --set <id> --local', 'prose reading open --set', 'BOTH links', 'prose reading wait --id', 'prose reading round --id', 'prose reading status --id', 'anyone on the home network', 'device voice', 'Do not:']) {
      expect(text, needle).toContain(needle);
    }
  });
  it('adds the taste step: read it before drafting, as tendencies, keep the guess independent', () => {
    const flat = text.replace(/\s+/g, ' ');
    for (const needle of ['prose taste show', 'never as rules', 'not to bend your own guess', 'not enough data', 'model-prediction.json', 'Never read that file before the owner picks', 'your discipline', 'beat, matched or lost', "whether the model's did"]) {
      expect(flat, needle).toContain(needle);
    }
    expect(text.indexOf('prose taste show')).toBeLessThan(text.indexOf('prose set new <draft>'));
  });
  it('keeps the description a trigger, not a workflow', () => {
    const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    expect(fm.match(/^description: (.*)$/m)?.[1]).not.toMatch(/prose (set|predict|reading)/);
    expect(fm.match(/^when_to_use: (.*)$/m)?.[1]).toMatch(/phone or laptop/);
  });
});

describe('prose-review-batch', () => {
  const raw = (skill: string) => readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8').replaceAll('\r\n', '\n');
  const flat = (skill: string) => raw(skill).replace(/\s+/g, ' ');
  it('says how to open, wait with the cursor, what done means, and what not to do', () => {
    const text = flat('prose-review-batch');
    for (const needle of ['prose reading open --sets a,b,c --local', 'prose reading open --pending', 'at most 50', 'BOTH links', 'prose reading wait --id <queue id> --since <cursor>', 'pass back the `cursor`', 'all-picked', 'finished', 'closed', 'Picks cannot be changed once sent', 'A skipped or waiting item never ends the batch', 'quick pick', 'no duel and no refine round', "Do not read a set's `prediction.json`", 'stay sealed', 'prose reading open --set <id>', 'exposure notice']) {
      expect(text, needle).toContain(needle);
    }
  });
  it('is pointed at from the review, dialog and script skills', () => {
    for (const s of ['prose-review', 'prose-dialog', 'prose-script']) expect(flat(s), s).toContain('prose-review-batch');
    expect(flat('prose-review')).toContain('Keep marks the ones worth a duel');
  });
  it('keeps its listing text under the limit', () => {
    const fm = raw('prose-review-batch').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    expect((fm.match(/^description: (.*)$/m)?.[1] ?? '').length + (fm.match(/^when_to_use: (.*)$/m)?.[1] ?? '').length).toBeLessThan(1536);
  });
});

describe('the brief', () => {
  const flat = (skill: string) => readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8').replaceAll('\r\n', '\n').replace(/\s+/g, ' ');
  it('prose-review has the owner confirm the brief before any variant is written', () => {
    const text = flat('prose-review');
    for (const needle of ['Draft the brief from the draft', '--character', '--context', 'Show it to the owner', '--brief-confirmed', 'never write variants against a brief the owner has not confirmed', 'prose set brief <id>', 'brief-unconfirmed']) {
      expect(text, needle).toContain(needle);
    }
    expect(text.indexOf('--brief-confirmed')).toBeLessThan(text.indexOf('Rewrite each variant file in place'));
    expect(text).toContain('not a taste signal');
  });
  it('prose-review carries the brief into a refine round', () => {
    expect(flat('prose-review')).toContain('prose set new <champion file> --brief-from <previous-set>');
  });
  it('prose-dialog and prose-script say what the character and the context are for their form', () => {
    expect(flat('prose-dialog')).toMatch(/Character: how this speaker talks.*Context: the trigger, the box size and how often it is heard/);
    expect(flat('prose-script')).toMatch(/the character is how the speaker talks.*the context is the scene and who is listening/);
    for (const skill of ['prose-dialog', 'prose-script']) expect(flat(skill), skill).toContain('--brief-confirmed');
  });
});

describe('the existing line', () => {
  const flat = (skill: string) => readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8').replaceAll('\r\n', '\n').replace(/\s+/g, ' ');
  it('prose-review says when to pass --lines, what the page shows, and that it is context only', () => {
    const text = flat('prose-review');
    for (const needle of ['--lines <refs>', 'The current line', 'context only', 'never scored or learned from', 'Leave `--lines` off for a new line', 'outside-selection-changed', 'stale: true']) {
      expect(text, needle).toContain(needle);
    }
    expect(text.indexOf('--lines <refs>')).toBeLessThan(text.indexOf('Rewrite each variant file in place'));
  });
});

describe('strikes', () => {
  const flat = (skill: string) => readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8').replaceAll('\r\n', '\n').replace(/\s+/g, ' ');
  it('prose-strike says a strike is a record, what each reason means, and never to edit or remove a struck line by hand', () => {
    const text = flat('prose-strike');
    for (const needle of ['It is a **record**', 'prose strike list <draft>', 'wrong-direction', 'faulty-premise', 'not-worth-rewrite', 'Never edit a draft by hand while strikes are pending', 'stale: true', 'Never rewrite a struck line', 'struck-line-edited', 'Do not remove a struck line yourself', 'prose strike clear <draft> s3', '--local']) {
      expect(text, needle).toContain(needle);
    }
  });
  it('prose-strike never applies without the owner confirming the exact text, and says how undo and recovery behave', () => {
    const text = flat('prose-strike');
    for (const needle of ['Never apply without the owner', 'prose strike apply <draft> --confirm <digest>', 'is a **dry run**', 'prose strike undo <draft>', 'refuses once the draft has changed', 'after.lint', 'recovered', 'can delete lines from the draft']) {
      expect(text, needle).toContain(needle);
    }
    expect(text).not.toMatch(/no command that removes/);
  });
  it('prose-review points at strikes and tells the owner the link can delete lines', () => {
    const text = flat('prose-review');
    for (const needle of ['prose-strike', 'excluded', 'struck-line-edited', 'can also delete lines from the draft', 'asks the owner to confirm']) expect(text, needle).toContain(needle);
  });
});

describe('the plugin stands alone', () => {
  // docs/ may show Fountain note syntax (double brackets), so only the plugin's own files get the wikilink check.
  const docFiles = ['docs'].flatMap(p => readdirSync(join(root, p), { recursive: true }).map(f => join(root, p, String(f))).filter(f => /\.(md|json)$/.test(f)));
  it('docs have no vault references or machine-specific absolute paths', () => {
    expect(docFiles.length).toBeGreaterThan(0);
    for (const f of docFiles) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/wiki-master|\.wiki-master-vault/);
      expect(text, f).not.toMatch(/[A-Za-z]:\\Users\\|\/c\/Users\/|AppData/);
    }
  });
  it('craft and docs never mention the private wiki', () => {
    const dirs = ['craft', 'docs'].flatMap(p => readdirSync(join(root, p), { recursive: true }).map(f => join(root, p, String(f))).filter(f => /\.(md|json)$/.test(f)));
    expect(dirs.length).toBeGreaterThan(0);
    for (const f of dirs) {
      // "wikilink" and Wikipedia are about other things; "the wiki", "wiki ADR" and wiki-master point at private notes
      const text = readFileSync(f, 'utf8').replace(/https?:\/\/\S+/g, '');
      expect(text, f).not.toMatch(/\bwiki\b/i);
    }
  });
  const files = ['skills', 'craft', 'src', 'README.md', 'REFERENCES.md'].flatMap(p => {
    const full = join(root, p);
    try {
      return readdirSync(full, { recursive: true }).map(f => join(full, String(f))).filter(f => /\.(md|json|ts|js|mjs)$/.test(f));
    } catch {
      return [full];
    }
  });
  it('has no wikilinks and no references to a local knowledge vault', () => {
    for (const f of files) {
      let text = '';
      try { text = readFileSync(f, 'utf8'); } catch { continue; }
      expect(text, f).not.toMatch(/\[\[[A-Za-z][^\][,]*\]\]/);
      expect(text, f).not.toMatch(/wiki-master|\.wiki-master-vault/);
    }
  });
});

describe('craft guides', () => {
  const flat = (skill: string) => readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8').replaceAll('\r\n', '\n').replace(/\s+/g, ' ');
  it('prose-dialog points to its guide as a read-on-demand resource', () => {
    const text = flat('prose-dialog');
    for (const needle of ['Craft guide: `prose guide game-dialogue --text --section <name>`', 'Read the section you need, not all of it']) expect(text, needle).toContain(needle);
  });
  it('only names guide sections that exist', () => {
    for (const s of skills) {
      for (const m of flat(s).matchAll(/prose guide ([a-z-]+)/g)) expect(['game-dialogue', 'instruction-docs', 'formal-prose', 'screen-stage', 'youtube', 'speeches', 'verse', 'song'], `${s}: ${m[0]}`).toContain(m[1]);
    }
  });
});
