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
