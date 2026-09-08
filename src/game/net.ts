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
  | { ok: true; participantId: string; className?: string; arm: 'game' | 'plain'; handle?: string; returning?: boolean }
  | { ok: false; reason: 'offline' | 'unknown_code' | 'class_closed' | 'error' }

export type CheckResult =
  | { ok: true; className?: string }
  | { ok: false; reason: 'offline' | 'unknown_code' | 'class_closed' | 'error' }

/** the code card's cheap class lookup — confirms the code (and names the crew, in fiction)
 *  WITHOUT creating a participant; the student picks their handle on the next card and the
 *  real join happens there. Joining here with a placeholder handle merged whole classes
 *  into one participant (the Act Zero critical). */
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

/* IS THERE A CLASS TO JOIN AT ALL (BRIEF-CLOSE-THE-LOOP section 6).
 *
 * ASH, 2026-09-08: *"'Join my class' what was that even for. does it still apply?
 * How would that even work. Also as of right now i can just enter any number /
 * code."* He can, and that is by design and is worse than a bug: `checkClass`
 * waves a student through on `offline` deliberately, because a blocked join
 * excludes exactly the students whose network is worst, and NO DATABASE HAS EVER
 * BEEN CREATED for this project (`docs/ops/STUDY-LOGGING.md`), so `/api/join`
 * answers 503 for everybody and every code is accepted.
 *
 * A screen that asks a fourteen year old for a six character code and then takes
 * any six characters teaches him the game is not listening. The brief's ruling:
 * *"The class code card appears only when `/api/join` answers; with no server
 * (today) it is skipped and the student goes straight to the name."*
 *
 * ONE HEAD REQUEST WITH NO CODE ON IT, and 503 is the only answer that means no.
 * A 400 or a 404 is a server that is up and did not like an empty query, which is
 * a server that can take a real code. Cached for the session, because the intro
 * asks once and the answer cannot change inside it. */
let classesLive: boolean | null = null
export async function classesAreOpen(): Promise<boolean> {
  if (classesLive !== null) return classesLive
  if (isCaptain()) { classesLive = true; return true }
  try {
    const r = await fetch('/api/join?code=', { method: 'GET' })
    /* A JSON ANSWER IS A SERVER; ANYTHING ELSE IS THE SINGLE PAGE APP. On the
     * deploy this is a real function and it answers 503 `{offline: true}` with no
     * database behind it, which is the honest no. On a dev server there is no
     * function at all and Vite hands back index.html at 200, so the status alone
     * would read as a live class service and put the code card back. Measured on
     * both, 2026-09-08. */
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
export function startStateSync() {
  const push = () => {
    const pid = participantId()
    const s = loadSave()
    // demo stays local (§2.9); captain stays local even over a real joined save (§2.14 —
    // god-modified state must never sync into a student's server run)
    if (!pid || pid === 'captain' || isCaptain() || !s || s.castaway) return
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
