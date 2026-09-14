/* the end of the year as one card: what the student picked and what he earned */
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
import { yearWord } from './year'
import './yearcard.css'

/* THE YEAR WORD COMES FROM `run/year.ts` (Ash, 2026-09-09). There were three
 * private copies of this table in the repo and one hardcoded literal beside
 * each: this card printed "Year two" at the top and "That is year one" on the
 * only button, six inches apart. */

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

/* what he earned, off the one composer that knows: grades, badges, finished cords */
/* ---- ONE THING, ONE ROW ---------------------------------------------------
 *
 * The yearbook keeps its record in sections with a heading each - what you were
 * graded on, what badges went on the wall, what threads you finished - and each
 * heading explains what its rows are. This card puts three of those sections under
 * ONE heading, "What you earned", and that is where it stopped adding up: a class
 * appears as a grade AND as the badge that grade earned, so year one printed seven
 * rows for four things and a student's own transcript listed Spanish twice.
 *
 * A badge for something already on the paper is the same achievement said again, so
 * the paper keeps it and the badge is dropped. A badge for something NOT on the
 * paper - a club's sticker, a thing with no grade - is its own row and stays. */
function earnedRows(page: YearbookPage): CardRow[] {
  const of = (id: string) => page.sections.find((sec) => sec.id === id)?.rows ?? []
  const said = new Set<string>()
  const once = (title: string) => {
    const k = title.trim().toLowerCase()
    if (said.has(k)) return false
    said.add(k)
    return true
  }
  return [
    ...of('paper').filter((r) => once(r.title))
      .map((r) => ({ key: `p:${r.key}`, title: r.title, meta: r.meta, done: true })),
    ...of('marks').filter((r) => once(r.title))
      .map((r) => ({ key: `m:${r.key}`, title: r.title, meta: r.meta, done: true })),
    ...of('threads').filter((r) => r.done && once(r.title))
      .map((r) => ({ key: `t:${r.key}`, title: r.title, done: true })),
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
          <h2 className="yc-title">Year {yearWord(year)}</h2>
        </header>
        <div className="yc-body">
          <List head="What you picked" rows={picked} empty="Nothing on the sheet this year." />
          <List head="What you earned" rows={earned} empty="Nothing graded this year." />
        </div>
        <footer className="yc-foot">
          {/* the one press on the card, and its words are the way on rather than a way back */}
          <Plank size="lg" className="yc-go" onClick={onDone}>That is year {yearWord(year)}</Plank>
        </footer>
      </div>
    </div>
  )
}
