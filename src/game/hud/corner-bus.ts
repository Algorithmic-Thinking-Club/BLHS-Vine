/* the bus an island uses to hand over the corner plaques one at a time */

export type Plaque = 'map' | 'guide' | 'my-year'
export const PLAQUES: Plaque[] = ['map', 'guide', 'my-year']

export const PLAQUE_EVENT = 'blhs:hud-plaque'

/* HOW LONG A HALF-BUILT CORNER MAY STAND. Longer than the three lines it takes
 * to say the handover and far shorter than a sitting. */
export const HANDOVER_CEILING_MS = 90_000

let armed = false
const shown = new Set<Plaque>()
const listeners = new Set<() => void>()
let ceiling = 0

const tell = () => { for (const fn of [...listeners]) fn() }

const holdCeiling = () => {
  window.clearTimeout(ceiling)
  if (!armed) return
  ceiling = window.setTimeout(() => {
    console.error(`[corner] the handover was armed ${HANDOVER_CEILING_MS / 1000}s ago and never `
      + 'finished, so the corner is being handed back whole. An island armed it and did not '
      + "reveal all three; call revealAllPlaques() (or dispatch 'all') in a finally.")
    revealAllPlaques()
  }, HANDOVER_CEILING_MS)
}

/** hide all three until they are revealed one at a time */
export function armHandover(): void {
  armed = true
  shown.clear()
  holdCeiling()
  tell()
}

/** draw one plaque. Arms the handover if nobody did, so one word is enough. */
export function revealPlaque(which: Plaque): void {
  if (!armed) { armed = true; shown.clear() }
  shown.add(which)
  if (PLAQUES.every((p) => shown.has(p))) { armed = false; window.clearTimeout(ceiling) }
  else holdCeiling()
  tell()
}

/** draw everything and stop staging. Safe to call when nothing was armed. */
export function revealAllPlaques(): void {
  window.clearTimeout(ceiling)
  if (!armed && shown.size === 0) return
  armed = false
  shown.clear()
  tell()
}

/** is this plaque drawn right now */
export const plaqueShown = (which: Plaque): boolean => !armed || shown.has(which)

/** is a staged handover running (for a test, and for the arrival flourish) */
export const handoverArmed = (): boolean => armed

/** which ones have been revealed during the staged handover, in order */
export const plaquesRevealed = (): Plaque[] => PLAQUES.filter((p) => shown.has(p))

export function onCornerChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/* the one page listener, so a word sent from the worker reaches the functions above */
if (typeof window !== 'undefined') {
  window.addEventListener(PLAQUE_EVENT, (e: Event) => {
    const d = (e as CustomEvent<unknown>).detail
    const word = typeof d === 'string' ? d : (d as { plaque?: string })?.plaque
    if (word === 'arm') return armHandover()
    if (word === 'all') return revealAllPlaques()
    if (PLAQUES.includes(word as Plaque)) return revealPlaque(word as Plaque)
    console.error(`[corner] "${String(word)}" is not a plaque. Say one of `
      + `${['arm', ...PLAQUES, 'all'].join(', ')}.`)
  })
}

/* AND A RELOAD IS A WHOLE CORNER. Nothing here is written to the save on
 * purpose (see the header), so this is only the in-page reset a scene teardown
 * wants. */
export const resetCornerForTests = (): void => {
  window.clearTimeout(ceiling)
  armed = false
  shown.clear()
  listeners.clear()
}
