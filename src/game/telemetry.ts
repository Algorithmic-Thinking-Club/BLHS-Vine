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
