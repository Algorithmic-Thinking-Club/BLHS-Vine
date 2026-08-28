/* THE STATION DIALOGUE BOX.
 *
 * What renders when a station yields `say` or `choose` outside a cutscene. It
 * borrows the cutscene overlay's own classes (.cs-dialogue, .cs-nameplaque,
 * .cs-dialogue-text) rather than inventing a second look, because a line from
 * the counselor and a line from a cutscene are the same act to a player and the
 * game should have one voice. When the §11 UI batch lands, both move together.
 *
 * The typewriter is here for law 4 (a static frame is a bug) and because §11.1
 * asks for per-character pacing. Clicking mid-line completes it rather than
 * advancing, which is the behaviour every RPG has trained players to expect.
 */
import { useEffect, useRef, useState } from 'react'
import { onDialogue, dialogueState, type DialogueState } from '../dialogue'
import { holdWorld } from '../world-bus'
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

  const done = shown >= text.length
  if (!st) return null

  /* a click completes the line first and advances second, so a fast reader is
   * never punished for clicking and a slow one never loses a line */
  const onBox = () => {
    if (!done) { setShown(text.length); return }
    if (st.kind === 'line') st.advance()
  }

  const who = st.kind === 'line' ? st.line.who : undefined

  return (
    <div className="dlg-veil" onClick={onBox}>
      {/* the choices sit ABOVE the box rather than inside it: .cs-dialogue is a
          fixed-height paper window measured off the art, and growing it to fit
          three buttons would stretch the picture. §11.1 wants them fanned like
          held cards anyway, which is a thing you do beside a box, not in one. */}
      {st.kind === 'ask' && done && (
        <div className="dlg-choices" onClick={(e) => e.stopPropagation()}>
          {st.ask.options.map((o, i) => (
            <button key={o + i} className="dlg-choice" onClick={() => st.pick(i)}>{o}</button>
          ))}
        </div>
      )}

      <div className="cs-dialogue dlg-box" onClick={(e) => { e.stopPropagation(); onBox() }}>
        {who && <div className="cs-nameplaque">{who}</div>}
        <div className="cs-dialogue-text">
          {text.slice(0, shown)}
          {!done && <span className="dlg-caret" />}
        </div>
        {st.kind === 'line' && done && <div className="cs-continue-hint">click</div>}
      </div>
    </div>
  )
}
