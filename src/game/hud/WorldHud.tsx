import { useEffect, useRef, useState } from 'react'
import { Hud } from './Hud'
import { Dialogue } from './Dialogue'
import { WorldCutscene } from '../cutscene/WorldCutscene'
import { PlaceCard } from '../stage/PlaceCard'
import { Heading } from './Heading'
import { loadSave, subscribeSave } from '../save'
import { useNav } from '../../app/SceneManager'
import { holdWorld } from '../world-bus'

// The HUD's global mount for WORLD scenes (§11.1): the island map, the grape islands,
// the Maw. The beach mounts its own Hud inside IntroScene (it must yield to the intro
// cutscene), so it is excluded here. New world scenes join the list when they register.
// This is what makes the planner/handbook reachable everywhere the game is playable —
// including through the ui-bus from other lanes' scene code.
//
// `pmap` was missing from this list, which meant no HUD mounted over a MAPVIS bundle at
// all: the Maw could name a chart table and press E on it and there would be nothing
// listening to open the year sheet. One entry, and every station in every painted map
// becomes able to reach the vine's UIs.
const WORLD_SCENES = new Set(['islandmap', 'atc', 'panther-cave', 'pmap'])

export function WorldHud() {
  const { current } = useNav()
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
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
      {/* AND THE ONE SENTENCE THAT SAYS WHAT TO DO NEXT. It mounts beside the
          arrival card and OUTSIDE the Hud's own gate, because a student who has
          not been handed anything yet is exactly the student who needs telling.
          The year's state machine has computed this sentence since the day it was
          written and nothing in the repository has ever rendered it. */}
      <Heading />
    </>
  )
}
