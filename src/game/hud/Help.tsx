/* THE QUESTION MARK, AND THE ONE CARD BEHIND IT (BRIEF-UI item 3b).
 *
 * Ash, 2026-09-01: "we should also add a help button." The brief wrote it out:
 *
 *   "A drawn `?` plank in the corner stack, present from the first frame of
 *   control, the one exception to §40.2's assembly rule because it exists for
 *   the student who has earned nothing yet. It opens one drawn card, no
 *   scrolling, readable by looking: the four keys (arrows, E, click, Esc) as
 *   pictures, what the three corner things are, and the sentence 'the line above
 *   your head is your task'. Same card from the pause menu. A teacher's whole
 *   answer to 'I don't know what to do' is 'press the question mark'."
 *
 * ---- WHY IT BREAKS THE ASSEMBLY RULE ON PURPOSE ---------------------------
 *
 * §40.2's law is that the HUD assembles as the game grants things: a control for
 * a thing you cannot do yet is furniture, and a screen of furniture is what the
 * emoji HUD was. Every other control in the corner obeys that and appears the
 * minute the run hands it over.
 *
 * This one cannot, and the reason is the whole point of it. The student who
 * needs help most is the one who has been granted NOTHING: thirty seconds into
 * an advisory period, no chart, no Handbook, no tokens, and a teacher across a
 * full room. If the button appeared only once the run had given them something,
 * it would arrive exactly after the moment it existed for.
 *
 * ---- AND IT MOUNTS OUTSIDE THE HUD'S OWN GATE -----------------------------
 *
 * `WorldHud` renders `<Hud>` only when `save.introDone`, which is correct for
 * the run's furniture and fatal for this. A student in the first two minutes has
 * no `introDone` and is precisely the audience. So `HelpButton` is mounted
 * beside the dialogue box, not inside the Hud, and it carries its own corner
 * position rather than sitting in `hud-stack`.
 *
 * ---- THE FOUR KEYS ARE DRAWN, AND NOTHING WAS GENERATED FOR THEM ----------
 *
 * "As pictures" is the requirement and a font glyph is not a picture
 * (`docs/ART.md`: "icons are drawn, never an emoji or a font glyph"). Nothing on
 * the platform is a keycap, and a keycap is not worth Ash's money, so the four
 * are built from art that already exists:
 *
 *   arrows  `icon_set/arrow`, the one drawing, turned in four quarter turns.
 *           A quarter turn of pixel art is lossless; anything else would not be.
 *   click   `pointer/hand`, drawn for exactly this and never used.
 *   E, Esc  the plank's own `key_cap`, which is the treatment every prompt in
 *           the game already uses for a key, so the student meets one shape for
 *           "a key" everywhere.
 *
 * When the platform is unreachable the marks fall back the way every other
 * `Glyph` does, to their own shape or to nothing, never to a system character.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { loadSave, subscribeSave } from '../save'
import { hudGrants } from './inventory'
import { usePanel } from '../ui/a11y'
import { Glyph, Plank } from '../ui/controls'
import { track } from '../telemetry'
import './help.css'

/** the one card, opened from the corner and from the pause sheet */
export function HelpCard({ onClose }: { onClose: () => void }) {
  const panel = usePanel({ onClose, label: 'How to play' })
  useEffect(() => { track('help_opened') }, [])
  return (
    <div className="hp-veil" onClick={onClose}>
      <div
        {...panel}
        className="hp-card kit-surface-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="hp-title">How to play</h2>

        {/* THE FOUR KEYS, AS PICTURES AND IN THE ORDER A STUDENT MEETS THEM.
            Move, then act, then the same act with a trackpad, then the way out
            of anything. Each row is a picture and at most four words, because
            the non-reader law says a student will not read a paragraph and this
            is the card built for the student who is already lost. */}
        <ul className="hp-keys">
          <li className="hp-key">
            <span className="hp-mark hp-arrows" aria-hidden="true">
              <Glyph piece="icon_set" face="arrow" size={20} className="hp-ar hp-ar-up" />
              <Glyph piece="icon_set" face="arrow" size={20} className="hp-ar hp-ar-left" />
              <Glyph piece="icon_set" face="arrow" size={20} className="hp-ar hp-ar-down" />
              <Glyph piece="icon_set" face="arrow" size={20} className="hp-ar hp-ar-right" />
            </span>
            <span className="hp-says">Arrow keys walk</span>
          </li>
          <li className="hp-key">
            <span className="hp-mark" aria-hidden="true"><span className="kit-plank-key hp-cap">E</span></span>
            <span className="hp-says">E opens what you are standing at</span>
          </li>
          <li className="hp-key">
            <span className="hp-mark" aria-hidden="true">
              <Glyph piece="pointer" face="hand" size={26} />
            </span>
            <span className="hp-says">Or click it</span>
          </li>
          <li className="hp-key">
            <span className="hp-mark" aria-hidden="true"><span className="kit-plank-key hp-cap">Esc</span></span>
            <span className="hp-says">Esc closes anything</span>
          </li>
        </ul>

        {/* THE SENTENCE THE BRIEF ASKS FOR, VERBATIM AND ON ITS OWN. It is the
            answer to "I don't know what to do", so it is not in the list with
            the keys; it is the line the card is really about. */}
        <p className="hp-task">The line above your head is your task.</p>

        {/* WHAT THE CORNER THINGS ARE. Named the way they are labelled on the
            plaques themselves, so a student can match a word to a word rather
            than reading a description of a picture. Each one is here whether or
            not the run has granted it, because this card is read by the student
            who has none of them and wants to know what is coming. */}
        <ul className="hp-corner">
          <li><b>Chart</b> every island you have found</li>
          <li><b>Handbook</b> what the school offers, and what you have collected</li>
          <li><b>Year sheet</b> where your season tokens go</li>
        </ul>

        {/* the real control, not a hand-assembled one. `Plank` is what draws the
            wood, carries the key cap and owns every state; writing the class
            names out by hand got the ink but not the plank underneath it. */}
        <Plank className="hp-close" keyCap="Esc" onClick={onClose}>Close</Plank>
      </div>
    </div>
  )
}

