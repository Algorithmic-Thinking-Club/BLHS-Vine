/* the fifteen seconds after the room is handed over, which is the whole tutorial */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { announce } from '../ui/a11y'
import { track } from '../telemetry'
import './tour.css'

/* one control at a time with everything else dimmed and a mark bobbing at it, because plaques fading in while somebody talks point at nothing, and it reads `[data-tour]` off the live DOM every frame so a resize mid-tour moves the ring with the sign and there is no second copy of the HUD layout */

export type Step = { tour: string; line: string }

/* the corner, taught once at the handover */
export const HANDOVER_STEPS: Step[] = [
  { tour: 'my-year', line: 'This is your year. Everything you picked is in here, and this is where you go and do it.' },
  { tour: 'map', line: 'This is the sea. Every island somebody has built is on it, and this is how you sail there.' },
  { tour: 'guide', line: 'This is the school. Every club, sport and class at Bonney Lake, and what you have earned.' },
  /* the chart and the camera switch were added after this list was written and were never pointed at, and the chart is how a student reaches an island while the camera switch is the only control over how the game looks */
  { tour: 'chart', line: 'The chart on its own. Where you are, where your boat is, and every island you can sail to.' },
  { tour: 'camera-view', line: 'And this changes how close the camera sits. Wide to see the island, close to see yourself.' },
  { tour: 'help', line: 'And this stays here the whole time. Press it whenever you are not sure what to do.' },
]

/* it waits for a press instead of running a clock, because a card that flips itself loses a freshman mid-sentence, and four presses is still under fifteen seconds for anybody following it */

/* year one does not get this because the founding film walks a student to the table and the sheet is filled in with somebody standing over it, and year two is the first time it opens with nobody explaining it */
export const SHEET_STEPS: Step[] = [
  { tour: 'pick-class', line: 'Start here. Two classes, and they are what you study all year.' },
  { tour: 'stamp', line: 'Then stamp the sheet. That locks the year in and the year starts.' },
]

