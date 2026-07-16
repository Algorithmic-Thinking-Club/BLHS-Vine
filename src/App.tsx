import { lazy, Suspense } from 'react'
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
import TeacherScene from './app/scenes/TeacherScene'

// LAZY on purpose (and per §15.2's lazy-load law): the island map is under heavy parallel
// construction — an in-flight broken state in its module graph must never white-screen the
// boot/title/intro path. v2 of the renderer is archived; this import re-points when v3
// lands. The registry (game/island/registry.ts) is the stable seam either way.
const ISLAND_MAP_MODULE = './game/island/IslandMapIso.tsx' // re-points when renderer v3 lands
const IslandMapIso = lazy(() =>
  import(/* @vite-ignore */ ISLAND_MAP_MODULE).catch(() => ({
    default: () => <div style={{ position: 'absolute', inset: 0, background: '#06121a' }} />,
  })),
)
// Session B's lane (grape island #1, file-disjoint: src/game/island/atc/**) —
// same lazy law: a broken in-flight ATC module must never white-screen the game
const ATC_MAP_MODULE = './game/island/atc/AtcIslandIso.tsx'
const AtcIslandIso = lazy(() =>
  import(/* @vite-ignore */ ATC_MAP_MODULE).catch(() => ({
    default: () => <div style={{ position: 'absolute', inset: 0, background: '#06121a' }} />,
  })),
)

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
  teacher: () => <TeacherScene />, // Wiseman's desk (§13.3) — its own corner, never on the student title
  islandmap: () => (
    <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: '#06121a' }} />}>
      <IslandMapIso />
    </Suspense>
  ), // the main map: the vast ocean + the Central Island (GAME-DESIGN §3)
  atc: () => (
    <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: '#06121a' }} />}>
      <AtcIslandIso />
    </Suspense>
  ), // grape island #1: room 305 as an island (docs/place-specs/atc-grape-island.md)
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
