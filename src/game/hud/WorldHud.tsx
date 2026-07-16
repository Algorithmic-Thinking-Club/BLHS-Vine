import { useEffect, useState } from 'react'
import { Hud } from './Hud'
import { loadSave, subscribeSave } from '../save'
import { useNav } from '../../app/SceneManager'

// The HUD's global mount for WORLD scenes (§11.1): the island map, the grape islands,
// the Maw. The beach mounts its own Hud inside IntroScene (it must yield to the intro
// cutscene), so it is excluded here. New world scenes join the list when they register.
// This is what makes the planner/handbook reachable everywhere the game is playable —
// including through the ui-bus from other lanes' scene code.

const WORLD_SCENES = new Set(['islandmap', 'atc', 'panther-cave'])

export function WorldHud() {
  const { current } = useNav()
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  const s = loadSave()
  if (!s?.introDone || !WORLD_SCENES.has(current)) return null
  return <Hud />
}
