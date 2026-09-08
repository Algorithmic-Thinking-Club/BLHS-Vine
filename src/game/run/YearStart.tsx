import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { setFlag } from '../save'
import { announce, usePanel } from '../ui/a11y'
import { Glyph, PortraitFrame, useFace } from '../ui/controls'
import { PP_FACE } from '../beats/y1'
import { bandFromRects, setUiBand } from '../ui/frame'
import { VIGNETTES } from './vignettes'
import './run.css'

/* the year-start vignette: Principal Panther, three lines, once per year */

/* the advance cue: a drawn paw when the kit is worn, and always the words beside it */
export function AdvanceCue({ words, className = '' }: { words: string; className?: string }) {
  const drawn = useFace('cue', 'frame_1')
  return (
    <span className={`ys-cue ${className}`}>
      {drawn && (
        <span className="ys-paw" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <Glyph key={n} piece="cue" face={`frame_${n}`} size={20} className={`ys-paw-f ys-paw-f${n}`} />
          ))}
        </span>
      )}
      <span className="ys-cue-word">{words}</span>
    </span>
  )
}

export function YearStart({ year, onDone }: { year: number; onDone: () => void }) {
  const lines = VIGNETTES[year] ?? VIGNETTES[1]
  const [i, setI] = useState(0)
  const cardEl = useRef<HTMLDivElement>(null)
  const panel = usePanel({ label: `Principal Panther, year ${year}`, closeOnEscape: false })
  const last = i + 1 >= lines.length
  const next = () => {
    if (last) { setFlag(`vignette:y${year}`); onDone() }
    else setI(i + 1)
  }
  /* space and enter go on, the same contract the dialogue box uses */
  const advance = useRef(next)
  advance.current = next
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      e.preventDefault()
      advance.current()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  useEffect(() => { announce(`Principal Panther. ${lines[i]}`) }, [lines, i])
  /* the card reports its own height, so nothing else along the bottom is drawn behind it */
  useLayoutEffect(() => {
    const measure = () => setUiBand('yearstart', bandFromRects([cardEl.current]))
    measure()
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure); setUiBand('yearstart', 0) }
  }, [i])
  return (
    <div className="ys-veil" {...panel}>
      <div className="ys-wrap" onClick={next}>
        <div
          ref={cardEl}
          className="ys-card kit-surface-dialogue"
          role="button"
          tabIndex={0}
          aria-label={last ? 'Read it and begin the year' : `Read it and go on, line ${i + 1} of ${lines.length}`}
          onClick={(e) => { e.stopPropagation(); next() }}
        >
          {/* the principal's face, drawn in the one frame every portrait uses */}
          <span className="ys-body">
            <PortraitFrame id={PP_FACE} />
            <span className="ys-col">
              <span className="ys-speaker">Principal Panther · Year {year}</span>
              <span className="ys-text">{lines[i]}</span>
            </span>
          </span>
          <span className="ys-foot">
            {/* how many lines are left, as a row of filled and open marks */}
            <span className="ys-dots" aria-hidden="true">
              {lines.map((_, n) => (
                <span key={n} className={`ys-dot${n <= i ? ' ys-dot-on' : ''}`} />
              ))}
            </span>
            <AdvanceCue words={last ? 'begin the year' : 'go on'} />
          </span>
        </div>
      </div>
    </div>
  )
}
