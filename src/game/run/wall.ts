/* WHAT GOES ON THE WALL, AND WHAT COULD.
 *
 * BRIEF-YEAR-ONE reaches for the trophy wall four times, and every time it is the
 * same object doing the same job:
 *
 *   beat 4  "The empty trophy wall shows the outline of what those choices can
 *            earn. Now he wants it."
 *   beat 5  "Something goes on the wall when it is done."
 *   beats 6, 7  the same, per island.
 *   beat 8  "The wall has three things on it."
 *
 * So the wall is not a list of trophies. It is a SEAT PER THING THE STUDENT
 * CHOSE, empty from the moment they chose it and filled when they finish it. The
 * outline and the trophy are the same object in two states, which is why the
 * screen makes a freshman want the rest of the year: the shape of what they are
 * about to earn is already on the wall, with a hole in it.
 *
 * ---- WHY IT IS DERIVED AND NOT STORED -------------------------------------
 *
 * `progress.ts` settled this argument for cords and the same reasoning holds
 * here: a stored wall is a wall that can disagree with the run. Every seat comes
 * from the year's own plan and every fill from the ledger and the completion
 * record, so a wall cannot show a trophy nobody earned and cannot miss one
 * somebody did.
 *
 * IT IS NOT THE STICKER LIST EITHER. `save.stickers` is a bag of ids with no
 * catalogue anywhere in the tree (`yearbook-page.ts` says so where it makes a
 * label out of an id), so a wall built on stickers would be a wall of strings a
 * member happened to type. The plan is authored, the roster names it, and the
 * ledger says whether it was done.
 */
import type { SaveGame } from '../save'
import { classById } from '../planner/catalog'
import { programmeById } from '../roster/roster'
import { coreBeatId } from '../beats/beats'
import { letterOf as letter } from '../progress'

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

/**
 * the wall for one year: a seat for Advisory, one per thing chosen in a season,
 * and one per class on the sheet.
 *
 * Order is the order a student meets them, which is also the order the thirty
 * minutes happens in: Advisory first because it is beat 5, then the seasons,
 * then the classes.
 */
export function wallOf(s: SaveGame | null, year: number = s?.year ?? 1): WallSeat[] {
  if (!s) return []
  const plan = s.plans?.[year] ?? { slots: {}, classes: [], stamped: false }
  const done = (id: string) => s.ledger.find((e) => e.id === id && e.year === year)
  const out: WallSeat[] = []

  /* ADVISORY IS ALWAYS A SEAT, chosen or not, because every student is in it and
   * because it is the first thing that can fill the wall. Its ledger id is the
   * year's core beat, which is the same id the beat runner records under. */
  const core = done(coreBeatId(year))
  out.push({
    id: 'advisory',
    name: 'Advisory',
    kind: 'advisory',
    earned: !!core,
    says: core ? `${letter(core.grade)}, and the 25th credit on its way` : null,
    wants: 'Finish Advisory at the hearth',
  })

  for (const [, id] of Object.entries(plan.slots)) {
    if (!id) continue
    const p = programmeById(id)
    const c = (s.completions ?? []).find((x) => x.programme === id && x.year === year)
    out.push({
      id: `programme:${id}`,
      name: p?.name ?? id,
      kind: 'activity',
      earned: !!c,
      says: c ? (c.rank ? `${letter(c.grade)}, ${c.rank}` : letter(c.grade)) : null,
      wants: p?.kind === 'sport' ? 'Sail there and finish the season' : 'Sail there and finish the year',
    })
  }

  for (const id of plan.classes) {
    const cl = classById(id)
    const row = done(`class:${id}`)
    out.push({
      id: `class:${id}`,
      name: cl?.name ?? id,
      kind: 'class',
      earned: !!row,
      says: row ? letter(row.grade) : null,
      wants: 'Sit the class and pass it',
    })
  }

  return out
}

/** how many seats are filled, which is the sentence beat 8 checks */
export const onTheWall = (s: SaveGame | null, year?: number): number =>
  wallOf(s, year).filter((w) => w.earned).length
