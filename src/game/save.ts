// THE RUN + THE CREW ROSTER — the state the whole game reads and writes (GAME-DESIGN §7/§8).
// Each SaveGame is one PARTICIPANT's full Gear-1 run (identity, the year/season clock, season
// tokens, the graded ledger GPA rests on, ranks, islands, stickers, facts, badges). A device
// holds a ROSTER of them (§7.7, evolved): shared Chromebooks mean many explorers sail from one
// machine, so the device remembers each — a returning student picks themselves instead of
// re-entering the code. This is NOT free-form save slots: every entry maps to a participant
// (handle + class), so the AP-Research dataset stays one-student-one-run. The server copy syncs
// per participant through net.ts; this stays the instant local truth.

const SAVES_KEY = 'blhs_saves'   // JSON array of SaveGame, newest activity first
const ACTIVE_KEY = 'blhs_active' // id of the active run
const OLD_V2 = 'blhs_save_v2'    // pre-roster single save
const OLD_V1 = 'blhs_save_v1'    // the original bookmark

const newId = () => 'r' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)

export type Season = 'Fall' | 'Winter' | 'Spring'
export const SEASONS: Season[] = ['Fall', 'Winter', 'Spring']

/** one graded thing (island voyage, class beat, core beat) — GPA's raw material (§8.1) */
export type LedgerEntry = {
  id: string                    // 'island:atc' | 'class:ap-hug' | 'core:y1'
  title: string
  kind: 'island' | 'class' | 'core'
  credit: number                // islands 1.0, classes 0.5, core 0.5
  grade: number                 // 0..4.0
  year: number
  season: Season
  retaken?: boolean
  tags?: string[]               // cord relevance: 'cte' | 'ap' | 'lang' | 'keyclub' | ...
}

export type IslandState = 'misty' | 'discovered' | 'available' | 'active' | 'completed'

export type SaveGame = {
  v: 2
  id: string                    // stable roster id (one per participant run)
  participantId?: string        // the study identity, set at join (net.ts); server keys on this
  // identity (I-3)
  handle: string
  pronouns: string
  boatName: string
  thorLook?: string
  castaway?: boolean            // demo mode: nothing logged upstream
  classCode?: string            // the joined class (server-verified when the backend is live)
  // the clock
  year: number
  season: Season
  beat: string                  // resumable beat id ('intro:i1', 'intro:i4', 'y1:planner', ...)
  introDone: boolean
  // Gear 1
  tokens: Season[]              // UNSPENT season tokens for the current year
  ledger: LedgerEntry[]
  ranks: Record<string, number> // islandId -> consecutive years invested (JV=1, Varsity=2, Captain=3+)
  islands: Record<string, IslandState>
  stickers: string[]
  facts: string[]               // handbook fact ids collected (loading screens, takeaways)
  badges: string[]
  savedAt: number
}

const fresh = (): SaveGame => ({
  v: 2, id: newId(), handle: '', pronouns: '', boatName: '', year: 1, season: 'Fall',
  beat: 'intro:i1', introDone: false,
  tokens: [...SEASONS], ledger: [], ranks: {}, islands: {}, stickers: [], facts: [], badges: [],
  savedAt: 0,
})

// ---- the roster: an in-memory cache of every local run, persisted as one array ----
let roster: SaveGame[] | undefined
let activeId: string | null = null
const listeners = new Set<() => void>()

export function subscribeSave(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
const emit = () => { for (const fn of listeners) fn() }

function persist() {
  localStorage.setItem(SAVES_KEY, JSON.stringify(roster ?? []))
  if (activeId) localStorage.setItem(ACTIVE_KEY, activeId); else localStorage.removeItem(ACTIVE_KEY)
}

// load the roster once, migrating any pre-roster save (v2 then v1) into a first entry
function ensureRoster(): SaveGame[] {
  if (roster !== undefined) return roster
  try {
    const raw = localStorage.getItem(SAVES_KEY)
    if (raw) {
      roster = (JSON.parse(raw) as SaveGame[]).filter((s) => s && s.v === 2 && s.id)
    } else {
      roster = []
      const old = localStorage.getItem(OLD_V2) ?? localStorage.getItem(OLD_V1)
      if (old) {
        const s = JSON.parse(old)
        roster.push({ ...fresh(), ...s, v: 2, id: newId() })
        localStorage.removeItem(OLD_V2); localStorage.removeItem(OLD_V1)
      }
      persist()
    }
    activeId = localStorage.getItem(ACTIVE_KEY)
    if (activeId && !roster.some((s) => s.id === activeId)) activeId = null
  } catch { roster = []; activeId = null }
  return roster
}

/** every local run, newest activity first (for the saves list) */
export function listSaves(): SaveGame[] {
  return [...ensureRoster()].sort((a, b) => b.savedAt - a.savedAt)
}

/** the active run (the one Continue/HUD/systems read) */
export function loadSave(): SaveGame | null {
  const r = ensureRoster()
  if (activeId) return r.find((s) => s.id === activeId) ?? null
  return null
}

export function hasSave() { return ensureRoster().length > 0 }

/** patch the active run (auto-creates one if none is active, e.g. mid-intro writes) */
export function writeSave(patch: Partial<SaveGame>) {
  const r = ensureRoster()
  let cur = activeId ? r.find((s) => s.id === activeId) : null
  if (!cur) { cur = fresh(); r.push(cur); activeId = cur.id }
  const next = { ...cur, ...patch, savedAt: Date.now() }
  const i = r.findIndex((s) => s.id === next.id)
  if (i >= 0) r[i] = next; else r.push(next)
  activeId = next.id
  persist(); emit()
  return next
}

/** start a brand-new run and make it active (New Voyage) */
export function newSave(): SaveGame {
  const r = ensureRoster()
  const s = fresh()
  r.push(s); activeId = s.id
  persist(); emit()
  return s
}

/** make an existing run the active one (Continue on a specific save) */
export function activateSave(id: string) {
  const r = ensureRoster()
  if (r.some((s) => s.id === id)) { activeId = id; persist(); emit() }
  return loadSave()
}

/** activate the most recently played run (the title's plain Continue) */
export function continueLatest(): SaveGame | null {
  const latest = listSaves()[0]
  if (latest) return activateSave(latest.id)
  return null
}

export function renameSave(id: string, handle: string) {
  const r = ensureRoster()
  const s = r.find((x) => x.id === id)
  if (s) { s.handle = handle.slice(0, 14); s.savedAt = Date.now(); persist(); emit() }
}

export function deleteSave(id: string) {
  roster = ensureRoster().filter((s) => s.id !== id)
  if (activeId === id) activeId = null
  persist(); emit()
}

/** delete the active run (used by dev/captain "wipe active") */
export function clearSave() {
  if (activeId) deleteSave(activeId)
  else emit()
}

/** nuke the whole roster (captain "wipe all", dev fresh=1) */
export function clearAllSaves() {
  roster = []; activeId = null
  localStorage.removeItem(OLD_V2); localStorage.removeItem(OLD_V1)
  persist(); emit()
}

// ---- the domain verbs (systems write through these, never by hand-editing fields) ----

/** record a graded beat; replaces an earlier grade for the same id only if better (retake, §8.1) */
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

/** the year turns (§7.5 end): tokens refill, season resets, rank years accrue via the ledger */
export function endYear() {
  const s = loadSave() ?? fresh()
  return writeSave({ year: Math.min(4, s.year + 1), season: 'Fall', tokens: [...SEASONS] })
}
