import { Logger } from '../vine/logging'

// One shared logger for the whole front end (GAME-DESIGN law 11: data from frame one, always
// through the offline-first logger, never around it). Anonymous boot identity until the class
// code resolves a participant; then the server-side join swaps in the real assignment.

function anonId(key: string) {
  let v = localStorage.getItem(key)
  if (!v) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem(key, v) }
  return v
}

const logger = new Logger({
  appVersion: import.meta.env?.VITE_APP_VERSION ?? 'dev',
  sessionId: Math.random().toString(36).slice(2, 10),
  participantId: localStorage.getItem('blhs_participant') ?? anonId('blhs_anon_id'),
  mode: 'game',
  // production drains into the study database; dev keeps the offline queue local
  endpoint: import.meta.env?.VITE_LOG_ENDPOINT ?? (import.meta.env?.PROD ? '/api/log' : undefined),
})

export function track(name: string, data?: Record<string, unknown>) {
  logger.log({ type: 'game', name, data, grapeId: 'vine', at: Date.now() })
}
