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

/* ---- HOW LONG THE BOX STAYS AFTER A LINE IS ANSWERED ---------------------
 *
 * BRIEF-INTRO-FILM: *"the dialogue panel is glitchy"*. Measured on the Maw with
 * `scripts/box-steady.mjs`: the box MOUNTED TWICE for two consecutive lines
 * from the same speaker, so it vanished and re-rose between every sentence of
 * the film.
 *
 * The cause is in the bus and not here. `finish()` sets `current = null`,
 * announces (this component renders nothing), and only then resolves the
 * promise the island was waiting on; the island's next `say` lands a microtask
 * later. So there is one paint with an empty screen between any two lines, and
 * `cs-rise` replays on the far side of it.
 *
 * The box waits instead. If a new line arrives inside the grace it swaps its
 * text without ever unmounting, which is what makes five lines read as one box
 * being written in rather than five boxes arriving. If nothing arrives the box
 * goes as it always did, a fifth of a second later, which is under the time it
 * takes to look away from it. */
const HANDOVER_MS = 220

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

  /* ---- THE BOX THE STUDENT LOOKS AT, WHICH OUTLIVES THE BUS BY A MOMENT ----
   *
   * `held` is the line being DRAWN and `st` is the line the bus is waiting on.
   * They are the same thing except across the gap between two lines, where the
   * bus is empty for one paint and this keeps the last line on the glass so the
   * box does not blink out and rise again. See HANDOVER_MS. */
  const [held, setHeld] = useState<DialogueState>(st)
  useEffect(() => {
    if (st) { setHeld(st); return }
    const t = setTimeout(() => setHeld(null), HANDOVER_MS)
    return () => clearTimeout(t)
  }, [st])

  const text = held?.kind === 'line' ? held.line.text : held?.kind === 'ask' ? (held.ask.prompt ?? '') : ''

  /* ---- WHO IS SPEAKING, WHICH THE BUS FORGETS HALFWAY THROUGH --------------
   *
   * Ash: *"two box styles for one speaker"*. `DialogueAsk` carries a prompt and
   * a list of options and no speaker at all, so the principal asking a question
   * lost his name plate AND his face on the one line where a student most needs
   * to know who is asking. The box became a different picture mid-conversation.
   *
   * The speaker is remembered instead. A `choose` wears the plate and the
   * portrait of whoever spoke last, and a line from the same speaker that omits
   * its portrait keeps the one it had, so the column beside the words never
   * appears and disappears inside one conversation. A NEW speaker clears it,
   * because inheriting a face across speakers would put the wrong panther in
   * the frame. */
  const speaker = useRef<{ who?: string; portrait?: string }>({})
  if (held?.kind === 'line' && held.line.who) {
    if (speaker.current.who !== held.line.who) speaker.current = { who: held.line.who, portrait: held.line.portrait }
    else if (held.line.portrait) speaker.current.portrait = held.line.portrait
  }
  const who = held?.kind === 'line' ? held.line.who : speaker.current.who
  const portrait = held?.kind === 'line'
    ? (held.line.portrait ?? (held.line.who === speaker.current.who ? speaker.current.portrait : undefined))
    : speaker.current.portrait

  /* THE TYPEWRITER DOES NOT RUN WHILE NOBODY CAN SEE IT. A line that queued
   * behind a cutscene would otherwise finish typing in the dark and appear
   * whole, which is the one thing the typewriter exists to prevent.
   *
   * ---- AND IT DOES NOT START OVER, WHICH IT USED TO DO TWICE ---------------
   *
   * Ash: *"the typewriter restarting"*. Two ways in, both closed here. It was
   * keyed on the TEXT, so an island saying the same sentence twice in a row (a
   * "Try again." after a wrong answer, which is the commonest repeat in the
   * game) never re-typed at all and the second one appeared whole; and `csUp`
   * was a dependency of the reset rather than of the clock, so a cutscene
   * taking the floor mid-sentence rewound the line the student was reading. It
   * is keyed on the bus's own item now, which is a fresh object per line
   * whatever the words are, and handing the floor back RESUMES from the
   * character it stopped on. */
  const shownRef = useRef(0)
  shownRef.current = shown
  const itemRef = useRef<DialogueState>(null)
  useEffect(() => {
    const fresh = itemRef.current !== held
    itemRef.current = held
    const from = fresh ? 0 : Math.min(shownRef.current, text.length)
    if (fresh) setShown(0)
    if (!text || csUp) return
    const started = performance.now() - (from / CPS) * 1000
    let raf = 0
    /* MONOTONIC, WHICH IS THE THIRD WAY THE TYPEWRITER RESTARTED AND THE ONE A
     * STUDENT HITS MOST. A click on a half-typed line calls `advance`, which
     * fills the line in (`setShown(text.length)`), and the rAF loop is STILL
     * SCHEDULED, because it only stops itself once the clock has caught up. So
     * the very next frame wrote the clock's own smaller count back and the
     * sentence visibly shrank to where it had been. Mashing the box, which is
     * what a fourteen year old does, made the words go backwards on every
     * press. The count can only ever go up now. */
    const tick = () => {
      const n = Math.min(text.length, Math.floor(((performance.now() - started) / 1000) * CPS))
      setShown((prev) => (prev > n ? prev : n))
      if (n < text.length) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, csUp])

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
  useEffect(() => { veilAt.current = performance.now() }, [held, csUp])

  const done = shown >= text.length
  if (!held || csUp) return null

  /* a click completes the line first and advances second, so a fast reader is
   * never punished for clicking and a slow one never loses a line.
   *
   * It answers the LIVE item and not the drawn one, so a click landing in the
   * handover grace, when the box on screen is a line the bus has already
   * finished with, resolves nothing rather than resolving the next line early.
   * `finish()` guards that from its own side too; this is the near fence. */
  const advance = () => {
    if (!done) { setShown(text.length); return }
    if (st?.kind === 'line' && st === held) st.advance()
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
      line={{ who, text, shown, done, portrait }}
      options={held.kind === 'ask' ? held.ask.options : undefined}
      onAdvance={advance}
      onPick={(i) => { if (st?.kind === 'ask' && st === held) st.pick(i) }}
    />
  )

  if (!veiled) return <div className="dlg-veil dlg-veil-open">{box}</div>

  return <div className="dlg-veil" onClick={advanceFromVeil}>{box}</div>
}
