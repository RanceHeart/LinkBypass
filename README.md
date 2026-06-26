# LinkBypass

LinkBypass is a Manifest V3 Chrome extension that keeps hostile pages from
throwing the active tab into unrelated ads, popups, and redirect traps.

## What It Blocks

- Cross-site link clicks and form submissions.
- Script-created popups from `window.open`.
- Top-level tab hijacks after a click.
- Full-page transparent click overlays.
- Ad iframes that try to escape sandboxing or navigate the top page.

## How It Works

LinkBypass uses layered defenses instead of a single click handler:

- A `document_start` content script captures trusted user input before page
  handlers run.
- A main-world guard wraps page APIs such as `window.open`,
  `location.assign`, `location.replace`, and History methods.
- The background service worker watches top-frame navigation with
  `webNavigation` and restores the last safe URL when a recent click causes a
  cross-site tab hijack.
- Opener-created popups are closed when they are cross-site and were not
  explicitly allowed.
- The popup shows recent blocked attempts and lets you open a blocked target
  once when you choose.

## Build

```shell
npm install
npm run build
```

The unpacked extension is written to `build/`.

## Test

```shell
npm run build
npm test
```

The test runner starts local HTTP fixtures and launches Chromium with the
unpacked extension.

## Install Manually

1. Build the extension.
2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the `build` directory.

## Controls

- Click the extension icon to pause or resume protection.
- Use the popup to toggle individual protection layers.
- Use `Command+Period` on macOS or `Ctrl+Period` elsewhere to toggle the
  extension.
