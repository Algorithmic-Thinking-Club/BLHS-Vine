/* the outfitter: a mirror where the player picks a coat colour and sees what is still locked */
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

/* the eight headings, in the order a figure turns clockwise */
const RING = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'] as const
type Heading = typeof RING[number]

const headingWord = (h: Heading): string => h.replace('-', ' ')

/* the fixed box the figure is placed into, so his feet stay on one line as he turns */
const STAGE_W = 62
const STAGE_H = 80
const FOOT = 2

/* the real earn rule for an item, or null when no such island is on the roster */
const earnByCompleting = (id: string) => {
  const g = programmeById(id)
  return g ? `complete the ${g.name} island` : null
}

/* ---- THESE ARE TROPHIES, NOT GARMENTS (Ash, 2026-09-09) -------------------
 *
 * *"I bet its the same for the letter man jacket, googles, cap."*
 *
 * The coats are a recolour of art that already exists and they now reach the
 * walking body on every map. These three are not: wearing one needs an overlay
 * drawn for eight headings across six walk frames each, which is PixelLab work
 * and Ash's word for that specific spend, and there is no save field for what is
 * worn on top of a coat.
 *
 * SO THE CARD SAYS WHAT IT IS. Sitting silently in a wardrobe beside four coats
 * you can put on, a card that reads "Earned" promises a garment; the promise was
 * the bug rather than the missing art. It reads as a record of something you did
 * until somebody draws it. */

/* ---- the locked items, each with the rule that unlocks it ---- */
const LOCKED = [
  { name: 'Letterman jacket', earn: 'reach Varsity in any sport', has: (s: ReturnType<typeof loadSave>) => !!s && Object.values(ranksOf(s)).some((y) => Number(y) >= 2) },
  { name: 'Robotics goggles', earn: earnByCompleting('robotics'), has: (s: ReturnType<typeof loadSave>) => !!programmeById('robotics') && s?.islands?.robotics === 'completed' },
  { name: 'Graduation cap', earn: 'finish all four years', has: (s: ReturnType<typeof loadSave>) => !!s?.graduated },
]

export function Wardrobe({ onClose }: { onClose: () => void }) {
  const s = loadSave()
  const [look, setLook] = useState(s?.thorLook ?? 'classic')
  const [facing, setFacing] = useState(0)
  const [spin, setSpin] = useState(0)
  const cvRef = useRef<HTMLCanvasElement>(null)

  /* ---- THE MIRROR SHOWS THE BODY THAT WALKS (Ash, 2026-09-09) -----------
   *
   * It drew `/art/characters/thor/<heading>.png`, the eight top-level standing
   * pngs, and the painted world walks `/art/characters/thor/walk/<heading>/0.png`.
   * Two different drawings of the same panther, so the coat a student approved in
   * the mirror was approved on a body he never sees. Now they read one set, and
   * the preload goes with it: those frames are already in the scene's own cache. */

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
    img.src = `/art/characters/thor/walk/${RING[facing]}/0.png`
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
    /* he turns all the way round once, unless the student asked for less motion */
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
  const panel = usePanel({ label: 'Your clothes', onClose })

  return (
    <div className="wd-veil" onClick={onClose}>
      <div className="wd-panel kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        <header className="wd-top">
          <h2 className="wd-head">Your clothes</h2>
          <p className="wd-sub">Pick a coat color. Nothing here costs anything.</p>
        </header>

        <div className="wd-body">
          <div className="wd-mirror kit-surface-portrait_frame">
            {/* the mirror is a picture: what it shows is announced beside it */}
            <canvas ref={cvRef} className="wd-thor" aria-hidden="true" />
            <p className="wd-facing">Facing {headingWord(RING[facing])}</p>
            {/* the turn controls, taking their chevron from the plank's own glyph slot */}
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
                      /* the dye itself, out of thorLook.ts, which is the content of the choice */
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
                          ? `${it.name}, earned. Nobody has drawn it yet, so Thor cannot wear it.`
                          : it.earn ? `${it.name}. Earn by: ${it.earn}` : `${it.name}. Not open yet.`)
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
                          {got
                            ? 'Earned. Nobody has drawn it yet, so Thor cannot wear it.'
                            : it.earn ? `Earn by: ${it.earn}` : 'Not open yet.'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="wd-note">
                You earn these by playing. They are a record of what you did; the coats above
                are the part Thor wears.
              </p>
            </section>
          </div>
        </div>

        <div className="wd-foot">
          <Plank size="lg" keyCap="Esc" onClick={onClose}>Back to the game</Plank>
        </div>
      </div>
    </div>
  )
}
