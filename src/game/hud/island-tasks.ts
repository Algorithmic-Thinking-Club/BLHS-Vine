/* what THIS island is asking of the student, as a list under the objective bar.
 *
 * Ash: *"islands should constantly have tasks to do, and thats how it should be
 * layed out. and it goes towards completing that island."*
 *
 * ONLY THE DECLARATION LIVES HERE. Which rows are ticked is in the save, keyed by
 * programme and year, because a student who closes the tab halfway through an
 * island has still done what he did. A list of names, by contrast, means nothing
 * while its island is not loaded, so it is transient by design and an island that
 * declares the same list on every load is doing the right thing.
 */
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
  /* the same list again is not a change, or an @on_start that re-declares on every
   * map load would re-render the sheet for nothing */
  const same = list
    && list.programme === programme
    && list.tasks.length === tasks.length
    && list.tasks.every((t, i) => t.id === tasks[i].id && t.name === tasks[i].name && t.note === tasks[i].note)
  if (same) return
  list = { programme, tasks }
  fire()
}

/* ISLAND LEFT, LIST GONE. The rows name things to do HERE, so carrying them onto
 * the next map would tell a student to press a machine that is not in the room. */
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
