/* THE CORNER, HANDED OVER ONE PLAQUE AT A TIME.
 *
 * BRIEF-INTRO-FILM section 4: *"then the handover: the bars come down, the
 * corner appears one plaque at a time with one line each said by the principal,
 * 'My Year is what you picked. The Guide is every club and class at Bonney
 * Lake. The Map is where you sail.'"*
 *
 * ---- WHY THIS IS A BUS AND NOT A PROP ------------------------------------
 *
 * The lines are the island's, in Python, in the members' repo, and the corner is
 * React mounted beside a Pixi canvas. Nothing owns both, which is the same
 * reason `ui-bus.ts` and `dialogue.ts` exist. This is the third one, kept apart
 * from `ui-bus` on purpose: that bus OPENS a panel and this one only says
 * whether a door is drawn yet.
 *
 * ---- WHAT AN ISLAND CALLS -------------------------------------------------
 *
 * One window CustomEvent, `blhs:hud-plaque`, carrying one string:
 *
 *   'arm'      hide all three. Said once, before the bars come down.
 *   'map'      draw the Map plaque, on its hook, as an arrival.
 *   'guide'    the same for the Guide.
 *   'my-year'  the same for My Year.
 *   'all'      draw whatever is left and stop staging. The way out.
 *
 * so an engine word on the other side of the worker is one line:
 *
 *   window.dispatchEvent(new CustomEvent('blhs:hud-plaque', { detail: 'map' }))
 *
 * and `revealPlaque('map')` below is the same thing with a name.
 *
 * ---- THE DEFAULT IS EVERYTHING, AND THAT IS THE IMPORTANT PART -----------
 *
 * BRIEF-PLAYTHROUGH-1 law 2 is that the corner is complete from the first world
 * frame, because "two buttons in a corner read as broken, not as earned". That
 * law is not being reversed: nothing is hidden until an island explicitly ARMS
 * the handover, the arming lives in memory rather than in the save, and a reload
 * hands all three back. A student who walks away in the middle of the film and
 * comes back gets a whole corner, not a broken one.
 *
 * THERE IS A CEILING FOR THE SAME REASON THE MOVIE HAS ONE. An island that arms
 * the handover and then throws, or is torn down by a door, would otherwise leave
 * a student looking at a corner with no doors in it and no way to get one. Ninety
 * seconds after the last thing happened the corner comes back on its own and says
 * so in the console. */

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

/* THE WIRE. One listener for the life of the page, added at import, because the
 * caller is on the other side of a worker and cannot hold a reference to any of
 * the functions above. A detail that is not one of the five words is ignored and
 * says so, rather than silently arming a corner nobody asked for. */
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
