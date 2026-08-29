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
 */
import { useEffect, useRef, useState } from 'react'
import { onDialogue, dialogueState, type DialogueState } from '../dialogue'
import { holdWorld } from '../world-bus'
import { DialogueBox, ADVANCE_DEAD_MS } from './DialogueBox'
import './dialogue.css'

const CPS = 45   // characters a second; §11.1's reading-speed pacing

export function Dialogue() {
  const [st, setSt] = useState<DialogueState>(dialogueState)
  const [shown, setShown] = useState(0)
  const release = useRef<null | (() => void)>(null)

  useEffect(() => onDialogue(setSt), [])

  /* the world is held for as long as anything is on screen. Held here rather
   * than by the station body so a line that outlives its body (an error, a
   * torn-down scene) still cannot leave Thor walking under the box. */
  useEffect(() => {
    if (st && !release.current) release.current = holdWorld('dialogue')
    if (!st && release.current) { release.current(); release.current = null }
    return () => { release.current?.(); release.current = null }
  }, [st])

  const text = st?.kind === 'line' ? st.line.text : st?.kind === 'ask' ? (st.ask.prompt ?? '') : ''

  useEffect(() => {
    setShown(0)
    if (!text) return
    const started = performance.now()
    let raf = 0
    const tick = () => {
      const n = Math.floor(((performance.now() - started) / 1000) * CPS)
      setShown(Math.min(text.length, n))
      if (n < text.length) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text])

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
  useEffect(() => { veilAt.current = performance.now() }, [text])

  const done = shown >= text.length
  if (!st) return null

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

  return (
    <div className="dlg-veil" onClick={advanceFromVeil}>
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
    </div>
  )
}
