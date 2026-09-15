/* the trophy wall: a seat for every thing a student chose, empty until they finish it */
import type { SaveGame } from '../save'
import { shownName } from '../roster/placeholders'
import { classById } from '../planner/catalog'
import { programmeById } from '../roster/roster'
import { coreBeatId } from '../beats/beats'
import { PASSING_GRADE, letterOf as letter, rankName, ranksOf } from '../progress'

export type WallSeat = {
  id: string
  /** the year this seat belongs to, so a wall spanning a run can group them */
  year: number
  /** what the seat is for, in the school's own name for it */
  name: string
  /** advisory, a club or sport, or a class: three shapes on one wall */
  kind: 'advisory' | 'activity' | 'class'
  /** filled, or still an outline */
  earned: boolean
  /** what is sitting in it, once something is: the grade, the rank, the credit */
  says: string | null
  /** what would fill it, while it is empty */
  wants: string
}

/* the letter comes from `progress.ts` and never from a second table here, because a wall that rounded a 3.49 differently from the yearbook would be two truths about one grade */

/** the wall for one year: Advisory, then each season's choice, then each class */
export function wallOf(s: SaveGame | null, year: number = s?.year ?? 1): WallSeat[] {
  if (!s) return []
  /* a frame from a year that has closed says what happened, not what to do about it, because the wall spans the whole run and an old empty frame otherwise asks for a control that no longer exists */
  const closed = year < s.year || s.flags.includes(`yearbook:y${year}`)
  const ask = (live: string) => (closed ? 'That year is closed.' : live)
  const plan = s.plans?.[year] ?? { slots: {}, classes: [], stamped: false }
  const done = (id: string) => s.ledger.find((e) => e.id === id && e.year === year)
  const out: WallSeat[] = []

  /* Advisory is always a seat, chosen or not, and its ledger id is the year's core beat, the same id the beat runner records under */
  /* a frame fills when the thing was done, not when it went well: a pick completes when it is played and a retake under a B- is offered, never required, because requiring a pass left a one item beat's flat F both done and unearned with no control left to sit it again */
  const core = done(coreBeatId(year))
  const corePassed = !!core && core.grade >= PASSING_GRADE
  out.push({
    id: 'advisory',
    year,
    name: 'Advisory',
    kind: 'advisory',
    earned: corePassed,
    says: corePassed ? `${letter(core!.grade)}, credit earned` : null,
    /* a failed row says what happened and where to go: a frame you sat and missed stays empty with a sentence in it, and the sentence names the door */
    wants: core
      ? ask(`You got an ${letter(core.grade)}. Take Advisory again at the hearth`)
      : ask('Finish Advisory at the hearth'),
  })

  for (const [, id] of Object.entries(plan.slots)) {
    if (!id) continue
    const p = programmeById(id)
    const c = (s.completions ?? []).find((x) => x.programme === id && x.year === year)
    out.push({
      id: `programme:${id}`,
      year,
      /* never a fake real name on the wall: a frame for a club nobody has built says Example A, the same as the card it came off, so the two surfaces cannot disagree about what was picked */
      name: p ? shownName(p.id, p.name) : id,
      kind: 'activity',
      earned: !!c,
      /* an ungraded finish is not an F: `award(...)` with no number means it was done rather than scored zero, and a row that took more than one go says so, the only place attempts are shown */
      /* print the rank, not the track it is on: `Completion.rank` holds a programme id like "football" and printing it raw read as "B, football", while `rankName` answers how far up that ladder the years have got */
      says: c ? [
        c.grade === null ? 'finished' : letter(c.grade),
        c.rank ? rankName(ranksOf(s)[c.rank] ?? 0) : null,
        c.attempts && c.attempts > 1 && c.firstGrade !== null && c.firstGrade !== undefined
          ? `${c.attempts} tries, first ${letter(c.firstGrade)}`
          : null,
      ].filter(Boolean).join(', ') : null,
      wants: ask('Go to it from your year sheet'),
    })
  }

  for (const id of plan.classes) {
    const cl = classById(id)
    const row = done(`class:${id}`)
    const passed = !!row && row.grade >= PASSING_GRADE
    out.push({
      id: `class:${id}`,
      year,
      /* an elective keeps its real name everywhere, because the course is a true thing about the school */
      name: cl?.name ?? id,
      kind: 'class',
      earned: passed,
      says: passed ? `${letter(row!.grade)}${row!.credit ? ', credit earned' : ', counted'}` : null,
      wants: row
        ? ask(`You got an ${letter(row.grade)}. Take it again from your year sheet`)
        : ask('Go to it from your year sheet'),
    })
  }

  return out
}

/* a wall is every year, not this one: `wallAll` spans the run while `wallOf` keeps its per-year meaning, because the closing film and the yearbook are each about one year */
export const wallAll = (s: SaveGame | null): WallSeat[] =>
  s ? Array.from({ length: Math.max(1, s.year) }, (_, i) => i + 1).flatMap((y) => wallOf(s, y)) : []

/** how many seats are filled, which is the sentence beat 8 checks */
export const onTheWall = (s: SaveGame | null, year?: number): number =>
  wallOf(s, year).filter((w) => w.earned).length
