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

// migrate any older shape into the single save: the roster's most-recent entry, then v1
function migrate(): SaveGame | null {
  try {
    const rosterRaw = localStorage.getItem(ROSTER_KEY)
    if (rosterRaw) {
      const arr = JSON.parse(rosterRaw) as SaveGame[]
      localStorage.removeItem(ROSTER_KEY); localStorage.removeItem(ACTIVE_KEY)
      const best = arr.filter((s) => s && s.v === 2).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0]
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
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const s = JSON.parse(raw) as SaveGame; cache = s.v === 2 ? s : null }
    else cache = migrate()
  } catch { cache = null }
  return cache
}

export function hasSave() { return loadSave() !== null }

/** patch the run (auto-creates it if none — the intro's first write starts the save) */
export function writeSave(patch: Partial<SaveGame>) {
  const next = { ...(loadSave() ?? fresh()), ...patch, savedAt: Date.now() }
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

export function recordGrade(e: LedgerEntry) {
  const s = loadSave() ?? fresh()
  const i = s.ledger.findIndex((x) => x.id === e.id)
  const ledger = [...s.ledger]
  if (i >= 0) { if (e.grade > ledger[i].grade) ledger[i] = { ...e, retaken: true } }
  else ledger.push(e)
  return writeSave({ ledger })
}

export function spendToken(season: Season) {
  const s = loadSave() ?? fresh()
  const i = s.tokens.indexOf(season)
  if (i < 0) return s
  const tokens = [...s.tokens]; tokens.splice(i, 1)
  return writeSave({ tokens })
}

export function setIslandState(id: string, state: IslandState) {
  const s = loadSave() ?? fresh()
  return writeSave({ islands: { ...s.islands, [id]: state } })
}

export function collectFact(id: string) {
  const s = loadSave() ?? fresh()
  if (s.facts.includes(id)) return s
  return writeSave({ facts: [...s.facts, id] })
}

export function collectSticker(id: string) {
  const s = loadSave() ?? fresh()
  if (s.stickers.includes(id)) return s
  return writeSave({ stickers: [...s.stickers, id] })
}

export function grantBadge(id: string) {
  const s = loadSave() ?? fresh()
  if (s.badges.includes(id)) return s
  return writeSave({ badges: [...s.badges, id] })
}

export function endYear() {
  const s = loadSave() ?? fresh()
  return writeSave({ year: Math.min(4, s.year + 1), season: 'Fall', tokens: [...SEASONS] })
}
