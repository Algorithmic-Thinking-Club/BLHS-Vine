/* the trophy wall: one frame per thing he chose, in every year, empty until done */
import { Fragment, useEffect, useState } from 'react'
import { loadSave } from '../save'
import { wallAll } from './wall'
import { usePanel } from '../ui/a11y'
import { Glyph, Plank } from '../ui/controls'
import { track } from '../telemetry'
import { yearWord } from './year'
import { play } from '../audio'
import './wall.css'

export function TrophyWall({ onClose }: { onClose: () => void }) {
  const panel = usePanel({ onClose, label: 'The trophy wall' })
  const s = loadSave()
  /* the case shows every year and not the current one: `wallOf(s)` defaults to the year the student is standing in, so opening it in year three before stamping that year's sheet showed one unearned Advisory frame and nothing else */
  const seats = wallAll(s)
  const filled = seats.filter((w) => w.earned).length

  useEffect(() => { track('wall_opened', { filled, of: seats.length }) }, [filled, seats.length])

  /* the wall fills frame by frame with a pop each, in the order the year happened, and only earned frames land because an outline appearing with a pop is a pop for a thing nobody did, and it runs once per opening so a save write behind the panel does not restart the fanfare */
  const [landed, setLanded] = useState(0)
  const earnedIds = seats.filter((w) => w.earned).map((w) => `${w.year}:${w.id}`)
  useEffect(() => {
    if (landed >= earnedIds.length) return
    const t = window.setTimeout(() => {
      setLanded((v) => v + 1)
      /* the same small sound the game plays whenever a thing is awarded */
      play('cork_pop')
    }, landed === 0 ? 420 : 460)
    return () => window.clearTimeout(t)
  }, [landed, earnedIds.length])
  /* how far down the run of filled frames the landing has got */
  const showing = (id: string) => earnedIds.indexOf(id) < landed

  return (
    <div className="tw-veil" onClick={onClose}>
      <div {...panel} className="tw-sheet kit-surface-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="tw-title">The trophy wall</h2>
        {/* the count is the headline, said in words rather than as a fraction */}
        {/* one word and one count, the same ones the drape and the yearbook use */}
        <p className="tw-lede">
          {seats.length === 0
            ? 'No badges yet. Pick your year and an empty frame appears for each thing you choose.'
            : filled === 0
              ? `No badges on the wall yet. ${seats.length} empty ${seats.length === 1 ? 'frame' : 'frames'}: finish a thing and its badge goes up here.`
              : `${filled} ${filled === 1 ? 'badge' : 'badges'} on the wall, ${seats.length - filled} ${seats.length - filled === 1 ? 'frame' : 'frames'} still empty.`}
        </p>

        {/* grouped by year, because four years of frames in one run is a list and a wall is a history: the heading is what makes year one's Advisory read as year one's rather than a duplicate of year two's */}
        <div className="tw-wall">
          {seats.map((w, i) => (
            <Fragment key={`${w.year}:${w.id}`}>
              {(i === 0 || seats[i - 1].year !== w.year) && (
                <h3 className="tw-year">Year {yearWord(w.year)}</h3>
              )}
            <article
              className={`tw-frame${w.earned && showing(`${w.year}:${w.id}`) ? ' tw-frame-full tw-frame-land' : ''}`}
              data-kind={w.kind}
            >
              {/* the plate is the state: a drawn stamp when earned, a dashed hole when not */}
              <span className="tw-plate" aria-hidden="true">
                {w.earned && showing(`${w.year}:${w.id}`)
                  ? <Glyph piece="stamp" face="awarded" size={34} />
                  : <span className="tw-hole" />}
              </span>
              <span className="tw-words">
                <span className="tw-name">{w.name}</span>
                {/* an earned frame never reads as an unearned one: badges pop in one at a time, and before its own pop every earned frame printed `w.wants`, the sentence saying what is still needed, so the animation decides the stamp and never the truth */}
                <span className={w.earned ? 'tw-got' : 'tw-wants'}>
                  {w.earned ? w.says : w.wants}
                </span>
              </span>
            </article>
            </Fragment>
          ))}
        </div>

        <div className="tw-foot">
          <Plank size="md" keyCap="Esc" onClick={onClose}>Back</Plank>
        </div>
      </div>
    </div>
  )
}
