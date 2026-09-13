/* a pick, and the one button that plays it */
import type { SaveGame } from '../save'
import { loadSave, recordGrade, recordCompletion, setIslandState } from '../save'
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

/* THE SAME PRESS WHERE THE NAME IS ALREADY ON SCREEN, which is the season column
 * on the year sheet: the card above the button prints the club's name, so the
 * button repeating it says nothing and costs the width that made it fit.
 * Measured: "Sail to Algorithmic Thinking Club" needs 254px and that sign is
 * 171px, which is what Ash saw as the button overflowing. The long form stays
 * wherever the button stands on its own. */
export const pickVerbHere = (p: Pick): string => (p.map ? 'Sail there' : 'Go')

/** the card a pick with no island opens, in Ash's own words */
export const noIslandLine = (p: Pick): string => `${p.name}: no island yet. Counted as done.`

/* ---- WHAT A PICK WITH NO ISLAND IS WORTH, AND IT IS NOT A GRADE ----------
 *
 * It was a flat B on half a credit, so that the year moved and the frame filled.
 * Measured across four played years: a student who aced every Advisory still
 * finished on a GPA of 3.33, because two counted picks a year at 3.0 outweighed
 * one Advisory at 4.0. Highest Honors wants 3.76 and High Honors wants 3.5, so
 * BOTH GPA cords were mathematically unreachable and the counselor spent every
 * closing film draping a cord at 95% that the game could not award.
 *
 * A PLACEHOLDER IS NOT A COURSE. It carries no credit now, so it moves no GPA
 * and no cord: `gpaOf` weights by credit and a zero-credit row is invisible to
 * it. The pick still completes, the frame still fills, and the wall says
 * "counted" rather than "credit earned", which is the truth about it.
 *
 * THE GRADE IS STILL WRITTEN because `beatState` reads it, and a pick has to
 * read as PASSED for the year to close. The day somebody builds the island the
 * grade and the credit both come off play and none of this is reachable. */
export const COUNTED_GRADE = 3.0
/** and no credit, so a stand-in never moves the transcript it is standing in for */
export const COUNTED_CREDIT = 0

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
      credit: COUNTED_CREDIT,
      grade: COUNTED_GRADE,
      year: s.year,
      season: s.season,
      ...(c?.tags?.length ? { tags: c.tags } : {}),
    })
  } else {
    const g = programmeById(p.id)
    /* ---- AND THE ISLAND IS MARKED FINISHED (Ash, 2026-09-09) -------------
     *
     * `recordCompletion` writes the transcript row; `setIslandState` is what
     * the world and the diploma read. Only the grape `award` path ever called
     * the second one, so a student who finished every pick through the sheet
     * reached graduation and read "Islands completed: 0".
     *
     * THE COMPLETION GOES FIRST, because `setIslandState` writes a completion of
     * its own off the ledger and would drop the rank track if it got there
     * first. */
    recordCompletion(p.id, COUNTED_GRADE, g?.rankTrack ?? undefined)
    setIslandState(p.id, 'completed')
  }
  return true
}
