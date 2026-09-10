// how world code opens the vine's sit-down uis without importing react or a hud file

/* yearbook: a door to a year's own page that any island can send a student to */
/* wall: a door to what a student has earned, openable from any island */
/* ---- 'cords' NAMES A TAB, NOT A SECOND PANEL (Ash, 2026-09-09) -----------
 *
 * *"When she says 'ask about the cords?' and I click yes, it currently opens up
 * to the islands tab in the handbook, it should open to the cords tab."*
 *
 * `open("handbook")` always landed on Islands, so the one beat in the game whose
 * whole subject is the cords opened the page about islands. The Guide is one
 * panel with six tabs and an island had no way to say which. */
export type UiRequest = 'planner' | 'handbook' | 'cords' | 'chart' | 'settings' | 'advisory' | 'wardrobe' | 'yearbook' | 'wall' | 'tour'

const EVENT = 'blhs:open-ui'
const BEAT_EVENT = 'blhs:play-beat'

/* what goes on the wire: done is called once the panel that answered has closed */
export type UiOpen = { ui: UiRequest; done?: () => void }

/* the longest a caller may be left waiting on a panel */
export const OPEN_CEILING_MS = 600_000

/* how many things are listening, so open can tell a delivered event from a lost one */
let listening = 0
export const uiListenerCount = () => listening

export function requestUi(which: UiRequest, done?: () => void): boolean {
  window.dispatchEvent(new CustomEvent<UiOpen>(EVENT, { detail: { ui: which, done } }))
  return listening > 0
}

/* open a panel and come back when it is shut, or false when nothing is mounted */
export function requestUiAndWait(which: UiRequest): Promise<void> | false {
  let settle: (() => void) | null = null
  const p = new Promise<void>((r) => { settle = r })
  let ceiling = 0
  const done = () => {
    if (!settle) return
    const s = settle
    settle = null
    window.clearTimeout(ceiling)
    s()
  }
  if (!requestUi(which, done)) return false
  ceiling = window.setTimeout(() => {
    console.error(`[ui-bus] "${which}" was opened ${OPEN_CEILING_MS / 1000}s ago and nothing has `
      + 'said it closed, so whoever was waiting on it is being let go.')
    done()
  }, OPEN_CEILING_MS)
  return p
}

export function onUiRequest(fn: (which: UiRequest, done?: () => void) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<UiOpen>).detail
    fn(d.ui, d.done)
  }
  window.addEventListener(EVENT, h)
  listening++
  /* idempotent, because React runs a cleanup twice in strict mode and a count
   * that can go negative is a count that reports nothing is listening */
  let off = false
  return () => {
    if (off) return
    off = true
    listening--
    window.removeEventListener(EVENT, h)
  }
}

/* a scored activity and the grade coming back, or a refusal when nothing ran */
export type BeatRequest = {
  beat: string
  /* the AP Research control arm renders the same items as plain text plus a
   * standard check. Passed per call rather than read globally so a grape can
   * force it for a teaching moment (§2.12, content-constant by construction). */
  plain: boolean
  /** it ran. A number is a grade; null is the player closing it unfinished. */
  done: (grade: number | null) => void
  /* nothing ran at all, which is a refusal and not a null grade */
  refuse: (why: string) => void
}

export function requestBeat(beat: string, plain: boolean): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (g: number | null) => { if (!settled) { settled = true; resolve(g) } }
    const refuse = (why: string) => { if (!settled) { settled = true; reject(new Error(why)) } }
    const ev = new CustomEvent<BeatRequest>(BEAT_EVENT, {
      detail: { beat, plain, done, refuse }, cancelable: true,
    })
    const heard = window.dispatchEvent(ev)
    /* dispatchEvent answers true when no listener claimed it, so nobody heard it */
    if (heard) refuse(`nothing here can play "${beat}": this scene has no HUD mounted`)
  })
}

export function onBeatRequest(fn: (r: BeatRequest) => void): () => void {
  const h = (e: Event) => {
    e.preventDefault()          // "I have this" — see requestBeat above
    fn((e as CustomEvent<BeatRequest>).detail)
  }
  window.addEventListener(BEAT_EVENT, h)
  return () => window.removeEventListener(BEAT_EVENT, h)
}
