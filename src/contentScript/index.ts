import type { AppState, BlockReason, Request, StateMessage } from '../types'
import { DEFAULT_RULES } from '../types'

const EXT_EVENT = 'linkbypass:page-guard'
const USER_EVENT_MAX_AGE = 1600

let state: AppState = { enabled: true, rules: { ...DEFAULT_RULES } }
let lastPointer: { x: number; y: number; at: number } = { x: 0, y: 0, at: 0 }

function connectPort() {
  const port = chrome.runtime.connect({ name: 'linkbypass-content' })

  port.onMessage.addListener((msg: StateMessage) => {
    if (msg.type === 'STATE') {
      state = msg.state
      publishState()
    }
  })

  port.onDisconnect.addListener(() => {
    setTimeout(connectPort, 500)
  })
}

connectPort()

chrome.runtime.sendMessage({ type: 'GET_STATE' } satisfies Request, (next: AppState) => {
  if (chrome.runtime.lastError || !next) return
  state = next
  publishState()
})

function publishState() {
  window.dispatchEvent(new CustomEvent('linkbypass:state', {
    detail: { enabled: state.enabled, rules: state.rules },
  }))
}

function toAbsoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value, window.location.href)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function isCrossSite(targetUrl: string, sourceUrl = window.location.href): boolean {
  try {
    return new URL(targetUrl).hostname.toLowerCase() !== new URL(sourceUrl).hostname.toLowerCase()
  } catch {
    return false
  }
}

function closestAnchor(target: EventTarget | null): HTMLAnchorElement | HTMLAreaElement | null {
  if (!(target instanceof Element)) return null
  return target.closest('a[href], area[href]')
}

function closestForm(target: EventTarget | null): HTMLFormElement | null {
  if (!(target instanceof Element)) return null
  return target.closest('form')
}

function sendRuntimeMessage(message: Request) {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError
  })
}

function block(event: Event | null, targetUrl: string, reason: BlockReason) {
  if (event) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }

  sendRuntimeMessage({
    type: 'BLOCKED',
    targetUrl,
    sourceUrl: window.location.href,
    reason,
  })

  showToast(targetUrl, reason)
}

function reportIntent(targetUrl: string, input: string) {
  sendRuntimeMessage({
    type: 'USER_INTENT',
    targetUrl,
    sourceUrl: window.location.href,
    input,
  })
}

function allowOnce(targetUrl: string) {
  sendRuntimeMessage({ type: 'ALLOW_ONCE', targetUrl })
}

function navigateAllowed(targetUrl: string, newTab: boolean) {
  allowOnce(targetUrl)
  if (newTab) {
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
  } else {
    window.location.assign(targetUrl)
  }
}

function handlePointer(event: MouseEvent | PointerEvent | TouchEvent) {
  if ('changedTouches' in event && event.changedTouches.length) {
    lastPointer = {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY,
      at: Date.now(),
    }
    return
  }

  if ('clientX' in event) {
    lastPointer = { x: event.clientX, y: event.clientY, at: Date.now() }
  }
}

function handleClick(event: MouseEvent) {
  if (!state.enabled || !state.rules.linkClicks || !event.isTrusted) return

  const anchor = closestAnchor(event.target)
  if (!anchor) return

  const href = toAbsoluteUrl(anchor.href)
  if (!href) return

  reportIntent(href, event.type)

  if (!isCrossSite(href)) return

  block(event, href, 'cross-site-click')
}

function handleSubmit(event: SubmitEvent) {
  if (!state.enabled || !state.rules.linkClicks || !event.isTrusted) return

  const form = closestForm(event.target)
  const action = toAbsoluteUrl(form?.action || window.location.href)
  if (!action) return

  reportIntent(action, 'submit')

  if (!isCrossSite(action)) return

  block(event, action, 'cross-site-form')
}

