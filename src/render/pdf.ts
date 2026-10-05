import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { ProseError } from '../errors.ts';

export function browserHome(): string { return join(process.env.AGENT_PROSE_HOME ?? join(homedir(), '.agent-prose'), 'browsers'); }
export function browserExecutable(home = browserHome()): string {
  const require = createRequire(import.meta.url);
  const pkg = dirname(require.resolve('playwright-core/package.json'));
  const { browsers } = JSON.parse(readFileSync(join(pkg, 'browsers.json'), 'utf8')) as { browsers: Array<{ name: string; revision: string }> };
  const revision = browsers.find(b => b.name === 'chromium-headless-shell')!.revision;
  const platform = process.platform === 'win32' ? ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'] : process.platform === 'darwin' ? [`chrome-headless-shell-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}`, 'chrome-headless-shell'] : ['chrome-headless-shell-linux64', 'chrome-headless-shell'];
  return join(home, `chromium_headless_shell-${revision}`, ...platform);
}

export async function printPdf(html: string, home?: string): Promise<Buffer> {
  const executablePath = browserExecutable(home);
  if (!existsSync(executablePath)) throw new ProseError('E_BROWSER_MISSING', 'The paired Chromium headless shell is not installed', { hint: 'Run node scripts/setup.js --pdf (Linux also needs Playwright system dependencies)' });
  const { chromium } = await import('playwright');
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true, timeout: 30_000 });
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.setContent(html, { waitUntil: 'load' });
    // Trusted renderer code only; page scripts stay disabled and every network request is denied.
    await page.evaluate('document.fonts.ready');
    return await page.pdf({ preferCSSPageSize: true, tagged: true, printBackground: true });
  } catch (e) { throw new ProseError('E_RENDER', `PDF rendering failed: ${(e as Error).message}`, { hint: 'Check the paired browser and Linux system dependencies' }); }
  finally { await browser?.close(); }
}
