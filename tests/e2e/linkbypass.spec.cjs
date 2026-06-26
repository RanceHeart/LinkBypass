const { test, expect, chromium } = require('@playwright/test')
const http = require('http')
const path = require('path')

const EXT_PATH = path.resolve(__dirname, '..', '..', 'build')

const TEST_PAGE = `<!doctype html>
<html>
  <body>
    <a id="same" href="/same">same</a>
    <a id="cross" href="http://127.0.0.1:19092/ad">cross</a>
    <button id="popup">popup</button>
    <button id="hijack">hijack</button>
    <script>
      document.getElementById('popup').addEventListener('click', () => {
        window.open('http://127.0.0.1:19092/popup', '_blank')
      })
      document.getElementById('hijack').addEventListener('click', () => {
        location.href = 'http://127.0.0.1:19092/hijack'
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

test('blocks hostile navigation patterns', async () => {
  const appServer = await createServer(19091, TEST_PAGE)
  const adServer = await createServer(19092, '<h1>ad</h1>')

  const context = await chromium.launchPersistentContext(
    path.join('/tmp', `linkbypass-pw-profile-${Date.now()}`),
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
    expect(extId).toBeTruthy()

    const page = await context.newPage()
    await page.goto('http://localhost:19091/')

    const before = page.url()
    await page.locator('#cross').click()
    await page.waitForTimeout(500)
    expect(page.url()).toBe(before)

    await page.locator('#same').click()
    await page.waitForTimeout(250)
    expect(page.url()).toBe('http://localhost:19091/same')

    await page.goto('http://localhost:19091/')
    const beforePages = context.pages().length
    await page.locator('#popup').click()
    await page.waitForTimeout(700)
    expect(context.pages().length).toBe(beforePages)

    await page.goto('http://localhost:19091/')
    await page.locator('#hijack').click()
    await page.waitForTimeout(1200)
    expect(page.url()).toContain('http://localhost:19091/')

    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extId}/popup.html`)
    await expect(popup.locator('#countLabel')).toContainText(/Blocked [1-9]/)
  } finally {
    await context.close()
    appServer.close()
    adServer.close()
  }
})