function showToast(targetUrl: string, reason: BlockReason) {
  if (!document.documentElement) return

  const old = document.getElementById('linkbypass-toast')
  old?.remove()

  const host = new URL(targetUrl).hostname
  const toast = document.createElement('div')
  toast.id = 'linkbypass-toast'
  toast.setAttribute('role', 'status')
  toast.innerHTML = `
    <div class="lb-title">Navigation blocked</div>
    <div class="lb-url"></div>
    <div class="lb-actions">
      <button type="button" data-action="allow">Open once</button>
      <button type="button" data-action="dismiss">Dismiss</button>
    </div>
  `
  toast.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    left: min(max(${lastPointer.x || 24}px, 16px), calc(100vw - 316px));
    top: min(max(${lastPointer.y || 24}px, 16px), calc(100vh - 130px));
    width: 300px;
    padding: 12px;
    border: 1px solid rgba(255,255,255,.16);
    border-radius: 8px;
    background: rgba(22, 22, 24, .96);
    color: #fff;
    box-shadow: 0 12px 36px rgba(0,0,0,.35);
    font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
  `

  const style = document.createElement('style')
  style.textContent = `
    #linkbypass-toast .lb-title{font-weight:700;margin-bottom:4px}
    #linkbypass-toast .lb-url{color:#c8c8cc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #linkbypass-toast .lb-actions{display:flex;gap:8px;margin-top:10px}
    #linkbypass-toast button{border:0;border-radius:6px;padding:6px 9px;font:inherit;cursor:pointer}
    #linkbypass-toast button[data-action="allow"]{background:#0a84ff;color:#fff}
    #linkbypass-toast button[data-action="dismiss"]{background:#3a3a3c;color:#fff}
  `

  toast.querySelector('.lb-url')!.textContent = `${host} (${reason})`
  toast.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const button = (event.target as Element).closest('button')
    const action = button?.getAttribute('data-action')
    if (action === 'allow') navigateAllowed(targetUrl, true)
    toast.remove()
    style.remove()
  }, true)

  document.documentElement.append(style, toast)
  window.setTimeout(() => {
    toast.remove()
    style.remove()
  }, 7000)
}

function neutralizeFrame(frame: HTMLIFrameElement) {
  if (!state.enabled || !state.rules.frames) return

  const sandbox = frame.getAttribute('sandbox')
  if (sandbox) {
    const next = sandbox
      .replace(/\ballow-top-navigation(?:-by-user-activation)?\b/g, '')
      .replace(/\ballow-popups-to-escape-sandbox\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (next !== sandbox) frame.setAttribute('sandbox', next)
  }

  if (!sandbox && frame.src && isCrossSite(frame.src)) {
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin')
  }
}

function isSuspiciousOverlay(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false
  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
    return false
  }

  const rect = element.getBoundingClientRect()
  if (rect.width < window.innerWidth * 0.55 || rect.height < window.innerHeight * 0.55) {
    return false
  }

  const zIndex = Number.parseInt(style.zIndex, 10)
  const highLayer = Number.isFinite(zIndex) && zIndex >= 9999
  const fixedLayer = style.position === 'fixed' || style.position === 'sticky'
  const nearlyTransparent = Number.parseFloat(style.opacity || '1') < 0.08
  const cursorTrap = style.cursor === 'pointer' || element.onclick !== null

  return fixedLayer && (highLayer || nearlyTransparent) && cursorTrap
}

function neutralizeOverlay(element: Element) {
  if (!state.enabled || !state.rules.overlays || !isSuspiciousOverlay(element)) return
  ;(element as HTMLElement).style.pointerEvents = 'none'
  ;(element as HTMLElement).style.display = 'none'

  sendRuntimeMessage({
    type: 'BLOCKED',
    targetUrl: window.location.href,
    sourceUrl: window.location.href,
    reason: 'overlay',
  })
}

function scanNode(node: Node) {
  if (node instanceof HTMLIFrameElement) neutralizeFrame(node)
  if (node instanceof Element) {
    if (node.matches('iframe')) neutralizeFrame(node as HTMLIFrameElement)
    if (node.matches('body > *')) neutralizeOverlay(node)
    node.querySelectorAll('iframe').forEach((frame) => neutralizeFrame(frame as HTMLIFrameElement))
    node.querySelectorAll('body > *').forEach(neutralizeOverlay)
  }
}

function installDomGuards() {
  document.querySelectorAll('iframe').forEach((frame) => neutralizeFrame(frame as HTMLIFrameElement))
  document.querySelectorAll('body > *').forEach(neutralizeOverlay)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) scanNode(node)
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        scanNode(mutation.target)
      }
    }
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'src', 'sandbox'],
  })
}

window.addEventListener(EXT_EVENT, (event) => {
  const detail = (event as CustomEvent).detail as { targetUrl?: string; reason?: BlockReason } | undefined
  const targetUrl = toAbsoluteUrl(detail?.targetUrl)
  if (!targetUrl || !detail?.reason) return

  if (!state.enabled) {
    allowOnce(targetUrl)
    return
  }

  if (detail.reason === 'script-popup' && state.rules.scriptPopups) {
    block(null, targetUrl, 'script-popup')
  }

  if (detail.reason === 'top-navigation' && state.rules.topNavigation) {
    const age = Date.now() - lastPointer.at
    if (age <= USER_EVENT_MAX_AGE) reportIntent(targetUrl, 'script-navigation')
  }
})

document.addEventListener('pointerdown', handlePointer, true)
document.addEventListener('mousedown', handlePointer, true)
document.addEventListener('touchstart', handlePointer, true)
document.addEventListener('click', handleClick, true)
document.addEventListener('auxclick', handleClick, true)
document.addEventListener('submit', handleSubmit, true)

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installDomGuards, { once: true })
} else {
  installDomGuards()
}

publishState()
