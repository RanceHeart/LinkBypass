export interface LogEntry {
  id: string
  url: string
  domain: string
  sourceUrl: string
  sourceDomain: string
  title: string
  timestamp: number
}

/* Messages from content script port → background */
export interface ContentPortMessage {
  type: 'STATE'
  enabled: boolean
}

/* Commands background pushes through the port */
export type PortCommand =
  | { type: 'STATE'; enabled: boolean }
