/* sail there: a panel asks the scene to take the ship somewhere, and the scene answers */
import type { WorldSlot } from './composition'

const EVENT = 'blhs:sail-to'

export type SailAnswer =
  /** she is on her way. The panel closes and gets out of the way. */
  | { ok: true }
  /** she is not going, and this is what a student is told. */
  | { ok: false; why: string }

type SailDetail = {
  slot: WorldSlot
  answer: (a: SailAnswer) => void
}

let listening = 0
let here: string | null = null

/** how many scenes can take a sail request right now, asked by the chart before it draws a control so it never offers a button that cannot do anything */
export const sailListenerCount = (): number => listening

/* `sailListenerCount() > 0` really answers "this map has water on it" and not "the player is afloat", and reading it the second way offered "Sail to The Hub" to somebody standing on the hub's own quay, so the scene reports afloat itself */
let afloat = false
export const isAfloat = (): boolean => afloat
export function setAfloat(on: boolean) {
  if (afloat === on) return
  afloat = on
  window.dispatchEvent(new CustomEvent('blhs:afloat'))
}

/* which painting is on screen, answered by the scene drawing it rather than by the url, and a map with no ocean under it still answers because a journey starts with the walk out of the room */
export const sailFrom = (): string | null => (listening > 0 || voyagers > 0 ? here : null)

/** ask the world to take the ship to this slot, resolving when the scene has decided and not when the ship arrives: a crossing is watched, not awaited */
export function requestSail(slot: WorldSlot): Promise<SailAnswer> {
  return new Promise<SailAnswer>((resolve) => {
    let settled = false
    const answer = (a: SailAnswer) => {
      if (settled) return
      settled = true
      resolve(a)
    }
    window.dispatchEvent(new CustomEvent<SailDetail>(EVENT, { detail: { slot, answer } }))
    /* nobody heard it, which the dispatch answering synchronously is what proves */
    answer({ ok: false, why: 'There is no water under you right now.' })
  })
}

export function onSailRequest(
  mapId: string,
  fn: (slot: WorldSlot, answer: (a: SailAnswer) => void) => void,
): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<SailDetail>).detail
    if (d) fn(d.slot, d.answer)
  }
  window.addEventListener(EVENT, h)
  listening++
  here = mapId
  return () => {
    window.removeEventListener(EVENT, h)
    listening--
    /* the last one out puts the light off: a map id left behind by a torn-down scene is a chart refusing to offer the island a student has just left */
    if (listening <= 0) { listening = 0; here = null }
  }
}

/* the whole journey between islands (walk out, board, bars, cross under a cover, tie up, card) is `sail_to`, a second event and not a flag on `requestSail`, because a scene that can steer a hull across its own ocean may still refuse an island with no dock */
const VOYAGE = 'blhs:voyage-to'

type VoyageDetail = { map: string; answer: (a: SailAnswer) => void }

let voyagers = 0

/** how many scenes could take a voyage right now, so a panel can hide a dead button */
export const voyageListenerCount = (): number => voyagers

/** ask the world to sail the whole way to this map. Resolves on the decision. */
export function requestVoyage(map: string): Promise<SailAnswer> {
  return new Promise<SailAnswer>((resolve) => {
    let settled = false
    const answer = (a: SailAnswer) => { if (!settled) { settled = true; resolve(a) } }
    window.dispatchEvent(new CustomEvent<VoyageDetail>(VOYAGE, { detail: { map, answer } }))
    answer({ ok: false, why: 'There is nowhere to sail from right now.' })
  })
}

export function onVoyageRequest(
  mapId: string,
  fn: (map: string, answer: (a: SailAnswer) => void) => void,
): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<VoyageDetail>).detail
    if (d) fn(d.map, d.answer)
  }
  window.addEventListener(VOYAGE, h)
  voyagers++
  here = mapId
  return () => {
    window.removeEventListener(VOYAGE, h)
    voyagers--
    if (voyagers <= 0) voyagers = 0
    if (listening <= 0 && voyagers <= 0) here = null
  }
}
