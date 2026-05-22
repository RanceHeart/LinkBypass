# LinkBypass

> Block cross-domain navigation from HTML clicks — stay on the site you intend to.

Many sites wrap their outbound links in tracking redirects (Baidu, Google, Zhihu, Weibo, etc.) or have click-hijacking scripts that push you off-site. LinkBypass intercepts any HTML click that would leave the current domain and blocks it — you choose when to go.

## How it works

- Click the extension icon to **toggle on/off**
- When **on**: any `<a>` click pointing to a **different hostname** is intercepted and logged
- The link is **not followed** — you can review the log and open it when you actually want to go
- Subdomains count as cross-domain (e.g., `tieba.baidu.com` → `zhidao.baidu.com` is blocked)
- Only intercepts **HTML clicks** (not `window.location` / `fetch` / programmatic navigation)
- **Silent** — no popups, no toasts, no notifications

## Install

### Chrome Web Store

*Coming soon.*

### Manual (dev mode)

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `build/` directory

## Build from source

```shell
npm install
npm run build
```

Output goes to `build/`.

## Tech

- Vanilla TypeScript (no framework)
- Vite + CRXJS plugin
- Manifest V3
- macOS-native popup UI (light/dark mode)
