/* the closing screen where the counselor drapes the cord the student is closest to */
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
  /* a cord only counts at graduation, so the gold and the seal wait for year four */
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
            {/* the cord itself: two ribbons from a collar, gold only once it is earned */}
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

            {/* where they stand on it, in the school's own numbers */}
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
          {/* the closing button says what just happened and promises no next time */}
          <Plank size="lg" onClick={onDone}>That is my first cord</Plank>
        </div>
      </div>
    </div>
  )
}
