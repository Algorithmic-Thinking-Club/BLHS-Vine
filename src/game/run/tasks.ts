// the year's tasks as a list under the objective bar, derived from the save rather than stored
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
  // one short line under an unfinished task saying where it happens; a finished one has none
  note?: string
  /* a task nobody can do yet, drawn differently from one that is merely unfinished.
   * An island nobody has built is not a thing the student is failing to do. */
  barred?: boolean
}

/** the heading over the sheet, which is the only place the year is named */
export const taskHeading = (year: number): string =>
  year === 1 ? 'Year one' : `Year ${year}`

/** the year's tasks in the order they happen, the same order the objective arrow walks */
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

  // the classes on this year's schedule, since they are the only thing that moves a cord
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
