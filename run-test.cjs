const { chromium } = require('playwright')
const http = require('http')
const path = require('path')

const EXT_PATH = path.resolve(__dirname, 'build')

const TEST_PAGE = `<!doctype html>
<html>
  <body>
    <a id="same" href="/same">same</a>
    <a id="cross" href="http://127.0.0.1:19082/ad">cross</a>
    <button id="popup">popup</button>
    <button id="hijack">hijack</button>
    <div id="overlay" style="position:fixed;inset:0;z-index:99999;opacity:.01;cursor:pointer" onclick="window.open('http://127.0.0.1:19082/overlay')"></div>
    <script>
      document.getElementById('popup').addEventListener('click', () => {
        window.open('http://127.0.0.1:19082/popup', '_blank')
      })
      document.getElementById('hijack').addEventListener('click', () => {
        location.href = 'http://127.0.0.1:19082/hijack'
      })
    </script>
  </body>
</html>`

function createServer(port, body) {
    const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(req.url === '/same' ? '<h1>same</h1>' : body)
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

async function getExtId(context) {
  for (const worker of context.serviceWorkers()) {
    const match = worker.url().match(/chrome-extension:\/\/([a-z]{32})\//)
    if (match) return match[1]
  }

  const worker = await context.waitForEvent('serviceworker', { timeout: 15000 })
  const match = worker.url().match(/chrome-extension:\/\/([a-z]{32})\//)
  return match ? match[1] : ''
}

async function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const appServer = await createServer(19081, TEST_PAGE)
  const adServer = await createServer(19082, '<h1>ad</h1>')

  const context = await chromium.launchPersistentContext(
    path.join('/tmp', `linkbypass-test-profile-${Date.now()}`),
    {
      headless: false,
      args: [
        `--load-extension=${EXT_PATH}`,
        `--disable-extensions-except=${EXT_PATH}`,
        '--no-sandbox',
        '--disable-gpu',
      ],
    },
  )

  try {
    const extId = await getExtId(context)
    await assert(extId, 'Extension service worker was not found')

    const page = await context.newPage()
    await page.goto('http://localhost:19081/')

    const before = page.url()
    await page.locator('#cross').click({ position: { x: 4, y: 4 } })
    await page.waitForTimeout(500)
    await assert(page.url() === before, 'Cross-site link was not blocked')

    await page.locator('#same').click()
    await page.waitForTimeout(250)
    await assert(page.url() === 'http://localhost:19081/same', 'Same-site navigation was blocked')

    await page.goto('http://localhost:19081/')
    const beforePopupPages = context.pages().length
    await page.locator('#popup').click()
    await page.waitForTimeout(700)
    await assert(context.pages().length === beforePopupPages, 'Script popup was not blocked')

    await page.goto('http://localhost:19081/')
    await page.locator('#hijack').click()
    await page.waitForTimeout(1200)
    await assert(page.url().startsWith('http://localhost:19081/'), 'Top-level hijack was not restored')

    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extId}/popup.html`)
    await popup.waitForLoadState('domcontentloaded')
    const count = await popup.locator('#countLabel').textContent()
    await assert(/Blocked [1-9]/.test(count || ''), 'Popup log did not record blocked events')

    console.log('All LinkBypass checks passed')
  } finally {
    await context.close()
    appServer.close()
    adServer.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
