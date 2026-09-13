/* head back: an island is finished and the student asks to be taken to its dock.
 *
 * Ash: *"when all tasks in an island are complete, a button at the bottom middle
 * should show up saying 'Island Finished - Head back'. once clicked, the user gets
 * teleported to the dock of the island they are on. and of course the same sailing
 * logic, esc, the chart, or the immediate sailing, etc. This is constant always."*
 *
 * So this word does exactly one thing and stops: it puts him at the dock. What
 * happens next is the ordinary harbour, which already works, and that is the point
 * of keeping it this small. It is not a voyage and it does not choose a
 * destination.
 *
 * Copied in shape from sail-bus, including the listener count, so the button can
 * hide itself where no scene could answer, and including the synchronous default
 * refusal so a press nobody heard is an answer rather than a hang.
 */

const EVENT = 'blhs:head-back'

export type HomeAnswer =
  /** he is on his way to the dock */
  | { ok: true }
  /** he is not, and this is what a student is told */
  | { ok: false; why: string }

type HomeDetail = { answer: (a: HomeAnswer) => void }

let listening = 0

/** how many scenes can take him to a dock right now */
export const homeListenerCount = (): number => listening

/** ask the scene to put him at this island's dock. Resolves when it has decided. */
export function requestHeadBack(): Promise<HomeAnswer> {
  return new Promise<HomeAnswer>((resolve) => {
    let settled = false
    const answer = (a: HomeAnswer) => {
      if (settled) return
      settled = true
      resolve(a)
    }
    window.dispatchEvent(new CustomEvent<HomeDetail>(EVENT, { detail: { answer } }))
    /* nobody heard it, which the dispatch answering synchronously is what proves */
    answer({ ok: false, why: 'There is no way down to the water from here.' })
  })
}

export function onHeadBack(fn: (answer: (a: HomeAnswer) => void) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<HomeDetail>).detail
    if (d) fn(d.answer)
  }
  window.addEventListener(EVENT, h)
  listening++
  return () => {
    window.removeEventListener(EVENT, h)
    listening = Math.max(0, listening - 1)
  }
}
