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
/* HOW LONG A CARD IS WILLING TO QUEUE BEHIND SOMETHING ELSE. An arrival card is
 * an announcement about NOW, and after a quarter of a minute of somebody else
 * talking it is an announcement about where the student used to be. It is
 * dropped rather than shown late, for the same reason it is dropped rather than
 * deferred when a panel opens. */
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

  /* ---- NOTHING SPEAKS WHILE AN ARRIVAL CARD IS UP -------------------------
   *
   * `build-shots/ui/before/06-dialogue.png` is the defect in one picture: the
   * card and a line of station dialogue on screen at the same instant, stacked
   * up the bottom of the window, the card larger than the box and drawn in
   * flatter materials. §40.13's rule is one sentence and it was not being kept.
   *
   * WHAT IS ENFORCED HERE AND WHAT IS NOT, said plainly rather than half-done.
   * This file can guarantee the two never SHARE the screen, and it does: the
   * card waits for quiet before it appears, and if a line starts underneath it
   * the card goes rather than sits there. What this file cannot do is make the
   * LINE wait, because the queue that decides when a line is shown is `pump()`
   * in `src/game/dialogue.ts` and this session does not own that file. One
   * `if (placeCardUp()) return` there, plus a re-pump when the card clears, is
   * the whole of the other half, and the handoff says so.
   *
   * THE WORLD IS NOT HELD. Taking the controls away for the length of the card
   * was the other candidate and it is refused: `PmapScene`'s ticker hands the
   * walk law an empty input for as long as anything holds the world, so a hold
   * here would freeze Thor for three and a bit seconds on EVERY arrival, on a
   * surface whose founding rule is that it never takes input and that a player
   * walking off the boat keeps walking while it fades. A card that stops a
   * student walking is a modal that does not look like one. */
  const [speaking, setSpeaking] = useState(() => dialogueState() !== null)
  useEffect(() => onDialogue((s) => setSpeaking(s !== null)), [])

  /* ---- WHEN THE CARD IS ALLOWED ON SCREEN --------------------------------
   *
   * THE CLOCK STARTS WHEN THE CARD CAN BE SEEN, NOT WHEN IT IS ASKED FOR.
   *
   * A door swap fires this from under a full-screen cover: `PmapScene` names the
   * map the instant the bundle is up, and the cover is still on screen for
   * seconds after that. So most of a 3.2 second dwell was spent behind an opaque
   * rectangle and the card was already leaving when the player could first look
   * at it. Measured on the Maw: gone 1.4s after the cover lifted. That is what
   * "6-placecard shows no card" was telling us.
   *
   * The same argument covers a line of dialogue, which is why both are one
   * condition rather than two mechanisms. */
  useEffect(() => {
    if (!card || phase !== 'held') return
    /* THE THREE CONDITIONS ARE READ LIVE RATHER THAN OFF STATE, and the ceiling
     * is why. Reading `speaking` off React state would put it in this effect's
     * dependency list, so every line of a four-line conversation would tear the
     * timer down and start the fifteen seconds again, and a card could queue
     * behind a long scene for a minute and still call itself fresh. */
    /* AND IT WAITS OUT A MOVIE (BRIEF-ARRIVAL items 2 and 3). Ash's order at
     * the dock is: the ship ties up, the camera pulls out to the whole island,
     * and THEN the card. The card is asked for the moment he steps ashore,
     * which is inside the crossing, so without this it would land behind the
     * black bars and be gone before they lifted. */
    const clear = () => !transitionBusy() && dialogueState() === null && panelDepth() === 0 && !cinemaOn()
    if (clear()) { setPhase('in'); return }
    /* THE CEILING COUNTS QUIET TIME ONLY. Fifteen seconds is the answer to "a
     * conversation is running long and this card is now about somewhere the
     * student has left". A movie is not that: it is a stretch somebody wrote
     * with the card deliberately held behind it, and counting it would throw
     * the arrival card away on any crossing over fifteen seconds. */
    let waited = 0
    let last = performance.now()
    const held = window.setInterval(() => {
      const now = performance.now()
      if (!cinemaOn()) waited += now - last
      last = now
      if (clear()) { window.clearInterval(held); setPhase('in'); return }
      if (waited > WAIT_CEILING_MS) { window.clearInterval(held); setCard(null) }
    }, 100)
    return () => window.clearInterval(held)
  }, [card, phase])

  /* REDUCED MOTION SHORTENS IT RATHER THAN CANCELLING IT. §80.5's own rule is
   * that a control reporting a state it does not deliver is worse than no
   * control, and the same is true in reverse: dropping the card entirely takes
   * away the only place a student is told where they are. */
  const dwell = prefersReducedMotion() ? DWELL_MS * 0.6 : DWELL_MS

  useEffect(() => {
    if (!card || phase !== 'in') return
    const a = window.setTimeout(() => setPhase('out'), dwell)
    /* AND IT GETS OUT OF THE WAY OF A PANEL OPENED WHILE IT IS UP. A panel does
     * not re-render this component, so a check in the render only catches a card
     * that arrives second. A student who opens the chart in the four seconds
     * after arriving is the case that actually happens, and it had a name plaque
     * across the bottom of the page with no way to move it. */
    const watch = window.setInterval(() => { if (panelDepth() > 0) setCard(null) }, 200)
    return () => { window.clearTimeout(a); window.clearInterval(watch) }
  }, [card, phase, dwell])

  /* THE LEAVING IS ITS OWN STEP, because there are two ways into it and only one
   * of them is the clock. Hanging the unmount off the dwell timer meant a card
   * cut short by a line of dialogue played its exit and then stayed mounted for
   * good, still publishing its height to the camera and still holding the
   * objective card down. */
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

  /* THE CARD IS ALONG THE BOTTOM OF THE WINDOW TOO, so it says how tall it is and
   * the camera lifts the picture clear of it, the same way it does for a line and
   * for the year's card (src/game/ui/frame.ts). Moving the card above the
   * dialogue box was only half the job: it then landed on the player instead, and
   * the fresh-eyes round caught the marker sliced by the card's own top edge on
   * the very shot taken to prove the fix. */
  useLayoutEffect(() => {
    if (!visible) { setUiBandStacked('placecard', 0); return }
    const measure = () => setUiBandStacked('placecard', bandFromRects([el.current]))
    measure()
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure); setUiBandStacked('placecard', 0) }
  }, [visible, card, phase])

  /* AND THE YEAR WAITS ITS TURN. An arrival is what starts a year, so the year's
   * opening line and this card fired on the same instant and shared the bottom of
   * the window with the body behind both of them. `Hud` and `Heading` read this.
   *
   * PUBLISHED FROM WHETHER IT IS VISIBLE, not from whether it was asked for. It
   * was `!!card`, so a card requested under a four second cover suppressed the
   * objective card for four seconds with nothing on screen to explain why. */
  useEffect(() => {
    setPlaceCardUp(visible)
    return () => setPlaceCardUp(false)
  }, [visible])

  /* the one live thing the year wants next, read at the moment of arrival. Pure,
   * so it is a function call rather than a fetch, and it is the same function the
   * standalone heading and the world's own marker both read. */
  /* SAID FOR THE MAP HE HAS JUST ARRIVED ON. The card fires after the scene's
   * first frame, so `sceneDrawn` is the map under his feet, and the line reads
   * "talk to the principal" inside the mountain rather than "go into the
   * mountain" (STATE-OF-THE-GAME confusing 6). */
  const heading = card ? objectiveLine(nextObjective(loadSave()), sceneDrawn()) : ''

  /* ---- SAID OUT LOUD, ONCE ------------------------------------------------
   *
   * The comment that used to sit on the wrapper claimed the same words arrived
   * "as a live region from the world's own arrival event". They did not: nothing
   * in `PmapScene` or the HUD announces an arrival, checked by grep, so a student
   * driving this game with a reader walked through a door and was told nothing at
   * all about where they had come out. It is announced here, from the moment the
   * card is really on screen, which is also the moment the words are true.
   *
   * `announce` is polite and off-screen, so it does not interrupt a walk and does
   * not take focus, which is what keeps the card a card rather than a dialog. */
  const said = useRef('')
  useEffect(() => {
    if (!visible || !card) return
    const line = [card.title, card.line, heading].filter(Boolean).join('. ')
    if (line === said.current) return
    said.current = line
    announce(line)
  }, [visible, card, heading])

  /* A CARD DOES NOT TALK OVER A PANEL. It is the one surface in the game with no
   * dismiss, so a student who opened the chart in the four seconds after arriving
   * had a name plaque across the bottom of it and no way to move it. The panel
   * stack already knows whether anything owns the frame (`src/game/ui/a11y.ts`),
   * and the card is an announcement rather than a queue: it is dropped rather
   * than deferred, because a card that arrives after the panel closes is a card
   * about somewhere the student stopped being. */
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
      {/* THE CARD IS THE DRAWN BAND. It was a `linear-gradient` between two
          hardcoded creams with a 2px border and two box-shadows, carrying no kit
          class at all, which meant three things at once: the platform's drawn
          band could never reach it, the plain arm could never take the paint off
          it, and it was the one surface on screen next to a fully drawn dialogue
          box (`before/06-dialogue.png`) that was visibly not made of anything.
          `kit-surface-band` is answered three ways by tokens.css with no branch
          here: the platform's band, the game's own drawn frame nine-sliced when
          the platform has sent nothing, and a flat bordered sheet in §16's arm. */}
      <div className="pc-card kit-surface-band">
        <p className="pc-where">
          {/* a pin, because that is what a name on a map is. `pointer` publishes
              `pin_plate`; there is no fallback shape on purpose, so a kit that
              never landed draws the name alone rather than a coloured blob
              standing in for a drawing nobody has seen. */}
          <Glyph piece="pointer" face="pin_tail" size={30} className="pc-pin" />
          <span className="pc-name">{card.title}</span>
        </p>
        {card.line ? <p className="pc-line">{card.line}</p> : null}
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
        {heading ? <p className="pc-heading">{heading}</p> : null}
        {/* THE ONE HONEST CLOCK ON THIS SURFACE. A card with no dismiss and no
            control has to say that it is going to leave on its own, or a student
            reads it as something they are supposed to do something about. This
            rule drains over exactly the dwell above, which is a real measurement
            of a real timer rather than a picture of a load. */}
        <span className="pc-dwell" aria-hidden="true" />
      </div>
    </div>
  )
}
