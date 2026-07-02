import Game from './game/Game'
import { SceneManager, type SceneRegistry } from './app/SceneManager'
import { GameProvider } from './app/world'
import BootScene from './app/scenes/BootScene'
import TitleScene from './app/scenes/TitleScene'
import IntroCutscene from './app/scenes/IntroCutscene'
import JoinScene from './app/scenes/JoinScene'
import DressingScene from './app/scenes/DressingScene'
import OverworldScene from './app/scenes/OverworldScene'
import IslandScene from './app/scenes/IslandScene'
import CapeScene from './app/scenes/CapeScene'
import IntroScene from './game/intro/IntroScene'

// The game runs through the scene manager, wrapped in the run-state provider. Phase 1 flow:
// title -> overworld (navigable hub) -> island visit -> ... -> cape summary. Join-by-code +
// dressing room slot in before the overworld next. `?scene=<id>` jumps to one (dev). The old
// contiguous-campus build stays shelved behind ?legacy=1.
const registry: SceneRegistry = {
  boot: () => <BootScene />,
  title: () => <TitleScene />,
  intro: () => <IntroCutscene />,
  join: () => <JoinScene />,
  dressing: () => <DressingScene />,
  overworld: () => <OverworldScene />,
  island: () => <IslandScene />,
  cape: () => <CapeScene />,
  beach: () => <IntroScene />,   // the beach IS the intro map; free roam once the intro is done
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  if (params.has('legacy')) return <Game />
  const initial = params.get('scene') ?? 'boot'
  return (
    <GameProvider>
      <SceneManager initial={registry[initial] ? initial : 'overworld'} registry={registry} />
    </GameProvider>
  )
}
