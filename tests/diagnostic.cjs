// LinkBypass E2E Test — uses Playwright's bundled Chromium directly
const { chromium } = require('@playwright/test');
const path = require('path');

const EXT_PATH = path.resolve(__dirname, '..', 'build');
const CHROME_PATH = '/Users/apple/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

(async () => {
  console.log('Launching Chromium with extension...');
  console.log('Extension path:', EXT_PATH);
  console.log('Chrome path:', CHROME_PATH);

  const context = await chromium.launchPersistentContext(
    '/tmp/linkbypass-test-profile',
    {
      executablePath: CHROME_PATH,
      headless: false,  // Extensions need non-headless
      args: [
        `--load-extension=${EXT_PATH}`,
        `--disable-extensions-except=${EXT_PATH}`,
        '--no-sandbox',
        '--disable-gpu',
      ],
    }
  );

  // Check context state
  console.log('Context created');
  console.log('Pages:', context.pages().length);
  console.log('SWs:', typeof context.serviceWorkers);

  // Wait and check for service worker
  await new Promise(r => setTimeout(r, 3000));

  console.log('After 3s:');
  console.log('Pages:', context.pages().length);
  context.pages().forEach(p => console.log('  Page:', p.url()));

  // Try getting service workers
  try {
    const sws = context.serviceWorkers;
    console.log('SW count:', sws.length);
    sws.forEach(sw => console.log('  SW:', sw.url()));
  } catch(e) {
    console.log('SW error:', e.message);
  }

  // Open a page to trigger extension
  const page = await context.newPage();
  await page.goto('http://localhost:8080/test.html');
  await page.waitForLoadState('domcontentloaded');
  console.log('After page load:');

  try {
    const sws = context.serviceWorkers;
    console.log('SW count:', sws.length);
    sws.forEach(sw => console.log('  SW:', sw.url()));
  } catch(e) {
    console.log('SW error:', e.message);
  }

  // Check for extension URLs
  context.pages().forEach(p => console.log('  Page:', p.url()));

  await context.close();
  console.log('\nDone');
})();