export function Tour({ steps = HANDOVER_STEPS, onDone }: { steps?: Step[]; onDone: () => void }) {
  const [at, setAt] = useState(0)
  const [box, setBox] = useState<DOMRect | null>(null)
  const done = useRef(false)

  const finish = (why: 'watched' | 'skipped') => {
    if (done.current) return
    done.current = true
    track('tour_finished', { why, at })
    onDone()
  }

  /* every step is read out when it arrives, and then it waits */
  useEffect(() => {
    if (at >= steps.length) { finish('watched'); return }
    announce(steps[at].line)
  }, [at])

  /** the one move: on to the next control, or out of the way after the last */
  const next = () => setAt((v) => v + 1)

  /* where the thing being pointed at is, measured every frame of the step */
  useEffect(() => {
    if (at >= steps.length) return
    let live = true
    const read = () => {
      if (!live) return
      const el = document.querySelector(`[data-tour="${steps[at].tour}"]`)
      setBox(el ? el.getBoundingClientRect() : null)
      requestAnimationFrame(read)
    }
    read()
    return () => { live = false }
  }, [at])

  /* enter and space go on, escape goes away */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'Escape') { e.preventDefault(); finish('skipped'); return }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  if (at >= steps.length) return null
  const step = steps[at]

  /* the room on each side decides the side, not where the target sits: a seven hundred pixel wide plank just left of centre left the panel a hundred pixels and one word a line, so the panel is capped at the room that is really there */
  const SAY_W = 260
  const roomLeft = box ? box.left : 0
  const roomRight = box ? window.innerWidth - box.right : 0
  const onLeft = !!box && roomLeft > roomRight
  /* and when neither side has room it sits under the target instead, which is the case for a control that spans most of the window */
  const room = Math.max(roomLeft, roomRight) - 24
  const beside = !!box && room >= 190
  const style = !box
    ? { left: '50%', top: '42%', transform: 'translate(-50%, -50%)' }
    : beside
      ? {
        width: `${Math.round(Math.min(SAY_W, room))}px`,
        left: onLeft ? undefined : `${Math.round(box.right + 18)}px`,
        right: onLeft ? `${Math.round(window.innerWidth - box.left + 18)}px` : undefined,
        top: `${Math.round(Math.max(12, box.top + box.height / 2 - 40))}px`,
      }
      : {
        width: `${Math.round(Math.min(SAY_W * 1.6, window.innerWidth - 40))}px`,
        left: `${Math.round(Math.max(20, Math.min(
          window.innerWidth - 20 - Math.min(SAY_W * 1.6, window.innerWidth - 40),
          box.left + box.width / 2 - Math.min(SAY_W * 1.6, window.innerWidth - 40) / 2,
        )))}px`,
        /* below it when there is room below, above it when there is not */
        top: window.innerHeight - box.bottom > 150
          ? `${Math.round(box.bottom + 18)}px`
          : `${Math.round(Math.max(12, box.top - 150))}px`,
      }

  const last = at === steps.length - 1

  /* `position: fixed` is fixed to the viewport only while no ancestor carries a transform, a filter or a backdrop-filter, and inside the year sheet the ring came out the right size, 763 by 50, offset 110px right and 78px down, so it portals to the body rather than every panel being audited for one */
  return createPortal((
    <div className="tr-tour" role="dialog" aria-label="How this screen works">
      {/* the whole veil is the button, so a student clicks the screen to go on rather than hunting a control, and the ring stays the thing being talked about */}
      <button
        type="button"
        className="tr-veil"
        aria-label={last ? 'Finish' : 'Next'}
        onClick={next}
      />
      {/* the dim is four rectangles around the target rather than one sheet with the ring drawn on top, so the thing being pointed at keeps full brightness with no mask and no clip-path, and with no target they collapse to one full-screen dim */}
      {box ? (
        <>
          <div className="tr-dim" aria-hidden="true" style={{ inset: `0 0 auto 0`, height: `${Math.max(0, box.top - 6)}px` }} />
          <div className="tr-dim" aria-hidden="true" style={{ inset: `${box.bottom + 6}px 0 0 0` }} />
          <div className="tr-dim" aria-hidden="true" style={{ top: `${Math.max(0, box.top - 6)}px`, height: `${box.height + 12}px`, left: 0, width: `${Math.max(0, box.left - 6)}px` }} />
          <div className="tr-dim" aria-hidden="true" style={{ top: `${Math.max(0, box.top - 6)}px`, height: `${box.height + 12}px`, left: `${box.right + 6}px`, right: 0 }} />
        </>
      ) : (
        <div className="tr-dim" aria-hidden="true" />
      )}
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
          className={`tr-hand${onLeft && beside ? ' tr-hand-left' : ''}`}
          aria-hidden="true"
          style={beside ? {
            left: onLeft ? undefined : `${Math.round(box.right + 4)}px`,
            right: onLeft ? `${Math.round(window.innerWidth - box.left + 4)}px` : undefined,
            top: `${Math.round(box.top + box.height / 2 - 11)}px`,
          } : {
            /* the panel is under the target, so the pointer is too, and it points up */
            left: `${Math.round(box.left + box.width / 2 - 9)}px`,
            top: `${Math.round(box.bottom + 2)}px`,
          }}
        >
          {beside ? (onLeft ? '▶' : '◀') : '▲'}
        </span>
      )}
      <div className="tr-say" style={style}>
        <p className="tr-line">{step.line}</p>
        <span className="tr-foot">
          <span className="tr-count">{at + 1} of {steps.length}</span>
          <button type="button" className="tr-next" onClick={next}>
            {last ? 'Got it' : 'Next'}
          </button>
        </span>
      </div>
      <button type="button" className="tr-skip" onClick={() => finish('skipped')}>Skip</button>
    </div>
  ), document.body)
}
