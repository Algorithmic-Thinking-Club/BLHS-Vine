// the client's side of the wire: joining a class, syncing the save, and where the logger drains

import { loadSave, writeSave, type SaveGame } from './save'
import { isCaptain } from './captain'

// the participant now travels ON the active save (each roster run is its own participant),
// so sync/logging read it from there rather than a device-global key
export function participantId(): string | null { return loadSave()?.participantId ?? null }

export type JoinResult =
  | { ok: true; participantId: string; className?: string; arm: 'game' | 'plain'; handle?: string; returning?: boolean }
  | { ok: false; reason: 'offline' | 'unknown_code' | 'class_closed' | 'error' }

export type CheckResult =
  | { ok: true; className?: string }
  | { ok: false; reason: 'offline' | 'unknown_code' | 'class_closed' | 'error' }

/** confirms a class code and names the class, without creating a participant */
export async function checkClass(code: string): Promise<CheckResult> {
  if (isCaptain()) return { ok: true, className: "the Captain's own class" }
  try {
    const r = await fetch(`/api/join?code=${encodeURIComponent(code)}`)
    if (r.status === 503) return { ok: false, reason: 'offline' }
    if (r.status === 404) return { ok: false, reason: 'unknown_code' }
    if (r.status === 403) return { ok: false, reason: 'class_closed' }
    if (!r.ok) return { ok: false, reason: 'error' }
    const d = await r.json()
    return { ok: true, className: d.className }
  } catch {
    return { ok: false, reason: 'offline' }
  }
}

/* whether there is a class service to join at all, asked once and cached for the session */
let classesLive: boolean | null = null
export async function classesAreOpen(): Promise<boolean> {
  if (classesLive !== null) return classesLive
  if (isCaptain()) { classesLive = true; return true }
  try {
    const r = await fetch('/api/join?code=', { method: 'GET' })
    /* a JSON answer is a real server, and anything else is the single page app */
    const ct = r.headers.get('content-type') ?? ''
    classesLive = r.status !== 503 && ct.includes('json')
  } catch {
    classesLive = false
  }
  return classesLive
}

/** the proof harness and the tests need to ask again */
export function forgetClassProbe() { classesLive = null }

export async function joinClass(code: string, handle: string): Promise<JoinResult> {
  if (isCaptain()) {
    // the captain walks through any harbor gate
    writeSave({ participantId: 'captain', arm: 'game', classCode: code.toUpperCase() })
    return { ok: true, participantId: 'captain', arm: 'game', className: "the Captain's own class" }
  }
  try {
    const r = await fetch('/api/join', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, handle }),
    })
    if (r.status === 503) return { ok: false, reason: 'offline' }
    if (r.status === 404) return { ok: false, reason: 'unknown_code' }
    if (r.status === 403) return { ok: false, reason: 'class_closed' }
    if (!r.ok) return { ok: false, reason: 'error' }
    const d = await r.json()
    writeSave({ participantId: d.participantId, arm: d.arm, classCode: code.toUpperCase(), handle: d.handle ?? handle })
    return { ok: true, participantId: d.participantId, className: d.className, arm: d.arm, handle: d.handle ?? handle, returning: d.returning }
  } catch {
    return { ok: false, reason: 'offline' }
  }
}

// ---- state sync: debounced push of every save write; pull on boot for cross-device ----
let pushTimer: number | null = null
// once the server has said 503 offline, no further push this page load: every save write was a request that could not land
let stateOffline = false
export function startStateSync() {
  const push = () => {
    if (stateOffline) return
    const pid = participantId()
    const s = loadSave()
    // demo stays local (§2.9); captain stays local even over a real joined save (§2.14 —
    // god-modified state must never sync into a student's server run)
    if (!pid || pid === 'captain' || isCaptain() || !s || s.castaway) return
    void fetch('/api/state', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ participantId: pid, save: s }),
      keepalive: true,
    }).then((r) => { if (r.status === 503) stateOffline = true })
      .catch(() => { /* offline: the local save remains the truth */ })
  }
  // save.ts emits on every write; debounce so a burst of writes is one POST
  import('./save').then(({ subscribeSave }) => {
    subscribeSave(() => {
      if (pushTimer !== null) clearTimeout(pushTimer)
      pushTimer = window.setTimeout(push, 1500)
    })
  })
  window.addEventListener('pagehide', push)
}

export async function pullState(): Promise<boolean> {
  const pid = participantId()
  if (!pid || pid === 'captain' || isCaptain()) return false
  try {
    const r = await fetch(`/api/state?participantId=${encodeURIComponent(pid)}`)
    if (!r.ok) return false
    const d = await r.json()
    const local = loadSave()
    // the newer save wins — a Chromebook that slept through a week doesn't clobber progress
    if (d.save && (!local || (d.save.savedAt ?? 0) > (local.savedAt ?? 0))) {
      writeSave(d.save as Partial<SaveGame>)
      return true
    }
  } catch { /* offline */ }
  return false
}
