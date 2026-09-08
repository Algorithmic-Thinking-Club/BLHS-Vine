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

/* which painting is on screen, answered by the scene drawing it rather than by the url */
export const sailFrom = (): string | null => (listening > 0 ? here : null)

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
