// THE RUN — one student, one run (GAME-DESIGN §7.7). A device holds a single local save,
// keyed to that student's participant (class code + handle); the server (Neon) is the
// cross-device truth. NOT a multi-save roster — that was reverted (it rested on a
// shared-Chromebook premise BLHS doesn't have; students are 1:1). "Begin Adventure" starts
// the one run; "Continue" resumes it; the only reset is Settings → Danger Zone → Restart.
// Autosaved on every write, subscribable so HUD/Handbook react live.

const KEY = 'blhs_save_v2'
const OLD_V1 = 'blhs_save_v1'
const ROSTER_KEY = 'blhs_saves'   // the reverted roster's keys, cleaned up on load
const ACTIVE_KEY = 'blhs_active'

const newId = () => 'r' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)

export type Season = 'Fall' | 'Winter' | 'Spring'
export const SEASONS: Season[] = ['Fall', 'Winter', 'Spring']

/** one graded thing (island voyage, class beat, core beat) — GPA's raw material (§8.1) */
export type LedgerEntry = {
  id: string
  title: string
  kind: 'island' | 'class' | 'core'
  credit: number
  grade: number
  year: number
  season: Season
  retaken?: boolean
  tags?: string[]
}

export type IslandState = 'misty' | 'discovered' | 'available' | 'active' | 'completed'

export type SaveGame = {
  v: 2
  id: string
  participantId?: string        // the study identity, set at join (net.ts); server keys on this
  arm?: 'game' | 'plain'        // the study arm the server assigned at join (§13.2)
  handle: string
  pronouns: string
  boatName: string
  thorLook?: string
  castaway?: boolean
  classCode?: string
  year: number
  season: Season
  beat: string
  introDone: boolean
  graduated?: boolean           // the run's terminal state (§9); set by the fourth endYear
  tokens: Season[]
  ledger: LedgerEntry[]
  ranks: Record<string, number>
  islands: Record<string, IslandState>
  stickers: string[]
  facts: string[]
  badges: string[]
  savedAt: number
}

const fresh = (): SaveGame => ({
  v: 2, id: newId(), handle: '', pronouns: '', boatName: '', year: 1, season: 'Fall',
  beat: 'intro:i1', introDone: false,
  tokens: [...SEASONS], ledger: [], ranks: {}, islands: {}, stickers: [], facts: [], badges: [],
  savedAt: 0,
})

let cache: SaveGame | null | undefined
const listeners = new Set<() => void>()
export function subscribeSave(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
const emit = () => { for (const fn of listeners) fn() }

// another tab wrote the run: drop this tab's snapshot so the next read sees theirs, and let
// subscribers re-render. Without this, a stale tab's next write reverted real progress.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { cache = undefined; emit() }
  })
}

const readRaw = (): SaveGame | null => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SaveGame
    return s.v === 2 ? s : null
  } catch { return null }
}

// migrate any older shape into the single save: the roster's most-recent entry, then v1
function migrate(): SaveGame | null {
  try {
    const rosterRaw = localStorage.getItem(ROSTER_KEY)
    if (rosterRaw) {
      const arr = JSON.parse(rosterRaw) as SaveGame[]
      // honor the roster's own active pointer first; fall back to the newest entry
      const activeId = localStorage.getItem(ACTIVE_KEY)
      localStorage.removeItem(ROSTER_KEY); localStorage.removeItem(ACTIVE_KEY)
      const valid = arr.filter((s) => s && s.v === 2)
      const best = valid.find((s) => s.id === activeId)
        ?? valid.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0]
      if (best) { localStorage.setItem(KEY, JSON.stringify(best)); return best }
    }
    const v1 = localStorage.getItem(OLD_V1)
    if (v1) {
      const s = JSON.parse(v1)
      localStorage.removeItem(OLD_V1)
      const migrated = { ...fresh(), ...s, v: 2 as const, id: newId() }
      localStorage.setItem(KEY, JSON.stringify(migrated))
      return migrated
    }
  } catch { /* fall through */ }
  return null
}

export function loadSave(): SaveGame | null {
  if (cache !== undefined) return cache
  cache = readRaw() ?? migrate()
  return cache
}

export function hasSave() { return loadSave() !== null }

/** patch the run. The merge base is the RAW stored save (not this tab's cache) so a write
 *  from a tab that sat idle can never revert another tab's progress. Auto-creates on first
 *  write (the intro's first write starts the save). */
export function writeSave(patch: Partial<SaveGame>) {
  const base = readRaw() ?? cache ?? fresh()
  const next = { ...base, ...patch, savedAt: Date.now() }
  localStorage.setItem(KEY, JSON.stringify(next))
  cache = next; emit()
  return next
}

/** Begin Adventure / Restart: a brand-new run, replacing any existing one */
export function beginAdventure(): SaveGame {
  const s = fresh()
  localStorage.setItem(KEY, JSON.stringify(s))
  cache = s; emit()
  return s
}

/** wipe the run (Restart Adventure sends the student back to Begin) */
export function clearSave() {
  localStorage.removeItem(KEY); localStorage.removeItem(OLD_V1)
  localStorage.removeItem(ROSTER_KEY); localStorage.removeItem(ACTIVE_KEY)
  cache = null; emit()
}

// ---- domain verbs (systems write through these, never by hand-editing fields) ----
// Verbs REQUIRE an existing run and return null without one: a passive collector (a loading
// fact, a badge check) firing before Begin Adventure must not conjure a phantom save that
// then greets a brand-new student with "Welcome back".

export function recordGrade(e: LedgerEntry) {
  const s = loadSave()
  if (!s) return null
  const i = s.ledger.findIndex((x) => x.id === e.id)
  const ledger = [...s.ledger]
  if (i >= 0) { if (e.grade > ledger[i].grade) ledger[i] = { ...e, retaken: true }; else return s }
  else ledger.push(e)
  return writeSave({ ledger })
}

export function spendToken(season: Season): ReturnType<typeof writeSave> | null {
  const s = loadSave()
  if (!s) return null
  const i = s.tokens.indexOf(season)
  if (i < 0) return null
  const tokens = [...s.tokens]; tokens.splice(i, 1)
  return writeSave({ tokens })
}

export function setIslandState(id: string, state: IslandState) {
  const s = loadSave()
  if (!s) return null
  return writeSave({ islands: { ...s.islands, [id]: state } })
}

export function collectFact(id: string) {
  const s = loadSave()
  if (!s || s.facts.includes(id)) return s
  return writeSave({ facts: [...s.facts, id] })
}

export function collectSticker(id: string) {
  const s = loadSave()
  if (!s || s.stickers.includes(id)) return s
  return writeSave({ stickers: [...s.stickers, id] })
}

export function grantBadge(id: string) {
  const s = loadSave()
  if (!s || s.badges.includes(id)) return s
  return writeSave({ badges: [...s.badges, id] })
}

/** the year turns. The FOURTH turn is terminal: it marks the run graduated (§9) instead of
 *  refilling tokens — senior year does not repeat. */
export function endYear() {
  const s = loadSave()
  if (!s) return null
  if (s.year >= 4) return writeSave({ graduated: true })
  return writeSave({ year: s.year + 1, season: 'Fall', tokens: [...SEASONS] })
}
