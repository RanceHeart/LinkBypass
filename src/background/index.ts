import type { AppState, BlockEntry, Request, RulesConfig, RuntimeState, StateMessage } from '../types'
import { DEFAULT_RULES } from '../types'

const STATE_KEY = 'linkbypass:state'
const LOG_KEY = 'linkbypass:log'
const MAX_LOG_ENTRIES = 80
const INTENT_TTL = 1800
const ALLOW_TTL = 6000
const RESTORE_TTL = 1500

const RULE_IDS: Record<keyof RulesConfig, string> = {
  linkClicks: 'rule-link-clicks',
  scriptPopups: 'rule-script-popups',
  topNavigation: 'rule-top-navigation',
  overlays: 'rule-overlays',
  frames: 'rule-frames',
}

const RULE_LABELS: Record<keyof RulesConfig, string> = {
  linkClicks: 'Block cross-site clicks/forms',
  scriptPopups: 'Block script popups',
  topNavigation: 'Restore hijacked tab navigation',
  overlays: 'Disable full-page click overlays',
  frames: 'Harden ad iframes',
}

interface TabState {
  safeUrl?: string
  restoringUntil?: number
  lastIntent?: {
    targetUrl: string
    sourceUrl: string
    at: number
  }
  allowOnce?: {
    targetUrl: string
    at: number
  }
}

const tabState = new Map<number, TabState>()
const ports = new Set<chrome.runtime.Port>()

function now() {
  return Date.now()
}

function normalizeState(value: AppState | undefined): AppState {
  return {
    enabled: value?.enabled !== false,
    rules: { ...DEFAULT_RULES, ...value?.rules },
  }
}

async function getState(): Promise<AppState> {
  const result = await chrome.storage.session.get(STATE_KEY)
  return normalizeState(result[STATE_KEY] as AppState | undefined)
}

async function setState(state: AppState): Promise<void> {
  await chrome.storage.session.set({ [STATE_KEY]: normalizeState(state) })
}

async function getLog(): Promise<BlockEntry[]> {
  const result = await chrome.storage.session.get(LOG_KEY)
  return Array.isArray(result[LOG_KEY]) ? result[LOG_KEY] as BlockEntry[] : []
}

async function setLog(log: BlockEntry[]): Promise<void> {
  await chrome.storage.session.set({ [LOG_KEY]: log.slice(0, MAX_LOG_ENTRIES) })
}

async function getRuntimeState(): Promise<RuntimeState> {
  return { app: await getState(), log: await getLog() }
}

function broadcastState(state: AppState) {
  const message: StateMessage = { type: 'STATE', state }
  for (const port of Array.from(ports)) {
    try {
      port.postMessage(message)
    } catch {
      ports.delete(port)
    }
  }
}

async function recordBlock(entry: Omit<BlockEntry, 'id' | 'at'>) {
  const log = await getLog()
  const next: BlockEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: Date.now(),
  }
  await setLog([next, ...log])
}

function createMenus(state: AppState) {
  chrome.contextMenus.removeAll(() => {
    for (const [rule, id] of Object.entries(RULE_IDS) as [keyof RulesConfig, string][]) {
      chrome.contextMenus.create({
        id,
        title: RULE_LABELS[rule],
        type: 'checkbox',
        checked: state.rules[rule],
        contexts: ['action'],
      })
    }
  })
}

async function updateBadge(state: AppState) {
  await chrome.action.setBadgeText({ text: state.enabled ? 'ON' : 'OFF' })
  await chrome.action.setBadgeBackgroundColor({ color: state.enabled ? '#0a84ff' : '#8e8e93' })
  await chrome.action.setTitle({
    title: state.enabled ? 'LinkBypass: protecting tabs' : 'LinkBypass: paused',
  })
}

function getHostname(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

function isCrossSite(targetUrl: string | undefined, sourceUrl: string | undefined): boolean {
  const target = getHostname(targetUrl)
  const source = getHostname(sourceUrl)
  return Boolean(target && source && target !== source)
}

function isAllowed(tab: TabState | undefined, targetUrl: string): boolean {
  if (!tab?.allowOnce) return false
  return tab.allowOnce.targetUrl === targetUrl && now() - tab.allowOnce.at <= ALLOW_TTL
}

function rememberSafeUrl(tabId: number, url: string) {
  const current = tabState.get(tabId) ?? {}
  current.safeUrl = url
  tabState.set(tabId, current)
}

async function restoreTab(tabId: number, targetUrl: string, sourceUrl: string) {
  const current = tabState.get(tabId) ?? {}
  if (!current.safeUrl || current.safeUrl === targetUrl) return

  current.restoringUntil = now() + RESTORE_TTL
  tabState.set(tabId, current)

  await recordBlock({
    sourceUrl,
    targetUrl,
    reason: 'top-navigation',
  })

  try {
    await chrome.tabs.update(tabId, { url: current.safeUrl })
  } catch {
    // The tab may have closed before the restore fired.
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'linkbypass-content') return
  ports.add(port)

  getState().then((state) => {
    port.postMessage({ type: 'STATE', state } satisfies StateMessage)
  })

  port.onDisconnect.addListener(() => ports.delete(port))
})

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState()
  createMenus(state)
  await updateBadge(state)
})

