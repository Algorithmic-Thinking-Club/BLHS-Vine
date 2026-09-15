/* the one control a student has during a crossing: Esc, and be there */
import { useEffect, useState } from 'react'
import { cancelVoyage, onVoyage, skipVoyage, voyageSkipped, type VoyagePlan } from './travel'
import { announce } from '../ui/a11y'
import { track } from '../telemetry'
import './skip-voyage.css'

/* the skip sits top left and not top right where the cutscene's own skip sits, because they are two different offers and never appear together; it mounts on the first frame of the journey rather than the crossing leg alone, and it is a button as well as an Escape key because the trackpad is the school's input device */
export function SkipVoyage() {
  const [plan, setPlan] = useState<VoyagePlan | null>(null)
  const [gone, setGone] = useState(false)

  /* the plan changing is also the plan being called off, so the button un-greys itself rather than staying on the word it ended on */
  useEffect(() => onVoyage((p) => { setPlan(p); setGone(p ? voyageSkipped() : false) }), [])

  useEffect(() => {
    /* the key goes where the button goes: hooks run before an early return, so a listener left installed over the landing leg let Escape latch the skip invisibly and delete the arrival it was meant to deliver, and a control that is not being offered must not be listening */
    if (!plan || gone || plan.leg === 'landing') return
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return
      /* on the way down and it keeps the key: the HUD pauses the game on Escape, so without the capture and the stop a skipped crossing also got the pause veil over the arrival, and during a voyage this is the only thing Escape means */
      e.preventDefault()
      e.stopPropagation()
      take()
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  })

  /* the leg says which of two things Escape means: before the boat moves it drops the plan and leaves the player on the dock with the bars down, after it moves it lands at the far dock the short way, and it stays one control because the word on the plaque is the only difference */
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

  /* not offered once the hull is coming in: on the landing leg the crossing is over, so a press could only destroy the arrival it was meant to deliver, and the key listener goes with the button so no press latches a flag nobody will honour */
  if (!plan || plan.leg === 'landing') return null
  return (
    <button type="button" className="sv-skip" onClick={take} disabled={gone}>
      {gone ? (waiting ? 'Staying' : 'Arriving') : waiting ? 'Esc: not just now' : 'Esc: skip ahead'}
    </button>
  )
}
