# LinkBypass

Chrome extension: cross-domain link → 🎆 confetti + floating URL → click to open. 3 rules in right-click menu.

## Build & Run

```
cd ~/Projects/LinkBypass
npm run build          # → build/
```

Load: Chrome → `chrome://extensions` → Dev mode → Load unpacked → `build/`

## Stack

- Vite + CRXJS (`@crxjs/vite-plugin`)
- TypeScript, Manifest V3
- `canvas-confetti` for fireworks
- Shortcut `Ctrl+.` / `Cmd+.` (Chrome doesn't support `/`)
- No framework (vanilla TS)

## Key Files

| File | Role |
|------|------|
| `src/manifest.ts` | Permissions (`storage`, `contextMenus`), shortcut `Ctrl+. / Cmd+.` |
| `src/background/index.ts` | SW: state mgmt (`chrome.storage.session`), context menus, port broadcast |
| `src/contentScript/index.ts` | 3 rule blocks, confetti+URL floating, port connect |
| `src/popup/index.ts` | Single toggle (ON/OFF) |
| `src/types.ts` | `AppState`, `RulesConfig` |
| `popup.html` | Minimal HTML |

## Architecture

```
Background SW ← port → Content Script (per tab)
   ↕ storage.session              ↕ DOM events
   ↕ contextMenus (right-click)   ↕ canvas-confetti
   ↕ commands (keyboard)          ↕ mutation observers
```

State = `{ enabled: bool, rules: { intercept, sandbox, overlay } }`. Broadcast to all content ports on change.

## 3 Rules (right-click toggle)

| Rule | Key | What it does |
|------|-----|-------------|
| 🎯 跨域拦截+烟花 | `intercept` | Block cross-domain `<a>` clicks, fire confetti + floating URL |
| 🧹 iframe 沙箱净化 | `sandbox` | Strip `allow-top-navigation` / `allow-popups-to-escape-sandbox` from iframes |
| 🛡️ 全屏覆盖清除 | `overlay` | Remove transparent full-screen clickjacking divs (z≥99999) |

Each rule gated by `state.enabled && state.rules[key]`.

## Publishing

```
zip -r linkbypass-v2.zip build/
gh release create v2.0.0 --title "v2.0.0" --notes "..." linkbypass-v2.zip
```

Chrome Web Store: dev console → upload ZIP → fill listing → submit review (hours~days).

## Gotchas

- `file://` URLs don't match `http://*/*` / `https://*/*` in content script patterns — extension only works on http/https pages
- Context menus (`chrome.contextMenus.create`) only work at `contexts: ['action']` for extension icon
- `Ctrl+.` as shortcut key — `Period` is the official Chrome key name. If user wants something else, set at `chrome://extensions/shortcuts`
- Context menu checkboxes auto-managed by Chrome on click; background SW reads `info.checked`
