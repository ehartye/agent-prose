import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createComparison, readComparison, editComparison } from '../src/comparison.ts';
import { ReadingServer } from '../src/reading/server.ts';
import { tmpProject, useTmp, useTempHome } from './owner-helpers.ts';

useTmp();
useTempHome();
const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });
const prose = Array.from({ length: 45 }, (_, i) => `A cell uses a membrane to control what enters and leaves. Particles move through the membrane in several ways. This process helps the cell maintain stable conditions. Paragraph ${i + 1} explains the same system in context.`).join('\n\n');
function documentText(grade?: number, range?: [number, number], body = prose) {
  return `---\n${JSON.stringify({ form: 'professional', ...(grade || range ? { reader: { language: 'en-US', ...(grade ? { schoolGrade: grade } : {}), ...(range ? { readingLevel: { scale: 'us-grade', range } } : {}) } } : {}) })}\n---\n\n# Movement across a membrane\n\n${body}\n`;
}
async function seed(options: { requested?: boolean; unknownThird?: boolean; body?: string } = {}) {
  const p = tmpProject();
  const requested = options.requested !== false;
  const source = p.write('source.md', documentText(9, requested ? [9, 9] : undefined, options.body));
  const paths = [p.write('accessible.md', documentText(requested ? 9 : 6, requested ? [6, 7] : undefined, options.body)), p.write('freshman.md', documentText(9, requested ? [9, 9] : undefined, options.body)), p.write('advanced.md', options.unknownThird ? documentText(undefined, undefined, 'A short explanation.') : documentText(11, requested ? [11, 12] : undefined, options.body))];
  const state = createComparison(p.project, source, paths, { title: 'Membrane transport' });
  const server = new ReadingServer({ host: '127.0.0.1', port: 0, persist: false, projects: [p.project] });
  const info = await server.listen(); servers.push(server);
  return { ...p, source, paths, state, server, url: `http://127.0.0.1:${info.port}/c/${state.id}?t=${info.token}` };
}

