/* the card naming a place on arrival, which fades on its own and never takes input */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { dialogueState, onDialogue } from '../dialogue'
import { nextObjective, objectiveLine } from '../run/objective'
import { loadSave } from '../save'
import { onPlaceCard, sceneDrawn, setPlaceCardUp, type PlaceCardRequest } from './stage-bus'
import { transitionBusy } from '../../app/transitions'
import { announce, panelDepth } from '../ui/a11y'
import { Glyph, useKitReady } from '../ui/controls'
import { bandFromRects, setUiBandStacked } from '../ui/frame'
import { prefersReducedMotion } from '../ui/motion'
import { cinemaOn } from './cinema'
import './placecard.css'

const DWELL_MS = 3200
/* how long a card will queue behind something else before it is dropped instead */
const WAIT_CEILING_MS = 15000

/** held: asked for, waiting for the screen to be free. in: on screen. out: leaving. */
type CardPhase = 'held' | 'in' | 'out'

export function PlaceCard() {
  const [card, setCard] = useState<PlaceCardRequest | null>(null)
  const [phase, setPhase] = useState<CardPhase>('held')
  /* re-renders the card on the frame the drawn kit lands, so the pin is a pin
   * rather than nothing on a page that was rendered before the fetch answered */
  useKitReady()
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => onPlaceCard((c) => { setCard(c); setPhase('held') }), [])

  /* whether anything is talking, so the card and a line of dialogue never share the screen */
  const [speaking, setSpeaking] = useState(() => dialogueState() !== null)
  useEffect(() => onDialogue((s) => setSpeaking(s !== null)), [])

  /* the card waits for a clear screen, so its dwell starts when it can actually be seen */
  useEffect(() => {
    if (!card || phase !== 'held') return
    /* the three conditions are read live rather than off state, so the ceiling is honest */
    /* it does not wait a cutscene out: a title card belongs inside the bars */
    const clear = () => !transitionBusy() && dialogueState() === null && panelDepth() === 0
    if (clear()) { setPhase('in'); return }
    const t0 = performance.now()
    const held = window.setInterval(() => {
      if (clear()) { window.clearInterval(held); setPhase('in'); return }
      if (performance.now() - t0 > WAIT_CEILING_MS) { window.clearInterval(held); setCard(null) }
    }, 100)
    return () => window.clearInterval(held)
  }, [card, phase])

  /* reduced motion shortens the dwell rather than cancelling the card */
  const dwell = prefersReducedMotion() ? DWELL_MS * 0.6 : DWELL_MS

  useEffect(() => {
    if (!card || phase !== 'in') return
    const a = window.setTimeout(() => setPhase('out'), dwell)
    /* and it gets out of the way of a panel opened while it is already up */
    const watch = window.setInterval(() => { if (panelDepth() > 0) setCard(null) }, 200)
    return () => { window.clearTimeout(a); window.clearInterval(watch) }
  }, [card, phase, dwell])

  /* leaving is its own step, because a card can be cut short as well as time out */
  useEffect(() => {
    if (phase !== 'out') return
    const t = window.setTimeout(() => setCard(null), 700)
    return () => window.clearTimeout(t)
  }, [phase])

  /* somebody started talking underneath it. The card leaves rather than shares
   * the bottom of the window, and it does not come back: an arrival card behind
   * a conversation is about where the student was before the conversation. */
  useEffect(() => {
    if (phase === 'in' && speaking) setPhase('out')
  }, [phase, speaking])

  const visible = !!card && phase !== 'held' && panelDepth() === 0

  /* publishes the card's height so the camera lifts the picture clear of it */
  useLayoutEffect(() => {
    if (!visible) { setUiBandStacked('placecard', 0); return }
    const measure = () => setUiBandStacked('placecard', bandFromRects([el.current]))
    measure()
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure); setUiBandStacked('placecard', 0) }
  }, [visible, card, phase])

  /* says whether the card is really on screen, so the year's own opening waits its turn */
  useEffect(() => {
    setPlaceCardUp(visible)
    return () => setPlaceCardUp(false)
  }, [visible])

  /* the one live thing the year wants next, read at the moment of arrival. Pure,
   * so it is a function call rather than a fetch, and it is the same function the
   * standalone heading and the world's own marker both read. */
  /* worked out for the map under his feet, not the one he came from */
  /* not computed during a cutscene, and only ever spoken to a screen reader */
  const heading = card && !cinemaOn() ? objectiveLine(nextObjective(loadSave()), sceneDrawn()) : ''

  /* the arrival is said once to a screen reader, politely, from the moment it is true */
  const said = useRef('')
  useEffect(() => {
    if (!visible || !card) return
    const line = [card.title, card.line, heading].filter(Boolean).join('. ')
    if (line === said.current) return
    said.current = line
    announce(line)
  }, [visible, card, heading])

  /* a card never draws over a panel: it is dropped rather than deferred */
  if (!visible || !card) return null

  return (
    /* aria-hidden AND pointer-events none: it is not a control, and the words are
       already going to a reader through `announce` above, so reading the plaque a
       second time would say the name of the place twice */
    <div
      ref={el}
      className={`pc-root ${phase === 'out' ? 'pc-out' : 'pc-in'}`}
      style={{ ['--pc-dwell' as string]: `${Math.round(dwell)}ms` }}
      aria-hidden="true"
    >
      {/* the card is the kit's drawn band, which tokens.css answers three ways */}
      <div className="pc-card kit-surface-band">
        <p className="pc-where">
          {/* a pin, because that is what a name on a map is; no fallback shape on purpose */}
          <Glyph piece="pointer" face="pin_tail" size={30} className="pc-pin" />
          <span className="pc-name">{card.title}</span>
        </p>
        {card.line ? <p className="pc-line">{card.line}</p> : null}
        {/* where you are and what you are for are one thought, read in one dwell */}
        {/* the errand is the objective panel's, at the top of the screen, on
            every frame. See `heading` above for why it is computed and not
            drawn. */}
        {/* a rule that drains over the dwell, so a card with no dismiss says it will leave */}
        <span className="pc-dwell" aria-hidden="true" />
      </div>
    </div>
  )
}
