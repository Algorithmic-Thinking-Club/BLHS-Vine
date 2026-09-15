import { useEffect, useRef, useState } from 'react'
import { Hud } from './Hud'
import { Dialogue } from './Dialogue'
import { WorldCutscene } from '../cutscene/WorldCutscene'
import { PlaceCard } from '../stage/PlaceCard'
import { MovieBars } from '../stage/MovieBars'
import { SkipVoyage } from '../world/SkipVoyage'
import { ObjectivePanel } from './Objective'
import { HeadBack } from './HeadBack'
import { HelpButton } from './Help'
import { ChartButton } from '../world/ChartPanel'
import { CameraToggle } from './CameraToggle'
import { loadSave, subscribeSave } from '../save'
import { useNav } from '../../app/SceneManager'
import { holdWorld } from '../world-bus'
import { warmPortraits } from '../ui/controls'

// the scenes this HUD mounts over, and the beach is not listed because it mounts its own Hud inside IntroScene so it can yield to the intro cutscene
const WORLD_SCENES = new Set(['pmap'])

export function WorldHud() {
  const { current } = useNav()
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  /* the one drawn face is fetched before anybody speaks, here rather than in the dialogue box, because by the time the box mounts the line it is mounting for is already on screen */
  useEffect(() => { warmPortraits() }, [])
  const s = loadSave()

  /* the control lock: an open panel holds the world so the character stops walking */
  const release = useRef<null | (() => void)>(null)
  const blurWorld = (on: boolean) => {
    if (on) release.current ??= holdWorld('hud:panel')
    else { release.current?.(); release.current = null }
  }
  useEffect(() => () => { release.current?.(); release.current = null }, [])

  const inWorld = WORLD_SCENES.has(current)
  if (!inWorld) return null

  /* what mounts from the first frame, and what waits until there is a run */
  return (
    <>
      {s?.introDone && <Hud onBlurWorld={blurWorld} />}
      {/* station dialogue rides every world scene, so `say` and `choose` work from any painted map without that map knowing React exists */}
      <Dialogue />
      {/* and so does the cutscene chrome, which IntroScene once mounted alone around the beach, making the beach the only place in the game where a script could be seen */}
      <WorldCutscene />
      {/* the arrival card rides here rather than inside the scene, because a door swap tears the scene down and rebuilds it and a card mounted inside the thing being rebuilt is a card that flashes */}
      <PlaceCard />
      {/* the one sentence saying what to do next, on every frame of every world scene */}
      <ObjectivePanel />
      {/* the way home, which an island grows when it has nothing left to ask for, below the movie bars in this list on purpose because a cutscene is not a moment to offer somebody a way out of the island it is playing on */}
      <HeadBack />
      {/* the question mark, outside the Hud's gate so a student with no run can still ask */}
      <HelpButton />
      {/* and the chart on its own, directly above it, which is where he asked for it */}
      <ChartButton />
      {/* and the camera switch in the other corner, which is the only thing there */}
      <CameraToggle />
      {/* the movie frame, last in the list and highest of the DOM chrome because the bars are what everything else stands down behind, and it draws nothing at all until an island says `movie(True)` */}
      <MovieBars />
      {/* and the one control a crossing offers, over the bars it sits on */}
      <SkipVoyage />
    </>
  )
}
