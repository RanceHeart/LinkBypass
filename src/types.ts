export interface LogEntry {
  id: string
  url: string
  domain: string
  sourceUrl: string
  sourceDomain: string
  title: string
  timestamp: number
}

export interface StateMessage {
  type: 'GET_STATE' | 'TOGGLE' | 'GET_LOGS' | 'CLEAR_LOGS' | 'BLOCKED_LINK'
  data?: LogEntry
}

export type PopupMessage =
  | { type: 'STATE'; enabled: boolean }
  | { type: 'LOGS'; logs: LogEntry[] }
  | { type: 'LOG_ERROR'; error: string }
