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
  /* ---- A FRAME FILLS WHEN THE THING WAS DONE, NOT WHEN IT WENT WELL ------
   *
   * ASH, 2026-09-08 item 5: *"A pick always completes when it is played; a
   * retake under a B- is offered, never required."*
   *
   * It used to need a passing grade, and that is what Ash played as Air Force
   * JROTC hanging. That beat scores exactly one item, so one wrong click is a
   * flat F: the year counted the pick as finished, the sheet replaced the button
   * with a letter, the retake was spent, and the wall sat there with an empty
   * frame reading "You got an F. Sit the class again" beside no control anywhere
   * that would sit it. Done and unearned at the same time, with no way back in.
   *
   * So the frame is about ATTENDANCE and the caption is about the grade. A
   * student who sat it sees it filled and sees what he got, which is what a
   * trophy case in a school actually holds. */
  const core = done(coreBeatId(year))
  const corePassed = !!core && core.grade >= PASSING_GRADE
  out.push({
    id: 'advisory',
    name: 'Advisory',
    kind: 'advisory',
    earned: corePassed,
    says: corePassed ? `${letter(core!.grade)}, credit earned` : null,
    /* AND A FAILED ROW SAYS WHAT HAPPENED AND WHERE TO GO (Ash, 2026-09-09).
     * It used to fill the frame on attendance, which read as finished beside a
     * year gate that disagreed. A frame you sat and missed is an empty frame
     * with a sentence in it, and the sentence names the door. */
    wants: core
      ? `You got an ${letter(core.grade)}. Take Advisory again at the hearth`
      : 'Finish Advisory at the hearth',
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
      wants: 'Go to it from your year sheet',
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
      says: passed ? `${letter(row!.grade)}${row!.credit ? ', credit earned' : ', counted'}` : null,
      wants: row
        ? `You got an ${letter(row.grade)}. Take it again from your year sheet`
        : 'Go to it from your year sheet',
    })
  }

  return out
}

/** how many seats are filled, which is the sentence beat 8 checks */
export const onTheWall = (s: SaveGame | null, year?: number): number =>
  wallOf(s, year).filter((w) => w.earned).length
