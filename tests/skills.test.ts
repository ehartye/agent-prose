import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const skillsDir = join(root, 'skills');
const skills = readdirSync(skillsDir);

describe('skills', () => {
  it('ships the twelve skills', () => {
    expect(skills.sort()).toEqual(['prose-audit', 'prose-comedy', 'prose-dialog', 'prose-formal', 'prose-instruct', 'prose-poetry', 'prose-review', 'prose-script', 'prose-setup', 'prose-songwriting', 'prose-speech', 'prose-voice']);
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
