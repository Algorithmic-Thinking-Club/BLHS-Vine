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
export type UiRequest = 'planner' | 'handbook' | 'chart' | 'settings' | 'advisory' | 'wardrobe' | 'yearbook'

const EVENT = 'blhs:open-ui'
const BEAT_EVENT = 'blhs:play-beat'

export function requestUi(which: UiRequest) {
  window.dispatchEvent(new CustomEvent<UiRequest>(EVENT, { detail: which }))
}

export function onUiRequest(fn: (which: UiRequest) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<UiRequest>).detail)
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
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
