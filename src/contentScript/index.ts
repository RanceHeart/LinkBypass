import type { AppState, StateMessage } from '../types'
import confetti from 'canvas-confetti'

/* ─── state ────────────────────────────────── */

let state: AppState = { enabled: true, rules: { intercept: true, sandbox: true, overlay: true } }

/* ─── port connection with auto-reconnect ──── */

function connectPort() {
  const p = chrome.runtime.connect({ name: 'linkbypass-content' })

  p.onMessage.addListener((msg: StateMessage) => {
    if (msg.type === 'STATE') {
      state = msg.state
    }
  })

  p.onDisconnect.addListener(() => {
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

/* ═══════════════════════════════════════════════
   RULE 1: 跨域拦截 + 烟花
   ═══════════════════════════════════════════════ */

function showConfettiWithUrl(href: string, x: number, y: number) {
  const label = new URL(href).hostname

  // 🎆 烟花
  confetti({
    particleCount: 30,
    spread: 80,
    origin: { x: x / window.innerWidth, y: y / window.innerHeight },
    colors: ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5856d6'],
    startVelocity: 30,
    gravity: 0.6,
    ticks: 200,
  })

  // URL 标签 — 和烟花从同一点炸出
  const el = document.createElement('div')
  el.textContent = `→ ${label}`
  el.title = href
  el.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    font: 600 14px/1.3 -apple-system, BlinkMacSystemFont, sans-serif;
    color: #fff;
    background: rgba(0,0,0,.72);
    padding: 5px 16px;
    border-radius: 20px;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 2147483647;
    cursor: pointer;
    pointer-events: auto;
    user-select: none;
    white-space: nowrap;
    transform: translate(-50%, -50%);
    transition: opacity 1.5s ease, transform 1.5s cubic-bezier(.22,1,.36,1);
    box-shadow: 0 2px 12px rgba(0,0,0,.25);
    opacity: 1;
  `
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    window.open(href, '_blank')
    el.remove()
  })

  document.body.appendChild(el)

  // 慢慢飘走 — 短距离，长时长
  const angle = (Math.random() - 0.5) * 1.2  // -0.6 ~ 0.6 rad
  const distance = 40 + Math.random() * 50   // 40–90px
  const dx = Math.sin(angle) * distance
  const dy = -Math.cos(angle) * distance - 20 // 微微偏上

  requestAnimationFrame(() => {
    el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
    el.style.opacity = '0'
  })

  setTimeout(() => {
    if (el.parentNode) el.remove()
  }, 3500)
}

function handleNav(event: MouseEvent, isAuxClick = false) {
  if (!state.enabled || !state.rules.intercept) return

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

  // Prevent any hijacking
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  if (currentHost === targetHost) {
    // 同域 — 正常导航
    if (isAuxClick) {
      window.open(href, '_blank')
    } else {
      window.location.href = href
    }
    return
  }

  // 跨域 — 放烟花
  showConfettiWithUrl(href, event.clientX, event.clientY)
}

document.addEventListener('click', (e) => handleNav(e, false), true)
document.addEventListener('auxclick', (e) => handleNav(e, true), true)

/* ═══════════════════════════════════════════════
   RULE 2: iframe 沙箱净化
   ═══════════════════════════════════════════════ */

function stripAdSandbox(iframe: HTMLIFrameElement) {
  if (!state.enabled || !state.rules.sandbox) return
  const s = iframe.getAttribute('sandbox')
  if (!s) return
  const stripped = s
    .replace(/allow-top-navigation\b(?:-by-user-activation)?/g, '')
    .replace(/allow-popups-to-escape-sandbox/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (stripped !== s) iframe.setAttribute('sandbox', stripped)
}

Array.from(document.querySelectorAll('iframe')).forEach(stripAdSandbox)

const iframeObserver = new MutationObserver((mutations) => {
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
iframeObserver.observe(document.documentElement, { childList: true, subtree: true })

/* ═══════════════════════════════════════════════
   RULE 3: 全屏覆盖清除
   ═══════════════════════════════════════════════ */

function neutralizeOverlay(el: Element) {
  if (!state.enabled || !state.rules.overlay) return
  const style = window.getComputedStyle(el)
  const z = parseInt(style.zIndex, 10)
  if (isNaN(z) || z < 99999) return
  if (style.position !== 'fixed' && style.position !== 'absolute') return
  const w = parseFloat(style.width)
  const h = parseFloat(style.height)
  if (w < window.innerWidth * 0.5 || h < window.innerHeight * 0.5) return
  el.parentNode?.removeChild(el)
}

try {
  Array.from(document.querySelectorAll('body > *')).forEach((el) => {
    try { neutralizeOverlay(el) } catch {}
  })
} catch {}

function setupOverlayWatch() {
  if (!document.body) { setTimeout(setupOverlayWatch, 100); return }
  const overlayObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof Element) neutralizeOverlay(node)
      }
    }
  })
  overlayObserver.observe(document.body, { childList: true, subtree: true })
}
setupOverlayWatch()

/* ─── boot log ─────────────────────────────── */

console.info('[LinkBypass] content script loaded')
