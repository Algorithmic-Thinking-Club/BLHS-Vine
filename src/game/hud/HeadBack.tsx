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
import { islandForProgramme } from '../roster/roster'
import { islandTaskList, onIslandTasks } from './island-tasks'
import { cinemaOn, onCinema } from '../stage/cinema'
import { dialogueState, onDialogue } from '../dialogue'
import { homeListenerCount, requestHeadBack } from '../world/home-bus'
import { onSceneDrawn, onStageBusy, placeCardUp, sceneDrawn } from '../stage/stage-bus'
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
  useEffect(() => onSceneDrawn(redraw), [])
  const [going, setGoing] = useState(false)
  const [why, setWhy] = useState<string | null>(null)

  const list = islandTaskList()
  const save = loadSave()
  const done = list ? tasksDoneIn(list.programme, save?.year ?? 1) : []
  /* ---- THE LIST HAS TO BELONG TO THE MAP UNDER HIS FEET -------------------
   *
   * Belt and braces beside the scene teardown that clears it. The declaration is module
   * state on a bus, and the bus does not know which map is drawn, so a list that outlived
   * its island once put "Island finished. Head back." on the bottom of the home base:
   * the hub registers this listener too, because the world gives it a berth.
   *
   * The roster is what ties a programme to a map, which is the same lookup the year sheet
   * uses to decide where a pick is played. */
  const here = sceneDrawn()
  const onItsOwnIsland = !!list && !!here && islandForProgramme(list.programme)?.map === here
  const finished = !!list && onItsOwnIsland
    && list.tasks.length > 0 && list.tasks.every((t) => done.includes(t.id))

  /* ---- WHEN IT IS NOT OFFERED, AND EVERY CLAUSE IS A REAL CASE -------------
   *
   * No island, or work left: there is nothing to say yet. A cutscene or a line of
   * dialogue: this shares the bottom of the window with the dialogue box, and a
   * control drawn over somebody's last sentence steps on it. A panel open: the same
   * rule the rest of the corner chrome keeps. An arrival card up: it is the other
   * thing that owns the middle of the screen. And no scene listening, which is the
   * standalone harness and any map with no dock, where pressing it could only ever
   * produce a refusal. */
  /* PANELS ARE LEFT TO CSS, because this component is a sibling of the one that opens
   * them: a panel closing changes the Hud's own state and re-renders nothing here, so
   * a button hidden while a panel was up stayed hidden after it closed until something
   * unrelated wrote the save. `a11y.ts` stamps `data-panels` on the root on every push
   * and pop, and four other surfaces already stand down that way. */
  const hidden = !finished
    || cinemaOn()
    || dialogueState() !== null
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
