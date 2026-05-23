/* ─── Rules ─────────────────────────────────── */

export interface RulesConfig {
  intercept: boolean  // 跨域拦截 + 烟花
  sandbox: boolean    // iframe 沙箱净化
  overlay: boolean    // 全屏覆盖清除
}

export const DEFAULT_RULES: RulesConfig = {
  intercept: true,
  sandbox: true,
  overlay: true,
}

/* ─── App state ────────────────────────────── */

export interface AppState {
  enabled: boolean
  rules: RulesConfig
}

/* ─── Port messages (background → content) ─── */

export interface StateMessage {
  type: 'STATE'
  state: AppState
}

/* ─── Request messages (content/popup → bg) ── */

export type Request =
  | { type: 'GET_STATE' }
  | { type: 'TOGGLE' }
  | { type: 'TOGGLE_RULE'; rule: keyof RulesConfig; value: boolean }
