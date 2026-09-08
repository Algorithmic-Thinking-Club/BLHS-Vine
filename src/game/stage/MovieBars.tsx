/* THE TWO BLACK BARS. BRIEF-ARRIVAL item 1.
 *
 * The cutscene runtime already draws a letterbox, and it can only be raised by
 * running a whole authored `Script` through `CutsceneRuntime.play`, which also
 * takes the controls, starts a step machine and mounts a skip plaque. The
 * crossing is not a script: the thing moving the ship is `route(who="ship")`,
 * a word the island already has, and what it needs is a FRAME around it. So
 * these bars are their own component reading their own switch, and they use the
 * same depth and the same colour the runtime's do, because a student should not
 * be able to tell which of the two is on screen.
 *
 * Below the cutscene overlay (72) on purpose, because a real cutscene draws over
 * the movie frame. ABOVE the transition cover (90) since 2026-09-06, because Ash
 * asked for the tunnel door inside the introduction to keep its frame: "the bars
 * stay up; the cover plays between them." The reasoning is in cinema.css.
 */
import { useEffect, useState } from 'react'
import { onCinema } from './cinema'
import { prefersReducedMotion } from '../ui/motion'
import './cinema.css'

export function MovieBars() {
  const [on, setOn] = useState(false)
  /* mounted from the moment the bars come down until the animation has finished
   * running out, so the frame opens rather than vanishing */
  const [shown, setShown] = useState(false)

  useEffect(() => onCinema(setOn), [])

  useEffect(() => {
    if (on) { setShown(true); return }
    if (!shown) return
    const ms = prefersReducedMotion() ? 60 : 450
    const t = window.setTimeout(() => setShown(false), ms)
    return () => window.clearTimeout(t)
  }, [on, shown])

  if (!shown) return null
  return (
    <div className="cin-root" data-on={on ? '1' : '0'} aria-hidden>
      <div className="cin-bar cin-top" />
      <div className="cin-bar cin-bottom" />
    </div>
  )
}
