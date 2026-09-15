/* the objective panel: one short line at the top of the screen saying what to do now */
import type React from 'react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { loadSave, subscribeSave, tasksDoneIn, type SaveGame } from '../save'
import { nextObjective, objectiveLine } from '../run/objective'
import { islandHeading, taskHeading, tasksDone, tasksOf, type Task } from '../run/tasks'
import { objectiveSaid, onObjectiveSaid, runEnding, worldObjective } from './objective-bus'
import { islandTaskList, onIslandTasks, type IslandTaskList } from './island-tasks'
import { onSceneDrawn, sceneDrawn } from '../stage/stage-bus'
import { track } from '../telemetry'
import { requestUi } from '../ui-bus'
import './objective.css'
import { onVoyage, voyage } from '../world/travel'
import { titleOfMap } from '../stage/covers'

export function ObjectivePanel() {
  const [, bump] = useState(0)
  const redraw = () => bump((v) => v + 1)
  useEffect(() => subscribeSave(redraw), [])
  useEffect(() => onObjectiveSaid(redraw), [])
  /* the map under the player's feet, because the year's sentence is one thing on the objective's own map and another from anywhere else, and this panel mounts above every world scene */
  const [map, setMap] = useState<string | null>(sceneDrawn())
  useEffect(() => { setMap(sceneDrawn()); return onSceneDrawn(setMap) }, [])

  /* open or not is the whole of its state, and it stays out of the save because a sheet that survived a reload is a sheet nobody asked for */
  const [open, setOpen] = useState(false)
  const opens = useRef(0)
  const toggle = () => {
    setOpen((was) => {
      if (!was) track('task_sheet_opened', { at: ++opens.current })
      return !was
    })
  }

  /* a journey outranks every other sentence: the destination island's `start` runs while the ship is still on the water, so without this the line reads "Find the club president." over a boat in the middle of the sea */
  const [going, setGoing] = useState(voyage())
  useEffect(() => onVoyage(setGoing), [])

  /* the voices in order: the journey, then what the island said, then the scene, then the year */
  const said = objectiveSaid()
  const world = worldObjective()
  const o = nextObjective(loadSave())
  const travelling = going ? `Sailing to ${titleOfMap(going.to)}.` : null
  const text = travelling ?? said ?? world ?? objectiveLine(o, map)
  /* raised by `end_run` for the length of the departure, and dropped with it */
  const ending = runEnding()

  /* tracked once per sentence and not once per render, so the events say which objective was on screen and when it changed */
  useEffect(() => {
    if (!text) return
    track('objective_shown', { text, said: !!said, phase: o?.phase ?? null })
    /* the phase and the flag ride along in the event; the sentence is the key */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  /* `end_run` raises `ending` while the ship leaves, because the year's closing line drew across the top of the departure over somebody who had nothing left to look at. Unmounted rather than hidden, so the live region stops saying it to a screen reader too. */
  if (!text || ending) return null

  return (
    <div className="ob-wrap">
      {/* only this line is announced to a screen reader, never the sheet under it */}
      <div className="ob-live" role="status" aria-live="polite">{text}</div>
      {/* dressed as the narrow carved plaque rather than the big parchment band */}
      <button
        type="button"
        className="ob-panel"
        title={text}
        aria-expanded={open}
        aria-label={`${text} Press to see everything this year asks for.`}
        onClick={(e) => { e.stopPropagation(); toggle() }}
      >
        {text}
        {/* the chevron, which is the only thing saying the bar can be pressed */}
        <span className="ob-more" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && <TaskSheet onClose={() => setOpen(false)} />}
    </div>
  )
}

/* every row does the thing it names: the schedule and every pick open the year sheet, Advisory opens Advisory, and the last row only says where the man is, because a readout made a student read a note and then go hunt the sign it had just named. A finished or barred row is not a control. */
/** which panel a row opens, or null for a row nothing on screen can finish */
function openerOf(t: Task): 'planner' | 'advisory' | null {
  if (t.done || t.barred) return null
  if (t.id === 'plan' || t.id.startsWith('class:') || t.id.startsWith('voyage:')) return 'planner'
  if (t.id === 'core') return 'advisory'
  /* the last row is a place in the world and not a panel, so it stays a line */
  return null
}

/* an island's own list goes in this same sheet in the row shape it already draws rather than a second sheet beside it, and an island row is never a control because the thing it names happens in the room */
function islandRows(list: IslandTaskList, save: SaveGame | null): Task[] {
  const ticked = new Set(tasksDoneIn(list.programme, save?.year ?? 1))
  return list.tasks.map((t) => ({
    id: `island:${t.id}`,
    name: t.name,
    done: ticked.has(t.id),
    ...(ticked.has(t.id) || !t.note ? {} : { note: t.note }),
  }))
}

function TaskSheet({ onClose }: { onClose: () => void }) {
  const [, bump] = useState(0)
  const redraw = () => bump((v) => v + 1)
  useEffect(() => subscribeSave(redraw), [])
  useEffect(() => onIslandTasks(redraw), [])
  const save = loadSave()
  /* the island's rows go first and the year's stay under them rather than being replaced, because this is the only task sheet in the game and in the home base the year's rows are what the room asks: replacing them would hide Advisory, every pick and the row that closes the year */
  const island = islandTaskList()
  const here = island ? islandRows(island, save) : []
  const year = tasksOf(save)
  const list = [...here, ...year]
  /* each heading counts its own rows, because one counter over both said "1 of 8 done" to a student standing on an island with two things to do */
  const mine = tasksDone(here.length ? here : year)
  const theirs = tasksDone(year)

  /* the close listener is on the window in the capture phase, so `stopPropagation` on the sheet can never reach it and every press closed the sheet before a row's click could fire: test containment instead, because capture is what closes it on a press anywhere else without the world underneath cooperating */
  const sheet = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (sheet.current?.contains(e.target as Node)) return
      onClose()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    const t = setTimeout(() => window.addEventListener('pointerdown', away, true), 0)
    window.addEventListener('keydown', key, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [onClose])

  if (!list.length) return null

  return (
    <div className="ob-sheet kit-surface-band" ref={sheet}>
      <p className="ob-sheet-head">
        {island ? islandHeading(island.programme) : taskHeading(save?.year ?? 1)}
        <span className="ob-sheet-count">{mine.done} of {mine.total} done</span>
      </p>
      <ul className="ob-tasks">
        {list.map((t, i) => (
          <Fragment key={t.id}>
            {/* the year's own heading, printed once, where the island's rows end */}
            {here.length > 0 && i === here.length && (
              <li className="ob-sheet-sub" aria-hidden="true">
                {taskHeading(save?.year ?? 1)}
                <span className="ob-sheet-count">{theirs.done} of {theirs.total} done</span>
              </li>
            )}
          <li
            className={`ob-task${t.done ? ' is-done' : ''}${t.barred && !t.done ? ' is-barred' : ''}${openerOf(t) ? ' is-live' : ''}`}
            {...(openerOf(t)
              ? {
                role: 'button' as const,
                tabIndex: 0,
                onClick: () => { requestUi(openerOf(t)!); onClose() },
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  requestUi(openerOf(t)!)
                  onClose()
                },
              }
              : {})}
          >
            {/* the mark is a character and not an emoji, which are forbidden, and the plain arm has to read the same shape in a system face, so a tick and an empty box are the whole vocabulary */}
            <span className="ob-mark" aria-hidden="true">{t.done ? '✓' : t.barred ? '–' : '▢'}</span>
            <span className="ob-task-body">
              <span className="ob-task-name">{t.name}</span>
              {t.note && <span className="ob-task-note">{t.note}</span>}
            </span>
            <span className="ob-sr">{t.done ? ' done' : t.barred ? ' not open yet' : ' still to do'}</span>
          </li>
          </Fragment>
        ))}
      </ul>
    </div>
  )
}
