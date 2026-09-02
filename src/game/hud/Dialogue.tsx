/* THE STATION DIALOGUE BOX, which is now a CLOCK around the one box.
 *
 * What renders when a station yields `say` or `choose` outside a cutscene. It used
 * to draw its own version of the paper box: its own plaque, its own text node, its
 * own choices, its own advance rule and no portrait, borrowing the cutscene's CSS
 * classes and diverging in everything the classes did not cover. Ash ruled the two
 * collapse, so the picture is `DialogueBox` and what is left here is the part that
 * really is different: the clock.
 *
 * WHY THE CLOCK STAYS SEPARATE. The cutscene runtime ticks its typewriter off the
 * host scene's own ticker, so cutscene time and world time cannot drift. A station
 * has no scene clock to ride, so it runs on rAF. Both hand the box a character
 * count, so the difference stops at this file.
 *
 * AND WHO GOES FIRST, WHICH NOBODY DECIDED. `WorldHud` mounts this and
 * `WorldCutscene` side by side and neither knew the other existed, so a `say`
 * arriving while a cutscene was running drew TWO paper boxes on the same pixels,
 * one per driver, each with its own plaque and its own advance rule. There is one
 * arbiter now and it is this file: the cutscene has the floor while its overlay is
 * up, and the world's queue waits. That is the right way round because a cutscene
 * is a script that holds the controls for its whole length, and a station line is
 * something a student walked up to and can walk up to again.
 */
import { useEffect, useRef, useState } from 'react'
import { onDialogue, dialogueState, type DialogueState } from '../dialogue'
import { holdWorld } from '../world-bus'
import { liveRuntime, onRuntime } from '../cutscene/stage-bus'
import type { CutsceneRuntime } from '../cutscene/runtime'
import { panelDepth } from '../ui/a11y'
import { DialogueBox, ADVANCE_DEAD_MS } from './DialogueBox'
import './dialogue.css'

const CPS = 45   // characters a second; §11.1's reading-speed pacing

export function Dialogue() {
  const [st, setSt] = useState<DialogueState>(dialogueState)
  const [shown, setShown] = useState(0)
  const release = useRef<null | (() => void)>(null)

  useEffect(() => onDialogue(setSt), [])

  /* ---- IS A CUTSCENE HOLDING THE FLOOR ------------------------------------
   *
   * The runtime emits once per tick while a script is running, which is sixty
   * times a second, so this reads the flag and only writes state when the flag
   * has actually turned over. Without the ref this component re-rendered every
   * frame of every cutscene in the game to draw nothing. */
  const [csUp, setCsUp] = useState(() => liveRuntime()?.ui.active ?? false)
  const csUpRef = useRef(csUp)
  useEffect(() => {
    let offTicks: null | (() => void) = null
    const put = (v: boolean) => { if (v !== csUpRef.current) { csUpRef.current = v; setCsUp(v) } }
    const watch = (rt: CutsceneRuntime | null) => {
      offTicks?.(); offTicks = null
      if (!rt) { put(false); return }
      const read = () => put(rt.ui.active)
      read()
      offTicks = rt.subscribe(read)
    }
    const offBus = onRuntime(watch)
    watch(liveRuntime())
    return () => { offBus(); offTicks?.() }
  }, [])

  /* the world is held for as long as anything is on screen. Held here rather
   * than by the station body so a line that outlives its body (an error, a
   * torn-down scene) still cannot leave Thor walking under the box. It is held
   * even while the cutscene has the floor, because the line is still owed. */
  useEffect(() => {
    if (st && !release.current) release.current = holdWorld('dialogue')
    if (!st && release.current) { release.current(); release.current = null }
    return () => { release.current?.(); release.current = null }
  }, [st])

  const text = st?.kind === 'line' ? st.line.text : st?.kind === 'ask' ? (st.ask.prompt ?? '') : ''

  /* THE TYPEWRITER DOES NOT RUN WHILE NOBODY CAN SEE IT. A line that queued
   * behind a cutscene would otherwise finish typing in the dark and appear
   * whole, which is the one thing the typewriter exists to prevent. `csUp` is a
   * dependency, so the line starts over from nothing the moment the floor is
   * handed back. */
  useEffect(() => {
    setShown(0)
    if (!text || csUp) return
    const started = performance.now()
    let raf = 0
    const tick = () => {
      const n = Math.floor(((performance.now() - started) / 1000) * CPS)
      setShown(Math.min(text.length, n))
      if (n < text.length) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, csUp])

  /* THE VEIL GOES THROUGH THE BOX'S OWN GUARD, and this clock has to be declared
   * with the other hooks and not beside the handler that reads it.
   *
   * `.dlg-veil` is fixed and covers the screen, so a click anywhere outside the
   * box reached its handler directly and skipped `ADVANCE_DEAD_MS` entirely, which
   * is the exact behaviour the dead zone was added to stop: a student clicking
   * fast blows through station dialogue one line per click and never reads it. The
   * cutscene box was protected and the world box was not.
   *
   * It sits above the early return because React counts hooks per render and this
   * component returns null whenever nothing is being said. Declared below it, the
   * first line of dialogue in a session rendered two more hooks than the render
   * before it and React tore the whole tree down mid-sentence. */
  const veilAt = useRef(0)
  useEffect(() => { veilAt.current = performance.now() }, [text, csUp])

  const done = shown >= text.length
  if (!st || csUp) return null

  /* a click completes the line first and advances second, so a fast reader is
   * never punished for clicking and a slow one never loses a line */
  const advance = () => {
    if (!done) { setShown(text.length); return }
    if (st.kind === 'line') st.advance()
  }

  const advanceFromVeil = () => {
    if (performance.now() - veilAt.current <= ADVANCE_DEAD_MS) return
    advance()
  }

  /* ---- THE VEIL, AND WHEN THERE IS NOT ONE --------------------------------
   *
   * THE BUG: `.dlg-veil` was a fixed, full-screen, click-eating sheet at z-index
   * 80, which is ABOVE the pause sheet (74), the Handbook (75), the planner
   * (76), a beat (77) and the wardrobe (78). A station line arriving while any
   * of those was open made that panel unclickable, with nothing on screen to
   * explain why and nothing to close.
   *
   * The layer is the real fix and it is in the stylesheet: 72, over the world
   * and the HUD and under every panel. This is the second fence. While a panel
   * is open the conversation does not lay a sheet over the screen at all, so
   * even a stacking context nobody predicted cannot take a student's clicks
   * away from the thing they are looking at. The box itself still takes its own
   * clicks; only the sheet around it is dropped. */
  const veiled = panelDepth() === 0

  const box = (
    <DialogueBox
      line={{
        who: st.kind === 'line' ? st.line.who : undefined,
        text,
        shown,
        done,
        portrait: st.kind === 'line' ? st.line.portrait : undefined,
      }}
      options={st.kind === 'ask' ? st.ask.options : undefined}
      onAdvance={advance}
      onPick={(i) => { if (st.kind === 'ask') st.pick(i) }}
    />
  )

  if (!veiled) return <div className="dlg-veil dlg-veil-open">{box}</div>

  return <div className="dlg-veil" onClick={advanceFromVeil}>{box}</div>
}
