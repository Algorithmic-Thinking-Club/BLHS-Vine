/* DIALOGUE, OUTSIDE A CUTSCENE.
 *
 * The cutscene runtime can already say things, but only as a step inside a
 * script it is driving. A station is not a cutscene: you walk up to the
 * counselor, press E, and a few lines happen. Every grape will do the same, and
 * `say` plus `choose` will be the two most-called intents in the whole API, so
 * they need a home that does not require authoring a script first.
 *
 * A bus rather than props, for the reason ui-bus is a bus: the thing asking is
 * Pixi code inside a scene and the thing rendering is React mounted beside it,
 * and no component owns both.
 *
 * PROMISES HERE, GENERATORS AT THE EDGE. The member's side stays `yield`,
 * because a dropped yield is loud and a dropped await is silent. Inside the
 * engine a promise is the right tool, and run-station.ts is the one place the
 * two meet.
 *
 * The lines queue. Yielding three says in a row should read as three lines a
 * player clicks through, not three overlays fighting for the same corner.
 */

export type DialogueLine = {
  /* an anchor name when the speaker stands somewhere on the map, so the camera
   * and the portrait both resolve from one string; a bare id otherwise */
  who?: string
  text: string
  portrait?: string
}

export type DialogueAsk = {
  prompt?: string
  options: string[]
}

export type DialogueState =
  | { kind: 'line'; line: DialogueLine; advance: () => void }
  | { kind: 'ask'; ask: DialogueAsk; pick: (i: number) => void }
  | null

/* the queue waits on the arrival card, and is woken by it. Imported for the
 * value rather than the type, so this file is the one that owns the wait. */
import { onStageBusy, placeCardUp } from './stage/stage-bus'

type Waiting =
  | { kind: 'line'; line: DialogueLine; done: () => void }
  | { kind: 'ask'; ask: DialogueAsk; done: (i: number) => void }

const queue: Waiting[] = []
let current: Waiting | null = null
const listeners = new Set<(s: DialogueState) => void>()

function view(): DialogueState {
  if (!current) return null
  if (current.kind === 'line') {
    const c = current
    return { kind: 'line', line: c.line, advance: () => finish(c, undefined) }
  }
  const c = current
  return { kind: 'ask', ask: c.ask, pick: (i: number) => finish(c, i) }
}

function announce() {
  const v = view()
  for (const fn of listeners) fn(v)
}

/* ---- NOTHING SPEAKS WHILE AN ARRIVAL CARD IS UP --------------------------
 *
 * `docs/ops/BRIEF-UI.md` item 5 asked for it in round one and round two asked
 * again ("held while nothing else speaks"). It was the one line of that item
 * nobody could close, because every surface that could see the card was a
 * component and the thing that decides WHEN a line is shown is this queue.
 *
 * WHAT IT LOOKED LIKE. `build-shots/ui/before/06-dialogue.png`: the card naming
 * the place and a station's first sentence on screen together, the card drawn
 * over the box, two things introducing themselves at once to a student who has
 * been in the world for two seconds. `scripts/ten-seconds.mjs` measured the same
 * collision from the other end: the year's opening line landed at 0.6 seconds
 * and the card naming the place at 2.0.
 *
 * WHY IT IS A HOLD AND NOT A REFUSAL. A line that arrives during a card is not
 * dropped and is not asked to try again; it waits its turn in the queue it is
 * already in, and the card's own dismissal pumps it. So a station body, a
 * cutscene and a member's Python all keep the promise they were given and none
 * of them needs to know a card exists.
 *
 * THE CARD RE-PUMPS RATHER THAN THIS POLLING. `stage-bus.ts` already tells the
 * world when a card goes up or comes down, so the queue is woken by the same
 * signal every other surface reads. A timer here would be a second clock for a
 * thing that already has an event. */
function pump() {
  if (current) return
  if (placeCardUp()) return
  current = queue.shift() ?? null
  announce()
}

function finish(who: Waiting, pick: number | undefined) {
  /* a click that arrives after the line already advanced is ignored rather than
   * resolving the next one, which is what a double click on the last line of a
   * scene would otherwise do */
  if (current !== who) return
  current = null
  if (who.kind === 'line') who.done()
  else who.done(typeof pick === 'number' ? pick : 0)
  pump()
}

export function say(line: DialogueLine): Promise<void> {
  return new Promise((resolve) => {
    queue.push({ kind: 'line', line, done: resolve })
    pump()
  })
}

export function choose(ask: DialogueAsk): Promise<number> {
  return new Promise((resolve) => {
    /* an ask with no options would hang the station forever waiting for a click
     * on a button that was never rendered. Answered immediately with -1 so the
     * body can tell the difference between "they picked the first one" and
     * "there was nothing to pick". */
    if (!ask.options.length) { resolve(-1); return }
    queue.push({ kind: 'ask', ask, done: resolve })
    pump()
  })
}

/* WOKEN WHEN THE CARD LEAVES. Without this a line that arrived during a card
 * would sit in the queue until the NEXT `say`, which on the hub is a station a
 * student has not walked to yet: the opening sentence of the game, waiting for
 * an event that may never come. */
if (typeof window !== 'undefined') onStageBusy(() => { if (!placeCardUp()) pump() })

export const dialogueState = view
export function onDialogue(fn: (s: DialogueState) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/* scene teardown. Anything still waiting is resolved rather than left hanging,
 * because a station body parked on an unresolved promise holds its world lock
 * forever and the next map opens with no controls. */
export function clearDialogue() {
  const stuck = [current, ...queue].filter(Boolean) as Waiting[]
  current = null
  queue.length = 0
  for (const w of stuck) {
    if (w.kind === 'line') w.done()
    else w.done(-1)
  }
  announce()
}
