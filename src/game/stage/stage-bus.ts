/* the bus carrying the stage's requests, like the arrival card, from pixi over to react */

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

/* whether an arrival card is on screen right now, so nothing else speaks over it */
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

/* whether a map is actually drawn on screen yet, so nothing speaks over a black load */
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
