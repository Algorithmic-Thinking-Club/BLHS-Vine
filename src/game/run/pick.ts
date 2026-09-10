/* a pick, and the one button that plays it */
import type { SaveGame } from '../save'
import { loadSave, recordGrade, recordCompletion } from '../save'
import { classById } from '../planner/catalog'
import { programmeById, islandForClass, islandForProgramme } from '../roster/roster'
import { shownName } from '../roster/placeholders'
import { classPassed } from '../beats/classes'
import { completedIn } from '../save'

/* ---- ONE BUTTON PER PICK, AND THE ROSTER DECIDES WHAT IT DOES -------------
 *
 * ASH, 2026-09-08 item 4: *"A pick with an island: the button reads 'Sail to
 * <name>' and sails there. A pick with no island: the button reads 'Go', opens a
 * card '<name>: no island yet. Counted as done.', marks it complete, fills its
 * frame on the wall, and the bar names the next pick. The quiz is no longer how a
 * class is played. Later, only picks with islands will be selectable, so that
 * branch disappears on its own."*
 *
 * A CLASS AND A CLUB WERE TWO DIFFERENT THINGS AND ARE ONE THING HERE. They are
 * kept in two places in the save (`plan.classes` and `plan.slots`), they are
 * finished by two different records (a ledger row against a completion row), and
 * before today they had two different controls with two different words on them.
 * A student picked four things and the sheet offered him two kinds of button for
 * reasons that are entirely about this codebase. This is the list of what he
 * picked, in the order the year owes them, with one verb.
 *
 * THE QUIZ IS GONE FROM THIS PATH ON PURPOSE. `classBeat` built a three-question
 * card about which cord a course counts toward, and a wrong click on the single
 * scored item was a terminal F on a pick the year then counted as finished. Ash
 * played that as a hang and it was one. What a class IS, once it has an island,
 * is a place you sail to, and until then it is a line on a sheet that says so. */

export type Pick = {
  /** the pick's own id: a class id or a programme id */
  id: string
  kind: 'class' | 'activity'
  /** the school's own name for it, or the placeholder name a stand-in carries */
  name: string
  /** the map somebody has built for it, or null when nobody has */
  map: string | null
  done: boolean
}

/** everything this student picked this year, classes first, in sheet order */
export function picksOf(s: SaveGame | null, year: number = s?.year ?? 1): Pick[] {
  if (!s) return []
  const plan = s.plans?.[year] ?? { slots: {}, classes: [], stamped: false }
  const out: Pick[] = []
  for (const id of plan.classes) {
    const c = classById(id)
    out.push({
      id, kind: 'class', name: c?.name ?? id,
      map: islandForClass(id)?.map ?? null,
      /* PASSED, not merely sat (Ash, 2026-09-09). A pick a student failed is a
       * pick the year is still waiting on, and its button has to come back. */
      done: classPassed(s, id),
    })
  }
  for (const id of Object.values(plan.slots)) {
    if (!id) continue
    const p = programmeById(id)
    out.push({
      id, kind: 'activity', name: p ? shownName(p.id, p.name) : id,
      map: islandForProgramme(id)?.map ?? null,
      done: completedIn(s, id, year),
    })
  }
  return out
}

/** the next thing owed, which is what the objective bar names */
export const nextPick = (s: SaveGame | null): Pick | null => picksOf(s).find((p) => !p.done) ?? null

/** what the button says. Two words for two futures, and the roster picks. */
export const pickVerb = (p: Pick): string => (p.map ? `Sail to ${p.name}` : 'Go')

/** the card a pick with no island opens, in Ash's own words */
export const noIslandLine = (p: Pick): string => `${p.name}: no island yet. Counted as done.`

/* WHAT A PICK WITH NO ISLAND IS WORTH. The row is written so the year moves, the
 * frame fills and the transcript reads like a year: a B, which is what the school
 * gives a course somebody sat and did not distinguish themselves in. The day
 * somebody builds the island the grade comes off play instead and this whole
 * function stops being reachable, so it is deliberately not clever. */
export const COUNTED_GRADE = 3.0

/** mark a pick finished without an island. Returns false only when there is no run. */
export function countAsDone(p: Pick): boolean {
  const s = loadSave()
  if (!s) return false
  if (p.kind === 'class') {
    const c = classById(p.id)
    recordGrade({
      id: `class:${p.id}`,
      title: c?.name ?? p.id,
      kind: 'class',
      credit: c ? 0.5 : 0,
      grade: COUNTED_GRADE,
      year: s.year,
      season: s.season,
      ...(c?.tags?.length ? { tags: c.tags } : {}),
    })
  } else {
    const g = programmeById(p.id)
    recordCompletion(p.id, COUNTED_GRADE, g?.rankTrack ?? undefined)
  }
  return true
}
