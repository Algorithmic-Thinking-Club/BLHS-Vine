/* THE OUTFITTER, WHICH IS THE CHARACTER VIEW (§4.5, §40.21).
 *
 * §4.5 says the dressing room is revisitable and §3.2 gives it a nook in the
 * Maw. Until the wardrobe became a panel the only one in the game was card four
 * of the intro's setup chain (intro/I3Session.tsx), which can only be reached
 * once, before the run starts, and which returns a handle and a boat name along
 * with the look. This is the same wardrobe with nothing else attached: it
 * changes one field on the save and closes.
 *
 * IT IS A MIRROR AND HAS NO CONFIRM BUTTON. A mirror you can stand at and change
 * your mind in is a mirror; an OK button would make it a form. Every pick writes
 * the save on the spot.
 *
 * ---- WHAT THIS PASS FIXED, AND WHY EACH ONE WAS A REAL DEFECT ---------------
 *
 * 1. THOR WAS TINY IN A LARGE SHEET (`build-shots/ui/before/13-wardrobe.png`),
 *    and the cause was not the CSS. The mirror drew `walk/south/0.png`, which is
 *    a 144x144 SHEET with a 52x67 character standing in the middle of it, so
 *    `object-fit: contain` was faithfully fitting ninety-two pixels of
 *    transparency. `south.png` and its seven neighbours are the cropped standing
 *    frames, measured today at 44x70 to 54x75, and fitting one of those fills the
 *    stage with the panther instead of with air. §40.21's own want, in as many
 *    words: "the preview as a standing figure rather than one walk frame".
 *
 * 2. HE DID NOT REACT. §14.10: "what must not happen is a paper doll". Eight
 *    headings are drawn and none of them had ever been shown outside the world,
 *    so a coat change now turns him all the way round once, and the two turn
 *    controls let a student look at their own back. The spin is skipped outright
 *    under reduced motion rather than run fast, because a figure snapping through
 *    eight frames in a tenth of a second is worse than one that does not move.
 *
 * 3. THE LOCKED ITEMS WERE AN OPERATING-SYSTEM COAT, GOGGLES AND CAP WITH AN
 *    OPERATING-SYSTEM PADLOCK, and the earn rule was hidden in a `title`, which
 *    is pointer-only. `docs/ART.md` forbids the glyphs outright and §40.21 says
 *    the criterion is SHOWN. Each one is a drawn `chip` plate carrying the
 *    kit's own `lock` face, with the name and the real rule printed beside it.
 *
 * 4. "WEAR IT WELL" WAS UNREADABLE, pale ink on the platform's pale parchment
 *    plank. It is the kit's `Plank` now, which wears the dark wood Ash chose and
 *    the ink that was written for it.
 *
 * 5. THE SWATCHES WERE FIVE NAMELESS CIRCLES whose only channel was hue, on the
 *    hardware that crushes hue hardest. Each one carries its own name, the
 *    chosen one carries a drawn tick and sits forward, and the line under them
 *    says out loud what is being worn.
 *
 * The locked items are shown with their REAL earn rules and are never buyable.
 * §8.3: cosmetics come only from learning outcomes, because a decoration loop is
 * somewhere a student can hide from the learning, and the study would see it.
 */
import { useEffect, useRef, useState } from 'react'
import { LOOKS, drawRecolored } from '../thorLook'
import { loadSave, writeSave } from '../save'
import { programmeById } from '../roster/roster'
import { ranksOf } from '../progress'
import { track } from '../telemetry'
import { announce, usePanel } from '../ui/a11y'
import { Chip, Glyph, Plank } from '../ui/controls'
import { saved } from '../ui/feedback'
import { prefersReducedMotion } from '../ui/motion'
import './wardrobe.css'

/* ---- which way he is standing --------------------------------------------
 *
 * The ring is in the order a figure turns clockwise as you look at them, so
 * "turn right" steps forward through it and "turn left" steps back. Every one of
 * the eight is a real cropped standing frame in `public/art/characters/thor/`. */
const RING = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'] as const
type Heading = typeof RING[number]

const headingWord = (h: Heading): string => h.replace('-', ' ')

/* THE STAGE IS A FIXED BOX AND THE FIGURE IS PLACED INTO IT. The eight frames
 * are cropped to their own ink, so they are eight different sizes, and drawing
 * each straight into the canvas would change his apparent height every time he
 * turned. Widest measured 54, tallest 75. He is centred across this box and
 * stood on its floor, so his feet stay on one line through a whole rotation. */
const STAGE_W = 62
const STAGE_H = 80
const FOOT = 2

/* the earn rules are the real ones from §8.2 and §8.4, not placeholders. A
 * locked chip that lies about how to unlock it is worse than no chip.
 *
 * WHICH IS WHY THE ROBOTICS CHIP NOW ASKS THE ROSTER. It read
 * `s.islands.robotics === 'completed'` against a raw string that is on no
 * roster, in no registry and in no catalog, so the chip promised an unlock that
 * nothing in the game could ever grant and said "complete the Robotics island"
 * about an island that does not exist. A chip whose programme is not on the
 * roster says the island has not risen instead. */
