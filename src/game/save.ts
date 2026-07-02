// THE RUN — the single state the whole game reads and writes (GAME-DESIGN §7/§8).
// v2 grows the v1 bookmark into the full Gear-1 run: identity, the year/season clock, the
// season tokens, the graded ledger GPA is computed from, rank investment, stickers, facts,
// badges, island states. One storage key, no save-slot UI ever, autosaved on every write,
// subscribable so HUD/Handbook react live. The server copy syncs through net.ts when a
// class backend is configured; this stays the instant local truth (§7.7's three layers).

const KEY = 'blhs_save_v2'
const OLD_KEY = 'blhs_save_v1'

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
  v: 2, handle: '', pronouns: '', boatName: '', year: 1, season: 'Fall',
  beat: 'intro:i1', introDone: false,
  tokens: [...SEASONS], ledger: [], ranks: {}, islands: {}, stickers: [], facts: [], badges: [],
  savedAt: 0,
})

// v1 saves migrate silently — nobody loses a run to a schema bump, ever
function migrate(): SaveGame | null {
  try {
    const old = localStorage.getItem(OLD_KEY)
    if (!old) return null
    const s = JSON.parse(old)
    localStorage.removeItem(OLD_KEY)
    return {
      ...fresh(),
      handle: s.handle ?? '', pronouns: s.pronouns ?? '', boatName: s.boatName ?? '',
      thorLook: s.thorLook, year: s.year ?? 1, season: s.season ?? 'Fall',
      beat: s.beat ?? 'intro:i1', introDone: !!s.introDone, savedAt: s.savedAt ?? 0,
    }
  } catch { return null }
}

let cache: SaveGame | null | undefined
const listeners = new Set<() => void>()

export function subscribeSave(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
const emit = () => { for (const fn of listeners) fn() }

export function loadSave(): SaveGame | null {
  if (cache !== undefined) return cache
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as SaveGame
      cache = s.v === 2 ? s : null
    } else {
      const m = migrate()
      if (m) localStorage.setItem(KEY, JSON.stringify(m))
      cache = m
    }
  } catch { cache = null }
  return cache
}

export function hasSave() { return loadSave() !== null }

export function writeSave(patch: Partial<SaveGame>) {
  const next = { ...(loadSave() ?? fresh()), ...patch, savedAt: Date.now() }
  localStorage.setItem(KEY, JSON.stringify(next))
  cache = next
  emit()
  return next
}

export function clearSave() {
  localStorage.removeItem(KEY)
  localStorage.removeItem(OLD_KEY)
  cache = null
  emit()
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
