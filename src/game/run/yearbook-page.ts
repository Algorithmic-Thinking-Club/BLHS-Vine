/* the yearbook page for one year, as data: five sections in a fixed order */
import type { SaveGame } from '../save'
import { writeSave } from '../save'
import { cordsOf, gpaOf, letterOf } from '../progress'
import { wallOf } from './wall'
import { placeById } from '../roster/roster'
import { nudgeLine, yearStatus } from './year'

export type YearbookRow = {
  key: string
  title: string
  meta: string
  /* 0..1 when the row is a partial thing rather than a finished one. §12.8's
   * whole position: a cord at 0.4 is not a locked achievement, it is a thing
   * that is 40 percent of the way to being real. */
  progress?: number
  /** the school's own words for what this row is, where the school supplied them */
  rule?: string
  /** it is finished, and a drawn stamp goes on it */
  done?: boolean
  /* a face on one of the platform's cut sheets that belongs to this row, as
   * `[piece, face]`. The seasons carry the pips MAPVIS drew for them, so a
   * student can tell fall from spring without reading the word. */
  face?: [string, string]
}

export type YearbookSection = {
  id: YearbookSectionId
  heading: string
  rows: YearbookRow[]
  /** printed INSTEAD of the rows when there are none, never instead of the section */
  empty: string
  /** said under the heading when the rows are not really about this year */
  caveat?: string
}

/* the five headings, in a fixed order, whether or not there is anything under them */
export const YEARBOOK_SECTIONS = ['paper', 'seasons', 'waters', 'marks', 'threads'] as const
export type YearbookSectionId = typeof YEARBOOK_SECTIONS[number]

/* which way the number travelled since last year, decided here and not in the view */
export type GpaMove = 'first' | 'up' | 'down' | 'held'

export type YearbookPage = {
  year: number
  /** the page has been turned: this is a past year rather than the live one */
  turned: boolean
  /** this is the year the run is actually in */
  current: boolean
  /* the year is closed, so the page can be turned */
  ready: boolean
  /** the run is over, so this page is the last one */
  final: boolean
  /** the credit-weighted mean of the transcript THROUGH this year */
  gpa: number | null
  /** the same mean through the year before it, and null in year one */
  priorGpa: number | null
  /** this year's own mean, alone, so the movement has something to attribute to */
  yearGpa: number | null
  letter: string
  move: GpaMove
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

/* the credit-weighted mean over part of a transcript, using the game's one weighting */
export const gpaThrough = (s: SaveGame, upTo: number): number | null =>
  gpaOf({ ...s, ledger: s.ledger.filter((e) => e.year <= upTo) })

const meanOfYear = (s: SaveGame, year: number): number | null =>
  gpaOf({ ...s, ledger: s.ledger.filter((e) => e.year === year) })

/* A STICKER HAS NO NAME ANYWHERE. `collectSticker` takes a string id and there is
 * no sticker table in the tree, so the label is the id made readable and nothing
 * more. When a catalog exists this is the one place that has to change. */
export const stickerLabel = (id: string): string =>
  id.replace(/^[a-z0-9_-]+:/, '').replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase())

