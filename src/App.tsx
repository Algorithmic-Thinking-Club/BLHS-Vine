import { useEffect, useState, type ComponentType } from 'react'
import Game from './game/Game'
import { SceneManager, type SceneRegistry } from './app/SceneManager'
import BootScene from './app/scenes/BootScene'
import TitleScene from './app/scenes/TitleScene'
import IntroScene from './game/intro/IntroScene'
import TeacherScene from './app/scenes/TeacherScene'
import { WorldHud } from './game/hud/WorldHud'

// LAZY on purpose (and per §15.2's lazy-load law): the island maps are under heavy parallel
// construction — a broken in-flight state must never white-screen the boot/title/intro path.
// The import paths are LITERAL so vite actually bundles the chunks in production (a variable
// path with @vite-ignore shipped builds where these scenes did not exist at all). A failed
// chunk load shows the dark sea and RETRIES on the next mount — React.lazy was not used
// because it caches its first rejection until a hard reload.
function lazyScene(load: () => Promise<{ default: ComponentType }>) {
  return function LazyScene() {
    const [Comp, setComp] = useState<ComponentType | null>(null)
    useEffect(() => {
      let alive = true
      load().then((m) => { if (alive) setComp(() => m.default) }).catch(() => { /* dark sea holds */ })
      return () => { alive = false }
    }, [])
    return Comp ? <Comp /> : <div style={{ position: 'absolute', inset: 0, background: '#06121a' }} />
  }
}
const IslandMapLazy = lazyScene(() => import('./game/island/IslandMapIso'))
const AtcIslandLazy = lazyScene(() => import('./game/island/atc/AtcIslandIso'))
const PantherCaveLazy = lazyScene(() => import('./game/island/cave/PantherCaveIso'))

// The game runs through the scene manager. The live student flow: boot -> title -> beach
// (the intro lives ON the beach, join included) -> islandmap. The June-era scenes
// (join/dressing/overworld/island/cape + the world.tsx run state) are UNROUTED: they carried
// a second, conflicting run state and a join that silently dropped the class code. Graduation
// and the rest of the year loop get rebuilt on the real save (THE-PATH Leg 3), not re-routed
// to the ghosts. `?scene=<id>` jumps to a scene (dev). The old campus build stays behind
// ?legacy=1.
const registry: SceneRegistry = {
  boot: () => <BootScene />,
  title: () => <TitleScene />,
  beach: () => <IntroScene />,   // the beach IS the intro map; free roam once the intro is done
  teacher: () => <TeacherScene />, // Wiseman's desk (§13.3) — its own corner, never on the student title
  islandmap: () => <IslandMapLazy />, // the main map: the vast ocean + the Central Island (GAME-DESIGN §3)
  atc: () => <AtcIslandLazy />, // grape island #1: room 305 as an island (docs/place-specs/atc-grape-island.md)
  'panther-cave': () => <PantherCaveLazy />, // the Maw: the hub cave interior (docs/place-specs/panther-cave-interior.md)
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  if (params.has('legacy')) return <Game />
  const initial = params.get('scene') ?? 'boot'
  // unknown scene ids land on boot, never on a ghost scene. The WorldHud overlay puts the
  // compass/Handbook/year-sheet on every world scene (the beach mounts its own).
  return <SceneManager initial={registry[initial] ? initial : 'boot'} registry={registry} overlay={<WorldHud />} />
}
