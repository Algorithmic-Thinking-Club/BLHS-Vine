/* THE STAGE'S REQUESTS, CROSSING FROM PIXI TO REACT.
 *
 * The same seam `dialogue.ts` and `ui-bus.ts` already sit on, and for the same
 * reason written at the top of both: the thing asking is Pixi code inside a
 * scene and the thing rendering is React mounted beside it by `SceneManager`, so
 * there is no parent holding both. The stage decides that a place has been
 * arrived at. The kit decides what an arrival looks like.
 *
 * `stage-bus.ts` in `src/game/cutscene/` publishes a RUNTIME. This one carries
 * the stage's other two outward requests: the place card and the world-space
 * highlight. They are here rather than there because a place card fires on a
 * door swap with no script anywhere near it.
 */

export type PlaceCardRequest = {
  /** the name a player reads. Never a map id: `covers.ts` resolves it. */
  title: string
  /** one line under it, when the destination has something to say */
  line?: string
}

const cardListeners = new Set<(c: PlaceCardRequest) => void>()

/** show the card. Fire-and-forget: the card dismisses itself and takes no input,
 *  so there is nothing to await and nothing to release. */
export function showPlaceCard(c: PlaceCardRequest) {
  for (const fn of cardListeners) fn(c)
}

export function onPlaceCard(fn: (c: PlaceCardRequest) => void): () => void {
  cardListeners.add(fn)
  return () => { cardListeners.delete(fn) }
}

/* ---- IS AN ARRIVAL ON SCREEN RIGHT NOW ------------------------------------
 *
 * The year's opening line and the arrival card fire on the SAME instant, because
 * an arrival is what starts a year and an arrival is what the card is for.
 * Nothing knew about the other, so on every first walk into a map they stacked
 * along the bottom of the window together, with the body behind both: the eyes
 * round of 2026-08-30 caught the player marker sliced by the card's own top edge
 * on the very screenshot taken to prove that had stopped happening. Three
 * surfaces cannot share the bottom of an 800px window and leave room for a body.
 *
 * So they take turns. The card says where you are, alone, and the year speaks
 * when it has finished. This is the thing the vignette's own "only while the
 * world is quiet" rule always meant and could not see. */
let cardUp = false
const busyListeners = new Set<() => void>()

export const placeCardUp = (): boolean => cardUp

export function setPlaceCardUp(v: boolean): void {
  if (v === cardUp) return
  cardUp = v
  for (const fn of busyListeners) fn()
}

export function onStageBusy(fn: () => void): () => void {
  busyListeners.add(fn)
  return () => { busyListeners.delete(fn) }
}

/* ---- IS THERE A WORLD ON THE GLASS AT ALL ---------------------------------
 *
 * STATE-OF-THE-GAME confusing 5 and ugly 1. A map load is two to twenty
 * seconds of black, and the year's opening speech mounted on a timer from the
 * HUD's own mount, so Principal Panther's first line of the year could open over
 * nothing: no room, no body, no place. `Hud.tsx` gated on `settled`, which was a
 * clock, and a clock does not know whether the painting arrived.
 *
 * The scene says so here the moment its first frame is on screen, and says
 * so again with `null` when it tears down for a door. The HUD reads it the way
 * it reads the card: as one more reason the world is not quiet yet. */
let drawnMap: string | null = null
const drawnListeners = new Set<(map: string | null) => void>()

/** the id of the map whose first frame is on screen, or null while loading */
export const sceneDrawn = (): string | null => drawnMap

export function setSceneDrawn(map: string | null): void {
  if (map === drawnMap) return
  drawnMap = map
  for (const fn of drawnListeners) fn(map)
}

export function onSceneDrawn(fn: (map: string | null) => void): () => void {
  drawnListeners.add(fn)
  return () => { drawnListeners.delete(fn) }
}
