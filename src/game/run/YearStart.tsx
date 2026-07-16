import { useState } from 'react'
import { setFlag } from '../save'
import { VIGNETTES } from './vignettes'
import './run.css'

// The year-start vignette (§7.5, minute one of a year): Principal Panther, three lines,
// once per year, then never again (the flag remembers). Rides the world as a small card,
// not a cutscene — the Maw's staged version replaces this front when Session C's cave
// wiring lands; the lines and the flag stay the same.

export function YearStart({ year, onDone }: { year: number; onDone: () => void }) {
  const lines = VIGNETTES[year] ?? VIGNETTES[1]
  const [i, setI] = useState(0)
  const next = () => {
    if (i + 1 >= lines.length) { setFlag(`vignette:y${year}`); onDone() }
    else setI(i + 1)
  }
  return (
    <div className="ys-wrap" onClick={next}>
      <div className="ys-card">
        <div className="ys-speaker">Principal Panther · Year {year}</div>
        <div className="ys-text">{lines[i]}</div>
        <div className="ys-cue">🐾</div>
      </div>
    </div>
  )
}
