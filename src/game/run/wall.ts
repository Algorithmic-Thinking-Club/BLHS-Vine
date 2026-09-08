/* the trophy wall: a seat for every thing a student chose, empty until they finish it */
import type { SaveGame } from '../save'
import { shownName } from '../roster/placeholders'
import { classById } from '../planner/catalog'
import { programmeById } from '../roster/roster'
import { coreBeatId } from '../beats/beats'
import { PASSING_GRADE, letterOf as letter } from '../progress'

export type WallSeat = {
  id: string
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

/* THE LETTER COMES FROM `progress.ts` AND NOT FROM A SECOND TABLE HERE. A wall
 * that rounded a 3.49 differently from the yearbook would be two truths about one
 * grade, and this file would be the one nobody checked. */

/** the wall for one year: Advisory, then each season's choice, then each class */
export function wallOf(s: SaveGame | null, year: number = s?.year ?? 1): WallSeat[] {
  if (!s) return []
  const plan = s.plans?.[year] ?? { slots: {}, classes: [], stamped: false }
  const done = (id: string) => s.ledger.find((e) => e.id === id && e.year === year)
  const out: WallSeat[] = []

  /* ADVISORY IS ALWAYS A SEAT, chosen or not, because every student is in it and
   * because it is the first thing that can fill the wall. Its ledger id is the
   * year's core beat, which is the same id the beat runner records under. */
  /* a frame only fills on a passing grade; a failed try stays empty */
  const core = done(coreBeatId(year))
  const corePassed = !!core && core.grade >= PASSING_GRADE
  out.push({
    id: 'advisory',
    name: 'Advisory',
    kind: 'advisory',
    earned: corePassed,
    says: corePassed ? `${letter(core!.grade)}, credit earned` : null,
    wants: core ? `You got an ${letter(core.grade)}. Do Advisory again at the hearth` : 'Finish Advisory at the hearth',
  })

  for (const [, id] of Object.entries(plan.slots)) {
    if (!id) continue
    const p = programmeById(id)
    const c = (s.completions ?? []).find((x) => x.programme === id && x.year === year)
    out.push({
      id: `programme:${id}`,
      /* NEVER A FAKE REAL NAME ON THE WALL. A frame for a club nobody has
       * built says Example A, the same as the card it came off, so the two
       * surfaces cannot disagree about what a student picked. */
      name: p ? shownName(p.id, p.name) : id,
      kind: 'activity',
      earned: !!c,
      says: c ? (c.rank ? `${letter(c.grade)}, ${c.rank}` : letter(c.grade)) : null,
      wants: 'Sail there and finish it',
    })
  }

  for (const id of plan.classes) {
    const cl = classById(id)
    const row = done(`class:${id}`)
    const passed = !!row && row.grade >= PASSING_GRADE
    out.push({
      id: `class:${id}`,
      /* an elective keeps its real name everywhere, which is the ruling:
       * the course is a true thing about the school. */
      name: cl?.name ?? id,
      kind: 'class',
      earned: passed,
      says: passed ? `${letter(row!.grade)}, credit earned` : null,
      wants: row ? `You got an ${letter(row.grade)}. Sit the class again` : 'Sit the class and pass it',
    })
  }

  return out
}

/** how many seats are filled, which is the sentence beat 8 checks */
export const onTheWall = (s: SaveGame | null, year?: number): number =>
  wallOf(s, year).filter((w) => w.earned).length
