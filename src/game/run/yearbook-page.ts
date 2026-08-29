/* THE YEARBOOK PAGE, AS DATA (§80.6).
 *
 * (Named `yearbook-page.ts` and not `yearbook.ts` because `tsc` refuses two files
 * in one program whose names differ only in casing, and the component beside it
 * is `Yearbook.tsx`.)
 *
 * The substrate asks for one thing and it is the whole of this file: *"a page
 * that assembles section by section in a fixed order that does not depend on what
 * is present, composable for any year rather than only the current one, with past
 * pages reachable after they have turned."*
 *
 * WHAT WAS WRONG. `Yearbook.tsx` rendered `{st.voyages.length > 0 && (...)}` and
 * `{cords.length > 0 && (...)}`, so a year with no cords had no threads heading
 * and a year with no voyages had no seasons heading. The page a freshman sees and
 * the page a senior sees were therefore two different documents with two
 * different shapes, and the freshman's version taught them that the book has
 * three parts when it has four. A section that is empty says it is empty. That is
 * how a student learns there was something to fill.
 *
 * AND IT WAS ONLY EVER ABOUT TODAY. It read `loadSave()` and `yearStatus(s)`,
 * both of which mean "the current year", so year one's page stopped existing the
 * moment year two began. The page is a function of the save AND a year now, which
 * is what makes a past page a lookup instead of a rewrite.
 *
 * WHAT IS HONESTLY NOT PER-YEAR. The cord table is cumulative: `cordsOf` reads
 * the whole ledger and there is no way to ask what a thread looked like in year
 * two, because nothing recorded it. So that section says it is showing today's
 * threads rather than that year's. The alternative is a number that looks
 * per-year and is not, which is the class of mistake this whole cut exists to
 * stop.
 */
import type { SaveGame } from '../save'
import { cordsOf, gpaOf, letterOf } from '../progress'
import { placeById } from '../roster/roster'
import { nudgeLine, yearStatus } from './year'

export type YearbookRow = { key: string; title: string; meta: string }

export type YearbookSection = {
  id: YearbookSectionId
  heading: string
  rows: YearbookRow[]
  /** printed INSTEAD of the rows when there are none, never instead of the section */
  empty: string
  /** said under the heading when the rows are not really about this year */
  caveat?: string
}

/* THE ORDER, AND IT IS FIXED. Not sorted, not filtered, not conditional. A page
 * for year one and a page for year four have these four headings in this order,
 * and the only thing that changes between them is what is under each one. */
export const YEARBOOK_SECTIONS = ['paper', 'seasons', 'waters', 'threads'] as const
export type YearbookSectionId = typeof YEARBOOK_SECTIONS[number]

export type YearbookPage = {
  year: number
  /** the page has been turned: this is a past year rather than the live one */
  turned: boolean
  /** this is the year the run is actually in */
  current: boolean
  /* THE YEAR MAY BE CLOSED, which is a different question from whether it is the
   * current one. The page used to be reachable only inside the window where the
   * year was closable, so the component could assume it; now the shelf can open
   * the book at any moment and the turn has to carry its own gate or a student
   * ends year one in October by opening a book. */
  ready: boolean
  /** the run is over, so this page is the last one */
  final: boolean
  gpa: number | null
  letter: string
  sections: YearbookSection[]
  nudge: string
}

/** every year that has a page, oldest first. A page exists once its year has
 *  been lived in, so year one has one from the moment the run starts. */
export const yearbookYears = (s: SaveGame): number[] =>
  Array.from({ length: Math.max(1, Math.min(4, s.year)) }, (_, i) => i + 1)

/** has this year's page been turned (the flag the turn writes) */
export const yearTurned = (s: SaveGame, year: number): boolean =>
  s.flags.includes(`yearbook:y${year}`)

export function yearbookPage(s: SaveGame, year: number = s.year): YearbookPage {
  const st = yearStatus(s, year)
  const gpa = gpaOf(s)

  /* ---- the transcript, which is the only truly per-year section ---- */
  const paper: YearbookSection = {
    id: 'paper',
    heading: 'The year on paper',
    rows: s.ledger.filter((e) => e.year === year).map((e) => ({
      key: e.id,
      title: e.title,
      meta: `${e.season} · ${letterOf(e.grade)}${e.retaken ? ' · retaken' : ''}`,
    })),
    empty: 'A quiet year on the transcript. Nothing was graded.',
  }

  /* ---- what the three tokens bought ---- */
  const seasons: YearbookSection = {
    id: 'seasons',
    heading: 'Seasons spent',
    rows: st.voyages.map((v) => ({
      key: v.season,
      title: v.name,
      meta: `${v.season} · ${v.done ? 'sailed' : v.playable ? 'the dock waits' : 'island still rising'}`,
    })),
    empty: 'Three tokens in hand all year, and not one of them placed.',
  }

  /* ---- the awareness record, per year and per place, which is what the study
   * actually measures and what a student is most likely to be surprised by ---- */
  const waters: YearbookSection = {
    id: 'waters',
    heading: 'Water you crossed',
    rows: (s.exposure ?? []).filter((e) => e.year === year).map((e) => ({
      key: e.place,
      title: placeById(e.place)?.name ?? e.place,
      meta: e.docked ? 'you went ashore' : 'seen from the water',
    })),
    empty: 'You never left the home water this year.',
  }

  /* ---- the cords, and the caveat that they are not a snapshot ---- */
  const threads: YearbookSection = {
    id: 'threads',
    heading: 'Threads becoming rope',
    rows: cordsOf(s)
      .filter((c) => c.earned || c.progress > 0)
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 4)
      .map((c) => ({
        key: c.id,
        title: c.name,
        meta: c.earned ? 'earned' : c.detail,
      })),
    empty: 'No thread has caught yet. There is time.',
    caveat: year < s.year ? 'as the threads stand today, not as they stood then' : undefined,
  }

  return {
    year,
    turned: yearTurned(s, year),
    current: year === s.year,
    ready: st.readyForYearbook,
    final: year >= 4 || !!s.graduated,
    gpa,
    letter: gpa !== null ? letterOf(gpa) : '',
    sections: [paper, seasons, waters, threads],
    nudge: nudgeLine(st),
  }
}

/* THE PROGRESS BAR A THREAD DRAWS, kept here rather than in the component so the
 * page can be rendered by anything: a test, a plain-arm summary, or the turn-in
 * artifact. `cordsOf` is the source and this is only the width. */
export const threadWidth = (s: SaveGame, cordId: string): number => {
  const c = cordsOf(s).find((x) => x.id === cordId)
  return c ? Math.round(Math.max(0, Math.min(1, c.progress)) * 100) : 0
}
