// the year's tasks as a list under the objective bar, derived from the save rather than stored
import type { SaveGame } from '../save'
import { sessionOver, yearStatus } from './year'
import { picksOf } from './pick'

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

  /* ---- EVERY PICK, WITH ONE NOTE, BECAUSE THERE IS ONE BUTTON ------------
   *
   * ASH, 2026-09-08 item 4. A class row and a club row used to be built by two
   * loops with two different notes ("Sit it from your schedule" against "Sail
   * there from the harbor") and a third state for a club nobody had built. There
   * is one control now and it always finishes the pick, so there is one row
   * shape, and nothing on this sheet is barred any more. */
  for (const p of picksOf(s)) {
    out.push({
      id: `${p.kind === 'class' ? 'class' : 'voyage'}:${p.id}`,
      name: p.name,
      done: p.done,
      ...(p.done ? {} : { note: p.map ? 'Sail there from your year sheet' : 'Open My Year and go' }),
    })
  }

  out.push({
    id: 'end',
    name: 'Finish the year',
    done: st.yearbookSeen || sessionOver(s),
    ...(st.yearbookSeen || sessionOver(s)
      ? {}
      : st.readyForYearbook
        ? { note: 'Go back to the Maw. The principal is waiting' }
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
