/* THE CORD DRAPE (BRIEF-YEAR-ONE, beat 8).
 *
 * "Home. 3 min. The counselor drapes the first cord on him. The wall has three
 * things on it. The yearbook page turns in school words. Year two, next time."
 *
 * It is the last moment of the thirty minutes and it is the one that has to make
 * a freshman want the next thirty. The wall says what they did; this says what it
 * is turning into.
 *
 * ---- WHAT IS DRAPED, AND WHY IT IS NOT AN AWARD ---------------------------
 *
 * Nothing at Bonney Lake is earned after one year. Every honours cord is counted
 * at graduation and every service cord takes multiple years, which is a fact
 * about the school and not a limitation of the game: `progress.ts` records it and
 * §12.8 states it as a law, "a cord is partial progress and never a locked
 * achievement".
 *
 * So the counselor does not hand over an award, and this screen does not invent
 * one. It drapes the cord the student is FURTHEST ALONG toward, and says where
 * they stand on it in the school's own numbers. That is honest, it is specific
 * to what they actually chose, and it is a promise the game can keep: come back
 * and this becomes real.
 *
 * If a cord is genuinely closed, it says so instead. The two states are one
 * screen because they are one moment.
 *
 * ---- WHERE THE WORDS COME FROM --------------------------------------------
 *
 * `cordsOf`, which reads `docs/blhs/awards.md`. §14.14's law is that a school
 * criterion is quoted and never written, and nothing here composes a sentence
 * about an award: the name, the colours, the rule and the live reading are all
 * the cord's own.
 */
import { useEffect } from 'react'
import { loadSave } from '../save'
import { cordsOf } from '../progress'
import { onTheWall } from './wall'
import { usePanel } from '../ui/a11y'
import { Gauge, Glyph, Plank } from '../ui/controls'
import { track } from '../telemetry'
import './drape.css'

export function CordDrape({ year, onDone }: { year: number; onDone: () => void }) {
  const panel = usePanel({ onClose: onDone, label: 'The counselor drapes a cord' })
  const s = loadSave()

  /* THE ONE THE STUDENT IS CLOSEST TO. Earned first, then furthest along; a cord
   * nobody has moved at all is not draped on anybody, because a ribbon for a
   * thing you have not started is the flattery this game does not do. */
  const cord = cordsOf(s ?? ({} as never))
    .filter((c) => c.published && (c.earned || c.progress > 0))
    .sort((a, b) => Number(b.earned) - Number(a.earned) || b.progress - a.progress)[0] ?? null

  const filled = onTheWall(s, year)
  /* A CORD IS COUNTED AT GRADUATION AND NOWHERE ELSE. `cordsOf` can read a
   * GPA cord as met after one year, and the first capture of this card showed
   * High Honors with a full bar, a seal and "Earned." to a freshman
   * (STATE-OF-THE-GAME confusing 9). Gold, the seal and the word are for the
   * stage in year four; before that the card says where they stand and when
   * it counts. */
  const closed = !!cord?.earned && !!s?.graduated

  useEffect(() => {
    track('cord_draped', { year, cord: cord?.id ?? null, progress: cord?.progress ?? 0, wall: filled })
  }, [year, cord, filled])

  return (
    <div className="cd-veil">
      <div {...panel} className="cd-card kit-surface-panel">
        <p className="cd-who">The counselor</p>

        {cord ? (
          <>
            {/* THE CORD ITSELF, DRAPED. Two ribbons falling from a collar, which
                is the shape of the thing at a real ceremony.

                IT IS NOT GOLD UNTIL IT IS EARNED. `docs/ART.md` reserves the cord
                gold for "an earned honor and nothing else", and after one year
                nothing is earned: a gold ribbon here would be the game telling a
                freshman they had won something the school counts at graduation.
                Unearned it is drawn in the sea green this game uses for progress
                everywhere else, and it turns gold on the day it closes.

                AND IT IS NOT THE CORD'S OWN COLOURS, deliberately. Those are
                strings the school wrote, "black & silver", "green, teal &
                purple", "color not announced", and a parser that turned words
                into pixels would be inventing a picture of a real award. The
                colours are printed under the name in the school's own words and
                the ribbon stays the game's own. */}
            <div className={`cd-drape${closed ? ' cd-drape-earned' : ''}`} aria-hidden="true">
              <span className="cd-collar" />
              <span className="cd-fall cd-fall-l" />
              <span className="cd-fall cd-fall-r" />
              {closed && <Glyph piece="stamp" face="awarded" size={30} className="cd-seal" />}
            </div>

            <p className="cd-lead">{closed ? 'Your cord' : 'The cord you are closest to'}</p>
            <h2 className="cd-name">{cord.name}</h2>
            {/* the ribbon above is the game's own; the school's colours are
                printed so nobody reads a teal loop as "black and silver" */}
            <p className="cd-colors">Its real colours: {cord.colors}</p>

            {/* WHERE THEY STAND, IN THE SCHOOL'S NUMBERS. `detail` is the live
                reading `cordsOf` computes against the real criterion, so this is
                the same sentence the Handbook's cords board shows and the same
                one the yearbook's bar is drawn from. */}
            <Gauge value={cord.progress} label={`${cord.name}, ${cord.detail}`} className="cd-bar" />
            <p className="cd-stands">{closed ? 'Earned.' : cord.detail}</p>
            {!closed && (
              <p className="cd-when">
                {cord.earned
                  ? 'On track. Cords are counted at graduation, in year four. Keep this up and it is yours.'
                  : 'Not yet. Cords are counted at graduation, in year four. Keep going.'}
              </p>
            )}

            <p className="cd-rule">
              <span className="cd-rulelabel">Bonney Lake gives it for</span> {cord.rule}
            </p>
          </>
        ) : (
          /* NO CORD HAS MOVED, which is a real way to finish a first year and is
             not a failure. The counselor says what would start one rather than
             draping nothing and saying nothing. */
          <>
            <h2 className="cd-name">No cord started yet</h2>
            <p className="cd-stands">
              A cord takes more than one year. Pick something and stay with it, and this is where it shows.
            </p>
          </>
        )}

        <p className="cd-wall">
          {filled === 0
            ? 'No badges on your wall this year.'
            : `${filled} ${filled === 1 ? 'badge' : 'badges'} on your wall.`}
        </p>

        <div className="cd-foot">
          {/* ---- NO PROMISE ABOUT NEXT TIME, ANYWHERE -----------------------
              BRIEF-INTRO-FILM section 4, twice on one page: *"No 'Year two'
              wording anywhere; the intro does not end with a promise about next
              time."* This plank was "Year two, next time", which is the last
              control of the thirty minutes and was the game promising a session
              nobody has designed and nobody will play in an advisory block.

              The same shape as the other two things a student presses to say a
              piece of paper is finished, "That is my schedule" and "That is year
              one": a sentence about what just happened, which every reads-nothing
              harness classifies as forward and no student reads as a way back. */}
          <Plank size="lg" onClick={onDone}>That is my first cord</Plank>
        </div>
      </div>
    </div>
  )
}