export function yearbookPage(s: SaveGame, year: number = s.year): YearbookPage {
  const st = yearStatus(s, year)
  const gpa = gpaThrough(s, year)
  const priorGpa = year <= 1 ? null : gpaThrough(s, year - 1)
  const yearGpa = meanOfYear(s, year)
  const move: GpaMove =
    priorGpa === null || gpa === null ? 'first'
      : gpa > priorGpa ? 'up'
        : gpa < priorGpa ? 'down'
          : 'held'

  /* ---- the transcript, which is the only truly per-year section ---- */
  const paper: YearbookSection = {
    id: 'paper',
    heading: 'Your grades this year',
    /* ---- NO SEASON ON A CLASS ROW (Ash, 2026-09-09) ---------------------
     *
     * This printed `${e.season}` and every row in the game said Fall, because
     * `s.season` is written in three places and all three write 'Fall': there is
     * no clock in this run that advances it, and there should not be. The three
     * season tokens are a PLANNING device for after-school picks, not a
     * calendar. Classes at Bonney Lake are not season-scoped and the catalog
     * carries no season field for them, so the word was invented on every line.
     *
     * The tokens keep their seasons in "Clubs and sports you picked" below,
     * where the season is a real fact about which token bought the row.
     *
     * WHAT REPLACES IT IS TRUE: how many goes it took, which is the only place
     * outside the wall a student is shown his own attempts. */
    rows: s.ledger.filter((e) => e.year === year).map((e) => ({
      key: e.id,
      title: e.title,
      meta: [
        letterOf(e.grade),
        e.attempts && e.attempts > 1 && e.firstGrade !== undefined
          ? `${e.attempts} tries, first ${letterOf(e.firstGrade)}`
          : null,
        e.retaken ? 'retaken' : null,
      ].filter(Boolean).join(' · '),
    })),
    empty: 'Nothing was graded this year. A quiet one on the transcript.',
  }

  /* ---- what the three tokens bought ---- */
  const seasons: YearbookSection = {
    id: 'seasons',
    heading: 'Clubs and sports you picked',
    rows: st.voyages.map((v) => ({
      key: v.season,
      title: v.name,
      meta: `${v.season} · ${v.done ? 'finished' : v.playable ? 'not done yet' : 'not open yet'}`,
      done: v.done,
      /* the pip sheet has fall, winter and spring drawn as three different coins,
       * which is what the HUD's tokens wear. A row that carries its own season
       * mark says which season it was without the student reading the word. */
      face: ['pip', v.season.toLowerCase()] as [string, string],
    })),
    empty: 'You did not join a club or a sport this year.',
  }

  /* ---- the awareness record, per year and per place, which is what the study
   * actually measures and what a student is most likely to be surprised by ---- */
  const waters: YearbookSection = {
    id: 'waters',
    heading: 'Places you saw',
    rows: (s.exposure ?? []).filter((e) => e.year === year).map((e) => ({
      key: e.place,
      title: placeById(e.place)?.name ?? e.place,
      meta: e.docked ? 'you went inside' : 'you only saw it from outside',
      done: e.docked,
    })),
    empty: 'You did not see any new places this year.',
  }

  /* the marks section, and the caveat that a sticker carries no year */
  /* the badges this year's wall hangs, then any stickers an island granted */
  const wall = wallOf(s, year).filter((w) => w.earned)
  const marks: YearbookSection = {
    id: 'marks',
    heading: 'Badges on your wall',
    rows: [
      ...wall.map((w) => ({
        key: w.id,
        title: w.name,
        meta: w.says ?? 'done',
        done: true,
        face: ['stamp', 'awarded'] as [string, string],
      })),
      ...s.stickers.map((id) => ({
        key: `sticker:${id}`,
        title: stickerLabel(id),
        meta: 'you earned this',
        done: true,
        face: ['stamp', 'awarded'] as [string, string],
      })),
    ],
    empty: 'No badges on the wall yet. Finish a thing and its badge goes up.',
    caveat: s.year > 1 && s.stickers.length > 0
      ? 'stickers are from every year, not only this one'
      : undefined,
  }

  /* ---- the cords, and the caveat that they are not a snapshot ---- */
  const threads: YearbookSection = {
    id: 'threads',
    heading: 'Your cords',
    rows: cordsOf(s)
      .filter((c) => c.earned || c.progress > 0)
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 4)
      .map((c) => ({
        key: c.id,
        title: c.name,
        meta: c.earned ? 'earned' : c.detail,
        progress: c.progress,
        /* the school's own words for this criterion, carried through from cordsOf */
        rule: c.rule,
        done: c.earned,
      })),
    empty: 'No cord started yet. There is time.',
    caveat: year < s.year ? 'as your cords stand today, not as they stood then' : undefined,
  }

  return {
    year,
    turned: yearTurned(s, year),
    current: year === s.year,
    ready: st.readyForYearbook,
    final: year >= 4 || !!s.graduated,
    gpa,
    priorGpa,
    yearGpa,
    letter: gpa !== null ? letterOf(gpa) : '',
    move,
    sections: [paper, seasons, waters, marks, threads],
    nudge: nudgeLine(st, s),
  }
}

/* THE PROGRESS BAR A THREAD DRAWS, kept here rather than in the component so the
 * page can be rendered by anything: a test, a plain-arm summary, or the turn-in
 * artifact. `cordsOf` is the source and this is only the width. */
export const threadWidth = (s: SaveGame, cordId: string): number => {
  const c = cordsOf(s).find((x) => x.id === cordId)
  return c ? Math.round(Math.max(0, Math.min(1, c.progress)) * 100) : 0
}

/* the turn, written as one save so a year can never half-advance */
export function turnYearPage(s: SaveGame, year: number): SaveGame {
  const mark = `yearbook:y${year}`
  const flags = s.flags.includes(mark) ? s.flags : [...s.flags, mark]
  /* ---- TURNING THE PAGE NEVER ADVANCES THE YEAR (Ash, 2026-09-09) --------
   *
   * It used to, and the guard above it was `s.year >= SESSION_ENDS_AFTER_YEAR &&
   * s.year < 4`, which with that constant at 1 caught years one to three and
   * left an advancing branch nothing could reach.
   *
   * The year turn belongs to the title now: the closing film carries a student
   * out of the Maw, and the "Start year N" plank calls `endYear`, which is the
   * one place that hands over a fresh sheet and three tokens. This marks the
   * page and stops, whatever year it is. Four is the end of the road. */
  return s.year >= 4 ? writeSave({ flags, graduated: true }) : writeSave({ flags })
}
