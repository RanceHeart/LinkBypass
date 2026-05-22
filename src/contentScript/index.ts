import type { LogEntry } from '../types'

const STATE_KEY = 'linkbypass:enabled'

let enabled = false

/* ─── state watcher ────────────────────────── */

async function refreshState() {
  const r = await chrome.storage.session.get(STATE_KEY)
  enabled = r[STATE_KEY] ?? false
}

// Listen for state changes (set by popup → background)
chrome.storage.session.onChanged.addListener((changes) => {
  if (STATE_KEY in changes) {
    enabled = changes[STATE_KEY].newValue ?? false
  }
})

// Initial load
refreshState()

/* ─── helpers ──────────────────────────────── */

function isNavigationUrl(href: string): boolean {
  return href.startsWith('http:') || href.startsWith('https:')
}

function getAnchor(el: EventTarget | null): HTMLAnchorElement | HTMLAreaElement | null {
  if (!el || !(el instanceof Element)) return null
  return el.closest('a') ?? el.closest('area')
}

function generateId(): string {
  return crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* ─── interceptor ──────────────────────────── */

function handleNav(event: MouseEvent) {
  if (!enabled) return

  const anchor = getAnchor(event.target)
  if (!anchor) return

  const href = anchor.href
  if (!href || !isNavigationUrl(href)) return

  let targetHost: string
  try {
    targetHost = new URL(href).hostname
  } catch {
    return // invalid URL
  }

  const currentHost = window.location.hostname
  if (currentHost === targetHost) return // same-domain, allow

  // Cross-domain — block
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  const logEntry: LogEntry = {
    id: generateId(),
    url: href,
    domain: targetHost,
    sourceUrl: window.location.href,
    sourceDomain: currentHost,
    title: document.title,
    timestamp: Date.now(),
  }

  // Fire and forget — don't wait for response
  chrome.runtime.sendMessage({ type: 'BLOCKED_LINK', data: logEntry }).catch(() => {
    // Background might not be ready yet, discard silently
  })
}

/* ─── attach listeners ─────────────────────── */

// Use capture phase to intercept before the browser does its default navigation
document.addEventListener('click', handleNav, true)
document.addEventListener('auxclick', handleNav, true) // middle-click

console.info('[LinkBypass] content script loaded, ready to intercept cross-domain clicks')
