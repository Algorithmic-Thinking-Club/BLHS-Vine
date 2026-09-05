/* THE TROPHY WALL (BRIEF-YEAR-ONE, beats 4 to 8).
 *
 * A seat for every thing this year, empty until it is finished. The outline and
 * the trophy are one object in two states, which is the whole trick: a student
 * who has just picked their year sees the SHAPE of what they are about to earn,
 * with holes in it, and wants to fill them. `wall.ts` works out what the seats
 * are and what is in them; this draws it.
 *
 * ---- WHY IT IS A SURFACE AND NOT THE ROOM ---------------------------------
 *
 * The Maw's own wall says, in its Python, "no panel at all. The wall itself is
 * the readout", and that is the better design and it is not available yet: the
 * room's wall is bound to ONE drawn placement, so what the world can express
 * today is a shelf that is there or a shelf that is not. Filling it trophy by
 * trophy needs a drawn placement per trophy, which is Ash's hands in MAPVIS and
 * is not on this brief's critical path.
 *
 * So this is the readout until the room can be it, and it is deliberately built
 * so that day is a deletion rather than a rewrite: nothing here holds state, the
 * seats come from the save, and an island that wants to fill a real shelf reads
 * the same `wallOf`.
 *
 * ---- WHAT A STUDENT WHO READS NOTHING SEES -------------------------------
 *
 * A row of frames. Some have something in them and some are empty, and the empty
 * ones say in four words what would go there. That is the self-evident law's
 * "one thing is lit" applied to a payoff screen: the next thing to do is the
 * nearest hole.
 */
import { useEffect } from 'react'
import { loadSave } from '../save'
import { wallOf } from './wall'
import { usePanel } from '../ui/a11y'
import { Glyph, Plank } from '../ui/controls'
import { track } from '../telemetry'
import './wall.css'

export function TrophyWall({ onClose }: { onClose: () => void }) {
  const panel = usePanel({ onClose, label: 'The trophy wall' })
  const s = loadSave()
  const seats = wallOf(s)
  const filled = seats.filter((w) => w.earned).length

  useEffect(() => { track('wall_opened', { filled, of: seats.length }) }, [filled, seats.length])

  return (
    <div className="tw-veil" onClick={onClose}>
      <div {...panel} className="tw-sheet kit-surface-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="tw-title">The trophy wall</h2>
        {/* THE COUNT IS THE HEADLINE, because it is the one number a student
            checks and because beat 8's own sentence is a count: "the wall has
            three things on it". It is said in words rather than as a fraction,
            since a fraction reads as a score and this is not one. */}
        {/* ONE WORD AND ONE COUNT. Thor said "no badges", this said "1 of 5
            frames filled", the drape said "3 things", the yearbook said "no
            badges yet" about a different list (STATE-OF-THE-GAME confusing 9).
            The thing on the wall is a BADGE, the count is how many frames are
            filled, and the drape and the yearbook read the same `onTheWall`. */}
        <p className="tw-lede">
          {seats.length === 0
            ? 'No badges yet. Pick your year and an empty frame appears for each thing you choose.'
            : filled === 0
              ? `No badges on the wall yet. ${seats.length} empty ${seats.length === 1 ? 'frame' : 'frames'}: finish a thing and its badge goes up here.`
              : `${filled} ${filled === 1 ? 'badge' : 'badges'} on the wall, ${seats.length - filled} ${seats.length - filled === 1 ? 'frame' : 'frames'} still empty.`}
        </p>

        <div className="tw-wall">
          {seats.map((w) => (
            <article className={`tw-frame${w.earned ? ' tw-frame-full' : ''}`} key={w.id} data-kind={w.kind}>
              {/* THE PLATE IS THE STATE, AND IT IS A SHAPE. A filled frame wears
                  the kit's drawn `awarded` stamp; an empty one wears a dashed
                  hole the size of the stamp, so the row reads as "these two are
                  done and those three are not" before a single word is read. */}
              <span className="tw-plate" aria-hidden="true">
                {w.earned
                  ? <Glyph piece="stamp" face="awarded" size={34} />
                  : <span className="tw-hole" />}
              </span>
              <span className="tw-words">
                <span className="tw-name">{w.name}</span>
                <span className={w.earned ? 'tw-got' : 'tw-wants'}>
                  {w.earned ? w.says : w.wants}
                </span>
              </span>
            </article>
          ))}
        </div>

        <div className="tw-foot">
          <Plank size="md" keyCap="Esc" onClick={onClose}>Back</Plank>
        </div>
      </div>
    </div>
  )
}
