/* THE YEAR AS A LIST, WHICH IS THE THING A LOST STUDENT ASKS FOR.
 *
 * Ash, 2026-09-08, after playing rail-7: *"Imagine a freshman joins this game.
 * They have no idea what the fuck to do. It's just so lost."* And his own smallest
 * suggestion in the same message: *"when a student clicks on the panel on the top
 * middle, maybe it expands to show a task list sheet?"*
 *
 * BRIEF-CLOSE-THE-LOOP section 7 rules it: *"Pressing the objective bar drops a
 * small sheet under it listing the year's tasks with a mark on each: Schedule,
 * Advisory, each island, the year's end… It is the quest log every RPG has, and
 * where electives and seasons explain themselves by structure the day they
 * exist."*
 *
 * ---- WHY THIS OVERTURNS A STANDING RULE, SAID OUT LOUD ---------------------
 *
 * `docs/walkthrough/40-part-iv-frame.md` §40.6 says "**No quest log.**
 * `objective.ts` is the replacement and it is deliberately one live thing at a
 * time, because a home base with six glowing stations is a menu." That rule was
 * written about the WORLD: it is why one station lights and five do not, and it
 * still holds, because nothing here lights anything.
 *
 * What it got wrong is that one live thing at a time answers "what now" and
 * never answers "what IS this". A student four minutes in has been told to fill
 * a schedule and has no idea whether that is the whole game or the first of
 * forty. The arrow is a compass; this is the map, and a compass with no map is
 * why he was lost.
 *
 * ---- IT IS DERIVED, LIKE EVERY OTHER READBACK IN THE RUN -------------------
 *
 * Nothing here is stored. `yearStatus` already answers all five questions off
 * the save, so a task cannot disagree with the arrow, the year sheet, the
 * yearbook or the trophy wall: they are five renderings of one derivation.
 *
 * ---- AND NO SEASONS ANYWHERE IN IT ----------------------------------------
 *
 * BRIEF-CLOSE-THE-LOOP section 4: the words Fall, Winter and Spring appear
 * nowhere a student reads until a real sport with a season exists. A voyage row
 * therefore names the ISLAND and never the season the token sat in, which is
 * also the honest label: what a student is being asked to do is go to a place,
 * and which column it came out of is bookkeeping.
 */
import type { SaveGame } from '../save'
import { classById } from '../planner/catalog'
import { shownName } from '../roster/placeholders'
import { sessionOver, yearStatus } from './year'

export type Task = {
  /** stable across renders, and never shown */
  id: string
  /** the thing itself, in the words the rest of the game uses for it */
  name: string
  done: boolean
  /* ONE SHORT LINE UNDER AN UNFINISHED TASK, SAYING WHERE IT HAPPENS. A list of
   * five nouns is a list of five things a student still cannot find; the note is
   * what turns each row into an instruction. A finished row carries none,
   * because the tick has said everything. */
  note?: string
  /* a task nobody can do yet, drawn differently from one that is merely unfinished.
   * An island nobody has built is not a thing the student is failing to do. */
  barred?: boolean
}

/** the heading over the sheet, which is the only place the year is named */
export const taskHeading = (year: number): string =>
  year === 1 ? 'Year one' : `Year ${year}`

/* THE ORDER IS THE ORDER THEY HAPPEN IN, and it is the same order `nextObjective`
 * walks: the schedule, then Advisory, then whatever the schedule bought, then the
 * year closing. A list sorted any other way would disagree with the arrow about
 * what comes next, and the whole point of having both is that they agree. */
export function tasksOf(s: SaveGame | null): Task[] {
  if (!s) return []
  const st = yearStatus(s)
  const out: Task[] = []

  out.push({
    id: 'plan',
    name: 'Your schedule',
    done: st.planStamped,
    ...(st.planStamped ? {} : { note: 'Fill both Elective periods and stamp it' }),
  })

  out.push({
    id: 'core',
    name: 'Advisory',
    done: st.coreBeatDone,
    ...(st.coreBeatDone ? {} : { note: 'At the fire, inside the Panther’s Maw' }),
  })

  /* THE CLASSES ARE ON THE SHEET SO THEY ARE ON THE LIST, and the brief's four
   * kinds did not name them because they are the year's optional depth rather
   * than its gate (`year.ts`, `readyForYearbook`). They are still the only thing
   * in the game today that moves a graduation cord, so a student who cannot see
   * them cannot find the one system the whole four-year model rests on. */
  for (const id of s.plans[st.year]?.classes ?? []) {
    const c = classById(id)
    out.push({
      id: `class:${id}`,
      name: c?.name ?? id,
      done: st.classesDone.includes(id),
      ...(st.classesDone.includes(id) ? {} : { note: 'Sit it from your schedule' }),
    })
  }

  for (const v of st.voyages) {
    out.push({
      id: `voyage:${v.programmeId}`,
      name: shownName(v.programmeId, v.name),
      done: v.done,
      ...(v.playable
        ? (v.done ? {} : { note: 'Sail there from the harbor' })
        : { barred: true, note: 'Nobody has built this island yet' }),
    })
  }

  out.push({
    id: 'end',
    name: 'Finish the year',
    done: st.yearbookSeen || sessionOver(s),
    ...(st.yearbookSeen || sessionOver(s)
      ? {}
      : st.readyForYearbook
        ? { note: 'The principal is waiting in the Maw' }
        : { barred: true, note: 'After your schedule and Advisory' }),
  })

  return out
}

/** how much of the year is behind him, for the line on the sheet's own heading */
export function tasksDone(list: Task[]): { done: number; total: number } {
  /* A BARRED ROW IS NOT PART OF THE DENOMINATOR. Counting an island nobody has
   * built as a task he has failed would make the sheet say a student is two
   * thirds done with a year he has actually finished. */
  const counted = list.filter((t) => !t.barred || t.done)
  return { done: counted.filter((t) => t.done).length, total: counted.length }
}
