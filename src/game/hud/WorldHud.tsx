import { useEffect, useRef, useState } from 'react'
import { Hud } from './Hud'
import { Dialogue } from './Dialogue'
import { WorldCutscene } from '../cutscene/WorldCutscene'
import { PlaceCard } from '../stage/PlaceCard'
import { MovieBars } from '../stage/MovieBars'
import { ObjectivePanel } from './Objective'
import { HelpButton } from './Help'
import { loadSave, subscribeSave } from '../save'
import { useNav } from '../../app/SceneManager'
import { holdWorld } from '../world-bus'
import { warmPortraits } from '../ui/controls'

// The scenes this HUD mounts over. The beach mounts its own Hud inside IntroScene so it
// can yield to the intro cutscene, so it is not listed here.
const WORLD_SCENES = new Set(['pmap'])

export function WorldHud() {
  const { current } = useNav()
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  /* THE ONE DRAWN FACE IS FETCHED BEFORE ANYBODY SPEAKS (BRIEF-MAW-RAIL-3 G).
   * Here rather than in the dialogue box, because by the time the box mounts the
   * line it is mounting for is already on screen. */
  useEffect(() => { warmPortraits() }, [])
  const s = loadSave()

  /* THE CONTROL LOCK. Hud has taken an onBlurWorld callback since July and
   * nothing has ever passed it, so opening a panel over a walkable map left the
   * character walking underneath it. The callback is turned into a world-bus
   * hold, which is what the scenes read.
   *
   * A ref rather than state because the release must survive re-renders and must
   * not be a dependency of anything: dropping it on a render would hand the
   * controls back with the year sheet still open. */
  const release = useRef<null | (() => void)>(null)
  const blurWorld = (on: boolean) => {
    if (on) release.current ??= holdWorld('hud:panel')
    else { release.current?.(); release.current = null }
  }
  useEffect(() => () => { release.current?.(); release.current = null }, [])

  const inWorld = WORLD_SCENES.has(current)
  if (!inWorld) return null

  /* THE BOX THE OPENING SPEAKS THROUGH CANNOT BE BEHIND A FLAG THE OPENING SETS.
   *
   * Everything below used to be behind `s?.introDone`, and that is circular in
   * exactly one place: the opening. An island that composes the first two minutes
   * of the game, which is the whole point of wave four's gate, runs BEFORE any
   * run has said the intro is done, so `say` queued lines into a bus with nothing
   * mounted to draw them. The island did not fail, nothing warned, and the scene
   * simply waited forever for a click on a box that was never on screen. Two
   * hours of a proof run went into finding that, and the symptom was a beautiful
   * painting with nobody talking on it.
   *
   * The split is by what each piece is FOR. The dialogue, the cutscene chrome and
   * the arrival card are how the world speaks, and the world can speak from its
   * first frame. The Hud is the run's own furniture, the year sheet, the
   * Handbook, the token count, and none of that means anything before there is a
   * run, so it keeps the guard it always had. */
  return (
    <>
      {s?.introDone && <Hud onBlurWorld={blurWorld} />}
      {/* station dialogue rides every world scene, so `say` and `choose` work
          from any painted map without that map knowing React exists */}
      <Dialogue />
      {/* and so does the cutscene chrome. The overlay was mounted by IntroScene
          alone, wrapped around the beach, which is why the beach was the only
          place in the game where a script could be seen. */}
      <WorldCutscene />
      {/* the arrival card. It rides here rather than inside the scene because a
          door swap tears the scene down and rebuilds it, and a card mounted inside
          the thing being rebuilt is a card that flashes. */}
      <PlaceCard />
      {/* AND THE ONE SENTENCE THAT SAYS WHAT TO DO NEXT, at the top of the
          screen, on every frame of every world scene, in a cutscene and out of
          one. BRIEF-MAW-RAIL-3 A. It is outside the Hud's own gate for the
          reason the dialogue box is: a student thirty seconds into an advisory
          period has no run yet and is exactly the student who needs telling.

          IT REPLACED TWO RENDERERS AND NEITHER IS COMING BACK. `Heading` said
          this in the bottom-left corner of the tile scenes and `PmapScene` drew
          it on a plaque over Thor's head, and both hid themselves whenever
          anything else was speaking, which is when a lost student is most lost.
          One panel, one place, and it does not go away. */}
      <ObjectivePanel />
      {/* THE QUESTION MARK (brief item 3b), OUTSIDE THE HUD'S GATE ON PURPOSE.
          The Hud is mounted only once `introDone` is set, which is right for the
          run's furniture and wrong for this: a student thirty seconds into an
          advisory period has no run, no chart and no Handbook, and is exactly the
          student a teacher answers with "press the question mark". It is the one
          permitted floating element that is not state, and that is the reason. */}
      <HelpButton />
      {/* THE MOVIE FRAME (BRIEF-ARRIVAL item 1). Last in the list and highest of
          the DOM chrome, because the bars are what everything else stands down
          behind. It draws nothing at all until an island says `movie(True)`. */}
      <MovieBars />
    </>
  )
}
