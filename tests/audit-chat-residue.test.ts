import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/document.ts';
import { buildReport } from '../src/audit/report.ts';

const residue = (text: string, name = 'draft.md') => {
  const r = buildReport(parseDocument(name, text, {}), text);
  return r.tiers.hard.filter(f => f.family === 'chat-residue');
};

describe('chat residue is only a finding where it addresses a chat user', () => {
  it('ignores the three ordinary-writing examples', () => {
    expect(residue('Let me know if the key doesn\'t fit.')).toEqual([]);
    expect(residue('Certainly! That is what the lawyer said.')).toEqual([]);
    expect(residue('I hope this helps with your hike, said the ranger.')).toEqual([]);
  });
  it('ignores mid-sentence and quoted occurrences', () => {
    expect(residue('She wrote: "Let me know if you want more." and left.')).toEqual([]);
    expect(residue('The ranger smiled and said, “I hope this helps!” Then he left.')).toEqual([]);
    expect(residue('He said certainly! and she said let me know if you can come.')).toEqual([]);
    expect(residue('First paragraph.\n\nShe said I hope this helps and walked away from the long trail.')).toEqual([]);
  });
  it('flags the true positives in a Markdown prose paragraph', () => {
    const last = residue('The route is above.\n\nI hope this helps!');
    expect(last.map(f => f.text)).toEqual(['I hope this helps!']);
    expect(residue('Certainly! Here is the revised draft.\n\nThe garden opened in March.').map(f => f.text)).toEqual(['Certainly!']);
    expect(residue('The route is above. Let me know if you have any questions.').map(f => f.text)).toEqual(['Let me know if you have any questions.']);
    expect(residue('Would you like me to expand the second section?').map(f => f.text)).toEqual(['Would you like me to expand the second section?']);
    expect(residue('As an AI language model, I cannot say.').map(f => f.text)).toEqual(['As an AI language model']);
  });
  it('keeps the knowledge-cutoff phrases hard', () => {
    const text = 'As of my last knowledge update, the rule was in force.';
    const r = buildReport(parseDocument('draft.md', text, {}), text);
    expect(r.tiers.hard.map(f => f.family)).toEqual(['knowledge-cutoff']);
  });
  it('finds nothing in dialogue: Fountain speech and dialog nodes', () => {
    const fountain = 'Title: T\nForm: tv-drama\n\nINT. GARDEN - DAY\n\nRANGER\nCertainly! Here is the map. I hope this helps!\n\nGRIMBLE\nLet me know if you want more. As an AI language model I wave.\n';
    expect(residue(fountain, 'g.fountain')).toEqual([]);
    const dialog = 'form: quest-dialog\nstart: a\nnodes:\n  - id: a\n    speaker: GUARD\n    text: Certainly! Here is the key. I hope this helps! Let me know if you want more.\n    end: true\n';
    expect(residue(dialog, 'g.dialog.yaml')).toEqual([]);
  });
});
