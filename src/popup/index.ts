import './index.css'
import type { BlockEntry, Request, RuntimeState, RulesConfig } from '../types'

const toggleInput = document.getElementById('toggleInput') as HTMLInputElement
const statusText = document.getElementById('statusText') as HTMLDivElement
const rulesEl = document.getElementById('rules') as HTMLDivElement
const logEl = document.getElementById('log') as HTMLDivElement
const countLabel = document.getElementById('countLabel') as HTMLSpanElement
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement

const RULE_LABELS: Record<keyof RulesConfig, string> = {
  linkClicks: 'Clicks and forms',
  scriptPopups: 'Script popups',
  topNavigation: 'Tab hijacks',
  overlays: 'Click overlays',
  frames: 'Ad iframes',
}

function send<T>(message: Request): Promise<T> {
  return chrome.runtime.sendMessage(message)
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function host(value: string): string {
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}

function renderRules(state: RuntimeState) {
  rulesEl.replaceChildren()

  for (const [rule, label] of Object.entries(RULE_LABELS) as [keyof RulesConfig, string][]) {
    const row = document.createElement('label')
    row.className = 'rule-row'
    row.innerHTML = `
      <span>${label}</span>
      <input type="checkbox" />
    `
    const input = row.querySelector('input')!
    input.checked = state.app.rules[rule]
    input.addEventListener('change', async () => {
      await send<boolean>({ type: 'TOGGLE_RULE', rule, value: input.checked })
      await loadState()
    })
    rulesEl.append(row)
  }
}

function renderLog(entries: BlockEntry[]) {
  countLabel.textContent = `Blocked ${entries.length}`
  logEl.replaceChildren()

  if (!entries.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'No blocked navigation yet'
    logEl.append(empty)
    return
  }

  for (const entry of entries.slice(0, 12)) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'log-entry'
    item.title = entry.targetUrl
    item.innerHTML = `
      <span class="log-main">
        <span class="log-target">${host(entry.targetUrl)}</span>
        <span class="log-reason">${entry.reason}</span>
      </span>
      <span class="log-time">${formatTime(entry.at)}</span>
    `
    item.addEventListener('click', async () => {
      await send<boolean>({ type: 'OPEN_BLOCKED', id: entry.id })
    })
    logEl.append(item)
  }
}

async function loadState() {
  const runtime = await send<RuntimeState>({ type: 'GET_RUNTIME_STATE' })
  toggleInput.checked = runtime.app.enabled
  statusText.textContent = runtime.app.enabled ? 'Protecting current tabs' : 'Paused'
  renderRules(runtime)
  renderLog(runtime.log)
}

toggleInput.addEventListener('change', async () => {
  const enabled = await send<boolean>({ type: 'TOGGLE' })
  toggleInput.checked = enabled
  await loadState()
})

clearBtn.addEventListener('click', async () => {
  await send<boolean>({ type: 'CLEAR_LOG' })
  await loadState()
})

document.addEventListener('DOMContentLoaded', loadState)
