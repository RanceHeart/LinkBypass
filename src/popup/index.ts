import './index.css'
import type { LogEntry } from '../types'

/* ─── DOM refs ───────────────────────────── */

const toggleInput = document.getElementById('toggleInput') as HTMLInputElement
const countLabel = document.getElementById('countLabel') as HTMLSpanElement
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement
const logList = document.getElementById('logList') as HTMLDivElement
const emptyState = document.getElementById('emptyState') as HTMLDivElement

/* ─── state ──────────────────────────────── */

let logs: LogEntry[] = []

/* ─── helpers ─────────────────────────────── */

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function truncateUrl(url: string): { domain: string; path: string } {
  try {
    const u = new URL(url)
    const path = u.pathname === '/' ? '' : u.pathname + u.search
    return {
      domain: u.hostname,
      path: path.length > 40 ? path.slice(0, 39) + '…' : path,
    }
  } catch {
    return { domain: url, path: '' }
  }
}

/* ─── render ──────────────────────────────── */

function render() {
  countLabel.textContent = `Blocked ${logs.length} link${logs.length !== 1 ? 's' : ''}`

  // Clear existing entries (keep empty state)
  const items = logList.querySelectorAll('.log-entry')
  items.forEach((el) => el.remove())

  if (logs.length === 0) {
    emptyState.style.display = 'flex'
    return
  }

  emptyState.style.display = 'none'

  for (const entry of [...logs].reverse()) {
    const { domain, path } = truncateUrl(entry.url)
    const el = document.createElement('div')
    el.className = 'log-entry'
    el.title = entry.url

    el.innerHTML = `
      <div class="log-entry-header">
        <span class="log-source-domain">${escapeHtml(entry.sourceDomain)}</span>
        <span class="log-timestamp">${formatTime(entry.timestamp)}</span>
      </div>
      <div class="log-url">
        <span class="arrow">→</span>
        <span class="log-url-domain">${escapeHtml(domain)}</span>
        ${path ? `<span class="log-url-path">${escapeHtml(path)}</span>` : ''}
      </div>
    `

    el.addEventListener('click', () => {
      chrome.tabs.create({ url: entry.url, active: true })
    })

    logList.appendChild(el)
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

/* ─── data loading ────────────────────────── */

async function loadState() {
  const [state, logData] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_STATE' }),
    chrome.runtime.sendMessage({ type: 'GET_LOGS' }),
  ])

  toggleInput.checked = state as boolean
  logs = (logData as LogEntry[]) ?? []
  render()
}

/* ─── event handlers ──────────────────────── */

toggleInput.addEventListener('change', async () => {
  const newState = await chrome.runtime.sendMessage({ type: 'TOGGLE' })
  toggleInput.checked = newState as boolean
})

clearBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' })
  logs = []
  render()
})

/* ─── init ────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  loadState()
})
