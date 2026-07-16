// The core-beat registry (§7.3): the fixed measured content, one per year. Y1-Y3 are
// static data; Y4 GENERATES from the save (the cords audit reads the student's real
// cape). The runner and the year glue resolve through coreBeatFor, so where a beat comes
// from is nobody else's business.

import type { SaveGame } from '../save'
import type { CoreBeat } from './frames'
import { CORE_Y1 } from './y1'
import { CORE_Y2 } from './y2'
import { CORE_Y3 } from './y3'
import { coreY4 } from './y4'

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

/** has this year's required beat been completed? (the ledger is the truth) */
export const beatDone = (ledger: { id: string }[], year: number): boolean =>
  hasCoreBeat(year) && ledger.some((e) => e.id === coreBeatId(year))

// kept for callers that only need Y1-Y3 statically (tests, tooling)
export const CORE_BEATS: Record<number, CoreBeat> = { 1: CORE_Y1, 2: CORE_Y2, 3: CORE_Y3 }
