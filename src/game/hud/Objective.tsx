/* THE OBJECTIVE PANEL: what to do, at the top of the screen, at every moment.
 *
 * BRIEF-MAW-RAIL-3 A, Ash after playing rail-2 on the live URL: *"A panel at the
 * top centre of the screen that says the current objective at every moment,
 * during cutscenes AND normal play. One short imperative, nothing else: 'Follow
 * the principal', 'Fill your schedule', 'Answer Advisory', 'Talk to the
 * counselor', 'Explore the Maw'. It reads `nextObjective` outside a cutscene and
 * the cutscene's own current step inside one... Drawn in the kit, inside the
 * bars when they are up, never hidden, never a paragraph. The small task plaque
 * over Thor goes away; this panel replaces it."*
 *
 * WHAT IT REPLACES, AND WHY BOTH OF THEM LOST. `hud/Heading.tsx` said the same
 * sentence in the bottom-left corner on the tile scenes and hid itself the
 * moment anything else spoke, and `PmapScene`'s task plaque said it over Thor's
 * head on a painted map and hid itself for the same reasons. Two renderers for
 * one sentence, in two corners, both of which went away exactly when a lost
 * student was most lost: inside a cutscene, mid-line, mid-walk. One panel, one
 * place, and it does not go away.
 *
 * ---- WHY IT DOES NOT YIELD, WHICH IS THE WHOLE CHANGE ---------------------
 *
 * The old rule was "one line, and it stands aside for anything with more to
 * say", which is right for a heading and wrong for a task. A student watching a
 * six minute cutscene with a man walking him round a room has NOTHING on the
 * glass telling him what any of it is for, and that is the sentence Ash has now
 * asked for three times. So it is furniture: it is on the first frame of the
 * world and on the last, it rides inside the black bars rather than behind them,
 * and the only thing that ever covers it is a panel drawn over the whole window,
 * which is a screen that is itself the objective.
 *
 * ---- ONE LINE, MEASURED ---------------------------------------------------
 *
 * `-webkit-line-clamp: 1` rather than a character count, because the sentence is
 * authored in three places (the year, the island, the scene) and a cap in one of
 * them is a cap the other two do not know about. A line that would wrap is
 * clipped with an ellipsis and the title carries the whole of it, which is the
 * honest failure: the fix for a long objective is a shorter objective.
 */
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

  /* THE THREE VOICES, IN ORDER. The island outranks the year because inside a
   * cutscene the year is describing a step the student is being walked past.
   * The scene outranks the year for the one thing only the scene knows, which is
   * that he is at sea holding the tiller. */
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
      {/* THE SENTENCE IS STILL AN ANNOUNCEMENT and the sheet under it is not, so
          the live region is only ever this line: a screen reader that read the
          whole task list out again every time the arrow changed would be reading
          five rows to say one word changed. */}
      <div className="ob-live" role="status" aria-live="polite">{text}</div>
      {/* NO `kit-surface-band` HERE, and that is the restyle. The band is the big
          nine-sliced parchment plaque the dialogue box and the arrival card wear,
          and it drew this one line on an ornate sheet a hundred pixels tall.
          `objective.css` dresses the box in `--kit-art-plaque` instead, which is
          the narrow carved sign the beach already says "Walk to the pier" on. */}
      <button
        type="button"
        className="ob-panel"
        title={text}
        aria-expanded={open}
        aria-label={`${text} Press to see everything this year asks for.`}
        onClick={(e) => { e.stopPropagation(); toggle() }}
      >
        {text}
        {/* THE ONLY THING THAT SAYS THE BAR IS PRESSABLE. A carved sign that has
            been furniture for a week does not read as a control, and a student
            who never presses it never finds the list. Two small chevrons rather
            than a word, because the panel is one line and a word would eat it. */}
        <span className="ob-more" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && <TaskSheet onClose={() => setOpen(false)} />}
    </div>
  )
}

/* ---- THE SHEET ------------------------------------------------------------
 *
 * BRIEF-CLOSE-THE-LOOP section 7. Everything on it is derived (`run/tasks.ts`),
 * so it cannot disagree with the arrow above it, and nothing on it is pressable:
 * it answers "what is this year" and the room answers "how". A list of five
 * buttons would be the menu §40.6 rules out.
 */
function TaskSheet({ onClose }: { onClose: () => void }) {
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  const save = loadSave()
  const list = tasksOf(save)
  const { done, total } = tasksDone(list)

  /* ANYWHERE ELSE CLOSES IT, which is the brief's own word, and Escape does too,
   * because every other panel in this game closes on Escape and a student who has
   * learned that will try it here. Captured on the window so a click on the world
   * canvas closes it as readily as a click on the chrome. */
  useEffect(() => {
    const away = () => onClose()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    /* the frame after this one, or the press that OPENED it closes it again */
    const t = setTimeout(() => window.addEventListener('pointerdown', away), 0)
    window.addEventListener('keydown', key, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', away)
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
