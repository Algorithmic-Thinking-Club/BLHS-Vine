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
const PaintDemoLazy = lazyScene(() => import('./game/painted/PaintDemo'))
const HarborSceneLazy = lazyScene(() => import('./game/painted/HarborScene'))
const IslandSceneLazy = lazyScene(() => import('./game/painted/IslandScene'))
const SceneEditorLazy = lazyScene(() => import('./game/painted/SceneEditor'))
const PlaceSceneLazy = lazyScene(() => import('./game/painted/PlaceScene'))
const MapwrightLazy = lazyScene(() => import('./game/mapwright/MapwrightScene'))
const ObjMapLazy = lazyScene(() => import('./game/objmap/ObjMapScene'))
const PmapLazy = lazyScene(() => import('./game/pmap/PmapScene'))
const GrapeProofLazy = lazyScene(() => import('./vine/py/GrapeProof'))

// The game runs through the scene manager. The live student flow: boot -> title -> beach
// (the intro lives ON the beach, join included) -> islandmap. The June-era scenes
// (join/dressing/overworld/island/cape + the world.tsx run state) are UNROUTED: they carried
// a second, conflicting run state and a join that silently dropped the class code. Graduation
// and the rest of the year loop get rebuilt on the real save (THE-PATH Leg 3), not re-routed
// to the ghosts. `?scene=<id>` jumps to a scene (dev). The old campus build stays behind
// ?legacy=1, fenced at the branch below.
const registry: SceneRegistry = {
  boot: () => <BootScene />,
  title: () => <TitleScene />,
  beach: () => <IntroScene />,   // the beach IS the intro map; free roam once the intro is done
  teacher: () => <TeacherScene />, // Wiseman's desk (§13.3) — its own corner, never on the student title
  /* ---- THE TILE ISLANDS, OFF THE ROAD 2026-09-01, AND THIS IS THE FENCE ----
   *
   * The same shape as the `?legacy=1` fence below and for the same reason: three
   * ids that stay registered, are reachable only by typing `?scene=`, and are
   * reached by NOTHING on the student road. Every fact here is a fact about the
   * code rather than a preference.
   *
   * WHAT THEY ARE. `islandmap` is `src/game/island/IslandMapIso.tsx`, the tile-era
   * overworld; `atc` is the tile grape island; `panther-cave` is the tile cave
   * interior. 12,221 lines under `src/game/island/`.
   *
   * WHY THEY ARE OFF THE ROAD. THE-WALKTHROUGH §3.0, Ash's ruling of 2026-08-28:
   * one ocean is the world and every map is a MAPVIS painting placed on it. That
   * ruled the tile overworld dead in August, and a student pressing Continue was
   * still landing on tile palms with a Principal Panther line five weeks later
   * (`build-shots/fresh/r1-continue-lands-here-islandmap.png`), because the intro
   * and the title both named `islandmap` and nobody had changed the two lines.
   * They are `pmap` now: the intro to the ocean off the published hub, the title
   * to `panther-maw`. `src/game/pmap/route.ts` is where both are spelled.
   *
   * WHAT THEY MAY NOT BE USED FOR:
   *
   *  - NOT A DESTINATION FOR ANYTHING LIVE. No `nav.go`, no `location.href`, no
   *    door and no intent may name one. `enter("islandmap")` from a member's
   *    Python is a map id and resolves through the bundle loader, not through
   *    here, so it cannot reach these either.
   *  - NOT A SOURCE OF WORLD FACTS. `src/game/island/registry.ts` and
   *    `hub-mechanics.ts` carry a second island list and a second door table from
   *    the tile era. The world is `src/game/world/composition.ts` and the anchors
   *    are the bundle's. Reading a position out of the tile subtree is reading a
   *    map that no longer exists.
   *  - AND THEY ARE NOT DELETED, ON PURPOSE. Removing 12,221 lines is its own
   *    order with its own reading; doing it inside a routing change is how a
   *    session loses something Ash wanted kept. Move things, do not delete them.
   */
  islandmap: () => <IslandMapLazy />, // PARKED, ?scene= only: the tile-era overworld (§3.0 ruled it dead)
  atc: () => <AtcIslandLazy />, // PARKED, ?scene= only: the tile grape island
  'panther-cave': () => <PantherCaveLazy />, // PARKED, ?scene= only: the tile cave, superseded by the panther-maw bundle
  paintdemo: () => <PaintDemoLazy />, // the painted-scene layer demo (dev-only; reference art stand-in)
  harbor: () => <HarborSceneLazy />, // THE GRAND HARBOR: the island's first painted scene (our art)
  island: () => <IslandSceneLazy />, // THE HUB ISLAND: cand-1 walkable end to end (Phase A)
  paintedit: () => <SceneEditorLazy />, // Ash's polygon editor: draw levels on a scene image, test-walk, export (dev-only)
  place: () => <PlaceSceneLazy />, // the B+C place test: one generated frame + authored levels, walkable (dev-only)
  mw: () => <MapwrightLazy />, // MAPWRIGHT engine scene (P5): loads public/maps/<?map>/map.json — the map machine's output (?scene=mw&map=test-cove)
  objmap: () => <ObjMapLazy />, // THE OBJECT-MAP proof: engine ground + ocean, every object one painted PNG, colliders MEASURED off sprite alpha (?scene=objmap&dbg=1)
  pmap: () => <PmapLazy />, // THE MAPVIS BUNDLE LOADER: walks public/maps-painted/<?map> exactly as exported, zero hand-wiring (?scene=pmap&map=quayprop&dbg=1)
  grape: () => <GrapeProofLazy />, // THE GRAPE PIPE: a member's python package in a MicroPython worker driving the real dialogue box (?scene=grape · &island=broken · &from=<base url> · &gh=owner/repo@branch:islands/id · &arm=plain)
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  /* ?legacy=1, RULED 2026-08-29 (wave 2, rider 3). IT STAYS, AND IT IS A MUSEUM.
   *
   * This one line is the only entry to 3,172 lines that nothing else imports:
   * Game.tsx, and through it Stage.tsx, Scene.tsx, ZoneView.tsx, Campus.tsx with
   * campus-grid.ts and campus-props.ts, zone.ts, and the whole TypeScript grape
   * stack (vine/registry.ts, vine/GrapeHost.tsx, StandardGrape, PlainGrape,
   * EncounterScene, grapes/atc.ts). Delete this branch and all of it is
   * unreachable-and-still-compiled, which is the worst of both; delete the
   * subtree and the parked 1:1 campus goes with it, and that campus is kept on
   * purpose. So the branch stays and the fence is written instead.
   *
   * WHAT IT IS FOR: looking at the parked eras. `?legacy=1` is the zone tile
   * test, `?legacy=1&campus=1` the block campus, `?legacy=1&cv=1` the 1:1
   * geometry, `?legacy=1&slice=1` the slice. Nothing else.
   *
   * WHAT IT MAY NOT BE USED FOR, and every one of these is a fact about the code
   * behind it rather than a preference:
   *
   *  - NOT A ROUTE FOR ANYTHING LIVE. It returns before the SceneManager, so no
   *    scene, no WorldHud, no transitions and no `startHeartbeat()`, which means
   *    a legacy session produces no dose and cannot appear in api/dose.ts.
   *  - IT LOGS NOTHING AND CANNOT. Game.tsx:51 builds its OWN Logger with no
   *    `endpoint`, so every event drains to a console line, and its participant
   *    id is `'p-' + Math.random()` per page load (Game.tsx:49). No legacy
   *    session can reach the events table or a study export, which is the one
   *    good thing about it and the reason it is safe to leave routed.
   *  - ITS ID STRINGS ARE NOT ROSTER KEYS. This is the raw-grape-id question the
   *    rider asked, and the answer is that they all survive in here and none of
   *    them resolve: grapes/atc.ts:7 declares `id: 'atc'` and :14 declares
   *    `building: 'atc-room'`, Campus.tsx:418 types `id: 'atc'` into a renderer,
   *    and Game.tsx:67-70 takes `?grape=<anything>` off the URL and looks it up.
   *    'atc' is now a PROGRAMME id and 'atc-room' a PLACE id in
   *    src/game/roster/roster.ts, two different key spaces that happen to spell
   *    the same, and nothing in here goes near the resolver. Worse, Stage.tsx:83
   *    hands a ZONE id to the same lookup and Game.tsx:191 prints it to the
   *    player as "grape id". Reading a roster key out of this subtree is the
   *    exact conflation the four-key split was built to end.
   *  - AND A GRAPE IS PYTHON. The registry behind this branch is the superseded
   *    architecture (VINE-AND-GRAPE.md); the real one is src/vine/py/ at
   *    `?scene=grape`. Nothing new goes in here. */
  if (params.has('legacy')) return <Game />
  const initial = params.get('scene') ?? 'boot'
  // unknown scene ids land on boot, never on a ghost scene. The WorldHud overlay puts the
  // compass/Handbook/year-sheet on every world scene (the beach mounts its own).
  return <SceneManager initial={registry[initial] ? initial : 'boot'} registry={registry} overlay={<WorldHud />} />
}
