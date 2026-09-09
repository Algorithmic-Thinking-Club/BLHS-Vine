import { useEffect, useState, type ComponentType } from 'react'
import { SceneManager, type SceneRegistry } from './app/SceneManager'
import BootScene from './app/scenes/BootScene'
import TitleScene from './app/scenes/TitleScene'
import IntroScene from './game/intro/IntroScene'
import TeacherScene from './app/scenes/TeacherScene'
import { WorldHud } from './game/hud/WorldHud'
import { openingScene, tabIsLive } from './app/entry'

// Loads a scene's chunk on demand. The path must be a literal so vite bundles it, and a
// failed load shows the dark sea and retries on the next mount.
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
const PmapLazy = lazyScene(() => import('./game/pmap/PmapScene'))
const GrapeProofLazy = lazyScene(() => import('./vine/py/GrapeProof'))

// The student road: boot -> title -> beach (the intro lives on the beach) -> pmap.
// `?scene=<id>` jumps to a scene in dev; an unknown id lands on boot.
const registry: SceneRegistry = {
  boot: () => <BootScene />,
  title: () => <TitleScene />,
  beach: () => <IntroScene />,   // the beach IS the intro map; free roam once the intro is done
  teacher: () => <TeacherScene />, // Wiseman's desk, never on the student title
  pmap: () => <PmapLazy />, // every painted map: loads public/maps-painted/<?map> as exported
  grape: () => <GrapeProofLazy />, // a member's python package in a MicroPython worker (?scene=grape)
}

export default function App() {
  /* ---- A PASTED ADDRESS IS NOT A POSITION (Ash, 2026-09-08) ---------------
   *
   * `?scene=pmap&map=...` is the engine's own transport between scenes and it
   * sits in the part of the window a person copies, so a link handed to somebody
   * dropped them into the middle of a crossing in a browser that had never
   * played. `app/entry.ts` has the whole of why and the rule. */
  const opened = openingScene({
    search: window.location.search,
    known: (id) => !!registry[id],
    live: tabIsLive(),
  })
  if (opened.why) {
    console.info(`[entry] ${opened.why}`)
    /* AND THE ADDRESS IS TIDIED, so the next copy is a link that works. Only the
     * position goes: a teacher's `?skin=plain` or `?arm=` pin is somebody's
     * deliberate setting and survives. */
    const q = opened.search ? `?${opened.search}` : ''
    window.history.replaceState(null, '', `${window.location.pathname}${q}`)
  }
  return <SceneManager initial={opened.scene} registry={registry} overlay={<WorldHud />} />
}
