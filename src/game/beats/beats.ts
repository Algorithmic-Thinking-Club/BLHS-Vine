// the registry of core beats, one per year, asked for through coreBeatFor

import type { SaveGame } from '../save'
import type { CoreBeat } from './frames'
import { CORE_Y1 } from './y1'
import { CORE_Y2 } from './y2'
import { CORE_Y3 } from './y3'
import { coreY4 } from './y4'
import { beatPassed } from './state'

export const coreBeatId = (year: number) => `core:y${year}`

/** all four years carry required content now (§13.2: the fixed measured core) */
export const hasCoreBeat = (year: number) => year >= 1 && year <= 4

/** resolve the year's beat — static for Y1-Y3, generated from the save for Y4 */
export function coreBeatFor(year: number, save: SaveGame): CoreBeat | null {
  if (year === 1) return CORE_Y1
  if (year === 2) return CORE_Y2
  if (year === 3) return CORE_Y3
  if (year === 4) return coreY4(save)
  return null
}

/** has this year's required beat been SAT, whatever came of it */
export const beatDone = (ledger: { id: string }[], year: number): boolean =>
  hasCoreBeat(year) && ledger.some((e) => e.id === coreBeatId(year))

/* ---- AND WHETHER IT WAS PASSED, WHICH IS WHAT THE YEAR MEANS -------------
 *
 * ASH, 2026-09-09: *"It shouldnt allow a user to finish their year, if they just
 * failed everything."* Every gate that used `beatDone` meant this and said the
 * other thing, so a student who answered Advisory wrong once had it counted as
 * finished by the year, the sheet and the hearth, and unearned by the wall. */
export const beatPassedIn = (s: SaveGame | null, year: number): boolean =>
  hasCoreBeat(year) && beatPassed(s, coreBeatId(year))

// kept for callers that only need Y1-Y3 statically (tests, tooling)
export const CORE_BEATS: Record<number, CoreBeat> = { 1: CORE_Y1, 2: CORE_Y2, 3: CORE_Y3 }
