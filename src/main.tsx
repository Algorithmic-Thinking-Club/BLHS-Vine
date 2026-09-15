import { createRoot } from 'react-dom/client'
import App from './App'
import { initCaptain, isCaptain } from './game/captain'
import { beginAdventure } from './game/save'
import './styles.css'
import './app/theme.css'

// no StrictMode: it double-invokes effects in dev, which races the Pixi canvas's async asset loads, because the engine owns one long-lived WebGL context rather than idempotent React state
initCaptain() // ?captain=<key> unlocks the god tools, once per device and env-gated in prod

// ?fresh=1 wipes the run and replays the intro, dev or captain only because in a student's hands it is an unauthenticated run reset, and consumed once by stripping the param so a later F5 cannot silently wipe the run again
{
  const params = new URLSearchParams(location.search)
  if (params.has('fresh')) {
    if (import.meta.env.DEV || isCaptain()) beginAdventure()
    params.delete('fresh')
    const qs = params.toString()
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash)
  }
}

// server sync pulls the newer save if one exists upstream then pushes on every write, both no-op silently until a database is configured so the local save stays the truth, and BootScene awaits syncReady() so Continue routes off the pulled save
import('./game/sync').then(({ startSync }) => { startSync() })

// the drawn ui kit MAPVIS publishes, fetched once and worn unless ?kit=0 takes it off
import('./game/ui/kit').then(({ loadKit, applyKit, kitFaults, kitOptedIn }) => {
  loadKit().then((pieces) => {
    if (!pieces.length) return
    const refused = kitFaults(pieces).length
    const worn = kitOptedIn()
    if (worn) applyKit(pieces)
    console.log(`[kit] ${pieces.length - refused} of ${pieces.length} pieces read, ${refused} refused`
      + (worn ? ', applied' : ', not worn because ?kit=0 is set.'))
  })
})

// preload both game faces before anything renders, or the first dialogue line fetches Deckhand mid-cutscene and font-display blanks the text while it loads, which reads as empty dialogue on a cold cache
for (const [family, url] of [['Harbormaster', '/fonts/Harbormaster.ttf'], ['Deckhand', '/fonts/Deckhand.ttf']] as const) {
  const face = new FontFace(family, `url(${url})`)
  face.load().then((f) => document.fonts.add(f)).catch(() => { /* fallback face carries it */ })
}

createRoot(document.getElementById('root')!).render(<App />)
