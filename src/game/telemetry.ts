import { Logger } from '../vine/logging'
import { loadSave, subscribeSave } from './save'
import { isCaptain } from './captain'

// One shared logger for the whole front end (GAME-DESIGN law 11: data from frame one, always
// through the offline-first logger, never around it). Anonymous boot identity until the class
// code resolves a participant; the identity then FOLLOWS the save live — a student who joins
// mid-session (the bottle, I-3) logs as themselves from that click onward, in the arm the
// server assigned. Captain sessions ship flagged dev:true (§2.14, excluded from study
// exports); castaway/demo sessions ship nothing at all (§2.9).

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
  // production drains into the study database; dev keeps the offline queue local
  endpoint: import.meta.env?.VITE_LOG_ENDPOINT ?? (import.meta.env?.PROD ? '/api/log' : undefined),
})

function syncIdentity() {
  const s = loadSave()
  logger.setIdentity({
    participantId: s?.participantId ?? anonId('blhs_anon_id'),
    mode: s?.arm === 'plain' ? 'plain' : 'game',
    dev: isCaptain(),
    localOnly: !!s?.castaway,
  })
}
syncIdentity()
subscribeSave(syncIdentity)

export function track(name: string, data?: Record<string, unknown>) {
  logger.log({ type: 'game', name, data, grapeId: 'vine', at: Date.now() })
}

/* ---- THE CLOCK -------------------------------------------------------------
 *
 * `heartbeat` was specified in GAME-DESIGN §13.1 and had ZERO CALLSITES, so time
 * on task was unmeasurable in both arms, everywhere. Dose is the first thing a
 * reviewer asks about an intervention comparison, and the honest answer was that
 * nobody could say how long a student spent on anything.
 *
 * WHY A TICK AND NOT A TIMER PER SCENE. A duration measured by a scene is a
 * duration lost the moment the scene crashes, the tab is closed or the bell goes,
 * which is exactly when it matters. A tick is a series of stamps: the reader
 * (api/_summary.ts) sums the gaps between consecutive events and caps each one,
 * so a run that ended by the tab dying still has every minute it really spent and
 * none of the ones it did not.
 *
 * ONLY WHILE THE TAB IS VISIBLE. A hidden tab is not time on task, and counting
 * it would make an abandoned run look like the longest one in the class.
 */
const HEARTBEAT_MS = 15_000

let where: Record<string, unknown> = {}

/** what the student is looking at, stamped on every beat until it changes */
export function setContext(next: Record<string, unknown>) {
  where = { ...where, ...next }
}

let timer = 0
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
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') beat() })
  beat()
}

export function stopHeartbeat() {
  if (timer) { window.clearInterval(timer); timer = 0 }
}
