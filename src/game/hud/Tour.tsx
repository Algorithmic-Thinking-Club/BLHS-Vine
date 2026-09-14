/* the fifteen seconds after the room is handed over, which is the whole tutorial */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

export type Step = { tour: string; line: string }

/* the corner, taught once at the handover */
export const HANDOVER_STEPS: Step[] = [
  { tour: 'my-year', line: 'This is your year. Everything you picked is in here, and this is where you go and do it.' },
  { tour: 'map', line: 'This is the sea. Every island somebody has built is on it, and this is how you sail there.' },
  { tour: 'guide', line: 'This is the school. Every club, sport and class at Bonney Lake, and what you have earned.' },
  /* ---- THE TWO CONTROLS THE TOUR NEVER NAMED ---------------------------
   *
   * ASH: *"the button cutscene also needs to add the chart button + the close / wide
   * button at the top."* Both arrived after this list was written and neither was ever
   * pointed at, so the only way to find them was to press them and see. The chart is
   * how a student reaches an island and the camera switch is the one control over how
   * the game looks; a tutorial that skips them is teaching half the corner. */
  { tour: 'chart', line: 'The chart on its own. Where you are, where your boat is, and every island you can sail to.' },
  { tour: 'camera-view', line: 'And this changes how close the camera sits. Wide to see the island, close to see yourself.' },
  { tour: 'help', line: 'And this stays here the whole time. Press it whenever you are not sure what to do.' },
]

/* ---- IT WAITS FOR HIM (Ash, 2026-09-09) ----------------------------------
 *
 * *"It is much better and I like it. However, it automatically flips through the
 * cards, just make it so that the user has to click to move past the button
 * tutorial."*
 *
 * The clock was there to hold the whole thing under fifteen seconds, which was
 * his own number, and it bought that at the cost of the one thing a tutorial
 * needs: the reader setting the pace. A freshman who is still working out what
 * "My Year" means loses the card mid-sentence. Four presses is still under
 * fifteen seconds for anybody who is following it, and it is as long as it needs
 * to be for anybody who is not. */

/* ---- AND THE YEAR SHEET, TAUGHT ONCE IN YEAR TWO (Ash, 2026-09-09) --------
 *
 * *"In the second year, when the student first opens their year sheet, there
 * should be a quick mini-tutorial. Remove the old panel for the stamp sheet that
 * you just put in, and replace it with this tutorial. It should be like the
 * button tutorial. First highlighting the 'pick a class' while rest of screen
 * goes darker."*
 *
 * YEAR ONE DOES NOT GET THIS, and does not need it: the founding film walks a
 * student to the table and the principal stands over it while he fills it in.
 * Year two is the first time the sheet opens with nobody explaining it. */
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

  /* ENTER AND SPACE GO ON, ESCAPE GOES AWAY. They all used to skip the lot,
   * which is what a keyboard reader would hit trying to read the next card. */
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

  /* ---- THE PANEL GOES WHERE THERE IS ROOM (Ash, 2026-09-09) -------------
   *
   * It used to pick a side from where the TARGET sat: right of anything in the
   * left half, left of anything in the right half. That works for a corner
   * plaque, which is small. The year sheet's "pick a class" plank is seven
   * hundred pixels wide and starts just left of centre, so the panel went right
   * and had a hundred pixels to live in: one word a line, six lines deep.
   *
   * The room on each side is the thing that decides now, and the panel is capped
   * at whatever is really there so it can never be squeezed to a column. */
  const SAY_W = 260
  const roomLeft = box ? box.left : 0
  const roomRight = box ? window.innerWidth - box.right : 0
  const onLeft = !!box && roomLeft > roomRight
  /* and when NEITHER side has room, it sits under the target instead, which is
   * the case for a control that spans most of the window */
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

  /* ---- IT HANGS OFF THE BODY (Ash, 2026-09-09) --------------------------
   *
   * `position: fixed` is only fixed to the VIEWPORT while no ancestor carries a
   * transform, a filter or a backdrop-filter; under one it is fixed to that
   * ancestor instead. The corner tutorial mounts beside the HUD and never met
   * one. The year sheet's tutorial mounts inside the sheet, which does, and the
   * ring came out the right SIZE in the wrong PLACE: 763 by 50 exactly, offset a
   * hundred and ten pixels right and seventy-eight down. Measured 2026-09-09.
   *
   * A portal is the fix rather than hunting the transform, because any panel
   * that ever wants to teach itself would have to be audited for one otherwise. */
  return createPortal((
    <div className="tr-tour" role="dialog" aria-label="How this screen works">
      {/* THE WHOLE VEIL IS THE BUTTON, which is how every other card in this game
          reads: a student clicks the screen to go on rather than hunting a
          control. The card carries the words for it, and the ring is still the
          thing being talked about. */}
      <button
        type="button"
        className="tr-veil"
        aria-label={last ? 'Finish' : 'Next'}
        onClick={next}
      />
      {/* ---- THE DIM IS A HOLE, NOT A SHEET (Ash, 2026-09-09) ------------
          *
          * *"First highlighting the 'pick a class' while rest of screen goes
          * darker."* It used to be one rectangle over everything, with the ring
          * drawn on top: fine for a corner plaque, which is bright and sits on
          * its own, and wrong for a control inside a panel, where the thing
          * being pointed at ends up as dim as everything else.
          *
          * Four rectangles around the target leave it at full brightness with no
          * mask, no clip-path and nothing to go wrong on a Chromebook's
          * compositor. With no target they collapse to one full-screen dim,
          * which is what a missing control should look like. */}
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