describe('source and reading-level comparison workbench', () => {
  it('keeps table quantities and fenced calculations visible in source and adaptation reading views', async () => {
    const body = 'A rock sample loses mass over time.\n\n| Property | Value |\n| --- | --- |\n| Half-life | 10 years |\n\n```text\nmass = initial_mass * 0.5 ** (years / 10)\n```\n\nThe quantity is retained.';
    const s = await seed({ body }), original = readFileSync(s.source, 'utf8'), browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage(); page.setDefaultTimeout(5000); await page.goto(s.url);
      await page.getByRole('region', { name: 'Source', exact: true }).waitFor();
      for (const name of ['Source', 'Version 1']) {
        const panel = page.getByRole('region', { name, exact: true });
        const text = await panel.locator('.comparison-reading').textContent();
        expect(text).toContain('Half-life | 10 years');
        expect(text).toContain('mass = initial_mass * 0.5 ** (years / 10)');
        expect(await panel.getByText('Showing Markdown to preserve content this reading view cannot render.', { exact: true }).isVisible()).toBe(true);
        expect(await panel.locator('.comparison-words').count()).toBe(0);
      }
      expect(readFileSync(s.source, 'utf8')).toBe(original);
    } finally { await browser.close(); }
  }, 30_000);

  it.each([
    ['image references', 'A decay graph follows.\n\n![Graph of decay](decay.svg)'],
    ['HTML', 'A measurement follows.\n\n<span data-unit="years">10 years</span>'],
  ])('shows %s as explicit Markdown text instead of hiding content or loading markup', async (_kind, body) => {
    const s = await seed({ body }), browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage(); page.setDefaultTimeout(5000); await page.goto(s.url);
      for (const name of ['Source', 'Version 1']) {
        const panel = page.getByRole('region', { name, exact: true });
        await panel.locator('.comparison-markdown').waitFor();
        expect(await panel.locator('.comparison-markdown').textContent()).toContain(body);
        expect(await panel.locator('.comparison-reading img, .comparison-reading span').count()).toBe(0);
      }
    } finally { await browser.close(); }
  }, 30_000);

  it('edits and chooses an adaptation without changing the source, and persists the choice on reload', async () => {
    const s = await seed(), original = readFileSync(s.source, 'utf8'), browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); page.setDefaultTimeout(5000);
      await page.goto(s.url);
      const source = page.getByRole('region', { name: 'Source', exact: true });
      const first = page.getByRole('region', { name: 'Version 1', exact: true });
      expect(await source.getByRole('button', { name: /Edit|Choose/ }).count()).toBe(0);
      await first.getByRole('button', { name: 'Edit', exact: true }).click();
      await first.getByRole('textbox', { name: 'Markdown body for version 1', exact: true }).fill('# A clearer explanation\n\nParticles move through a cell membrane.');
      expect(await page.getByRole('button', { name: 'Choose this version', exact: true }).first().isDisabled()).toBe(true);
      await first.getByRole('button', { name: 'Save changes', exact: true }).click();
      await first.getByRole('heading', { name: 'A clearer explanation', exact: true }).waitFor();
      await first.getByRole('button', { name: 'Choose this version', exact: true }).click();
      await expect.poll(() => readComparison(s.project, s.state.id).choice?.variant).toBe('1');
      await page.reload();
      await first.getByText('Chosen version', { exact: true }).waitFor();
      expect(readFileSync(s.source, 'utf8')).toBe(original);
      expect(readFileSync(s.paths[0], 'utf8')).toContain('"range":[6,7]');
      await first.getByRole('button', { name: 'Edit', exact: true }).click();
      await first.getByRole('textbox').fill('An edited version needs a fresh choice.');
      await first.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.getByText('The chosen version has changed. Choose again after reviewing.', { exact: true }).waitFor();
      expect(readComparison(s.project, s.state.id).choiceCurrent).toBe(false);
    } finally { await browser.close(); }
  }, 30_000);

  it('preserves unsaved editors on reload and a real concurrent-write conflict', async () => {
    const s = await seed(), browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage(); page.setDefaultTimeout(5000); await page.goto(s.url);
      const first = page.getByRole('region', { name: 'Version 1', exact: true }), second = page.getByRole('region', { name: 'Version 2', exact: true });
      await first.getByRole('button', { name: 'Edit', exact: true }).click(); await first.getByRole('textbox').fill('My first unsaved change.');
      await second.getByRole('button', { name: 'Edit', exact: true }).click(); await second.getByRole('textbox').fill('My second unsaved change.');
      await editComparison(s.project, s.state.id, '1', 'A concurrent stored change.', s.state.revision);
      await first.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Your edits are preserved' }).waitFor();
      expect(await first.getByRole('textbox').inputValue()).toBe('My first unsaved change.');
      expect(await second.getByRole('textbox').inputValue()).toBe('My second unsaved change.');
      await page.getByRole('button', { name: 'Review settings', exact: true }).click();
      await page.getByRole('button', { name: 'Reload comparison', exact: true }).click();
      expect(await first.getByRole('textbox').inputValue()).toBe('My first unsaved change.');
      expect(await second.getByRole('textbox').inputValue()).toBe('My second unsaved change.');
      await first.getByText('Compare stored text', { exact: true }).click();
      expect(await first.getByText('A concurrent stored change.', { exact: true }).isVisible()).toBe(true);
      await first.getByRole('button', { name: 'Discard changes', exact: true }).click();
      expect(await first.getByText('A concurrent stored change.', { exact: true }).isVisible()).toBe(true);
      expect(await first.getByRole('button', { name: 'Choose this version', exact: true }).isDisabled()).toBe(true);
      await second.getByRole('button', { name: 'Discard changes', exact: true }).click();
      expect(await first.getByRole('button', { name: 'Choose this version', exact: true }).isEnabled()).toBe(true);
    } finally { await browser.close(); }
  }, 30_000);

  it('separates requested reader targets from estimates and blocks changes to a stale source', async () => {
    const s = await seed(), browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage(); page.setDefaultTimeout(5000); await page.goto(s.url);
      const first = page.getByRole('region', { name: 'Version 1', exact: true });
      await first.getByText('Reader and diagnostic', { exact: true }).click();
      expect(await first.getByText('Intended class: U.S. grade 9', { exact: true }).isVisible()).toBe(true);
      expect(await first.getByText('Requested reading level: U.S. grades 6–7', { exact: true }).isVisible()).toBe(true);
      expect(await first.getByText(/Flesch–Kincaid estimate:/).isVisible()).toBe(true);
      expect(await first.getByText('Lower requested target', { exact: true }).isVisible()).toBe(true);
      expect(await page.getByRole('region', { name: 'Version 2', exact: true }).getByText('Same requested target', { exact: true }).isVisible()).toBe(true);
      expect(await page.getByRole('region', { name: 'Version 3', exact: true }).getByText('Higher requested target', { exact: true }).isVisible()).toBe(true);
      writeFileSync(s.source, originalText(s.source) + '\nThe source changed.\n');
      await page.getByRole('button', { name: 'Review settings', exact: true }).click(); await page.getByRole('button', { name: 'Reload comparison', exact: true }).click();
      await page.getByText('The source has changed. Create a fresh comparison before editing or choosing.', { exact: true }).waitFor();
      expect(await first.getByRole('button', { name: 'Choose this version', exact: true }).isDisabled()).toBe(true);
      expect(await first.getByRole('button', { name: 'Edit', exact: true }).isDisabled()).toBe(true);
    } finally { await browser.close(); }
  }, 30_000);

  it('keeps four reading columns independently scrollable and uses the shared phone and appearance controls', async () => {
    const s = await seed(), browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: 'light' }); page.setDefaultTimeout(5000); await page.goto(s.url);
      const columns = page.locator('.comparison-scroll'); await columns.first().waitFor();
      expect(await columns.count()).toBe(4);
      for (let i = 0; i < 4; i++) {
        const before = await columns.evaluateAll(els => els.map(el => el.scrollTop));
        await columns.nth(i).hover(); await page.mouse.wheel(0, 450);
        await expect.poll(async () => (await columns.evaluateAll(els => els.map(el => el.scrollTop)))[i]).toBeGreaterThan(before[i]);
        const after = await columns.evaluateAll(els => els.map(el => el.scrollTop));
        for (let j = 0; j < 4; j++) if (j !== i) expect(after[j]).toBe(before[j]);
      }
      expect(await page.evaluate(() => (globalThis as unknown as { scrollY: number }).scrollY)).toBe(0);
      expect(await page.locator('.site-head').evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(70);
      await page.getByRole('button', { name: 'Review settings', exact: true }).click();
      await page.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption('dark'); await page.keyboard.press('Escape');
      expect(await page.locator('body').evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor)).toBe('rgb(18, 22, 27)');
      await page.reload(); await columns.first().waitFor(); expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => { const win = globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number }; return win.document.documentElement.scrollWidth <= win.innerWidth; })).toBe(true);
      const board = page.getByRole('region', { name: 'Source and adaptations', exact: true });
      expect(await board.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      expect(await page.getByRole('region', { name: 'Version 1', exact: true }).evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(300);
      await board.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      expect(await board.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      if (process.env.PROSE_UI_PROOF) await page.screenshot({ path: process.env.PROSE_UI_PROOF + '/comparison-phone.png', fullPage: true });
    } finally { await browser.close(); }
  }, 30_000);

  it('describes school grade without inventing a reading target or an unavailable estimate', async () => {
    const s = await seed({ requested: false, unknownThird: true }), browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage(); page.setDefaultTimeout(5000); await page.goto(s.url);
      const first = page.getByRole('region', { name: 'Version 1', exact: true });
      await first.getByText('Reader and diagnostic', { exact: true }).click();
      expect(await first.getByText('Lower intended grade', { exact: true }).isVisible()).toBe(true);
      expect(await first.getByText('Intended class: U.S. grade 6', { exact: true }).isVisible()).toBe(true);
      expect(await first.getByText('Requested reading level: not supplied', { exact: true }).isVisible()).toBe(true);
      expect(await page.getByText(/requested target/).count()).toBe(0);
      const third = page.getByRole('region', { name: 'Version 3', exact: true });
      await third.getByText('Reader and diagnostic', { exact: true }).click();
      expect(await third.getByText('Intended class: not supplied', { exact: true }).isVisible()).toBe(true);
      expect(await third.getByText('Flesch–Kincaid estimate: unavailable (reader language not supplied)', { exact: true }).isVisible()).toBe(true);
      expect(await third.locator('.comparison-direction').textContent()).toBe('');
    } finally { await browser.close(); }
  }, 30_000);
});

function originalText(file: string) { return readFileSync(file, 'utf8'); }
