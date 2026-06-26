import type { GrapeEvent, LogEnvelope } from './events'
import type { SessionMode } from './contract'

const SCHEMA_VERSION = 1
const QUEUE_KEY = 'blhs_log_queue'

export interface LoggerConfig {
  appVersion: string
  sessionId: string
  participantId: string
  mode: SessionMode
  endpoint?: string
  flushIntervalMs?: number
}

// Offline-first: events queue to localStorage and POST in batches. If there's no endpoint
// (dev) or the network is down, the queue survives and retries on the next flush. This is the
// AP Research data layer, so nothing is dropped on a flaky Chromebook connection.
export class Logger {
  private cfg: LoggerConfig
  private queue: LogEnvelope[]
  private timer: number

  constructor(cfg: LoggerConfig) {
    this.cfg = cfg
    this.queue = loadQueue()
    this.timer = window.setInterval(() => void this.flush(), cfg.flushIntervalMs ?? 5000)
    window.addEventListener('pagehide', () => void this.flush())
  }

  log(event: GrapeEvent) {
    this.queue.push({
      schemaVersion: SCHEMA_VERSION,
      appVersion: this.cfg.appVersion,
      sessionId: this.cfg.sessionId,
      participantId: this.cfg.participantId,
      mode: this.cfg.mode,
      event,
    })
    saveQueue(this.queue)
  }

  async flush() {
    if (this.queue.length === 0) return
    const batch = this.queue.slice()
    if (!this.cfg.endpoint) {
      console.debug('[log]', batch.length, 'events queued (no endpoint)')
      return
    }
    try {
      const res = await fetch(this.cfg.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(batch),
        keepalive: true,
      })
      if (res.ok) {
        this.queue = this.queue.slice(batch.length)
        saveQueue(this.queue)
      }
    } catch {
      // offline: keep the queue, retry next flush
    }
  }

  dispose() {
    window.clearInterval(this.timer)
  }
}

function loadQueue(): LogEnvelope[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as LogEnvelope[]) : []
  } catch {
    return []
  }
}

function saveQueue(queue: LogEnvelope[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // storage unavailable; drop silently rather than crash gameplay
  }
}
