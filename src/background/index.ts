import type { AppState, RulesConfig, Request, StateMessage } from '../types'
import { DEFAULT_RULES } from '../types'

/* ─── constants ────────────────────────────── */

const STATE_KEY = 'linkbypass:state'

const RULE_IDS: Record<keyof RulesConfig, string> = {
  intercept: 'rule-intercept',
  sandbox: 'rule-sandbox',
  overlay: 'rule-overlay',
}

const RULE_LABELS: Record<keyof RulesConfig, string> = {
  intercept: '🎯 跨域拦截 + 烟花',
  sandbox: '🧹 iframe 沙箱净化',
  overlay: '🛡️ 全屏覆盖清除',
}

/* ─── badge ────────────────────────────────── */

async function updateBadge(state: AppState) {
  if (state.enabled) {
    await chrome.action.setBadgeText({ text: '✓' })
    await chrome.action.setBadgeBackgroundColor({ color: '#34c759' })
  } else {
    await chrome.action.setBadgeText({ text: '○' })
    await chrome.action.setBadgeBackgroundColor({ color: '#aeaeb2' })
  }
  await chrome.action.setTitle({
    title: state.enabled
      ? 'LinkBypass: ON  (⌘. to toggle)'
      : 'LinkBypass: OFF  (⌘. to toggle)',
  })
}

/* ─── storage ──────────────────────────────── */

function getState(): Promise<AppState> {
  return chrome.storage.session.get(STATE_KEY).then((r) => {
    const s = r[STATE_KEY] as AppState | undefined
    return s ?? { enabled: true, rules: { ...DEFAULT_RULES } }
  })
}

function setState(s: AppState): Promise<void> {
  return chrome.storage.session.set({ [STATE_KEY]: s })
}

/* ─── port management ──────────────────────── */

let activePorts: Set<chrome.runtime.Port> = new Set()

function broadcastState(state: AppState) {
  const msg: StateMessage = { type: 'STATE', state }
  Array.from(activePorts).forEach((port) => {
    try {
      port.postMessage(msg)
    } catch {
      activePorts.delete(port)
    }
  })
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'linkbypass-content') return
  activePorts.add(port)

  getState().then((state) => {
    port.postMessage({ type: 'STATE', state } satisfies StateMessage)
  })

  port.onDisconnect.addListener(() => {
    activePorts.delete(port)
  })
})

/* ─── context menus ────────────────────────── */

function createMenus() {
  const entries = Object.entries(RULE_IDS) as [keyof RulesConfig, string][]
  for (const [rule, id] of entries) {
    chrome.contextMenus.create({
      id,
      title: RULE_LABELS[rule],
      type: 'checkbox',
      checked: true,
      contexts: ['action'],
    })
  }
}

// onCreate is called when the menu already exists (extension reload),
// so we removeAll first to avoid duplicate-creation errors.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    createMenus()
  })
})

// Also create on startup (in case SW wakes after browser restart without onInstalled)
chrome.contextMenus.removeAll(() => {
  createMenus()
})

// Set badget on startup
getState().then(updateBadge)

chrome.contextMenus.onClicked.addListener((info) => {
  const rule = (Object.entries(RULE_IDS) as [keyof RulesConfig, string][]).find(
    ([, id]) => id === info.menuItemId,
  )?.[0]
  if (!rule || info.checked === undefined) return

  getState().then((state) => {
    state.rules[rule] = info.checked
    setState(state).then(() => {
      broadcastState(state)
      updateBadge(state)
    })
  })
})

/* ─── messaging ────────────────────────────── */

chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_STATE':
      getState().then(sendResponse)
      return true
    case 'TOGGLE':
      getState().then((state) => {
        state.enabled = !state.enabled
        setState(state).then(() => {
          broadcastState(state)
          updateBadge(state)
          sendResponse(state.enabled)
        })
      })
      return true
    case 'TOGGLE_RULE':
      getState().then((state) => {
        state.rules[msg.rule] = msg.value
        setState(state).then(() => {
          broadcastState(state)
          sendResponse(true)
        })
      })
      return true
  }
})

/* ─── keyboard shortcut ────────────────────── */

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle') {
    getState().then((state) => {
      state.enabled = !state.enabled
      setState(state).then(() => {
        broadcastState(state)
        updateBadge(state)
      })
    })
  }
})
