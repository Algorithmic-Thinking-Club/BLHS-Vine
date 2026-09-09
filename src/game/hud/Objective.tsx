/* the objective panel: one short line at the top of the screen saying what to do now */
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { loadSave, subscribeSave } from '../save'
import { nextObjective, objectiveLine } from '../run/objective'
import { taskHeading, tasksDone, tasksOf, type Task } from '../run/tasks'
import { objectiveSaid, onObjectiveSaid, runEnding, worldObjective } from './objective-bus'
import { onSceneDrawn, sceneDrawn } from '../stage/stage-bus'
import { track } from '../telemetry'
import { requestUi } from '../ui-bus'
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
  /* raised by `end_run` for the length of the departure, and dropped with it */
  const ending = runEnding()

  /* SAID ONCE PER SENTENCE, not once per render. What the study wants is which
   * objective a student was looking at and when it changed. */
  useEffect(() => {
    if (!text) return
    track('objective_shown', { text, said: !!said, phase: o?.phase ?? null })
    /* the phase and the flag ride along in the event; the sentence is the key */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  /* ---- THE LAST SHOT OF THE YEAR SAYS NOTHING (Ash, 2026-09-09) ----------
   *
   * `end_run` raises this on the objective bus while the ship leaves. The year's own sentence
   * for a closed run is "Year one is done. Look around.", and it drew across the
   * top of the departure over a boy who was leaving and had nothing left to look
   * at. Unmounted rather than hidden, so the live region stops saying it to a
   * screen reader too. */
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

/* ---- THE SHEET UNDER THE BAR, AND EVERY ROW IS A WAY IN ------------------
 *
 * ASH, 2026-09-08: *"THERE ALSO NEEDS GUIDEABILITY... TO MAKE THE GAME MORE
 * UNDERSTANDABLE."*
 *
 * It was a readout: five nouns and a note each, correct and inert. A student who
 * opened it read "AP Human Geography · Open My Year and go", closed it, and then
 * had to find the sign in the corner that the note had just named. Two steps
 * where the game already knew the answer.
 *
 * SO A ROW DOES THE THING IT NAMES. The schedule and every pick open the year
 * sheet, Advisory opens Advisory, the last row closes nothing and says where the
 * man is. A finished row is not a control, because there is nothing left to do
 * to it, and neither is a row for something that happens in the world rather
 * than behind a button. */
/** which panel a row opens, or null for a row nothing on screen can finish */
function openerOf(t: Task): 'planner' | 'advisory' | null {
  if (t.done || t.barred) return null
  if (t.id === 'plan' || t.id.startsWith('class:') || t.id.startsWith('voyage:')) return 'planner'
  if (t.id === 'core') return 'advisory'
  /* the last row is a place in the world and not a panel, so it stays a line */
  return null
}

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
