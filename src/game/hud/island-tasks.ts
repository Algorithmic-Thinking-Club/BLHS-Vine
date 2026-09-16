/* what this island is asking of the student, as a list under the objective bar */
import type { IslandTask } from '../../vine/intents'

export type IslandTaskList = {
  /** the programme whose island declared it, which is how the ticks are found */
  programme: string
  tasks: IslandTask[]
}

let list: IslandTaskList | null = null
const subs = new Set<() => void>()

const fire = () => {
  for (const s of [...subs]) {
    try { s() } catch (e) { console.error('[island-tasks] a listener threw', e) }
  }
}

/** the list the island on screen declared, or null when no island has said anything */
export const islandTaskList = (): IslandTaskList | null => list

/** the `island_tasks` word. REPLACES whatever was declared, never appends. */
export function setIslandTasks(programme: string, tasks: IslandTask[]) {
  /* the same list again is not a change, so a re-declaring start does not re-render the sheet */
  const same = list
    && list.programme === programme
    && list.tasks.length === tasks.length
    && list.tasks.every((t, i) => t.id === tasks[i].id && t.name === tasks[i].name && t.note === tasks[i].note)
  if (same) return
  list = { programme, tasks }
  fire()
}

/* the list goes when the island does, since its rows name things to do here */
export function clearIslandTasks() {
  if (!list) return
  list = null
  fire()
}

/** and a redraw when a tick lands, which the save's own subscribers also get */
export function onIslandTasks(f: () => void): () => void {
  subs.add(f)
  return () => { subs.delete(f) }
}

/** told when a tick lands, so the sheet redraws without waiting on a save event */
export const islandTaskTicked = fire
