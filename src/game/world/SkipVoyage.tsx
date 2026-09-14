/* the one control a student has during a crossing: Esc, and be there */
import { useEffect, useState } from 'react'
import { cancelVoyage, onVoyage, skipVoyage, voyageSkipped, type VoyagePlan } from './travel'
import { announce } from '../ui/a11y'
import { track } from '../telemetry'
import './skip-voyage.css'

/* ---- ASH, 2026-09-08 item 3 ----------------------------------------------
 *
 * *"A small 'Esc: skip' sits top-left during the crossing; Esc lands him at the
 * destination dock."*
 *
 * TOP LEFT AND NOT TOP RIGHT, which is where the cutscene's own skip sits. They
 * are two different offers and a student should not have to work out which one
 * he is being made: the cutscene skip jumps to the end of a scene somebody wrote,
 * this one is "yes, I know how a boat works". They also never appear together.
 *
 * IT MOUNTS ON THE FIRST FRAME OF THE JOURNEY, not on the crossing leg alone: the
 * walk out of the room is part of the trip and is the longest bit of it inside
 * the Maw. Pressing it there lands him at the far dock exactly the same way.
 *
 * AND IT IS A BUTTON AS WELL AS A KEY. The Chromebook trackpad is the school's
 * input device and Escape is a key a fourteen-year-old may never have pressed on
 * purpose; the plaque says what the key does and is itself the control. */
export function SkipVoyage() {
  const [plan, setPlan] = useState<VoyagePlan | null>(null)
  const [gone, setGone] = useState(false)

  /* the plan changing is also the plan being called off, so the button un-greys
   * itself rather than staying on the word it ended on */
  useEffect(() => onVoyage((p) => { setPlan(p); setGone(p ? voyageSkipped() : false) }), [])

  useEffect(() => {
    if (!plan || gone) return
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return
      /* ON THE WAY DOWN, AND IT KEEPS THE KEY. The HUD pauses the game on
       * Escape, so without the capture and the stop a student who skipped a
       * crossing also got the pause veil over the arrival he had just asked
       * for. During a voyage this is the only thing Escape means. */
      e.preventDefault()
      e.stopPropagation()
      take()
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  })

  /* ---- ESCAPE MEANS TWO DIFFERENT THINGS AND THE LEG SAYS WHICH ----------
   *
   * ASH: *"IF ESC CLICKED DURING SAILING, THEN TRANSITION SCREEN AND IT SKIPS MOST
   * OF THE JOURNEY... IF ESC IS CLICKED BEFORE SAILING, THEN CUTSCENE GOES AWAY."*
   *
   * Before the boat moves he is being CARRIED somewhere he has not agreed to yet, so
   * Escape gives him back: the plan is dropped and he is left standing on the dock
   * with the bars down. After it moves he has agreed, and Escape is only about not
   * watching the rest of it, so it lands him at the far dock the short way.
   *
   * One control and not two, because they are the same key and a student pressing it
   * should not have to know which of them he is getting. The word on the plaque is
   * the only difference, and it is the true one. */
  const waiting = plan?.leg === 'to-dock' || plan?.leg === 'boarding'

  const take = () => {
    if (gone) return
    if (waiting) {
      setGone(true)
      track('voyage_called_off', { to: plan?.to ?? null, leg: plan?.leg ?? null })
      announce('Not going just yet. Press E at your ship to open the chart.')
      cancelVoyage()
      return
    }
    if (voyageSkipped()) return
    setGone(true)
    track('voyage_skipped', { to: plan?.to ?? null, leg: plan?.leg ?? null })
    announce('Skipping ahead. You will arrive at the dock.')
    skipVoyage()
  }

  /* AND IT IS NOT OFFERED ONCE SHE IS COMING IN. On the landing leg the far island
   * is already on screen and the crossing is over, so there is nothing left to skip
   * and the only thing a press can now do is destroy the arrival it was meant to
   * deliver. The key listener goes with the button, so no press can latch a flag
   * nobody is going to honour. */
  if (!plan || plan.leg === 'landing') return null
  return (
    <button type="button" className="sv-skip" onClick={take} disabled={gone}>
      {gone ? (waiting ? 'Staying' : 'Arriving') : waiting ? 'Esc: not just now' : 'Esc: skip ahead'}
    </button>
  )
}
