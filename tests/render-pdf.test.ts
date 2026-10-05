import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserExecutable } from '../src/render/pdf.ts';
import { renderDocument } from '../src/render/index.ts';

const dir = mkdtempSync(join(tmpdir(), 'prose-print-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
describe.skipIf(!existsSync(browserExecutable()))('paired Chromium PDF integration', () => {
  it('prints paginated large-type speech with the same page count as reported timing', async () => {
    const file = join(dir, 'speech.md'), out = join(dir, 'speech.pdf');
    writeFileSync(file, `---\nform: speech-large\nwpm: 100\n---\n\n# Welcome\n\n${('**Brave people**, keep your courage.\nAnd come home.\n\n').repeat(50)}`);
    const result = await renderDocument(file, { to: 'pdf', out });
    const pdf = readFileSync(out).toString('latin1');
    expect(pdf.startsWith('%PDF')).toBe(true);
    expect(pdf).toContain('/StructTreeRoot'); expect(pdf).toContain('CourierPrime');
    expect(pdf.match(/\/Type \/Page\b/g)?.length).toBe(result.pages.length);
    expect(result.pages.length).toBeGreaterThan(1);
  });

  it('prints dual script/stage dialogue and explicit page breaks without fetching markup', async () => {
    const file = join(dir, 'script.fountain');
    writeFileSync(file, 'INT. ROOM - DAY\n\nALICE\nHello.\n\nBOB ^\n(quietly)\nHi.\n\n===\n\nEXT. ROAD - DAY\n\nThey leave.\n');
    for (const form of ['tv-drama', 'stage-play', 'sitcom-multicam']) {
      const out = join(dir, `${form}.pdf`); await renderDocument(file, { to: 'pdf', out, form });
      const pdf = readFileSync(out).toString('latin1');
      expect(pdf.match(/\/Type \/Page\b/g)?.length).toBe(2); expect(pdf).toContain('CourierPrime');
    }
  });
});
