# LinkBypass

> Block cross-domain navigation from HTML clicks — stay on the site you intend to.

[![GitHub release](https://img.shields.io/github/v/release/RanceHeart/LinkBypass)](https://github.com/RanceHeart/LinkBypass/releases)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-v0.1.0-blue)](https://github.com/RanceHeart/LinkBypass/releases)

Many sites wrap their outbound links in tracking redirects (Baidu, Google, Zhihu, Weibo, etc.) or have click-hijacking scripts that push you off-site. LinkBypass intercepts any HTML click that would leave the current domain and blocks it — you choose when to go.

## Features

- **Toggle on/off** — click the icon or press `⌘K` / `Ctrl+K`
- **Blocks cross-domain clicks** — any `<a>` click leaving the current hostname is intercepted
- **Ad defense** — strips `allow-top-navigation` from ad iframes, removes full-screen click overlays
- **Prevents JS hijacking** — stops page scripts from overriding your link clicks
- **Visual feedback** — confetti burst + toast when a link is blocked
- **Block log** — review and re-open blocked links from the popup
- **Subdomains count as cross-domain** — `tieba.baidu.com` → `zhidao.baidu.com` is blocked
- **Silent operation** — no popups, no toasts unless you want them

## One-click Install (Manual)

### [⬇️ Download v0.1.0 (ZIP)](https://github.com/RanceHeart/LinkBypass/releases/download/v0.1.0/LinkBypass-v0.1.0.zip)

1. Download the ZIP above
2. Unzip it somewhere
3. Open `chrome://extensions/`
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked**
6. Select the `build` folder inside the unzipped directory

Or build from source (see below).

## Build from source

```shell
npm install
npm run build
```

Output goes to `build/`.

## Test

```shell
npm run build
npm test
```

Requires [Playwright](https://playwright.dev) with bundled Chromium.

## Tech

- Vanilla TypeScript (no framework)
- Vite + CRXJS plugin
- Manifest V3
- macOS-native popup UI (light/dark mode)
- `canvas-confetti` for burst effects

## Keyboard Shortcut

| Platform | Shortcut |
|----------|----------|
| macOS | `⌘ + K` |
| Windows / Linux | `Ctrl + K` |

Configure at `chrome://extensions/shortcuts`.
