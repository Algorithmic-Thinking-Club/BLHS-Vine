/* the objective panel: one short line at the top of the screen saying what to do now */
import { useEffect, useRef, useState } from 'react'
import { loadSave, subscribeSave } from '../save'
import { nextObjective, objectiveLine } from '../run/objective'
import { taskHeading, tasksDone, tasksOf } from '../run/tasks'
import { objectiveSaid, onObjectiveSaid, worldObjective } from './objective-bus'
import { onSceneDrawn, sceneDrawn } from '../stage/stage-bus'
import { track } from '../telemetry'
import './objective.css'

export function ObjectivePanel() {
  const [, bump] = useState(0)
  const redraw = () => bump((v) => v + 1)
  useEffect(() => subscribeSave(redraw), [])
  useEffect(() => onObjectiveSaid(redraw), [])
  /* THE MAP UNDER HIS FEET, because the year's sentence is two sentences: one
   * said on the objective's own map and one said from anywhere else. The panel
   * is mounted above every world scene and has to know which it is looking at. */
  const [map, setMap] = useState<string | null>(sceneDrawn())
  useEffect(() => { setMap(sceneDrawn()); return onSceneDrawn(setMap) }, [])

  /* THE SHEET IS OPEN OR IT IS NOT, and that is the whole of its state. It is not
   * in the save: what a student has open is not part of their run, and a sheet
   * that survived a reload would be a sheet nobody asked for. */
  const [open, setOpen] = useState(false)
  const opens = useRef(0)
  const toggle = () => {
    setOpen((was) => {
      if (!was) track('task_sheet_opened', { at: ++opens.current })
      return !was
    })
  }

  /* the three voices in order: what the island said, then the scene, then the year */
  const said = objectiveSaid()
  const world = worldObjective()
  const o = nextObjective(loadSave())
  const text = said ?? world ?? objectiveLine(o, map)

  /* SAID ONCE PER SENTENCE, not once per render. What the study wants is which
   * objective a student was looking at and when it changed. */
  useEffect(() => {
    if (!text) return
    track('objective_shown', { text, said: !!said, phase: o?.phase ?? null })
    /* the phase and the flag ride along in the event; the sentence is the key */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  if (!text) return null

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

/* the sheet under the bar: everything this year asks for, derived and never pressable */
function TaskSheet({ onClose }: { onClose: () => void }) {
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  const save = loadSave()
  const list = tasksOf(save)
  const { done, total } = tasksDone(list)

  /* a press anywhere, or Escape, closes the sheet */
  useEffect(() => {
    const away = () => onClose()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    /* in the capture phase, so a press that lands on the sheet itself still closes it */
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
    <div className="ob-sheet kit-surface-band" onPointerDown={(e) => e.stopPropagation()}>
      <p className="ob-sheet-head">
        {taskHeading(save?.year ?? 1)}
        <span className="ob-sheet-count">{done} of {total} done</span>
      </p>
      <ul className="ob-tasks">
        {list.map((t) => (
          <li
            key={t.id}
            className={`ob-task${t.done ? ' is-done' : ''}${t.barred && !t.done ? ' is-barred' : ''}`}
          >
            {/* THE MARK IS A CHARACTER AND NOT AN EMOJI. `docs/ART.md` forbids
                emoji, and the plain arm has to read the same shape in a system
                face, so a tick and an empty box are the whole vocabulary. */}
            <span className="ob-mark" aria-hidden="true">{t.done ? '✓' : t.barred ? '–' : '▢'}</span>
            <span className="ob-task-body">
              <span className="ob-task-name">{t.name}</span>
              {t.note && <span className="ob-task-note">{t.note}</span>}
            </span>
            <span className="ob-sr">{t.done ? ' done' : t.barred ? ' not open yet' : ' still to do'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