const earnByCompleting = (id: string) => {
  const g = programmeById(id)
  return g ? `complete the ${g.name} island` : null
}

/* ---- A LOCKED THING SAYS WHY, AND THE SENTENCE HAS TO PARSE ---------------
 *
 * `earn` used to answer a string either way, and the card composed
 * `Earn by: ${it.earn}`. With no Robotics programme on the roster that read, in
 * both arms and on screen:
 *
 *   Robotics goggles
 *   Earn by: that island has not risen yet
 *
 * which is not a sentence, and which is §40.41's unreachable-criterion case
 * wearing an explanation. The fallback is `null` now and the card branches: a
 * rule a student can act on is written as a rule, and a thing nobody has built
 * says that in its own words instead of being pushed through "Earn by:".
 *
 * It stays on the list rather than being dropped, because §40.21 says the locked
 * items are "earned and not bought" and seeing what is coming is the point of the
 * row. What it must not do is state a condition and then never honour it. */
const LOCKED = [
  { name: 'Letterman jacket', earn: 'reach Varsity in any sport', has: (s: ReturnType<typeof loadSave>) => !!s && Object.values(ranksOf(s)).some((y) => Number(y) >= 2) },
  { name: 'Robotics goggles', earn: earnByCompleting('robotics'), has: (s: ReturnType<typeof loadSave>) => !!programmeById('robotics') && s?.islands?.robotics === 'completed' },
  { name: 'Graduation cap', earn: 'finish a four-year run', has: (s: ReturnType<typeof loadSave>) => !!s?.graduated },
]

