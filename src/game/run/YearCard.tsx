/* THE YEARBOOK, AS ONE CARD, AT THE END OF THE FILM.
 *
 * BRIEF-INTRO-FILM section 4: *"the counselor says year one is done, the cord,
 * the yearbook page as ONE card (what he picked, what he earned, nothing else),
 * then the handover"*. And, twice on the same page: *"No 'Year two' wording
 * anywhere; the intro does not end with a promise about next time."*
 *
 * ---- WHY IT IS NOT THE SPREAD ---------------------------------------------
 *
 * `Yearbook.tsx` is a good instrument and it is two screens, not one. A student
 * finishing the film met a full transcript spread with a grade point average as
 * the largest thing on it, five headings, a line about a road not taken and a
 * spine of year tabs, pressed a plank, and then met a SECOND screen telling him
 * about year two. Ash's ruling reduces that to one card with two lists on it,
 * and this file is only that reduction: no new facts, no new numbers, and the
 * same `turnYearPage` writing the same save on the same press.
 *
 * The spread is untouched and is still what the corner's My Year door opens,
 * where a student is reading rather than being handed something.
 *
 * ---- WHAT IS ON IT, AND WHAT IS DELIBERATELY NOT --------------------------
 *
 * WHAT HE PICKED comes off the plan he stamped ten minutes ago: the two
 * electives by their real catalog names and whatever went in an after-school
 * slot, under the placeholder mask so a card nobody has built still reads
 * "Example A" here as it did on the sheet he filled in.
 *
 * WHAT HE EARNED comes off `yearbookPage`, which is already the one composer of
 * this year's record: the graded rows, the badges and the cords that are really
 * finished. Nothing is recomputed here, because a second opinion about a
 * transcript is how two screens end up disagreeing about a grade.
 *
 * WHAT IS NOT ON IT: the GPA, which is a number a freshman has no scale for on
 * the day he first sees one; the nudge, which is an observation about a road not
 * taken and belongs on a page somebody chose to open; the year spine, because
 * there is one year; and any sentence at all about next time.
 */
import { useEffect } from 'react'
import { Glyph, Plank } from '../ui/controls'
import { usePanel } from '../ui/a11y'
import { classById } from '../planner/catalog'
import { programmeById } from '../roster/roster'
import { shownName } from '../roster/placeholders'
import { SEASONS, loadSave } from '../save'
import { track } from '../telemetry'
import type { YearbookPage } from './yearbook-page'
import './run.css'
import './yearcard.css'

const YEAR_WORD = ['', 'one', 'two', 'three', 'four']

type CardRow = { key: string; title: string; meta?: string; done?: boolean }

/* ---- WHAT HE PICKED, READ OFF THE SHEET HE FILLED IN --------------------- */
function pickedRows(year: number): CardRow[] {
  const s = loadSave()
  const plan = s?.plans?.[year]
  const rows: CardRow[] = []
  for (const id of plan?.classes ?? []) {
    const c = classById(id)
    rows.push({ key: `class:${id}`, title: shownName(id, c?.name ?? id), meta: 'elective' })
  }
  for (const se of SEASONS) {
    const id = plan?.slots?.[se]
    if (!id) continue
    const p = programmeById(id)
    rows.push({ key: `slot:${se}`, title: shownName(id, p?.name ?? id), meta: se.toLowerCase() })
  }
  return rows
}

/* ---- AND WHAT HE EARNED, OFF THE ONE COMPOSER THAT KNOWS ------------------
 *
 * The grades, then the badges, then the cords that are really finished. A cord
 * part of the way there is a thing to go and get rather than a thing he earned,
 * and this card is a receipt. */
function earnedRows(page: YearbookPage): CardRow[] {
  const of = (id: string) => page.sections.find((sec) => sec.id === id)?.rows ?? []
  return [
    ...of('paper').map((r) => ({ key: `p:${r.key}`, title: r.title, meta: r.meta, done: true })),
    ...of('marks').map((r) => ({ key: `m:${r.key}`, title: r.title, meta: r.meta, done: true })),
    ...of('threads').filter((r) => r.done).map((r) => ({ key: `t:${r.key}`, title: r.title, done: true })),
  ]
}

function List({ head, rows, empty }: { head: string; rows: CardRow[]; empty: string }) {
  return (
    <section className="yc-col">
      <h3 className="yc-head">{head}</h3>
      {rows.length === 0
        ? <p className="yc-empty">{empty}</p>
        : (
          <ul className="yc-rows">
            {rows.map((r) => (
              <li key={r.key} className="yc-row">
                {r.done && <Glyph piece="icon_set" face="tick" size={16} className="yc-tick" />}
                <span className="yc-rowtitle">{r.title}</span>
                {r.meta && <span className="yc-rowmeta">{r.meta}</span>}
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

export function YearCard({ year, page, onDone }: {
  year: number
  page: YearbookPage
  /** the one press: turn the page if the year can be turned, close it if not */
  onDone: () => void
}) {
  /* NO ESCAPE AND NO CLICK OFF. This only ever mounts inside the bars, and the
   * film's own rule is that nothing in it is skippable: the plank is the way on
   * and it is the only control on the card. */
  const panel = usePanel({ onClose: () => {}, closeOnEscape: false, label: `Year ${year}` })
  useEffect(() => { track('yearcard_shown', { year }) }, [year])

  const picked = pickedRows(year)
  const earned = earnedRows(page)

  return (
    <div className="yb-veil yc-veil">
      <div {...panel} className="yc-card kit-surface-panel">
        <header className="yc-top">
          {/* THE NUMBER AND NOTHING BESIDE IT. The spread prints "still open" or
              "closed" here, which on this card would be the game answering the
              counselor back on the frame she says the year is done. */}
          <h2 className="yc-title">Year {YEAR_WORD[year] ?? year}</h2>
        </header>
        <div className="yc-body">
          <List head="What you picked" rows={picked} empty="Nothing on the sheet this year." />
          <List head="What you earned" rows={earned} empty="Nothing graded this year." />
        </div>
        <footer className="yc-foot">
          {/* THE SAME WORDS THE SPREAD ENDS ON, and they are the way ON. Not
              "Back to the game": nothing is being gone back to, and both
              reads-nothing harnesses classify a "back" as backwards and stop
              dead on it. */}
          <Plank size="lg" className="yc-go" onClick={onDone}>That is year one</Plank>
        </footer>
      </div>
    </div>
  )
}
