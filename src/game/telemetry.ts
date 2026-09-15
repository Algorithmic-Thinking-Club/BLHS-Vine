import { Logger } from '../vine/logging'
import { loadSave, subscribeSave } from './save'
import { isCaptain } from './captain'

// one shared logger for the whole front end, with its identity following the save

function anonId(key: string) {
  let v = localStorage.getItem(key)
  if (!v) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem(key, v) }
  return v
}

const logger = new Logger({
  appVersion: import.meta.env?.VITE_APP_VERSION ?? 'dev',
  sessionId: Math.random().toString(36).slice(2, 10),
  participantId: anonId('blhs_anon_id'),
  mode: 'game',
  /* the same drain in dev and in production, so time on task can be checked in both */
  endpoint: import.meta.env?.VITE_LOG_ENDPOINT ?? '/api/log',
})

function syncIdentity() {
  const s = loadSave()
  logger.setIdentity({
    participantId: s?.participantId ?? anonId('blhs_anon_id'),
    mode: 'game',
    dev: isCaptain(),
    localOnly: !!s?.castaway,
  })
}
syncIdentity()
subscribeSave(syncIdentity)

export function track(name: string, data?: Record<string, unknown>) {
  logger.log({ type: 'game', name, data, grapeId: 'vine', at: Date.now() })
}

/* the clock: a beat every fifteen seconds while the tab is visible, for time on task */
const HEARTBEAT_MS = 15_000

let where: Record<string, unknown> = {}

/** what the student is looking at, stamped on every beat until it changes */
export function setContext(next: Record<string, unknown>) {
  where = { ...where, ...next }
}

let timer = 0
let onVisible: (() => void) | null = null

export function startHeartbeat() {
  if (timer) return
  const beat = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    track('heartbeat', { ...where, everyMs: HEARTBEAT_MS })
  }
  timer = window.setInterval(beat, HEARTBEAT_MS)
  /* a beat on the way back so a return from a hidden tab is stamped immediately
   * rather than up to fifteen seconds later, which is the gap the reader would
   * otherwise have to guess about */
  onVisible = () => { if (document.visibilityState === 'visible') beat() }
  document.addEventListener('visibilitychange', onVisible)
  beat()
}

export function stopHeartbeat() {
  if (timer) { window.clearInterval(timer); timer = 0 }
  /* the listener goes with the timer, or a stopped clock still beats on a tab return */
  if (onVisible) { document.removeEventListener('visibilitychange', onVisible); onVisible = null }
}