/* THE BUTTON. It carries its own corner slot rather than joining `hud-stack`,
 * because that stack belongs to the Hud and the Hud is gated on a run that this
 * button deliberately outlives. It wears the same drawn plaque as its three
 * neighbours: the brief called it a plank, and it was written before Round 2
 * turned the corner into carved plaques and Ash accepted them. A fourth thing in
 * a stack of three has to look like the three. */
export function HelpButton() {
  const [open, setOpen] = useState(false)
  /* HOW MANY PLAQUES ARE ABOVE IT, WHICH IS NOT A CONSTANT.
   *
   * The corner assembles as the run grants things, so on the first screen of a
   * fresh run there is nothing above this button and by year one there are
   * three. The first version hardcoded three slots and photographed the result:
   * in a run with the full stack it sat correctly under the Year sheet, and in
   * the control arm, where a plain button is 38 tall instead of 70, it floated
   * in a gap with nothing above it.
   *
   * `hudGrants` is the same reader the Hud itself uses to decide which plaques
   * exist, so the offset cannot drift from the thing it is measuring. The slot
   * HEIGHT stays in CSS, because the two arms draw a plaque at two heights and
   * only the stylesheet knows which arm is running. */
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  const g = hudGrants(loadSave())
  const above = (g.chart ? 1 : 0) + (g.handbook ? 1 : 0) + (g.tokens ? 1 : 0)
  return (
    <>
      <button
        className="hud-plaque hp-btn"
        style={{ '--hp-above': above } as CSSProperties}
        aria-label="How to play"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="hud-plaque-word hp-q">?</span>
      </button>
      {open && <HelpCard onClose={() => setOpen(false)} />}
    </>
  )
}
