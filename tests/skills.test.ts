import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const skillsDir = join(root, 'skills');
const skills = readdirSync(skillsDir);

describe('skills', () => {
  it('ships the nine skills', () => {
    expect(skills.sort()).toEqual(['prose-comedy', 'prose-dialog', 'prose-formal', 'prose-instruct', 'prose-review', 'prose-script', 'prose-setup', 'prose-speech', 'prose-voice']);
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
