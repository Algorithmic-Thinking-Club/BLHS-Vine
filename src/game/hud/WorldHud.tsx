import { useEffect, useRef, useState } from 'react'
import { Hud } from './Hud'
import { Dialogue } from './Dialogue'
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
  if (!s?.introDone || !inWorld) return null
  return (
    <>
      <Hud onBlurWorld={blurWorld} />
      {/* station dialogue rides every world scene, so `say` and `choose` work
          from any painted map without that map knowing React exists */}
      <Dialogue />
    </>
  )
}
