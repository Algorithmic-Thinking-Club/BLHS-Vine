import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// The game world + the run. The archipelago is data: each island is one real BLHS thing,
// placed in iso world coords (shared by the renderer). The run-state is Wiseman's Gear 1 —
// four "years", scarce time-slots, a GPA that climbs, cords you earn — made into a tiny
// store the scenes read and update. This is the spine the story hangs on.

export type IslandState = 'locked' | 'available' | 'completed'

export type IslandDef = {
  id: string
  name: string
  theme: string       // emoji landmark used on the map marker
  category: string
  cx: number; cy: number; r: number; seed: number
  blurb: string
  // a one-line "fact" the island teaches (the learning payload; deepens into a grape in Phase 2)
  fact: string
}

// hub + four satellites. Positions/sizes match the renderer's island shapes.
export const ISLANDS: IslandDef[] = [
  { id: 'commons', name: 'The Commons', theme: '⚓', category: 'Home', cx: 0, cy: 0, r: 9.5, seed: 0.0,
    blurb: 'Your harbor on the BLHS seas — the heart of campus.', fact: 'BLHS opened in 2005 and is home of the Panthers.' },
  { id: 'atc', name: 'ATC Island', theme: '💻', category: 'Competitive Club', cx: -22, cy: -10, r: 5.0, seed: 1.7,
    blurb: 'Algorithmic Thinking Club — learn to code by building real things.', fact: 'ATC members build pieces of this very game to learn programming.' },
  { id: 'football', name: 'Panther Stadium', theme: '🏈', category: 'Sport', cx: 24, cy: -16, r: 5.6, seed: 3.1,
    blurb: 'Friday-night lights and the BLHS gridiron.', fact: 'Make varsity, then earn Team Captain by how you play.' },
  { id: 'pac', name: 'The PAC', theme: '🎭', category: 'Curricular Program', cx: -16, cy: 20, r: 5.2, seed: 4.6,
    blurb: 'Performing Arts Center — stage, band, and drama.', fact: 'Three years of band can put you on track for a music honor cord.' },
  { id: 'culinary', name: 'Culinary Cove', theme: '🍳', category: 'Competitive Club', cx: 22, cy: 18, r: 4.4, seed: 2.2,
    blurb: 'Culinary arts — the kitchen always smells incredible.', fact: 'Culinary competes through FCCLA and the CTE strand.' },
]

export type RunState = {
  handle: string
  pronouns: string
  interests: string[]
  boatName: string
  thorLook: string
  year: number
  maxYears: number
  slotsLeft: number
  slotsPerYear: number
  gpa: number
  cords: string[]
  islandStates: Record<string, IslandState>
  selectedId: string | null
}

function initialRun(): RunState {
  return {
    handle: 'Explorer', pronouns: 'they/them', interests: [], boatName: 'The Panther', thorLook: 'classic',
    year: 1, maxYears: 4, slotsLeft: 3, slotsPerYear: 3, gpa: 0, cords: [],
    islandStates: { commons: 'available', atc: 'available', football: 'available', pac: 'locked', culinary: 'locked' },
    selectedId: null,
  }
}

type GameCtx = {
  run: RunState
  islandById: (id: string) => IslandDef | undefined
  select: (id: string | null) => void
  completeIsland: (id: string, gpaGain: number) => void
  endYear: () => void
  setHandle: (h: string) => void
  setIdentity: (p: Partial<Pick<RunState, 'handle' | 'pronouns' | 'interests'>>) => void
  setOutfit: (p: Partial<Pick<RunState, 'boatName' | 'thorLook'>>) => void
  reset: () => void
}

const Ctx = createContext<GameCtx | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<RunState>(initialRun)

  const select = useCallback((id: string | null) => setRun((r) => ({ ...r, selectedId: id })), [])

  const completeIsland = useCallback((id: string, gpaGain: number) => setRun((r) => {
    if (r.islandStates[id] === 'completed') return r
    const islandStates = { ...r.islandStates, [id]: 'completed' as IslandState }
    // completing a club lights the next misty island (visible progress)
    if (id === 'atc' && islandStates.pac === 'locked') islandStates.pac = 'available'
    if (id === 'football' && islandStates.culinary === 'locked') islandStates.culinary = 'available'
    return { ...r, islandStates, gpa: Math.min(4, +(r.gpa + gpaGain).toFixed(2)), slotsLeft: Math.max(0, r.slotsLeft - 1) }
  }), [])

  const endYear = useCallback(() => setRun((r) => ({
    ...r, year: r.year + 1, slotsLeft: r.slotsPerYear,
  })), [])

  const setHandle = useCallback((h: string) => setRun((r) => ({ ...r, handle: h })), [])
  const setIdentity = useCallback((p: Partial<RunState>) => setRun((r) => ({ ...r, ...p })), [])
  const setOutfit = useCallback((p: Partial<RunState>) => setRun((r) => ({ ...r, ...p })), [])
  const reset = useCallback(() => setRun(initialRun()), [])

  const islandById = useCallback((id: string) => ISLANDS.find((i) => i.id === id), [])

  const value = useMemo<GameCtx>(() => ({ run, islandById, select, completeIsland, endYear, setHandle, setIdentity, setOutfit, reset }),
    [run, islandById, select, completeIsland, endYear, setHandle, setIdentity, setOutfit, reset])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGame() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useGame must be used inside <GameProvider>')
  return c
}
