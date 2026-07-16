// The core-beat registry (§7.3): the fixed measured content, one per year. Y2-Y4 land
// here as they are written (THE-PATH 3.9); the runner and the year glue read this map,
// so a new year's beat is a data drop, not a code change.

import type { CoreBeat } from './frames'
import { CORE_Y1 } from './y1'

export const CORE_BEATS: Record<number, CoreBeat> = {
  1: CORE_Y1,
}

/** has this year's required beat been completed? (the ledger is the truth) */
export const beatDone = (ledger: { id: string }[], year: number): boolean =>
  !!CORE_BEATS[year] && ledger.some((e) => e.id === CORE_BEATS[year].id)
