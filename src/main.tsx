import { createRoot } from 'react-dom/client'
import App from './App'
import { initCaptain, isCaptain } from './game/captain'
import { beginAdventure } from './game/save'
import './styles.css'
import './app/theme.css'

// No StrictMode: it double-invokes effects in dev, which races/poisons the Pixi canvas's async
// asset loads (the engine owns one long-lived WebGL context, not idempotent React state).
initCaptain() // ?captain=<key> unlocks Ash's god tools, once per device (env-gated in prod)

// ?fresh=1 — wipe the run and replay the intro. Dev/captain ONLY (in a student's hands this
// was an unauthenticated run reset), and consumed ONCE: the param is stripped from the URL so
// a later F5 can't silently wipe the run again.
{
  const params = new URLSearchParams(location.search)
  if (params.has('fresh')) {
    if (import.meta.env.DEV || isCaptain()) beginAdventure()
    params.delete('fresh')
    const qs = params.toString()
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash)
  }
}

// server sync (§7.7): pull the newer save if one exists upstream, then push on every write.
// Both no-op silently until a database is configured — the local save stays the truth.
// BootScene awaits syncReady() so Continue routes off the pulled save.
import('./game/sync').then(({ startSync }) => { startSync() })

// THE UI KIT MAPVIS PUBLISHES. One fetch of the eighteen drawn pieces and their nine-slice
// numbers, off the same host PmapScene asks for maps. It never blocks first paint, it never
// throws, and a build with no VITE_MAPVIS_URL never even asks. It is MOUNTED only behind
// ?kit=1, because every panel in the game still carries a percentage padding measured for a
// stretched background and a nine-slice on top of that insets the contents twice.
// src/game/ui/kit.ts carries the reasoning and is where the default flips.
import('./game/ui/kit').then(({ loadKit, applyKit, kitFaults, kitOptedIn }) => {
  loadKit().then((pieces) => {
    if (!pieces.length) return
    const refused = kitFaults(pieces).length
    const worn = kitOptedIn()
    if (worn) applyKit(pieces)
    console.log(`[kit] ${pieces.length - refused} of ${pieces.length} pieces read, ${refused} refused`
      + (worn ? ', applied' : '. Add ?kit=1 to wear it.'))
  })
})

// Preload BOTH game faces before anything renders. Without this, the first dialogue line
// fetches Deckhand mid-cutscene and font-display blanks the text while it loads — the
// "dialogue is empty" bug Ash hit three times (his cold cache vs our warm test browser).
for (const [family, url] of [['Harbormaster', '/fonts/Harbormaster.ttf'], ['Deckhand', '/fonts/Deckhand.ttf']] as const) {
  const face = new FontFace(family, `url(${url})`)
  face.load().then((f) => document.fonts.add(f)).catch(() => { /* fallback face carries it */ })
}

createRoot(document.getElementById('root')!).render(<App />)
