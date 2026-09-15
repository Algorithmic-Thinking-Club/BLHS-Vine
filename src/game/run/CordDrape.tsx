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

  /* every cord earned is draped and then the nearest unearned one underneath, because showing one under an earned-first sort re-draped the same ribbon every year while everything earned afterwards went unmentioned */
  const all = cordsOf(s ?? ({} as never)).filter((c) => c.published)
  const won = all.filter((c) => c.earned)
  /* a cord nobody has moved at all is not draped on anybody: a ribbon for a thing you have not started is the flattery this game does not do */
  const near = all
    .filter((c) => !c.earned && c.progress > 0)
    .sort((a, b) => b.progress - a.progress)[0] ?? null
  const cord = won[0] ?? near

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

            {!!won.length && (
              <>
                <p className="cd-lead">{won.length === 1 ? 'Your cord' : 'Your cords'}</p>
                <ul className="cd-list">
                  {won.map((c) => (
                    <li className="cd-row" key={c.id}>
                      <Glyph piece="stamp" face="awarded" size={18} className="cd-rowseal" />
                      <span className="cd-rowname">{c.name}</span>
                      {/* the ribbon above is the game's own, so the school's colours are printed to stop a teal loop being read as black and silver */}
                      <span className="cd-rowcolors">{c.colors}</span>
                    </li>
                  ))}
                </ul>
                {!s?.graduated && (
                  <p className="cd-when">
                    Cords are counted at graduation, in year four. Keep this up and they are yours.
                  </p>
                )}
              </>
            )}

            {near && (
              <>
                <p className="cd-lead">{won.length ? 'Working towards' : 'The cord you are closest to'}</p>
                <h2 className="cd-name">{near.name}</h2>
                <p className="cd-colors">Its real colours: {near.colors}</p>
                {/* where they stand on it, in the school's own numbers */}
                <Gauge value={near.progress} label={`${near.name}, ${near.detail}`} className="cd-bar" />
                <p className="cd-stands">{near.detail}</p>
                <p className="cd-rule">
                  <span className="cd-rulelabel">Bonney Lake gives it for</span> {near.rule}
                </p>
              </>
            )}
          </>
        ) : (
          /* no cord has moved, which is a real way to finish a first year and not a failure, so the counselor says what would start one rather than draping nothing */
          <>
            <h2 className="cd-name">No cord started yet</h2>
            <p className="cd-stands">
              A cord takes more than one year. Pick something and stay with it, and this is where it shows.
            </p>
          </>
        )}

        <p className="cd-wall">
          {/* this year's count has to be said as this year's: `onTheWall` takes a year and this passes one, so the sentence was counting a year and reporting it as a total, while the wall itself spans the run in `run/wall.ts` */}
          {filled === 0
            ? 'No badges on your wall this year.'
            : `${filled} ${filled === 1 ? 'badge' : 'badges'} on your wall this year.`}
        </p>

        <div className="cd-foot">
          {/* the closing button says what just happened and promises no next time */}
          <Plank size="lg" onClick={onDone}>
            {won.length > 1 ? 'That is my cords' : won.length === 1 ? 'That is my cord' : 'Keep going'}
          </Plank>
        </div>
      </div>
    </div>
  )
}
