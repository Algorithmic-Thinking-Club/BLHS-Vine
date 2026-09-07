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
import { useEffect, useState } from 'react'
import { loadSave, subscribeSave } from '../save'
import { nextObjective, objectiveLine } from '../run/objective'
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
    <div className="ob-wrap" role="status" aria-live="polite">
      {/* NO `kit-surface-band` HERE, and that is the restyle. The band is the big
          nine-sliced parchment plaque the dialogue box and the arrival card wear,
          and it drew this one line on an ornate sheet a hundred pixels tall.
          `objective.css` dresses the box in `--kit-art-plaque` instead, which is
          the narrow carved sign the beach already says "Walk to the pier" on. */}
      <p className="ob-panel" title={text}>{text}</p>
    </div>
  )
}
