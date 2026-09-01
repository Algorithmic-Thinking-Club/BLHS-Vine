/* THE PLACE CARD: what a map says its name is, once, on arrival.
 *
 * §80.4's own five conditions, in order, and each is a line of code below:
 * fired on map entry, once per session per map, dismissing itself, NEVER taking
 * input, and never showing a slug. The fourth is the one that is easy to get
 * wrong and expensive when you do: a card that takes a click is a card a student
 * has to dismiss, and a student who has to dismiss something has been
 * interrupted. This one cannot be clicked, cannot be focused, and cannot hold a
 * control, so a player walking off the boat keeps walking while it fades.
 *
 * ONE SHOWN-ALREADY SET, shared with the cover choice in `covers.ts`, expiring on
 * a real clock. Two sets is how a card fires on a map whose cover was skipped.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { nextObjective } from '../run/objective'
import { loadSave } from '../save'
import { onPlaceCard, setPlaceCardUp, type PlaceCardRequest } from './stage-bus'
import { transitionBusy } from '../../app/transitions'
import { panelDepth } from '../ui/a11y'
import { bandFromRects, setUiBandStacked } from '../ui/frame'
import { prefersReducedMotion } from '../ui/motion'
import './placecard.css'

const DWELL_MS = 3200

export function PlaceCard() {
  const [card, setCard] = useState<PlaceCardRequest | null>(null)
  const [leaving, setLeaving] = useState(false)
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => onPlaceCard((c) => { setCard(c); setLeaving(false) }), [])

  /* THE CARD IS ALONG THE BOTTOM OF THE WINDOW TOO, so it says how tall it is and
   * the camera lifts the picture clear of it, the same way it does for a line and
   * for the year's card (src/game/ui/frame.ts). Moving the card above the
   * dialogue box was only half the job: it then landed on the player instead, and
   * the fresh-eyes round caught the marker sliced by the card's own top edge on
   * the very shot taken to prove the fix. */
  useLayoutEffect(() => {
    if (!card) { setUiBandStacked('placecard', 0); return }
    const measure = () => setUiBandStacked('placecard', bandFromRects([el.current]))
    measure()
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure); setUiBandStacked('placecard', 0) }
  }, [card, leaving])

  /* AND THE YEAR WAITS ITS TURN. An arrival is what starts a year, so the year's
   * opening line and this card fired on the same instant and shared the bottom of
   * the window with the body behind both of them. `Hud` reads this. */
  useEffect(() => {
    setPlaceCardUp(!!card)
    return () => setPlaceCardUp(false)
  }, [card])

  useEffect(() => {
    if (!card) return
    /* REDUCED MOTION SHORTENS IT RATHER THAN CANCELLING IT. §80.5's own rule is
     * that a control reporting a state it does not deliver is worse than no
     * control, and the same is true in reverse: dropping the card entirely takes
     * away the only place a student is told where they are. */
    const dwell = prefersReducedMotion() ? DWELL_MS * 0.6 : DWELL_MS
    /* THE CLOCK STARTS WHEN THE CARD CAN BE SEEN, NOT WHEN IT IS ASKED FOR.
     *
     * A door swap fires this from under a full-screen cover: `PmapScene` names
     * the map the instant the bundle is up, and the cover is still on screen for
     * seconds after that. So most of a 3.2 second dwell was spent behind an
     * opaque rectangle and the card was already leaving when the player could
     * first look at it. Measured on the Maw: gone 1.4s after the cover lifted.
     * That is what "6-placecard shows no card" was telling us. */
    let a = 0, b = 0
    const begin = () => {
      a = window.setTimeout(() => setLeaving(true), dwell)
      b = window.setTimeout(() => setCard(null), dwell + 700)
    }
    let held = 0
    if (transitionBusy()) held = window.setInterval(() => {
      if (transitionBusy()) return
      window.clearInterval(held); held = 0; begin()
    }, 100)
    else begin()
    /* AND IT GETS OUT OF THE WAY OF A PANEL OPENED WHILE IT IS UP. A panel does
     * not re-render this component, so the check at the top of the render only
     * catches a card that arrives second. A student who opens the chart in the
     * four seconds after arriving is the case that actually happens, and it had a
     * name plaque across the bottom of the page with no way to move it. */
    const watch = window.setInterval(() => { if (panelDepth() > 0) setCard(null) }, 200)
    return () => {
      window.clearTimeout(a); window.clearTimeout(b)
      window.clearInterval(watch)
      if (held) window.clearInterval(held)
    }
  }, [card])

  /* A CARD DOES NOT TALK OVER A PANEL. It is the one surface in the game with no
   * dismiss, so a student who opened the chart in the four seconds after arriving
   * had a name plaque across the bottom of it and no way to move it. The panel
   * stack already knows whether anything owns the frame (`src/game/ui/a11y.ts`),
   * and the card is an announcement rather than a queue: it is dropped rather
   * than deferred, because a card that arrives after the panel closes is a card
   * about somewhere the student stopped being. */
  if (!card || panelDepth() > 0) return null
  /* the one live thing the year wants next, read at the moment of arrival. Pure,
   * so it is a function call rather than a fetch, and it is the same function the
   * standalone heading and the world's own marker both read. */
  const heading = nextObjective(loadSave())?.say ?? ''

  return (
    /* aria-hidden AND pointer-events none: it is not a control and it is not a
     * thing a screen reader should interrupt a walk to announce, because the
     * same words arrive as a live region from the world's own arrival event */
    <div ref={el} className={`pc-root ${leaving ? 'pc-out' : 'pc-in'}`} aria-hidden="true">
      <div className="pc-card">
        <div className="pc-name">{card.title}</div>
        {card.line ? <div className="pc-line">{card.line}</div> : null}
        {/* ---- AND WHAT YOU ARE FOR, ON THE SAME CARD --------------------
            ONE CARD, ONE READ. This was two cards in the same corner one after
            the other: where you ARE, then four and a half seconds later what you
            are FOR. Measured cold with scripts/ten-seconds.mjs, that put the
            sentence answering "what do I do next" at 10.9 seconds on a slow load,
            which fails the brief's own ten-second test on the machine it is
            actually deployed to.

            The two lines are one thought. "The Hub" and "Someone is waiting for
            you inside the mountain." belong together, and reading them together
            costs one dwell instead of two. The standalone card in hud/Heading.tsx
            keeps the OTHER two moments, when the objective changes under a
            student who is already standing there and when a student has frozen,
            because neither of those is an arrival. */}
        {heading ? <div className="pc-heading">{heading}</div> : null}
      </div>
    </div>
  )
}
