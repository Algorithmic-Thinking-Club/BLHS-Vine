/* THE YEARBOOK PAGE, AS DATA (§80.6, §12.4 to §12.13).
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
 * ---- THE NUMBER UNDER A YEAR HEADING WAS THE WRONG NUMBER -------------------
 *
 * FOUND 2026-09-01, and it was the largest thing on the page. This file printed
 * `gpaOf(s)`, which sums the ENTIRE ledger with no year filter, under a heading
 * reading "Year N". The spine makes past pages reachable, so a student in Year 3
 * opening Year 1 read Year 3's grade point average as though it were the number
 * they finished their freshman year on. A page whose whole purpose is to be a
 * record of one year cannot print a number that is about a different one.
 *
 * THE FIX IS THE THING A REAL TRANSCRIPT DOES, and it needs no new save field.
 * Every `LedgerEntry` already carries its `year`, so:
 *
 *   `gpa`      the credit-weighted mean of everything on the transcript UP TO AND
 *              INCLUDING this year. On the live page that is identical to what
 *              shipped, because no later entry exists yet, so the `year_end`
 *              payload and every test that reads it are unmoved. On a past page
 *              it is what that year actually closed on.
 *   `priorGpa` the same mean through the year BEFORE. `null` in year one, which
 *              is §12.5's "no previous value" case and the only thing that tells
 *              the ink whether it has anywhere to travel from.
 *   `yearGpa`  this year's own mean, alone. Q12.5.a's recommendation on record:
 *              cumulative is what a transcript does and what the cords read, with
 *              the year's own mean beside it "so the movement has something to
 *              attribute itself to".
 *
 * The three are computed by handing `gpaOf` a filtered copy of the run rather
 * than by re-typing its arithmetic, because the credit weights are the game's own
 * (islands 1.0, classes and core beats 0.5) and two copies of a weighting drift
 * the day one of them is corrected.
 *
 * WHAT IS HONESTLY NOT PER-YEAR, and there are two of them now. The cord table is
 * cumulative: `cordsOf` reads the whole ledger and there is no way to ask what a
 * thread looked like in year two, because nothing recorded it. Stickers are worse:
 * `save.stickers` is a flat array of ids with no year on them at all. Both
 * sections say so under their own heading rather than printing a number that
 * looks per-year and is not, which is the class of mistake this whole cut exists
 * to stop.
 */
import type { SaveGame } from '../save'
import { SEASONS, writeSave } from '../save'
import { cordsOf, gpaOf, letterOf } from '../progress'
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

/* THE ORDER, AND IT IS FIXED. Not sorted, not filtered, not conditional. A page
 * for year one and a page for year four have these five headings in this order,
 * and the only thing that changes between them is what is under each one.
 *
 * `marks` IS NEW AND IS §12.9'S SECTION. `s.stickers` is a real field, it is
 * granted through `award`, it is counted into the `year_end` payload, and nothing
 * in the game had ever rendered one. §12.9's own want asks for a section that
 * "hides itself when empty rather than rendering a heading with nothing under
 * it", and this file does the opposite ON PURPOSE, because §12.4 is the stronger
 * and later rule and it is the one this whole module was built around: a heading
 * a student never saw is a part of the year they never knew they could have. The
 * empty line is where the teaching happens, and for this section the teaching is
 * §12.9's own law, that a mark is never given for a grade. */
export const YEARBOOK_SECTIONS = ['paper', 'seasons', 'waters', 'marks', 'threads'] as const
export type YearbookSectionId = typeof YEARBOOK_SECTIONS[number]

/* WHICH WAY THE NUMBER TRAVELS, decided here rather than in the component, so the
 * page a test renders and the page a student reads agree about it (§12.5).
 *
 *   first  no previous value at all. It writes in from blank, and that happens
 *          exactly once in a run.
 *   up     it rose.
 *   down   it fell, and the game does not soften that. §12.5, verbatim: "It moves
 *          down. It does not get a consolation line."
 *   held   it did not move, which is the COMMON case and the one an animation
 *          makes look broken. A number that visibly tries to move and does not is
 *          worse than a number that lands, so this case is told apart from the
 *          other three and the ink is simply not run. */
export type GpaMove = 'first' | 'up' | 'down' | 'held'

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

/* THE MEAN OVER PART OF A TRANSCRIPT. `gpaOf` is handed a copy of the run with a
 * shorter ledger rather than being reimplemented, because the credit weights are
 * the game's own invention and there must be exactly one of them. A run's ledger
 * is a few dozen rows, so the copy costs nothing worth naming. */
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
    rows: s.ledger.filter((e) => e.year === year).map((e) => ({
      key: e.id,
      title: e.title,
      meta: `${e.season} · ${letterOf(e.grade)}${e.retaken ? ' · retaken' : ''}`,
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
    empty: 'No club or sport picked all year. All three season tokens are unused.',
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

  /* ---- the marks, §12.9's section, and the caveat it cannot avoid ----
   *
   * A sticker carries no year, so a Year 1 page and a Year 3 page show the same
   * list. That is stated under the heading rather than hidden, for the same
   * reason the threads section states its own. */
  const marks: YearbookSection = {
    id: 'marks',
    heading: 'Badges you were given',
    rows: s.stickers.map((id) => ({
      key: id,
      title: stickerLabel(id),
      meta: 'you earned this',
      done: true,
      face: ['stamp', 'awarded'] as [string, string],
    })),
    empty: 'No badges yet. A badge is for something you did, never for a grade you got.',
    caveat: s.year > 1 && s.stickers.length > 0
      ? 'every mark from every year, not only this one'
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
        /* THE SCHOOL'S OWN WORDS TRAVEL WITH THE ROW. §12.8's want, and §14.14's
         * law for the whole game: one source of truth for a criterion, and the
         * source is `docs/blhs/awards.md` through `cordsOf`. Nothing on this page
         * writes a criterion of its own. */
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

/* ---- THE TURN, AS ONE WRITE ------------------------------------------------
 *
 * §12.13 found this and it is the only irreversible write in the game:
 *
 *   *"Those are two separate writes to localStorage and they are not one
 *   transaction. `setFlag` writes, then `endYear` writes. If the second one
 *   fails, from a quota error or a page unload landing between them, the save
 *   carries `yearbook:y1` with `year` still 1 ... The run is stuck in a state
 *   with no button anywhere that advances it."*
 *
 * `save.ts`'s `endYear()` is still correct and still the rule; what it cannot be
 * is half of a pair. So the turn is composed here, as ONE `writeSave`, which is
 * one `localStorage.setItem` inside one guarded `commit`. A quota error now loses
 * the whole turn, which is recoverable by pressing the button again, instead of
 * losing half of it, which is not recoverable by anything.
 *
 * IT MIRRORS `endYear` AND MUST KEEP MIRRORING IT. The rule it copies is one line
 * long and is stated in `save.ts`: the fourth turn is terminal, marking the run
 * graduated instead of advancing the year or refilling the tokens. If that rule
 * ever changes, it changes in two places, and this comment is the fence saying so.
 * The alternative was a second write, and a second write is the defect.
 *
 * The flag is written idempotently for the same reason `setFlag` is: a page that
 * has already turned must never grow a second copy of its own marker. */
export function turnYearPage(s: SaveGame, year: number): SaveGame {
  const mark = `yearbook:y${year}`
  const flags = s.flags.includes(mark) ? s.flags : [...s.flags, mark]
  return s.year >= 4
    ? writeSave({ flags, graduated: true })
    : writeSave({ flags, year: s.year + 1, season: 'Fall', tokens: [...SEASONS] })
}
