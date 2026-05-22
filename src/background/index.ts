import type { LogEntry } from '../types'

const STATE_KEY = 'linkbypass:enabled'
const LOGS_KEY = 'linkbypass:logs'
const MAX_LOGS = 50

/* ─── state ────────────────────────────────── */

async function getEnabled(): Promise<boolean> {
  const r = await chrome.storage.session.get(STATE_KEY)
  return r[STATE_KEY] ?? false
}

async function setEnabled(v: boolean) {
  await chrome.storage.session.set({ [STATE_KEY]: v })
  await updateBadge(v ? null : '')
}

async function toggle(): Promise<boolean> {
  const cur = await getEnabled()
  const next = !cur
  await setEnabled(next)
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

/* ─── badge ────────────────────────────────── */

async function updateBadge(text: string | null) {
  if (text === null) {
    const logs = await getLogs()
    text = logs.length > 0 ? String(logs.length) : ''
  }
  await chrome.action.setBadgeText({ text })
  await chrome.action.setBadgeBackgroundColor({ color: '#007aff' })
}

/* ─── messaging ────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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

// Set initial badge
chrome.runtime.onInstalled.addListener(async () => {
  const logs = await getLogs()
  if (logs.length > 0) await updateBadge(String(logs.length))
})

// Badge also shows blocked count when popup isn't open
getLogs().then((logs) => {
  if (logs.length > 0) updateBadge(String(logs.length))
})
