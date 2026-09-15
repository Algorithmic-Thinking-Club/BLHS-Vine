/* a pick, and the one button that plays it */
import type { SaveGame } from '../save'
import { loadSave, recordGrade, recordCompletion, setIslandState } from '../save'
import { classById } from '../planner/catalog'
import { programmeById, islandForClass, islandForProgramme } from '../roster/roster'
import { shownName } from '../roster/placeholders'
import { classPassed } from '../beats/classes'
import { completedIn } from '../save'

/* one button per pick: with an island it sails there, without one it opens a card and counts as done, and classes and clubs share one verb across `plan.classes` and `plan.slots`; the quiz is gone because a wrong click on `classBeat`'s one scored item was a terminal F on a pick the year counted as finished */

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
      /* passed, not merely sat: a pick a student failed is a pick the year is still waiting on, and its button has to come back */
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

/* the same press where the name is already on screen, the season column on the year sheet: the card above prints the club's name, so repeating it costs the width that made it fit, and Sail to Algorithmic Thinking Club needs 254px against a 171px sign; the long form stays where the button stands alone */
export const pickVerbHere = (p: Pick): string => (p.map ? 'Sail there' : 'Go')

/** the card a pick with no island opens */
export const noIslandLine = (p: Pick): string => `${p.name}: no island yet. Counted as done.`

/* a pick with no island is a B on zero credit: at half a credit it measured a 3.33 GPA over four played years even acing every Advisory, putting Highest Honors 3.76 and High Honors 3.5 out of reach; `gpaOf` weights by credit so zero moves nothing, and the grade is still written for `beatState` */
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
    /* `recordCompletion` writes the transcript row, `setIslandState` is what the diploma reads; only the grape `award` path called the second, so a sheet-finished run graduated on Islands completed: 0, and completion goes first because `setIslandState` writes its own and would drop the rank track */
    recordCompletion(p.id, COUNTED_GRADE, g?.rankTrack ?? undefined)
    setIslandState(p.id, 'completed')
  }
  return true
}
