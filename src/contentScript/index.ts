import type { LogEntry } from '../types'

let enabled = false

/* ─── connect to background with auto-reconnect ── */

function connectPort() {
  const p = chrome.runtime.connect({ name: 'linkbypass-content' })

  p.onMessage.addListener((msg: { type: string; enabled: boolean }) => {
    if (msg.type === 'STATE') {
      enabled = msg.enabled
    }
  })

  p.onDisconnect.addListener(() => {
    // SW died or not ready — keep current enabled state, retry connection
    setTimeout(connectPort, 500)
  })
}

connectPort()

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

/* ─── confetti burst ───────────────────────── */

function burstConfetti(x: number, y: number) {
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed; left:${x}px; top:${y}px;
    pointer-events:none; z-index:2147483647;
    width:0; height:0;
  `
  const colors = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#ff2d55', '#5856d6']
  const count = 12

  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div')
    const color = colors[Math.floor(Math.random() * colors.length)]
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5
    const dist = 40 + Math.random() * 30
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist
    const size = 4 + Math.random() * 4

    dot.style.cssText = `
      position:absolute; width:${size}px; height:${size}px;
      border-radius:50%; background:${color};
      left:0; top:0;
      transform:translate(${dx}px, ${dy}px) scale(0);
      opacity:1;
      transition: transform 0.5s cubic-bezier(.2,.8,.2,1), opacity 0.5s ease 0.15s;
    `

    container.appendChild(dot)

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      dot.style.transform = `translate(${dx}px, ${dy}px) scale(1)`
      dot.style.opacity = '0'
    })
  }

  document.body.appendChild(container)
  setTimeout(() => container.remove(), 600)
}

/* ─── tiny pill toast ──────────────────────── */

function showToast(targetDomain: string) {
  const toast = document.createElement('div')
  toast.textContent = `↗ blocked · ${targetDomain}`
  toast.style.cssText = `
    position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.8); color:#fff;
    font:12px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;
    padding:8px 14px; border-radius:20px;
    z-index:2147483647; pointer-events:none;
    opacity:0; transition: opacity 0.25s ease;
    backdrop-filter: blur(8px);
    max-width:80vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  `
  document.body.appendChild(toast)

  requestAnimationFrame(() => { toast.style.opacity = '1' })
  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, 1800)
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
    return
  }

  const currentHost = window.location.hostname
  if (currentHost === targetHost) return

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

  // Log to background
  chrome.runtime.sendMessage({ type: 'BLOCKED_LINK', data: logEntry }).catch(() => {})

  // Visual feedback
  burstConfetti(event.clientX, event.clientY)
  showToast(targetHost)
}

/* ─── strip dangerous iframe sandbox ────────── */
// Remove allow-top-navigation from iframes — ads use this to hijack the page
function stripAdSandbox(iframe: HTMLIFrameElement) {
  const s = iframe.getAttribute('sandbox')
  if (!s) return
  const stripped = s
    .replace(/allow-top-navigation\b(?:-by-user-activation)?/g, '')
    .replace(/allow-popups-to-escape-sandbox/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (stripped !== s) iframe.setAttribute('sandbox', stripped)
}

// Scan existing iframes
Array.from(document.querySelectorAll('iframe')).forEach(stripAdSandbox)

// Watch for dynamically added iframes
const adObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    const nodes = Array.from(m.addedNodes)
    for (const node of nodes) {
      if (node instanceof HTMLIFrameElement) stripAdSandbox(node)
      if (node instanceof Element) {
        Array.from(node.querySelectorAll('iframe')).forEach(stripAdSandbox)
      }
    }
  }
})
adObserver.observe(document.documentElement, { childList: true, subtree: true })

/* ─── neutralize full-page click overlays ──── */
// Some sites place a transparent position:fixed div over everything
// that captures all clicks and navigates to ads.
function neutralizeOverlay(el: Element) {
  const style = window.getComputedStyle(el)
  const z = parseInt(style.zIndex, 10)
  if (isNaN(z) || z < 99999) return
  if (style.position !== 'fixed' && style.position !== 'absolute') return
  const w = parseFloat(style.width)
  const h = parseFloat(style.height)
  if (w < window.innerWidth * 0.5 || h < window.innerHeight * 0.5) return
  // It's a full-screen overlay with high z-index — neutralize it
  // Set pointer-events:none so clicks pass through to real content
  ;(el as HTMLElement).style.pointerEvents = 'none'
  // If it had an onclick, clear it
  if (el.getAttribute('onclick')) el.removeAttribute('onclick')
}

// Scan existing overlays (wrap in try because body may not be ready at document_start)
try {
  Array.from(document.querySelectorAll('body > *')).forEach((el) => {
    try { neutralizeOverlay(el) } catch {}
  })
} catch {}

// Watch for new overlays
let overlayObserver: MutationObserver | null = null
function setupOverlayWatch() {
  if (!document.body) { setTimeout(setupOverlayWatch, 100); return }
  overlayObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof Element) neutralizeOverlay(node)
      }
    }
  })
  overlayObserver.observe(document.body, { childList: true, subtree: true })
}
setupOverlayWatch()

/* ─── attach listeners ─────────────────────── */

document.addEventListener('click', handleNav, true)
document.addEventListener('auxclick', handleNav, true)

console.info('[LinkBypass] content script loaded')