export function Wardrobe({ onClose }: { onClose: () => void }) {
  const s = loadSave()
  const [look, setLook] = useState(s?.thorLook ?? 'classic')
  const [facing, setFacing] = useState(0)
  const [spin, setSpin] = useState(0)
  const cvRef = useRef<HTMLCanvasElement>(null)

  /* the other seven headings, fetched once, so the first turn is not a blank
   * frame while a 3 KB png comes down over a school access point */
  useEffect(() => {
    for (const h of RING) { const pre = new Image(); pre.src = `/art/characters/thor/${h}.png` }
  }, [])

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    let live = true
    const img = new Image()
    img.onload = () => {
      if (!live) return
      /* A CANVAS THE BROWSER REFUSED IS A MIRROR THAT STAYS EMPTY, and the words
       * beside it still say what is being worn, so this must never throw into a
       * load callback where nothing can catch it. */
      try {
        const off = document.createElement('canvas')
        const g = cv.getContext('2d')
        if (!g || !off.getContext('2d')) return
        drawRecolored(off, img, LOOKS[look]?.hue ?? null)
        cv.width = STAGE_W
        cv.height = STAGE_H
        g.imageSmoothingEnabled = false
        g.clearRect(0, 0, STAGE_W, STAGE_H)
        g.drawImage(off, Math.round((STAGE_W - off.width) / 2), STAGE_H - off.height - FOOT)
      } catch { /* left empty on purpose: see above */ }
    }
    img.src = `/art/characters/thor/${RING[facing]}.png`
    return () => { live = false }
  }, [look, facing])

  /* THE TURN, ONE FRAME AT A TIME. Eight steps returns him to where he started,
   * so a coat change is a look at the whole coat and not a change of pose. The
   * timer is torn down on unmount and replaced by the next pick. */
  useEffect(() => {
    if (spin <= 0) return
    const t = window.setTimeout(() => {
      setFacing((f) => (f + 1) % RING.length)
      setSpin((n) => n - 1)
    }, 80)
    return () => window.clearTimeout(t)
  }, [spin])

  /* written on every pick rather than on confirm. There is no cancel here on
   * purpose: a mirror you can stand at and change your mind in is a mirror, and
   * an OK button would make it a form. */
  const pick = (k: string) => {
    setLook(k)
    writeSave({ thorLook: k })
    track('cosmetic_change', { look: k, via: 'outfitter' })
    /* HE SHOWS IT OFF. §14.10's rule against a paper doll: the figure in the
     * mirror reacts to the change rather than being repainted while standing
     * still. Under reduced motion he simply wears it, because eight frames at
     * one millisecond each is a flicker and not a turn. */
    if (!prefersReducedMotion()) setSpin(RING.length)
    /* THE MIRROR IS THE ONLY VISIBLE FEEDBACK, and it is a canvas. A player who
     * cannot see the recolour has pressed a button that does nothing at all, so
     * the kit's own stamp says it landed and says it out loud in one call. */
    saved(`Wearing ${LOOKS[k]?.label ?? k}`)
  }

  const turn = (step: 1 | -1) => {
    const next = (facing + step + RING.length) % RING.length
    setSpin(0)
    setFacing(next)
    announce(`Facing ${headingWord(RING[next])}`)
  }

  /* Escape used to be a window listener of this component's own, so it fired
   * even when something had opened on top of the wardrobe. The panel hook owns
   * it now and only the innermost panel answers. */
  const panel = usePanel({ label: "The outfitter's nook", onClose })

  return (
    <div className="wd-veil" onClick={onClose}>
      <div className="wd-panel kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        <header className="wd-top">
          <h2 className="wd-head">The outfitter&apos;s nook</h2>
          <p className="wd-sub">Try a dye on. Nothing here is bought.</p>
        </header>

        <div className="wd-body">
          <div className="wd-mirror kit-surface-portrait_frame">
            {/* the mirror is a picture: what it shows is announced beside it */}
            <canvas ref={cvRef} className="wd-thor" aria-hidden="true" />
            <p className="wd-facing">Facing {headingWord(RING[facing])}</p>
            {/* THE CHEVRON GOES THROUGH THE PLANK'S OWN `glyph` SLOT rather than
                into its label. The label span is `white-space: nowrap; overflow:
                hidden`, so a mark dropped inside it is a mark that can be clipped
                by its own button. The left one is the same drawing mirrored,
                because a mirrored drawing is still the drawing and a second
                character borrowed from the operating system is not. */}
            <div className="wd-turns">
              <Plank size="sm" glyph={['icon_set', 'arrow']} className="wd-turn wd-turn-left" onClick={() => turn(-1)}>
                Turn left
              </Plank>
              <Plank size="sm" glyph={['icon_set', 'arrow']} className="wd-turn" onClick={() => turn(1)}>
                Turn right
              </Plank>
            </div>
          </div>

          <div className="wd-side">
            <section className="wd-group" aria-labelledby="wd-coats">
              <h3 className="wd-grouphead" id="wd-coats">Coats</h3>
              <div className="wd-swatches">
                {Object.entries(LOOKS).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    className={`wd-swatch${look === k ? ' wd-swatch-on' : ''}`}
                    /* A SWATCH IS A COLOUR AND NOTHING ELSE, which is the whole of
                       what a reader got: four unlabelled buttons with the name in
                       a tooltip a pointer could reach and a keyboard could not. */
                    aria-pressed={look === k}
                    onClick={() => pick(k)}
                  >
                    <span
                      className="wd-dye"
                      aria-hidden="true"
                      /* THE ONE COLOUR IN THIS FILE THAT IS NOT A TOKEN, and it is
                         not chrome: it is the dye itself, out of `thorLook.ts`,
                         which is the content of the choice. The unchanged coat has
                         no hue of its own and borrows the front group's teal. */
                      style={{ background: v.hue === null ? 'var(--kit-front-teal)' : `hsl(${v.hue}, 48%, 42%)` }}
                    />
                    <span className="wd-swatch-name">{v.label}</span>
                    {look === k && <Glyph piece="icon_set" face="tick" size={15} className="wd-swatch-tick" />}
                  </button>
                ))}
              </div>
              {/* the words channel, because a chosen ring and a lifted button are
                  both shape and a student should not have to read either */}
              <p className="wd-worn">Wearing {LOOKS[look]?.label ?? look}</p>
            </section>

            <section className="wd-group" aria-labelledby="wd-locked">
              <h3 className="wd-grouphead" id="wd-locked">Not yours yet</h3>
              <div className="wd-locks">
                {LOCKED.map((it) => {
                  const got = it.has(s)
                  return (
                    <button
                      key={it.name}
                      type="button"
                      className="wd-lock"
                      data-state={got ? 'earned' : 'locked'}
                      onClick={() => {
                        track('locked_item_inspected', { item: it.name, earned: got })
                        /* the earn rule is printed on the card now, and pressing
                         * it says the same words, because a student who pressed
                         * something they cannot have has asked a question */
                        announce(got
                          ? `${it.name}, earned`
                          : it.earn ? `${it.name}. Earn by: ${it.earn}` : `${it.name}. Not on the water yet.`)
                      }}
                    >
                      <Chip state={got ? 'plate_lit' : 'plate'} className="wd-lock-plate">
                        {got
                          ? <Glyph piece="stamp" face="awarded" size={20} />
                          : <Glyph piece="icon_set" face="lock" size={16} />}
                      </Chip>
                      <span className="wd-lock-words">
                        <span className="wd-lock-name">{it.name}</span>
                        <span className="wd-lock-earn">
                          {got ? 'Earned' : it.earn ? `Earn by: ${it.earn}` : 'Not on the water yet.'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="wd-note">Locked things are earned out there, not bought.</p>
            </section>
          </div>
        </div>

        <div className="wd-foot">
          <Plank size="lg" keyCap="Esc" onClick={onClose}>Wear it well</Plank>
        </div>
      </div>
    </div>
  )
}
