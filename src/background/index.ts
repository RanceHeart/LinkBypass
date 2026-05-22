import type { LogEntry, ContentPortMessage } from '../types'

/* ─── state ────────────────────────────────── */

const STATE_KEY = 'linkbypass:enabled'
const LOGS_KEY = 'linkbypass:logs'
const MAX_LOGS = 50

let activePorts: Set<chrome.runtime.Port> = new Set()

function getEnabled(): Promise<boolean> {
  return chrome.storage.session.get(STATE_KEY).then(r => r[STATE_KEY] ?? false)
}

function setEnabled(v: boolean) {
  return chrome.storage.session.set({ [STATE_KEY]: v })
}

/* ─── port management ──────────────────────── */

// Content scripts connect here to receive real-time state
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'linkbypass-content') return
  activePorts.add(port)

  // Send current state immediately
  getEnabled().then((enabled) => {
    port.postMessage({ type: 'STATE', enabled } satisfies ContentPortMessage)
  })

  port.onDisconnect.addListener(() => {
    activePorts.delete(port)
  })
})

function broadcastState(enabled: boolean) {
  const msg: ContentPortMessage = { type: 'STATE', enabled }
  Array.from(activePorts).forEach((port) => {
    try { port.postMessage(msg) } catch { activePorts.delete(port) }
  })
}

/* ─── toggle ───────────────────────────────── */

async function toggle(): Promise<boolean> {
  const cur = await getEnabled()
  const next = !cur
  await setEnabled(next)
  broadcastState(next)
  await updateBadge(next ? null : '')
  return next
}

/* ─── logs ─────────────────────────────────── */

async function getLogs(): Promise<LogEntry[]> {
  const r = await chrome.storage.local.get(LOGS_KEY)
  return r[LOGS_KEY] ?? []
}

async function addLog(entry: LogEntry) {
  const logs = await getLogs()
  logs.push(entry)
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
  await chrome.storage.local.set({ [LOGS_KEY]: logs })
  await updateBadge(String(logs.length))
}

async function clearLogs() {
  await chrome.storage.local.set({ [LOGS_KEY]: [] })
  await updateBadge(null)
}

/* ─── badge & icon ─────────────────────────── */

async function updateBadge(text: string | null) {
  const enabled = await getEnabled()

  // Tooltip always shows state + shortcut
  const label = enabled
    ? 'LinkBypass: ON  (⌘K to toggle)'
    : 'LinkBypass: OFF  (⌘K to toggle)'
  await chrome.action.setTitle({ title: label })

  if (!enabled) {
    // OFF: no badge
    await chrome.action.setBadgeText({ text: '' })
    return
  }

  // ON: show count, or "✓" if 0
  if (text === null) {
    const logs = await getLogs()
    text = logs.length > 0 ? String(logs.length) : '✓'
  }
  if (text === '0' || text === '') text = '✓'

  await chrome.action.setBadgeText({ text })
  await chrome.action.setBadgeBackgroundColor({ color: '#34c759' }) // iOS green
}

/* ─── messaging ────────────────────────────── */

type Request =
  | { type: 'GET_STATE' }
  | { type: 'TOGGLE' }
  | { type: 'GET_LOGS' }
  | { type: 'CLEAR_LOGS' }
  | { type: 'BLOCKED_LINK'; data: LogEntry }

chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_STATE':
      getEnabled().then(sendResponse)
      return true
    case 'TOGGLE':
      toggle().then(sendResponse)
      return true
    case 'GET_LOGS':
      getLogs().then(sendResponse)
      return true
    case 'CLEAR_LOGS':
      clearLogs().then(() => sendResponse(true))
      return true
    case 'BLOCKED_LINK':
      addLog(msg.data).then(() => sendResponse(true))
      return true
  }
})

/* ─── init ─────────────────────────────────── */

// Keyboard shortcut toggle
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle') {
    toggle().then((newState) => {
      console.log('[LinkBypass] toggled', newState ? 'ON' : 'OFF')
    })
  }
})

chrome.runtime.onInstalled.addListener(async () => {
  const logs = await getLogs()
  if (logs.length > 0) await updateBadge(String(logs.length))
})

// Badge on startup
getLogs().then((logs) => {
  if (logs.length > 0) updateBadge(String(logs.length))
})
