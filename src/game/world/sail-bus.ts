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

/** how many scenes can take a sail request right now. The chart asks before it
 *  draws a control, so it never offers a button that cannot do anything. */
export const sailListenerCount = (): number => listening

/* ---- IS HE ACTUALLY IN THE BOAT ------------------------------------------
 *
 * The chart used `sailListenerCount() > 0` to mean "he is afloat", and what that
 * really answers is "this map has water on it". So a student standing on the hub's
 * quay was offered "Sail to The Hub": the one rule that stops the chart sending you
 * to where you already are has an exception for a helmsman who needs to put in, and
 * the exception was true for everybody on the island.
 *
 * The scene says so, because the scene is the only thing that knows. */
let afloat = false
export const isAfloat = (): boolean => afloat
export function setAfloat(on: boolean) {
  if (afloat === on) return
  afloat = on
  window.dispatchEvent(new CustomEvent('blhs:afloat'))
}

/* which painting is on screen, answered by the scene drawing it rather than by
 * the url. A map with no ocean under it still answers, since a journey starts
 * with the walk out of the room and the chart needs to know which room. */
export const sailFrom = (): string | null => (listening > 0 || voyagers > 0 ? here : null)

/** ask the world to take the ship to this slot. Resolves when the scene has
 *  decided, not when the ship arrives: a crossing is watched, not awaited. */
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
    /* the last one out puts the light off. A map id left behind by a torn-down
     * scene is a chart refusing to offer the island a student has just left. */
    if (listening <= 0) { listening = 0; here = null }
  }
}

/* ---- THE WHOLE JOURNEY, ASKED FOR FROM A PANEL ----------------------------
 *
 * ASH, 2026-09-08: *"Pressing a pick puts Thor at his current island's dock, he
 * presses E on his ship, the bars go up, the ship sails herself to that pick's
 * island, he steps off, the island's card plays."*
 *
 * `requestSail` above is the OTHER kind of sailing and both are wanted. It hands
 * the helm to a real hull on this painting's own ocean and steers it there in
 * real time, which is what the chart's pin has always done and what makes the
 * water feel like water. It cannot leave the painting: the line is sounded
 * against this map's depth field, so anything further away than the canvas is
 * refused as aground.
 *
 * This one is the journey between islands: walk out, board, bars, cross under a
 * cover, tie up, step off, card. It is `sail_to`, the same word a member's island
 * writes, reached from React so that a button on the year sheet and a line in
 * somebody's python are the same machine. A member still writes nothing about
 * travel; this is the engine asking itself.
 *
 * IT IS A SECOND EVENT AND NOT A FLAG ON THE FIRST because the two answer
 * different questions ("can this hull reach that pin" against "is that island a
 * place with a dock") and a scene that can do one may refuse the other. */
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
