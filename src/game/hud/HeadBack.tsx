/* island finished, head back: the one control that appears when an island has nothing left to ask for, and it is chrome rather than dialogue so any island that declares tasks and ticks them all gets it without a member writing anything */
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
  /* the list has to belong to the map currently drawn: the declaration is module state on a bus that does not know which map is drawn, so a list outliving its island once put the finished button on the home base */
  const here = sceneDrawn()
  const onItsOwnIsland = !!list && !!here && islandForProgramme(list.programme)?.map === here
  const finished = !!list && onItsOwnIsland
    && list.tasks.length > 0 && list.tasks.every((t) => done.includes(t.id))

  /* not offered with no island or work left, during a cutscene or dialogue because it shares the bottom of the window with the dialogue box, while a panel or arrival card is up, or with no scene listening, where a press could only be refused */
  /* panels are left to CSS through `data-panels` on the root, because a panel closing re-renders the sibling that opens it and not this, so a button hidden while a panel was up stayed hidden after it closed */
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
            /* a refusal is said out loud, because a press that appears to do nothing is worse than a line */
            if (!a.ok) setWhy(a.why)
          })
        }}
      >
        Island finished. Head back.
      </Plank>
    </div>
  )
}
