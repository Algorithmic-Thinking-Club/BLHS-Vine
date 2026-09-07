import { useEffect, useState, type CSSProperties } from 'react'
import { loadSave } from '../save'
import { CordDrape } from './CordDrape'
import { track } from '../telemetry'
import { announce, tabRowKeyDown, usePanel } from '../ui/a11y'
import { Chip, Gauge, Glyph, Plank, Tab, useKitReady } from '../ui/controls'
import { prefersReducedMotion } from '../ui/motion'
import {
  turnYearPage, yearbookPage, yearbookYears, yearTurned,
  type GpaMove, type YearbookRow, type YearbookSection,
} from './yearbook-page'
import './run.css'

/* THE YEARBOOK SPREAD (§7.6, §12.4 to §12.16): the year's full page, and the page
 * turn that IS the year turning.
 *
 * WHAT THE COMPONENT DOES AND DOES NOT DECIDE. Everything about what is on the
 * page is `yearbook-page.ts`, which is a pure function of the save and a year, so
 * the page a test renders and the page a student reads are the same document.
 * This file draws it and owns exactly three behaviours: which year is open, the
 * composition, and the turn.
 *
 * PAST PAGES ARE REACHABLE, which is §80.6's own word and the reason the year is
 * state rather than a snapshot of `s.year`. The spine along the bottom holds one
 * tab per year lived, and a turned year opens read-only: there is no turn control
 * on a page that has already turned, because the turn is the year ending and that
 * is not something a student may do twice.
 *
 * ---- IT COMPOSES, IT DOES NOT OPEN ----------------------------------------
 *
 * §12.4, verbatim, and it is the whole moment:
 *
 *   *"Composes, not opens. The distinction is the entire moment. A panel that
 *   appears already complete is a report. A page that assembles itself in front
 *   of the student, one section landing after the other, is the year being
 *   written down while they watch, and the pause between sections is what makes
 *   each one legible instead of a wall."*
 *
 * The order is fixed and it is not arbitrary: the number first, because it is the
 * one thing the student came for; then the year's rows, because that is what
 * produced the number; then the seasons, because that is what the student chose
 * rather than what they scored; then the marks and the cords; then the nudge,
 * alone, last, with nothing of the record under it.
 *
 * `YEARBOOK_SECTIONS` holds that order and this file never re-sorts it. Every
 * section carries a `--yb-step` delay, and `run.css` lands them one after
 * another. UNDER REDUCED MOTION THEY ALL LAND AT ONCE, which is the rule and not
 * a courtesy: a staged page at one millisecond a step is a flicker, and a
 * flickering page is worse for the student the setting is for than a page that is
 * simply present.
 *
 * ---- THE SPREAD USES THE WIDTH --------------------------------------------
 *
 * `build-shots/ui/before/15-yearbook.png` is eleven short lines of type pinned to
 * the top left of a 940 by 800 sheet, with about two thirds of the paper blank.
 * §7.6 calls this "the year's full-page spread", and a spread is two facing
 * pages: the transcript and what it bought on the left, what the student saw and
 * was given and is still working toward on the right, the nudge across the foot
 * of both. It collapses to one column when the window cannot hold two, which on a
 * 1366 by 768 Chromebook it can. */

/* how long one section waits before it lands. Six sections at 130ms is under a
 * second for the whole page, which is a composition rather than a load. */
const STEP_MS = 130

/* ---- THE NUMBER INKING ITSELF (§12.5) ------------------------------------
 *
 * §12.5 names three cases and they are three different pictures, so the hook
 * answers all three rather than running one animation and hoping:
 *
 *   FIRST      year one has no previous value. The number writes in from blank,
 *              which is a CSS wipe in `run.css`, and it happens exactly once in a
 *              run.
 *   UP or DOWN it travels, digit by digit, from last year's value to this one's.
 *              Downward is not softened: *"It moves down. It does not get a
 *              consolation line."*
 *   HELD       a year of straight passes at the same level moves a credit-weighted
 *              mean by hundredths or not at all, and that is the COMMON case.
 *              *"A number that visibly tries to move and does not is worse than a
 *              number that lands."* So nothing runs. The number is simply there,
 *              and the words beside it say it held.
 *
 * `prefersReducedMotion()` is read from `ui/motion.ts` rather than from the
 * attribute, because that file is the one value the CSS and the renderer share. */
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
      /* eased out, so the last hundredths settle rather than snapping: a number
       * that arrives at speed reads as a counter and not as ink drying */
      setShown(a + (b - a) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(step)
      else setShown(b)
    })
    return () => cancelAnimationFrame(raf)
  }, [from, to, travels])
  return shown
}

