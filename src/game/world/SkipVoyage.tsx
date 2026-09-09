/* the one control a student has during a crossing: Esc, and be there */
import { useEffect, useState } from 'react'
import { onVoyage, skipVoyage, voyageSkipped, type VoyagePlan } from './travel'
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

  useEffect(() => onVoyage((p) => { setPlan(p); setGone(voyageSkipped()) }), [])

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

  const take = () => {
    if (voyageSkipped()) return
    setGone(true)
    track('voyage_skipped', { to: plan?.to ?? null, leg: plan?.leg ?? null })
    announce('Skipping ahead. You will arrive at the dock.')
    skipVoyage()
  }

  if (!plan) return null
  return (
    <button type="button" className="sv-skip" onClick={take} disabled={gone}>
      {gone ? 'Arriving' : 'Esc: skip'}
    </button>
  )
}
