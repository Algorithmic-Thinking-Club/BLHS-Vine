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
 *
 * ---- AND IT IS HOW YOU LEAVE (BRIEF-PLAYTHROUGH-1 LAW 3) ------------------
 *
 * Ash played the deploy on 2026-09-03 and ruled: "Help is bottom right, and it
 * is how you leave. Its card carries the controls as pictures, what the three
 * corner buttons are, the task line, and the pause sheet's own buttons: Back,
 * Year Sheet, Handbook, Settings, Save and leave. A student who does not know
 * Esc exists can still leave. Esc keeps working."
 *
 * THE FAILURE THAT RULING IS ABOUT. Every way out of this game went through the
 * Escape key. The pause sheet is behind Escape, "Save and leave" is inside the
 * pause sheet, and nothing on the screen said either of those things existed. A
 * freshman on a Chromebook trackpad who has never played a game with a pause
 * menu had no visible exit at all, in a room where the teacher is busy.
 *
 * So the five actions are HERE, as real controls, in the words the pause sheet
 * uses. They are not a copy of that sheet: they are the same five doors reached
 * through the same bus the sheet reaches them through, so neither can drift.
 *
 * `requestUi` is the door and the Hud is what answers it, which means this card
 * works identically whether it was opened from the corner or from the pause
 * sheet, and it works from a scene the Hud is not mounted on by simply not
 * offering the three that need one.
 */
import { useEffect, useState } from 'react'
import { usePanel } from '../ui/a11y'
import { Glyph, Plank } from '../ui/controls'
import { track } from '../telemetry'
import { requestUi, uiListenerCount } from '../ui-bus'
import { useNavMaybe } from '../../app/SceneManager'
import './help.css'

/** the one card, opened from the corner and from the pause sheet */
export function HelpCard({ onClose }: { onClose: () => void }) {
  const panel = usePanel({ onClose, label: 'How to play' })
  const nav = useNavMaybe()
  /* WHETHER ANYBODY IS LISTENING FOR A PANEL. `requestUi` answers false when no
   * Hud is mounted, which is every frame before the intro is done. Asked once on
   * open with a harmless request rather than guessed from the save, because the
   * thing that matters is whether the door will OPEN, not whether the run has
   * got far enough that it ought to. */
  const [hudUp, setHudUp] = useState(false)
  useEffect(() => { setHudUp(uiListenerCount() > 0) }, [])
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

        {/* ---- THE FIVE DOORS, WHICH ARE THE POINT OF LAW 3 -----------------
            The pause sheet's own buttons, in its own words, reached through the
            same bus it reaches them through. "Back" first because it is what
            most presses of this card want, and "Save and leave" last because it
            is the one that ends the session.

            The middle three ask the Hud, and the Hud is only mounted once a run
            is under way, so on the title or mid-intro they are not offered: a
            button that does nothing is worse than a button that is not there,
            and this is the one card a lost student is told to trust. */}
        <div className="hp-doors">
          <Plank className="hp-door" keyCap="Esc" onClick={onClose}>Back</Plank>
          {hudUp && <Plank className="hp-door" onClick={() => { onClose(); requestUi('planner') }}>Year sheet</Plank>}
          {hudUp && <Plank className="hp-door" onClick={() => { onClose(); requestUi('handbook') }}>Handbook</Plank>}
          {hudUp && <Plank className="hp-door" onClick={() => { onClose(); requestUi('settings') }}>Settings</Plank>}
          {nav && <Plank className="hp-door" onClick={() => { onClose(); nav.go('title') }}>Save and leave</Plank>}
        </div>
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
  /* IT NO LONGER MEASURES ANYTHING. The first version counted the plaques above
   * it, because it sat under a stack whose height changed with what the run had
   * granted. It is in the opposite corner now (law 3) and that corner is a fixed
   * point, so the arithmetic and the save subscription both went with it. */
  return (
    <>
      <button
        className="hud-plaque hp-btn"
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