/* THE MOVEMENT, IN WORDS, because §40.31 forbids a state carried by hue alone and
 * a school Chromebook panel crushes both lightness and saturation. The chevron
 * beside it turns, which is a SHAPE moving, and the sentence is what carries the
 * meaning when the drawn face is not worn. */
function moveWords(move: GpaMove, from: number | null): string {
  if (move === 'up' && from !== null) return `up from ${from.toFixed(2)} last year`
  if (move === 'down' && from !== null) return `down from ${from.toFixed(2)} last year`
  if (move === 'held' && from !== null) return 'exactly where it stood last year'
  return 'your first GPA'
}

/* ---- ONE ROW ------------------------------------------------------------- */

function Row({ row, section }: { row: YearbookRow; section: YearbookSection['id'] }) {
  if (section === 'marks') {
    /* A MARK IS A DRAWN OBJECT, not a line of text. §12.9's section had never
       rendered anything at all, and what it is for is the record of a thing that
       happened rather than a score: the `chip` plate is the thing on the wall and
       the `stamp` face is what was pressed into it. */
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
    /* A CORD IS PARTIAL PROGRESS AND NEVER A LOCKED ACHIEVEMENT (§12.8). The bar
       is a real drawn gauge on a real number out of `cordsOf`, the school's own
       criterion sits under it, and an earned one wears the approval stamp so the
       finished state is a MARK arriving rather than a bar going a different
       colour.

       THE CRITERION IS QUOTED, NEVER WRITTEN. §14.14 is a law for the whole game
       and it is at its sharpest here, because this is the page where a fourteen
       year old reads what a real cord takes: one source of truth, and the source
       is `docs/blhs/awards.md` through `cordsOf`. Nothing in this file composes a
       sentence about a school award. */
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
        {/* THE CRITERION IS NOT ON THIS PAGE, and that is not a softening of
            §14.14. The law is that a school criterion is QUOTED and never
            written, and Key Club's runs to forty words about volunteer hours,
            meetings and service events across four years. Quoted in full on a
            yearbook page it ran off the bottom of the spread and was cut
            mid-sentence, which is the one thing worse than not showing it.
            The Handbook's cords page carries every criterion verbatim and is one
            press away. What stays here is the live reading against it, which is
            the part that is about THIS year and is what a yearbook is for. */}
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
      {/* a section showing something other than what its heading implies says so
          right under the heading, in pencil */}
      {sec.caveat && <p className="yb-caveat">{sec.caveat}</p>}
      {sec.rows.length === 0
        /* AN EMPTY SECTION SAYS IT IS EMPTY rather than vanishing, because a
           heading a student never saw is a part of the year they never knew they
           could have. This is the one line on the page that teaches. */
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

  /* SAID OUT LOUD, because the movement is the moment and the movement is drawn.
   * A reader gets the sections for free (they are all in the DOM from the first
   * frame; only the landing is staged), and gets nothing at all from a number
   * counting up, which is exactly the part a student is meant to notice. */
  useEffect(() => {
    if (!page) return
    announce(page.gpa === null
      ? `Year ${page.year}. Nothing on the transcript yet.`
      : `Year ${page.year}. Grade point average ${page.gpa.toFixed(2)}, ${moveWords(page.move, page.priorGpa)}.`)
  }, [page?.year, page?.gpa, page?.move, page?.priorGpa])

  if (!s || !page) return null

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
    /* ONE WRITE, NOT TWO (§12.13). `setFlag` then `endYear` was two separate
     * `localStorage` writes with no transaction between them, and a failure
     * landing in the gap left the save carrying `yearbook:y1` with the year still
     * 1: the objective falls through to "nothing is owed", the yearbook will not
     * re-offer its own turn, and there is no button anywhere in the game that
     * advances the year. Unlikely and unrecoverable, on the ONE irreversible
     * write in the run. `turnYearPage` is the single patch. */
    turnYearPage(s, year)
    setTurned(true)
    /* ---- AND THE COUNSELOR DRAPES A CORD (BRIEF-YEAR-ONE beat 8) ---------
     *
     * "The counselor drapes the first cord on him. The wall has three things on
     * it. The yearbook page turns in school words. Year two, next time."
     *
     * The drape comes AFTER the write, on purpose and in that order: the cord it
     * shows is read from the save, and a year that has not turned yet is a year
     * whose numbers are still moving. It is also the last screen of the thirty
     * minutes, so it is the last thing shown.
     *
     * It rides on the turn rather than on a station because the turn is the only
     * moment in the run that happens exactly once per year and cannot be missed.
     * A member's island can still raise it by name through the ui-bus. */
    setDraping(true)
  }

  const move = page.move

  if (draping) {
    return <CordDrape year={year} onDone={() => setDraping(false)} />
  }

  return (
    <div className="yb-veil" onClick={onClose}>
      <div className="yb-page kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        {!turned ? (
          <>
            <header className="yb-head">
              <h2 className="yb-title">Yearbook</h2>
              <span className="yb-year">
                Year {page.year}
                <span className="yb-yearstate">
                  {page.turned ? 'closed' : page.current ? 'still open' : 'a past year'}
                </span>
              </span>
            </header>

            <div className="yb-body">
              {/* ---- THE NUMBER, FIRST, BECAUSE IT IS WHAT THEY CAME FOR ---- */}
              <section className={`yb-number yb-move-${move}`} style={{ '--yb-step': '0ms' } as CSSProperties}>
                <span className="yb-numwrap">
                  {/* NOT AN ELLIPSIS. This read `. . .`, and Harbormaster draws a
                      period as a filled square, so the largest thing on the page
                      of a student who has not been graded yet was three teal
                      blocks (`build-shots/ui/after/15-yearbook.png`). The
                      empty-ledger case is a sentence rather than a number, so it
                      is set as one, and the words pass made it literal: §12's
                      own "unwritten" is now "no GPA yet". */}
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
                  {/* Q12.5.a on record: cumulative, "with the year's own mean as a
                      second number beside it so the movement has something to
                      attribute itself to". The big number is the transcript
                      through this year; this one is the year alone. */}
                  {/* AND NOT WHEN IT IS THE SAME NUMBER TWICE. Q12.5.a asks for a
                      second number so the movement has something to attribute
                      itself to, which is exactly right from year two on. In year
                      one the transcript IS the year, so the line read "3.56"
                      followed by "this year alone: 3.56" under a heading that
                      already said "your first GPA": one fact, three times, at the
                      top of the page a student reads first. */}
                  <span className="yb-yearmean">
                    {page.yearGpa === null
                      ? 'nothing was graded this year'
                      : page.gpa !== null && Math.abs(page.yearGpa - page.gpa) < 0.005
                        ? ''
                        : `this year alone: ${page.yearGpa.toFixed(2)}`}
                  </span>
                </span>
              </section>

              {/* ---- THE SPREAD: two facing pages, one order ----
                  THE SPLIT IS NOT DECIDED HERE ANY MORE. It was: sections one and
                  two on the left, three four and five on the right, and that is a
                  guess about how tall a section is that was wrong the moment a
                  student had cords. Photographed on a real year one at
                  `ui/p1-game/15b-yearbook-full.png`, the right column carried
                  three drawn cord gauges at 122 pixels each, ran past the bottom
                  of the spread and lost the third one, while the left column sat
                  half empty beside it.

                  The sections flow now and the browser balances them, so the page
                  is right for a freshman with two rows and for a senior with
                  twenty without either being arranged by hand. The binding down
                  the middle is a `column-rule`, which is the same line it always
                  was. */}
              <div className="yb-spread">
                {page.sections.map((sec, i) => (
                  <Section key={sec.id} sec={sec} step={i + 1} />
                ))}
              </div>

              {/* ---- ONE LINE ABOUT A ROAD NOT TAKEN, alone and last (§12.11).
                      Observed, never scolding, and there is exactly one. */}
              <p className="yb-nudge" style={{ '--yb-step': `${6 * STEP_MS}ms` } as CSSProperties}>
                {page.nudge}
              </p>
            </div>

            <footer className="yb-foot">
              {years.length > 1 && (
                /* THE SPINE: one tab per year lived, so a page that has turned is
                   still reachable (§12.16). Drawn tabs on a row that scrolls
                   rather than wrapping, and Left and Right walk it. */
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
                    <Plank size="md" onClick={onClose}>Keep playing this year</Plank>
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
              <>
                <h2 className="yb-title">Year {year + 1}.</h2>
                {/* THE REFILL, WHERE THE STUDENT CAN SEE IT (§12.14). Three tokens
                    land at the turn and the pips that hold them are on the HUD
                    behind this veil, so the one plain signal that a new year has
                    begun happened where nobody was looking. The same three drawn
                    season faces the corner wears are here, on the page that
                    handed them over. */}
                <div className="yb-refill" aria-label="Three new season tokens. You can pick three more clubs or sports.">
                  {(['fall', 'winter', 'spring'] as const).map((season, i) => (
                    <span
                      key={season}
                      className="yb-newtoken"
                      style={{ '--yb-step': `${i * 160}ms` } as CSSProperties}
                    >
                      <Glyph
                        piece="pip" face={season} size={34}
                        fallback={<Chip state="plate_lit" className="yb-newchip" />}
                      />
                      <span className="yb-newtokenword">{season}</span>
                    </span>
                  ))}
                </div>
                <p className="yb-turnedline">Three new season tokens. Go to the table and pick your year.</p>
                <div className="yb-acts">
                  <Plank size="lg" onClick={onClose}>Back to the game</Plank>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
