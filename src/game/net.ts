// The client's side of the wire (GAME-DESIGN §7.7/§13): join, state sync, and where the
// event logger drains. Offline-first is the law — every call degrades to local dev mode
// without a visible seam (the beach never cares whether Neon exists), and the save keeps
// writing locally either way. Captain bypasses code verification outright (god authority).

import { loadSave, writeSave, type SaveGame } from './save'
import { isCaptain } from './captain'

// the participant now travels ON the active save (each roster run is its own participant),
// so sync/logging read it from there rather than a device-global key
export function participantId(): string | null { return loadSave()?.participantId ?? null }

export type JoinResult =
  | { ok: true; participantId: string; className?: string; arm: 'game' | 'plain'; returning?: boolean }
  | { ok: false; reason: 'offline' | 'unknown_code' | 'class_closed' | 'error' }

export async function joinClass(code: string, handle: string): Promise<JoinResult> {
  if (isCaptain()) {
    // the captain walks through any harbor gate
    writeSave({ participantId: 'captain', classCode: code.toUpperCase() })
    return { ok: true, participantId: 'captain', arm: 'game', className: "the Captain's own crew" }
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
    writeSave({ participantId: d.participantId, classCode: code.toUpperCase(), handle: d.handle ?? handle })
    return { ok: true, participantId: d.participantId, className: d.className, arm: d.arm, returning: d.returning }
  } catch {
    return { ok: false, reason: 'offline' }
  }
}

// ---- state sync: debounced push of every save write; pull on boot for cross-device ----
let pushTimer: number | null = null
export function startStateSync() {
  const push = () => {
    const pid = participantId()
    const s = loadSave()
    if (!pid || pid === 'captain' || !s || s.castaway) return   // demo/captain stay local (§2.9)
    void fetch('/api/state', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ participantId: pid, save: s }),
      keepalive: true,
    }).catch(() => { /* offline: the local save remains the truth */ })
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
  if (!pid || pid === 'captain') return false
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
