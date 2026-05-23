import './index.css'
import type { AppState, Request } from '../types'

const toggleInput = document.getElementById('toggleInput') as HTMLInputElement
const statusText = document.getElementById('statusText') as HTMLDivElement

async function loadState() {
  const s = await chrome.runtime.sendMessage({ type: 'GET_STATE' } satisfies Request)
  const appState = s as AppState
  toggleInput.checked = appState.enabled
  statusText.textContent = appState.enabled ? 'ON — click to pause' : 'OFF — click to enable'
}

toggleInput.addEventListener('change', async () => {
  const enabled = await chrome.runtime.sendMessage({ type: 'TOGGLE' } satisfies Request)
  toggleInput.checked = enabled as boolean
  statusText.textContent = enabled ? 'ON — click to pause' : 'OFF — click to enable'
})

document.addEventListener('DOMContentLoaded', loadState)
