import { useEffect, useState, type CSSProperties } from 'react'
import { loadSave } from '../save'
import { CordDrape } from './CordDrape'
import { YearCard } from './YearCard'
import { track } from '../telemetry'
import { announce, tabRowKeyDown, usePanel } from '../ui/a11y'
import { Chip, Gauge, Glyph, Plank, Tab, useKitReady } from '../ui/controls'
import { prefersReducedMotion } from '../ui/motion'
import {
  turnYearPage, yearbookPage, yearbookYears, yearTurned,
  type GpaMove, type YearbookRow, type YearbookSection,
} from './yearbook-page'
import { yearWord } from './year'
import { cinemaOn } from '../stage/cinema'
import './run.css'

/* the year's full yearbook spread, and the page turn that is the year ending */

/* how long one section waits before it lands, and six sections at 130ms is under a second for the whole page, so it reads as a composition rather than a load */
const STEP_MS = 130

/* the gpa inking itself: written in the first year, travelling after that, still when it held */
function useInkedNumber(from: number | null, to: number | null, move: GpaMove): number | null {
  const travels = (move === 'up' || move === 'down') && from !== null && to !== null
  const [shown, setShown] = useState<number | null>(travels && !prefersReducedMotion() ? from : to)
  useEffect(() => {
    if (!travels || prefersReducedMotion()) { setShown(to); return }
    const a = from as number
    const b = to as number
    const started = performance.now()
    const RUN_MS = 900
    let raf = requestAnimationFrame(function step(now: number) {
      const k = Math.min(1, (now - started) / RUN_MS)
      /* eased out so the last hundredths settle, because a number that arrives at speed reads as a counter rather than as ink drying */
      setShown(a + (b - a) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(step)
      else setShown(b)
    })
    return () => cancelAnimationFrame(raf)
  }, [from, to, travels])
  return shown
}

/* the movement of the number said in words, so it is not carried by colour alone */
function moveWords(move: GpaMove, from: number | null): string {
  if (move === 'up' && from !== null) return `up from ${from.toFixed(2)} last year`
  if (move === 'down' && from !== null) return `down from ${from.toFixed(2)} last year`
  if (move === 'held' && from !== null) return 'exactly where it stood last year'
  return 'your first GPA'
}

/* ---- ONE ROW ------------------------------------------------------------- */

function Row({ row, section }: { row: YearbookRow; section: YearbookSection['id'] }) {
  if (section === 'marks') {
    /* a mark is a drawn plate with a stamp on it, not a line of text */
    return (
      <li className="yb-row yb-row-mark">
        <Chip state="plate_lit" className="yb-markchip">
          <Glyph piece="stamp" face="awarded" size={18} />
        </Chip>
        <span className="yb-rowtitle">{row.title}</span>
        <span className="yb-rowmeta">{row.meta}</span>
      </li>
    )
  }

  if (section === 'threads') {
    /* a cord is partial progress on a real number, with the school's criterion quoted */
    return (
      <li className={`yb-row yb-row-thread${row.done ? ' yb-row-done' : ''}`}>
        <span className="yb-threadhead">
          <span className="yb-rowtitle">{row.title}</span>
          {row.done
            ? (
              <span className="yb-earned">
                <Glyph piece="stamp" face="approved" size={20} />
                <span className="yb-earnedword">earned</span>
              </span>
            )
            : <span className="yb-rowmeta">{row.meta}</span>}
        </span>
        <Gauge value={row.progress ?? 0} label={`${row.title}, ${row.meta}`} />
        {/* the criterion itself lives in the Handbook, one press away */}
      </li>
    )
  }

  return (
    <li className="yb-row">
      {row.face && <Glyph piece={row.face[0]} face={row.face[1]} size={20} className="yb-rowmark" />}
      <span className="yb-rowtitle">{row.title}</span>
      <span className="yb-rowmeta">{row.meta}</span>
    </li>
  )
}

/* ---- ONE SECTION, WITH ITS PLACE IN THE COMPOSITION ---------------------- */

function Section({ sec, step }: { sec: YearbookSection; step: number }) {
  return (
    <section className="yb-sect" style={{ '--yb-step': `${step * STEP_MS}ms` } as CSSProperties}>
      <h3 className="yb-secthead">{sec.heading}</h3>
      {/* a section showing something other than what its heading implies says so right under the heading, in pencil */}
      {sec.caveat && <p className="yb-caveat">{sec.caveat}</p>}
      {sec.rows.length === 0
        /* an empty section says it is empty rather than vanishing, because a heading never seen is a part of the year the student never knew they could have */
        ? <p className="yb-empty">{sec.empty}</p>
        : <ul className="yb-rows">{sec.rows.map((r) => <Row key={sec.id + r.key} row={r} section={sec.id} />)}</ul>}
    </section>
  )
}

/* ---- THE PAGE ------------------------------------------------------------ */

export function Yearbook({ onClose, onGraduate }: { onClose: () => void; onGraduate?: () => void }) {
  const [turned, setTurned] = useState(false)
  const [draping, setDraping] = useState(false)
  // the year this book is OPEN AT. Starts on the live one; the spine moves it.
  const [year, setYear] = useState(() => loadSave()?.year ?? 1)
  const panel = usePanel({ label: 'The yearbook', onClose })
  useKitReady()
  const s = loadSave()
  const page = s ? yearbookPage(s, year) : null
  const shown = useInkedNumber(page?.priorGpa ?? null, page?.gpa ?? null, page?.move ?? 'first')

  /* the number and its movement said out loud for a screen reader */
  useEffect(() => {
    if (!page) return
    announce(page.gpa === null
      ? `Year ${page.year}. Nothing on the transcript yet.`
      : `Year ${page.year}. Grade point average ${page.gpa.toFixed(2)}, ${moveWords(page.move, page.priorGpa)}.`)
  }, [page?.year, page?.gpa, page?.move, page?.priorGpa])

  if (!s || !page) return null

  const years = yearbookYears(s)
  /* the turn belongs to the live year, once, and only when the year owes nothing */
  const canTurn = page.current && !page.turned && page.ready
  const lastYear = year >= 4

  const turn = () => {
    track('year_end', {
      year, gpa: page.gpa,
      entries: s.ledger.filter((e) => e.year === year).map((e) => ({ id: e.id, grade: e.grade })),
      stickers: s.stickers.length, facts: s.facts.length, nudge: page.nudge,
    })
    /* one write for the flag and the year, so a failure cannot land between them */
    turnYearPage(s, year)
    setTurned(true)
    /* the counselor drapes the first cord, after the write, as the last screen */
    setDraping(true)
  }

  const move = page.move

  /* inside the film the book is one card rather than the full spread */
  const inFilm = cinemaOn()

  if (draping) {
    return (
      <CordDrape
        year={year}
        /* the film does not go back to a book it has already shown, so the drape is the last screen and the corner is what comes after it */
        onDone={() => { setDraping(false); if (inFilm) onClose() }}
      />
    )
  }

  if (inFilm) {
    return <YearCard year={year} page={page} onDone={canTurn ? turn : onClose} />
  }

  return (
    <div className="yb-veil" onClick={onClose}>
      <div className="yb-page kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        {!turned ? (
          <>
            <header className="yb-head">
              <h2 className="yb-title">Yearbook</h2>
              {/* a year that can still be closed says its number and nothing else */}
              <span className="yb-year">
                Year {page.year}
                {!(page.current && !page.turned && page.ready) && (
                  <span className="yb-yearstate">
                    {page.turned ? 'closed' : page.current ? 'still open' : 'a past year'}
                  </span>
                )}
              </span>
            </header>

            <div className="yb-body">
              {/* ---- THE NUMBER, FIRST, BECAUSE IT IS WHAT THEY CAME FOR ---- */}
              <section className={`yb-number yb-move-${move}`} style={{ '--yb-step': '0ms' } as CSSProperties}>
                <span className="yb-numwrap">
                  {/* a sentence rather than a number when nothing has been graded */}
                  <span className={`yb-num${shown === null ? ' yb-num-none' : ''}`}>
                    {shown === null ? 'no GPA yet' : shown.toFixed(2)}
                  </span>
                  {page.letter && <span className="yb-letter">{page.letter}</span>}
                </span>
                <span className="yb-numsaid">
                  <span className="yb-numlabel">grade point average</span>
                  <span className="yb-nummove">
                    {move !== 'first' && move !== 'held' && (
                      <Glyph
                        piece="pointer" face="chevron" size={16}
                        className={`yb-movemark yb-movemark-${move}`}
                        fallback={<span className={`yb-caret yb-caret-${move}`} aria-hidden="true" />}
                      />
                    )}
                    {moveWords(move, page.priorGpa)}
                  </span>
                  {/* the year's own mean beside the cumulative one */}
                  {/* and not printed at all when it would be the same number twice */}
                  <span className="yb-yearmean">
                    {page.yearGpa === null
                      ? 'nothing was graded this year'
                      : page.gpa !== null && Math.abs(page.yearGpa - page.gpa) < 0.005
                        ? ''
                        : `this year alone: ${page.yearGpa.toFixed(2)}`}
                  </span>
                </span>
              </section>

              {/* the spread: sections flow across two columns and the browser balances them */}
              <div className="yb-spread">
                {page.sections.map((sec, i) => (
                  <Section key={sec.id} sec={sec} step={i + 1} />
                ))}
              </div>

              {/* one line about a road not taken, alone and last, observed rather than scolding, and there is exactly one */}
              <p className="yb-nudge" style={{ '--yb-step': `${6 * STEP_MS}ms` } as CSSProperties}>
                {page.nudge}
              </p>
            </div>

            <footer className="yb-foot">
              {years.length > 1 && (
                /* the spine is one tab per year lived, so a turned page stays reachable: drawn tabs on a row that scrolls rather than wraps, walked with Left and Right */
                <div className="yb-spine kit-tabrow" role="tablist" aria-label="Years">
                  {years.map((y, i) => (
                    <Tab
                      key={y}
                      active={y === year}
                      onClick={() => setYear(y)}
                      onKeyDown={(e) => tabRowKeyDown(e, years, i, setYear)}
                    >
                      Year {y}{yearTurned(s, y) ? ' · closed' : ''}
                    </Tab>
                  ))}
                </div>
              )}
              <div className="yb-acts">
                {canTurn ? (
                  <>
                    <Plank size="lg" glyph={['icon_set', 'arrow']} onClick={turn}>
                      {lastYear ? 'Finish all four years' : 'End this year'}
                    </Plank>
                    {/* the offer to keep playing is hidden inside a cutscene */}
                    {!cinemaOn() && <Plank size="md" onClick={onClose}>Keep playing this year</Plank>}
                  </>
                ) : (
                  <Plank size="lg" keyCap="Esc" onClick={onClose}>
                    {page.turned ? 'Close the yearbook' : 'Back to the game'}
                  </Plank>
                )}
              </div>
            </footer>
          </>
        ) : (
          <div className="yb-turned">
            {lastYear ? (
              <>
                <h2 className="yb-title">Four years finished.</h2>
                <p className="yb-turnedline">Your graduation is ready. Everyone is waiting for you.</p>
                <div className="yb-acts">
                  {onGraduate
                    ? <Plank size="lg" glyph={['icon_set', 'star']} onClick={onGraduate}>Walk the stage</Plank>
                    : <Plank size="lg" onClick={onClose}>Back to the game</Plank>}
                </div>
              </>
            ) : (
              /* one card for every year that is not the final one */
              <>
                <h2 className="yb-title">Year {yearWord(year)} is done.</h2>
                {/* what is true now, rather than a promise about next time */}
                <p className="yb-turnedline">
                  That is year {yearWord(year)}. The Maw is yours to walk, and the Guide has every
                  club and class at Bonney Lake in it.
                </p>
                <div className="yb-acts">
                  <Plank size="lg" onClick={onClose}>That is year {yearWord(year)}</Plank>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
