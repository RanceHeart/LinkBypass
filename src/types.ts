export interface RulesConfig {
  linkClicks: boolean
  scriptPopups: boolean
  topNavigation: boolean
  overlays: boolean
  frames: boolean
}

export const DEFAULT_RULES: RulesConfig = {
  linkClicks: true,
  scriptPopups: true,
  topNavigation: true,
  overlays: true,
  frames: true,
}

export interface AppState {
  enabled: boolean
  rules: RulesConfig
}

export interface BlockEntry {
  id: string
  at: number
  sourceUrl: string
  targetUrl: string
  reason: BlockReason
}

export type BlockReason =
  | 'cross-site-click'
  | 'cross-site-form'
  | 'script-popup'
  | 'top-navigation'
  | 'opener-popup'
  | 'overlay'

export interface RuntimeState {
  app: AppState
  log: BlockEntry[]
}

export interface StateMessage {
  type: 'STATE'
  state: AppState
}

export type Request =
  | { type: 'GET_RUNTIME_STATE' }
  | { type: 'GET_STATE' }
  | { type: 'TOGGLE' }
  | { type: 'TOGGLE_RULE'; rule: keyof RulesConfig; value: boolean }
  | { type: 'CLEAR_LOG' }
  | { type: 'OPEN_BLOCKED'; id: string }
  | { type: 'ALLOW_ONCE'; targetUrl: string }
  | { type: 'USER_INTENT'; targetUrl: string; sourceUrl: string; input: string }
  | { type: 'BLOCKED'; targetUrl: string; sourceUrl: string; reason: BlockReason }
