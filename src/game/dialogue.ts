// a queue of spoken lines and questions for anything outside a cutscene, such as a station

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

// nothing speaks while an arrival card is up: the line waits its turn rather than being dropped
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
    /* an ask with no options answers -1 at once rather than waiting for a button nobody drew */
    if (!ask.options.length) { resolve(-1); return }
    queue.push({ kind: 'ask', ask, done: resolve })
    pump()
  })
}

/* the queue is woken when the arrival card leaves, rather than waiting for the next say */
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
