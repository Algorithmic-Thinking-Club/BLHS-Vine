/* the trophy wall: one frame per thing this year, empty until that thing is finished */
import { useEffect, useState } from 'react'
import { loadSave } from '../save'
import { wallOf } from './wall'
import { usePanel } from '../ui/a11y'
import { Glyph, Plank } from '../ui/controls'
import { track } from '../telemetry'
import { play } from '../audio'
import './wall.css'

export function TrophyWall({ onClose }: { onClose: () => void }) {
  const panel = usePanel({ onClose, label: 'The trophy wall' })
  const s = loadSave()
  const seats = wallOf(s)
  const filled = seats.filter((w) => w.earned).length

  useEffect(() => { track('wall_opened', { filled, of: seats.length }) }, [filled, seats.length])

  /* ---- THE WALL FILLS FRAME BY FRAME, WITH A POP EACH --------------------
   *
   * ASH, 2026-09-08 item 6: *"the wall filling frame by frame with a pop each"*.
   *
   * The panel used to open with every badge already on it, which is a readout of
   * a state. This is the same information as an EVENT: the frames land one at a
   * time in the order the year happened, each with the small sound the game
   * already uses for a thing being awarded. It is the only moment in year one
   * where a student sees everything he did in one picture, and it was arriving
   * with no more ceremony than a settings sheet.
   *
   * EMPTY FRAMES ARE ALREADY THERE. Only the filled ones land, because an outline
   * appearing with a pop is a pop for a thing he did not do.
   *
   * AND IT ONLY EVER RUNS ONCE PER OPENING, so a save write behind the panel (the
   * closing film records as it goes) does not restart the fanfare. */
  const [landed, setLanded] = useState(0)
  const earnedIds = seats.filter((w) => w.earned).map((w) => w.id)
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

        <div className="tw-wall">
          {seats.map((w) => (
            <article
              className={`tw-frame${w.earned && showing(w.id) ? ' tw-frame-full tw-frame-land' : ''}`}
              key={w.id}
              data-kind={w.kind}
            >
              {/* the plate is the state: a drawn stamp when earned, a dashed hole when not */}
              <span className="tw-plate" aria-hidden="true">
                {w.earned && showing(w.id)
                  ? <Glyph piece="stamp" face="awarded" size={34} />
                  : <span className="tw-hole" />}
              </span>
              <span className="tw-words">
                <span className="tw-name">{w.name}</span>
                <span className={w.earned && showing(w.id) ? 'tw-got' : 'tw-wants'}>
                  {w.earned && showing(w.id) ? w.says : w.wants}
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
