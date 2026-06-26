import { DEFAULT_RULES, type RulesConfig } from '../types'

const EXT_EVENT = 'linkbypass:page-guard'

let enabled = true
let rules: RulesConfig = { ...DEFAULT_RULES }

function absoluteUrl(value: string | URL | undefined | null): string | null {
  if (!value) return null
  try {
    const url = new URL(String(value), window.location.href)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function isCrossSite(targetUrl: string): boolean {
  try {
    return new URL(targetUrl).hostname.toLowerCase() !== window.location.hostname.toLowerCase()
  } catch {
    return false
  }
}

function notify(targetUrl: string, reason: 'script-popup' | 'top-navigation') {
  window.dispatchEvent(new CustomEvent(EXT_EVENT, {
    detail: { targetUrl, reason },
  }))
}

window.addEventListener('linkbypass:state', (event) => {
  const detail = (event as CustomEvent).detail as { enabled?: boolean; rules?: RulesConfig } | undefined
  if (!detail) return
  enabled = detail.enabled !== false
  rules = { ...rules, ...detail.rules }
})

const nativeOpen = window.open.bind(window)
window.open = function guardedOpen(url?: string | URL, target?: string, features?: string) {
  const targetUrl = absoluteUrl(url)
  if (enabled && rules.scriptPopups && targetUrl && isCrossSite(targetUrl)) {
    notify(targetUrl, 'script-popup')
    return null
  }

  return nativeOpen(url, target, features)
}

function wrapLocationMethod(name: 'assign' | 'replace') {
  try {
    const nativeMethod = window.location[name].bind(window.location)
    Object.defineProperty(window.location, name, {
      configurable: true,
      value(value: string | URL) {
        const targetUrl = absoluteUrl(value)
        if (enabled && rules.topNavigation && targetUrl && isCrossSite(targetUrl)) {
          notify(targetUrl, 'top-navigation')
        }
        return nativeMethod(value)
      },
    })
  } catch {
    // Some Chromium builds expose Location methods as non-configurable.
  }
}

wrapLocationMethod('assign')
wrapLocationMethod('replace')

try {
  const nativePushState = history.pushState.bind(history)
  const nativeReplaceState = history.replaceState.bind(history)

  history.pushState = function guardedPushState(data: unknown, unused: string, url?: string | URL | null) {
    const targetUrl = absoluteUrl(url)
    if (enabled && rules.topNavigation && targetUrl && isCrossSite(targetUrl)) {
      notify(targetUrl, 'top-navigation')
    }
    return nativePushState(data, unused, url)
  }

  history.replaceState = function guardedReplaceState(data: unknown, unused: string, url?: string | URL | null) {
    const targetUrl = absoluteUrl(url)
    if (enabled && rules.topNavigation && targetUrl && isCrossSite(targetUrl)) {
      notify(targetUrl, 'top-navigation')
    }
    return nativeReplaceState(data, unused, url)
  }
} catch {
  // Keep the page working if history methods are locked down.
}
