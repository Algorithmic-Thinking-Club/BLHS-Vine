/* the trophy wall: one frame per thing this year, empty until that thing is finished */
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
            <article className={`tw-frame${w.earned ? ' tw-frame-full' : ''}`} key={w.id} data-kind={w.kind}>
              {/* the plate is the state: a drawn stamp when earned, a dashed hole when not */}
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
