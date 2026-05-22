// LinkBypass E2E — for @playwright/test
const { test, expect } = require('@playwright/test');
const path = require('path');

const EXT_PATH = path.resolve(__dirname, '..', 'build');

async function getExtId(context) {
  return new Promise((resolve) => {
    context.on('serviceworker', (sw) => {
      const m = sw.url().match(/chrome-extension:\/\/([a-z]{32})\//);
      if (m) resolve(m[1]);
    });
    // Check existing
    const sws = typeof context.serviceWorkers === 'function'
      ? context.serviceWorkers() : (context.serviceWorkers || []);
    for (const sw of sws) {
      const m = sw.url().match(/chrome-extension:\/\/([a-z]{32})\//);
      if (m) { resolve(m[1]); return; }
    }
    setTimeout(() => resolve(''), 15000);
  });
}

test.describe('LinkBypass', () => {
  test('e2e: toggle → intercept → log → clear → same-domain passthrough', async ({ context, page }) => {
    await page.goto('http://localhost:8080/test.html');
    await page.waitForLoadState('domcontentloaded');
    const extId = await getExtId(context);
    test.skip(!extId, 'Extension not loaded');

    // Open popup & toggle ON
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForLoadState('domcontentloaded');
    await popup.locator('.toggle-track').click();
    await expect(popup.locator('#toggleInput')).toBeChecked();
    await popup.close();

    // Cross-domain interception
    const urlBefore = page.url();
    await page.click('#link1');
    await page.waitForTimeout(500);
    expect(page.url()).toBe(urlBefore);

    // Log shows blocked entry
    const p2 = await context.newPage();
    await p2.goto(`chrome-extension://${extId}/popup.html`);
    await expect(p2.locator('#countLabel')).toContainText('Blocked 1');
    await expect(p2.locator('.log-entry')).toBeVisible();
    await expect(p2.locator('.log-source-domain')).toContainText('localhost');
    await expect(p2.locator('.log-url-domain')).toContainText('example.com');

    // Click log opens new tab
    const [newTab] = await Promise.all([
      context.waitForEvent('page', { timeout: 5000 }),
      p2.locator('.log-entry').click(),
    ]);
    expect(newTab.url()).toContain('example.com');
    await newTab.close();
    await p2.close();

    // Clear log
    const p3 = await context.newPage();
    await p3.goto(`chrome-extension://${extId}/popup.html`);
    await p3.locator('#clearBtn').click();
    await expect(p3.locator('#countLabel')).toContainText('Blocked 0');
    await p3.close();

    // Same-domain NOT blocked
    await page.goto('http://localhost:8080/test.html');
    await page.waitForLoadState('domcontentloaded');
    await page.click('#link4');
    await page.waitForTimeout(300);
    expect(page.url()).toBe('http://localhost:8080/test.html#section2');
  });
});
