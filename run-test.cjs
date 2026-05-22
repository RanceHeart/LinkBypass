// LinkBypass E2E Runner — standalone, no @playwright/test
// npm install playwright
const { chromium } = require('playwright');
const path = require('path');

const EXT_PATH = path.resolve(__dirname, 'build');
const CHROME_PATH = '/Users/apple/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

async function getExtId(context) {
  // Listen BEFORE creating pages
  return new Promise((resolve) => {
    context.on('serviceworker', (sw) => {
      const m = sw.url().match(/chrome-extension:\/\/([a-z]{32})\//);
      if (m) resolve(m[1]);
    });
    // Also check existing ones
    const sws = typeof context.serviceWorkers === 'function'
      ? context.serviceWorkers() : (context.serviceWorkers || []);
    for (const sw of sws) {
      const m = sw.url().match(/chrome-extension:\/\/([a-z]{32})\//);
      if (m) { resolve(m[1]); return; }
    }
    // Timeout fallback
    setTimeout(() => resolve(''), 15000);
  });
}

async function main() {
  console.log('Launching Chromium with extension...');

  const context = await chromium.launchPersistentContext(
    '/tmp/linkbypass-test-profile-' + Date.now(),
    {
      executablePath: CHROME_PATH,
      headless: false,
      args: [
        `--load-extension=${EXT_PATH}`,
        `--disable-extensions-except=${EXT_PATH}`,
        '--no-sandbox',
        '--disable-gpu',
      ],
    }
  );

  // Get extension ID
  console.log('Waiting for extension service worker...');
  const extId = await getExtId(context);

  if (!extId) {
    console.log('❌ Could not find extension. Check manifest and build.');
    await context.close();
    process.exit(1);
  }
  console.log('✅ Extension ID:', extId);

  // Open popup
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForLoadState('domcontentloaded');
  await popup.screenshot({ path: '/tmp/lb-popup.png' });
  console.log('✅ Popup loaded, screenshot: /tmp/lb-popup.png');

  // Test toggle — click the visible label, not the hidden input
  await popup.locator('.toggle-track').click();
  const isChecked = await popup.locator('#toggleInput').isChecked();
  console.log('✅ Toggle:', isChecked ? 'ON' : 'OFF (wrong)');
  await popup.close();

  // Navigate to test page
  const page = await context.newPage();
  await page.goto('http://localhost:8080/test.html');
  await page.waitForLoadState('domcontentloaded');
  const urlBefore = page.url();

  // Click cross-domain link
  await page.click('#link1');
  await page.waitForTimeout(500);
  const stayed = page.url() === urlBefore;
  console.log(stayed ? '✅ Interception working' : '❌ Interception failed');

  // Check popup log
  const popup2 = await context.newPage();
  await popup2.goto(`chrome-extension://${extId}/popup.html`);
  const count = await popup2.locator('#countLabel').textContent();
  console.log('✅ Log:', count);

  const entryVisible = await popup2.locator('.log-entry').isVisible();
  console.log('✅ Log entry visible:', entryVisible);

  // Click log entry
  const [newTab] = await Promise.all([
    context.waitForEvent('page', { timeout: 5000 }),
    popup2.locator('.log-entry').click(),
  ]);
  console.log('✅ New tab opened:', newTab.url());
  await newTab.close();
  await popup2.close();

  // Clear log
  const popup3 = await context.newPage();
  await popup3.goto(`chrome-extension://${extId}/popup.html`);
  await popup3.locator('#clearBtn').click();
  const cleared = await popup3.locator('#countLabel').textContent();
  console.log('✅ Log cleared:', cleared);
  await popup3.close();

  // Same-domain test
  await page.goto('http://localhost:8080/test.html');
  await page.waitForLoadState('domcontentloaded');
  await page.click('#link4');
  await page.waitForTimeout(300);
  const sameDomainOK = page.url().includes('#section2');
  console.log(sameDomainOK ? '✅ Same-domain link allowed' : '❌ Same-domain blocked (wrong)');

  await context.close();
  console.log('\n🎉 All tests complete');
}

main().catch(e => { console.error(e); process.exit(1); });
