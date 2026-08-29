/* THE OUTFITTER, AS A PLACE YOU CAN GO BACK TO.
 *
 * §4.5 says the dressing room is revisitable and §3.2 gives it a nook in the
 * Maw. Until now the only wardrobe in the game was card four of the intro's
 * setup chain (intro/I3Session.tsx), which can only be reached once, before the
 * run starts, and which returns a handle and a boat name along with the look.
 *
 * This is the same wardrobe with nothing else attached: it changes one field on
 * the save and closes. The recolour is the real one out of thorLook.ts, the same
 * dye BeachIso applies at load, so what is in the mirror is what walks out.
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
import './wardrobe.css'

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
  return g ? `complete the ${g.name} island` : 'that island has not risen yet'
}

const LOCKED = [
  { icon: '🧥', name: 'Letterman jacket', earn: 'reach Varsity in any sport', has: (s: ReturnType<typeof loadSave>) => !!s && Object.values(ranksOf(s)).some((y) => Number(y) >= 2) },
  { icon: '🥽', name: 'Robotics goggles', earn: earnByCompleting('robotics'), has: (s: ReturnType<typeof loadSave>) => !!programmeById('robotics') && s?.islands?.robotics === 'completed' },
  { icon: '🎓', name: 'Graduation cap', earn: 'finish a four-year run', has: (s: ReturnType<typeof loadSave>) => !!s?.graduated },
]

export function Wardrobe({ onClose }: { onClose: () => void }) {
  const s = loadSave()
  const [look, setLook] = useState(s?.thorLook ?? 'classic')
  const cvRef = useRef<HTMLCanvasElement>(null)
  const [pop, setPop] = useState(0)

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const img = new Image()
    img.onload = () => drawRecolored(cv, img, LOOKS[look]?.hue ?? null)
    img.src = '/art/characters/thor/walk/south/0.png'
  }, [look, pop])

  /* written on every pick rather than on confirm. There is no cancel here on
   * purpose: a mirror you can stand at and change your mind in is a mirror, and
   * an OK button would make it a form. */
  const pick = (k: string) => {
    setLook(k); setPop((v) => v + 1)
    writeSave({ thorLook: k })
    track('cosmetic_change', { look: k, via: 'outfitter' })
    /* THE MIRROR IS THE ONLY FEEDBACK, and it is a canvas. A player who cannot
     * see the recolour has pressed a button that does nothing at all. */
    announce(`Wearing ${LOOKS[k]?.label ?? k}`)
  }

  /* Escape used to be a window listener of this component's own, so it fired
   * even when something had opened on top of the wardrobe. The panel hook owns
   * it now and only the innermost panel answers. */
  const panel = usePanel({ label: "The outfitter's nook", onClose })

  return (
    <div className="wd-veil" onClick={onClose}>
      <div className="wd-panel kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        <div className="wd-head">The outfitter&apos;s nook</div>

        <div className="wd-stage">
          {/* the mirror is decoration for a reader: what it shows is announced */}
          <canvas key={pop} ref={cvRef} className="wd-thor" aria-hidden="true" />
        </div>

        <div className="wd-swatches" role="group" aria-label="Coats">
          {Object.entries(LOOKS).map(([k, v]) => (
            <button
              key={k}
              className={`wd-swatch ${look === k ? 'wd-swatch-on' : ''}`}
              style={{ background: v.hue === null ? '#2f8e82' : `hsl(${v.hue}, 48%, 42%)` }}
              title={v.label}
              /* A SWATCH IS A COLOUR AND NOTHING ELSE, which is the whole of what
                 a reader got: five unlabelled buttons. The name was already in
                 the data and only the tooltip had it. */
              aria-label={v.label} aria-pressed={look === k}
              onClick={() => pick(k)}
            />
          ))}
        </div>

        <div className="wd-locked" role="group" aria-label="Locked items">
          {LOCKED.map((it) => {
            const got = it.has(s)
            return (
              <button
                key={it.name}
                className={`wd-lockchip ${got ? 'wd-lockchip-on' : ''}`}
                title={got ? it.name : `earn by: ${it.earn}`}
                aria-label={got ? `${it.name}, earned` : `${it.name}, locked: earn by ${it.earn}`}
                onClick={() => {
                  track('locked_item_inspected', { item: it.name, earned: got })
                  /* the tooltip IS the content of this control and a tooltip is
                   * pointer-only, so pressing it says the same words */
                  announce(got ? `${it.name}, earned` : `${it.name}. Earn by: ${it.earn}`)
                }}
              >
                <span className="wd-lockicon" aria-hidden="true">{it.icon}</span>
                {!got && <span className="wd-lockknot" aria-hidden="true">🔒</span>}
              </button>
            )
          })}
        </div>

        <div className="wd-note">Locked things are earned out there, not bought.</div>
        <button className="wd-close kit-surface-plank" onClick={onClose}>Wear it well</button>
      </div>
    </div>
  )
}
