import { useState } from 'react'
import { endYear, loadSave, setFlag } from '../save'
import { track } from '../telemetry'
import { threadWidth, yearbookPage, yearbookYears, yearTurned } from './yearbook-page'
import './run.css'

/* THE YEARBOOK PAGE (§7.6): the year's full-page spread, and the page turn that
 * IS `endYear()`. The fourth turn is terminal, setting graduated and pointing at
 * the stage.
 *
 * WHAT THE COMPONENT DOES AND DOES NOT DECIDE. Everything about what is on the
 * page is `yearbook.ts`, which is a pure function of the save and a year, so the
 * page a test renders and the page a student reads are the same document. This
 * file draws it and owns exactly two behaviours: which year is open, and the
 * turn.
 *
 * PAST PAGES ARE REACHABLE, which is §80.6's own word and the reason the year is
 * state rather than a snapshot of `s.year`. The spine along the bottom holds one
 * tab per year lived, and a turned year opens read-only: there is no turn button
 * on a page that has already turned, because the turn is `endYear` and endYear is
 * not something a student may do twice.
 *
 * The composed art spread and the page-flip transition ride the UI hero batch. */

export function Yearbook({ onClose, onGraduate }: { onClose: () => void; onGraduate?: () => void }) {
  const [turned, setTurned] = useState(false)
  // the year this book is OPEN AT. Starts on the live one; the spine moves it.
  const [year, setYear] = useState(() => loadSave()?.year ?? 1)
  const s = loadSave()
  if (!s) return null

  const page = yearbookPage(s, year)
  const years = yearbookYears(s)
  /* THE TURN BELONGS TO THE LIVE YEAR, ONLY ONCE, AND ONLY WHEN THE YEAR IS
   * REALLY OWED NOTHING. A page reached through the spine or off the sheet's
   * shelf is a record and never a control: without the `ready` half a student
   * could open the book in October and end year one by pressing a button. */
  const canTurn = page.current && !page.turned && page.ready
  const lastYear = year >= 4

  const turn = () => {
    track('year_end', {
      year, gpa: page.gpa,
      entries: s.ledger.filter((e) => e.year === year).map((e) => ({ id: e.id, grade: e.grade })),
      stickers: s.stickers.length, facts: s.facts.length, nudge: page.nudge,
    })
    setFlag(`yearbook:y${year}`)
    endYear()
    setTurned(true)
  }

  return (
    <div className="yb-veil">
      <div className="yb-page kit-surface-panel">
        {!turned ? (
          <>
            <div className="yb-head">
              <span className="yb-title">Yearbook</span>
              <span className="yb-year">Year {page.year}</span>
            </div>

            <div className="yb-body">
              <div className="yb-gpa">
                <span className="yb-gpanum">{page.gpa !== null ? page.gpa.toFixed(2) : '—'}</span>
                <span className="yb-gpaletter">{page.letter}</span>
                <span className="yb-gpalabel">grade point average, inked</span>
              </div>

              {/* EVERY SECTION, EVERY YEAR, IN ONE ORDER. An empty one says it is
                  empty rather than vanishing, because a heading a student never
                  saw is a part of the year they never knew they could have. */}
              {page.sections.map((sec) => (
                <div key={sec.id}>
                  <div className="yb-sect">{sec.heading}</div>
                  {sec.caveat && <div className="yb-caveat">{sec.caveat}</div>}
                  {sec.rows.length === 0 && <div className="yb-dim">{sec.empty}</div>}
                  {sec.rows.map((r) => (
                    <div className="yb-row" key={sec.id + r.key}>
                      <span className="yb-rowtitle">{r.title}</span>
                      {sec.id === 'threads'
                        ? <span className="yb-cordbar"><span style={{ width: `${threadWidth(s, r.key)}%` }} /></span>
                        : <span className="yb-rowmeta">{r.meta}</span>}
                    </div>
                  ))}
                </div>
              ))}

              <div className="yb-nudge">{page.nudge}</div>
            </div>

            {years.length > 1 && (
              <div className="yb-spine">
                {years.map((y) => (
                  <button
                    key={y}
                    className={`yb-tab ${y === year ? 'yb-tab-on' : ''}`}
                    onClick={() => setYear(y)}
                  >
                    Year {y}{yearTurned(s, y) ? ' ·' : ''}
                  </button>
                ))}
              </div>
            )}

            {canTurn ? (
              <button className="yb-turn" onClick={turn}>
                {lastYear ? 'Close the book' : 'Turn the page'}
              </button>
            ) : (
              <button className="yb-turn" onClick={onClose}>
                {page.turned ? 'Close the book' : 'Back to the sea'}
              </button>
            )}
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
