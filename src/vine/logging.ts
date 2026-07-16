import type { GrapeEvent, LogEnvelope } from './events'
import type { SessionMode } from './contract'

const SCHEMA_VERSION = 1
const QUEUE_KEY = 'blhs_log_queue'

export interface LoggerIdentity {
  participantId: string
  mode: SessionMode
  /** captain / god-mode (law §2.14): events ship flagged dev:true, excluded from study exports */
  dev?: boolean
  /** castaway / demo (§2.9): events NEVER ship — the queue drains locally */
  localOnly?: boolean
}

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
//
// Identity is LIVE, not construction-time: a student joins their class mid-session (the
// bottle, I-3), and every event from that moment must carry the real participantId and arm.
// setIdentity() re-points the envelope stamp; events already queued keep the identity they
// were stamped with (they happened pre-join, and the anon id says so honestly).
export class Logger {
  private cfg: LoggerConfig
  private identity: LoggerIdentity
  private queue: LogEnvelope[]
  private timer: number
  private inflight = false

  constructor(cfg: LoggerConfig) {
    this.cfg = cfg
    this.identity = { participantId: cfg.participantId, mode: cfg.mode }
    this.queue = loadQueue()
    this.timer = window.setInterval(() => void this.flush(), cfg.flushIntervalMs ?? 5000)
    window.addEventListener('pagehide', () => void this.flush())
  }

  /** the join (or captain/castaway detection) re-points who the envelopes belong to */
  setIdentity(id: Partial<LoggerIdentity>) {
    this.identity = { ...this.identity, ...id }
  }

  log(event: GrapeEvent) {
    this.queue.push({
      schemaVersion: SCHEMA_VERSION,
      appVersion: this.cfg.appVersion,
      sessionId: this.cfg.sessionId,
      participantId: this.identity.participantId,
      mode: this.identity.mode,
      ...(this.identity.dev ? { dev: true } : {}),
      eid: Math.random().toString(36).slice(2, 10),
      event,
    })
    saveQueue(this.queue)
  }

  async flush() {
    if (this.queue.length === 0) return
    // castaway/demo: nothing ships, ever (§2.9) — drain so the queue can't grow unbounded
    if (this.identity.localOnly) {
      console.debug('[log]', this.queue.length, 'events dropped (demo mode logs nothing)')
      this.queue = []
      saveQueue(this.queue)
      return
    }
    if (!this.cfg.endpoint) {
      console.debug('[log]', this.queue.length, 'events queued (no endpoint)')
      return
    }
    // one flush at a time: the 5s interval and pagehide can overlap, which double-sent batches
    if (this.inflight) return
    this.inflight = true
    try {
      // ship in chunks: keepalive bodies are hard-capped (~64KiB in Chrome), so one giant
      // POST of a long queue would reject forever and the queue could never drain
      while (this.queue.length > 0) {
        const batch = this.queue.slice(0, 100)
        const body = JSON.stringify(batch)
        const res = await fetch(this.cfg.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: body.length < 40_000,
        })
        if (!res.ok) break
        // events logged DURING the fetch appended past batch.length; keep them
        this.queue = this.queue.slice(batch.length)
        saveQueue(this.queue)
      }
    } catch {
      // offline: keep the queue, retry next flush
    } finally {
      this.inflight = false
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
