import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { ReadingServer } from '../src/reading/server.ts';
import { tmpProject, useTmp, useTempHome } from './owner-helpers.ts';
import { assessmentCommand, assessmentInput } from './assessment-fixture.ts';
useTmp(); useTempHome();
const servers: ReadingServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });
async function seed() {
  const p = tmpProject(), input = assessmentInput();
  input.passages[0].text += '\n\n<script>window.untrusted = true</script>\n| Quantity | 64 percent |';
  const file = p.write('input.json', JSON.stringify(input));
  const state = await assessmentCommand(['create', file, '--dir', p.project]);
  const server = new ReadingServer({ host: '127.0.0.1', port: 0, persist: false, projects: [p.project] });
  const info = await server.listen(); servers.push(server);
  return { ...p, file, input, state, url: `http://127.0.0.1:${info.port}/a/${state.id}?t=${info.token}` };
}
describe('passage assessment workbench', () => {
  it('jumps among ten independent assessments, preserves location and exposes pending reports and the overview', async () => {
    const s = await seed(), browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); page.setDefaultTimeout(5000);
      const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(s.url);
      const queue = page.getByRole('navigation', { name: 'Passages' });
      await queue.getByRole('button', { name: /Passage 1,/ }).waitFor();
      expect(await queue.locator('.qitem').count()).toBe(10);
      expect(await page.locator('.assessment-criterion').count()).toBe(6);
      expect(await page.locator('.assessment-text').textContent()).toBe(s.input.passages[0].text);
      expect(await page.locator('.assessment-text script').count()).toBe(0);
      await page.locator('.assessment-source-scroll').evaluate(el => el.scrollTop = 350);
      await page.locator('.assessment-inspector-scroll').evaluate(el => el.scrollTop = 140);
      expect(await page.locator('.assessment-source-scroll').evaluate(el => el.scrollTop)).toBe(350);
      await queue.getByRole('button', { name: /Passage 7,/ }).click();
      await page.getByRole('heading', { name: 'Passage 7', exact: true }).waitFor();
      expect(await page.locator('.assessment-text').textContent()).toBe(s.input.passages[6].text);
      expect(await page.locator('.assessment-source-scroll').evaluate(el => el.scrollTop)).toBe(0);
      await queue.getByRole('button', { name: /Passage 1,/ }).click();
      expect(await page.locator('.assessment-source-scroll').evaluate(el => el.scrollTop)).toBe(350);
      expect(await page.locator('.assessment-inspector-scroll').evaluate(el => el.scrollTop)).toBe(140);
      await queue.getByRole('button', { name: /Passage 10,/ }).click();
      await page.getByText('Awaiting assessment', { exact: true }).last().waitFor();
      expect(await page.locator('.assessment-criterion').count()).toBe(0);
      await page.reload();
      await page.getByRole('heading', { name: 'Passage 10', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Batch overview', exact: true }).click();
      await page.getByRole('heading', { name: 'Batch overview', exact: true }).waitFor();
      expect(await page.getByRole('table', { name: 'Passage recommendations' }).locator('tbody tr').count()).toBe(10);
      await page.getByRole('button', { name: 'Open passage 3', exact: true }).click();
      await page.getByRole('heading', { name: 'Passage 3', exact: true }).waitFor();
      await queue.getByRole('searchbox', { name: 'Find a passage' }).fill('Passage 7');
      expect(await queue.locator('.qitem').count()).toBe(1);
      expect(await page.getByRole('heading', { name: 'Passage 3', exact: true }).isVisible()).toBe(true);
      await page.locator('.assessment-source-scroll').focus();
      await page.keyboard.press('PageDown');
      await expect.poll(() => page.locator('.assessment-source-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      expect(await page.locator('.assessment-inspector-scroll').evaluate(el => el.scrollTop)).toBe(0);
      expect(errors).toEqual([]);
      expect(JSON.parse(readFileSync(s.file, 'utf8'))).toEqual(s.input);
    } finally { await browser.close(); }
  }, 30_000);
  it('uses shared persistent appearance and a usable narrow-screen passage picker without page overflow', async () => {
    const s = await seed(), browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' }); page.setDefaultTimeout(5000);
      await page.goto(s.url);
      await page.getByRole('heading', { name: 'Passage 1', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Select passage', exact: true }).click();
      await page.getByRole('navigation', { name: 'Passages' }).getByRole('button', { name: /Passage 8,/ }).click();
      await page.getByRole('heading', { name: 'Passage 8', exact: true }).waitFor();
      await page.getByRole('link', { name: 'Go to assessment', exact: true }).click();
      expect(await page.getByRole('heading', { name: 'Passage 8', exact: true }).count()).toBe(1);
      expect(new URL(page.url()).hash).toBe('#p=p8');
      expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      await page.getByRole('button', { name: 'Review settings' }).click();
      await page.getByLabel('Appearance', { exact: true }).selectOption('light');
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await page.reload();
      await page.getByRole('heading', { name: 'Passage 8', exact: true }).waitFor();
      expect(await page.locator('html').getAttribute('data-theme')).toBe('light');
      await page.setViewportSize({ width: 320, height: 800 });
      expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      await page.getByRole('button', { name: 'Select passage', exact: true }).click();
      await page.getByRole('button', { name: 'Batch overview', exact: true }).click();
      expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    } finally { await browser.close(); }
  }, 30_000);
});
