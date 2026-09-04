/* SAIL THERE, ASKED FROM A PANEL AND ANSWERED BY THE WATER.
 *
 * `docs/ops/BRIEF-SELF-EVIDENT.md` law 2: *"Click an island on the chart and the
 * ship sails there by itself."* The chart is React, the ocean is Pixi, and no
 * component owns both, which is the same seam `dialogue.ts`, `ui-bus.ts` and
 * `stage-bus.ts` all sit on and the same reason this is a bus.
 *
 * IT RUNS THE OTHER WAY FROM `ui-bus`. That one is the scene asking React to open
 * a panel. This is a panel asking the scene to do something in the world, and
 * before it the only React-to-scene signal in the game was a boolean saying the
 * controls were taken away.
 *
 * IT ANSWERS, ALWAYS, AND THAT IS THE POINT. A student clicks an island and one
 * of three things is true: she is going, she cannot go from here, or nothing is
 * listening because the chart was opened from a screen with no ocean under it.
 * All three have to reach the panel, because a chart row that swallows a click is
 * exactly the dead end the law forbids. `requestBeat` in `ui-bus.ts` already has
 * this shape and this is it again, with a sentence instead of a boolean.
 */
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

/* WHICH PAINTING IS ON SCREEN, ANSWERED BY THE SCENE THAT IS DRAWING IT.
 *
 * The chart has to know where the student is standing so it does not offer to
 * sail them to the island they are already on. Reading it off the address is a
 * guess: `?map=` is absent on a cold boot and `targetFromUrl` fills it with a
 * test bundle's id, so the guess is wrong exactly when a student is most likely
 * to be lost. The scene knows, and it is the only thing that does. */
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
    /* NOBODY HEARD IT. The listener count is not enough on its own: a scene can
     * be mounted and mid-teardown, so the honest test is whether anything
     * actually answered by the time the dispatch returned. Synchronous, because
     * `dispatchEvent` runs its listeners before it returns. */
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
