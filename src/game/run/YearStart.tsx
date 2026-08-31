import { useLayoutEffect, useRef, useState } from 'react'
import { setFlag } from '../save'
import { bandFromRects, setUiBand } from '../ui/frame'
import { VIGNETTES } from './vignettes'
import './run.css'

// The year-start vignette (§7.5, minute one of a year): Principal Panther, three lines,
// once per year, then never again (the flag remembers). Rides the world as a small card,
// not a cutscene — the Maw's staged version replaces this front when Session C's cave
// wiring lands; the lines and the flag stay the same.

export function YearStart({ year, onDone }: { year: number; onDone: () => void }) {
  const lines = VIGNETTES[year] ?? VIGNETTES[1]
  const [i, setI] = useState(0)
  const cardEl = useRef<HTMLDivElement>(null)
  const next = () => {
    if (i + 1 >= lines.length) { setFlag(`vignette:y${year}`); onDone() }
    else setI(i + 1)
  }
  /* THIS CARD IS ALONG THE BOTTOM OF THE WINDOW TOO, so it says how tall it is
   * for the same reason the dialogue box does (src/game/ui/frame.ts). It lands
   * in the same second as a map arrival, so before this the arrival card was
   * drawn entirely behind it and the camera composed the body into it: on the
   * Maw the year's first line covered the place card every single time. */
  useLayoutEffect(() => {
    const measure = () => setUiBand('yearstart', bandFromRects([cardEl.current]))
    measure()
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure); setUiBand('yearstart', 0) }
  }, [i])
  return (
    <div className="ys-wrap" onClick={next}>
      <div ref={cardEl} className="ys-card kit-surface-dialogue">
        <div className="ys-speaker">Principal Panther · Year {year}</div>
        <div className="ys-text">{lines[i]}</div>
        <div className="ys-cue">🐾</div>
      </div>
    </div>
  )
}
