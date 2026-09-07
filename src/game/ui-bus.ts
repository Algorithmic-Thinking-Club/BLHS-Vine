// THE UI BUS — how world code (any lane's scene, POI, or cutscene) opens the vine's
// sit-down UIs without importing React or touching this lane's files. The Maw's chart
// table (anchor 'chart_table') calls requestUi('planner'); the outfitter calls
// requestUi('wardrobe'). The mounted HUD listens and opens the real thing.
// One window CustomEvent, no coupling, works from Pixi callbacks and cutscene steps alike.
//
// The companion buses: world-bus.ts carries the answer back (who owns the controls),
// and dialogue.ts carries say/choose. Together they are what an intent (src/vine/
// intents.ts) is performed with.

/* `yearbook` is the sixth and it arrived with the page itself. Without it the
 * only door to a year's page was a button inside the planner, so the chart table
 * could open the sheet a year is planned on and not the book that year produces,
 * and no island could ever send a student to look at their own. */
/* `wall` is the seventh, and BRIEF-YEAR-ONE needs it four times: the wall is the
 * payoff of beat 4 and the thing that fills in beats 5, 6, 7 and 8. It goes on
 * the bus rather than into one scene because an island has to be able to send a
 * student to look at what they have earned, which is the same argument the
 * yearbook's own entry above makes. */
export type UiRequest = 'planner' | 'handbook' | 'chart' | 'settings' | 'advisory' | 'wardrobe' | 'yearbook' | 'wall'

const EVENT = 'blhs:open-ui'
const BEAT_EVENT = 'blhs:play-beat'

/* WHAT GOES ON THE WIRE, now that a caller can wait. `done` is called once, when
 * the panel that answered this request has closed and nothing else is open, and
 * it is absent for every fire-and-forget caller, which is all of them but the
 * rail. */
export type UiOpen = { ui: UiRequest; done?: () => void }

/* THE LONGEST A CALLER MAY BE LEFT WAITING ON A PANEL. The same shape as the two
 * wait ceilings in the vocabulary and the movie's: a panel holds the controls, so
 * a student sitting in the wardrobe is not stuck, but a `done` that is never
 * called for some other reason would leave the island that asked parked for the
 * rest of the sitting and every station in the room dead with it. Ten minutes is
 * longer than an advisory period spends on any one panel. */
export const OPEN_CEILING_MS = 600_000

/* HOW MANY THINGS ARE LISTENING, which is the whole difference between "the panel
 * opened" and "the event went into the air". A CustomEvent with no listener is
 * indistinguishable from a delivered one at the dispatch site, so `open` answered
 * ok whether or not a HUD was mounted, and wave 4's split of `WorldHud` made the
 * unmounted case NORMAL: a run that has not set `introDone` has no Hud, which is
 * exactly the state an island composing the game's opening runs in. */
let listening = 0
export const uiListenerCount = () => listening

export function requestUi(which: UiRequest, done?: () => void): boolean {
  window.dispatchEvent(new CustomEvent<UiOpen>(EVENT, { detail: { ui: which, done } }))
  return listening > 0
}

/* OPEN IT AND COME BACK WHEN IT IS SHUT.
 *
 * `open` has always returned the instant the screen was up, which is right for a
 * station saying one line and opening the wardrobe, and useless for a rail: the
 * Maw's year one walks the student to the table, opens the pick screen, and the
 * next thing it has to do is walk him to the fire, which cannot happen while the
 * cards are still on the glass. Written here rather than as a poll in the
 * island's own Python for the reason `wait_for` exists: a member polling the save
 * in a loop is the failure this vocabulary was built to make unnecessary.
 *
 * Refuses the same way `requestUi` does, by answering false, when nothing is
 * mounted to hear it. */
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

/* A SCORED ACTIVITY, AND ITS RESULT COMING BACK.
 *
 * The other requests are fire and forget: the panel opens, the world waits, the
 * player closes it. A beat is different, because the thing that asked for it
 * wants the grade. A grape's `score = yield self.play(DebugRace)` is exactly
 * this call, so the promise is here from the first station rather than added
 * when the first island needs it.
 *
 * Resolves with the grade on the 0-4.0 scale, or null when the player closed the
 * beat without finishing it. REJECTS when nothing ran at all, which is a
 * different thing and used to be the same one.
 */
export type BeatRequest = {
  beat: string
  /* the AP Research control arm renders the same items as plain text plus a
   * standard check. Passed per call rather than read globally so a grape can
   * force it for a teaching moment (§2.12, content-constant by construction). */
  plain: boolean
  /** it ran. A number is a grade; null is the player closing it unfinished. */
  done: (grade: number | null) => void
  /* NOTHING RAN, AND THAT IS NOT A NULL GRADE.
   *
   * This resolved `null` three different ways: no HUD mounted, a beat id nobody
   * knows, and the player closing the panel. All three came back as
   * `{ok: true, value: null}`, so a TYPO IN A BEAT ID REPORTED SUCCESS. That is
   * exactly what intents.ts:253 was written to outlaw, and `play` was the last
   * word still doing it.
   *
   * A refusal rejects, `performIntent` turns the throw into `{ok:false}`, and
   * the python driver raises it at the member's own yield. */
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
    /* dispatchEvent returns false only when a listener called preventDefault,
     * which is how the HUD says "I have this", so `heard === true` means nobody
     * heard it. Nothing listening means nothing will ever answer, so it is
     * refused here rather than never. */
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
