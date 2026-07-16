import { useState } from 'react'
import { endYear, loadSave, setFlag } from '../save'
import { gpaOf, letterOf, cordsOf } from '../progress'
import { nudgeLine, yearStatus } from './year'
import { track } from '../telemetry'
import './run.css'

// THE YEARBOOK PAGE (§7.6) — the year's full-page spread: the inked GPA, every grade the
// year earned, cords inching along as threads, one gentle nudge, and the page turn that
// IS endYear(). The fourth turn is terminal: it sets graduated and points at the stage
// (§9's ceremony is its own build; the page is honest about what awaits). Marisol's
// opposite page joins when Ash approves the rival (§17.3). The art pass (a composed
// spread, the page-flip transition §12.1) is ledgered with the UI hero batch.

export function Yearbook({ onClose, onGraduate }: { onClose: () => void; onGraduate?: () => void }) {
  const [turned, setTurned] = useState(false)
  // the year this book is ABOUT — snapshotted, because turn() advances the save under us
  const [year] = useState(() => loadSave()?.year ?? 1)
  const s = loadSave()
  if (!s) return null
  const st = yearStatus(s)
  const gpa = gpaOf(s)
  const yearEntries = s.ledger.filter((e) => e.year === year)
  const cords = cordsOf(s).filter((c) => c.earned || c.progress > 0).sort((a, b) => b.progress - a.progress).slice(0, 4)
  const nudge = nudgeLine(st)
  const lastYear = year >= 4

  const turn = () => {
    track('year_end', {
      year, gpa, entries: yearEntries.map((e) => ({ id: e.id, grade: e.grade })),
      stickers: s.stickers.length, facts: s.facts.length, nudge,
    })
    setFlag(`yearbook:y${year}`)
    endYear()
    setTurned(true)
  }

  return (
    <div className="yb-veil">
      <div className="yb-page">
        {!turned ? (
          <>
            <div className="yb-head">
              <span className="yb-title">Yearbook</span>
              <span className="yb-year">Year {year}</span>
            </div>

            <div className="yb-body">
            <div className="yb-gpa">
              <span className="yb-gpanum">{gpa !== null ? gpa.toFixed(2) : '—'}</span>
              <span className="yb-gpaletter">{gpa !== null ? letterOf(gpa) : ''}</span>
              <span className="yb-gpalabel">grade point average, inked</span>
            </div>

            <div className="yb-sect">The year on paper</div>
            {yearEntries.map((e) => (
              <div className="yb-row" key={e.id}>
                <span className="yb-rowtitle">{e.title}</span>
                <span className="yb-rowmeta">{e.season} · {letterOf(e.grade)}{e.retaken ? ' · retaken' : ''}</span>
              </div>
            ))}
            {yearEntries.length === 0 && <div className="yb-dim">A quiet year on the transcript.</div>}

            {st.voyages.length > 0 && (
              <>
                <div className="yb-sect">Seasons spent</div>
                {st.voyages.map((v) => (
                  <div className="yb-row" key={v.season}>
                    <span className="yb-rowtitle">{v.name}</span>
                    <span className="yb-rowmeta">{v.season} · {v.done ? 'sailed' : v.playable ? 'the dock waits' : 'island still rising'}</span>
                  </div>
                ))}
              </>
            )}

            {cords.length > 0 && (
              <>
                <div className="yb-sect">Threads becoming rope</div>
                {cords.map((c) => (
                  <div className="yb-row" key={c.id}>
                    <span className="yb-rowtitle">{c.name}</span>
                    <span className="yb-cordbar"><span style={{ width: `${Math.round(c.progress * 100)}%` }} /></span>
                  </div>
                ))}
              </>
            )}

            <div className="yb-nudge">{nudge}</div>
            </div>

            <button className="yb-turn" onClick={turn}>
              {lastYear ? 'Close the book' : 'Turn the page'}
            </button>
          </>
        ) : (
          <div className="yb-turned">
            {lastYear ? (
              <>
                <div className="yb-title">Four years, written.</div>
                <div className="yb-dim">The falls terrace is dressed. They are waiting on you now.</div>
                {onGraduate
                  ? <button className="yb-turn" onClick={onGraduate}>Walk the stage</button>
                  : <button className="yb-turn" onClick={onClose}>Back to the sea</button>}
              </>
            ) : (
              <>
                <div className="yb-title">Year {year + 1}.</div>
                <div className="yb-dim">Three new tokens in hand. The chart table is waiting.</div>
                <button className="yb-turn" onClick={onClose}>Back to the sea</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
