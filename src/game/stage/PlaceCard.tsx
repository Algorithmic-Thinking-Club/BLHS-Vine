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
/* a card that is owed is paid: it waits for a clear screen and says so if it gives up */
const WAIT_CEILING_MS = 45000

/** held: asked for, waiting for the screen to be free. in: on screen. out: leaving. */
type CardPhase = 'held' | 'in' | 'out'

export function PlaceCard() {
  const [card, setCard] = useState<PlaceCardRequest | null>(null)
  const [phase, setPhase] = useState<CardPhase>('held')
  /* re-renders on the frame the drawn kit lands, so a page rendered before the fetch answered still gets a real pin */
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
      /* at the ceiling it shows anyway: a screen busy for forty-five seconds is not going to get quiet, and no card at all is worse than three seconds of the place name */
      if (performance.now() - t0 > WAIT_CEILING_MS) { window.clearInterval(held); setPhase('in') }
    }, 100)
    return () => window.clearInterval(held)
  }, [card, phase])

  /* reduced motion shortens the dwell rather than cancelling the card */
  /* and a place already seen gets a shorter dwell still */
  const dwell = (prefersReducedMotion() ? DWELL_MS * 0.6 : DWELL_MS) * (card?.brief ? 0.55 : 1)

  /* a click anywhere puts it away, bound on the window and deliberately not swallowed: the card is `pointer-events: none` so it never eats a press meant for the room underneath, and a dismissing click still reaches whatever it was aimed at */
  useEffect(() => {
    if (!card || phase !== 'in') return
    const away = () => setPhase('out')
    window.addEventListener('pointerdown', away, { capture: true })
    window.addEventListener('keydown', away)
    return () => {
      window.removeEventListener('pointerdown', away, { capture: true })
      window.removeEventListener('keydown', away)
    }
  }, [card, phase])

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

  /* somebody started talking underneath it, so the card leaves rather than share the bottom of the window with a dialogue box, then comes back once, because an arrival opening on a line of dialogue is the ordinary case and binning the card there leaves a student not knowing where he landed */
  const requeued = useRef(false)
  useEffect(() => {
    if (phase !== 'in' || !speaking) return
    if (requeued.current) { setPhase('out'); return }
    requeued.current = true
    setPhase('held')
  }, [phase, speaking])

  /* and a new card is a new arrival, so it gets its own second chance */
  useEffect(() => { requeued.current = false }, [card])

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

  /* the one live thing the year wants next, read at the moment of arrival; pure, so it is a call rather than a fetch, and the same function the standalone heading and the world marker both read */
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
    /* aria-hidden and pointer-events none: it is not a control, and `announce` above already sends the words to a reader, so the plaque would say the place name a second time */
    <div
      ref={el}
      className={`pc-root ${phase === 'out' ? 'pc-out' : 'pc-in'}`}
      data-brief={card.brief ? '1' : undefined}
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
        {/* the errand belongs to the objective panel at the top of the screen, on every frame; see `heading` above for why it is computed and not drawn */}
        {/* a rule that drains over the dwell, so a card with no dismiss says it will leave */}
        <span className="pc-dwell" aria-hidden="true" />
      </div>
    </div>
  )
}
