/* the outfitter: a mirror where the player picks a coat colour and sees what is still locked */
import { useEffect, useRef, useState } from 'react'
import { LOOKS, drawRecolored } from '../thorLook'
import { BARE, WEAR, walkFrameOf } from '../thorWear'
import { loadSave, writeSave } from '../save'
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

/* where the drawn pixels are: walk frames sit on a 144 square canvas with the panther about 56 by 67 of it, so centring the canvas centres the padding instead. this is the bounding box of everything not transparent, null when the frame is empty, which means a png that failed to load */
function inkBox(g: CanvasRenderingContext2D, w: number, h: number):
{ x: number; y: number; w: number; h: number } | null {
  const d = g.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] < 24) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/* the real earn rule for an item, or null when no such island is on the roster */

export function Wardrobe({ onClose }: { onClose: () => void }) {
  const s = loadSave()
  const [look, setLook] = useState(s?.thorLook ?? 'classic')
  /* what is worn over the coat. one slot, because an outfit is a whole edited character rather than a layer (`thorWear.ts` says why) */
  const [worn, setWorn] = useState(s?.thorWear ?? BARE)
  const [facing, setFacing] = useState(0)
  const [spin, setSpin] = useState(0)
  const cvRef = useRef<HTMLCanvasElement>(null)

  /* the mirror must read the same walk frames the world walks, `/art/characters/thor/walk/<heading>/0.png`, not the eight top-level standing pngs, or a coat is approved on a body the player never sees. those frames are already in the scene's own cache, so the preload comes free */

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    let live = true
    const img = new Image()
    img.onload = () => {
      if (!live) return
      /* a canvas the browser refused is a mirror that stays empty while the words still say what is worn, so this must never throw inside a load callback where nothing can catch it */
      try {
        const off = document.createElement('canvas')
        const g = cv.getContext('2d')
        const og = off.getContext('2d', { willReadFrequently: true })
        if (!g || !og) return
        drawRecolored(off, img, LOOKS[look]?.hue ?? null)
        /* trimmed to the panther: the walk frames are 144 by 144 with the panther somewhere inside, not the 52 by 67 tight crop the stage was sized for, so centre-and-stand-on-the-floor maths put most of him past the edge. measure the drawn pixels once per frame shown, the same scan the scene runs to find his feet */
        const box = inkBox(og, off.width, off.height)
        cv.width = STAGE_W
        cv.height = STAGE_H
        g.imageSmoothingEnabled = false
        g.clearRect(0, 0, STAGE_W, STAGE_H)
        if (!box) return
        g.drawImage(
          off, box.x, box.y, box.w, box.h,
          Math.round((STAGE_W - box.w) / 2), STAGE_H - box.h - FOOT, box.w, box.h,
        )
      } catch { /* left empty on purpose: see above */ }
    }
    /* the mirror shows what was picked, not the bare panther: a coat is a recolour of this same picture and an outfit is a different picture, so both have to be drawn here */
    img.src = walkFrameOf(worn, RING[facing], 0)
    return () => { live = false }
  }, [look, facing, worn])

  /* the turn, one frame at a time: eight steps returns him to where he started, so a coat change is a look at the whole coat and not a change of pose, and the timer is torn down on unmount */
  useEffect(() => {
    if (spin <= 0) return
    const t = window.setTimeout(() => {
      setFacing((f) => (f + 1) % RING.length)
      setSpin((n) => n - 1)
    }, 80)
    return () => window.clearTimeout(t)
  }, [spin])

  /* written on every pick rather than on confirm. no cancel on purpose: an OK button would make a mirror into a form */
  const pick = (k: string) => {
    setLook(k)
    writeSave({ thorLook: k })
    track('cosmetic_change', { look: k, via: 'outfitter' })
    /* he turns all the way round once, unless the student asked for less motion */
    if (!prefersReducedMotion()) setSpin(RING.length)
    /* the mirror is the only visible feedback and it is a canvas, so a player who cannot see the recolour needs the kit's stamp and the spoken announcement to know the button did anything */
    saved(`Wearing ${LOOKS[k]?.label ?? k}`)
  }

  const turn = (step: 1 | -1) => {
    const next = (facing + step + RING.length) % RING.length
    setSpin(0)
    setFacing(next)
    announce(`Facing ${headingWord(RING[next])}`)
  }

  /* the panel hook owns escape so only the innermost panel answers; a window listener of this component's own fired even when something had opened on top of the wardrobe */
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
                    /* a swatch is a colour and nothing else, so the name has to be readable by a keyboard rather than sitting in a tooltip only a pointer can reach */
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
              {/* the words channel, because a chosen ring and a lifted button are both shape and a student should not have to read either */}
              <p className="wd-worn">Wearing {LOOKS[look]?.label ?? look}</p>
            </section>

            <section className="wd-group" aria-labelledby="wd-locked">
              <h3 className="wd-grouphead" id="wd-locked">Not yours yet</h3>
              <div className="wd-locks">
                {WEAR.map((it) => {
                  const got = it.has(s)
                  /* earned and drawn is wearable: the equip path is built, but `drawn` false means the card says the art is missing rather than promising a garment it cannot put on */
                  const wearable = got && it.drawn
                  const on = worn === it.id
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className="wd-lock"
                      aria-pressed={wearable ? on : undefined}
                      data-state={on ? 'worn' : got ? 'earned' : 'locked'}
                      onClick={() => {
                        track('locked_item_inspected', { item: it.name, earned: got, wearable })
                        if (!wearable) {
                          announce(got
                            ? `${it.name}, earned. Nobody has drawn it yet, so Thor cannot wear it.`
                            : it.earn ? `${it.name}. Earn by: ${it.earn}` : `${it.name}. Not open yet.`)
                          return
                        }
                        /* pressing the one already worn takes it off, which is the only way back to the bare panther */
                        const next = on ? BARE : it.id
                        setWorn(next)
                        writeSave({ thorWear: next === BARE ? undefined : next })
                        track('wear_change', { wear: next })
                        saved(next === BARE ? 'Back to just the coat' : `Wearing ${it.name}`)
                        announce(next === BARE ? `${it.name} taken off` : `${it.name} on`)
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
                          {!got ? (it.earn ? `Earn by: ${it.earn}` : 'Not open yet.')
                            : !it.drawn ? 'Earned. Nobody has drawn it yet, so Thor cannot wear it.'
                              : on ? 'On. Press to take it off.' : 'Earned. Press to wear it.'}
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