getState().then((state) => {
  createMenus(state)
  updateBadge(state)
})

chrome.contextMenus.onClicked.addListener((info) => {
  const rule = (Object.entries(RULE_IDS) as [keyof RulesConfig, string][]).find(
    ([, id]) => id === info.menuItemId,
  )?.[0]
  if (!rule || info.checked === undefined) return

  getState().then(async (state) => {
    state.rules[rule] = info.checked
    await setState(state)
    broadcastState(state)
  })
})

chrome.runtime.onMessage.addListener((msg: Request, sender, sendResponse) => {
  const tabId = sender.tab?.id

  switch (msg.type) {
    case 'GET_STATE':
      getState().then(sendResponse)
      return true
    case 'GET_RUNTIME_STATE':
      getRuntimeState().then(sendResponse)
      return true
    case 'TOGGLE':
      getState().then(async (state) => {
        state.enabled = !state.enabled
        await setState(state)
        await updateBadge(state)
        broadcastState(state)
        sendResponse(state.enabled)
      })
      return true
    case 'TOGGLE_RULE':
      getState().then(async (state) => {
        state.rules[msg.rule] = msg.value
        await setState(state)
        broadcastState(state)
        sendResponse(true)
      })
      return true
    case 'CLEAR_LOG':
      setLog([]).then(() => sendResponse(true))
      return true
    case 'OPEN_BLOCKED':
      getLog().then(async (log) => {
        const entry = log.find((item) => item.id === msg.id)
        if (!entry) {
          sendResponse(false)
          return
        }
        await chrome.tabs.create({ url: entry.targetUrl, active: true })
        sendResponse(true)
      })
      return true
    case 'ALLOW_ONCE':
      if (tabId !== undefined) {
        const current = tabState.get(tabId) ?? {}
        current.allowOnce = { targetUrl: msg.targetUrl, at: now() }
        tabState.set(tabId, current)
      }
      sendResponse(true)
      return true
    case 'USER_INTENT':
      if (tabId !== undefined) {
        const current = tabState.get(tabId) ?? {}
        current.lastIntent = {
          targetUrl: msg.targetUrl,
          sourceUrl: msg.sourceUrl,
          at: now(),
        }
        tabState.set(tabId, current)
      }
      sendResponse(true)
      return true
    case 'BLOCKED':
      recordBlock({
        sourceUrl: msg.sourceUrl,
        targetUrl: msg.targetUrl,
        reason: msg.reason,
      }).then(() => sendResponse(true))
      return true
  }
})

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle') return

  getState().then(async (state) => {
    state.enabled = !state.enabled
    await setState(state)
    await updateBadge(state)
    broadcastState(state)
  })
})

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0 || !details.url.startsWith('http')) return

  const current = tabState.get(details.tabId) ?? {}
  if (current.restoringUntil && now() <= current.restoringUntil) return
  rememberSafeUrl(details.tabId, details.url)
})

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0 || !details.url.startsWith('http')) return

  const state = await getState()
  if (!state.enabled || !state.rules.topNavigation) return

  const current = tabState.get(details.tabId)
  if (!current?.safeUrl || isAllowed(current, details.url)) return
  if (current.restoringUntil && now() <= current.restoringUntil) return
  if (!isCrossSite(details.url, current.safeUrl)) return

  const recentIntent = current.lastIntent && now() - current.lastIntent.at <= INTENT_TTL
  if (!recentIntent) return

  await restoreTab(details.tabId, details.url, current.safeUrl)
})

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.id === undefined || tab.openerTabId === undefined) return

  const state = await getState()
  if (!state.enabled || !state.rules.scriptPopups) return

  const opener = tabState.get(tab.openerTabId)
  const openerUrl = opener?.safeUrl
  const targetUrl = tab.pendingUrl || tab.url
  if (!targetUrl || !openerUrl || !isCrossSite(targetUrl, openerUrl)) return
  if (isAllowed(opener, targetUrl)) return

  await recordBlock({
    sourceUrl: openerUrl,
    targetUrl,
    reason: 'opener-popup',
  })

  try {
    await chrome.tabs.remove(tab.id)
  } catch {
    // The page may close the popup before we do.
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId)
})
