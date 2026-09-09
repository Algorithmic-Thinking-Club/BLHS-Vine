/* the fifteen seconds after the room is handed over, which is the whole tutorial */
import { useEffect, useRef, useState } from 'react'
import { announce } from '../ui/a11y'
import { track } from '../telemetry'
import './tour.css'

/* ---- ASH, 2026-09-08 item 7 ----------------------------------------------
 *
 * *"The intro's handover gets a tutorial: after the wide shot and the line, each
 * of the three plaques and the help button lights in turn with an animated
 * pointer and one line in a small panel beside it, under fifteen seconds in
 * total, with a Skip in the corner. Then the bar names the first pick."*
 *
 * WHAT WAS THERE INSTEAD, and why he played it as nothing: the film set three
 * flags nine hundred milliseconds apart, each of which faded one corner plaque
 * in, and the principal said a sentence with the words Map, Guide and My Year in
 * it. A student watching that sees three small signs appear in a corner he was
 * not looking at while somebody talks. Ash: *"just a few dialogues saying 'Map,
 * Guide, My year' that a freshman wont even connect."* He is right, and the
 * missing half was never the words: it was that nothing on the screen POINTED.
 *
 * SO IT POINTS. One control at a time, everything else dimmed, a mark bobbing at
 * it, and one short sentence beside it saying what it is FOR rather than what it
 * is called. Four of them at three and a half seconds is fourteen seconds, and
 * there is a Skip.
 *
 * IT MEASURES THE REAL BUTTONS. The plaques are laid out by the HUD's own CSS at
 * whatever the window is, and a tutorial drawing its own copy of them would be a
 * second layout to keep in step. It reads `[data-tour]` off the live DOM every
 * frame of a step, so a resize mid-tour moves the ring with the sign. */

type Step = { tour: string; line: string }

const STEPS: Step[] = [
  { tour: 'my-year', line: 'This is your year. Everything you picked is in here, and this is where you go and do it.' },
  { tour: 'map', line: 'This is the sea. Every island somebody has built is on it, and this is how you sail there.' },
  { tour: 'guide', line: 'This is the school. Every club, sport and class at Bonney Lake, and what you have earned.' },
  { tour: 'help', line: 'And this stays here the whole time. Press it whenever you are not sure what to do.' },
]

/** how long one control is lit, so four of them come in under fifteen seconds */
export const STEP_MS = 3400

export function Tour({ onDone }: { onDone: () => void }) {
  const [at, setAt] = useState(0)
  const [box, setBox] = useState<DOMRect | null>(null)
  const done = useRef(false)

  const finish = (why: 'watched' | 'skipped') => {
    if (done.current) return
    done.current = true
    track('tour_finished', { why, at })
    onDone()
  }

  /* the step clock. One timer per step rather than one for the whole run, so a
   * step whose control is missing still moves the tour along. */
  useEffect(() => {
    if (at >= STEPS.length) { finish('watched'); return }
    announce(STEPS[at].line)
    const t = window.setTimeout(() => setAt((v) => v + 1), STEP_MS)
    return () => window.clearTimeout(t)
  }, [at])

  /* where the thing being pointed at is, measured every frame of the step */
  useEffect(() => {
    if (at >= STEPS.length) return
    let live = true
    const read = () => {
      if (!live) return
      const el = document.querySelector(`[data-tour="${STEPS[at].tour}"]`)
      setBox(el ? el.getBoundingClientRect() : null)
      requestAnimationFrame(read)
    }
    read()
    return () => { live = false }
  }, [at])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish('skipped') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  if (at >= STEPS.length) return null
  const step = STEPS[at]

  /* the panel goes on whichever side of the control has room for it: the right of
   * the left-hand stack, the left of the right-hand help mark */
  const onLeft = !!box && box.left > window.innerWidth / 2
  const style = box
    ? {
      left: onLeft ? undefined : `${Math.round(box.right + 18)}px`,
      right: onLeft ? `${Math.round(window.innerWidth - box.left + 18)}px` : undefined,
      top: `${Math.round(Math.max(12, box.top + box.height / 2 - 40))}px`,
    }
    : { left: '50%', top: '42%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="tr-tour" role="dialog" aria-label="How this screen works">
      {/* the dim, which everything but the one lit control stands behind */}
      <div className="tr-dim" aria-hidden="true" />
      {box && (
        <div
          className="tr-ring"
          aria-hidden="true"
          style={{
            left: `${Math.round(box.left - 8)}px`,
            top: `${Math.round(box.top - 8)}px`,
            width: `${Math.round(box.width + 16)}px`,
            height: `${Math.round(box.height + 16)}px`,
          }}
        />
      )}
      {box && (
        <span
          className={`tr-hand${onLeft ? ' tr-hand-left' : ''}`}
          aria-hidden="true"
          style={{
            left: onLeft ? undefined : `${Math.round(box.right + 4)}px`,
            right: onLeft ? `${Math.round(window.innerWidth - box.left + 4)}px` : undefined,
            top: `${Math.round(box.top + box.height / 2 - 11)}px`,
          }}
        >
          {onLeft ? '▶' : '◀'}
        </span>
      )}
      <div className="tr-say" style={style}>
        <p className="tr-line">{step.line}</p>
        <span className="tr-count">{at + 1} of {STEPS.length}</span>
      </div>
      <button type="button" className="tr-skip" onClick={() => finish('skipped')}>Skip</button>
    </div>
  )
}
