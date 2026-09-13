/* ISLAND FINISHED, HEAD BACK. The one control that appears when an island has
 * nothing left to ask for.
 *
 * Ash: *"when all tasks in an island are complete, a button at the bottom middle
 * should show up saying 'Island Finished - Head back'. once clicked, the user gets
 * teleported to the dock of the island they are on. and of course the same sailing
 * logic, esc, the chart, or the immediate sailing, etc. this is constant always."*
 *
 * WHY IT IS A BUTTON AND NOT A LINE OF DIALOGUE. An island's last word belongs to
 * whoever is standing there saying it. This is the game saying "you are done here",
 * which is chrome, and it has to appear on every island without a member writing
 * anything: an island that declares tasks and ticks them all gets it for free.
 */
import { useEffect, useState } from 'react'
import { loadSave, subscribeSave, tasksDoneIn } from '../save'
import { islandTaskList, onIslandTasks } from './island-tasks'
import { cinemaOn, onCinema } from '../stage/cinema'
import { dialogueState, onDialogue } from '../dialogue'
import { homeListenerCount, requestHeadBack } from '../world/home-bus'
import { onStageBusy, placeCardUp } from '../stage/stage-bus'
import { panelDepth } from '../ui/a11y'
import { Plank } from '../ui/controls'
import { track } from '../telemetry'
import './headback.css'

export function HeadBack() {
  const [, bump] = useState(0)
  const redraw = () => bump((v) => v + 1)
  useEffect(() => subscribeSave(redraw), [])
  useEffect(() => onIslandTasks(redraw), [])
  useEffect(() => onCinema(redraw), [])
  useEffect(() => onDialogue(redraw), [])
  useEffect(() => onStageBusy(redraw), [])
  const [going, setGoing] = useState(false)
  const [why, setWhy] = useState<string | null>(null)

  const list = islandTaskList()
  const save = loadSave()
  const done = list ? tasksDoneIn(list.programme, save?.year ?? 1) : []
  const finished = !!list && list.tasks.length > 0 && list.tasks.every((t) => done.includes(t.id))

  /* ---- WHEN IT IS NOT OFFERED, AND EVERY CLAUSE IS A REAL CASE -------------
   *
   * No island, or work left: there is nothing to say yet. A cutscene or a line of
   * dialogue: this shares the bottom of the window with the dialogue box, and a
   * control drawn over somebody's last sentence steps on it. A panel open: the same
   * rule the rest of the corner chrome keeps. An arrival card up: it is the other
   * thing that owns the middle of the screen. And no scene listening, which is the
   * standalone harness and any map with no dock, where pressing it could only ever
   * produce a refusal. */
  const hidden = !finished
    || cinemaOn()
    || dialogueState() !== null
    || panelDepth() > 0
    || placeCardUp()
    || homeListenerCount() === 0
  if (hidden) return null

  return (
    <div className="hb-back">
      {why && <p className="hb-back-why" role="status">{why}</p>}
      <Plank
        size="md"
        busy={going}
        onClick={() => {
          if (going) return
          setGoing(true)
          setWhy(null)
          track('head_back_pressed', { programme: list!.programme })
          void requestHeadBack().then((a) => {
            setGoing(false)
            /* A REFUSAL IS SAID OUT LOUD. The button only draws where a scene is
             * listening, so this is the "not while something else is happening"
             * case, and a press that appears to do nothing is worse than a line. */
            if (!a.ok) setWhy(a.why)
          })
        }}
      >
        Island finished. Head back.
      </Plank>
    </div>
  )
}
