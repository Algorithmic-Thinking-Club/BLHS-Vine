// Save/resume v1 (GAME-DESIGN §7.7): device-local snapshot for instant resume; the server
// copy (class code + handle) comes with the join backend. No save-slot UI ever — one save,
// autosaved at beat boundaries. The title's smart CTA reads this to offer Continue.

const KEY = 'blhs_save_v1'

export type SaveGame = {
  v: 1
  handle: string
  pronouns: string
  boatName: string
  thorLook?: string            // the wardrobe's accent choice ('classic' | 'gold' | ...)
  year: number
  season: 'Fall' | 'Winter' | 'Spring'
  beat: string                 // resumable beat id ('intro:i4', 'y1:planner', ...)
  introDone: boolean
  savedAt: number
}

export function loadSave(): SaveGame | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SaveGame
    return s.v === 1 ? s : null
  } catch { return null }
}

export function hasSave() { return loadSave() !== null }

export function writeSave(patch: Partial<SaveGame>) {
  const cur = loadSave() ?? {
    v: 1 as const, handle: '', pronouns: '', boatName: '', year: 1,
    season: 'Fall' as const, beat: 'intro:i1', introDone: false, savedAt: 0,
  }
  const next = { ...cur, ...patch, savedAt: Date.now() }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function clearSave() { localStorage.removeItem(KEY) }
