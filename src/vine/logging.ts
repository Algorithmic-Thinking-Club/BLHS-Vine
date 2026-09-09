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

// events queue to localStorage and POST in batches, stamped with whoever the player is now
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

  /** the endpoint has said it has no database, so this page stops asking */
  private offline = false

  async flush() {
    if (this.offline) { this.queue = []; return }
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
        /* ---- 503 { offline: true } IS THE SERVER SAYING "NOT TODAY" -------
         *
         * `api/log.ts` answers 503 when there is no DATABASE_URL on the deploy,
         * which is the honest degrade it was built for and is the live state
         * today. The queue kept every event and retried every five seconds for
         * the whole session: a browser console filling with red on a school
         * Chromebook, and one request per student per five seconds against an
         * access point with thirty of them on it.
         *
         * A 503 offline is settled for this page, so it stops asking and drains
         * the queue rather than growing one nobody will ever collect. Any OTHER
         * failure keeps the queue and retries, because a dropped wifi packet is
         * exactly what the retry is for. */
        if (res.status === 503) {
          const said = await res.json().catch(() => null) as { offline?: boolean } | null
          if (said?.offline) {
            console.info('[log] the study endpoint is offline on this deploy, so nothing is being sent')
            this.offline = true
            this.queue = []
            saveQueue(this.queue)
            break
          }
        }
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
